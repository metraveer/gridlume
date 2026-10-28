package docker

import (
	"context"
	"io"
	"log/slog"
	"net"
	"net/http"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/metraveer/gridlume/internal/agentproto"
)

func TestHostRefsKeepsOnlyHostNames(t *testing.T) {
	env := []string{
		"DATABASE_URL=postgres://app:s3cr3t@db:5432/app",
		"REDIS_HOST=redis",
		"SMTP_SERVER=mail.example.com:587",
		"KAFKA_ADDR=kafka-1:9092,kafka-2:9092",
		"API_TOKEN=abc123def",   // not an address: ignored
		"PASSWORD=hunter2",      // ignored
		"LISTEN_HOST=localhost", // ignored: points at itself
		"CALLBACK=https://Example.org/x?token=zzz",
		"PATH=/usr/bin:/bin",
	}
	got := HostRefs(env)
	want := []string{"db", "example.org", "kafka-1", "kafka-2", "mail.example.com", "redis"}
	if !slices.Equal(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for _, h := range got {
		for _, secret := range []string{"s3cr3t", "abc123", "hunter2", "zzz"} {
			if strings.Contains(h, secret) {
				t.Fatalf("a secret leaked: %q", h)
			}
		}
	}
}

func TestLabels(t *testing.T) {
	if got := composeDepends("db:service_started:false,redis:service_healthy:true"); !slices.Equal(got, []string{"db", "redis"}) {
		t.Fatalf("depends = %v", got)
	}
	for status, want := range map[string]string{"Up 3 hours (healthy)": "healthy", "Up 1 minute (unhealthy)": "unhealthy", "Up 5 seconds (health: starting)": "starting", "Up 2 days": ""} {
		if got := health(status); got != want {
			t.Errorf("health(%q) = %q, want %q", status, got, want)
		}
	}
}

// fakeDocker answers like the Engine API on a unix socket and records the methods it saw.
func fakeDocker(t *testing.T) (string, func() []string) {
	t.Helper()
	sock := filepath.Join(t.TempDir(), "d.sock")
	l, err := net.Listen("unix", sock)
	if err != nil {
		t.Skip("unix sockets not available:", err)
	}
	// Requests arrive in parallel (the client fills containers concurrently).
	var mu sync.Mutex
	var methods []string
	mux := http.NewServeMux()
	mux.HandleFunc("/containers/json", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`[{"Id":"aaaaaaaaaaaa1111","Names":["/app-api-1"],"Image":"app/api:1","State":"running","Status":"Up 1 hour (healthy)",
			"Labels":{"com.docker.compose.project":"app","com.docker.compose.service":"api","com.docker.compose.depends_on":"db:service_started:false"},
			"Ports":[{"PrivatePort":3000,"PublicPort":8080,"Type":"tcp","IP":"0.0.0.0"}]},
			{"Id":"bbbbbbbbbbbb2222","Names":["/app-db-1"],"Image":"postgres:17","State":"exited","Status":"Exited (0) 2 minutes ago","Labels":{}}]`))
	})
	mux.HandleFunc("/containers/{id}/json", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"RestartCount":2,"Config":{"Env":["DATABASE_URL=postgres://u:p@db:5432/x"]},"NetworkSettings":{"Networks":{"app_default":{}}}}`))
	})
	mux.HandleFunc("/containers/{id}/stats", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"cpu_stats":{"cpu_usage":{"total_usage":1000},"system_cpu_usage":10000},"memory_stats":{"usage":300,"limit":1000,"stats":{"inactive_file":100}}}`))
	})
	srv := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		methods = append(methods, r.Method)
		mu.Unlock()
		mux.ServeHTTP(w, r)
	})}
	go func() { _ = srv.Serve(l) }()
	t.Cleanup(func() { _ = srv.Close() })
	return sock, func() []string {
		mu.Lock()
		defer mu.Unlock()
		return slices.Clone(methods)
	}
}

func TestStateReadsContainers(t *testing.T) {
	sock, methods := fakeDocker(t)
	c := New(sock)
	d, reason := Read(context.Background(), c, sock)
	if d == nil || reason != "" || len(d.Containers) != 2 {
		t.Fatalf("read: %v %q", d, reason)
	}
	api := d.Containers[0]
	if api.Name != "app-api-1" || api.ID != "aaaaaaaaaaaa" || api.Project != "app" || api.Service != "api" || api.Health != "healthy" {
		t.Fatalf("api: %+v", api)
	}
	if api.MemUsed != 200 || api.Restarts != 2 || !slices.Equal(api.Refs, []string{"db"}) || !slices.Equal(api.DependsOn, []string{"db"}) || api.Ports[0].Public != 8080 {
		t.Fatalf("api details: %+v", api)
	}
	if db := d.Containers[1]; db.State != "exited" || db.MemUsed != 0 {
		t.Fatalf("db: %+v", db)
	}
	for _, m := range methods() {
		if m != http.MethodGet {
			t.Fatalf("the agent must only read Docker, sent %s", m)
		}
	}
	// No socket at all: no Docker on this machine, nothing to explain.
	if d, reason := Read(context.Background(), c, filepath.Join(t.TempDir(), "none.sock")); d != nil || reason != "" {
		t.Fatalf("no docker: %v %q", d, reason)
	}
}

func TestProxyAllowsOnlyReading(t *testing.T) {
	cases := map[string]bool{
		"GET /containers/json":              true,
		"GET /v1.47/containers/json":        true,
		"GET /containers/abc123/stats":      true,
		"GET /containers/abc123/logs":       true,
		"GET /containers/abc123/top":        false, // command lines may carry passwords
		"HEAD /_ping":                       true,
		"POST /containers/abc123/stop":      false,
		"POST /containers/create":           false,
		"DELETE /containers/abc123":         false,
		"GET /containers/abc123/archive":    false, // reads files (secrets) out of the container
		"GET /containers/abc123/export":     false,
		"POST /containers/abc123/exec":      false,
		"GET /containers/abc123/attach/ws":  false,
		"GET /containers/../../etc/passwd":  false,
		"GET /v1.47/containers/a/json/../x": false,
		"GET /containers/../json":           false,
	}
	for line, want := range cases {
		method, path, _ := strings.Cut(line, " ")
		r, _ := http.NewRequest(method, "http://docker"+path, nil)
		r.URL.Path = path // keep it raw, as it arrives on the socket
		if got := Allowed(r); got != want {
			t.Errorf("%s: allowed = %v, want %v", line, got, want)
		}
	}
}

func TestProxyHidesEnvironmentValues(t *testing.T) {
	sock, _ := fakeDocker(t)
	ro := filepath.Join(t.TempDir(), "ro.sock")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go func() { _ = Proxy(ctx, ro, sock, slog.New(slog.NewTextHandler(io.Discard, nil))) }()
	c := New(ro)
	var d *agentproto.Docker
	for i := 0; i < 100 && d == nil; i++ { // wait for the proxy to listen
		d, _ = Read(ctx, c, ro)
		time.Sleep(10 * time.Millisecond)
	}
	if d == nil || !slices.Equal(d.Containers[0].Refs, []string{"db"}) {
		t.Fatalf("through the proxy: %+v", d)
	}
	var in map[string]any
	if err := c.get(ctx, "/containers/aaaaaaaaaaaa1111/json", &in); err != nil {
		t.Fatal(err)
	}
	env := in["Config"].(map[string]any)["Env"].([]any)
	if len(env) != 1 || env[0] != RefsVar+"=db" {
		t.Fatalf("environment must be reduced to host names, got %v", env)
	}
}
