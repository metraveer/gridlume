// Package selfupdate installs a new agent build handed out by the core. It runs as root
// (gridlume-agent update --from-request, started by the gridlume-agent-update.path unit when the agent
// leaves a request), because the agent itself runs under its own user and cannot replace its file.
//
// It trusts nothing from the core but the files: SHA256SUMS must carry a valid signature of the release
// key built into this binary, and the build must match its signed checksum. After the swap it restarts
// the agent and waits for the new version to connect; if it does not, the old file comes back.
package selfupdate

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/metraveer/gridlume/agent/link"
	"github.com/metraveer/gridlume/internal/agentproto"
	"github.com/metraveer/gridlume/internal/release"
	"github.com/metraveer/gridlume/internal/version"
)

// Updater installs agent builds. Tests replace Run and the paths.
type Updater struct {
	State  string   // the agent's state folder: agent.json, the request, the status
	Bin    string   // the installed agent, e.g. /usr/local/bin/gridlume-agent
	Units  []string // restarted after the swap; the agent's own unit must restart
	Extra  []string // restarted too if installed (the read-only Docker proxy runs the same file)
	Client *release.Client
	Log    *slog.Logger
	Run    func(ctx context.Context, name string, args ...string) error
	Wait   time.Duration // how long the new version has to connect
}

// New returns an updater for the standard install (deploy/install.sh).
func New(state string, log *slog.Logger) *Updater {
	c := release.Default()
	return &Updater{
		State:  state,
		Bin:    "/usr/local/bin/gridlume-agent",
		Units:  []string{"gridlume-agent"},
		Extra:  []string{"gridlume-docker-ro"}, // only in the "readonly" mode
		Client: c,
		Log:    log,
		Run: func(ctx context.Context, name string, args ...string) error {
			out, err := exec.CommandContext(ctx, name, args...).CombinedOutput()
			if err != nil {
				return fmt.Errorf("%s %s: %w: %s", name, strings.Join(args, " "), err, strings.TrimSpace(string(out)))
			}
			return nil
		},
		Wait: time.Minute,
	}
}

// FromRequest handles a request the agent left; without one it does nothing (the path unit may fire twice).
func (u *Updater) FromRequest(ctx context.Context) error {
	req := filepath.Join(u.State, link.RequestFile)
	if _, err := os.Stat(req); err != nil {
		return nil
	}
	_ = os.Remove(req) // handled once, whatever happens next
	return u.Apply(ctx)
}

// Apply installs the build the core hands out if it is newer than this one.
func (u *Updater) Apply(ctx context.Context) error {
	from := version.Version
	cfg, err := link.Load(u.State)
	if err != nil {
		return u.done(agentproto.UpdateResult{State: "failed", From: from, Message: err.Error()}, err)
	}
	// The core serves the signed files of the release it was installed or updated from.
	core := strings.TrimRight(cfg.Core, "/")
	u.Client.Resolve = func(context.Context, *release.Client, string) (string, error) { return core + "/download", nil }
	r, err := u.Client.Latest(ctx, "")
	if err != nil {
		return u.done(agentproto.UpdateResult{State: "failed", From: from, Message: err.Error()}, err)
	}
	if r.Build <= version.BuildNumber() {
		return u.done(agentproto.UpdateResult{State: "up_to_date", From: from, To: r.Version}, nil)
	}
	u.Log.Info("updating the agent", "from", from, "to", r.Version)

	stage := filepath.Join(u.State, "update-stage")
	_ = os.RemoveAll(stage)
	if err := os.MkdirAll(stage, 0o700); err != nil {
		return u.fail(from, r.Version, err)
	}
	defer os.RemoveAll(stage)
	file, err := u.Client.Download(ctx, r, "gridlume-agent-linux-"+runtime.GOARCH, stage)
	if err != nil {
		return u.fail(from, r.Version, err)
	}
	if err := swap(file, u.Bin); err != nil {
		return u.fail(from, r.Version, err)
	}

	started := time.Now()
	err = u.restart(ctx)
	if err == nil {
		err = u.connected(ctx, r.Version, started)
	}
	if err != nil {
		u.Log.Error("the new agent did not connect, rolling back", "err", err)
		errs := []error{err}
		if rerr := os.Rename(u.Bin+".prev", u.Bin); rerr != nil {
			errs = append(errs, fmt.Errorf("restore the agent: %w", rerr))
		}
		if rerr := u.restart(ctx); rerr != nil {
			errs = append(errs, rerr)
		}
		err = errors.Join(errs...)
		return u.done(agentproto.UpdateResult{State: "rolled_back", From: from, To: r.Version, Message: err.Error()}, err)
	}
	u.Log.Info("agent updated", "to", r.Version)
	return u.done(agentproto.UpdateResult{State: "done", From: from, To: r.Version}, nil)
}

func (u *Updater) restart(ctx context.Context) error {
	// The proxy first, so the agent finds it ready. Its unit does not exist in the other modes, and
	// systemctl fails on a unit it does not know even with try-restart: that is not a reason to roll back.
	for _, unit := range u.Extra {
		if err := u.Run(ctx, "systemctl", "try-restart", unit); err != nil {
			u.Log.Info("not restarted (not installed in this mode?)", "unit", unit, "err", err)
		}
	}
	for _, unit := range u.Units {
		if err := u.Run(ctx, "systemctl", "try-restart", unit); err != nil {
			return err
		}
	}
	return nil
}

// connected waits until the agent says it got a welcome from the core as version v.
func (u *Updater) connected(ctx context.Context, v string, since time.Time) error {
	path := filepath.Join(u.State, link.ConnectedFile)
	deadline := time.Now().Add(u.Wait)
	for time.Now().Before(deadline) {
		if st, err := os.Stat(path); err == nil && !st.ModTime().Before(since.Add(-time.Second)) {
			if b, err := os.ReadFile(path); err == nil && strings.TrimSpace(string(b)) == v {
				return nil
			}
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(time.Second):
		}
	}
	return fmt.Errorf("version %s did not connect to the core within %s", v, u.Wait)
}

func (u *Updater) fail(from, to string, err error) error {
	return u.done(agentproto.UpdateResult{State: "failed", From: from, To: to, Message: err.Error()}, err)
}

// done records the result for the agent to report (readable by its user: the folder is the agent's).
func (u *Updater) done(r agentproto.UpdateResult, err error) error {
	r.At = time.Now().Unix()
	b, _ := json.Marshal(r)
	path := filepath.Join(u.State, link.StatusFile)
	if werr := os.WriteFile(path+".tmp", b, 0o644); werr == nil {
		_ = os.Rename(path+".tmp", path)
	}
	return err
}

// swap puts src at dst, keeping the old dst as dst.prev; the last step is a rename, so dst is never half-written.
func swap(src, dst string) error {
	if err := copyFile(src, dst+".new"); err != nil {
		return err
	}
	if _, err := os.Stat(dst); err == nil {
		if err := copyFile(dst, dst+".prev"); err != nil {
			return err
		}
	}
	return os.Rename(dst+".new", dst)
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}
