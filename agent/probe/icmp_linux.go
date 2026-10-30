package probe

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"fmt"
	"net"
	"os"
	"syscall"
	"time"
)

// ping sends one ICMP echo through an unprivileged "ping socket" (SOCK_DGRAM, IPPROTO_ICMP): no root
// and no raw sockets, allowed for the groups in net.ipv4.ping_group_range (everyone on Debian and Ubuntu).
func ping(ctx context.Context, host string, timeout time.Duration) (time.Duration, error) {
	ips, err := net.DefaultResolver.LookupIP(ctx, "ip4", host)
	if err != nil || len(ips) == 0 {
		return 0, ErrResolve
	}
	fd, err := syscall.Socket(syscall.AF_INET, syscall.SOCK_DGRAM|syscall.SOCK_CLOEXEC, syscall.IPPROTO_ICMP)
	if err != nil {
		return 0, ErrNoICMP
	}
	f := os.NewFile(uintptr(fd), "icmp")
	c, err := net.FilePacketConn(f)
	f.Close()
	if err != nil {
		return 0, err
	}
	defer c.Close()

	var tag [10]byte // sequence number and payload: a reply is ours only if both come back
	_, _ = rand.Read(tag[:])
	msg := make([]byte, 8+8)
	msg[0] = 8 // echo request; the kernel sets the identifier for ping sockets
	copy(msg[6:], tag[:])
	binary.BigEndian.PutUint16(msg[2:], checksum(msg))

	start := time.Now()
	deadline := start.Add(timeout)
	if d, ok := ctx.Deadline(); ok && d.Before(deadline) {
		deadline = d
	}
	_ = c.SetDeadline(deadline)
	if _, err := c.WriteTo(msg, &net.UDPAddr{IP: ips[0]}); err != nil {
		return 0, err
	}
	buf := make([]byte, 1500)
	for {
		n, _, err := c.ReadFrom(buf)
		if err != nil {
			return 0, fmt.Errorf("no answer from %s: %w", host, err)
		}
		if n >= 16 && buf[0] == 0 && string(buf[6:16]) == string(msg[6:16]) {
			return time.Since(start), nil
		}
	}
}

func checksum(b []byte) uint16 {
	var s uint32
	for i := 0; i+1 < len(b); i += 2 {
		s += uint32(b[i])<<8 | uint32(b[i+1])
	}
	if len(b)%2 == 1 {
		s += uint32(b[len(b)-1]) << 8
	}
	for s>>16 != 0 {
		s = s&0xffff + s>>16
	}
	return ^uint16(s)
}
