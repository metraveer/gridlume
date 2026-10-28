package devmode

import (
	"context"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
)

// BuildAgents cross-compiles the agent for Linux into dir, so machines on the network can install it
// from this development core. A release package ships these files instead.
func BuildAgents(ctx context.Context, dir string, log *slog.Logger) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		log.Error("agent builds", "err", err)
		return
	}
	for _, arch := range []string{"amd64", "arm64"} {
		out := filepath.Join(dir, "gridlume-agent-linux-"+arch)
		cmd := exec.CommandContext(ctx, "go", "build", "-trimpath", "-ldflags=-s -w", "-o", out, "./cmd/gridlume-agent")
		cmd.Env = append(os.Environ(), "GOOS=linux", "GOARCH="+arch, "CGO_ENABLED=0")
		if b, err := cmd.CombinedOutput(); err != nil {
			log.Error("agent build failed", "arch", arch, "err", err, "output", string(b))
			continue
		}
		log.Info("agent built", "file", out)
	}
}
