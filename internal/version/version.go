// Package version holds build information, set at build time with -ldflags.
package version

// Version is the release version, e.g. "0.1.0". Development builds keep the default.
var Version = "0.0.0-dev"

// Commit is the short git commit the binary was built from.
var Commit = "unknown"
