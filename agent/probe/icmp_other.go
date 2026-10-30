//go:build !linux

package probe

import (
	"context"
	"time"
)

// The agent runs on Linux; elsewhere (a developer's machine) there is no unprivileged ping.
func ping(context.Context, string, time.Duration) (time.Duration, error) { return 0, ErrNoICMP }
