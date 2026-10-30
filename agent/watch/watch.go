// Package watch is the agent keeping an eye on the core. When the core stops answering for a while,
// the agent writes to the owner's Telegram itself, and again when the core is back: the core cannot
// raise an alarm about its own death.
//
// The agent knows the core is gone when its connection is down and the core's /api/health does not
// answer either (a dropped connection alone may be the agent's own network; that is not the core).
package watch

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/metraveer/gridlume/internal/agentproto"
	"github.com/metraveer/gridlume/internal/tg"
)

// Every is how often the watcher looks.
var Every = 20 * time.Second

const file = "watch.json"

// Watcher follows the agent's connection to the core.
type Watcher struct {
	State string // the agent's state folder: the config survives restarts, also while the core is down
	Core  string // e.g. http://192.168.1.63:7420
	Host  string // this machine, for the message
	Log   *slog.Logger
	Now   func() time.Time
	// Health asks the core directly; Send writes to Telegram. Tests replace both.
	Health func(ctx context.Context) bool
	Send   func(ctx context.Context, token string, chat int64, text string) error

	mu        sync.Mutex
	cfg       *agentproto.Watch
	connected bool
	lostAt    time.Time // when the connection went (or the agent started without one)
	alerted   bool      // "down" was sent; "up" is owed
}

func New(state, core, host string, log *slog.Logger) *Watcher {
	w := &Watcher{State: state, Core: strings.TrimRight(core, "/"), Host: host, Log: log, Now: time.Now}
	client := &http.Client{Timeout: 10 * time.Second}
	w.Health = func(ctx context.Context) bool {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, w.Core+"/api/health", nil)
		if err != nil {
			return false
		}
		res, err := client.Do(req)
		if err != nil {
			return false
		}
		res.Body.Close()
		return res.StatusCode == http.StatusOK
	}
	t := tg.New()
	w.Send = t.Send
	w.lostAt = w.Now()
	if b, err := os.ReadFile(filepath.Join(state, file)); err == nil {
		var c agentproto.Watch
		if json.Unmarshal(b, &c) == nil && c.Token != "" {
			w.cfg = &c
		}
	}
	return w
}

// Set takes the config from the core: nil turns watching off and forgets the token.
func (w *Watcher) Set(c *agentproto.Watch) {
	w.mu.Lock()
	defer w.mu.Unlock()
	path := filepath.Join(w.State, file)
	if c == nil || c.Token == "" {
		w.cfg = nil
		_ = os.Remove(path)
		return
	}
	w.cfg = c
	b, _ := json.Marshal(c)
	if os.WriteFile(path+".tmp", b, 0o600) == nil {
		_ = os.Rename(path+".tmp", path)
	}
}

// Connected and Disconnected follow the connection to the core.
func (w *Watcher) Connected() {
	w.mu.Lock()
	w.connected = true
	w.mu.Unlock()
}

func (w *Watcher) Disconnected() {
	w.mu.Lock()
	if w.connected {
		w.connected = false
		w.lostAt = w.Now()
	}
	w.mu.Unlock()
}

// Run looks every Every until ctx ends.
func (w *Watcher) Run(ctx context.Context) {
	t := time.NewTicker(Every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			w.Tick(ctx)
		}
	}
}

// Tick looks once: alarm when the core has been away long enough, all clear when it is back.
func (w *Watcher) Tick(ctx context.Context) {
	w.mu.Lock()
	cfg, connected, lostAt, alerted := w.cfg, w.connected, w.lostAt, w.alerted
	w.mu.Unlock()
	if cfg == nil {
		return
	}
	if connected {
		if alerted && w.say(ctx, cfg, cfg.Up, 0) {
			w.mu.Lock()
			w.alerted = false
			w.mu.Unlock()
		}
		return
	}
	away := w.Now().Sub(lostAt)
	if alerted || away < time.Duration(cfg.After)*time.Second {
		return
	}
	if w.Health(ctx) {
		return // the core answers: it is this agent's link that is broken, not the core
	}
	if w.say(ctx, cfg, cfg.Down, int(away.Minutes())) {
		w.mu.Lock()
		w.alerted = true
		w.mu.Unlock()
	}
}

func (w *Watcher) say(ctx context.Context, cfg *agentproto.Watch, text string, min int) bool {
	text = strings.NewReplacer("{min}", strconv.Itoa(max(min, 1)), "{host}", w.Host).Replace(text)
	if err := w.Send(ctx, cfg.Token, cfg.Chat, text); err != nil {
		w.Log.Warn("watch: could not reach Telegram", "err", err)
		return false // tried again at the next look
	}
	w.Log.Info("watch: told Telegram", "text", text)
	return true
}
