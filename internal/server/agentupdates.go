package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"

	"github.com/metraveer/gridlume/internal/agentlink"
	"github.com/metraveer/gridlume/internal/agentproto"
	"github.com/metraveer/gridlume/internal/release"
	"github.com/metraveer/gridlume/internal/store"
)

// agentRelease is the agent build this core hands out: release.json stored with the builds by the
// installer and by every update. Development cores build agents themselves and have none, so they
// never offer updates.
func (a *api) agentRelease() (release.Manifest, bool) {
	var m release.Manifest
	if a.agentsDir == "" {
		return m, false
	}
	b, err := os.ReadFile(filepath.Join(a.agentsDir, "release.json"))
	if err != nil || json.Unmarshal(b, &m) != nil || m.Build == 0 {
		return m, false
	}
	return m, true
}

// agentNeedsUpdate: the agent can update itself and this core has a newer build for it.
func (a *api) agentNeedsUpdate(info agentproto.Info) (string, bool) {
	rel, ok := a.agentRelease()
	if !ok || !info.Updater || rel.Build <= info.Build {
		return "", false
	}
	return rel.Version, true
}

// autoAgentUpdate is asked by the hub on every connection. After a failed attempt at the same version
// it waits for a person to press the button, so a broken build is not retried in a loop.
func (a *api) autoAgentUpdate(ctx context.Context, info agentproto.Info) string {
	if on, _ := a.store.Setting(ctx, store.SettingAgentUpdateAuto, "1"); on != "1" {
		return ""
	}
	v, ok := a.agentNeedsUpdate(info)
	if !ok {
		return ""
	}
	if u := info.Update; u != nil && u.To == v && (u.State == "failed" || u.State == "rolled_back") {
		return ""
	}
	return v
}

// updateAgent is the "Update agent" button.
func (a *api) updateAgent(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	st, err := a.hub.Statuses(r.Context())
	if err != nil {
		a.fail(w, err)
		return
	}
	for _, s := range st {
		if s.ID != id {
			continue
		}
		v, ok := a.agentNeedsUpdate(agentproto.Info{Build: s.Build, Updater: s.CanUpdate})
		if !s.Online || !ok {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "nothing_to_update"})
			return
		}
		err := a.hub.RequestUpdate(r.Context(), id, v)
		switch {
		case errors.Is(err, agentlink.ErrOffline), errors.Is(err, agentlink.ErrNoUpdater):
			writeJSON(w, http.StatusConflict, map[string]string{"error": "nothing_to_update"})
		case err != nil:
			a.fail(w, err)
		default:
			writeJSON(w, http.StatusAccepted, map[string]string{"version": v})
		}
		return
	}
	writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found"})
}
