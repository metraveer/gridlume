package server

import "testing"

func TestSystemSettingsAndUpdateRequests(t *testing.T) {
	c := signedIn(t)
	code, body := c.do("GET", "/api/system", nil, false)
	if code != 200 || body["version"] == nil || body["canUpdate"] != false {
		t.Fatalf("system: %d %v", code, body)
	}
	if code, _ := c.do("PUT", "/api/system/settings", map[string]any{"channel": "nightly", "auto": false}, true); code != 400 {
		t.Fatalf("unknown channel must be refused: %d", code)
	}
	code, body = c.do("PUT", "/api/system/settings", map[string]any{"channel": "edge", "auto": true}, true)
	if code != 200 || body["channel"] != "edge" || body["auto"] != true {
		t.Fatalf("save settings: %d %v", code, body)
	}
	// Not installed by install-core.sh: no root service to act on a request.
	if code, body := c.do("POST", "/api/system/update", map[string]any{}, true); code != 409 || body["error"] != "not_installed" {
		t.Fatalf("update without the installer: %d %v", code, body)
	}
}

func TestChangePassword(t *testing.T) {
	c := signedIn(t)
	if code, body := c.do("POST", "/api/account/password", map[string]string{"current": "wrong one here", "next": "a brand new password"}, true); code != 400 || body["field"] != "current" {
		t.Fatalf("wrong current password: %d %v", code, body)
	}
	if code, body := c.do("POST", "/api/account/password", map[string]string{"current": "correct horse battery", "next": "short"}, true); code != 400 || body["code"] != "too_short" {
		t.Fatalf("short new password: %d %v", code, body)
	}
	if code, _ := c.do("POST", "/api/account/password", map[string]string{"current": "correct horse battery", "next": "a brand new password"}, false); code != 403 {
		t.Fatalf("CSRF header required: %d", code)
	}
	if code, _ := c.do("POST", "/api/account/password", map[string]string{"current": "correct horse battery", "next": "a brand new password"}, true); code != 200 {
		t.Fatalf("change: %d", code)
	}
	// This session stays; the old password no longer works, the new one does.
	if code, body := c.do("GET", "/api/session", nil, false); code != 200 || body["user"] == nil {
		t.Fatalf("session after change: %d %v", code, body)
	}
	if code, _ := c.do("POST", "/api/login", map[string]string{"username": "ops", "password": "correct horse battery"}, true); code != 401 {
		t.Fatalf("old password must fail: %d", code)
	}
	if code, _ := c.do("POST", "/api/login", map[string]string{"username": "ops", "password": "a brand new password"}, true); code != 200 {
		t.Fatalf("new password must work: %d", code)
	}
}
