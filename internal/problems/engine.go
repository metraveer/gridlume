package problems

import (
	"context"
	"fmt"
	"slices"
	"strconv"
	"sync"
	"time"

	"github.com/metraveer/gridlume/internal/store"
)

// Clear is how long a signal must be gone before its problem ends: a link that loses one ping a minute
// should not open and close a problem every few seconds.
var Clear = 30 * time.Second

// Engine turns signals into lasting problems and remembers them in the database.
type Engine struct {
	Store *store.Store

	mu      sync.Mutex
	loaded  bool
	open    map[string]store.Problem // by key
	pending map[string]time.Time     // key → first seen, not a problem yet
	gone    map[string]time.Time     // key → first missing, still open
}

func NewEngine(s *store.Store) *Engine {
	return &Engine{Store: s, open: map[string]store.Problem{}, pending: map[string]time.Time{}, gone: map[string]time.Time{}}
}

// Change is what one step did, for notifications later.
type Change struct {
	Opened []store.Problem
	Ended  []store.Problem
	Moved  bool // something open changed its severity or figures
}

func (c Change) Any() bool { return len(c.Opened) > 0 || len(c.Ended) > 0 || c.Moved }

// Step takes the signals of one moment; problems of held nodes and links are left as they are.
func (e *Engine) Step(ctx context.Context, sigs []Signal, held Held, now time.Time) (Change, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	var ch Change
	if !e.loaded {
		// Problems open before a restart stay open; their signals decide what happens to them.
		ps, err := e.Store.OpenProblems(ctx)
		if err != nil {
			return ch, err
		}
		for _, p := range ps {
			e.open[p.Key] = p
		}
		e.loaded = true
	}

	seen := map[string]bool{}
	for _, s := range sigs {
		seen[s.Key] = true
		delete(e.gone, s.Key)
		if p, ok := e.open[s.Key]; ok {
			if p.Severity != s.Severity || p.Kind != s.Kind || !sameParams(p, s) {
				p.Severity, p.Kind, p.Params, p.Merged = s.Severity, s.Kind, s.Params, s.Merged
				if err := e.Store.UpdateProblem(ctx, p); err != nil {
					return ch, err
				}
				e.open[s.Key] = p
				ch.Moved = true
			}
			continue
		}
		first, ok := e.pending[s.Key]
		if !ok {
			first = now
			e.pending[s.Key] = now
		}
		if now.Sub(first) < s.Confirm {
			continue
		}
		delete(e.pending, s.Key)
		p, err := e.Store.OpenProblem(ctx, store.Problem{Key: s.Key, Kind: s.Kind, Severity: s.Severity, NodeID: s.NodeID, LinkID: s.LinkID,
			Params: s.Params, Merged: s.Merged, Since: first.UnixMilli()})
		if err != nil {
			return ch, err
		}
		e.open[s.Key] = p
		ch.Opened = append(ch.Opened, p)
	}
	for k := range e.pending {
		if !seen[k] {
			delete(e.pending, k) // a blip: gone before it counted
		}
	}
	for k, p := range e.open {
		if seen[k] {
			continue
		}
		if held.Has(p) && p.Kind != "agent_offline" {
			delete(e.gone, k) // unknown, not over
			continue
		}
		first, ok := e.gone[k]
		if !ok {
			e.gone[k] = now
			continue
		}
		if now.Sub(first) < Clear {
			continue
		}
		p.Ended = first.UnixMilli()
		if err := e.Store.EndProblem(ctx, p.ID, p.Ended); err != nil {
			return ch, err
		}
		delete(e.open, k)
		delete(e.gone, k)
		ch.Ended = append(ch.Ended, p)
	}
	return ch, nil
}

// sameParams: figures that only drift (a percent going 91.2 → 91.4) do not count as a change worth telling.
func sameParams(p store.Problem, s Signal) bool {
	if !slices.Equal(p.Merged, s.Merged) && !(len(p.Merged) == 0 && len(s.Merged) == 0) {
		return false
	}
	for k, v := range s.Params {
		old, ok := p.Params[k]
		if !ok {
			return false
		}
		a, af := v.(float64)
		b, bf := old.(float64)
		if af && bf {
			if a-b > 1 || b-a > 1 {
				return false
			}
			continue
		}
		if fmtAny(v) != fmtAny(old) {
			return false
		}
	}
	return true
}

func fmtAny(v any) string {
	switch x := v.(type) {
	case string:
		return x
	case int:
		return strconv.Itoa(x)
	case int64:
		return strconv.FormatInt(x, 10)
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64)
	default:
		return fmt.Sprint(x)
	}
}
