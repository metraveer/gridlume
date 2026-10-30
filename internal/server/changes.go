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
	mux.HandleFunc("GET /api/history", a.authed(a.history))
}

// HistoryMax is the longest period the history answers for at once.
const HistoryMax = 14 * 24 * time.Hour

// history: what was going on over a period (the last day by default): the problems open at some point
// in it and the changes made in it, for the timeline and "looking at the past".
func (a *api) history(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	now := time.Now().UnixMilli()
	to, _ := strconv.ParseInt(r.URL.Query().Get("to"), 10, 64)
	from, _ := strconv.ParseInt(r.URL.Query().Get("from"), 10, 64)
	if to <= 0 || to > now {
		to = now
	}
	if from <= 0 || from >= to {
		from = to - (24 * time.Hour).Milliseconds()
	}
	if to-from > HistoryMax.Milliseconds() {
		from = to - HistoryMax.Milliseconds()
	}
	ps, err := a.store.ProblemsBetween(ctx, from, to)
	if err != nil {
		a.fail(w, err)
		return
	}
	cs, err := a.store.Changes(ctx, nil, nil, from, to, 1000)
	if err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"from": from, "to": to, "problems": ps, "changes": cs})
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
