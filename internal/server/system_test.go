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
