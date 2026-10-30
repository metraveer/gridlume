package checks

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/metraveer/gridlume/internal/store"
)

func ptr[T any](v T) *T { return &v }

func TestTargetsFromAddresses(t *testing.T) {
	m := store.Map{Nodes: []store.Node{
		{ID: "router", Kind: "router", Address: "192.168.1.1"},
		{ID: "nas", Kind: "storage", Address: "nas.lan:5000"},
		{ID: "site", Kind: "service", Address: "https://cloud.example.org/login"},
		{ID: "dom", Kind: "domain", Address: "Example.org"},
		{ID: "vps", Kind: "vps", Address: "203.0.113.10"},
		{ID: "srv", Kind: "server", Address: "192.168.1.63"},                      // has an agent
		{ID: "ctr", Kind: "container", Address: "10.0.0.2", ParentID: ptr("srv")}, // inside a machine
		{ID: "isp", Kind: "internet", Address: "provider"},
		{ID: "later", Kind: "server", Address: "10.0.0.9", State: "planned"},
		{ID: "v6", Kind: "server", Address: "fe80::1"},
		{ID: "none", Kind: "device"},
	}}
	got := map[string]Target{}
	for _, tg := range Targets(m, map[string]bool{"srv": true}) {
		got[tg.NodeID] = tg
	}
	want := map[string]Target{
		"router": {NodeID: "router", Kind: "ping", Target: "192.168.1.1"},
		"nas":    {NodeID: "nas", Kind: "tcp", Target: "nas.lan:5000"},
		"site":   {NodeID: "site", Kind: "http", Target: "https://cloud.example.org/login"},
		"dom":    {NodeID: "dom", Kind: "http", Target: "https://example.org/"},
		"vps":    {NodeID: "vps", Kind: "ping", Target: "203.0.113.10"},
	}
	if len(got) != len(want) {
		t.Fatalf("targets: %+v", got)
	}
	for id, w := range want {
		if got[id] != w {
			t.Errorf("%s: got %+v, want %+v", id, got[id], w)
		}
	}
}

func TestTCPAndHTTP(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			c.Close()
		}
	}()
	closed, _ := net.Listen("tcp", "127.0.0.1:0")
	closedAddr := closed.Addr().String()
	closed.Close()

	ok := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer ok.Close()
	broken := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(502) }))
	defer broken.Close()

	r := New()
	r.HTTP = ok.Client() // trusts the test certificate
	r.SetTargets([]Target{
		{NodeID: "open", Kind: "tcp", Target: ln.Addr().String()},
		{NodeID: "shut", Kind: "tcp", Target: closedAddr},
		{NodeID: "site", Kind: "http", Target: ok.URL},
		{NodeID: "bad", Kind: "http", Target: broken.URL},
	})
	ctx := context.Background()
	r.Round(ctx, "tcp")
	r.Round(ctx, "tcp")
	r.Round(ctx, "http")
	res := r.Results()
	if !res["open"].OK || res["open"].Fails != 0 {
		t.Errorf("open port: %+v", res["open"])
	}
	if res["shut"].OK || res["shut"].Fails != 2 || res["shut"].Error == "" {
		t.Errorf("closed port, failed twice in a row: %+v", res["shut"])
	}
	if !res["site"].OK || res["site"].Status != 200 || res["site"].CertUntil == 0 {
		t.Errorf("https site: %+v", res["site"])
	}
	if res["bad"].OK || res["bad"].Status != 502 || res["bad"].Error != "HTTP 502" {
		t.Errorf("server error: %+v", res["bad"])
	}
	// A target that changes forgets the old result.
	r.SetTargets([]Target{{NodeID: "open", Kind: "tcp", Target: closedAddr}})
	if res := r.Results(); len(res) != 1 || res["open"].At != 0 {
		t.Errorf("after a change: %+v", res)
	}
}

func TestNewTargetIsCheckedAtOnce(t *testing.T) {
	site := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer site.Close()
	r := New()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go r.Run(ctx)
	r.SetTargets([]Target{{NodeID: "site", Kind: "http", Target: site.URL}})
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if res := r.Results()["site"]; res.At != 0 {
			if !res.OK || res.Status != 200 {
				t.Fatalf("result: %+v", res)
			}
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("a new address must be checked within seconds, not at the next minute")
}
