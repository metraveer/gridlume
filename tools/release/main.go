// Command release is used by the release workflow (and once, by hand, to make the signing key).
//
//	go run ./tools/release keygen KEYFILE          new key: seed to KEYFILE (0600), public key to stdout
//	go run ./tools/release manifest DIR VERSION CHANNEL BUILD COMMIT URL
//	                                               writes DIR/release.json
//	go run ./tools/release sign DIR                SHA256SUMS of every file in DIR, then SHA256SUMS.sig
//	                                               with the seed from $GRIDLUME_SIGNING_KEY
package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/metraveer/gridlume/internal/release"
)

func main() {
	if len(os.Args) < 3 {
		fail("usage: release keygen KEYFILE | manifest DIR VERSION CHANNEL BUILD COMMIT URL | sign DIR")
	}
	switch os.Args[1] {
	case "keygen":
		pub, priv, err := ed25519.GenerateKey(rand.Reader)
		check(err)
		check(os.WriteFile(os.Args[2], []byte(base64.StdEncoding.EncodeToString(priv.Seed())+"\n"), 0o600))
		fmt.Println(base64.StdEncoding.EncodeToString(pub))
	case "manifest":
		if len(os.Args) != 8 {
			fail("manifest DIR VERSION CHANNEL BUILD COMMIT URL")
		}
		build, err := strconv.Atoi(os.Args[5])
		check(err)
		m := release.Manifest{Version: os.Args[3], Channel: os.Args[4], Build: build, Commit: os.Args[6], URL: os.Args[7], Date: time.Now().UTC()}
		b, _ := json.MarshalIndent(m, "", "  ")
		check(os.WriteFile(filepath.Join(os.Args[2], "release.json"), append(b, '\n'), 0o644))
	case "sign":
		dir := os.Args[2]
		entries, err := os.ReadDir(dir)
		check(err)
		var lines []string
		for _, e := range entries {
			if e.IsDir() || strings.HasPrefix(e.Name(), "SHA256SUMS") {
				continue
			}
			b, err := os.ReadFile(filepath.Join(dir, e.Name()))
			check(err)
			sum := sha256.Sum256(b)
			lines = append(lines, hex.EncodeToString(sum[:])+"  "+e.Name())
		}
		sort.Strings(lines)
		sums := []byte(strings.Join(lines, "\n") + "\n")
		sig, err := release.Sign(os.Getenv("GRIDLUME_SIGNING_KEY"), sums)
		check(err)
		check(os.WriteFile(filepath.Join(dir, "SHA256SUMS"), sums, 0o644))
		check(os.WriteFile(filepath.Join(dir, "SHA256SUMS.sig"), []byte(sig+"\n"), 0o644))
	default:
		fail("unknown command " + os.Args[1])
	}
}

func check(err error) {
	if err != nil {
		fail(err.Error())
	}
}

func fail(msg string) {
	fmt.Fprintln(os.Stderr, msg)
	os.Exit(1)
}
