package server

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"io"
	"log/slog"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/metraveer/gridlume/internal/agentproto"
	"github.com/metraveer/gridlume/internal/store"
)

func TestSilentMachineBecomesAProblem(t *testing.T) {
	s, err := store.Open(filepath.Join(t.TempDir(), "g.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	ctx := context.Background()
	a := newAPI(Options{Store: s}, slog.New(slog.NewTextHandler(io.Discard, nil)))

	// A machine that connected once and then went quiet.
	if err := s.CreateEnrollCode(ctx, "K7QM2R9X", "", "user", time.Hour); err != nil {
		t.Fatal(err)
	}
	pub, _, _ := ed25519.GenerateKey(rand.Reader)
	info := agentproto.Info{Hostname: "calibur", Version: "test"}
	ag, err := s.Enroll(ctx, "K7QM2R9X", pub, info)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.AgentConnected(ctx, ag.ID, info); err != nil {
		t.Fatal(err)
	}

	if ch := a.checkProblems(ctx, time.Now()); ch.Any() {
		t.Fatalf("just seen: no problem yet: %+v", ch)
	}
	ch := a.checkProblems(ctx, time.Now().Add(2*time.Minute))
	if len(ch.Opened) != 1 || ch.Opened[0].Kind != "agent_offline" || ch.Opened[0].NodeID != ag.NodeID {
		t.Fatalf("after two minutes of silence: %+v", ch)
	}

	rec := httptest.NewRecorder()
	a.listProblems(rec, httptest.NewRequest("GET", "/api/problems", nil))
	var out struct {
		Open  []store.Problem `json:"open"`
		Ended []store.Problem `json:"ended"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if len(out.Open) != 1 || out.Open[0].Severity != "crit" || out.Ended == nil {
		t.Fatalf("/api/problems: %s", rec.Body.String())
	}
}
