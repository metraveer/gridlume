package server

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/metraveer/gridlume/internal/agentproto"
	"github.com/metraveer/gridlume/internal/store"
)

// core is a whole Gridlume core for a test, with an owner signed in.
func core(t *testing.T) (*api, *client, *httptest.Server) {
	t.Helper()
	s, err := store.Open(filepath.Join(t.TempDir(), "g.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	a := newAPI(Options{Store: s, SetupCode: "K7QM-2R9X"}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	mux := http.NewServeMux()
	a.routes(mux)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	jar, _ := cookiejar.New(nil)
	c := &client{t: t, base: srv.URL, http: &http.Client{Jar: jar}}
	if code, _ := c.do("POST", "/api/setup", map[string]string{"code": "K7QM-2R9X", "username": "ops", "password": "correct horse battery"}, true); code != 200 {
		t.Fatalf("setup: %d", code)
	}
	return a, c, srv
}

func kinds(a *api, now time.Time) string {
	var k []string
	for _, s := range a.watchSignals(context.Background(), now) {
		k = append(k, s.Kind)
	}
	return strings.Join(k, ",")
}

func TestDutyCoreWatchesTheMainOne(t *testing.T) {
	main, mc, mainSrv := core(t)
	duty, dc, _ := core(t)
	ctx := context.Background()

	// The main core makes a code; a wrong one is refused, the right one pairs.
	_, out := mc.do("POST", "/api/watch/duty", nil, true)
	code, _ := out["code"].(string)
	if len(code) < 20 {
		t.Fatalf("code: %v", out)
	}
	if st, _ := dc.do("PUT", "/api/watch/target", map[string]string{"url": mainSrv.URL, "code": "nope"}, true); st != 400 {
		t.Fatalf("a wrong code must be refused: %d", st)
	}
	if st, _ := dc.do("PUT", "/api/watch/target", map[string]string{"url": mainSrv.URL + "/", "code": code}, true); st != 200 {
		t.Fatalf("pair: %d", st)
	}
	_, w := mc.do("GET", "/api/watch", nil, false)
	if d := w["duty"].(map[string]any); d["paired"] != true || d["dutySeen"].(float64) == 0 || w["code"] != nil {
		t.Fatalf("the main core sees its duty core, and never shows the code again: %v", w)
	}

	// Both fine.
	duty.checkWatched(ctx)
	if k := kinds(duty, time.Now()); k != "" {
		t.Fatalf("all well: %q", k)
	}
	// The main core goes down: after three failed checks the duty core has a problem.
	mainSrv.Close()
	for range 3 {
		duty.checkWatched(ctx)
	}
	if k := kinds(duty, time.Now()); k != "core_down" {
		t.Fatalf("main core down: %q", k)
	}
	// The main core notices a silent duty core.
	_ = main.store.SetSetting(ctx, settingDutySeen, strconv.FormatInt(time.Now().Add(-10*time.Minute).Unix(), 10))
	if k := kinds(main, time.Now()); k != "duty_silent" {
		t.Fatalf("duty silent: %q", k)
	}
}

func TestWatchByAgentsNeedsTelegramAndTheOwnersChoice(t *testing.T) {
	a, c, _ := core(t)
	ctx := context.Background()
	_, body := c.do("POST", "/api/agents/codes", map[string]string{"mode": "user"}, true)
	ag, err := a.store.Enroll(ctx, body["code"].(string), make([]byte, 32), agentInfo())
	if err != nil {
		t.Fatal(err)
	}
	if st, _ := c.do("PUT", "/api/watch/agents", map[string]any{"agents": []string{ag.ID, "unknown"}, "after": 0}, true); st != 400 {
		t.Fatalf("0 minutes: %d", st)
	}
	_, out := c.do("PUT", "/api/watch/agents", map[string]any{"agents": []string{ag.ID, "unknown"}, "after": 5}, true)
	if got := out["agents"].(map[string]any)["agents"].([]any); len(got) != 1 {
		t.Fatalf("only known agents are kept: %v", out)
	}
	if a.watchFor(ctx, ag.ID) != nil {
		t.Fatal("without Telegram there is nothing to hand out")
	}
	_ = a.store.SetSetting(ctx, "notify_tg_token", "123:abc")
	_ = a.store.SetSetting(ctx, "notify_tg_chat", "42")
	w := a.watchFor(ctx, ag.ID)
	if w == nil || w.Chat != 42 || w.After != 300 || !strings.Contains(w.Down, "{min}") || !strings.Contains(w.Down, "{host}") || strings.Contains(w.Down, "{core}") {
		t.Fatalf("watch config: %+v", w)
	}
	if a.watchFor(ctx, "someone-else") != nil {
		t.Fatal("an agent that is not chosen gets nothing")
	}
}

func agentInfo() agentproto.Info { return agentproto.Info{Hostname: "junk", Version: "test"} }
