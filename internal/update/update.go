// Package update installs a new release over an installed Gridlume and puts the old one back if the new
// one does not start.
//
// The core runs as its own user and cannot replace its own file. The button in the interface only leaves
// a request file in the data folder; systemd notices it (gridlume-update.path) and runs
// `gridlume update --from-request` as root, which downloads and checks the release itself. An admin can run
// `sudo gridlume update` by hand: the same code, the same checks.
package update

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	"github.com/metraveer/gridlume/internal/release"
	"github.com/metraveer/gridlume/internal/version"
)

// Paths are where an installed Gridlume lives (see deploy/install-core.sh).
type Paths struct {
	Bin       string // the core, e.g. /usr/local/bin/gridlume
	AgentBin  string // the local agent
	Data      string // /var/lib/gridlume
	Agents    string // agent builds the core hands out to install scripts
	CoreUser  string // the core's system user, for the database backup
	CoreUnit  string
	AgentUnit string
	Health    string // e.g. http://127.0.0.1:7420
}

// RequestFile is where the core leaves "please update" for the root service.
func RequestFile(data string) string { return filepath.Join(data, "update-request") }

// StatusFile is where the root service leaves the result for the core to show.
func StatusFile(data string) string { return filepath.Join(data, "update-status.json") }

// Request is what the core asks for.
type Request struct {
	Channel string `json:"channel"`
}

// Status is the outcome of the last update, shown in the interface.
type Status struct {
	State   string    `json:"state"` // running, done, rolled_back, failed, up_to_date, installed, interrupted
	From    string    `json:"from"`
	To      string    `json:"to"`
	Message string    `json:"message,omitempty"`
	At      time.Time `json:"at"`
}

// WriteRequest is called by the core (as its own user) when the owner presses "Update".
func WriteRequest(data, channel string) error {
	b, _ := json.Marshal(Request{Channel: channel})
	return os.WriteFile(RequestFile(data), b, 0o600)
}

// ReadStatus returns the last outcome; ok is false when there was none.
func ReadStatus(data string) (Status, bool) {
	var st Status
	b, err := os.ReadFile(StatusFile(data))
	if err != nil || json.Unmarshal(b, &st) != nil {
		return st, false
	}
	return st, true
}

// Updater does the work as root.
type Updater struct {
	Paths  Paths
	Client *release.Client
	Log    *slog.Logger
	// Run starts a program; tests replace it.
	Run func(ctx context.Context, name string, args ...string) error
	// Ready waits until the core answers with the wanted version.
	Ready func(ctx context.Context, health, version string) error
}

// New returns an updater with the real commands.
func New(p Paths, log *slog.Logger) *Updater {
	return &Updater{Paths: p, Client: release.Default(), Log: log, Run: run, Ready: ready}
}

func run(ctx context.Context, name string, args ...string) error {
	out, err := exec.CommandContext(ctx, name, args...).CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s %s: %w: %s", name, strings.Join(args, " "), err, strings.TrimSpace(string(out)))
	}
	return nil
}

func ready(ctx context.Context, health, want string) error {
	deadline := time.Now().Add(60 * time.Second)
	var last error
	for time.Now().Before(deadline) {
		res, err := http.Get(health + "/api/version")
		if err == nil {
			var v struct{ Version string }
			_ = json.NewDecoder(io.LimitReader(res.Body, 4096)).Decode(&v)
			res.Body.Close()
			if v.Version == want {
				return nil
			}
			last = fmt.Errorf("core answers version %q, want %q", v.Version, want)
		} else {
			last = err
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(time.Second):
		}
	}
	return fmt.Errorf("the new core did not come up: %w", last)
}

func (u *Updater) status(st Status) {
	st.At = time.Now().UTC()
	b, _ := json.MarshalIndent(st, "", "  ")
	_ = os.WriteFile(StatusFile(u.Paths.Data), b, 0o644)
}

// Check returns the newest release of the channel and whether it is newer than the running binary.
func (u *Updater) Check(ctx context.Context, channel string) (*release.Checked, bool, error) {
	r, err := u.Client.Latest(ctx, channel)
	if err != nil {
		return nil, false, err
	}
	return r, r.Build > version.BuildNumber() || (force(ctx) && r.Build != version.BuildNumber()), nil
}

type forceKey struct{}

// WithForce makes Apply install the channel's release even if it is not newer (switching to stable).
func WithForce(ctx context.Context) context.Context { return context.WithValue(ctx, forceKey{}, true) }

func force(ctx context.Context) bool { v, _ := ctx.Value(forceKey{}).(bool); return v }

// Apply installs the newest release of the channel. Order: download and verify everything, back up the
// database, swap the files (keeping the old ones), restart, wait for the new version; on failure put
// the old files and the database back and restart again.
func (u *Updater) Apply(ctx context.Context, channel string) (Status, error) {
	from := version.Version
	r, newer, err := u.Check(ctx, channel)
	if err != nil {
		st := Status{State: "failed", From: from, Message: err.Error()}
		u.status(st)
		return st, err
	}
	if !newer {
		st := Status{State: "up_to_date", From: from, To: r.Version}
		u.status(st)
		return st, nil
	}
	u.status(Status{State: "running", From: from, To: r.Version})
	u.Log.Info("updating", "from", from, "to", r.Version, "channel", channel)

	stage := filepath.Join(u.Paths.Data, "update-stage")
	_ = os.RemoveAll(stage)
	if err := os.MkdirAll(stage, 0o755); err != nil {
		return u.fail(from, r.Version, err)
	}
	defer os.RemoveAll(stage)
	arch := runtime.GOARCH
	names := []string{"gridlume-linux-" + arch, "gridlume-agent-linux-amd64", "gridlume-agent-linux-arm64"}
	for _, n := range names {
		if _, err := u.Client.Download(ctx, r, n, stage); err != nil {
			return u.fail(from, r.Version, err)
		}
	}

	backup := filepath.Join(u.Paths.Data, "backups", fmt.Sprintf("gridlume-%s-%s.db", safe(from), time.Now().UTC().Format("20060102-150405")))
	// The backup is made by the core's own user, so no file in its data folder ends up owned by root.
	if err := u.Run(ctx, "runuser", "-u", u.Paths.CoreUser, "--", u.Paths.Bin, "backup", "--to", backup); err != nil {
		return u.fail(from, r.Version, fmt.Errorf("database backup: %w", err))
	}
	PruneBackups(filepath.Dir(backup), KeepBackups, backup)

	if err := swap(filepath.Join(stage, "gridlume-linux-"+arch), u.Paths.Bin); err != nil {
		return u.fail(from, r.Version, err)
	}
	for _, a := range []string{"amd64", "arm64"} {
		n := "gridlume-agent-linux-" + a
		if err := copyFile(filepath.Join(stage, n), filepath.Join(u.Paths.Agents, n), 0o755); err != nil {
			u.Log.Warn("agent build not stored", "file", n, "err", err)
		}
	}
	err = u.Run(ctx, "systemctl", "restart", u.Paths.CoreUnit)
	if err == nil {
		err = u.Ready(ctx, u.Paths.Health, r.Version)
	}
	if err != nil {
		u.Log.Error("new version failed, rolling back", "err", err)
		return u.rollback(ctx, from, r.Version, backup, err)
	}
	// Only now are the new agent builds offered to agents on other machines: their updaters check the builds
	// against these signed files, so after a rollback (old files here) a newer build is never installed.
	if err := r.SaveSigned(u.Paths.Agents); err != nil {
		u.Log.Warn("signed files for agents not stored", "err", err)
	}
	// The local agent follows only once the core is known good.
	if _, statErr := os.Stat(u.Paths.AgentBin); statErr == nil {
		if err := swap(filepath.Join(stage, "gridlume-agent-linux-"+arch), u.Paths.AgentBin); err == nil {
			_ = u.Run(ctx, "systemctl", "try-restart", u.Paths.AgentUnit)
		}
	}
	st := Status{State: "done", From: from, To: r.Version}
	u.status(st)
	u.Log.Info("updated", "to", r.Version)
	return st, nil
}

// rollback puts the previous core and database back.
func (u *Updater) rollback(ctx context.Context, from, to, backup string, cause error) (Status, error) {
	_ = u.Run(ctx, "systemctl", "stop", u.Paths.CoreUnit)
	errs := []error{cause}
	if err := os.Rename(u.Paths.Bin+".prev", u.Paths.Bin); err != nil {
		errs = append(errs, fmt.Errorf("restore core: %w", err))
	}
	db := filepath.Join(u.Paths.Data, "gridlume.db")
	if err := copyFile(backup, db, 0o600); err != nil {
		errs = append(errs, fmt.Errorf("restore database: %w", err))
	} else {
		_ = os.Remove(db + "-wal")
		_ = os.Remove(db + "-shm")
		_ = u.Run(ctx, "chown", u.Paths.CoreUser+":", db)
	}
	if err := u.Run(ctx, "systemctl", "start", u.Paths.CoreUnit); err != nil {
		errs = append(errs, err)
	}
	st := Status{State: "rolled_back", From: from, To: to, Message: errors.Join(errs...).Error()}
	u.status(st)
	return st, errors.Join(errs...)
}

func (u *Updater) fail(from, to string, err error) (Status, error) {
	st := Status{State: "failed", From: from, To: to, Message: err.Error()}
	u.status(st)
	return st, err
}

// swap puts src at dst, keeping the old dst as dst.prev. The new file is copied next to dst first, so the
// final step is a rename on one filesystem: dst is never half-written.
func swap(src, dst string) error {
	tmp := dst + ".new"
	if err := copyFile(src, tmp, 0o755); err != nil {
		return err
	}
	if _, err := os.Stat(dst); err == nil {
		if err := copyFile(dst, dst+".prev", 0o755); err != nil {
			return err
		}
	}
	return os.Rename(tmp, dst)
}

func copyFile(src, dst string, mode os.FileMode) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

func safe(s string) string {
	return strings.Map(func(r rune) rune {
		if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '.' || r == '-' {
			return r
		}
		return '_'
	}, s)
}

// ChannelFile holds the chosen channel; the interface, the installer and `sudo gridlume update` all read
// and write this one file, so they always agree.
func ChannelFile(data string) string { return filepath.Join(data, "update-channel") }

// ReadChannel returns the chosen channel, or "" when none was chosen yet.
func ReadChannel(data string) string {
	b, err := os.ReadFile(ChannelFile(data))
	if err != nil {
		return ""
	}
	c := strings.TrimSpace(string(b))
	if !release.ValidChannel(c) {
		return ""
	}
	return c
}

// WriteChannel saves the chosen channel.
func WriteChannel(data, channel string) error {
	return os.WriteFile(ChannelFile(data), []byte(channel+"\n"), 0o644)
}

// MarkInstalled records that the installer put this version in place, so the interface does not keep
// showing the result of an older update.
func MarkInstalled(data, v string) error {
	b, _ := json.MarshalIndent(Status{State: "installed", To: v, At: time.Now().UTC()}, "", "  ")
	return os.WriteFile(StatusFile(data), b, 0o644)
}

// Stuck is how long "running" may last before it is treated as interrupted (power cut, killed service).
const Stuck = 15 * time.Minute

// Shown is the last outcome as the interface should show it for the version running now: a finished
// update or install of another version is history, not news; a "running" that never finished is reported
// as interrupted.
func Shown(st Status, current string, now time.Time) (Status, bool) {
	switch st.State {
	case "done", "installed":
		return st, st.To == current
	case "running":
		if now.Sub(st.At) > Stuck {
			st.State = "interrupted"
		}
		return st, true
	case "up_to_date":
		return st, false
	default: // failed, rolled_back: worth seeing for a day
		return st, now.Sub(st.At) < 24*time.Hour
	}
}

// KeepBackups is how many database copies made before updates are kept.
const KeepBackups = 5

// PruneBackups deletes all but the newest keep copies in dir; the copy in keepAlways (just made) stays.
func PruneBackups(dir string, keep int, keepAlways string) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	type file struct {
		path string
		mod  time.Time
	}
	var files []file
	for _, e := range entries {
		if e.IsDir() || !strings.HasPrefix(e.Name(), "gridlume-") || !strings.HasSuffix(e.Name(), ".db") {
			continue
		}
		if info, err := e.Info(); err == nil {
			files = append(files, file{filepath.Join(dir, e.Name()), info.ModTime()})
		}
	}
	sort.Slice(files, func(i, j int) bool { return files[i].mod.After(files[j].mod) })
	for i, f := range files {
		if i >= keep && f.path != keepAlways {
			_ = os.Remove(f.path)
		}
	}
}
