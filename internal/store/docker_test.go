package store

import (
	"context"
	"errors"
	"testing"

	"github.com/metraveer/gridlume/internal/agentproto"
)

func containers() []agentproto.Container {
	return []agentproto.Container{
		{Name: "app-api-1", Project: "app", Service: "api", Image: "ghcr.io/me/api:1", Refs: []string{"db", "redis.app_default", "example.org"}, DependsOn: []string{"db"}},
		{Name: "app-db-1", Project: "app", Service: "db", Image: "postgres:17"},
		{Name: "app-redis-1", Project: "app", Service: "redis", Image: "redis:7-alpine"},
		{Name: "app-worker-1", Project: "app", Service: "worker", Image: "ghcr.io/me/api:1", Refs: []string{"api", "mq"}},
		{Name: "mq", Image: "rabbitmq:4-management"},
	}
}

func TestGuessLinks(t *testing.T) {
	got := map[string]string{}
	for _, g := range GuessLinks(containers()) {
		got[g.From+" > "+g.To] = g.Kind + "/" + g.Reason
	}
	want := map[string]string{
		"docker:app/api > docker:app/db":     "db/compose_depends", // depends_on wins over the env reference to the same db
		"docker:app/api > docker:app/redis":  "db/env_ref",
		"docker:app/worker > docker:app/api": "http/env_ref",
		"docker:app/worker > docker:mq":      "queue/env_ref",
	}
	if len(got) != len(want) {
		t.Fatalf("got %v", got)
	}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("%s = %q, want %q", k, got[k], v)
		}
	}
}

func TestSyncContainersAndSuggestions(t *testing.T) {
	s := open(t)
	ctx := context.Background()
	m, _ := s.CreateNode(ctx, Node{Kind: "server", Name: "calibur", State: "unknown"})

	changed, err := s.SyncContainers(ctx, m.ID, containers())
	if err != nil || !changed {
		t.Fatalf("first sync: %v %v", changed, err)
	}
	mp, _ := s.GetMap(ctx)
	byKey := map[string]Node{}
	for _, n := range mp.Nodes {
		if n.ExtKey != "" {
			byKey[n.ExtKey] = n
		}
	}
	if len(byKey) != 5 || byKey["docker:app/db"].Kind != "database" || byKey["docker:app/api"].Name != "api" || byKey["docker:mq"].Source != "docker" {
		t.Fatalf("container nodes: %+v", byKey)
	}

	// The user renames a container node; a second sync must not undo it or add duplicates.
	newName := "API"
	if _, err := s.UpdateNode(ctx, byKey["docker:app/api"].ID, NodePatch{Name: &newName}); err != nil {
		t.Fatal(err)
	}
	if changed, err := s.SyncContainers(ctx, m.ID, containers()); err != nil || changed {
		t.Fatalf("second sync must change nothing: %v %v", changed, err)
	}

	added, err := s.SaveSuggestions(ctx, m.ID, GuessLinks(containers()))
	if err != nil || added != 4 {
		t.Fatalf("suggestions added: %d %v", added, err)
	}
	if again, _ := s.SaveSuggestions(ctx, m.ID, GuessLinks(containers())); again != 0 {
		t.Fatalf("the same guesses must not be stored twice: %d", again)
	}
	list, _ := s.Suggestions(ctx)
	if len(list) != 4 {
		t.Fatalf("suggestions: %+v", list)
	}

	l, err := s.AcceptSuggestion(ctx, list[0].ID, "api keeps its data in db", "", "PostgreSQL · 5432")
	if err != nil || l.About != "api keeps its data in db" || l.FromID != list[0].FromID {
		t.Fatalf("accept: %v %+v", err, l)
	}
	if err := s.DismissSuggestion(ctx, list[1].ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AcceptSuggestion(ctx, list[1].ID, "", "", ""); !errors.Is(err, ErrNotFound) {
		t.Fatalf("a dismissed suggestion cannot be accepted: %v", err)
	}
	if left, _ := s.Suggestions(ctx); len(left) != 2 {
		t.Fatalf("after accept and dismiss: %+v", left)
	}
	// Neither the accepted nor the dismissed one comes back.
	if again, _ := s.SaveSuggestions(ctx, m.ID, GuessLinks(containers())); again != 0 {
		t.Fatalf("accepted or dismissed guesses must not return: %d", again)
	}
}
