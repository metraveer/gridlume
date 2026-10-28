package server

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/metraveer/gridlume/internal/store"
)

type client struct {
	t    *testing.T
	base string
	http *http.Client
}

func newClient(t *testing.T, setupCode string) (*client, *store.Store) {
	t.Helper()
	s, err := store.Open(filepath.Join(t.TempDir(), "g.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	srv := httptest.NewServer(New(Options{Store: s, SetupCode: setupCode}))
	t.Cleanup(srv.Close)
	jar, _ := cookiejar.New(nil)
	return &client{t: t, base: srv.URL, http: &http.Client{Jar: jar}}, s
}

// do sends JSON; csrf=false leaves out the anti-CSRF header to test that it is required.
func (c *client) do(method, path string, body any, csrf bool) (int, map[string]any) {
	c.t.Helper()
	var r io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		r = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, c.base+path, r)
	req.Header.Set("Content-Type", "application/json")
	if csrf {
		req.Header.Set(csrfHeader, "1")
	}
	res, err := c.http.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer res.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(res.Body).Decode(&out)
	return res.StatusCode, out
}

func TestSetupFlow(t *testing.T) {
	c, _ := newClient(t, "K7QM-2R9X")

	if code, body := c.do("GET", "/api/session", nil, false); code != 200 || body["needsSetup"] != true {
		t.Fatalf("session before setup: %d %v", code, body)
	}
	if code, _ := c.do("POST", "/api/setup", map[string]string{"code": "K7QM-2R9X", "username": "ops", "password": "correct horse battery"}, false); code != 403 {
		t.Fatalf("setup without CSRF header: %d", code)
	}
	if code, body := c.do("POST", "/api/setup", map[string]string{"code": "WRONG-CODE", "username": "ops", "password": "correct horse battery"}, true); code != 400 || body["field"] != "code" {
		t.Fatalf("wrong code: %d %v", code, body)
	}
	if code, _ := c.do("POST", "/api/setup", map[string]string{"code": "k7qm2r9x", "username": "ops", "password": "correct horse battery"}, true); code != 200 {
		t.Fatalf("setup (code typed lowercase without dash): %d", code)
	}
	if code, body := c.do("GET", "/api/session", nil, false); body["needsSetup"] != false || body["user"] == nil {
		t.Fatalf("session after setup: %d %v", code, body)
	}
	if code, _ := c.do("POST", "/api/setup", map[string]string{"code": "K7QM-2R9X", "username": "x", "password": "another long password"}, true); code != 409 {
		t.Fatalf("second setup must be refused: %d", code)
	}
}

func TestLoginLogoutAndProtectedAPI(t *testing.T) {
	c, s := newClient(t, "")
	if _, err := s.CreateUser(t.Context(), "ops", "correct horse battery", "owner"); err != nil {
		t.Fatal(err)
	}

	if code, _ := c.do("GET", "/api/map", nil, false); code != 401 {
		t.Fatalf("map without session: %d", code)
	}
	if code, body := c.do("POST", "/api/login", map[string]string{"username": "ops", "password": "nope nope nope"}, true); code != 401 || body["error"] != "bad_credentials" {
		t.Fatalf("bad login: %d %v", code, body)
	}
	if code, _ := c.do("POST", "/api/login", map[string]string{"username": "ops", "password": "correct horse battery"}, true); code != 200 {
		t.Fatalf("login: %d", code)
	}

	code, place := c.do("POST", "/api/places", map[string]any{"name": "Деревня", "tone": "green", "x": 40, "y": 150, "w": 440, "h": 330}, true)
	if code != 201 {
		t.Fatalf("create place: %d %v", code, place)
	}
	code, node := c.do("POST", "/api/nodes", map[string]any{"kind": "server", "name": "calibur", "placeId": place["id"]}, true)
	if code != 201 {
		t.Fatalf("create node: %d %v", code, node)
	}
	if code, _ := c.do("POST", "/api/nodes", map[string]any{"kind": "server", "name": "x"}, false); code != 403 {
		t.Fatalf("write without CSRF header: %d", code)
	}
	if code, body := c.do("POST", "/api/nodes", map[string]any{"kind": "toaster", "name": "x"}, true); code != 400 || body["field"] != "kind" {
		t.Fatalf("validation: %d %v", code, body)
	}
	if code, _ := c.do("PATCH", "/api/nodes/"+node["id"].(string), map[string]any{"notes": "Legacy BIOS"}, true); code != 200 {
		t.Fatalf("update node: %d", code)
	}
	if code, _ := c.do("PUT", "/api/layout", map[string]any{"nodes": []map[string]any{{"id": node["id"], "x": 80, "y": 380}}, "places": []any{}}, true); code != 200 {
		t.Fatalf("layout: %d", code)
	}
	code, m := c.do("GET", "/api/map", nil, false)
	if code != 200 || len(m["nodes"].([]any)) != 1 || len(m["places"].([]any)) != 1 {
		t.Fatalf("map: %d %v", code, m)
	}
	if code, _ := c.do("DELETE", "/api/nodes/nope", nil, true); code != 404 {
		t.Fatalf("delete unknown: %d", code)
	}

	if code, _ := c.do("POST", "/api/logout", nil, true); code != 200 {
		t.Fatalf("logout: %d", code)
	}
	if code, _ := c.do("GET", "/api/map", nil, false); code != 401 {
		t.Fatalf("map after logout: %d", code)
	}
}

func TestViewerCannotWrite(t *testing.T) {
	c, s := newClient(t, "")
	if _, err := s.CreateUser(t.Context(), "guest", "correct horse battery", "viewer"); err != nil {
		t.Fatal(err)
	}
	c.do("POST", "/api/login", map[string]string{"username": "guest", "password": "correct horse battery"}, true)
	if code, _ := c.do("GET", "/api/map", nil, false); code != 200 {
		t.Fatalf("viewer read: %d", code)
	}
	if code, _ := c.do("POST", "/api/nodes", map[string]any{"kind": "server", "name": "x"}, true); code != 403 {
		t.Fatalf("viewer write: %d", code)
	}
}

func TestLoginIsRateLimited(t *testing.T) {
	c, _ := newClient(t, "")
	var last int
	for i := 0; i < 12; i++ {
		last, _ = c.do("POST", "/api/login", map[string]string{"username": "x", "password": "yyyyyyyyyyyy"}, true)
	}
	if last != 429 {
		t.Fatalf("after 12 attempts: %d, want 429", last)
	}
}

func TestSetupCodeFormat(t *testing.T) {
	code := NewSetupCode()
	if len(code) != 9 || code[4] != '-' {
		t.Fatalf("code = %q", code)
	}
}
