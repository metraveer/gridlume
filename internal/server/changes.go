package server

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/metraveer/gridlume/internal/problems"
	"github.com/metraveer/gridlume/internal/store"
)

func (a *api) changeRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/changes", a.authed(a.listChanges))
}

// listChanges: the newest changes of a node (a machine includes what is inside it), or of everything.
func (a *api) listChanges(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 200 {
		limit = 30
	}
	var machines, nodes []string
	if id := r.URL.Query().Get("node"); id != "" {
		machines, nodes = []string{id}, []string{id}
	}
	out, err := a.store.Changes(ctx, machines, nodes, 0, 0, limit)
	if err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// changesBefore are the changes on a problem's machines in the half hour before it started (and the
// minute after, as snapshots and checks do not line up to the second): "possibly related".
func (a *api) changesBefore(ctx context.Context, p store.Problem, m store.Map) []store.Change {
	ms := problems.Machines(p, m)
	if len(ms) == 0 {
		return nil
	}
	out, err := a.store.Changes(ctx, ms, nil, p.Since-problems.Before.Milliseconds(), p.Since+time.Minute.Milliseconds(), 3)
	if err != nil {
		return nil
	}
	return out
}
