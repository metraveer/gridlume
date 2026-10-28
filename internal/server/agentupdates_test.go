package server

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/metraveer/gridlume/agent/link"
	"github.com/metraveer/gridlume/internal/agentproto"
	"github.com/metraveer/gridlume/internal/store"
)

func TestAgentUpdates(t *testing.T) {
	old := link.Interval
	link.Interval = 30 * time.Millisecond
	t.Cleanup(func() { link.Interval = old })
	// The agent's updater is "installed".
	unit := filepath.Join(t.TempDir(), "gridlume-agent-update.path")
	_ = os.WriteFile(unit, nil, 0o644)
	oldUnit := link.UpdaterUnit
	link.UpdaterUnit = unit
	t.Cleanup(func() { link.UpdaterUnit = oldUnit })

	// The core hands out build 50.
	agents := t.TempDir()
	_ = os.WriteFile(filepath.Join(agents, "release.json"), []byte(`{"version":"0.9.0-dev.50","channel":"edge","build":50}`), 0o644)
	s, err := store.Open(filepath.Join(t.TempDir(), "g.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	srv := httptest.NewServer(New(Options{Store: s, SetupCode: "K7QM-2R9X", AgentsDir: agents}))
	t.Cleanup(srv.Close)
	jar, _ := cookiejar.New(nil)
	c := &client{t: t, base: srv.URL, http: &http.Client{Jar: jar}}
	if code, _ := c.do("POST", "/api/setup", map[string]string{"code": "K7QM-2R9X", "username": "ops", "password": "correct horse battery"}, true); code != 200 {
		t.Fatalf("setup: %d", code)
	}
	if _, sys := c.do("GET", "/api/system", nil, false); sys["agentAuto"] != true || sys["agents"].(map[string]any)["version"] != "0.9.0-dev.50" {
		t.Fatalf("system: %v", sys)
	}

	_, body := c.do("POST", "/api/agents/codes", map[string]string{"mode": "user"}, true)
	state := t.TempDir()
	cfg, err := link.Enroll(context.Background(), c.base, body["code"].(string), "user", state, "test")
	if err != nil {
		t.Fatal(err)
	}
	request := filepath.Join(state, link.RequestFile)
	run := func() context.CancelFunc {
		ctx, cancel := context.WithCancel(context.Background())
		go func() { _ = link.Run(ctx, cfg, "test", slog.New(slog.NewTextHandler(io.Discard, nil))) }()
		waitFor(t, "the agent to connect", func() bool { l := c.agents(); return len(l) == 1 && l[0].Online })
		return cancel
	}

	// Automatic: the agent is asked as soon as it connects, and leaves the request for its updater.
	stop := run()
	waitFor(t, "the update request", func() bool { b, _ := os.ReadFile(request); return string(b) == "0.9.0-dev.50" })
	stop()
	waitFor(t, "the agent to go offline", func() bool { l := c.agents(); return len(l) == 1 && !l[0].Online })

	// That version failed: no automatic retry, but the button still works.
	_ = os.Remove(request)
	failed, _ := json.Marshal(agentproto.UpdateResult{State: "rolled_back", From: "test", To: "0.9.0-dev.50", At: time.Now().Unix()})
	_ = os.WriteFile(filepath.Join(state, link.StatusFile), failed, 0o644)
	stop = run()
	defer stop()
	time.Sleep(200 * time.Millisecond)
	if _, err := os.Stat(request); err == nil {
		t.Fatal("a version that failed must not be retried automatically")
	}
	res, _ := c.http.Get(c.base + "/api/agents")
	b, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if !strings.Contains(string(b), `"canUpdate":true`) || !strings.Contains(string(b), `"state":"rolled_back"`) {
		t.Fatalf("agent status: %s", b)
	}
	if code, _ := c.do("POST", "/api/agents/"+cfg.AgentID+"/update", nil, true); code != 202 {
		t.Fatalf("update button: %d", code)
	}
	waitFor(t, "the update request from the button", func() bool { _, err := os.Stat(request); return err == nil })
}
