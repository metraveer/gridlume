// Package devmode runs the web interface's Vite dev server next to the core and proxies the
// interface through the core, so `gridlume dev` gives one address with live reload.
package devmode

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

// VitePort is where the Vite dev server listens; the core proxies everything that is not /api/ to it.
const VitePort = 5173

// Start launches `npm run dev` in webDir and returns a handler that proxies to it.
// The process stops when ctx is cancelled.
func Start(ctx context.Context, webDir string, log *slog.Logger) (http.Handler, error) {
	if _, err := os.Stat(filepath.Join(webDir, "node_modules")); err != nil {
		return nil, fmt.Errorf("web dependencies are not installed: run `npm ci` in %s", webDir)
	}
	// Run Vite with node directly rather than through npm: then the process we hold is Vite itself,
	// so stopping the core really stops it (on Windows, killing npm.cmd would leave node running).
	// Bind to 127.0.0.1 explicitly: "localhost" may resolve to ::1 only, and the proxy below dials IPv4.
	vite := filepath.Join("node_modules", "vite", "bin", "vite.js")
	cmd := exec.CommandContext(ctx, "node", vite, "--host", "127.0.0.1", "--port", fmt.Sprint(VitePort), "--strictPort")
	cmd.Dir = webDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start vite: %w", err)
	}
	go func() {
		if err := cmd.Wait(); err != nil && ctx.Err() == nil {
			log.Error("vite stopped", "err", err)
		}
	}()

	addr := fmt.Sprintf("127.0.0.1:%d", VitePort)
	if err := waitForPort(ctx, addr, 30*time.Second); err != nil {
		_ = cmd.Process.Kill() // do not leave Vite running when the core gives up
		return nil, err
	}
	target := &url.URL{Scheme: "http", Host: addr}
	return httputil.NewSingleHostReverseProxy(target), nil
}

func waitForPort(ctx context.Context, addr string, limit time.Duration) error {
	deadline := time.Now().Add(limit)
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", addr, 300*time.Millisecond)
		if err == nil {
			_ = conn.Close()
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(200 * time.Millisecond):
		}
	}
	return errors.New("vite did not start on " + addr)
}
