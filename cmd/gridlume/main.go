// Command gridlume is the Gridlume core: web interface, API and storage in one binary.
//
//	gridlume            serve the embedded interface (same as `gridlume serve`)
//	gridlume dev        development: core + Vite with live reload, one address
//	gridlume version    print the version
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/metraveer/gridlume/internal/agentlink"
	"github.com/metraveer/gridlume/internal/devmode"
	"github.com/metraveer/gridlume/internal/server"
	"github.com/metraveer/gridlume/internal/store"
	"github.com/metraveer/gridlume/internal/version"
	"github.com/metraveer/gridlume/web"
)

const defaultAddr = "127.0.0.1:7420"

func main() {
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))

	cmd := "serve"
	args := os.Args[1:]
	if len(args) > 0 && args[0] != "" && args[0][0] != '-' {
		cmd, args = args[0], args[1:]
	}

	var err error
	switch cmd {
	case "serve":
		err = run(log, args, false)
	case "dev":
		err = run(log, args, true)
	case "version":
		fmt.Printf("gridlume %s (%s)\n", version.Version, version.Commit)
	default:
		fmt.Fprintf(os.Stderr, "unknown command %q; use serve, dev or version\n", cmd)
		os.Exit(2)
	}
	if err != nil {
		log.Error("gridlume stopped", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger, args []string, dev bool) error {
	fs := flag.NewFlagSet("gridlume", flag.ExitOnError)
	addr := fs.String("addr", defaultAddr, "address to listen on")
	webDir := fs.String("web", "web", "web project folder (dev only)")
	dataDir := fs.String("data", "data", "folder for the database")
	agentsDir := fs.String("agents", "", "folder with agent builds for the install script (default: <data>/agents)")
	_ = fs.Parse(args)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := store.Open(filepath.Join(*dataDir, "gridlume.db"))
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer db.Close()

	// First run: nobody can sign in yet. Print a one-time code; whoever can read this console
	// creates the owner account in the browser. Without it, anyone reaching the page could.
	setupCode := ""
	if n, err := db.CountUsers(ctx); err != nil {
		return err
	} else if n == 0 {
		setupCode = server.NewSetupCode()
		fmt.Fprintf(os.Stderr, "\n  Gridlume: first run. Open http://%s and enter this code to create the owner account:\n\n      %s\n\n", *addr, setupCode)
	}
	go purgeSessions(ctx, db)

	if *agentsDir == "" {
		*agentsDir = filepath.Join(*dataDir, "agents")
	}
	hub := agentlink.New(db, log)
	go hub.Maintain(ctx)

	opts := server.Options{Dist: web.Dist(), Store: db, SetupCode: setupCode, Hub: hub, AgentsDir: *agentsDir, Log: log}
	if dev {
		// Agents installed on other machines download these builds from this core.
		go devmode.BuildAgents(ctx, *agentsDir, log)
		ui, err := devmode.Start(ctx, *webDir, log)
		if err != nil {
			return err
		}
		opts.UI = ui
	}

	srv := &http.Server{
		Addr:              *addr,
		Handler:           server.New(opts),
		ReadHeaderTimeout: 10 * time.Second,
	}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdown)
	}()

	log.Info("gridlume is running", "url", "http://"+*addr, "version", version.Version, "dev", dev, "data", *dataDir)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

func purgeSessions(ctx context.Context, db *store.Store) {
	t := time.NewTicker(time.Hour)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			_ = db.PurgeSessions(ctx)
		}
	}
}
