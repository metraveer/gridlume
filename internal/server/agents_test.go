package server

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/metraveer/gridlume/agent/link"
)

// signedIn returns a client with an owner session.
func signedIn(t *testing.T) *client {
	t.Helper()
	c, _ := newClient(t, "K7QM-2R9X")
	if code, _ := c.do("POST", "/api/setup", map[string]string{"code": "K7QM-2R9X", "username": "ops", "password": "correct horse battery"}, true); code != 200 {
		t.Fatalf("setup: %d", code)
	}
	return c
}

type agentRow struct {
	ID       string `json:"id"`
	NodeID   string `json:"nodeId"`
	Hostname string `json:"hostname"`
	Mode     string `json:"mode"`
	Online   bool   `json:"online"`
	Snapshot *struct {
		Cores int `json:"cores"`
	} `json:"snapshot"`
}

func (c *client) agents() []agentRow {
	c.t.Helper()
	res, err := c.http.Get(c.base + "/api/agents")
	if err != nil {
		c.t.Fatal(err)
	}
	defer res.Body.Close()
	var out []agentRow
	_ = json.NewDecoder(res.Body).Decode(&out)
	return out
}

// waitFor polls until ok returns true or two seconds pass.
func waitFor(t *testing.T, what string, ok func() bool) {
	t.Helper()
	for deadline := time.Now().Add(2 * time.Second); time.Now().Before(deadline); time.Sleep(20 * time.Millisecond) {
		if ok() {
			return
		}
	}
	t.Fatalf("timed out waiting for %s", what)
}

func TestAgentEnrollConnectUnlink(t *testing.T) {
	old := link.Interval
	link.Interval = 30 * time.Millisecond
	t.Cleanup(func() { link.Interval = old })

	c := signedIn(t)
	if code, _ := c.do("POST", "/api/agents/codes", map[string]string{"mode": "superuser"}, true); code != 400 {
		t.Fatalf("unknown mode must be refused: %d", code)
	}
	code, body := c.do("POST", "/api/agents/codes", map[string]string{"mode": "readonly"}, true)
	if code != 201 {
		t.Fatalf("create code: %d %v", code, body)
	}
	enrollCode := body["code"].(string)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	state := t.TempDir()
	cfg, err := link.Enroll(ctx, c.base, strings.ToLower(enrollCode), "root", state, "test")
	if err != nil {
		t.Fatalf("enroll: %v", err)
	}
	if _, err := link.Enroll(ctx, c.base, enrollCode, "user", t.TempDir(), "test"); err == nil {
		t.Fatal("a code must work only once")
	}
	if loaded, err := link.Load(state); err != nil || loaded.AgentID != cfg.AgentID {
		t.Fatalf("load: %v %+v", err, loaded)
	}

	// The code made a new node; the mode chosen in the interface wins over what the agent asked for.
	list := c.agents()
	if len(list) != 1 || list[0].Mode != "readonly" || list[0].Online {
		t.Fatalf("agents after enroll: %+v", list)
	}
	_, m := c.do("GET", "/api/map", nil, false)
	if nodes := m["nodes"].([]any); len(nodes) != 1 || nodes[0].(map[string]any)["id"] != list[0].NodeID {
		t.Fatalf("map after enroll: %v", m)
	}

	done := make(chan error, 1)
	go func() { done <- link.Run(ctx, cfg, "test", slog.New(slog.NewTextHandler(io.Discard, nil))) }()
	waitFor(t, "the agent to come online with a snapshot", func() bool {
		l := c.agents()
		return len(l) == 1 && l[0].Online && l[0].Snapshot != nil && l[0].Snapshot.Cores > 0
	})

	// Unlinking drops the connection, and the core then refuses the agent.
	if code, _ := c.do("DELETE", "/api/agents/"+list[0].ID, nil, true); code != 200 {
		t.Fatalf("unlink: %d", code)
	}
	if l := c.agents(); len(l) != 0 {
		t.Fatalf("agents after unlink: %+v", l)
	}
	cancel()
	if err := <-done; err != nil {
		t.Fatalf("run: %v", err)
	}
}

func TestUnlinkedAgentIsTold(t *testing.T) {
	c := signedIn(t)
	_, body := c.do("POST", "/api/agents/codes", map[string]string{"mode": "user"}, true)
	cfg, err := link.Enroll(context.Background(), c.base, body["code"].(string), "user", t.TempDir(), "test")
	if err != nil {
		t.Fatal(err)
	}
	c.do("DELETE", "/api/agents/"+cfg.AgentID, nil, true)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := link.Once(ctx, cfg, "test", slog.New(slog.NewTextHandler(io.Discard, nil))); !errors.Is(err, link.ErrUnlinked) {
		t.Fatalf("want ErrUnlinked, got %v", err)
	}
}

func TestInstallScriptHasCoreAddress(t *testing.T) {
	c, _ := newClient(t, "")
	res, err := c.http.Get(c.base + "/install.sh")
	if err != nil {
		t.Fatal(err)
	}
	b, _ := io.ReadAll(res.Body)
	res.Body.Close()
	s := string(b)
	if !strings.HasPrefix(s, "#!/bin/sh") || !strings.Contains(s, `CORE="`+c.base+`"`) || strings.Contains(s, "\r") {
		t.Fatalf("script not filled in:\n%.300s", s)
	}
	if res, _ := c.http.Get(c.base + "/download/..%2fgridlume.db"); res.StatusCode != 404 {
		t.Fatalf("download must only serve agent builds: %d", res.StatusCode)
	}
}
