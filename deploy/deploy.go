// Package deploy holds what the core hands out to machines: the agent install script.
package deploy

import _ "embed"

// InstallScript installs the agent. The core replaces __GRIDLUME_CORE__ with its own address.
//
//go:embed install.sh
var InstallScript string
