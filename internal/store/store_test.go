package store

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func open(t *testing.T) *Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "gridlume.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s
}

func ptr[T any](v T) *T { return &v }

func wantCode(t *testing.T, err error, field, code string) {
	t.Helper()
	var ve *ValidationError
	if !errors.As(err, &ve) || ve.Field != field || ve.Code != code {
		t.Fatalf("err = %v, want %s/%s", err, field, code)
	}
}

func TestMigrationsAreIdempotent(t *testing.T) {
	path := filepath.Join(t.TempDir(), "g.db")
	for i := 0; i < 2; i++ {
		s, err := Open(path)
		if err != nil {
			t.Fatalf("open #%d: %v", i, err)
		}
		_ = s.Close()
	}
}

func TestMapCRUD(t *testing.T) {
	ctx := context.Background()
	s := open(t)

	village, err := s.CreatePlace(ctx, Place{Name: "Деревня", Tone: "green", X: 40, Y: 150})
	if err != nil {
		t.Fatal(err)
	}
	router, err := s.CreateNode(ctx, Node{Kind: "router", Name: "Ростелеком", PlaceID: &village.ID})
	if err != nil {
		t.Fatal(err)
	}
	calibur, err := s.CreateNode(ctx, Node{Kind: "server", Name: "calibur", Address: "192.168.1.20", PlaceID: &village.ID, State: "ok"})
	if err != nil {
		t.Fatal(err)
	}
	komodo, err := s.CreateNode(ctx, Node{Kind: "container", Name: "komodo-core", ParentID: &calibur.ID, PlaceID: &village.ID})
	if err != nil {
		t.Fatal(err)
	}
	if komodo.PlaceID != nil {
		t.Fatal("a node inside a machine must not have its own place")
	}
	if _, err := s.CreateLink(ctx, Link{FromID: router.ID, ToID: calibur.ID, Kind: "lan", About: "Кабель от роутера", SpeedMbit: ptr(1000.0)}); err != nil {
		t.Fatal(err)
	}

	m, err := s.GetMap(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(m.Places) != 1 || len(m.Nodes) != 3 || len(m.Links) != 1 {
		t.Fatalf("map = %d places, %d nodes, %d links", len(m.Places), len(m.Nodes), len(m.Links))
	}

	// Deleting a machine removes what is inside it and its links.
	if err := s.DeleteNode(ctx, calibur.ID); err != nil {
		t.Fatal(err)
	}
	m, _ = s.GetMap(ctx)
	if len(m.Nodes) != 1 || len(m.Links) != 0 {
		t.Fatalf("after delete: %d nodes, %d links", len(m.Nodes), len(m.Links))
	}

	// Deleting a place keeps its nodes, just without a place.
	if err := s.DeletePlace(ctx, village.ID); err != nil {
		t.Fatal(err)
	}
	m, _ = s.GetMap(ctx)
	if len(m.Nodes) != 1 || m.Nodes[0].PlaceID != nil {
		t.Fatalf("node after place delete: %+v", m.Nodes)
	}
}

func TestValidation(t *testing.T) {
	ctx := context.Background()
	s := open(t)

	_, err := s.CreateNode(ctx, Node{Kind: "server", Name: "  "})
	wantCode(t, err, "name", "required")
	_, err = s.CreateNode(ctx, Node{Kind: "toaster", Name: "x"})
	wantCode(t, err, "kind", "invalid")

	machine, _ := s.CreateNode(ctx, Node{Kind: "server", Name: "calibur"})
	inside, _ := s.CreateNode(ctx, Node{Kind: "container", Name: "api", ParentID: &machine.ID})
	_, err = s.CreateNode(ctx, Node{Kind: "container", Name: "deeper", ParentID: &inside.ID})
	wantCode(t, err, "parentId", "too_deep")

	other, _ := s.CreateNode(ctx, Node{Kind: "server", Name: "junk"})
	_, err = s.UpdateNode(ctx, machine.ID, NodePatch{ParentID: &other.ID})
	wantCode(t, err, "parentId", "too_deep") // calibur still contains api

	_, err = s.CreateLink(ctx, Link{FromID: machine.ID, ToID: machine.ID, Kind: "lan"})
	wantCode(t, err, "toId", "cycle")
	_, err = s.CreateLink(ctx, Link{FromID: machine.ID, ToID: "nope", Kind: "lan"})
	wantCode(t, err, "toId", "not_found")

	_, err = s.UpdateNode(ctx, "nope", NodePatch{Name: ptr("x")})
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v", err)
	}
}

func TestLinkSwapAndClearSpeed(t *testing.T) {
	ctx := context.Background()
	s := open(t)
	a, _ := s.CreateNode(ctx, Node{Kind: "router", Name: "a"})
	b, _ := s.CreateNode(ctx, Node{Kind: "server", Name: "b"})
	l, _ := s.CreateLink(ctx, Link{FromID: a.ID, ToID: b.ID, Kind: "lan", SpeedMbit: ptr(100.0)})
	l, err := s.UpdateLink(ctx, l.ID, LinkPatch{Swap: true, SpeedMbit: ptr(0.0)})
	if err != nil {
		t.Fatal(err)
	}
	if l.FromID != b.ID || l.ToID != a.ID || l.SpeedMbit != nil {
		t.Fatalf("link = %+v", l)
	}
}

func TestLinkInterface(t *testing.T) {
	ctx := context.Background()
	s := open(t)
	a, _ := s.CreateNode(ctx, Node{Kind: "router", Name: "a"})
	b, _ := s.CreateNode(ctx, Node{Kind: "server", Name: "b"})
	l, err := s.CreateLink(ctx, Link{FromID: a.ID, ToID: b.ID, Kind: "lan", Iface: " enp4s0f1 "})
	if err != nil || l.Iface != " enp4s0f1 " {
		t.Fatalf("create: %+v %v", l, err)
	}
	m, _ := s.GetMap(ctx)
	if m.Links[0].Iface != "enp4s0f1" {
		t.Fatalf("stored trimmed: %q", m.Links[0].Iface)
	}
	// Other fields change, the interface stays; "" goes back to the default route.
	if l, _ = s.UpdateLink(ctx, l.ID, LinkPatch{About: ptr("Кабель")}); l.Iface != "enp4s0f1" {
		t.Fatalf("kept: %q", l.Iface)
	}
	if l, _ = s.UpdateLink(ctx, l.ID, LinkPatch{Iface: ptr("")}); l.Iface != "" {
		t.Fatalf("cleared: %q", l.Iface)
	}
	if _, err := s.UpdateLink(ctx, l.ID, LinkPatch{Iface: ptr(strings.Repeat("x", 41))}); err == nil {
		t.Fatal("an interface name longer than 40 characters must be refused")
	}
}

func TestUsersAndSessions(t *testing.T) {
	ctx := context.Background()
	s := open(t)

	if n, _ := s.CountUsers(ctx); n != 0 {
		t.Fatal("fresh database must have no users")
	}
	_, err := s.CreateUser(ctx, "ops", "short", "owner")
	wantCode(t, err, "password", "too_short")

	u, err := s.CreateUser(ctx, "ops", "correct horse battery", "owner")
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.CreateUser(ctx, "OPS", "another long password", "admin")
	wantCode(t, err, "username", "taken")

	if _, err := s.CheckLogin(ctx, "ops", "wrong password!"); !errors.Is(err, ErrBadCredentials) {
		t.Fatalf("wrong password: %v", err)
	}
	if _, err := s.CheckLogin(ctx, "nobody", "whatever whatever"); !errors.Is(err, ErrBadCredentials) {
		t.Fatalf("unknown user: %v", err)
	}
	if got, err := s.CheckLogin(ctx, "Ops", "correct horse battery"); err != nil || got.ID != u.ID {
		t.Fatalf("login: %v %+v", err, got)
	}

	token, err := s.CreateSession(ctx, u.ID, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if got, err := s.SessionUser(ctx, token); err != nil || got.Username != "ops" {
		t.Fatalf("session: %v %+v", err, got)
	}
	if err := s.DeleteSession(ctx, token); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SessionUser(ctx, token); !errors.Is(err, ErrNotFound) {
		t.Fatalf("after sign out: %v", err)
	}

	expired, _ := s.CreateSession(ctx, u.ID, -time.Minute)
	if _, err := s.SessionUser(ctx, expired); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expired session must not work: %v", err)
	}
}
