package server

import (
	"crypto/rand"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/metraveer/gridlume/internal/agentlink"
	"github.com/metraveer/gridlume/internal/release"
	"github.com/metraveer/gridlume/internal/store"
)

type api struct {
	store     *store.Store
	hub       *agentlink.Hub
	agentsDir string
	gate      *setupGate
	setupDone func()

	dataDir        string
	updatesEnabled bool
	upd            *updates
	limit          *limiter
	log            *slog.Logger
}

func newAPI(opts Options, log *slog.Logger) *api {
	hub := opts.Hub
	if hub == nil {
		hub = agentlink.New(opts.Store, log)
	}
	a := &api{store: opts.Store, hub: hub, agentsDir: opts.AgentsDir, gate: &setupGate{code: opts.SetupCode}, setupDone: opts.SetupDone,
		limit: newLimiter(10, time.Minute), log: log,
		dataDir: opts.DataDir, updatesEnabled: opts.UpdatesEnabled, upd: &updates{client: release.Default()}}
	if opts.Context != nil {
		go a.checkForUpdates(opts.Context)
	}
	return a
}

// NewSetupCode returns a one-time code like "K7QM-2R9X" for creating the owner account.
// The alphabet has no look-alike characters (0/O, 1/I/L).
func NewSetupCode() string {
	const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	out := make([]byte, 0, 9)
	for i, c := range b {
		if i == 4 {
			out = append(out, '-')
		}
		out = append(out, alphabet[int(c)%len(alphabet)])
	}
	return string(out)
}

func (a *api) routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/session", a.sessionInfo)
	mux.HandleFunc("POST /api/setup", csrf(a.setup))
	mux.HandleFunc("POST /api/login", csrf(a.login))
	mux.HandleFunc("POST /api/logout", csrf(a.logout))
	// Viewers may change their own password too: authed would refuse their writes, so check the session here.
	mux.HandleFunc("POST /api/account/password", csrf(a.sessionOnly(a.changePassword)))

	mux.HandleFunc("GET /api/map", a.authed(a.getMap))
	mux.HandleFunc("PUT /api/layout", a.authed(a.saveLayout))

	mux.HandleFunc("POST /api/places", a.authed(a.createPlace))
	mux.HandleFunc("PATCH /api/places/{id}", a.authed(a.updatePlace))
	mux.HandleFunc("DELETE /api/places/{id}", a.authed(a.deletePlace))

	mux.HandleFunc("POST /api/nodes", a.authed(a.createNode))
	mux.HandleFunc("PATCH /api/nodes/{id}", a.authed(a.updateNode))
	mux.HandleFunc("DELETE /api/nodes/{id}", a.authed(a.deleteNode))

	mux.HandleFunc("POST /api/links", a.authed(a.createLink))
	mux.HandleFunc("PATCH /api/links/{id}", a.authed(a.updateLink))
	mux.HandleFunc("DELETE /api/links/{id}", a.authed(a.deleteLink))

	a.agentRoutes(mux)
	a.systemRoutes(mux)
}

// fail turns store errors into answers the interface can translate.
func (a *api) fail(w http.ResponseWriter, err error) {
	var ve *store.ValidationError
	switch {
	case errors.As(err, &ve):
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "validation", "field": ve.Field, "code": ve.Code})
	case errors.Is(err, store.ErrNotFound):
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found"})
	default:
		a.log.Error("request failed", "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal"})
	}
}

func (a *api) getMap(w http.ResponseWriter, r *http.Request) {
	m, err := a.store.GetMap(r.Context())
	if err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, m)
}

func (a *api) saveLayout(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Nodes  []store.Position `json:"nodes"`
		Places []store.Place    `json:"places"`
	}
	if !decode(w, r, &body) {
		return
	}
	if err := a.store.SaveLayout(r.Context(), body.Nodes, body.Places); err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// crud wires the three write handlers for one kind of object.
func create[T any](a *api, fn func(*http.Request, T) (any, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var v T
		if !decode(w, r, &v) {
			return
		}
		out, err := fn(r, v)
		if err != nil {
			a.fail(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, out)
	}
}

func update[P any](a *api, fn func(*http.Request, string, P) (any, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var p P
		if !decode(w, r, &p) {
			return
		}
		out, err := fn(r, r.PathValue("id"), p)
		if err != nil {
			a.fail(w, err)
			return
		}
		writeJSON(w, http.StatusOK, out)
	}
}

func remove(a *api, fn func(*http.Request, string) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := fn(r, r.PathValue("id")); err != nil {
			a.fail(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	}
}

func (a *api) createPlace(w http.ResponseWriter, r *http.Request) {
	create(a, func(r *http.Request, p store.Place) (any, error) { return a.store.CreatePlace(r.Context(), p) })(w, r)
}

func (a *api) updatePlace(w http.ResponseWriter, r *http.Request) {
	update(a, func(r *http.Request, id string, p store.PlacePatch) (any, error) {
		return a.store.UpdatePlace(r.Context(), id, p)
	})(w, r)
}

func (a *api) deletePlace(w http.ResponseWriter, r *http.Request) {
	remove(a, func(r *http.Request, id string) error { return a.store.DeletePlace(r.Context(), id) })(w, r)
}

func (a *api) createNode(w http.ResponseWriter, r *http.Request) {
	create(a, func(r *http.Request, n store.Node) (any, error) { return a.store.CreateNode(r.Context(), n) })(w, r)
}

func (a *api) updateNode(w http.ResponseWriter, r *http.Request) {
	update(a, func(r *http.Request, id string, p store.NodePatch) (any, error) {
		return a.store.UpdateNode(r.Context(), id, p)
	})(w, r)
}

func (a *api) deleteNode(w http.ResponseWriter, r *http.Request) {
	remove(a, func(r *http.Request, id string) error { return a.store.DeleteNode(r.Context(), id) })(w, r)
}

func (a *api) createLink(w http.ResponseWriter, r *http.Request) {
	create(a, func(r *http.Request, l store.Link) (any, error) { return a.store.CreateLink(r.Context(), l) })(w, r)
}

func (a *api) updateLink(w http.ResponseWriter, r *http.Request) {
	update(a, func(r *http.Request, id string, p store.LinkPatch) (any, error) {
		return a.store.UpdateLink(r.Context(), id, p)
	})(w, r)
}

func (a *api) deleteLink(w http.ResponseWriter, r *http.Request) {
	remove(a, func(r *http.Request, id string) error { return a.store.DeleteLink(r.Context(), id) })(w, r)
}
