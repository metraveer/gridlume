package server

import (
	"io"
	"strings"
	"testing"
)

func TestNotifySettings(t *testing.T) {
	c := signedIn(t)
	_, st := c.do("GET", "/api/notify", nil, false)
	rules := st["rules"].(map[string]any)
	if rules["warn"] != true || rules["quietFrom"] != "23:00" || st["telegram"].(map[string]any)["connected"] != false {
		t.Fatalf("defaults: %v", st)
	}
	if code, _ := c.do("PUT", "/api/notify/rules", map[string]any{"warn": false, "resolved": true, "quiet": true, "quietFrom": "22:30", "quietTo": "7:00", "lang": "ru"}, true); code != 400 {
		t.Fatalf("7:00 is not HH:MM: %d", code)
	}
	code, st := c.do("PUT", "/api/notify/rules", map[string]any{"warn": false, "resolved": true, "quiet": true, "quietFrom": "22:30", "quietTo": "07:00", "lang": "en"}, true)
	if code != 200 || st["rules"].(map[string]any)["warn"] != false || st["rules"].(map[string]any)["lang"] != "en" {
		t.Fatalf("save: %d %v", code, st)
	}
	if code, _ := c.do("POST", "/api/notify/test", nil, true); code != 409 {
		t.Fatalf("test without a bot: %d", code)
	}
	// Whatever happens, the token is never in an answer.
	res, _ := c.http.Get(c.base + "/api/notify")
	b, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if strings.Contains(string(b), "token") {
		t.Fatalf("the answer must not carry a token field: %s", b)
	}
}
