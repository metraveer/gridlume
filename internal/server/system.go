package server

import (
	"context"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/metraveer/gridlume/internal/release"
	"github.com/metraveer/gridlume/internal/store"
	upd "github.com/metraveer/gridlume/internal/update"
	"github.com/metraveer/gridlume/internal/version"
)

// CheckEvery is how often the core looks for a new release.
const CheckEvery = 6 * time.Hour

// ChannelFile mirrors the chosen channel for `sudo gridlume update`, which runs as root and does not
// open the core's database.
func ChannelFile(data string) string { return filepath.Join(data, "update-channel") }

// updates remembers the last look at GitHub.
type updates struct {
	mu        sync.Mutex
	latest    *release.Manifest
	checkedAt time.Time
	err       string
	client    *release.Client
}

func (a *api) systemRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/system", a.authed(a.system))
	mux.HandleFunc("PUT /api/system/settings", a.authed(a.ownerOnly(a.saveSystemSettings)))
	mux.HandleFunc("POST /api/system/check", a.authed(a.ownerOnly(a.checkNow)))
	mux.HandleFunc("POST /api/system/update", a.authed(a.ownerOnly(a.startUpdate)))
}

// ownerOnly: updates and their settings change the whole installation.
func (a *api) ownerOnly(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if u, ok := userFrom(r.Context()); !ok || u.Role != "owner" {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
			return
		}
		next(w, r)
	}
}

func (a *api) channel(ctx context.Context) string {
	def := release.Stable
	if version.Channel == release.Edge {
		def = release.Edge
	}
	c, _ := a.store.Setting(ctx, store.SettingUpdateChannel, def)
	if !release.ValidChannel(c) {
		c = def
	}
	return c
}

// check looks at the chosen channel; with auto updates on and something newer, it asks for the update.
func (a *api) check(ctx context.Context) {
	ch := a.channel(ctx)
	r, err := a.upd.client.Latest(ctx, ch)
	a.upd.mu.Lock()
	a.upd.checkedAt = time.Now()
	if err != nil {
		a.upd.err = err.Error()
		a.upd.mu.Unlock()
		return
	}
	a.upd.err = ""
	a.upd.latest = &r.Manifest
	a.upd.mu.Unlock()
	auto, _ := a.store.Setting(ctx, store.SettingUpdateAuto, "0")
	if auto == "1" && a.updatesEnabled && r.Build > version.BuildNumber() {
		if err := upd.WriteRequest(a.dataDir, ch); err != nil {
			a.log.Error("automatic update request", "err", err)
		} else {
			a.log.Info("automatic update requested", "to", r.Version)
		}
	}
}

// CheckForUpdates runs check now and then every CheckEvery until ctx ends. Development builds do not check.
func (a *api) checkForUpdates(ctx context.Context) {
	if version.BuildNumber() == 0 {
		return
	}
	for {
		a.check(ctx)
		select {
		case <-ctx.Done():
			return
		case <-time.After(CheckEvery):
		}
	}
}

func (a *api) system(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	auto, _ := a.store.Setting(ctx, store.SettingUpdateAuto, "0")
	coreNode, _ := a.store.Setting(ctx, store.SettingCoreNode, "")
	a.upd.mu.Lock()
	latest, checkedAt, checkErr := a.upd.latest, a.upd.checkedAt, a.upd.err
	a.upd.mu.Unlock()
	out := map[string]any{
		"version":    version.Version,
		"build":      version.BuildNumber(),
		"commit":     version.Commit,
		"channel":    a.channel(ctx),
		"auto":       auto == "1",
		"canUpdate":  a.updatesEnabled, // installed by install-core.sh: the root update service exists
		"coreNode":   coreNode,
		"latest":     latest,
		"newer":      latest != nil && latest.Build > version.BuildNumber(),
		"checkError": checkErr,
		"pending":    fileExists(upd.RequestFile(a.dataDir)),
	}
	if !checkedAt.IsZero() {
		out["checkedAt"] = checkedAt.UTC()
	}
	if st, ok := upd.ReadStatus(a.dataDir); ok {
		out["last"] = st
	}
	writeJSON(w, http.StatusOK, out)
}

func (a *api) saveSystemSettings(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Channel string `json:"channel"`
		Auto    bool   `json:"auto"`
	}
	if !decode(w, r, &body) {
		return
	}
	if !release.ValidChannel(body.Channel) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "validation", "field": "channel", "code": "invalid"})
		return
	}
	auto := "0"
	if body.Auto {
		auto = "1"
	}
	ctx := r.Context()
	if err := a.store.SetSetting(ctx, store.SettingUpdateChannel, body.Channel); err != nil {
		a.fail(w, err)
		return
	}
	if err := a.store.SetSetting(ctx, store.SettingUpdateAuto, auto); err != nil {
		a.fail(w, err)
		return
	}
	if a.dataDir != "" {
		_ = os.WriteFile(ChannelFile(a.dataDir), []byte(body.Channel+"\n"), 0o644)
	}
	a.upd.mu.Lock()
	a.upd.latest = nil // the other channel may have another release
	a.upd.mu.Unlock()
	if version.BuildNumber() > 0 { // development builds (and tests) do not reach out to GitHub on their own
		go a.check(context.WithoutCancel(ctx))
	}
	a.system(w, r)
}

func (a *api) checkNow(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	a.check(ctx)
	a.system(w, r)
}

func (a *api) startUpdate(w http.ResponseWriter, r *http.Request) {
	if !a.updatesEnabled {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "not_installed"})
		return
	}
	if err := upd.WriteRequest(a.dataDir, a.channel(r.Context())); err != nil {
		a.fail(w, err)
		return
	}
	a.log.Info("update requested from the interface")
	a.system(w, r)
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
