package notify

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/metraveer/gridlume/internal/problems"
	"github.com/metraveer/gridlume/internal/store"
)

const token = "123456:SECRET-token"

// fakeTelegram answers like the Bot API and remembers what was sent.
type fakeTelegram struct {
	mu       sync.Mutex
	sent     []string
	failSend int // fail this many sendMessage calls first
}

func (f *fakeTelegram) server(t *testing.T) *httptest.Server {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/bot"+token+"/") {
			_, _ = w.Write([]byte(`{"ok":false,"error_code":401,"description":"Unauthorized"}`))
			return
		}
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		switch strings.TrimPrefix(r.URL.Path, "/bot"+token+"/") {
		case "getMe":
			_, _ = w.Write([]byte(`{"ok":true,"result":{"username":"gridlume_home_bot"}}`))
		case "getUpdates":
			if body["offset"].(float64) > 0 {
				_, _ = w.Write([]byte(`{"ok":true,"result":[]}`))
				return
			}
			_, _ = w.Write([]byte(`{"ok":true,"result":[{"update_id":7,"message":{"chat":{"id":4242,"type":"private","first_name":"Иван"}}}]}`))
		case "sendMessage":
			f.mu.Lock()
			defer f.mu.Unlock()
			if f.failSend > 0 {
				f.failSend--
				w.WriteHeader(502)
				_, _ = w.Write([]byte(`{"ok":false,"error_code":502,"description":"Bad Gateway"}`))
				return
			}
			f.sent = append(f.sent, body["text"].(string))
			_, _ = w.Write([]byte(`{"ok":true,"result":{}}`))
		}
	}))
	t.Cleanup(srv.Close)
	return srv
}

func (f *fakeTelegram) messages() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.sent...)
}

func setup(t *testing.T) (*Notifier, *fakeTelegram) {
	t.Helper()
	s, err := store.Open(filepath.Join(t.TempDir(), "g.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	f := &fakeTelegram{}
	n := New(s, slog.New(slog.NewTextHandler(io.Discard, nil)))
	n.TG.Base = f.server(t).URL
	n.Retry = []time.Duration{10 * time.Millisecond, 10 * time.Millisecond}
	return n, f
}

func waitUntil(t *testing.T, what string, ok func() bool) {
	t.Helper()
	for deadline := time.Now().Add(3 * time.Second); time.Now().Before(deadline); time.Sleep(10 * time.Millisecond) {
		if ok() {
			return
		}
	}
	t.Fatalf("timed out waiting for %s", what)
}

func TestConnectWaitsForStartAndSaysHello(t *testing.T) {
	n, f := setup(t)
	ctx := context.Background()
	if err := n.Connect(ctx, "999:wrong"); err != ErrToken {
		t.Fatalf("a wrong token must be refused: %v", err)
	}
	if err := n.Connect(ctx, " "+token+" "); err != nil {
		t.Fatal(err)
	}
	waitUntil(t, "the chat to be found", func() bool { st := n.Status(ctx); return st.Connected && !st.Waiting })
	st := n.Status(ctx)
	if st.Bot != "gridlume_home_bot" || st.ChatName != "Иван" || st.Waiting {
		t.Fatalf("status: %+v", st)
	}
	waitUntil(t, "the hello message", func() bool { return len(f.messages()) == 1 })
	if !strings.HasPrefix(f.messages()[0], "Gridlume подключён") {
		t.Fatalf("hello: %q", f.messages()[0])
	}
	if err := n.Test(ctx); err != nil || len(f.messages()) != 2 {
		t.Fatalf("test message: %v %v", err, f.messages())
	}
	if err := n.Disconnect(ctx); err != nil || n.Status(ctx).Connected {
		t.Fatal("disconnect")
	}
	if err := n.Test(ctx); err != ErrNotConnected {
		t.Fatalf("after disconnect: %v", err)
	}
}

func TestTokenNeverLeaks(t *testing.T) {
	n, _ := setup(t)
	n.TG.Base = "http://127.0.0.1:1" // nothing listens: the error carries the URL
	err := n.TG.Send(context.Background(), token, 1, "x")
	if err == nil || strings.Contains(err.Error(), "SECRET") {
		t.Fatalf("error must not show the token: %v", err)
	}
}

func TestRetryUntilItGoes(t *testing.T) {
	n, f := setup(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	_ = n.Store.SetSetting(ctx, keyToken, token)
	_ = n.Store.SetSetting(ctx, keyChat, "4242")
	f.failSend = 2
	go n.Run(ctx)
	n.Enqueue("hello")
	waitUntil(t, "the message after two failures", func() bool { return len(f.messages()) == 1 })
	if n.Status(ctx).LastError != "" {
		t.Fatal("the error clears once a message goes")
	}
}

func TestMessagesFollowTheRules(t *testing.T) {
	m := store.Map{Nodes: []store.Node{{ID: "srv", Name: "calibur"}}}
	noon := time.Date(2026, 10, 30, 12, 0, 0, 0, time.Local)
	night := time.Date(2026, 10, 30, 2, 0, 0, 0, time.Local)
	disk := store.Problem{Kind: "disk_full", Severity: "warn", NodeID: "srv", Params: map[string]any{"mount": "/", "percent": 93.0}}
	off := store.Problem{Kind: "agent_offline", Severity: "crit", NodeID: "srv", Params: map[string]any{"lastSeen": float64(noon.Add(-10 * time.Minute).Unix())}, Merged: []string{"container_down"}}
	r := Rules{Warn: true, Resolved: true, Quiet: true, QuietFrom: "23:00", QuietTo: "08:00", Lang: "ru"}

	msgs := Messages(r, problems.Change{Opened: []store.Problem{disk, off}}, m, noon)
	if len(msgs) != 2 || !strings.HasPrefix(msgs[0], "🟡 На calibur заканчивается место: / занят на 93%") {
		t.Fatalf("by day: %q", msgs)
	}
	if !strings.Contains(msgs[1], "🔴 calibur не на связи") || !strings.Contains(msgs[1], "10 мин назад") || !strings.Contains(msgs[1], "и ещё 1 сигнал с той же причиной") {
		t.Fatalf("offline: %q", msgs[1])
	}
	// At night only red goes.
	if msgs := Messages(r, problems.Change{Opened: []store.Problem{disk, off}}, m, night); len(msgs) != 1 || !strings.HasPrefix(msgs[0], "🔴") {
		t.Fatalf("at night: %q", msgs)
	}
	// Amber off: only red, by day too.
	r2 := r
	r2.Warn = false
	if msgs := Messages(r2, problems.Change{Opened: []store.Problem{disk}}, m, noon); len(msgs) != 0 {
		t.Fatalf("amber off: %q", msgs)
	}
	// Solved, with how long it lasted.
	ended := off
	ended.Since, ended.Ended = noon.Add(-75*time.Minute).UnixMilli(), noon.UnixMilli()
	if msgs := Messages(r, problems.Change{Ended: []store.Problem{ended}}, m, noon); len(msgs) != 1 || msgs[0] != "✅ Решено: calibur не на связи. Длилось 1 ч 15 мин." {
		t.Fatalf("resolved: %q", msgs)
	}
	// Many at once: one message.
	many := []store.Problem{off, off, off, off}
	if msgs := Messages(r, problems.Change{Opened: many}, m, noon); len(msgs) != 1 || !strings.HasPrefix(msgs[0], "Сразу 4 проблемы:") {
		t.Fatalf("many: %q", msgs)
	}
}

func TestQuietHoursAndRules(t *testing.T) {
	n, _ := setup(t)
	ctx := context.Background()
	if r := n.GetRules(ctx); !r.Warn || !r.Resolved || r.Quiet || r.QuietFrom != "23:00" || r.Lang != "ru" {
		t.Fatalf("defaults: %+v", r)
	}
	if err := n.SaveRules(ctx, Rules{QuietFrom: "25:00", QuietTo: "08:00", Lang: "ru"}); err != ErrRules {
		t.Fatalf("a bad time must be refused: %v", err)
	}
	day := Rules{Quiet: true, QuietFrom: "09:00", QuietTo: "18:00"}
	if !day.quietNow(time.Date(2026, 1, 1, 12, 0, 0, 0, time.Local)) || day.quietNow(time.Date(2026, 1, 1, 19, 0, 0, 0, time.Local)) {
		t.Fatal("quiet hours within a day")
	}
}
