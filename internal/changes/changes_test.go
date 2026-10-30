package changes

import (
	"testing"
	"time"

	"github.com/metraveer/gridlume/internal/agentproto"
)

func kinds(cs []Change) []string {
	var out []string
	for _, c := range cs {
		out = append(out, c.Kind)
	}
	return out
}

func TestDiff(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	info := agentproto.Info{Version: "0.4.0", Kernel: "6.12.48"}
	snap := func(uptime uint64, cs ...agentproto.Container) agentproto.Snapshot {
		return agentproto.Snapshot{Uptime: uptime, Docker: &agentproto.Docker{Containers: cs}}
	}
	app := agentproto.Container{ID: "a1", Name: "nc-app-1", Project: "nc", Service: "app", Image: "nextcloud:31", ImageID: "aaa", State: "running"}
	db := agentproto.Container{ID: "b1", Name: "nc-db-1", Project: "nc", Service: "db", Image: "postgres:17", State: "running"}

	first := FromSnapshot(info, snap(1000, app, db), now)
	if cs := Diff(State{}, first); cs != nil {
		t.Fatalf("first sight: %v", cs)
	}
	// Uptime rounding: same machine, no change, and nothing to write.
	again := FromSnapshot(info, snap(1006, app, db), now.Add(5*time.Second))
	if cs := Diff(first, again); len(cs) != 0 || !Same(first, again) {
		t.Fatalf("nothing changed: %v", kinds(cs))
	}

	// A new image under the same tag, recreated; db restarted twice; a backup container came.
	app2 := app
	app2.ID, app2.ImageID = "a2", "bbb"
	db2 := db
	db2.Restarts = 2
	backup := agentproto.Container{ID: "c1", Name: "backup", Image: "restic", State: "exited"}
	cur := FromSnapshot(info, snap(1100, app2, db2, backup), now.Add(100*time.Second))
	cs := Diff(first, cur)
	got := map[string]Change{}
	for _, c := range cs {
		got[c.Kind] = c
	}
	if c := got["image_changed"]; c.Params["from"] != "nextcloud:31 (aaa)" || c.Params["to"] != "nextcloud:31 (bbb)" {
		t.Errorf("image: %+v", c)
	}
	if _, ok := got["container_recreated"]; ok {
		t.Error("a new image already says it was recreated")
	}
	if c := got["container_restarted"]; c.Params["restarts"] != 2 {
		t.Errorf("restarts: %+v", c)
	}
	if c := got["container_added"]; c.Params["name"] != "backup" {
		t.Errorf("added: %+v", c)
	}

	// The machine rebooted with a new kernel and agent; db stopped; the backup went away.
	db3 := db2
	db3.State, db3.Status = "exited", "Exited (1) 1 second ago"
	info2 := agentproto.Info{Version: "0.5.0", Kernel: "6.12.57"}
	after := FromSnapshot(info2, snap(30, app2, db3), now.Add(time.Hour))
	if k := kinds(Diff(cur, after)); len(k) != 5 || k[0] != "machine_rebooted" || k[1] != "agent_updated" || k[2] != "kernel_changed" {
		t.Fatalf("reboot: %v", k)
	}

	// Docker not readable in one look: no container changes, machine changes still count.
	noDocker := FromSnapshot(info, agentproto.Snapshot{Uptime: 1200}, now.Add(200*time.Second))
	if cs := Diff(cur, noDocker); len(cs) != 0 {
		t.Fatalf("docker unreadable is not every container gone: %v", kinds(cs))
	}
}
