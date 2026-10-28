package agentlink

import (
	"time"

	"github.com/metraveer/gridlume/internal/agentproto"
	"github.com/metraveer/gridlume/internal/store"
)

// minute gathers the snapshots of one minute into averages and maxima per series.
type minute struct {
	start int64 // unix seconds of the minute being gathered; 0 = nothing yet
	sum   map[string]float64
	max   map[string]float64
	n     map[string]int
	done  []store.MetricRow // finished minutes waiting to be written
}

func newMinute() *minute {
	return &minute{sum: map[string]float64{}, max: map[string]float64{}, n: map[string]int{}}
}

// Values are the series stored for a snapshot. Percentages for cpu/mem/swap/disk, °C, bytes per second.
func Values(s agentproto.Snapshot) map[string]float64 {
	v := map[string]float64{"cpu": s.CPU, "load1": s.Load1}
	if s.MemTotal > 0 {
		v["mem"] = 100 * float64(s.MemUsed) / float64(s.MemTotal)
	}
	if s.SwapTotal > 0 {
		v["swap"] = 100 * float64(s.SwapUsed) / float64(s.SwapTotal)
	}
	// The fullest disk is the one that matters for "will it run out".
	for _, d := range s.Disks {
		if d.Total > 0 {
			p := 100 * float64(d.Used) / float64(d.Total)
			if p > v["disk"] {
				v["disk"] = p
			}
		}
	}
	for _, t := range s.Temps {
		if t.C > v["temp"] {
			v["temp"] = t.C
		}
	}
	var rx, tx float64
	for _, i := range s.Net {
		rx += i.Rx
		tx += i.Tx
	}
	v["rx"], v["tx"] = rx, tx
	return v
}

// add takes a snapshot; it returns true when a minute has finished and can be written.
func (m *minute) add(s agentproto.Snapshot, now time.Time) bool {
	start := now.Unix() / 60 * 60
	finished := false
	if m.start != 0 && start != m.start {
		m.close()
		finished = true
	}
	m.start = start
	for k, x := range Values(s) {
		m.sum[k] += x
		m.n[k]++
		if m.n[k] == 1 || x > m.max[k] {
			m.max[k] = x
		}
	}
	return finished
}

func (m *minute) close() {
	for k, n := range m.n {
		if n == 0 {
			continue
		}
		m.done = append(m.done, store.MetricRow{Series: k, Point: store.Point{TS: m.start, Avg: m.sum[k] / float64(n), Max: m.max[k]}})
	}
	m.sum, m.max, m.n = map[string]float64{}, map[string]float64{}, map[string]int{}
}

// take returns finished minutes for the node; with all, the minute in progress is finished too.
func (m *minute) take(nodeID string, _ time.Time, all bool) []store.MetricRow {
	if all && m.start != 0 {
		m.close()
		m.start = 0
	}
	rows := m.done
	m.done = nil
	for i := range rows {
		rows[i].NodeID = nodeID
	}
	return rows
}
