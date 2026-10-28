package server

import (
	"context"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/metraveer/gridlume/internal/release"
	"github.com/metraveer/gridlume/internal/store"
	upd "github.com/metraveer/gridlume/internal/update"
	"github.com/metraveer/gridlume/internal/version"
)

// CheckEvery is how often the core looks for a new release.
const CheckEvery = 6 * time.Hour

// PendingTooLong: a request the root update service has not picked up by then means the service is off.
const PendingTooLong = 2 * time.Minute

// channelInfo is what the core last learned about one channel.
type channelInfo struct {
	Latest  *release.Manifest `json:"latest"`
	Problem string            `json:"problem,omitempty"` // none, limit, signature, network, other (release.Problem)
	Error   string            `json:"error,omitempty"`   // the raw error, for the curious and for bug reports
	Newer   bool              `json:"newer"`             // newer than what runs now
}

// updates remembers the last look at GitHub, for both channels: the interface shows what the other one
// has too, so "nothing new" on stable does not hide a fresh build on edge.
type updates struct {
	mu        sync.Mutex
	channels  map[string]channelInfo
	checkedAt time.Time
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

// channel is the chosen update channel. One source: the channel file in the data folder, shared with the
// installer and `sudo gridlume update`. Older installs kept it in the database; that is the fallback, then
// the channel the running build came from.
func (a *api) channel(ctx context.Context) string {
	if c := upd.ReadChannel(a.dataDir); c != "" {
		return c
	}
	if c, _ := a.store.Setting(ctx, store.SettingUpdateChannel, ""); release.ValidChannel(c) {
		return c
	}
	if version.Channel == release.Edge {
		return release.Edge
	}
	return release.Stable
}

// check looks at both channels; with auto updates on and something newer in the chosen one, it asks for
// the update.
func (a *api) check(ctx context.Context) {
	found := map[string]channelInfo{}
	for _, ch := range []string{release.Stable, release.Edge} {
		r, err := a.upd.client.Latest(ctx, ch)
		info := channelInfo{Problem: release.Problem(err)}
		if err != nil {
			info.Error = err.Error()
		} else {
			info.Latest = &r.Manifest
			info.Newer = r.Build > version.BuildNumber()
		}
		found[ch] = info
	}
	a.upd.mu.Lock()
	a.upd.channels = found
	a.upd.checkedAt = time.Now()
	a.upd.mu.Unlock()

	ch := a.channel(ctx)
	auto, _ := a.store.Setting(ctx, store.SettingUpdateAuto, "0")
	if auto == "1" && a.updatesEnabled && found[ch].Newer {
		if err := upd.WriteRequest(a.dataDir, ch); err != nil {
			a.log.Error("automatic update request", "err", err)
		} else {
			a.log.Info("automatic update requested", "to", found[ch].Latest.Version)
		}
	}
}

// checkForUpdates runs check now and then every CheckEvery until ctx ends. Development builds do not check.
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
	agentAuto, _ := a.store.Setting(ctx, store.SettingAgentUpdateAuto, "1")
	coreNode, _ := a.store.Setting(ctx, store.SettingCoreNode, "")
	a.upd.mu.Lock()
	channels, checkedAt := a.upd.channels, a.upd.checkedAt
	a.upd.mu.Unlock()
	if channels == nil {
		channels = map[string]channelInfo{}
	}
	ch := a.channel(ctx)
	selected := channels[ch]
	out := map[string]any{
		"version":   version.Version,
		"build":     version.BuildNumber(),
		"commit":    version.Commit,
		"built":     version.Channel, // the channel this binary came from; "" for development builds
		"channel":   ch,
		"auto":      auto == "1",
		"canUpdate": a.updatesEnabled, // installed by install-core.sh: the root update service exists
		"coreNode":  coreNode,
		"channels":  channels,
		"agentAuto": agentAuto == "1",
		// For the chosen channel, the same as channels[channel]:
		"latest":     selected.Latest,
		"newer":      selected.Newer,
		"checkError": selected.Error,
		// Running something newer than the chosen channel offers (an edge build while on stable): nothing to
		// do until that channel catches up; going back to an older version is not offered (its database
		// may not understand the newer one).
		"ahead": selected.Latest != nil && version.BuildNumber() > selected.Latest.Build,
	}
	if !checkedAt.IsZero() {
		out["checkedAt"] = checkedAt.UTC()
	}
	// The agent build this core hands out; agents with an older one can be updated.
	if rel, ok := a.agentRelease(); ok {
		out["agents"] = map[string]any{"version": rel.Version, "build": rel.Build}
	}
	if st, err := os.Stat(upd.RequestFile(a.dataDir)); err == nil {
		out["pending"] = true
		out["pendingStuck"] = time.Since(st.ModTime()) > PendingTooLong
	} else {
		out["pending"] = false
	}
	if st, ok := upd.ReadStatus(a.dataDir); ok {
		if shown, ok := upd.Shown(st, version.Version, time.Now()); ok {
			out["last"] = shown
		}
	}
	writeJSON(w, http.StatusOK, out)
}

func (a *api) saveSystemSettings(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Channel   string `json:"channel"`
		Auto      bool   `json:"auto"`
		AgentAuto *bool  `json:"agentAuto"` // left out: unchanged
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
	if a.dataDir != "" {
		if err := upd.WriteChannel(a.dataDir, body.Channel); err != nil {
			a.fail(w, err)
			return
		}
	}
	// Kept in the database too, for installs that started before the channel file existed.
	if err := a.store.SetSetting(ctx, store.SettingUpdateChannel, body.Channel); err != nil {
		a.fail(w, err)
		return
	}
	if err := a.store.SetSetting(ctx, store.SettingUpdateAuto, auto); err != nil {
		a.fail(w, err)
		return
	}
	if body.AgentAuto != nil {
		v := "0"
		if *body.AgentAuto {
			v = "1"
		}
		if err := a.store.SetSetting(ctx, store.SettingAgentUpdateAuto, v); err != nil {
			a.fail(w, err)
			return
		}
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
