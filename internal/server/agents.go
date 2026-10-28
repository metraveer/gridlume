package server

import (
	"crypto/ed25519"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/metraveer/gridlume/deploy"
	"github.com/metraveer/gridlume/internal/agentlink"
	"github.com/metraveer/gridlume/internal/agentproto"
	"github.com/metraveer/gridlume/internal/store"
)

// EnrollCodeTTL is how long a "connect a machine" code works.
const EnrollCodeTTL = time.Hour

func (a *api) agentRoutes(mux *http.ServeMux) {
	// Called by agents and the install script, not by the browser: the code or the key is the proof.
	mux.HandleFunc("POST /api/agent/enroll", a.enroll)
	mux.HandleFunc("GET /api/agent/connect", a.hub.Connect)
	mux.HandleFunc("GET /install.sh", a.installScript)
	mux.HandleFunc("GET /download/{file}", a.download)

	mux.HandleFunc("POST /api/agents/codes", a.authed(a.createCode))
	mux.HandleFunc("GET /api/agents", a.authed(a.listAgents))
	mux.HandleFunc("DELETE /api/agents/{id}", a.authed(a.deleteAgent))
	mux.HandleFunc("GET /api/nodes/{id}/metrics", a.authed(a.metrics))
	mux.HandleFunc("GET /api/events", a.authed(a.events))

	mux.HandleFunc("GET /api/suggestions", a.authed(a.suggestions))
	mux.HandleFunc("POST /api/suggestions/{id}/accept", a.authed(a.acceptSuggestion))
	mux.HandleFunc("POST /api/suggestions/{id}/dismiss", a.authed(a.dismissSuggestion))
}

func (a *api) createCode(w http.ResponseWriter, r *http.Request) {
	var body struct {
		NodeID string `json:"nodeId"`
		Mode   string `json:"mode"`
	}
	if !decode(w, r, &body) {
		return
	}
	code := NewSetupCode()
	if err := a.store.CreateEnrollCode(r.Context(), code, body.NodeID, body.Mode, EnrollCodeTTL); err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"code": code, "expiresAt": time.Now().Add(EnrollCodeTTL).Unix()})
}

func (a *api) enroll(w http.ResponseWriter, r *http.Request) {
	if !a.limit.allow("enroll:" + clientIP(r)) {
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "too_many_attempts"})
		return
	}
	var req agentproto.EnrollRequest
	if !decode(w, r, &req) {
		return
	}
	ag, err := a.store.Enroll(r.Context(), req.Code, ed25519.PublicKey(req.PublicKey), req.Info)
	if errors.Is(err, store.ErrCodeInvalid) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "validation", "field": "code", "code": "invalid"})
		return
	}
	if err != nil {
		a.fail(w, err)
		return
	}
	a.log.Info("agent enrolled", "node", ag.NodeID, "host", ag.Hostname, "mode", ag.Mode)
	writeJSON(w, http.StatusCreated, agentproto.EnrollResponse{AgentID: ag.ID, NodeID: ag.NodeID})
}

// agentView is an agent plus its latest snapshot, for the first paint before events arrive.
type agentView struct {
	agentlink.Status
	Snapshot *agentproto.Snapshot `json:"snapshot"`
}

func (a *api) listAgents(w http.ResponseWriter, r *http.Request) {
	st, err := a.hub.Statuses(r.Context())
	if err != nil {
		a.fail(w, err)
		return
	}
	snaps := a.hub.Snapshots()
	out := make([]agentView, len(st))
	for i, s := range st {
		out[i] = agentView{Status: s}
		if snap, ok := snaps[s.NodeID]; ok {
			out[i].Snapshot = &snap
		}
	}
	writeJSON(w, http.StatusOK, out)
}

func (a *api) deleteAgent(w http.ResponseWriter, r *http.Request) {
	ag, err := a.store.GetAgent(r.Context(), r.PathValue("id"))
	if err != nil {
		a.fail(w, err)
		return
	}
	if err := a.store.DeleteAgent(r.Context(), ag.ID); err != nil {
		a.fail(w, err)
		return
	}
	a.hub.Unlinked(ag.ID, ag.NodeID)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *api) suggestions(w http.ResponseWriter, r *http.Request) {
	out, err := a.store.Suggestions(r.Context())
	if err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// acceptSuggestion makes the link; the interface sends the explanation in the user's language.
func (a *api) acceptSuggestion(w http.ResponseWriter, r *http.Request) {
	var body struct {
		About    string `json:"about"`
		IfBroken string `json:"ifBroken"`
	}
	if !decode(w, r, &body) {
		return
	}
	l, err := a.store.AcceptSuggestion(r.Context(), r.PathValue("id"), body.About, body.IfBroken)
	if err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, l)
}

func (a *api) dismissSuggestion(w http.ResponseWriter, r *http.Request) {
	if err := a.store.DismissSuggestion(r.Context(), r.PathValue("id")); err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// Ranges the interface can ask for, and the bucket size that keeps a chart at a few hundred points.
var ranges = map[string]struct {
	span time.Duration
	step int64
}{
	"1h":  {time.Hour, 60},
	"24h": {24 * time.Hour, 300},
	"14d": {store.MetricsRetention, 3600},
}

var seriesName = regexp.MustCompile(`^[a-z0-9]{1,16}$`)

func (a *api) metrics(w http.ResponseWriter, r *http.Request) {
	rg, ok := ranges[r.URL.Query().Get("range")]
	if !ok {
		rg = ranges["1h"]
	}
	var series []string
	for _, s := range strings.Split(r.URL.Query().Get("series"), ",") {
		if seriesName.MatchString(s) && len(series) < 10 {
			series = append(series, s)
		}
	}
	out, err := a.store.Metrics(r.Context(), r.PathValue("id"), series, time.Now().Add(-rg.span), rg.step)
	if err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"step": rg.step, "series": out})
}

// events streams agent states and snapshots to the interface (Server-Sent Events).
func (a *api) events(w http.ResponseWriter, r *http.Request) {
	rc := http.NewResponseController(w)
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-store")
	h.Set("X-Accel-Buffering", "no") // nginx in front must not hold the stream back
	w.WriteHeader(http.StatusOK)
	if err := rc.Flush(); err != nil {
		return
	}
	ch, stop := a.hub.Subscribe()
	defer stop()
	keep := time.NewTicker(25 * time.Second) // proxies close silent connections
	defer keep.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-keep.C:
			_, _ = w.Write([]byte(": keep-alive\n\n"))
		case e := <-ch:
			b, _ := json.Marshal(e)
			_, _ = w.Write([]byte("data: "))
			_, _ = w.Write(b)
			_, _ = w.Write([]byte("\n\n"))
		}
		if err := rc.Flush(); err != nil {
			return
		}
	}
}

// installScript serves deploy/install.sh with this core's address filled in,
// so the script downloads the agent from the same place the user fetched the script from.
func (a *api) installScript(w http.ResponseWriter, r *http.Request) {
	scheme := "http"
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	core := scheme + "://" + r.Host
	w.Header().Set("Content-Type", "text/x-shellscript; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	// A Windows checkout may have turned line ends into CRLF, which breaks sh.
	script := strings.ReplaceAll(deploy.InstallScript, "\r\n", "\n")
	_, _ = w.Write([]byte(strings.ReplaceAll(script, "__GRIDLUME_CORE__", core)))
}

var agentFile = regexp.MustCompile(`^gridlume-agent-linux-(amd64|arm64)$`)

// download serves agent builds from the agents folder (filled by `gridlume dev` or the release package).
func (a *api) download(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("file")
	if !agentFile.MatchString(name) || a.agentsDir == "" {
		http.NotFound(w, r)
		return
	}
	path := filepath.Join(a.agentsDir, name)
	if _, err := os.Stat(path); err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	http.ServeFile(w, r, path)
}
