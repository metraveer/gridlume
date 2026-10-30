package probe

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/metraveer/gridlume/internal/agentproto"
)

func TestLossAndLatencyOverTheWindow(t *testing.T) {
	answers := []error{nil, errors.New("timeout"), nil, nil, errors.New("timeout"), nil, nil, nil}
	i := 0
	p := New()
	p.Ping = func(context.Context, string, time.Duration) (time.Duration, error) {
		err := answers[i%len(answers)]
		i++
		return 4 * time.Millisecond, err
	}
	p.SetTargets([]agentproto.Probe{{ID: "l1", Host: "192.168.1.1"}})
	for range 8 {
		p.Round(context.Background())
	}
	// Only the last six count: ok, ok, lost, ok, ok, ok.
	r := p.Results()[0]
	if r.Sent != 6 || r.RTT != 4 || r.Loss < 16.6 || r.Loss > 16.7 {
		t.Fatalf("result %+v", r)
	}
}

func TestSetupErrorsAreNotLoss(t *testing.T) {
	p := New()
	p.Ping = func(_ context.Context, host string, _ time.Duration) (time.Duration, error) {
		if host == "nowhere.invalid" {
			return 0, ErrResolve
		}
		return time.Millisecond, nil
	}
	p.SetTargets([]agentproto.Probe{{ID: "a", Host: "nowhere.invalid"}, {ID: "b", Host: "10.0.0.1"}})
	p.Round(context.Background())
	rs := p.Results()
	if rs[0].Error != "resolve" || rs[0].Sent != 0 || rs[0].Loss != 0 {
		t.Fatalf("unresolvable host: %+v", rs[0])
	}
	if rs[1].Error != "" || rs[1].Sent != 1 {
		t.Fatalf("good host: %+v", rs[1])
	}
	// A new list keeps the history of hosts that stay and drops the rest.
	p.SetTargets([]agentproto.Probe{{ID: "b", Host: "10.0.0.1"}})
	if rs := p.Results(); len(rs) != 1 || rs[0].Sent != 1 {
		t.Fatalf("after a new list: %+v", rs)
	}
}

func TestRealPingOfLoopback(t *testing.T) {
	rtt, err := ping(context.Background(), "127.0.0.1", time.Second)
	if errors.Is(err, ErrNoICMP) {
		t.Skip("this system does not allow unprivileged ping")
	}
	if err != nil || rtt <= 0 {
		t.Fatalf("ping 127.0.0.1: %v %v", rtt, err)
	}
}
