// Package probe pings the far ends of network links for their latency and loss: one small ICMP echo
// per host every Every, judged over the last Window of them. That is a few dozen bytes a minute per
// link, unnoticeable on any network.
package probe

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/metraveer/gridlume/internal/agentproto"
)

// Every is how often each host is pinged; Window how many recent pings the result is about (a minute).
var (
	Every   = 10 * time.Second
	Window  = 6
	Timeout = 2 * time.Second
)

// ErrNoICMP: this system does not let an unprivileged user ping (net.ipv4.ping_group_range).
var ErrNoICMP = errors.New("no_icmp")

// ErrResolve: the host name did not resolve to an IPv4 address.
var ErrResolve = errors.New("resolve")

// Prober keeps pinging the hosts it was given. Ping is the real ICMP echo; tests replace it.
type Prober struct {
	Ping func(ctx context.Context, host string, timeout time.Duration) (time.Duration, error)

	mu      sync.Mutex
	targets []agentproto.Probe
	hist    map[string][]sample // by probe id
	errs    map[string]string
}

type sample struct {
	ok  bool
	rtt time.Duration
}

func New() *Prober {
	return &Prober{Ping: ping, hist: map[string][]sample{}, errs: map[string]string{}}
}

// SetTargets replaces the list. Hosts that stay keep their history.
func (p *Prober) SetTargets(ts []agentproto.Probe) {
	p.mu.Lock()
	defer p.mu.Unlock()
	keep := map[string]bool{}
	for _, t := range ts {
		keep[t.ID+"|"+t.Host] = true
	}
	for _, old := range p.targets {
		if !keep[old.ID+"|"+old.Host] {
			delete(p.hist, old.ID)
			delete(p.errs, old.ID)
		}
	}
	p.targets = append([]agentproto.Probe(nil), ts...)
}

// Run pings every target each Every until ctx ends.
func (p *Prober) Run(ctx context.Context) {
	t := time.NewTicker(Every)
	defer t.Stop()
	for {
		p.Round(ctx)
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// Round pings every target once, all at the same time.
func (p *Prober) Round(ctx context.Context) {
	p.mu.Lock()
	ts := append([]agentproto.Probe(nil), p.targets...)
	p.mu.Unlock()
	var wg sync.WaitGroup
	for _, t := range ts {
		wg.Add(1)
		go func() {
			defer wg.Done()
			rtt, err := p.Ping(ctx, t.Host, Timeout)
			if ctx.Err() != nil {
				return
			}
			p.record(t, rtt, err)
		}()
	}
	wg.Wait()
}

func (p *Prober) record(t agentproto.Probe, rtt time.Duration, err error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	// A setup problem (cannot resolve, cannot ping at all) is not a lost packet.
	if errors.Is(err, ErrNoICMP) || errors.Is(err, ErrResolve) {
		p.errs[t.ID] = err.Error()
		return
	}
	delete(p.errs, t.ID)
	h := append(p.hist[t.ID], sample{ok: err == nil, rtt: rtt})
	if len(h) > Window {
		h = h[len(h)-Window:]
	}
	p.hist[t.ID] = h
}

// Results are the current figures for every target.
func (p *Prober) Results() []agentproto.ProbeResult {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := make([]agentproto.ProbeResult, 0, len(p.targets))
	for _, t := range p.targets {
		r := agentproto.ProbeResult{ID: t.ID, Host: t.Host, Error: p.errs[t.ID]}
		var sum time.Duration
		ok := 0
		for _, s := range p.hist[t.ID] {
			r.Sent++
			if s.ok {
				ok++
				sum += s.rtt
			}
		}
		if r.Sent > 0 {
			r.Loss = 100 * float64(r.Sent-ok) / float64(r.Sent)
		}
		if ok > 0 {
			r.RTT = float64(sum.Microseconds()) / float64(ok) / 1000
		}
		out = append(out, r)
	}
	return out
}
