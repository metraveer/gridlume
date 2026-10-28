package agentlink

import (
	"testing"
	"time"

	"github.com/metraveer/gridlume/internal/agentproto"
)

func TestMinuteAveragesAndMaxima(t *testing.T) {
	m := newMinute()
	t0 := time.Unix(1_800_000_000/60*60, 0)
	snap := func(cpu float64) agentproto.Snapshot {
		return agentproto.Snapshot{CPU: cpu, MemTotal: 100, MemUsed: 25, Disks: []agentproto.Disk{{Total: 100, Used: 10}, {Total: 100, Used: 90}},
			Net: []agentproto.Iface{{Rx: 1, Tx: 2}, {Rx: 3, Tx: 4}}}
	}
	if m.add(snap(10), t0) || m.add(snap(30), t0.Add(20*time.Second)) {
		t.Fatal("a minute must not finish early")
	}
	if !m.add(snap(50), t0.Add(61*time.Second)) {
		t.Fatal("the next minute must finish the previous one")
	}
	got := map[string][2]float64{}
	for _, r := range m.take("n1", t0, false) {
		if r.NodeID != "n1" || r.TS != t0.Unix() {
			t.Fatalf("row %+v", r)
		}
		got[r.Series] = [2]float64{r.Avg, r.Max}
	}
	want := map[string][2]float64{"cpu": {20, 30}, "mem": {25, 25}, "disk": {90, 90}, "rx": {4, 4}, "tx": {6, 6}}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("%s = %v, want %v", k, got[k], v)
		}
	}
	if rest := m.take("n1", t0, true); len(rest) == 0 || rest[0].TS != t0.Unix()+60 {
		t.Fatalf("the unfinished minute must be written when the agent leaves: %+v", rest)
	}
}
