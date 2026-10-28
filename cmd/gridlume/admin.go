package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/metraveer/gridlume/internal/agentproto"
	"github.com/metraveer/gridlume/internal/release"
	"github.com/metraveer/gridlume/internal/server"
	"github.com/metraveer/gridlume/internal/store"
	"github.com/metraveer/gridlume/internal/update"
	"github.com/metraveer/gridlume/internal/version"
)

// installedPaths are the places install-core.sh uses, read from its config file.
func installedPaths() update.Paths {
	data := defaultDataDir()
	_, port, err := net.SplitHostPort(defaultServeAddr())
	if err != nil {
		port = "7420"
	}
	return update.Paths{
		Bin:       setting("GRIDLUME_BIN", "/usr/local/bin/gridlume"),
		AgentBin:  "/usr/local/bin/gridlume-agent",
		Data:      data,
		Agents:    setting("GRIDLUME_AGENTS", filepath.Join(data, "agents")),
		CoreUser:  setting("GRIDLUME_USER", "gridlume-core"),
		CoreUnit:  "gridlume",
		AgentUnit: "gridlume-agent",
		Health:    "http://127.0.0.1:" + port,
	}
}

// updateCmd: `sudo gridlume update [--channel stable|edge] [--check] [--force]`, and the root service's
// `gridlume update --from-request`.
func updateCmd(ctx context.Context, log *slog.Logger, args []string) error {
	fs := flag.NewFlagSet("update", flag.ExitOnError)
	channel := fs.String("channel", "", "stable or edge (default: the one chosen in the interface)")
	checkOnly := fs.Bool("check", false, "only say whether there is a newer release")
	force := fs.Bool("force", false, "install the channel's release even if it is not newer (e.g. edge → stable)")
	fromRequest := fs.Bool("from-request", false, "act on the request the interface left (run by gridlume-update.service)")
	_ = fs.Parse(args)

	p := installedPaths()
	if *fromRequest {
		req := update.RequestFile(p.Data)
		b, err := os.ReadFile(req)
		if errors.Is(err, os.ErrNotExist) {
			return nil // the path unit may fire twice
		}
		_ = os.Remove(req)
		if err == nil && strings.Contains(string(b), `"stable"`) {
			*channel = release.Stable
		} else if err == nil && strings.Contains(string(b), `"edge"`) {
			*channel = release.Edge
		}
	}
	if *channel == "" {
		if b, err := os.ReadFile(server.ChannelFile(p.Data)); err == nil {
			*channel = strings.TrimSpace(string(b))
		}
	}
	if *channel == "" {
		*channel = version.Channel
	}
	if !release.ValidChannel(*channel) {
		*channel = release.Stable
	}

	u := update.New(p, log)
	if *checkOnly {
		r, newer, err := u.Check(ctx, *channel)
		if err != nil {
			return err
		}
		if newer {
			fmt.Printf("%s → %s is available (%s)\n", version.Version, r.Version, *channel)
		} else {
			fmt.Printf("up to date: %s (%s has %s)\n", version.Version, *channel, r.Version)
		}
		return nil
	}
	if os.Geteuid() != 0 {
		return errors.New("updating replaces /usr/local/bin/gridlume: run it with sudo")
	}
	if *force {
		ctx = update.WithForce(ctx)
	}
	st, err := u.Apply(ctx, *channel)
	switch st.State {
	case "up_to_date":
		fmt.Printf("Already up to date: %s\n", version.Version)
	case "done":
		fmt.Printf("Updated: %s → %s\n", st.From, st.To)
	case "rolled_back":
		fmt.Printf("The new version did not start; %s and its database are back.\n", st.From)
	}
	return err
}

// backupCmd copies the database while the core runs; the updater calls it as the core's user.
func backupCmd(args []string) error {
	fs := flag.NewFlagSet("backup", flag.ExitOnError)
	to := fs.String("to", "", "file to write")
	dataDir := fs.String("data", defaultDataDir(), "folder for the database")
	_ = fs.Parse(args)
	if *to == "" {
		*to = filepath.Join(*dataDir, "backups", "gridlume-"+time.Now().UTC().Format("20060102-150405")+".db")
	}
	if err := os.MkdirAll(filepath.Dir(*to), 0o700); err != nil {
		return err
	}
	db, err := store.Open(filepath.Join(*dataDir, "gridlume.db"))
	if err != nil {
		return err
	}
	defer db.Close()
	if err := db.Backup(context.Background(), *to); err != nil {
		return err
	}
	fmt.Println(*to)
	return nil
}

// agentCodeCmd makes the code the core installer uses to connect the agent on this same machine.
func agentCodeCmd(args []string) error {
	fs := flag.NewFlagSet("agent-code", flag.ExitOnError)
	mode := fs.String("mode", agentproto.ModeUser, "user, readonly or root")
	dataDir := fs.String("data", defaultDataDir(), "folder for the database")
	_ = fs.Parse(args)
	db, err := store.Open(filepath.Join(*dataDir, "gridlume.db"))
	if err != nil {
		return err
	}
	defer db.Close()
	code := server.NewSetupCode()
	if err := db.CreateCoreEnrollCode(context.Background(), code, *mode, 10*time.Minute); err != nil {
		return err
	}
	fmt.Println(code)
	return nil
}
