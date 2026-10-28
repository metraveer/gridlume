package store

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"errors"
	"testing"
	"time"

	"github.com/metraveer/gridlume/internal/agentproto"
)

func TestEnrollIntoExistingNodeAndMetrics(t *testing.T) {
	s := open(t)
	ctx := context.Background()
	srv, _ := s.CreateNode(ctx, Node{Kind: "server", Name: "calibur", State: "unknown"})
	svc, _ := s.CreateNode(ctx, Node{Kind: "service", Name: "gridman", ParentID: &srv.ID, State: "unknown"})

	wantCode(t, s.CreateEnrollCode(ctx, "AAAA-BBBB", svc.ID, "user", time.Hour), "nodeId", "not_machine")
	if err := s.CreateEnrollCode(ctx, "AAAA-BBBB", srv.ID, "user", time.Hour); err != nil {
		t.Fatal(err)
	}
	pub, _, _ := ed25519.GenerateKey(rand.Reader)
	a, err := s.Enroll(ctx, "aaaa bbbb", pub, agentproto.Info{Hostname: "calibur", Mode: "root"})
	if err != nil || a.NodeID != srv.ID || a.Mode != "user" {
		t.Fatalf("enroll: %v %+v", err, a)
	}
	if _, err := s.Enroll(ctx, "AAAA-BBBB", pub, agentproto.Info{}); !errors.Is(err, ErrCodeInvalid) {
		t.Fatalf("used code: %v", err)
	}

	// Enrolling the same machine again replaces its agent.
	_ = s.CreateEnrollCode(ctx, "CCCC-DDDD", srv.ID, "readonly", time.Hour)
	b, err := s.Enroll(ctx, "CCCC-DDDD", pub, agentproto.Info{Hostname: "calibur"})
	if err != nil {
		t.Fatal(err)
	}
	if list, _ := s.ListAgents(ctx); len(list) != 1 || list[0].ID != b.ID || list[0].Mode != "readonly" {
		t.Fatalf("agents: %+v", list)
	}

	now := time.Now().Unix() / 60 * 60
	rows := []MetricRow{
		{NodeID: srv.ID, Series: "cpu", Point: Point{TS: now - 120, Avg: 10, Max: 20}},
		{NodeID: srv.ID, Series: "cpu", Point: Point{TS: now - 60, Avg: 30, Max: 50}},
		{NodeID: "gone", Series: "cpu", Point: Point{TS: now, Avg: 1, Max: 1}}, // deleted node: skipped
	}
	if err := s.WriteMetrics(ctx, rows); err != nil {
		t.Fatal(err)
	}
	got, err := s.Metrics(ctx, srv.ID, []string{"cpu", "mem"}, time.Now().Add(-time.Hour), 60)
	if err != nil || len(got["cpu"]) != 2 || len(got["mem"]) != 0 {
		t.Fatalf("metrics: %v %v", err, got)
	}

	// Deleting the node removes its agent and metrics.
	if err := s.DeleteNode(ctx, srv.ID); err != nil {
		t.Fatal(err)
	}
	if list, _ := s.ListAgents(ctx); len(list) != 0 {
		t.Fatalf("agent must go with the node: %+v", list)
	}
	if got, _ := s.Metrics(ctx, srv.ID, []string{"cpu"}, time.Now().Add(-time.Hour), 60); len(got["cpu"]) != 0 {
		t.Fatal("metrics must go with the node")
	}
}
