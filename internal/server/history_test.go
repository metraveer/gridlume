package server

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"github.com/metraveer/gridlume/internal/store"
)

func TestHistoryOfAPeriod(t *testing.T) {
	s, err := store.Open(filepath.Join(t.TempDir(), "g.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	ctx := context.Background()
	a := newAPI(Options{Store: s}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	h := func(d time.Duration) int64 { return time.Now().Add(-d).UnixMilli() }

	// Ended long before the period, ended inside it, still open, started after it.
	old, _ := s.OpenProblem(ctx, store.Problem{Key: "a", Kind: "disk_full", Severity: "warn", Since: h(10 * time.Hour)})
	_ = s.EndProblem(ctx, old.ID, h(9*time.Hour))
	inside, _ := s.OpenProblem(ctx, store.Problem{Key: "b", Kind: "agent_offline", Severity: "crit", Since: h(5 * time.Hour)})
	_ = s.EndProblem(ctx, inside.ID, h(3*time.Hour))
	_, _ = s.OpenProblem(ctx, store.Problem{Key: "c", Kind: "link_loss", Severity: "warn", Since: h(4 * time.Hour)})
	_, _ = s.OpenProblem(ctx, store.Problem{Key: "d", Kind: "mem_high", Severity: "warn", Since: h(time.Hour)})
	_, _ = s.AddChange(ctx, store.Change{At: h(4 * time.Hour), NodeID: "n", MachineID: "n", Kind: "machine_rebooted"})
	_, _ = s.AddChange(ctx, store.Change{At: h(8 * time.Hour), NodeID: "n", MachineID: "n", Kind: "agent_updated"})

	from, to := h(6*time.Hour), h(2*time.Hour)
	rec := httptest.NewRecorder()
	a.history(rec, httptest.NewRequest("GET", "/api/history?from="+strconv.FormatInt(from, 10)+"&to="+strconv.FormatInt(to, 10), nil))
	var out struct {
		Problems []store.Problem `json:"problems"`
		Changes  []store.Change  `json:"changes"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	keys := map[string]bool{}
	for _, p := range out.Problems {
		keys[p.Key] = true
	}
	if len(out.Problems) != 2 || !keys["b"] || !keys["c"] {
		t.Fatalf("problems open during the period: %s", rec.Body.String())
	}
	if len(out.Changes) != 1 || out.Changes[0].Kind != "machine_rebooted" {
		t.Fatalf("changes in the period: %+v", out.Changes)
	}

	// No period given: the last day.
	rec = httptest.NewRecorder()
	a.history(rec, httptest.NewRequest("GET", "/api/history", nil))
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if len(out.Problems) != 4 || len(out.Changes) != 2 {
		t.Fatalf("last day: %d problems, %d changes", len(out.Problems), len(out.Changes))
	}
}
