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
	"syscall"
	"time"

	"github.com/metraveer/gridlume/internal/devmode"
	"github.com/metraveer/gridlume/internal/server"
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
	_ = fs.Parse(args)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	opts := server.Options{Dist: web.Dist()}
	if dev {
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

	log.Info("gridlume is running", "url", "http://"+*addr, "version", version.Version, "dev", dev)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
