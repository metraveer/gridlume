//go:build linux

package collect

import (
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/metraveer/gridlume/internal/agentproto"
)

// Collector remembers the previous counters, so CPU and network can be turned into rates.
type Collector struct {
	prevCPU cpuTimes
	prevNet map[string][2]uint64
	prevAt  time.Time
}

func New() *Collector { return &Collector{} }

func read(path string) string {
	b, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return string(b)
}

// Info describes the machine.
func Info(version, mode string) agentproto.Info {
	host, _ := os.Hostname()
	var u syscall.Utsname
	kernel := ""
	if syscall.Uname(&u) == nil {
		kernel = utsString(u.Release[:])
	}
	return agentproto.Info{Hostname: host, OS: parseOSRelease(read("/etc/os-release")), Kernel: kernel, Arch: runtime.GOARCH, Version: version, Mode: mode}
}

func utsString[T int8 | uint8](b []T) string {
	var s strings.Builder
	for _, c := range b {
		if c == 0 {
			break
		}
		s.WriteByte(byte(c))
	}
	return s.String()
}

// Snapshot reads the machine now. The first call has no previous counters, so CPU and network are 0.
func (c *Collector) Snapshot() agentproto.Snapshot {
	now := time.Now()
	s := agentproto.Snapshot{At: now.UnixMilli()}

	cpu, cores := parseStat(read("/proc/stat"))
	if !c.prevAt.IsZero() {
		s.CPU = cpuPercent(c.prevCPU, cpu)
	}
	c.prevCPU = cpu
	s.Cores = cores
	s.Load1 = firstFloat(read("/proc/loadavg"))
	s.Uptime = uint64(firstFloat(read("/proc/uptime")))

	mem := parseMeminfo(read("/proc/meminfo"))
	s.MemTotal = mem["MemTotal"]
	if avail, ok := mem["MemAvailable"]; ok && avail <= s.MemTotal {
		s.MemUsed = s.MemTotal - avail
	}
	s.SwapTotal = mem["SwapTotal"]
	if mem["SwapFree"] <= s.SwapTotal {
		s.SwapUsed = s.SwapTotal - mem["SwapFree"]
	}

	for _, m := range parseMounts(read("/proc/self/mounts")) {
		var st syscall.Statfs_t
		if syscall.Statfs(m.path, &st) != nil || st.Blocks == 0 {
			continue
		}
		bs := uint64(st.Bsize)
		used := (st.Blocks - st.Bfree) * bs
		// Total as users see it ("df"): used plus what non-root can still write.
		s.Disks = append(s.Disks, agentproto.Disk{Mount: m.path, FS: m.fs, Total: used + st.Bavail*bs, Used: used})
	}

	net := parseNetDev(read("/proc/net/dev"))
	secs := now.Sub(c.prevAt).Seconds()
	names := make([]string, 0, len(net))
	for n := range net {
		if !skipIface(n) {
			names = append(names, n)
		}
	}
	sort.Strings(names)
	for _, n := range names {
		i := agentproto.Iface{Name: n}
		if p, ok := c.prevNet[n]; ok && secs > 0 && net[n][0] >= p[0] && net[n][1] >= p[1] {
			i.Rx = float64(net[n][0]-p[0]) / secs
			i.Tx = float64(net[n][1]-p[1]) / secs
		}
		s.Net = append(s.Net, i)
	}
	c.prevNet = net
	c.prevAt = now

	s.Temps = temps()
	return s
}

// temps reads hwmon sensors (they are readable without root on most machines).
func temps() []agentproto.Temp {
	var out []agentproto.Temp
	files, _ := filepath.Glob("/sys/class/hwmon/hwmon*/temp*_input")
	sort.Strings(files)
	for _, f := range files {
		milli, err := strconv.ParseFloat(strings.TrimSpace(read(f)), 64)
		if err != nil || milli <= 0 {
			continue
		}
		dir := filepath.Dir(f)
		chip := strings.TrimSpace(read(filepath.Join(dir, "name")))
		label := strings.TrimSpace(read(strings.TrimSuffix(f, "_input") + "_label"))
		name := strings.TrimSpace(chip + " " + label)
		out = append(out, agentproto.Temp{Name: name, C: milli / 1000})
		if len(out) == 16 {
			break
		}
	}
	return out
}
