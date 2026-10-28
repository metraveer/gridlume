// Command gridlume-agent runs on each machine and reports to the Gridlume core.
// Stage 0 ships only the command skeleton; metrics, Docker and the core link arrive in stage 2.
package main

import (
	"fmt"
	"os"

	"github.com/metraveer/gridlume/internal/version"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "version" {
		fmt.Printf("gridlume-agent %s (%s)\n", version.Version, version.Commit)
		return
	}
	fmt.Fprintln(os.Stderr, "gridlume-agent: the agent is not implemented yet (stage 2); use `gridlume-agent version`")
	os.Exit(2)
}
