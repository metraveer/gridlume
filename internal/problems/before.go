package problems

import (
	"time"

	"github.com/metraveer/gridlume/internal/store"
)

// Before is how far back changes are looked for when a problem starts: "what changed just before".
const Before = 30 * time.Minute

// Machines are the machines a problem concerns: its node's machine (the node itself, or the machine it
// is inside), or the machines at both ends of its link. Changes there may be related.
func Machines(p store.Problem, m store.Map) []string {
	parent := map[string]string{}
	for _, n := range m.Nodes {
		if n.ParentID != nil {
			parent[n.ID] = *n.ParentID
		}
	}
	machine := func(id string) string {
		if pid, ok := parent[id]; ok {
			return pid
		}
		return id
	}
	var ids []string
	add := func(id string) {
		if id == "" {
			return
		}
		id = machine(id)
		for _, x := range ids {
			if x == id {
				return
			}
		}
		ids = append(ids, id)
	}
	add(p.NodeID)
	for _, l := range m.Links {
		if l.ID == p.LinkID {
			add(l.FromID)
			add(l.ToID)
		}
	}
	return ids
}
