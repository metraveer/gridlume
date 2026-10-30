// Package changes notices what changed on a machine between two looks: a container got a new image,
// was recreated, restarted, stopped or started, appeared or went away; the machine rebooted, its agent
// or its Linux kernel was updated. Nobody has to write it down: the agent's snapshots already say it.
//
// It keeps no history itself. The hub keeps the last State of every machine (in the database, so a
// restart of the core misses nothing) and stores what Diff returns.
package changes

import (
	"sort"
	"time"

	"github.com/metraveer/gridlume/internal/agentproto"
	"github.com/metraveer/gridlume/internal/store"
)

// State is what is compared: the machine and its containers, by container key.
type State struct {
	Boot       int64                `json:"boot"` // unix seconds the machine started
	Version    string               `json:"version"`
	Kernel     string               `json:"kernel"`
	Containers map[string]Container `json:"containers"`
}

// Container is one container as far as changes go.
type Container struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Image    string `json:"image"`
	ImageID  string `json:"imageId,omitempty"`
	State    string `json:"state"`
	Status   string `json:"status,omitempty"`
	Restarts int    `json:"restarts"`
}

// Change is one thing that changed. Key is the container's ("" for the machine itself).
type Change struct {
	Kind   string
	Key    string
	Params map[string]any
}

// RebootSlack: boot times computed from uptime drift a second or two; a jump larger than this is a reboot.
const RebootSlack = 2 * time.Minute

// FromSnapshot makes the State of a machine from its agent's info and latest snapshot.
func FromSnapshot(info agentproto.Info, s agentproto.Snapshot, now time.Time) State {
	st := State{Version: info.Version, Kernel: info.Kernel}
	if s.Uptime > 0 {
		st.Boot = now.Add(-time.Duration(s.Uptime) * time.Second).Unix()
	}
	// No Docker data (not installed, not readable right now): the containers are unknown, not gone.
	if s.Docker != nil {
		st.Containers = map[string]Container{}
		for _, c := range s.Docker.Containers {
			st.Containers[store.ContainerKey(c)] = Container{ID: c.ID, Name: c.Name, Image: c.Image, ImageID: c.ImageID, State: c.State, Status: c.Status, Restarts: c.Restarts}
		}
	}
	return st
}

// Diff says what changed from prev to cur. A machine seen for the first time has no changes; neither
// do containers when Docker was not readable in one of the two looks (nil maps).
func Diff(prev, cur State) []Change {
	if prev.Containers == nil && prev.Boot == 0 && prev.Version == "" {
		return nil
	}
	var out []Change
	if prev.Boot > 0 && cur.Boot > 0 && time.Duration(cur.Boot-prev.Boot)*time.Second > RebootSlack {
		out = append(out, Change{Kind: "machine_rebooted", Params: map[string]any{"boot": cur.Boot}})
	}
	if prev.Version != "" && cur.Version != "" && prev.Version != cur.Version {
		out = append(out, Change{Kind: "agent_updated", Params: map[string]any{"from": prev.Version, "to": cur.Version}})
	}
	if prev.Kernel != "" && cur.Kernel != "" && prev.Kernel != cur.Kernel {
		out = append(out, Change{Kind: "kernel_changed", Params: map[string]any{"from": prev.Kernel, "to": cur.Kernel}})
	}
	if prev.Containers == nil || cur.Containers == nil {
		return out
	}
	keys := make([]string, 0, len(cur.Containers)+len(prev.Containers))
	for k := range cur.Containers {
		keys = append(keys, k)
	}
	for k := range prev.Containers {
		if _, ok := cur.Containers[k]; !ok {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)
	for _, k := range keys {
		p, had := prev.Containers[k]
		c, has := cur.Containers[k]
		switch {
		case !had:
			out = append(out, Change{Kind: "container_added", Key: k, Params: map[string]any{"name": c.Name, "image": c.Image}})
		case !has:
			out = append(out, Change{Kind: "container_removed", Key: k, Params: map[string]any{"name": p.Name, "image": p.Image}})
		default:
			out = append(out, container(k, p, c)...)
		}
	}
	return out
}

func container(k string, p, c Container) []Change {
	var out []Change
	switch {
	case p.Image != c.Image || (p.ImageID != "" && c.ImageID != "" && p.ImageID != c.ImageID):
		out = append(out, Change{Kind: "image_changed", Key: k, Params: map[string]any{"name": c.Name, "from": image(p), "to": image(c)}})
	case p.ID != c.ID:
		out = append(out, Change{Kind: "container_recreated", Key: k, Params: map[string]any{"name": c.Name}})
	case c.Restarts > p.Restarts:
		out = append(out, Change{Kind: "container_restarted", Key: k, Params: map[string]any{"name": c.Name, "restarts": c.Restarts}})
	}
	// A recreated container passes through "created": only running ↔ not running counts.
	if p.ID == c.ID && (p.State == "running") != (c.State == "running") {
		if c.State == "running" {
			out = append(out, Change{Kind: "container_started", Key: k, Params: map[string]any{"name": c.Name}})
		} else {
			out = append(out, Change{Kind: "container_stopped", Key: k, Params: map[string]any{"name": c.Name, "status": c.Status}})
		}
	}
	return out
}

// image is "nextcloud:31-apache", with the short id when the tag stayed the same but the image did not.
func image(c Container) string {
	if c.ImageID != "" {
		return c.Image + " (" + c.ImageID + ")"
	}
	return c.Image
}

// Same tells whether two states are equal for what Diff looks at, so an unchanged machine costs no write.
// Boot times drift with uptime rounding; they count only when they jump.
func Same(a, b State) bool {
	if a.Version != b.Version || a.Kernel != b.Kernel || len(a.Containers) != len(b.Containers) || (a.Containers == nil) != (b.Containers == nil) {
		return false
	}
	d := time.Duration(a.Boot-b.Boot) * time.Second
	if d > RebootSlack || -d > RebootSlack {
		return false
	}
	for k, x := range a.Containers {
		y, ok := b.Containers[k]
		if !ok || x.ID != y.ID || x.Image != y.Image || x.ImageID != y.ImageID || x.State != y.State || x.Restarts != y.Restarts {
			return false
		}
	}
	return true
}
