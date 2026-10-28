package collect

import "testing"

func TestCPU(t *testing.T) {
	a, threads := parseStat("cpu  100 0 100 800 0 0 0 0 0 0\ncpu0 50 0 50 400 0 0 0 0 0 0\ncpu1 50 0 50 400 0 0 0 0 0 0\nintr 1\n")
	b, _ := parseStat("cpu  150 0 150 900 0 0 0 0 0 0\n")
	if threads != 2 {
		t.Fatalf("threads = %d", threads)
	}
	// i3-6006U: 4 threads on 2 cores of one package.
	if got := countCores([]string{"0-0", "0-1", "0-0", "0-1"}); got != 2 {
		t.Fatalf("cores = %d, want 2", got)
	}
	// 200 jiffies passed, 100 of them idle.
	if got := cpuPercent(a, b); got != 50 {
		t.Fatalf("cpu = %v, want 50", got)
	}
	if got := cpuPercent(b, a); got != 0 {
		t.Fatalf("counters going back must give 0, got %v", got)
	}
}

func TestMeminfo(t *testing.T) {
	m := parseMeminfo("MemTotal:       16000 kB\nMemAvailable:    4000 kB\nHugePages_Total:       0\n")
	if m["MemTotal"] != 16000*1024 || m["MemAvailable"] != 4000*1024 || m["HugePages_Total"] != 0 {
		t.Fatalf("got %v", m)
	}
}

func TestNetDev(t *testing.T) {
	text := `Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo:  1000      10    0    0    0     0          0         0     1000      10    0    0    0     0       0          0
enp3s0: 5000      50    0    0    0     0          0         0     7000      70    0    0    0     0       0          0
`
	n := parseNetDev(text)
	if n["enp3s0"] != [2]uint64{5000, 7000} || len(n) != 2 {
		t.Fatalf("got %v", n)
	}
	for name, skip := range map[string]bool{"lo": true, "veth1a2b": true, "docker0": true, "br-12ab": true, "enp3s0": false, "wlan0": false, "local0": false} {
		if skipIface(name) != skip {
			t.Errorf("skipIface(%q) = %v", name, !skip)
		}
	}
}

func TestMounts(t *testing.T) {
	text := `/dev/sda2 / ext4 rw 0 0
proc /proc proc rw 0 0
tmpfs /run tmpfs rw 0 0
/dev/sda1 /boot/efi vfat rw 0 0
/dev/sdb1 /mnt/my\040disk xfs rw 0 0
/dev/sda2 /var/lib/docker/overlay2 ext4 rw 0 0
overlay /var/lib/docker/overlay2/x/merged overlay rw 0 0
`
	got := parseMounts(text)
	want := []string{"/", "/boot/efi", "/mnt/my disk"}
	if len(got) != len(want) {
		t.Fatalf("got %v", got)
	}
	for i, m := range got {
		if m.path != want[i] {
			t.Errorf("mount %d = %q, want %q", i, m.path, want[i])
		}
	}
}

func TestOSRelease(t *testing.T) {
	if got := parseOSRelease("NAME=\"Debian GNU/Linux\"\nPRETTY_NAME=\"Debian GNU/Linux 13 (trixie)\"\n"); got != "Debian GNU/Linux 13 (trixie)" {
		t.Fatalf("got %q", got)
	}
}
