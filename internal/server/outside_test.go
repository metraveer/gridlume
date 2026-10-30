package server

import (
	"context"
	"encoding/json"
	"net"
	"strconv"
	"testing"
	"time"

	"github.com/metraveer/gridlume/internal/outside"
	"github.com/metraveer/gridlume/internal/store"
)

func TestDutyCoreChecksFromOutside(t *testing.T) {
	outside.AllowPrivate.Store(true) // both cores and the "public" address are on this computer
	defer outside.AllowPrivate.Store(false)
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()
	go func() {
		for {
			c, err := l.Accept()
			if err != nil {
				return
			}
			_ = c.Close()
		}
	}()
	port := l.Addr().(*net.TCPAddr).Port

	main, mc, mainSrv := core(t)
	_, dc, _ := core(t)
	ctx := context.Background()
	// The map says the internet reaches the site on that port.
	inet, err := main.store.CreateNode(ctx, store.Node{Kind: "internet", Name: "Internet"})
	if err != nil {
		t.Fatal(err)
	}
	site, _ := main.store.CreateNode(ctx, store.Node{Kind: "service", Name: "site"})
	if _, err := main.store.CreateLink(ctx, store.Link{FromID: inet.ID, ToID: site.ID, Kind: "http", Proto: "HTTP " + strconv.Itoa(port)}); err != nil {
		t.Fatal(err)
	}

	// Before any duty core: nothing checked, and the page says what would be.
	_, st := mc.do("GET", "/api/outside", nil, false)
	if st["result"] != nil || st["target"].(map[string]any)["ports"].([]any)[0].(float64) != float64(port) {
		t.Fatalf("before: %v", st)
	}

	// Pairing hands out the list at once; the duty core checks the main core's own address and reports.
	_, out := mc.do("POST", "/api/watch/duty", nil, true)
	code := out["code"].(string)
	if s, _ := dc.do("PUT", "/api/watch/target", map[string]string{"url": mainSrv.URL, "code": code}, true); s != 200 {
		t.Fatalf("pair: %d", s)
	}
	var res map[string]any
	for i := 0; i < 100 && res == nil; i++ {
		time.Sleep(100 * time.Millisecond)
		_, st = mc.do("GET", "/api/outside", nil, false)
		res, _ = st["result"].(map[string]any)
	}
	if res == nil {
		t.Fatal("no result from the duty core")
	}
	found := res["found"].([]any)
	if len(found) != 1 {
		t.Fatalf("found: %v", res)
	}
	f := found[0].(map[string]any)
	var o map[string]any // this computer may have more open (SMB on Windows): look for ours
	for _, x := range f["open"].([]any) {
		if x.(map[string]any)["port"].(float64) == float64(port) {
			o = x.(map[string]any)
		}
	}
	if f["ip"] != "127.0.0.1" || o == nil {
		t.Fatalf("open: %v", f)
	}
	if nodes := o["nodes"].([]any); len(nodes) != 1 || nodes[0] != site.ID {
		t.Fatalf("the open port leads to the site: %v", o)
	}

	// Not again until due; asking makes it due with the next check.
	if main.outsideDue(ctx, time.Now().Add(5*time.Minute)) != nil {
		t.Fatal("checked a moment ago: not due")
	}
	mc.do("POST", "/api/outside/check", nil, true)
	if main.outsideDue(ctx, time.Now().Add(5*time.Minute)) == nil {
		t.Fatal("asked: due")
	}
	if main.outsideDue(ctx, time.Now().Add(6*time.Minute)) != nil {
		t.Fatal("handed out a minute ago: the duty core is checking")
	}

	// A risky port open is a problem; unpairing forgets what the duty core saw.
	b, _ := json.Marshal(outside.Result{At: 1, Found: []outside.Found{{IP: "198.51.100.4", Open: []outside.Open{{Port: 6379}}}}})
	_ = main.store.SetSetting(ctx, settingOutside, string(b))
	m, _ := main.store.GetMap(ctx)
	if s := main.outsideSignals(ctx, m); len(s) != 1 || s[0].Kind != "exposed_nopass" {
		t.Fatalf("signals: %+v", s)
	}
	mc.do("DELETE", "/api/watch/duty", nil, true)
	if s := main.outsideSignals(ctx, m); len(s) != 0 {
		t.Fatalf("after unpairing: %+v", s)
	}

	// Only the duty core may report.
	if s, _ := mc.do("POST", "/api/watch/outside", map[string]any{}, true); s != 401 {
		t.Fatalf("a report without the code: %d", s)
	}
}
