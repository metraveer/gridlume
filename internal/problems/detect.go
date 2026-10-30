// Package problems turns live data into problems: what is wrong right now, said once per cause.
//
// Detect looks at one moment (agents, their snapshots, the map) and returns signals. The Engine keeps
// them honest over time: a signal becomes a problem only after it has lasted a while (no alarm for a
// blip), and a problem ends only after the signal has been gone a while (no flapping).
package problems

import (
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"time"

	"github.com/metraveer/gridlume/internal/agentlink"
	"github.com/metraveer/gridlume/internal/agentproto"
	"github.com/metraveer/gridlume/internal/checks"
	"github.com/metraveer/gridlume/internal/store"
)

// Thresholds.
const (
	OfflineAfter = time.Minute // an agent silent this long is "not connected"
	DiskWarn     = 90.0        // percent used
	DiskCrit     = 97.0
	MemWarn      = 95.0
	TempWarn     = 90.0 // °C
	LossCrit     = 50.0 // percent of pings lost in the last minute: the link is down
	TCPFails     = 3    // TCP checks failed in a row (20 s apart) before "does not answer"
	HTTPFails    = 2    // HTTP checks failed in a row (a minute apart) before "does not open"
	CertWarnDays = 14
	CertCritDays = 3
)

// Signal is one thing wrong at this moment.
type Signal struct {
	Key      string
	Kind     string
	Severity string // warn, crit
	NodeID   string
	LinkID   string
	Params   map[string]any
	Merged   []string // kinds folded into this one because they share its cause
	// Confirm is how long the signal must last before it is a problem (0: at once; the check has its own grace).
	Confirm time.Duration
}

// Input is everything Detect looks at.
type Input struct {
	Map    store.Map
	Agents []agentlink.Status
	Snaps  map[string]agentproto.Snapshot // by node id
	Checks map[string]checks.Result       // the core's own checks, by node id
	Now    time.Time
}

// Confirm is the usual wait before a signal counts: two or three readings, not one.
var Confirm = 30 * time.Second

var exitCode = regexp.MustCompile(`^Exited \((\d+)\)`)

// Held are the nodes and links nothing is known about right now: a machine whose agent is not connected,
// what is inside it, and the links it measured. Their problems neither end nor start until it is back.
type Held struct {
	Nodes map[string]bool
	Links map[string]bool
}

func (h Held) Has(p store.Problem) bool {
	return (p.NodeID != "" && h.Nodes[p.NodeID]) || (p.LinkID != "" && h.Links[p.LinkID])
}

// HeldIn finds them.
func HeldIn(in Input) Held {
	h := Held{Nodes: map[string]bool{}, Links: map[string]bool{}}
	for _, a := range in.Agents {
		if !a.Online {
			h.Nodes[a.NodeID] = true
		}
	}
	for _, n := range in.Map.Nodes {
		if n.ParentID != nil && h.Nodes[*n.ParentID] {
			h.Nodes[n.ID] = true
		}
	}
	for _, l := range in.Map.Links {
		if h.Nodes[l.FromID] || h.Nodes[l.ToID] {
			h.Links[l.ID] = true
		}
	}
	return h
}

// Detect returns the signals of this moment, one per cause.
func Detect(in Input) []Signal {
	nodes := make(map[string]store.Node, len(in.Map.Nodes))
	for _, n := range in.Map.Nodes {
		nodes[n.ID] = n
	}
	links := make(map[string]store.Link, len(in.Map.Links))
	for _, l := range in.Map.Links {
		links[l.ID] = l
	}
	var out []Signal
	offline := map[string]bool{} // machines whose agent is not connected

	for _, a := range in.Agents {
		if _, ok := nodes[a.NodeID]; !ok {
			continue
		}
		if !a.Online {
			// Never connected: an install in progress, not an outage.
			if a.LastSeen > 0 && in.Now.Sub(time.Unix(a.LastSeen, 0)) >= OfflineAfter {
				offline[a.NodeID] = true
				out = append(out, Signal{Key: "offline:" + a.NodeID, Kind: "agent_offline", Severity: "crit", NodeID: a.NodeID,
					Params: map[string]any{"lastSeen": a.LastSeen}})
			}
			continue
		}
		snap, ok := in.Snaps[a.NodeID]
		if !ok {
			continue
		}
		out = append(out, machine(a.NodeID, snap)...)
		if snap.Docker != nil {
			out = append(out, containers(a.NodeID, snap.Docker.Containers, in.Map.Nodes)...)
		}
		for _, p := range snap.Probes {
			if s, ok := linkSignal(p, links); ok {
				out = append(out, s)
			}
		}
	}
	// In a fixed order: when two signals fold into one, the same one must stay from one look to the next,
	// or its problem would end and start again.
	ids := make([]string, 0, len(in.Checks))
	for id := range in.Checks {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		if _, ok := nodes[id]; ok {
			out = append(out, checkSignals(in.Checks[id], in.Now)...)
		}
	}
	return group(out, offline, nodes, links)
}

// checkSignals: a host that does not answer pings, a port that refuses, a site that does not open,
// a certificate about to expire. Each check already waits for its failures to repeat.
func checkSignals(r checks.Result, now time.Time) []Signal {
	var out []Signal
	base := map[string]any{"target": r.Target}
	with := func(kv ...any) map[string]any {
		m := map[string]any{}
		for k, v := range base {
			m[k] = v
		}
		for i := 0; i+1 < len(kv); i += 2 {
			m[kv[i].(string)] = kv[i+1]
		}
		return m
	}
	switch r.Kind {
	case "ping":
		if r.Error != "" || r.Sent < 2 || r.Loss == 0 {
			break
		}
		kind, sev := "node_loss", "warn"
		if r.Loss >= LossCrit {
			kind, sev = "node_unreachable", "crit"
		}
		out = append(out, Signal{Key: "check:" + r.NodeID, Kind: kind, Severity: sev, NodeID: r.NodeID, Params: with("host", r.Target, "loss", round(r.Loss))})
	case "tcp":
		if r.Fails >= TCPFails {
			out = append(out, Signal{Key: "check:" + r.NodeID, Kind: "port_down", Severity: "crit", NodeID: r.NodeID, Params: with("error", r.Error)})
		}
	case "http":
		if r.Fails >= HTTPFails {
			out = append(out, Signal{Key: "check:" + r.NodeID, Kind: "site_down", Severity: "crit", NodeID: r.NodeID, Params: with("error", r.Error, "status", r.Status)})
		}
	}
	if r.CertUntil > 0 {
		days := int(time.Unix(r.CertUntil, 0).Sub(now).Hours() / 24)
		if days <= CertWarnDays {
			sev := "warn"
			if days <= CertCritDays {
				sev = "crit"
			}
			out = append(out, Signal{Key: "cert:" + r.NodeID, Kind: "cert_expiring", Severity: sev, NodeID: r.NodeID,
				Params: with("days", days, "until", r.CertUntil)})
		}
	}
	return out
}

func machine(nodeID string, s agentproto.Snapshot) []Signal {
	var out []Signal
	for _, d := range s.Disks {
		if d.Total == 0 {
			continue
		}
		p := 100 * float64(d.Used) / float64(d.Total)
		if p < DiskWarn {
			continue
		}
		sev := "warn"
		if p >= DiskCrit {
			sev = "crit"
		}
		out = append(out, Signal{Key: "disk:" + nodeID + ":" + d.Mount, Kind: "disk_full", Severity: sev, NodeID: nodeID, Confirm: Confirm,
			Params: map[string]any{"mount": d.Mount, "percent": round(p)}})
	}
	if s.MemTotal > 0 {
		if p := 100 * float64(s.MemUsed) / float64(s.MemTotal); p >= MemWarn {
			out = append(out, Signal{Key: "mem:" + nodeID, Kind: "mem_high", Severity: "warn", NodeID: nodeID, Confirm: 2 * Confirm,
				Params: map[string]any{"percent": round(p)}})
		}
	}
	hot := agentproto.Temp{}
	for _, t := range s.Temps {
		if t.C > hot.C {
			hot = t
		}
	}
	if hot.C >= TempWarn {
		out = append(out, Signal{Key: "temp:" + nodeID, Kind: "temp_high", Severity: "warn", NodeID: nodeID, Confirm: Confirm,
			Params: map[string]any{"c": round(hot.C), "sensor": hot.Name}})
	}
	return out
}

// containers: a container restarting in a loop, stopped with an error, or failing its health check.
// One that finished with code 0 did its job (a backup run, a migration) and is not a problem.
func containers(machineID string, cs []agentproto.Container, all []store.Node) []Signal {
	byKey := map[string]string{}
	for _, n := range all {
		if n.ParentID != nil && *n.ParentID == machineID && n.ExtKey != "" {
			byKey[n.ExtKey] = n.ID
		}
	}
	var out []Signal
	for _, c := range cs {
		key := store.ContainerKey(c)
		node := byKey[key]
		if node == "" {
			node = machineID // not on the map (yet): the machine carries it
		}
		params := map[string]any{"name": c.Name}
		var kind, sev string
		switch {
		case c.State == "restarting":
			kind, sev = "container_restarting", "crit"
			params["restarts"] = c.Restarts
		case c.State == "exited" || c.State == "dead":
			m := exitCode.FindStringSubmatch(c.Status)
			code, _ := strconv.Atoi(append(m, "", "")[1])
			if c.State == "exited" && (m == nil || code == 0) {
				continue
			}
			kind, sev = "container_down", "crit"
			params["code"] = code
		case c.Health == "unhealthy":
			kind, sev = "container_unhealthy", "warn"
		default:
			continue
		}
		out = append(out, Signal{Key: "ctr:" + machineID + ":" + key, Kind: kind, Severity: sev, NodeID: node, Confirm: Confirm, Params: params})
	}
	return out
}

func linkSignal(p agentproto.ProbeResult, links map[string]store.Link) (Signal, bool) {
	l, ok := links[p.ID]
	if !ok || l.Planned || p.Error != "" || p.Sent < 2 || p.Loss == 0 {
		return Signal{}, false
	}
	kind, sev := "link_loss", "warn"
	if p.Loss >= LossCrit {
		kind, sev = "link_down", "crit"
	}
	// The probe window is already a minute long: no extra wait.
	return Signal{Key: "link:" + l.ID, Kind: kind, Severity: sev, LinkID: l.ID,
		Params: map[string]any{"loss": round(p.Loss), "host": p.Host}}, true
}

// group folds signals that share a cause into one:
//   - everything inside a machine whose agent is not connected, and links to it, goes into "not connected";
//   - links that cannot reach the same host (a router that went down) become one problem.
func group(sigs []Signal, offline map[string]bool, nodes map[string]store.Node, links map[string]store.Link) []Signal {
	owner := func(nodeID string) string {
		if offline[nodeID] {
			return nodeID
		}
		if n, ok := nodes[nodeID]; ok && n.ParentID != nil && offline[*n.ParentID] {
			return *n.ParentID
		}
		return ""
	}
	byKey := map[string]int{}
	var out []Signal
	for _, s := range sigs {
		if s.Kind == "agent_offline" {
			byKey[s.Key] = len(out)
			out = append(out, s)
		}
	}
	hosts := map[string]int{}
	for _, s := range sigs {
		if s.Kind == "agent_offline" {
			continue
		}
		cause := ""
		if s.NodeID != "" {
			cause = owner(s.NodeID)
		} else if l, ok := links[s.LinkID]; ok {
			if c := owner(l.FromID); c != "" {
				cause = c
			} else {
				cause = owner(l.ToID)
			}
		}
		if i, ok := byKey["offline:"+cause]; ok && cause != "" {
			out[i].Merged = append(out[i].Merged, s.Kind)
			continue
		}
		if h, ok := s.Params["host"]; ok && (s.LinkID != "" || s.Kind == "node_unreachable" || s.Kind == "node_loss") {
			host := fmt.Sprint(h)
			if i, ok := hosts[host]; ok {
				out[i].Merged = append(out[i].Merged, s.Kind)
				if s.Severity == "crit" && out[i].Severity != "crit" {
					out[i].Severity, out[i].Kind = "crit", s.Kind
				}
				continue
			}
			hosts[host] = len(out)
		}
		out = append(out, s)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Key < out[j].Key })
	return out
}

func round(f float64) float64 { return float64(int(f*10+0.5)) / 10 }
