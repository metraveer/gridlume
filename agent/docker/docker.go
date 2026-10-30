// Package docker reads containers from the Docker Engine API over its unix socket.
// It only ever sends GET requests; in the read-only mode the socket is a proxy that refuses anything else.
//
// Environment variables often hold passwords and tokens, so their values never leave the machine:
// the agent only extracts the host names they point at (for "api seems to use postgres").
package docker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/metraveer/gridlume/internal/agentproto"
)

// Client talks to one Docker socket.
type Client struct {
	http *http.Client

	mu      sync.Mutex
	details map[string]details // by container id: what inspect said; containers do not change it while they live
	prevCPU map[string][2]uint64
}

type details struct {
	refs      []string
	dependsOn []string
	networks  []string
	restarts  int
}

// New returns a client for the socket at path, e.g. /var/run/docker.sock.
func New(path string) *Client {
	tr := &http.Transport{
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			var d net.Dialer
			return d.DialContext(ctx, "unix", path)
		},
		MaxIdleConns: 4,
	}
	return &Client{
		http:    &http.Client{Transport: tr, Timeout: 10 * time.Second},
		details: map[string]details{},
		prevCPU: map[string][2]uint64{},
	}
}

func (c *Client) get(ctx context.Context, path string, v any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://docker"+path, nil)
	if err != nil {
		return err
	}
	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(io.LimitReader(res.Body, 512))
		return fmt.Errorf("docker %s: %s %s", path, res.Status, strings.TrimSpace(string(b)))
	}
	return json.NewDecoder(io.LimitReader(res.Body, 32<<20)).Decode(v)
}

// listed is one entry of GET /containers/json.
type listed struct {
	ID      string            `json:"Id"`
	Names   []string          `json:"Names"`
	Image   string            `json:"Image"`
	ImageID string            `json:"ImageID"` // sha256:…, changes when a tag is pulled again
	State   string            `json:"State"`   // running, exited, restarting, paused, created, dead
	Status  string            `json:"Status"`  // "Up 3 hours (healthy)"
	Labels  map[string]string `json:"Labels"`
	Ports   []struct {
		PrivatePort int    `json:"PrivatePort"`
		PublicPort  int    `json:"PublicPort"`
		Type        string `json:"Type"`
		IP          string `json:"IP"`
	} `json:"Ports"`
}

type inspected struct {
	RestartCount int `json:"RestartCount"`
	Config       struct {
		Env []string `json:"Env"`
	} `json:"Config"`
	NetworkSettings struct {
		Networks map[string]struct {
			Aliases []string `json:"Aliases"`
		} `json:"Networks"`
	} `json:"NetworkSettings"`
}

type stats struct {
	CPU struct {
		Usage struct {
			Total uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		System uint64 `json:"system_cpu_usage"`
		Online int    `json:"online_cpus"`
	} `json:"cpu_stats"`
	Memory struct {
		Usage uint64            `json:"usage"`
		Limit uint64            `json:"limit"`
		Stats map[string]uint64 `json:"stats"`
	} `json:"memory_stats"`
}

// State reads all containers. An error means Docker is not reachable (not installed, no access).
func (c *Client) State(ctx context.Context) (*agentproto.Docker, error) {
	var list []listed
	if err := c.get(ctx, "/containers/json?all=1", &list); err != nil {
		return nil, err
	}
	out := &agentproto.Docker{Containers: make([]agentproto.Container, len(list))}
	live := map[string]bool{}
	var wg sync.WaitGroup
	slots := make(chan struct{}, 8) // a machine with fifty containers should not get fifty requests at once
	for i, l := range list {
		live[l.ID] = true
		ct := agentproto.Container{
			ID:      l.ID[:min(12, len(l.ID))],
			Name:    strings.TrimPrefix(first(l.Names), "/"),
			Image:   l.Image,
			ImageID: shortImageID(l.ImageID),
			State:   l.State,
			Status:  l.Status,
			Project: l.Labels["com.docker.compose.project"],
			Service: l.Labels["com.docker.compose.service"],
			Health:  health(l.Status),
		}
		for _, p := range l.Ports {
			ct.Ports = append(ct.Ports, agentproto.Port{Private: p.PrivatePort, Public: p.PublicPort, Proto: p.Type, IP: p.IP})
		}
		ct.DependsOn = composeDepends(l.Labels["com.docker.compose.depends_on"])
		out.Containers[i] = ct

		wg.Add(1)
		go func(i int, id string, running bool) {
			defer wg.Done()
			slots <- struct{}{}
			defer func() { <-slots }()
			c.fill(ctx, &out.Containers[i], id, running)
		}(i, l.ID, l.State == "running")
	}
	wg.Wait()

	c.mu.Lock()
	for id := range c.details {
		if !live[id] {
			delete(c.details, id)
			delete(c.prevCPU, id)
		}
	}
	c.mu.Unlock()
	sort.Slice(out.Containers, func(a, b int) bool { return out.Containers[a].Name < out.Containers[b].Name })
	return out, nil
}

// fill adds what needs one request per container: inspect (once per container) and stats (running only).
func (c *Client) fill(ctx context.Context, ct *agentproto.Container, id string, running bool) {
	c.mu.Lock()
	d, known := c.details[id]
	c.mu.Unlock()
	// Restarts change while a container lives, so a restarting one is inspected again.
	if !known || ct.State == "restarting" {
		var in inspected
		if err := c.get(ctx, "/containers/"+id+"/json", &in); err == nil {
			d = details{refs: HostRefs(in.Config.Env), restarts: in.RestartCount}
			for name := range in.NetworkSettings.Networks {
				d.networks = append(d.networks, name)
			}
			sort.Strings(d.networks)
			c.mu.Lock()
			c.details[id] = d
			c.mu.Unlock()
		}
	}
	ct.Refs, ct.Networks, ct.Restarts = d.refs, d.networks, d.restarts
	if !running {
		return
	}
	var st stats
	if err := c.get(ctx, "/containers/"+id+"/stats?stream=false&one-shot=true", &st); err != nil {
		return
	}
	// Memory as `docker stats` shows it: without the page cache, which the kernel gives back when needed.
	mem := st.Memory.Usage
	if cache := st.Memory.Stats["inactive_file"]; cache <= mem {
		mem -= cache
	}
	ct.MemUsed, ct.MemLimit = mem, st.Memory.Limit
	c.mu.Lock()
	prev, ok := c.prevCPU[id]
	c.prevCPU[id] = [2]uint64{st.CPU.Usage.Total, st.CPU.System}
	c.mu.Unlock()
	if ok && st.CPU.System > prev[1] && st.CPU.Usage.Total >= prev[0] {
		// Percent of the whole machine, like the machine's own CPU figure.
		ct.CPU = 100 * float64(st.CPU.Usage.Total-prev[0]) / float64(st.CPU.System-prev[1])
	}
}

func first(s []string) string {
	if len(s) == 0 {
		return ""
	}
	return s[0]
}

// health picks "healthy" / "unhealthy" / "starting" out of a status like "Up 3 hours (healthy)".
func health(status string) string {
	for _, h := range []string{"unhealthy", "healthy", "health: starting"} {
		if strings.Contains(status, "("+h+")") {
			return strings.TrimPrefix(h, "health: ")
		}
	}
	return ""
}

// composeDepends turns "db:service_started:false,redis:service_healthy:true" into ["db", "redis"].
func composeDepends(label string) []string {
	var out []string
	for _, part := range strings.Split(label, ",") {
		if name, _, _ := strings.Cut(strings.TrimSpace(part), ":"); name != "" {
			out = append(out, name)
		}
	}
	return out
}

// HostRefs returns the host names that environment values point at, and nothing else of the values:
// "DATABASE_URL=postgres://app:secret@db:5432/app" gives "db"; "REDIS_HOST=redis" gives "redis".
// Values that are not addresses (passwords, flags, paths) give nothing.
func HostRefs(env []string) []string {
	seen := map[string]bool{}
	var out []string
	add := func(h string) {
		h = strings.ToLower(strings.TrimSpace(h))
		if h == "" || seen[h] || !hostLike(h) {
			return
		}
		seen[h] = true
		out = append(out, h)
	}
	for _, kv := range env {
		key, val, ok := strings.Cut(kv, "=")
		if !ok || val == "" {
			continue
		}
		if strings.Contains(val, "://") {
			if u, err := url.Parse(val); err == nil {
				add(u.Hostname())
			}
			continue
		}
		k := strings.ToUpper(key)
		if strings.HasSuffix(k, "HOST") || strings.HasSuffix(k, "HOSTNAME") || strings.HasSuffix(k, "ADDR") || strings.HasSuffix(k, "ADDRESS") || strings.HasSuffix(k, "SERVER") {
			for _, part := range strings.Split(val, ",") {
				h, _, _ := strings.Cut(part, ":")
				add(h)
			}
		}
	}
	sort.Strings(out)
	return out
}

// hostLike accepts names like "db", "redis-1", "api.internal" and IPv4 addresses.
func hostLike(h string) bool {
	if len(h) > 253 || h == "localhost" {
		return false
	}
	for _, r := range h {
		if !(r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '-' || r == '.' || r == '_') {
			return false
		}
	}
	return h[0] != '-' && h[0] != '.'
}

// Read is State for the snapshot: nil and "" when there is no Docker on the machine at all,
// otherwise the containers, or nil and a reason the interface can explain.
func Read(ctx context.Context, c *Client, socket string) (*agentproto.Docker, string) {
	if _, err := os.Stat(socket); errors.Is(err, os.ErrNotExist) {
		return nil, ""
	}
	d, err := c.State(ctx)
	if err == nil {
		return d, ""
	}
	if errors.Is(err, os.ErrPermission) || strings.Contains(err.Error(), "permission denied") {
		return nil, "no_access" // the agent's user is not allowed to read the socket
	}
	return nil, "unavailable"
}

// shortImageID turns "sha256:4f9c…" into its first 12 hex digits, as `docker images` shows it.
func shortImageID(id string) string {
	id = strings.TrimPrefix(id, "sha256:")
	return id[:min(12, len(id))]
}
