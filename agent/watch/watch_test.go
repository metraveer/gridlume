package watch

import (
	"context"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/metraveer/gridlume/internal/agentproto"
)

type clock struct{ t time.Time }

func (c *clock) now() time.Time { return c.t }

func setup(t *testing.T) (*Watcher, *clock, *[]string, *bool) {
	t.Helper()
	c := &clock{t: time.Unix(1_800_000_000, 0)}
	sent := []string{}
	healthy := false
	w := New(t.TempDir(), "http://core:7420/", "junk", slog.New(slog.NewTextHandler(io.Discard, nil)))
	w.Now = c.now
	w.lostAt = c.now()
	w.Health = func(context.Context) bool { return healthy }
	w.Send = func(_ context.Context, token string, chat int64, text string) error {
		sent = append(sent, text)
		return nil
	}
	return w, c, &sent, &healthy
}

var cfg = &agentproto.Watch{Token: "123:abc", Chat: 42, After: 180, Down: "Ядро не отвечает {min} мин ({host})", Up: "Ядро снова на связи ({host})"}

func TestAlarmOnceAndAllClear(t *testing.T) {
	w, c, sent, _ := setup(t)
	ctx := context.Background()
	w.Tick(ctx) // no config: nothing
	w.Set(cfg)
	w.Connected()
	w.Disconnected()
	c.t = c.t.Add(2 * time.Minute)
	w.Tick(ctx)
	if len(*sent) != 0 {
		t.Fatal("two minutes is not long enough")
	}
	c.t = c.t.Add(2 * time.Minute)
	w.Tick(ctx)
	w.Tick(ctx)
	if len(*sent) != 1 || (*sent)[0] != "Ядро не отвечает 4 мин (junk)" {
		t.Fatalf("one alarm: %q", *sent)
	}
	w.Connected()
	w.Tick(ctx)
	if len(*sent) != 2 || (*sent)[1] != "Ядро снова на связи (junk)" {
		t.Fatalf("all clear: %q", *sent)
	}
}

func TestAnsweringCoreIsNotDown(t *testing.T) {
	w, c, sent, healthy := setup(t)
	w.Set(cfg)
	*healthy = true // the agent lost its link, but the core answers /api/health
	c.t = c.t.Add(10 * time.Minute)
	w.Tick(context.Background())
	if len(*sent) != 0 {
		t.Fatalf("the core answers: %q", *sent)
	}
}

func TestConfigSurvivesRestartAndCanBeTurnedOff(t *testing.T) {
	w, _, _, _ := setup(t)
	w.Set(cfg)
	path := filepath.Join(w.State, "watch.json")
	if st, err := os.Stat(path); err != nil || (st.Mode().Perm()&0o077 != 0 && os.PathSeparator == '/') {
		t.Fatalf("saved privately: %v", err)
	}
	again := New(w.State, w.Core, "junk", w.Log)
	if again.cfg == nil || again.cfg.Chat != 42 {
		t.Fatal("a restarted agent keeps watching, also while the core is down")
	}
	w.Set(nil)
	if _, err := os.Stat(path); err == nil {
		t.Fatal("turned off: the token is removed from the machine")
	}
}
