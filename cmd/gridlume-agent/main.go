// Command gridlume-agent runs on each machine and reports to the Gridlume core.
//
//	gridlume-agent enroll --core URL --code CODE [--mode user|readonly|root] [--state DIR]
//	gridlume-agent run [--state DIR]
//	gridlume-agent docker-proxy [--listen SOCKET] [--docker SOCKET]   read-only Docker for the "readonly" mode
//	gridlume-agent version
//
// The install script (deploy/install.sh) runs enroll once and sets up `run` as a systemd service.
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/metraveer/gridlume/agent/docker"
	"github.com/metraveer/gridlume/agent/link"
	"github.com/metraveer/gridlume/internal/agentproto"
	"github.com/metraveer/gridlume/internal/version"
)

const defaultState = "/var/lib/gridlume-agent"

func main() {
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))
	if len(os.Args) < 2 {
		usage()
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cmd, args := os.Args[1], os.Args[2:]
	switch cmd {
	case "version":
		fmt.Printf("gridlume-agent %s (%s)\n", version.Version, version.Commit)
	case "enroll":
		fs := flag.NewFlagSet("enroll", flag.ExitOnError)
		core := fs.String("core", "", "core address, e.g. http://192.168.1.10:7420")
		code := fs.String("code", "", "one-time code from the interface")
		mode := fs.String("mode", agentproto.ModeUser, "user, readonly or root (see the install script)")
		state := fs.String("state", defaultState, "folder for the agent's key")
		_ = fs.Parse(args)
		if *core == "" || *code == "" || !agentproto.ValidMode(*mode) {
			fmt.Fprintln(os.Stderr, "enroll needs --core, --code and a valid --mode")
			os.Exit(2)
		}
		c, err := link.Enroll(ctx, *core, *code, *mode, *state, version.Version)
		if err != nil {
			log.Error("enrollment failed", "err", err)
			os.Exit(1)
		}
		log.Info("enrolled", "agent", c.AgentID, "core", c.Core)
	case "run":
		fs := flag.NewFlagSet("run", flag.ExitOnError)
		state := fs.String("state", defaultState, "folder with agent.json")
		_ = fs.Parse(args)
		c, err := link.Load(*state)
		if err != nil {
			log.Error("not enrolled", "err", err)
			os.Exit(1)
		}
		if err := link.Run(ctx, c, version.Version, log); err != nil {
			log.Error("agent stopped", "err", err)
			os.Exit(1)
		}
	case "docker-proxy":
		fs := flag.NewFlagSet("docker-proxy", flag.ExitOnError)
		listen := fs.String("listen", agentproto.DockerSocket(agentproto.ModeReadOnly), "socket the agent reads Docker from")
		socket := fs.String("docker", "/var/run/docker.sock", "Docker's own socket")
		_ = fs.Parse(args)
		if err := docker.Proxy(ctx, *listen, *socket, log); err != nil {
			log.Error("proxy stopped", "err", err)
			os.Exit(1)
		}
	default:
		usage()
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: gridlume-agent enroll|run|docker-proxy|version (see the install script)")
	os.Exit(2)
}
