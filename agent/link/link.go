// Package link enrolls the agent with the core and keeps it connected.
package link

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	mrand "math/rand/v2"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"github.com/metraveer/gridlume/agent/collect"
	"github.com/metraveer/gridlume/agent/docker"
	"github.com/metraveer/gridlume/internal/agentproto"
)

// Interval is how often the agent sends a snapshot (a variable so tests can speed it up).
var Interval = 5 * time.Second

// Config is kept in <state>/agent.json, readable only by the agent's user.
type Config struct {
	Core    string `json:"core"` // e.g. http://192.168.1.10:7420
	AgentID string `json:"agentId"`
	Key     []byte `json:"key"` // Ed25519 seed
	Mode    string `json:"mode"`
}

func configPath(state string) string { return filepath.Join(state, "agent.json") }

// Load reads the config written by Enroll.
func Load(state string) (Config, error) {
	var c Config
	b, err := os.ReadFile(configPath(state))
	if err != nil {
		return c, err
	}
	if err := json.Unmarshal(b, &c); err != nil {
		return c, err
	}
	if c.AgentID == "" || len(c.Key) != ed25519.SeedSize {
		return c, errors.New("agent.json is incomplete: enroll again")
	}
	return c, nil
}

// Enroll trades the one-time code for an agent id and saves the key pair made here.
func Enroll(ctx context.Context, core, code, mode, state, version string) (Config, error) {
	core = strings.TrimRight(core, "/")
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return Config{}, err
	}
	body, _ := json.Marshal(agentproto.EnrollRequest{Code: code, PublicKey: pub, Info: collect.Info(version, mode)})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, core+"/api/agent/enroll", bytes.NewReader(body))
	if err != nil {
		return Config{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return Config{}, err
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(res.Body, 1<<16))
	if res.StatusCode != http.StatusCreated {
		return Config{}, fmt.Errorf("core answered %s: %s", res.Status, strings.TrimSpace(string(b)))
	}
	var out agentproto.EnrollResponse
	if err := json.Unmarshal(b, &out); err != nil {
		return Config{}, err
	}
	c := Config{Core: core, AgentID: out.AgentID, Key: priv.Seed(), Mode: mode}
	if err := os.MkdirAll(state, 0o700); err != nil {
		return c, err
	}
	data, _ := json.MarshalIndent(c, "", "  ")
	return c, os.WriteFile(configPath(state), data, 0o600)
}

// ErrUnlinked means the core no longer knows this agent (it was removed in the interface).
var ErrUnlinked = errors.New("the core does not know this agent: it was unlinked; install it again with a new code")

// Run stays connected until ctx ends, reconnecting with growing pauses (1 s up to 1 min).
func Run(ctx context.Context, c Config, version string, log *slog.Logger) error {
	backoff := time.Second
	for {
		start := time.Now()
		err := Once(ctx, c, version, log)
		if ctx.Err() != nil {
			return nil
		}
		wait := backoff
		if errors.Is(err, ErrUnlinked) {
			wait = 10 * time.Minute // nothing to gain by knocking often; a new install replaces this one
		}
		log.Warn("disconnected from the core", "err", err, "retry_in", wait.Round(time.Second))
		if time.Since(start) > time.Minute {
			backoff = time.Second // it was working: start over with short pauses
		} else {
			backoff = min(backoff*2, time.Minute)
		}
		// Jitter, so many agents do not all knock at once after the core restarts.
		wait += time.Duration(mrand.Int64N(int64(wait/4) + 1))
		select {
		case <-ctx.Done():
			return nil
		case <-time.After(wait):
		}
	}
}

func wsURL(core string) (string, error) {
	u, err := url.Parse(core)
	if err != nil {
		return "", err
	}
	switch u.Scheme {
	case "http":
		u.Scheme = "ws"
	case "https":
		u.Scheme = "wss"
	default:
		return "", fmt.Errorf("core address must start with http:// or https://: %q", core)
	}
	u.Path = strings.TrimRight(u.Path, "/") + "/api/agent/connect"
	return u.String(), nil
}

// Once runs one connection until it breaks or ctx ends; Run calls it again and again.
func Once(ctx context.Context, c Config, version string, log *slog.Logger) error {
	addr, err := wsURL(c.Core)
	if err != nil {
		return err
	}
	dctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	ws, _, err := websocket.Dial(dctx, addr, nil)
	cancel()
	if err != nil {
		return err
	}
	defer ws.CloseNow()

	hctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	var m agentproto.Message
	if err := wsjson.Read(hctx, ws, &m); err != nil {
		return err
	}
	if m.Type != "challenge" || len(m.Nonce) < 16 {
		return errors.New("expected a challenge from the core")
	}
	key := ed25519.NewKeyFromSeed(c.Key)
	info := collect.Info(version, c.Mode)
	hello := agentproto.Message{Type: "hello", AgentID: c.AgentID, Sig: ed25519.Sign(key, agentproto.SignedBytes(m.Nonce)), Info: &info}
	if err := wsjson.Write(hctx, ws, hello); err != nil {
		return err
	}
	if err := wsjson.Read(hctx, ws, &m); err != nil {
		return err
	}
	if m.Type == "error" && m.Error == "unknown_agent" {
		return ErrUnlinked
	}
	if m.Type != "welcome" {
		return fmt.Errorf("core refused: %s", m.Error)
	}
	log.Info("connected to the core", "core", c.Core)

	// Nothing comes from the core yet (commands arrive in a later stage), but reading is what
	// notices a closed connection and answers pings.
	sctx, stop := context.WithCancel(ctx)
	defer stop()
	readErr := make(chan error, 1)
	go func() {
		for {
			if _, _, err := ws.Read(sctx); err != nil {
				readErr <- err
				return
			}
		}
	}()

	col := collect.New()
	col.Snapshot() // prime the counters: rates need two readings
	socket := agentproto.DockerSocket(c.Mode)
	dk := docker.New(socket)
	t := time.NewTicker(Interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			_ = ws.Close(websocket.StatusNormalClosure, "agent stopping")
			return nil
		case err := <-readErr:
			return err
		case <-t.C:
			snap := col.Snapshot()
			dctx, dcancel := context.WithTimeout(ctx, Interval)
			snap.Docker, snap.DockerError = docker.Read(dctx, dk, socket)
			dcancel()
			wctx, cancel := context.WithTimeout(ctx, 10*time.Second)
			err := wsjson.Write(wctx, ws, agentproto.Message{Type: "snapshot", Snapshot: &snap})
			cancel()
			if err != nil {
				return err
			}
		}
	}
}
