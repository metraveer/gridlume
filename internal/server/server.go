// Package server is the core's HTTP entry point: the API under /api/ and the web interface for everything else.
package server

import (
	"encoding/json"
	"io/fs"
	"log/slog"
	"net/http"
	"path"
	"strings"

	"github.com/metraveer/gridlume/internal/store"
	"github.com/metraveer/gridlume/internal/version"
)

// Options configure the server.
type Options struct {
	// UI serves the web interface. Nil means the embedded build.
	UI http.Handler
	// Dist is the built interface used when UI is nil.
	Dist fs.FS
	// Store enables the API beyond health/version. Nil is only used in tests of the static parts.
	Store *store.Store
	// SetupCode lets the first visitor create the owner account; empty once an owner exists.
	SetupCode string
	Log       *slog.Logger
}

// New returns the core HTTP handler.
func New(opts Options) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", health)
	mux.HandleFunc("GET /api/version", versionInfo)
	if opts.Store != nil {
		log := opts.Log
		if log == nil {
			log = slog.Default()
		}
		newAPI(opts.Store, opts.SetupCode, log).routes(mux)
	}
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found"})
	})

	ui := opts.UI
	if ui == nil {
		ui = spa(opts.Dist)
	}
	mux.Handle("/", ui)
	return securityHeaders(mux)
}

func health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func versionInfo(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"version": version.Version, "commit": version.Commit})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// spa serves the built interface; unknown paths get index.html so client-side routes work.
// If the interface has not been built, it explains how to build it instead of a blank 404.
func spa(dist fs.FS) http.Handler {
	if dist == nil {
		return http.HandlerFunc(notBuilt)
	}
	if _, err := fs.Stat(dist, "index.html"); err != nil {
		return http.HandlerFunc(notBuilt)
	}
	files := http.FileServerFS(dist)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if name != "" {
			if _, err := fs.Stat(dist, name); err == nil {
				if strings.HasPrefix(name, "assets/") {
					// Vite puts a content hash in asset names, so they never change.
					w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
				}
				files.ServeHTTP(w, r)
				return
			}
		}
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeFileFS(w, r, dist, "index.html")
	})
}

func notBuilt(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusServiceUnavailable)
	_, _ = w.Write([]byte(`<!doctype html><meta charset="utf-8"><title>Gridlume</title>
<body style="background:#0d0f12;color:#e9ebee;font:15px system-ui;padding:40px">
<h1 style="font-size:20px">Gridlume</h1>
<p>Интерфейс не собран. Выполните <code>npm ci &amp;&amp; npm run build</code> в папке <code>web</code> или запустите <code>gridlume dev</code>.</p>
<p>The interface is not built. Run <code>npm ci &amp;&amp; npm run build</code> in <code>web</code>, or start <code>gridlume dev</code>.</p>`))
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "same-origin")
		next.ServeHTTP(w, r)
	})
}
