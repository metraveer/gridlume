// Package version holds build information, set at build time with -ldflags.
package version

import "strconv"

// Version is the release version, e.g. "0.1.0" or "edge-142". Development builds keep the default.
var Version = "0.0.0-dev"

// Commit is the short git commit the binary was built from.
var Commit = "unknown"

// Build is the release workflow's run number: it only grows, so "newer" is a plain comparison
// across both channels. "0" means a development build, which never offers itself an update.
var Build = "0"

// Channel is the release channel the binary came from: "stable", "edge" or "" for development builds.
var Channel = ""

// BuildNumber is Build as a number (0 when unset or broken).
func BuildNumber() int {
	n, err := strconv.Atoi(Build)
	if err != nil {
		return 0
	}
	return n
}
