package main

import (
	"bufio"
	"os"
	"strings"
)

// ConfFile is written by the installer and read by both the service (systemd EnvironmentFile) and the
// commands an admin runs by hand (`gridlume setup-link`, `gridlume update`), so they agree on where
// the data is without anyone passing flags.
const ConfFile = "/etc/gridlume/gridlume.env"

var conf = readConf(ConfFile)

func readConf(path string) map[string]string {
	out := map[string]string{}
	f, err := os.Open(path)
	if err != nil {
		return out
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if k, v, ok := strings.Cut(line, "="); ok {
			out[strings.TrimSpace(k)] = strings.Trim(strings.TrimSpace(v), `"'`)
		}
	}
	return out
}

// setting is the environment variable, else the installer's config file, else def.
func setting(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	if v := conf[key]; v != "" {
		return v
	}
	return def
}

func defaultServeAddr() string { return setting("GRIDLUME_ADDR", "127.0.0.1:7420") }
func defaultDataDir() string   { return setting("GRIDLUME_DATA", "data") }
