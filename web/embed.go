// Package web embeds the built user interface (web/dist) into the core binary,
// so a release is a single file. `npm run build` in this folder produces dist/.
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var dist embed.FS

// The interface's texts, so messages the core sends (notifications) say things the same way.
//
//go:embed src/i18n/ru.json src/i18n/en.json
var texts embed.FS

// Dist returns the built interface files, rooted at dist/.
func Dist() fs.FS {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		panic(err) // dist/ is part of the embed pattern, so this cannot happen
	}
	return sub
}

// Texts returns the interface's dictionary for a language ("ru" or "en"), as JSON.
func Texts(lang string) ([]byte, error) {
	return texts.ReadFile("src/i18n/" + lang + ".json")
}
