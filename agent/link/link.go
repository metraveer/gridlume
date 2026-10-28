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
	buildinfo "github.com/metraveer/gridlume/internal/version"
)

// Interval is how often the agent sends a snapshot (a variable so tests can speed it up).
var Interval = 5 * time.Second

// Config is kept in <state>/agent.json, readable only by the agent's user.
type Config struct {
	Core    string `json:"core"` // e.g. http://192.168.1.10:7420
	AgentID string `json:"agentId"`
	Key     []byte `json:"key"` // Ed25519 seed
	Mode    string `json:"mode"`
	State   string `json:"-"` // the folder it was loaded from
}

func configPath(state string) string { return filepath.Join(state, "agent.json") }

// Files in the state folder shared with the root updater (agent/selfupdate).
const (
	RequestFile   = "update-request"     // written by the agent when the core asks for an update
	StatusFile    = "update-status.json" // written by the updater: how the last update went
	ConnectedFile = "connected"          // the version that last got a welcome from the core
)

// UpdaterUnit exists when the root updater is installed (deploy/install.sh); a variable for tests.
var UpdaterUnit = "/etc/systemd/system/gridlume-agent-update.path"

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
	c.State = state
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
	c := Config{Core: core, AgentID: out.AgentID, Key: priv.Seed(), Mode: mode, State: state}
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
	info.Build = buildinfo.BuildNumber()
	_, err = os.Stat(UpdaterUnit)
	info.Updater = err == nil && c.State != ""
	info.Update = lastUpdate(c.State)
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
	// The updater waits for this to know the new version works.
	writeState(c.State, ConnectedFile, []byte(version))

	// Reading also notices a closed connection and answers pings.
	sctx, stop := context.WithCancel(ctx)
	defer stop()
	readErr := make(chan error, 1)
	go func() {
		for {
			var m agentproto.Message
			if err := wsjson.Read(sctx, ws, &m); err != nil {
				readErr <- err
				return
			}
			if m.Type == "update" && info.Updater {
				// The agent cannot replace its own file; the root updater picks this up (a systemd path unit).
				log.Info("update requested by the core", "version", m.Version)
				writeState(c.State, RequestFile, []byte(m.Version))
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

// writeState puts a small file into the state folder in one step, so a reader never sees half of it.
func writeState(state, name string, data []byte) {
	if state == "" {
		return
	}
	tmp := filepath.Join(state, name+".tmp")
	if os.WriteFile(tmp, data, 0o600) == nil {
		_ = os.Rename(tmp, filepath.Join(state, name))
	}
}

// lastUpdate reads what the updater wrote about its last run.
func lastUpdate(state string) *agentproto.UpdateResult {
	if state == "" {
		return nil
	}
	b, err := os.ReadFile(filepath.Join(state, StatusFile))
	if err != nil {
		return nil
	}
	var r agentproto.UpdateResult
	if json.Unmarshal(b, &r) != nil || r.State == "" {
		return nil
	}
	return &r
}
