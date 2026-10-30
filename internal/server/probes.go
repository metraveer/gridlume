package server

import (
	"context"
	"net"
	"net/url"
	"strings"

	"github.com/metraveer/gridlume/internal/agentproto"
)

// Network links: their far end is worth pinging for latency and loss (the same kinds that show traffic).
var pingedKinds = map[string]bool{"uplink": true, "lan": true, "wifi": true, "vpn": true}

// probesFor lists what the agent of a node should ping: for each of its network links, the address of
// the node at the other end, if that node has one. The probe's id is the link's, so the interface can
// show the result on the link.
func (a *api) probesFor(ctx context.Context, nodeID string) []agentproto.Probe {
	m, err := a.store.GetMap(ctx)
	if err != nil {
		a.log.Warn("probes: map", "err", err)
		return nil
	}
	addr := make(map[string]string, len(m.Nodes))
	for _, n := range m.Nodes {
		addr[n.ID] = n.Address
	}
	out := []agentproto.Probe{}
	for _, l := range m.Links {
		if l.Planned || !pingedKinds[l.Kind] {
			continue
		}
		far := ""
		switch nodeID {
		case l.FromID:
			far = l.ToID
		case l.ToID:
			far = l.FromID
		default:
			continue
		}
		if h := pingHost(addr[far]); h != "" {
			out = append(out, agentproto.Probe{ID: l.ID, Host: h})
		}
	}
	return out
}

// pingHost takes what people write as an address ("192.168.1.1", "nas.lan:5000", "https://vps.example/",
// "10.0.0.5/24") and returns the host to ping, or "" when there is none (an IPv6 address: not yet).
func pingHost(address string) string {
	s := strings.TrimSpace(address)
	if s == "" || strings.ContainsAny(s, " \t") {
		return ""
	}
	if strings.Contains(s, "://") {
		u, err := url.Parse(s)
		if err != nil {
			return ""
		}
		s = u.Hostname()
	} else {
		s, _, _ = strings.Cut(s, "/")
		if h, _, err := net.SplitHostPort(s); err == nil {
			s = h
		}
	}
	if ip := net.ParseIP(s); ip != nil {
		if ip.To4() == nil {
			return ""
		}
		return ip.String()
	}
	if strings.Contains(s, ":") {
		return ""
	}
	return strings.ToLower(s)
}

// mapChanged tells connected agents what to ping now. In the background: a slow agent must not hold up
// the answer to the person who edited the map.
func (a *api) mapChanged() {
	go a.hub.RefreshProbes(context.Background())
}
