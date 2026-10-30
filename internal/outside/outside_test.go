package outside

import (
	"context"
	"net"
	"net/netip"
	"slices"
	"testing"

	"github.com/metraveer/gridlume/internal/agentproto"
	"github.com/metraveer/gridlume/internal/store"
)

func ptr(s string) *string { return &s }

var testMap = store.Map{
	Nodes: []store.Node{
		{ID: "inet", Kind: "internet", Name: "Internet"},
		{ID: "dom", Kind: "domain", Name: "Example.org"},
		{ID: "dom2", Kind: "domain", Name: "cloud", Address: "https://cloud.example.org/"},
		{ID: "router", Kind: "router", Name: "Router", Address: "192.168.1.1"},
		{ID: "vps", Kind: "vps", Name: "VPS", Address: "203.0.113.7:2222"},
		{ID: "srv", Kind: "server", Name: "home"},
		{ID: "app", Kind: "container", Name: "app", ParentID: ptr("srv"), ExtKey: "docker:app/app"},
		{ID: "old", Kind: "domain", Name: "old.example.org", State: "planned"},
	},
	Links: []store.Link{
		{ID: "l1", FromID: "dom", ToID: "srv", Kind: "dns", Proto: "HTTPS · 443"},
		{ID: "l2", FromID: "inet", ToID: "vps", Kind: "uplink", Proto: "WireGuard 51820"},
		{ID: "l3", FromID: "srv", ToID: "app", Kind: "http", Proto: "HTTP 9999"}, // not from the internet
	},
}

var testSnaps = map[string]agentproto.Snapshot{
	"srv": {Docker: &agentproto.Docker{Containers: []agentproto.Container{
		{Name: "app-app-1", Project: "app", Service: "app",
			Ports: []agentproto.Port{{Private: 80, Public: 8081, Proto: "tcp", IP: "0.0.0.0"}, {Private: 53, Public: 5353, Proto: "udp"}, {Private: 9, Public: 7000, Proto: "tcp", IP: "127.0.0.1"}}},
	}}},
}

func TestTargets(t *testing.T) {
	tg := Targets(testMap, testSnaps)
	// Domains (by name or address) and public addresses; never a private one or a planned node.
	if !slices.Equal(tg.Hosts, []string{"example.org", "cloud.example.org", "203.0.113.7"}) {
		t.Fatalf("hosts: %v", tg.Hosts)
	}
	// The map's own ports first: links from the internet, then published container ports (not udp, not local only).
	if !slices.Equal(tg.Ports[:3], []int{443, 51820, 8081}) || slices.Contains(tg.Ports, 9999) || slices.Contains(tg.Ports, 5353) || slices.Contains(tg.Ports, 7000) {
		t.Fatalf("ports: %v", tg.Ports)
	}
	if !slices.Contains(tg.Ports, 6379) || len(tg.Ports) > MaxPorts {
		t.Fatalf("usual ports missing or too many: %v", tg.Ports)
	}
}

func TestPublic(t *testing.T) {
	for addr, want := range map[string]bool{"8.8.8.8": true, "2a00:1450::1": true, "10.0.0.1": false, "192.168.1.1": false,
		"127.0.0.1": false, "100.72.1.1": false, "169.254.1.1": false, "::1": false, "fd00::1": false} {
		if got := Public(netip.MustParseAddr(addr)); got != want {
			t.Errorf("%s: %v", addr, got)
		}
	}
}

func TestScanFindsOpenPortsAndSkipsPrivate(t *testing.T) {
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
	open := l.Addr().(*net.TCPAddr).Port
	closed := freePort(t)

	// A real duty core refuses local addresses.
	r := Scan(context.Background(), Target{Hosts: []string{"127.0.0.1"}, Ports: []int{open}}, "duty")
	if len(r.Found) != 0 || !slices.Equal(r.Skip, []string{"127.0.0.1"}) {
		t.Fatalf("private address checked: %+v", r)
	}

	AllowPrivate.Store(true)
	defer AllowPrivate.Store(false)
	r = Scan(context.Background(), Target{Hosts: []string{"127.0.0.1", "localhost"}, Ports: []int{closed, open, open}}, "duty")
	if r.By != "duty" || len(r.Found) != 1 || r.Found[0].IP != "127.0.0.1" {
		t.Fatalf("found: %+v", r)
	}
	f := r.Found[0]
	if len(f.Open) != 1 || f.Open[0].Port != open || !slices.Equal(r.Ports, []int{closed, open}) {
		t.Fatalf("open: %+v ports %v", f.Open, r.Ports)
	}
}

func TestSignalsAndExplain(t *testing.T) {
	r := &Result{Found: []Found{{IP: "198.51.100.4", Names: []string{"example.org"}, Open: []Open{{Port: 443}, {Port: 8081}, {Port: 5432}, {Port: 2375}}}}}
	if got := Explain(testMap, testSnaps, 8081); !slices.Equal(got, []string{"app"}) {
		t.Fatalf("8081 leads to %v", got)
	}
	if got := Explain(testMap, testSnaps, 443); !slices.Equal(got, []string{"srv"}) {
		t.Fatalf("443 leads to %v", got)
	}
	if got := Explain(testMap, testSnaps, 2222); !slices.Equal(got, []string{"vps"}) {
		t.Fatalf("2222 leads to %v", got)
	}
	sigs := Signals(r, testMap, testSnaps)
	if len(sigs) != 2 {
		t.Fatalf("signals: %+v", sigs)
	}
	pg, docker := sigs[0], sigs[1]
	if pg.Kind != "exposed_login" || pg.Severity != "warn" || pg.Params["port"] != "5432" || pg.Params["host"] != "example.org" || pg.Key != "outside:198.51.100.4:5432" {
		t.Fatalf("postgres: %+v", pg)
	}
	if docker.Kind != "exposed_nopass" || docker.Severity != "crit" || docker.NodeID != "" {
		t.Fatalf("docker: %+v", docker)
	}
	if Signals(nil, testMap, testSnaps) != nil {
		t.Fatal("no check, no problems")
	}
}

func TestHostOf(t *testing.T) {
	for in, want := range map[string]string{"1.2.3.4": "1.2.3.4", "Host:8080": "host", "https://a.b/c": "a.b", "[::1]:80": "::1", "a b": "", "": ""} {
		if got := HostOf(in); got != want {
			t.Errorf("%q: %q", in, got)
		}
	}
}

func freePort(t *testing.T) int {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	p := l.Addr().(*net.TCPAddr).Port
	_ = l.Close()
	return p
}
