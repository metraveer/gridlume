package server

import (
	"context"
	"net/http"
	"time"

	"github.com/metraveer/gridlume/internal/agentlink"
	"github.com/metraveer/gridlume/internal/checks"
	"github.com/metraveer/gridlume/internal/problems"
)

// ProblemsEvery is how often the core looks for problems; ProblemsKeep how long ended ones are kept.
var (
	ProblemsEvery = 10 * time.Second
	ProblemsKeep  = 30 * 24 * time.Hour
)

func (a *api) problemRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/problems", a.authed(a.listProblems))
	mux.HandleFunc("GET /api/checks", a.authed(a.listChecks))
}

// listChecks: the latest result of every check the core runs, by node.
func (a *api) listChecks(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, a.checks.Results())
}

// watchProblems runs the problem engine until ctx ends.
func (a *api) watchProblems(ctx context.Context) {
	go a.checks.Run(ctx)
	t := time.NewTicker(ProblemsEvery)
	defer t.Stop()
	lastPrune := time.Time{}
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		a.checkProblems(ctx, time.Now())
		if time.Since(lastPrune) > 24*time.Hour {
			_ = a.store.PruneProblems(ctx, ProblemsKeep)
			lastPrune = time.Now()
		}
	}
}

// checkProblems looks once and tells the interface when something opened, ended or changed.
func (a *api) checkProblems(ctx context.Context, now time.Time) problems.Change {
	m, err := a.store.GetMap(ctx)
	if err != nil {
		a.log.Warn("problems: map", "err", err)
		return problems.Change{}
	}
	st, err := a.hub.Statuses(ctx)
	if err != nil {
		a.log.Warn("problems: agents", "err", err)
		return problems.Change{}
	}
	// What the core checks itself follows the map: nodes with an address and no agent.
	withAgent := map[string]bool{}
	for _, s := range st {
		withAgent[s.NodeID] = true
	}
	a.checks.SetTargets(checks.Targets(m, withAgent))
	in := problems.Input{Map: m, Agents: st, Snaps: a.hub.Snapshots(), Checks: a.checks.Results(), Now: now}
	ch, err := a.problems.Step(ctx, append(problems.Detect(in), a.watchSignals(ctx, now)...), problems.HeldIn(in), now)
	if err != nil {
		a.log.Warn("problems: step", "err", err)
		return ch
	}
	for _, p := range ch.Opened {
		a.log.Info("problem", "kind", p.Kind, "severity", p.Severity, "node", p.NodeID, "link", p.LinkID)
	}
	for _, p := range ch.Ended {
		a.log.Info("problem ended", "kind", p.Kind, "node", p.NodeID, "link", p.LinkID)
	}
	if ch.Any() {
		a.hub.Publish(agentlink.Event{Problems: true})
	}
	a.notify.Changed(ctx, ch, m)
	return ch
}

// listProblems: what is wrong now, and what ended in the last day.
func (a *api) listProblems(w http.ResponseWriter, r *http.Request) {
	open, err := a.store.OpenProblems(r.Context())
	if err != nil {
		a.fail(w, err)
		return
	}
	// Problems inside a machine that is not connected show under it: one cause, one line.
	if m, err := a.store.GetMap(r.Context()); err == nil {
		open = problems.Fold(open, problems.Input{Map: m})
	}
	ended, err := a.store.EndedProblems(r.Context(), time.Now().Add(-24*time.Hour).UnixMilli())
	if err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"open": open, "ended": ended})
}
