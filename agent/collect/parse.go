// Package collect reads the state of a Linux machine from /proc and /sys.
// Parsers take text so they can be tested on any system; reading the files is in linux.go.
package collect

import (
	"bufio"
	"strconv"
	"strings"
)

// cpuTimes are the jiffies of the "cpu" line of /proc/stat.
type cpuTimes struct{ idle, total uint64 }

// parseStat returns the summed CPU times and the number of logical processors (threads).
func parseStat(text string) (cpuTimes, int) {
	var t cpuTimes
	threads := 0
	sc := bufio.NewScanner(strings.NewReader(text))
	for sc.Scan() {
		f := strings.Fields(sc.Text())
		if len(f) < 5 || !strings.HasPrefix(f[0], "cpu") {
			continue
		}
		if f[0] != "cpu" {
			threads++
			continue
		}
		// user nice system idle iowait irq softirq steal (guest is already counted in user)
		for i, s := range f[1:] {
			if i >= 8 {
				break
			}
			v, _ := strconv.ParseUint(s, 10, 64)
			t.total += v
			if i == 3 || i == 4 { // idle, iowait
				t.idle += v
			}
		}
	}
	return t, threads
}

// countCores counts physical cores: distinct "package-core" pairs from the CPU topology.
// Hyper-threading siblings share a pair. Returns 0 when the topology is not known.
func countCores(pairs []string) int {
	seen := map[string]bool{}
	for _, p := range pairs {
		if p != "" {
			seen[p] = true
		}
	}
	return len(seen)
}

// cpuPercent is the busy share between two readings.
func cpuPercent(prev, cur cpuTimes) float64 {
	if cur.total <= prev.total {
		return 0
	}
	total := float64(cur.total - prev.total)
	idle := float64(cur.idle - prev.idle)
	return clamp(100*(total-idle)/total, 0, 100)
}

// parseMeminfo returns values in bytes, keyed like "MemTotal".
func parseMeminfo(text string) map[string]uint64 {
	out := map[string]uint64{}
	sc := bufio.NewScanner(strings.NewReader(text))
	for sc.Scan() {
		key, rest, ok := strings.Cut(sc.Text(), ":")
		if !ok {
			continue
		}
		f := strings.Fields(rest)
		if len(f) == 0 {
			continue
		}
		v, err := strconv.ParseUint(f[0], 10, 64)
		if err != nil {
			continue
		}
		if len(f) > 1 && f[1] == "kB" {
			v *= 1024
		}
		out[key] = v
	}
	return out
}

// parseNetDev returns byte counters per interface from /proc/net/dev.
func parseNetDev(text string) map[string][2]uint64 {
	out := map[string][2]uint64{}
	sc := bufio.NewScanner(strings.NewReader(text))
	for sc.Scan() {
		name, rest, ok := strings.Cut(sc.Text(), ":")
		if !ok {
			continue
		}
		f := strings.Fields(rest)
		if len(f) < 9 {
			continue
		}
		rx, _ := strconv.ParseUint(f[0], 10, 64)
		tx, _ := strconv.ParseUint(f[8], 10, 64)
		out[strings.TrimSpace(name)] = [2]uint64{rx, tx}
	}
	return out
}

// skipIface leaves out loopback and the virtual plumbing of Docker, VMs and bridges:
// their traffic is already counted on the real interfaces.
func skipIface(name string) bool {
	for _, p := range []string{"lo", "veth", "br-", "docker", "virbr", "vnet", "cali", "flannel", "cni"} {
		if name == p || strings.HasPrefix(name, p) && p != "lo" {
			return true
		}
	}
	return false
}

type mount struct{ device, path, fs string }

// realFS are filesystems that hold data; tmpfs, overlay, proc and the like are skipped.
var realFS = map[string]bool{"ext2": true, "ext3": true, "ext4": true, "xfs": true, "btrfs": true, "zfs": true, "f2fs": true, "vfat": true, "exfat": true, "ntfs": true, "ntfs3": true, "jfs": true, "reiserfs": true, "bcachefs": true}

// parseMounts returns data filesystems from /proc/self/mounts, one per device.
func parseMounts(text string) []mount {
	var out []mount
	seen := map[string]bool{}
	sc := bufio.NewScanner(strings.NewReader(text))
	for sc.Scan() {
		f := strings.Fields(sc.Text())
		if len(f) < 3 || !realFS[f[2]] || seen[f[0]] {
			continue
		}
		// Snap and Docker mount the same disk again under their own folders.
		if strings.HasPrefix(f[1], "/snap/") || strings.HasPrefix(f[1], "/var/lib/docker/") {
			continue
		}
		seen[f[0]] = true
		out = append(out, mount{device: f[0], path: unescapeMount(f[1]), fs: f[2]})
	}
	return out
}

// unescapeMount turns "\040" in mount paths back into spaces (and other octal escapes).
func unescapeMount(s string) string {
	if !strings.Contains(s, `\`) {
		return s
	}
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		if s[i] == '\\' && i+3 < len(s) {
			if v, err := strconv.ParseUint(s[i+1:i+4], 8, 8); err == nil {
				b.WriteByte(byte(v))
				i += 3
				continue
			}
		}
		b.WriteByte(s[i])
	}
	return b.String()
}

// parseOSRelease returns PRETTY_NAME from /etc/os-release.
func parseOSRelease(text string) string {
	sc := bufio.NewScanner(strings.NewReader(text))
	for sc.Scan() {
		if v, ok := strings.CutPrefix(sc.Text(), "PRETTY_NAME="); ok {
			return strings.Trim(v, `"'`)
		}
	}
	return ""
}

func firstFloat(text string) float64 {
	f := strings.Fields(text)
	if len(f) == 0 {
		return 0
	}
	v, _ := strconv.ParseFloat(f[0], 64)
	return v
}

func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
