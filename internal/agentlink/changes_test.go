package agentlink

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"path/filepath"
	"testing"
	"time"

	"github.com/metraveer/gridlume/internal/agentproto"
	"github.com/metraveer/gridlume/internal/store"
)

func TestChangesAreNoticedAndSurviveACoreRestart(t *testing.T) {
	s, err := store.Open(filepath.Join(t.TempDir(), "g.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	ctx := context.Background()
	h := New(s, slog.New(slog.NewTextHandler(io.Discard, nil)))
	clock := time.Unix(1_800_000_000, 0)
	h.now = func() time.Time { return clock }

	snap := func(image string, restarts int) agentproto.Snapshot {
		return agentproto.Snapshot{Uptime: 5000, Docker: &agentproto.Docker{Containers: []agentproto.Container{
			{ID: "a1", Name: "app", Project: "nc", Service: "app", Image: image, State: "running", Restarts: restarts},
		}}}
	}
	c := &conn{agent: store.Agent{NodeID: "srv"}, info: agentproto.Info{Version: "0.4.0"}}
	h.noticeChanges(ctx, c, snap("nextcloud:31", 0)) // first sight: nothing
	clock = clock.Add(5 * time.Second)
	h.noticeChanges(ctx, c, snap("nextcloud:32", 0))

	// The core restarts: the machine's last state comes from the database, so a restart that happened
	// meanwhile is still noticed.
	c2 := &conn{agent: store.Agent{NodeID: "srv"}, info: agentproto.Info{Version: "0.4.0"}}
	raw, _ := s.MachineState(ctx, "srv")
	_ = json.Unmarshal([]byte(raw), &c2.state)
	clock = clock.Add(time.Minute)
	h.noticeChanges(ctx, c2, snap("nextcloud:32", 1))
	clock = clock.Add(time.Minute)
	h.noticeChanges(ctx, c2, snap("nextcloud:32", 2)) // folded into the restart a minute ago

	list, err := s.Changes(ctx, []string{"srv"}, nil, 0, 0, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 || list[0].Kind != "container_restarted" || list[0].Count != 2 || list[1].Kind != "image_changed" || list[1].Params["to"] != "nextcloud:32" {
		t.Fatalf("changes: %+v", list)
	}
}
