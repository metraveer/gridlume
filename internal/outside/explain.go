package outside

import (
	"slices"
	"strconv"
	"strings"

	"github.com/metraveer/gridlume/internal/agentproto"
	"github.com/metraveer/gridlume/internal/problems"
	"github.com/metraveer/gridlume/internal/store"
)

// Explain finds the nodes an open port probably leads to: containers that publish it, nodes a link
// from the internet or a domain reaches over it, nodes whose address names it. Nothing found means the
// map does not know what answers there — worth a look.
func Explain(m store.Map, snaps map[string]agentproto.Snapshot, port int) []string {
	var out []string
	add := func(id string) {
		if !slices.Contains(out, id) {
			out = append(out, id)
		}
	}
	for _, machine := range sortedKeys(snaps) {
		d := snaps[machine].Docker
		if d == nil {
			continue
		}
		for _, c := range d.Containers {
			for _, p := range c.Ports {
				if p.Public == port && p.Proto != "udp" {
					add(containerNode(m, machine, c))
				}
			}
		}
	}
	entry := map[string]bool{}
	for _, n := range m.Nodes {
		if n.Kind == "internet" || n.Kind == "domain" {
			entry[n.ID] = true
		}
	}
	for _, l := range m.Links {
		if entry[l.FromID] && !l.Planned && slices.Contains(portIn.FindAllString(l.Proto, -1), strconv.Itoa(port)) {
			add(l.ToID)
		}
	}
	for _, n := range m.Nodes {
		if a := strings.TrimSpace(n.Address); a != "" && !strings.Contains(a, "://") && strings.HasSuffix(a, ":"+strconv.Itoa(port)) {
			add(n.ID)
		}
	}
	return out
}

func containerNode(m store.Map, machine string, c agentproto.Container) string {
	key := store.ContainerKey(c)
	for _, n := range m.Nodes {
		if n.ParentID != nil && *n.ParentID == machine && n.ExtKey == key {
			return n.ID
		}
	}
	return machine
}

// Signals are the problems of the last check: every risky port open to anyone, on the node it leads to
// when the map knows it.
func Signals(r *Result, m store.Map, snaps map[string]agentproto.Snapshot) []problems.Signal {
	if r == nil {
		return nil
	}
	var out []problems.Signal
	for _, f := range r.Found {
		for _, o := range f.Open {
			s := ServiceOf(o.Port)
			if s.Risk == "" {
				continue
			}
			host := f.IP
			if len(f.Names) > 0 && f.Names[0] != f.IP {
				host = f.Names[0]
			}
			sig := problems.Signal{
				Key: "outside:" + f.IP + ":" + strconv.Itoa(o.Port), Kind: "exposed_" + s.Risk, Severity: "warn",
				Params: map[string]any{"port": strconv.Itoa(o.Port), "service": s.Name, "host": host, "ip": f.IP},
			}
			if s.Risk == "nopass" {
				sig.Severity = "crit"
			}
			if nodes := Explain(m, snaps, o.Port); len(nodes) == 1 {
				sig.NodeID = nodes[0]
			}
			out = append(out, sig)
		}
	}
	return out
}
