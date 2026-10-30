// Package outside answers "what is visible from the internet": which of this installation's public
// addresses accept connections on which ports. The core cannot see that itself — from inside, the
// router answers differently — so a duty core elsewhere (a cloud server) connects to the addresses and
// reports back. This package decides what to check (Targets), checks it (Scan) and says how risky an
// open port is (Services).
package outside

import (
	"context"
	"net"
	"net/netip"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/metraveer/gridlume/internal/agentproto"
	"github.com/metraveer/gridlume/internal/store"
)

// Limits keep a check small and polite: a few addresses, a few dozen ports, a short wait for each.
const (
	MaxHosts = 8
	MaxPorts = 48
	MaxIPs   = 8
)

var (
	DialTimeout = 3 * time.Second
	Parallel    = 32
)

// AllowPrivate lets tests (and a test stand on one computer) check local addresses. A real duty core
// never connects to private addresses: what is behind its own router is not "the internet".
var AllowPrivate atomic.Bool

// Service is what usually listens on a port, and how bad it is when anyone can reach it.
type Service struct {
	Name string
	// Risk: "nopass" — often runs without a password, anyone can read or take over; "login" — guarded
	// by a password that will be guessed day and night; "" — meant to be public (a site, SSH with keys).
	Risk string
}

// Services are the ports always checked, in this order, with what they usually are.
var Services = []struct {
	Port int
	Service
}{
	{80, Service{"HTTP", ""}}, {443, Service{"HTTPS", ""}}, {22, Service{"SSH", ""}},
	{2375, Service{"Docker API", "nopass"}}, {6379, Service{"Redis", "nopass"}}, {27017, Service{"MongoDB", "nopass"}},
	{9200, Service{"Elasticsearch", "nopass"}}, {11211, Service{"Memcached", "nopass"}}, {23, Service{"Telnet", "nopass"}},
	{3389, Service{"RDP", "login"}}, {5900, Service{"VNC", "login"}}, {445, Service{"SMB", "login"}},
	{3306, Service{"MySQL", "login"}}, {5432, Service{"PostgreSQL", "login"}}, {1433, Service{"MS SQL", "login"}},
	{21, Service{"FTP", "login"}}, {2376, Service{"Docker API (TLS)", "login"}},
	{8080, Service{"HTTP", ""}}, {8443, Service{"HTTPS", ""}}, {8000, Service{"HTTP", ""}}, {8888, Service{"HTTP", ""}},
	{3000, Service{"HTTP", ""}}, {5000, Service{"HTTP", ""}}, {9000, Service{"HTTP", ""}}, {9090, Service{"HTTP", ""}},
	{25, Service{"SMTP", ""}}, {53, Service{"DNS", ""}},
}

// ServiceOf says what a port usually is; an unknown port has an empty name.
func ServiceOf(port int) Service {
	for _, s := range Services {
		if s.Port == port {
			return s.Service
		}
	}
	return Service{}
}

// Target is what the core asks its duty core to check.
type Target struct {
	Hosts []string `json:"hosts"` // names and addresses
	Ports []int    `json:"ports"`
}

// Open is a port that accepted a connection.
type Open struct {
	Port int     `json:"port"`
	Ms   float64 `json:"ms"`
}

// Found is one public address and what is open on it.
type Found struct {
	IP    string   `json:"ip"`
	Names []string `json:"names"` // the hosts that led to it
	Open  []Open   `json:"open"`
}

// Result is one check from outside.
type Result struct {
	At    int64    `json:"at"` // unix milliseconds
	By    string   `json:"by"` // the duty core's name
	Ports []int    `json:"ports"`
	Found []Found  `json:"found"`
	Skip  []string `json:"skip,omitempty"` // hosts that did not resolve or are not public
}

var portIn = regexp.MustCompile(`\b(\d{2,5})\b`)

// Targets lists what to check for a map: its domains and public addresses, and the ports the map and
// the machines speak of first (published container ports, ports on links from the internet), then the
// usual ones.
func Targets(m store.Map, snaps map[string]agentproto.Snapshot) Target {
	var t Target
	addHost := func(h string) {
		if h != "" && len(t.Hosts) < MaxHosts && !slices.Contains(t.Hosts, h) {
			t.Hosts = append(t.Hosts, h)
		}
	}
	addPort := func(p int) {
		if p > 0 && p < 65536 && len(t.Ports) < MaxPorts && !slices.Contains(t.Ports, p) {
			t.Ports = append(t.Ports, p)
		}
	}
	entry := map[string]bool{}
	for _, n := range m.Nodes {
		if n.State == "planned" {
			continue
		}
		switch h := HostOf(n.Address); {
		case n.Kind == "domain":
			entry[n.ID] = true
			if h == "" && strings.Contains(n.Name, ".") && !strings.ContainsAny(n.Name, " /") {
				h = strings.ToLower(n.Name)
			}
			addHost(h)
		case n.Kind == "internet":
			entry[n.ID] = true
		case h != "" && publicLiteral(h):
			addHost(h)
		}
	}
	for _, l := range m.Links {
		if entry[l.FromID] && !l.Planned {
			for _, p := range portIn.FindAllString(l.Proto, -1) {
				n, _ := strconv.Atoi(p)
				addPort(n)
			}
		}
	}
	for _, id := range sortedKeys(snaps) {
		if d := snaps[id].Docker; d != nil {
			for _, c := range d.Containers {
				for _, p := range c.Ports {
					if p.Public > 0 && p.Proto != "udp" && (p.IP == "" || p.IP == "0.0.0.0" || p.IP == "::") {
						addPort(p.Public)
					}
				}
			}
		}
	}
	for _, s := range Services {
		addPort(s.Port)
	}
	return t
}

// HostOf takes the host out of an address written on a node: "1.2.3.4", "host:8080", "https://host/".
func HostOf(a string) string {
	a = strings.TrimSpace(a)
	if a == "" || strings.ContainsAny(a, " \t") {
		return ""
	}
	if strings.Contains(a, "://") {
		if u, err := url.Parse(a); err == nil {
			return strings.ToLower(u.Hostname())
		}
		return ""
	}
	if h, _, err := net.SplitHostPort(a); err == nil {
		return strings.ToLower(h)
	}
	return strings.ToLower(strings.Trim(a, "[]"))
}

// publicLiteral: the address is an IP and a public one (names are resolved by the duty core).
func publicLiteral(h string) bool {
	ip, err := netip.ParseAddr(h)
	return err == nil && Public(ip)
}

// Public: an address on the internet, not a local, private or special one.
func Public(ip netip.Addr) bool {
	ip = ip.Unmap()
	if !ip.IsValid() || ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsMulticast() || ip.IsUnspecified() {
		return false
	}
	// Carrier-grade NAT (100.64/10) is the provider's private network: not reachable from outside.
	return !netip.MustParsePrefix("100.64.0.0/10").Contains(ip)
}

// Scan connects to every port of every public address the hosts lead to and returns what answered.
func Scan(ctx context.Context, t Target, by string) Result {
	res := Result{At: time.Now().UnixMilli(), By: by, Ports: clampPorts(t.Ports), Found: []Found{}}
	names := map[string][]string{} // ip → hosts
	var order []string
	var r net.Resolver
	for _, h := range t.Hosts {
		if len(order) >= MaxIPs {
			break
		}
		h = strings.ToLower(strings.TrimSpace(h))
		var ips []netip.Addr
		if ip, err := netip.ParseAddr(h); err == nil {
			ips = []netip.Addr{ip}
		} else if h != "" {
			lctx, cancel := context.WithTimeout(ctx, 5*time.Second)
			ips, _ = r.LookupNetIP(lctx, "ip", h)
			cancel()
		}
		ip, ok := pick(ips)
		if !ok {
			res.Skip = append(res.Skip, h)
			continue
		}
		key := ip.String()
		if _, seen := names[key]; !seen {
			order = append(order, key)
		}
		if !slices.Contains(names[key], h) {
			names[key] = append(names[key], h)
		}
	}

	type job struct{ ip, port int }
	found := make([]Found, len(order))
	for i, ip := range order {
		found[i] = Found{IP: ip, Names: names[ip], Open: []Open{}}
	}
	jobs := make(chan job)
	var mu sync.Mutex
	var wg sync.WaitGroup
	for range Parallel {
		wg.Add(1)
		go func() {
			defer wg.Done()
			d := net.Dialer{Timeout: DialTimeout}
			for j := range jobs {
				addr := net.JoinHostPort(order[j.ip], strconv.Itoa(j.port))
				start := time.Now()
				c, err := d.DialContext(ctx, "tcp", addr)
				if err != nil {
					continue
				}
				ms := float64(time.Since(start).Microseconds()) / 1000
				_ = c.Close()
				mu.Lock()
				found[j.ip].Open = append(found[j.ip].Open, Open{Port: j.port, Ms: ms})
				mu.Unlock()
			}
		}()
	}
	for i := range order {
		for _, p := range res.Ports {
			select {
			case jobs <- job{i, p}:
			case <-ctx.Done():
			}
		}
	}
	close(jobs)
	wg.Wait()
	for i := range found {
		slices.SortFunc(found[i].Open, func(a, b Open) int { return a.Port - b.Port })
	}
	res.Found = found
	return res
}

// pick chooses the address to check: IPv4 first (most home connections), public only.
func pick(ips []netip.Addr) (netip.Addr, bool) {
	slices.SortStableFunc(ips, func(a, b netip.Addr) int {
		if a.Unmap().Is4() == b.Unmap().Is4() {
			return 0
		}
		if a.Unmap().Is4() {
			return -1
		}
		return 1
	})
	for _, ip := range ips {
		if AllowPrivate.Load() || Public(ip) {
			return ip.Unmap(), true
		}
	}
	return netip.Addr{}, false
}

func clampPorts(ps []int) []int {
	out := []int{}
	for _, p := range ps {
		if p > 0 && p < 65536 && !slices.Contains(out, p) && len(out) < MaxPorts {
			out = append(out, p)
		}
	}
	return out
}

func sortedKeys[V any](m map[string]V) []string {
	ks := make([]string, 0, len(m))
	for k := range m {
		ks = append(ks, k)
	}
	slices.Sort(ks)
	return ks
}
