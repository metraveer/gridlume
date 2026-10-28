//go:build !linux

package collect

import (
	"os"
	"runtime"
	"time"

	"github.com/metraveer/gridlume/internal/agentproto"
)

// Collector on systems other than Linux reports only that it is alive; real collectors come later.
type Collector struct{}

func New() *Collector { return &Collector{} }

func Info(version, mode string) agentproto.Info {
	host, _ := os.Hostname()
	return agentproto.Info{Hostname: host, OS: runtime.GOOS, Arch: runtime.GOARCH, Version: version, Mode: mode}
}

func (c *Collector) Snapshot() agentproto.Snapshot {
	return agentproto.Snapshot{At: time.Now().UnixMilli(), Cores: runtime.NumCPU()}
}
