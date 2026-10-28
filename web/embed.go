// Package web embeds the built user interface (web/dist) into the core binary,
// so a release is a single file. `npm run build` in this folder produces dist/.
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var dist embed.FS

// Dist returns the built interface files, rooted at dist/.
func Dist() fs.FS {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		panic(err) // dist/ is part of the embed pattern, so this cannot happen
	}
	return sub
}
