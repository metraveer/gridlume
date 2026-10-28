package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func get(t *testing.T, h http.Handler, path string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	return rec
}

func TestHealth(t *testing.T) {
	rec := get(t, New(Options{}), "/api/health")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || body["status"] != "ok" {
		t.Fatalf("body = %q", rec.Body.String())
	}
}

func TestUnknownAPIIsJSON404(t *testing.T) {
	rec := get(t, New(Options{}), "/api/nope")
	if rec.Code != http.StatusNotFound || !strings.Contains(rec.Header().Get("Content-Type"), "application/json") {
		t.Fatalf("status = %d, type = %q", rec.Code, rec.Header().Get("Content-Type"))
	}
}

func TestSPAFallbackAndAssets(t *testing.T) {
	dist := fstest.MapFS{
		"index.html":      {Data: []byte("<!doctype html>app")},
		"assets/app.1.js": {Data: []byte("console.log(1)")},
	}
	h := New(Options{Dist: dist})

	if rec := get(t, h, "/machines/calibur"); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "app") {
		t.Fatalf("client route: status = %d body = %q", rec.Code, rec.Body.String())
	}
	rec := get(t, h, "/assets/app.1.js")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Header().Get("Cache-Control"), "immutable") {
		t.Fatalf("asset: status = %d cache = %q", rec.Code, rec.Header().Get("Cache-Control"))
	}
}

func TestNotBuiltExplainsWhatToDo(t *testing.T) {
	rec := get(t, New(Options{Dist: fstest.MapFS{}}), "/")
	if rec.Code != http.StatusServiceUnavailable || !strings.Contains(rec.Body.String(), "npm run build") {
		t.Fatalf("status = %d body = %q", rec.Code, rec.Body.String())
	}
}

func TestSecurityHeaders(t *testing.T) {
	rec := get(t, New(Options{}), "/api/health")
	if rec.Header().Get("X-Frame-Options") != "DENY" || rec.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("headers = %v", rec.Header())
	}
}
