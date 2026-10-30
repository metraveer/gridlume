// Package checks is the core checking what has no agent of its own, from the address written on its
// node: a router or a cloud server is pinged, "host:port" gets a TCP connection, a web address or a
// domain gets an HTTP request and its certificate's expiry date. Machines with an agent report
// themselves, and containers live inside them, so neither is checked from here.
package checks

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/metraveer/gridlume/agent/probe"
	"github.com/metraveer/gridlume/internal/agentproto"
	"github.com/metraveer/gridlume/internal/store"
)

// How often each kind runs.
var (
	TCPEvery  = 20 * time.Second
	HTTPEvery = time.Minute
	Timeout   = 10 * time.Second
)

// Target is what to check for a node.
type Target struct {
	NodeID string
	Kind   string // ping, tcp, http
	Target string // host for ping, host:port for tcp, URL for http
}

// Result is the latest of a node's check.
type Result struct {
	NodeID string  `json:"nodeId"`
	Kind   string  `json:"kind"`
	Target string  `json:"target"`
	OK     bool    `json:"ok"`
	Fails  int     `json:"fails"`          // failed in a row (tcp, http)
	RTT    float64 `json:"rtt"`            // milliseconds
	Loss   float64 `json:"loss,omitempty"` // ping: percent lost in the last minute
	Sent   int     `json:"sent,omitempty"` // ping: pings in that minute
	Status int     `json:"status,omitempty"`
	// CertUntil is when the HTTPS certificate expires (unix seconds); 0 for plain HTTP.
	CertUntil int64  `json:"certUntil,omitempty"`
	Error     string `json:"error,omitempty"`
	At        int64  `json:"at"` // unix milliseconds of the last check; 0 = not yet
}

// Skipped kinds: nothing to reach (the internet itself, a planned node) or reported by its own agent.
var skipKinds = map[string]bool{"internet": true, "container": true}

// Targets lists what to check: every node with an address, no agent, not inside a machine, not planned.
func Targets(m store.Map, withAgent map[string]bool) []Target {
	var out []Target
	for _, n := range m.Nodes {
		if withAgent[n.ID] || n.ParentID != nil || n.State == "planned" || skipKinds[n.Kind] {
			continue
		}
		if t, ok := targetFor(n); ok {
			out = append(out, t)
		}
	}
	return out
}

func targetFor(n store.Node) (Target, bool) {
	a := strings.TrimSpace(n.Address)
	if a == "" || strings.ContainsAny(a, " \t") {
		return Target{}, false
	}
	if strings.HasPrefix(a, "http://") || strings.HasPrefix(a, "https://") {
		if u, err := url.Parse(a); err == nil && u.Host != "" {
			return Target{NodeID: n.ID, Kind: "http", Target: a}, true
		}
		return Target{}, false
	}
	host, _, _ := strings.Cut(a, "/")
	if h, p, err := net.SplitHostPort(host); err == nil && p != "" {
		return Target{NodeID: n.ID, Kind: "tcp", Target: net.JoinHostPort(h, p)}, true
	}
	if ip := net.ParseIP(host); ip != nil {
		if ip.To4() == nil {
			return Target{}, false // IPv6: not yet
		}
		return Target{NodeID: n.ID, Kind: "ping", Target: ip.String()}, true
	}
	// A name: a domain is a website (and its certificate); anything else is a host to ping.
	if n.Kind == "domain" {
		return Target{NodeID: n.ID, Kind: "http", Target: "https://" + strings.ToLower(host) + "/"}, true
	}
	return Target{NodeID: n.ID, Kind: "ping", Target: strings.ToLower(host)}, true
}

// Runner keeps checking the current targets.
type Runner struct {
	HTTP   *http.Client
	Dial   func(ctx context.Context, network, addr string) (net.Conn, error)
	prober *probe.Prober

	mu      sync.Mutex
	targets map[string]Target // by node
	results map[string]Result // tcp and http, by node
	kick    chan struct{}     // a new target: check it now rather than at the next round
}

func New() *Runner {
	d := &net.Dialer{Timeout: Timeout}
	return &Runner{
		HTTP: &http.Client{
			Timeout: Timeout,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 5 {
					return errors.New("too many redirects")
				}
				return nil
			},
		},
		Dial:    d.DialContext,
		prober:  probe.New(),
		targets: map[string]Target{},
		results: map[string]Result{},
		kick:    make(chan struct{}, 1),
	}
}

// SetTargets replaces what is checked; results of targets that stay are kept.
func (r *Runner) SetTargets(ts []Target) {
	r.mu.Lock()
	defer r.mu.Unlock()
	next := map[string]Target{}
	var pings []agentproto.Probe
	fresh := false
	for _, t := range ts {
		if old, ok := r.targets[t.NodeID]; t.Kind != "ping" && (!ok || old != t) {
			fresh = true
		}
		next[t.NodeID] = t
		if t.Kind == "ping" {
			pings = append(pings, agentproto.Probe{ID: t.NodeID, Host: t.Target})
		}
		if old, ok := r.results[t.NodeID]; ok && (old.Kind != t.Kind || old.Target != t.Target) {
			delete(r.results, t.NodeID)
		}
	}
	for id := range r.results {
		if _, ok := next[id]; !ok {
			delete(r.results, id)
		}
	}
	r.targets = next
	r.prober.SetTargets(pings)
	if fresh {
		select {
		case r.kick <- struct{}{}:
		default:
		}
	}
}

// Run checks until ctx ends: pings every 10 seconds, TCP every TCPEvery, HTTP every HTTPEvery.
func (r *Runner) Run(ctx context.Context) {
	go r.prober.Run(ctx)
	tcp := time.NewTicker(TCPEvery)
	defer tcp.Stop()
	web := time.NewTicker(HTTPEvery)
	defer web.Stop()
	r.Round(ctx, "tcp")
	r.Round(ctx, "http")
	for {
		select {
		case <-ctx.Done():
			return
		case <-tcp.C:
			r.Round(ctx, "tcp")
		case <-web.C:
			r.Round(ctx, "http")
		case <-r.kick:
			r.fresh(ctx)
		}
	}
}

// fresh checks the tcp and http targets that have no result yet.
func (r *Runner) fresh(ctx context.Context) {
	r.mu.Lock()
	var ts []Target
	for id, t := range r.targets {
		if _, ok := r.results[id]; !ok && t.Kind != "ping" {
			ts = append(ts, t)
		}
	}
	r.mu.Unlock()
	r.run(ctx, ts)
}

// Round runs every target of one kind (tcp or http) once, all at the same time.
func (r *Runner) Round(ctx context.Context, kind string) {
	r.mu.Lock()
	var ts []Target
	for _, t := range r.targets {
		if t.Kind == kind {
			ts = append(ts, t)
		}
	}
	r.mu.Unlock()
	r.run(ctx, ts)
}

func (r *Runner) run(ctx context.Context, ts []Target) {
	var wg sync.WaitGroup
	for _, t := range ts {
		wg.Add(1)
		go func() {
			defer wg.Done()
			var res Result
			if t.Kind == "tcp" {
				res = r.tcp(ctx, t)
			} else {
				res = r.http(ctx, t)
			}
			if ctx.Err() != nil {
				return
			}
			r.mu.Lock()
			defer r.mu.Unlock()
			if cur, ok := r.targets[t.NodeID]; !ok || cur != t {
				return // the target changed while it ran
			}
			if !res.OK {
				res.Fails = r.results[t.NodeID].Fails + 1
			}
			r.results[t.NodeID] = res
		}()
	}
	wg.Wait()
}

func (r *Runner) tcp(ctx context.Context, t Target) Result {
	res := Result{NodeID: t.NodeID, Kind: t.Kind, Target: t.Target, At: time.Now().UnixMilli()}
	start := time.Now()
	c, err := r.Dial(ctx, "tcp", t.Target)
	if err != nil {
		res.Error = short(err)
		return res
	}
	c.Close()
	res.OK, res.RTT = true, ms(time.Since(start))
	return res
}

func (r *Runner) http(ctx context.Context, t Target) Result {
	res := Result{NodeID: t.NodeID, Kind: t.Kind, Target: t.Target, At: time.Now().UnixMilli()}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, t.Target, nil)
	if err != nil {
		res.Error = short(err)
		return res
	}
	req.Header.Set("User-Agent", "Gridlume-check")
	start := time.Now()
	resp, err := r.HTTP.Do(req)
	if err != nil {
		res.Error = short(err)
		// An invalid or expired certificate is still worth knowing the date of.
		var cerr *tls.CertificateVerificationError
		if errors.As(err, &cerr) && len(cerr.UnverifiedCertificates) > 0 {
			res.CertUntil = cerr.UnverifiedCertificates[0].NotAfter.Unix()
		}
		return res
	}
	resp.Body.Close()
	res.RTT, res.Status = ms(time.Since(start)), resp.StatusCode
	if resp.TLS != nil && len(resp.TLS.PeerCertificates) > 0 {
		res.CertUntil = resp.TLS.PeerCertificates[0].NotAfter.Unix()
	}
	// A server error means the site is broken; 4xx (a login page, a missing "/") still means it answers.
	res.OK = resp.StatusCode < 500
	if !res.OK {
		res.Error = fmt.Sprintf("HTTP %d", resp.StatusCode)
	}
	return res
}

// Results are the latest of every target, by node.
func (r *Runner) Results() map[string]Result {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make(map[string]Result, len(r.targets))
	for id, t := range r.targets {
		if t.Kind != "ping" {
			if res, ok := r.results[id]; ok {
				out[id] = res
			} else {
				out[id] = Result{NodeID: id, Kind: t.Kind, Target: t.Target}
			}
		}
	}
	for _, p := range r.prober.Results() {
		t, ok := r.targets[p.ID]
		if !ok {
			continue
		}
		res := Result{NodeID: p.ID, Kind: "ping", Target: t.Target, RTT: p.RTT, Loss: p.Loss, Sent: p.Sent, Error: p.Error}
		res.OK = p.Error == "" && p.Sent > 0 && p.Loss < 50
		if p.Sent > 0 {
			res.At = time.Now().UnixMilli()
		}
		out[p.ID] = res
	}
	return out
}

func ms(d time.Duration) float64 { return float64(d.Microseconds()) / 1000 }

// short keeps the part of an error people can act on ("connection refused", "no such host", "timeout").
func short(err error) string {
	var dns *net.DNSError
	switch {
	case errors.As(err, &dns):
		return "no such host"
	case errors.Is(err, context.DeadlineExceeded) || strings.Contains(err.Error(), "Client.Timeout") || strings.Contains(err.Error(), "i/o timeout"):
		return "timeout"
	case strings.Contains(err.Error(), "connection refused"):
		return "connection refused"
	case strings.Contains(err.Error(), "certificate"):
		return "certificate"
	}
	return err.Error()
}
