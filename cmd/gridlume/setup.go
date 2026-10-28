package main

import (
	"errors"
	"flag"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"

	"github.com/metraveer/gridlume/internal/server"
)

// The first-login code lives in the data folder (readable only by the core's user and root) until the
// owner exists, so the link survives restarts and `gridlume setup-link` can print it again.
func setupCodePath(dataDir string) string { return filepath.Join(dataDir, "setup-code") }

func loadOrCreateSetupCode(path string) (string, error) {
	if b, err := os.ReadFile(path); err == nil && len(strings.TrimSpace(string(b))) >= 8 {
		return strings.TrimSpace(string(b)), nil
	}
	code := server.NewSetupCode()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return "", err
	}
	return code, os.WriteFile(path, []byte(code+"\n"), 0o600)
}

// setupLinks are the first-login links for addr. The code goes after "#": browsers never send that part
// to the server, so it does not end up in proxy or server logs.
func setupLinks(addr, code string) []string {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		host, port = addr, "7420"
	}
	hosts := []string{host}
	if host == "" || host == "0.0.0.0" || host == "::" {
		hosts = localIPv4()
	}
	var out []string
	for _, h := range hosts {
		out = append(out, fmt.Sprintf("http://%s/#setup=%s", net.JoinHostPort(h, port), code))
	}
	return out
}

// localIPv4 lists this machine's addresses other people on the network can open.
func localIPv4() []string {
	var out []string
	ifaces, _ := net.Interfaces()
	for _, i := range ifaces {
		if i.Flags&net.FlagUp == 0 || i.Flags&net.FlagLoopback != 0 || strings.HasPrefix(i.Name, "docker") || strings.HasPrefix(i.Name, "br-") || strings.HasPrefix(i.Name, "veth") {
			continue
		}
		addrs, _ := i.Addrs()
		for _, a := range addrs {
			if n, ok := a.(*net.IPNet); ok && n.IP.To4() != nil {
				out = append(out, n.IP.String())
			}
		}
	}
	if len(out) == 0 {
		out = []string{"127.0.0.1"}
	}
	return out
}

func printSetupLinks(addr, code string) {
	fmt.Fprintf(os.Stderr, "\n  Gridlume: first run. Open this link to create the owner account:\n\n")
	for _, l := range setupLinks(addr, code) {
		fmt.Fprintf(os.Stderr, "      %s\n", l)
	}
	fmt.Fprintf(os.Stderr, "\n  Lost it? Run: sudo gridlume setup-link\n\n")
}

// setupLinkCmd prints the first-login link again, e.g. after the installer's output scrolled away.
func setupLinkCmd(args []string) error {
	fs := flag.NewFlagSet("setup-link", flag.ExitOnError)
	addr := fs.String("addr", defaultServeAddr(), "the address the core listens on")
	dataDir := fs.String("data", defaultDataDir(), "folder for the database")
	_ = fs.Parse(args)
	b, err := os.ReadFile(setupCodePath(*dataDir))
	if errors.Is(err, os.ErrNotExist) {
		fmt.Println("The owner account already exists: sign in with it. / Владелец уже создан: войдите под ним.")
		return nil
	}
	if err != nil {
		return fmt.Errorf("read the code (run with sudo?): %w", err)
	}
	for _, l := range setupLinks(*addr, strings.TrimSpace(string(b))) {
		fmt.Println(l)
	}
	return nil
}
