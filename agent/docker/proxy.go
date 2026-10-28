package docker

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// readable are the Engine API paths the read-only proxy lets through (after an optional /v1.xx prefix).
// Not included on purpose: /containers/{id}/archive and /export (they read files out of containers,
// secrets included), /top (command lines may carry passwords), /exec, /attach, and anything that
// is not GET or HEAD. Inspect answers lose their environment values, see redactEnv.
var readable = regexp.MustCompile(`^(/v[0-9.]+)?/(_ping|version|info|containers/json|containers/[A-Za-z0-9_.-]+/(json|stats|logs)|images/json|networks|networks/[A-Za-z0-9_.-]+|volumes|system/df)$`)

var inspectPath = regexp.MustCompile(`^(/v[0-9.]+)?/containers/[A-Za-z0-9_.-]+/json$`)

// RefsVar is the one variable the proxy leaves in an inspect answer: the hosts the real ones named.
const RefsVar = "GRIDLUME_REF_HOST"

// Allowed reports whether the read-only proxy passes a request on.
func Allowed(r *http.Request) bool {
	// ".." could make Docker's router land on a path other than the one checked here.
	return (r.Method == http.MethodGet || r.Method == http.MethodHead) && !strings.Contains(r.URL.Path, "..") && readable.MatchString(r.URL.Path)
}

// Proxy serves a read-only view of the Docker socket at listen. It runs as its own user (in the docker
// group); the agent in the read-only mode is not in that group and can only reach Docker through here.
func Proxy(ctx context.Context, listen, socket string, log *slog.Logger) error {
	_ = os.Remove(listen) // a socket left by a previous run
	l, err := net.Listen("unix", listen)
	if err != nil {
		return err
	}
	// Owner and group (the agent's) may connect; nobody else.
	if err := os.Chmod(listen, 0o660); err != nil {
		return err
	}
	target, _ := url.Parse("http://docker")
	rp := httputil.NewSingleHostReverseProxy(target)
	rp.ModifyResponse = func(res *http.Response) error {
		if res.StatusCode != http.StatusOK || !inspectPath.MatchString(res.Request.URL.Path) {
			return nil
		}
		return redactEnv(res)
	}
	rp.Transport = &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
		var d net.Dialer
		return d.DialContext(ctx, "unix", socket)
	}}
	srv := &http.Server{
		ReadHeaderTimeout: 5 * time.Second,
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !Allowed(r) {
				log.Warn("refused a Docker request", "method", r.Method, "path", r.URL.Path)
				http.Error(w, "gridlume read-only Docker proxy: only reading is allowed", http.StatusForbidden)
				return
			}
			rp.ServeHTTP(w, r)
		}),
	}
	go func() {
		<-ctx.Done()
		_ = srv.Close()
	}()
	log.Info("read-only Docker proxy", "listen", listen, "docker", socket)
	if err := srv.Serve(l); err != nil && err != http.ErrServerClosed {
		return err
	}
	return nil
}

// redactEnv replaces Config.Env of an inspect answer with RefsVar=<hosts>, so even a compromised
// read-only agent never sees passwords and tokens kept in environment variables.
func redactEnv(res *http.Response) error {
	body, err := io.ReadAll(io.LimitReader(res.Body, 32<<20))
	res.Body.Close()
	if err != nil {
		return err
	}
	var doc map[string]any
	if err := json.Unmarshal(body, &doc); err != nil {
		return err
	}
	if cfg, ok := doc["Config"].(map[string]any); ok {
		var env []string
		if list, ok := cfg["Env"].([]any); ok {
			for _, v := range list {
				if s, ok := v.(string); ok {
					env = append(env, s)
				}
			}
		}
		cfg["Env"] = []string{RefsVar + "=" + strings.Join(HostRefs(env), ",")}
	}
	out, err := json.Marshal(doc)
	if err != nil {
		return err
	}
	res.Body = io.NopCloser(bytes.NewReader(out))
	res.ContentLength = int64(len(out))
	res.Header.Set("Content-Length", strconv.Itoa(len(out)))
	return nil
}
