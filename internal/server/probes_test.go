package server

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/metraveer/gridlume/agent/link"
)

func TestPingHost(t *testing.T) {
	for in, want := range map[string]string{
		"192.168.1.1":          "192.168.1.1",
		" 10.0.0.5/24 ":        "10.0.0.5",
		"nas.lan:5000":         "nas.lan",
		"https://VPS.example/": "vps.example",
		"10.0.0.2:22":          "10.0.0.2",
		"":                     "",
		"fe80::1":              "",
		"[2001:db8::1]:443":    "",
		"Сервер на чердаке":    "",
	} {
		if got := pingHost(in); got != want {
			t.Errorf("pingHost(%q) = %q, want %q", in, got, want)
		}
	}
}

// An agent on one end of a LAN link gets the other end's address to ping, and reports it in snapshots;
// changing the map sends the new list.
func TestAgentPingsTheFarEndOfItsLinks(t *testing.T) {
	old := link.Interval
	link.Interval = 30 * time.Millisecond
	t.Cleanup(func() { link.Interval = old })

	c := signedIn(t)
	_, router := c.do("POST", "/api/nodes", map[string]any{"kind": "router", "name": "Router", "address": "127.0.0.1"}, true)
	_, srv := c.do("POST", "/api/nodes", map[string]any{"kind": "server", "name": "srv"}, true)
	_, l := c.do("POST", "/api/links", map[string]any{"fromId": router["id"], "toId": srv["id"], "kind": "lan"}, true)
	_, code := c.do("POST", "/api/agents/codes", map[string]any{"nodeId": srv["id"], "mode": "user"}, true)
	cfg, err := link.Enroll(context.Background(), c.base, code["code"].(string), "user", t.TempDir(), "test")
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go func() { _ = link.Run(ctx, cfg, "test", slog.New(slog.NewTextHandler(io.Discard, nil))) }()

	probes := func() string {
		res, err := c.http.Get(c.base + "/api/agents")
		if err != nil {
			return ""
		}
		defer res.Body.Close()
		var list []struct {
			Snapshot *struct {
				Probes json.RawMessage `json:"probes"`
			} `json:"snapshot"`
		}
		_ = json.NewDecoder(res.Body).Decode(&list)
		if len(list) == 0 || list[0].Snapshot == nil {
			return ""
		}
		return string(list[0].Snapshot.Probes)
	}
	waitFor(t, "the probe in snapshots", func() bool { return strings.Contains(probes(), `"id":"`+l["id"].(string)+`"`) })
	if !strings.Contains(probes(), `"host":"127.0.0.1"`) {
		t.Fatalf("probes: %s", probes())
	}
	// The link is gone: the agent stops pinging.
	c.do("DELETE", "/api/links/"+l["id"].(string), nil, true)
	waitFor(t, "the probe to go", func() bool { p := probes(); return p == "" || p == "null" || p == "[]" })
}
