package problems

import "github.com/metraveer/gridlume/internal/store"

// Fold puts the open problems of a machine that is not connected (its containers, the links it
// measured) under that machine's "not connected" problem, for the list people see: one cause, one line.
// They stay open in the database and come back as they are when the machine reconnects.
func Fold(open []store.Problem, in Input) []store.Problem {
	offline := map[string]int{} // machine node → index of its agent_offline problem in out
	var out []store.Problem
	for _, p := range open {
		if p.Kind == "agent_offline" {
			offline[p.NodeID] = len(out)
			out = append(out, p)
		}
	}
	if len(offline) == 0 {
		return open
	}
	parent := map[string]string{}
	for _, n := range in.Map.Nodes {
		if n.ParentID != nil {
			parent[n.ID] = *n.ParentID
		}
	}
	ends := map[string][2]string{}
	for _, l := range in.Map.Links {
		ends[l.ID] = [2]string{l.FromID, l.ToID}
	}
	owner := func(p store.Problem) (int, bool) {
		for _, id := range []string{p.NodeID, parent[p.NodeID], ends[p.LinkID][0], ends[p.LinkID][1]} {
			if i, ok := offline[id]; ok && id != "" {
				return i, true
			}
		}
		return 0, false
	}
	for _, p := range open {
		if p.Kind == "agent_offline" {
			continue
		}
		if i, ok := owner(p); ok {
			out[i].Merged = append(append([]string(nil), out[i].Merged...), p.Kind)
			continue
		}
		out = append(out, p)
	}
	return out
}
