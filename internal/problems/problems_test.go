package problems

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/metraveer/gridlume/internal/agentlink"
	"github.com/metraveer/gridlume/internal/agentproto"
	"github.com/metraveer/gridlume/internal/checks"
	"github.com/metraveer/gridlume/internal/store"
)

var now = time.Unix(1_800_000_000, 0)

func ptr[T any](v T) *T { return &v }

func kinds(sigs []Signal) map[string]Signal {
	out := map[string]Signal{}
	for _, s := range sigs {
		out[s.Kind] = s
	}
	return out
}

func TestDetectMachineAndContainers(t *testing.T) {
	m := store.Map{Nodes: []store.Node{
		{ID: "srv", Kind: "server", Name: "srv"},
		{ID: "app", Kind: "container", Name: "app", ParentID: ptr("srv"), ExtKey: "docker:nc/app"},
	}}
	snap := agentproto.Snapshot{
		MemTotal: 100, MemUsed: 96,
		Disks: []agentproto.Disk{{Mount: "/", Total: 100, Used: 98}, {Mount: "/data", Total: 100, Used: 50}},
		Temps: []agentproto.Temp{{Name: "Package id 0", C: 93}},
		Docker: &agentproto.Docker{Containers: []agentproto.Container{
			{Name: "nc-app-1", Project: "nc", Service: "app", State: "restarting", Restarts: 7},
			{Name: "backup", State: "exited", Status: "Exited (0) 3 minutes ago"}, // finished its job
			{Name: "worker", State: "exited", Status: "Exited (137) 1 minute ago"},
			{Name: "db", State: "running", Health: "unhealthy"},
		}},
	}
	sigs := Detect(Input{Map: m, Agents: []agentlink.Status{{Agent: store.Agent{NodeID: "srv"}, Online: true}}, Snaps: map[string]agentproto.Snapshot{"srv": snap}, Now: now})
	k := kinds(sigs)
	if s := k["disk_full"]; s.Severity != "crit" || s.Params["mount"] != "/" {
		t.Errorf("disk: %+v", s)
	}
	if _, ok := k["mem_high"]; !ok {
		t.Error("memory at 96% must be a signal")
	}
	if _, ok := k["temp_high"]; !ok {
		t.Error("93 °C must be a signal")
	}
	if s := k["container_restarting"]; s.NodeID != "app" || s.Params["restarts"] != 7 {
		t.Errorf("restarting container belongs to its node: %+v", s)
	}
	if s := k["container_down"]; s.Params["name"] != "worker" || s.Params["code"] != 137 || s.NodeID != "srv" {
		t.Errorf("stopped with an error: %+v", s)
	}
	if _, ok := k["container_unhealthy"]; !ok {
		t.Error("unhealthy container must be a signal")
	}
	for _, s := range sigs {
		if s.Params["name"] == "backup" {
			t.Error("a container that finished with code 0 is not a problem")
		}
	}
}

func TestOneCausePerMessage(t *testing.T) {
	m := store.Map{
		Nodes: []store.Node{
			{ID: "router", Kind: "router", Name: "Router", Address: "192.168.1.1"},
			{ID: "a", Kind: "server", Name: "a"}, {ID: "b", Kind: "server", Name: "b"},
			{ID: "dead", Kind: "server", Name: "dead"},
		},
		Links: []store.Link{
			{ID: "l1", FromID: "router", ToID: "a", Kind: "lan"},
			{ID: "l2", FromID: "router", ToID: "b", Kind: "lan"},
		},
	}
	lost := func(id string) agentproto.Snapshot {
		return agentproto.Snapshot{Probes: []agentproto.ProbeResult{{ID: id, Host: "192.168.1.1", Sent: 6, Loss: 100}}}
	}
	sigs := Detect(Input{Map: m, Now: now,
		Agents: []agentlink.Status{
			{Agent: store.Agent{NodeID: "a"}, Online: true},
			{Agent: store.Agent{NodeID: "b"}, Online: true},
			{Agent: store.Agent{NodeID: "dead", LastSeen: now.Add(-5 * time.Minute).Unix()}},
			{Agent: store.Agent{NodeID: "never"}}, // never connected: not an outage
		},
		Snaps: map[string]agentproto.Snapshot{"a": lost("l1"), "b": lost("l2")},
	})
	k := kinds(sigs)
	if len(sigs) != 2 {
		t.Fatalf("want the dead machine and one router problem, got %+v", sigs)
	}
	if s := k["link_down"]; len(s.Merged) != 1 {
		t.Errorf("two links that cannot reach the same router are one problem: %+v", s)
	}
	if _, ok := k["agent_offline"]; !ok {
		t.Error("a machine silent for 5 minutes is not connected")
	}
}

func TestEngineConfirmsAndClears(t *testing.T) {
	s, err := store.Open(filepath.Join(t.TempDir(), "g.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	ctx := context.Background()
	e := NewEngine(s)
	disk := []Signal{{Key: "disk:srv:/", Kind: "disk_full", Severity: "warn", NodeID: "srv", Confirm: 30 * time.Second, Params: map[string]any{"mount": "/", "percent": 91.0}}}

	// A blip is not a problem.
	if ch, _ := e.Step(ctx, disk, Held{}, now); ch.Any() {
		t.Fatalf("first sight must wait: %+v", ch)
	}
	if ch, _ := e.Step(ctx, nil, Held{}, now.Add(10*time.Second)); ch.Any() {
		t.Fatal("gone before it counted")
	}
	// Lasting: it opens after Confirm, dated from when it began.
	e.Step(ctx, disk, Held{}, now.Add(20*time.Second))
	ch, _ := e.Step(ctx, disk, Held{}, now.Add(55*time.Second))
	if len(ch.Opened) != 1 || ch.Opened[0].Since != now.Add(20*time.Second).UnixMilli() {
		t.Fatalf("open: %+v", ch)
	}
	// Small drift is not news; worse is.
	disk[0].Params = map[string]any{"mount": "/", "percent": 91.4}
	if ch, _ := e.Step(ctx, disk, Held{}, now.Add(60*time.Second)); ch.Any() {
		t.Fatalf("drift: %+v", ch)
	}
	disk[0].Severity, disk[0].Params = "crit", map[string]any{"mount": "/", "percent": 98.0}
	if ch, _ := e.Step(ctx, disk, Held{}, now.Add(70*time.Second)); !ch.Moved {
		t.Fatal("severity change must be noticed")
	}
	// A new engine (restart) knows the open problem.
	e2 := NewEngine(s)
	if ch, _ := e2.Step(ctx, disk, Held{}, now.Add(80*time.Second)); ch.Any() {
		t.Fatalf("after a restart: %+v", ch)
	}
	// It ends after the signal is gone for Clear, dated from when it went.
	e2.Step(ctx, nil, Held{}, now.Add(90*time.Second))
	ch, _ = e2.Step(ctx, nil, Held{}, now.Add(125*time.Second))
	if len(ch.Ended) != 1 || ch.Ended[0].Ended != now.Add(90*time.Second).UnixMilli() {
		t.Fatalf("end: %+v", ch)
	}
	if open, _ := s.OpenProblems(ctx); len(open) != 0 {
		t.Fatalf("still open: %+v", open)
	}
	if ended, _ := s.EndedProblems(ctx, 0); len(ended) != 1 || ended[0].Severity != "crit" {
		t.Fatalf("history: %+v", ended)
	}
}

func TestNothingEndsWhileTheMachineIsAway(t *testing.T) {
	s, err := store.Open(filepath.Join(t.TempDir(), "g.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	ctx := context.Background()
	e := NewEngine(s)
	ctr := []Signal{{Key: "ctr:srv:docker:worker", Kind: "container_down", Severity: "crit", NodeID: "w", Params: map[string]any{"name": "worker"}}}
	e.Step(ctx, ctr, Held{}, now)
	// The machine goes away: its container's problem is unknown, not over.
	in := Input{Map: store.Map{Nodes: []store.Node{{ID: "srv"}, {ID: "w", ParentID: ptr("srv")}}}, Agents: []agentlink.Status{{Agent: store.Agent{NodeID: "srv"}}}}
	held := HeldIn(in)
	for i := 1; i <= 5; i++ {
		if ch, _ := e.Step(ctx, nil, held, now.Add(time.Duration(i)*time.Minute)); len(ch.Ended) > 0 {
			t.Fatalf("ended while the machine was away: %+v", ch)
		}
	}
	// Back, and the container is fine: now it ends.
	e.Step(ctx, nil, Held{}, now.Add(6*time.Minute))
	if ch, _ := e.Step(ctx, nil, Held{}, now.Add(7*time.Minute)); len(ch.Ended) != 1 {
		t.Fatalf("after the machine came back: %+v", ch)
	}
}

func TestFoldUnderTheMachine(t *testing.T) {
	in := Input{Map: store.Map{
		Nodes: []store.Node{{ID: "srv"}, {ID: "w", ParentID: ptr("srv")}, {ID: "other"}},
		Links: []store.Link{{ID: "l", FromID: "router", ToID: "srv"}},
	}}
	open := []store.Problem{
		{ID: "1", Kind: "container_down", NodeID: "w"},
		{ID: "2", Kind: "agent_offline", NodeID: "srv"},
		{ID: "3", Kind: "link_loss", LinkID: "l"},
		{ID: "4", Kind: "disk_full", NodeID: "other"},
	}
	out := Fold(open, in)
	if len(out) != 2 || out[0].ID != "2" || len(out[0].Merged) != 2 || out[1].ID != "4" {
		t.Fatalf("fold: %+v", out)
	}
	if len(open[1].Merged) != 0 {
		t.Fatal("the stored problem must not change")
	}
}

func TestCheckSignals(t *testing.T) {
	m := store.Map{
		Nodes: []store.Node{
			{ID: "router", Address: "192.168.1.1"}, {ID: "srv"}, {ID: "nas"}, {ID: "site"}, {ID: "dom"},
		},
		Links: []store.Link{{ID: "l", FromID: "router", ToID: "srv", Kind: "lan"}},
	}
	soon := now.Add(5 * 24 * time.Hour).Unix()
	sigs := Detect(Input{Map: m, Now: now,
		Agents: []agentlink.Status{{Agent: store.Agent{NodeID: "srv"}, Online: true}},
		Snaps:  map[string]agentproto.Snapshot{"srv": {Probes: []agentproto.ProbeResult{{ID: "l", Host: "192.168.1.1", Sent: 6, Loss: 100}}}},
		Checks: map[string]checks.Result{
			"router": {NodeID: "router", Kind: "ping", Target: "192.168.1.1", Sent: 6, Loss: 100},
			"nas":    {NodeID: "nas", Kind: "tcp", Target: "nas.lan:5000", Fails: 3, Error: "connection refused"},
			"site":   {NodeID: "site", Kind: "http", Target: "https://cloud.example.org/", Fails: 1, CertUntil: soon},
			"dom":    {NodeID: "dom", Kind: "http", Target: "https://example.org/", Fails: 2, Status: 502, Error: "HTTP 502"},
		},
	})
	k := kinds(sigs)
	// The router seen down by the agent's link and by the core's own ping: one problem.
	if s, ok := k["link_down"]; !ok || len(s.Merged) != 1 || s.Merged[0] != "node_unreachable" {
		t.Errorf("router down, seen twice: %+v", sigs)
	}
	if s := k["port_down"]; s.NodeID != "nas" || s.Params["error"] != "connection refused" {
		t.Errorf("port: %+v", s)
	}
	if s := k["site_down"]; s.NodeID != "dom" || s.Params["status"] != 502 {
		t.Errorf("site: %+v", s)
	}
	if s := k["cert_expiring"]; s.NodeID != "site" || s.Severity != "warn" || s.Params["days"] != 5 {
		t.Errorf("certificate in 5 days: %+v", s)
	}
	for _, s := range sigs {
		if s.Kind == "site_down" && s.NodeID == "site" {
			t.Error("one failed request is not a site that is down")
		}
	}
}
