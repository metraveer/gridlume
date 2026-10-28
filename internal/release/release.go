// Package release finds Gridlume releases on GitHub and downloads them only if they are signed.
//
// Every release carries release.json (what it is), SHA256SUMS (checksums of all files) and
// SHA256SUMS.sig (an Ed25519 signature of SHA256SUMS made in CI). The public key is built into the
// core and the agent, so a release swapped on GitHub or on the way is refused.
//
// Each build has its own release that never changes: vX.Y.Z for stable, edge-N for edge. The newest one
// is found through the GitHub API, and all files are taken from that one tag. (A single moving "edge"
// release did not work: GitHub caches download links for minutes, so right after a new build the files
// came from two different builds, or from one already deleted.)
package release

import (
	"bufio"
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Repo is where releases are published.
const Repo = "metraveer/gridlume"

// Channels: stable follows tags vX.Y.Z, edge follows every merge to main.
const (
	Stable = "stable"
	Edge   = "edge"
)

// ValidChannel reports whether c is a channel.
func ValidChannel(c string) bool { return c == Stable || c == Edge }

// PublicKey verifies release signatures. The matching private key is a GitHub secret
// (GRIDLUME_SIGNING_KEY) and a copy in the owner's password manager.
var PublicKey = mustKey("wCSnv5RBYUnj7oIjYNLu4HDBBmugjSw2OPuymG2CLm0=")

func mustKey(b64 string) ed25519.PublicKey {
	k, err := base64.StdEncoding.DecodeString(b64)
	if err != nil || len(k) != ed25519.PublicKeySize {
		panic("release: bad public key")
	}
	return k
}

// Manifest is release.json.
type Manifest struct {
	Version string    `json:"version"` // "0.2.0" or "edge-142"
	Channel string    `json:"channel"`
	Build   int       `json:"build"`  // grows with every release in both channels
	Commit  string    `json:"commit"` // short sha
	Date    time.Time `json:"date"`
	URL     string    `json:"url"` // the release page, for "what changed"
}

// Client downloads releases. Tests replace Resolve with a local server.
type Client struct {
	HTTP *http.Client
	// Resolve returns the download folder of the newest release of a channel,
	// e.g. https://github.com/metraveer/gridlume/releases/download/edge-12.
	Resolve func(ctx context.Context, c *Client, channel string) (string, error)
	Key     ed25519.PublicKey
}

// Default is the client for GitHub.
func Default() *Client {
	return &Client{HTTP: &http.Client{Timeout: 5 * time.Minute}, Resolve: GitHub, Key: PublicKey}
}

// GitHub finds the newest release of a channel with the GitHub API (no token: 60 requests an hour,
// and the core asks every 6 hours).
func GitHub(ctx context.Context, c *Client, channel string) (string, error) {
	api := "https://api.github.com/repos/" + Repo + "/releases"
	var tag string
	if channel == Edge {
		b, err := c.get(ctx, api+"?per_page=30", 4<<20)
		if err != nil {
			return "", err
		}
		var list []struct {
			Tag   string `json:"tag_name"`
			Draft bool   `json:"draft"`
		}
		if err := json.Unmarshal(b, &list); err != nil {
			return "", err
		}
		best := -1
		for _, r := range list {
			n, ok := edgeNumber(r.Tag)
			if ok && !r.Draft && n > best {
				best, tag = n, r.Tag
			}
		}
		if tag == "" {
			return "", errors.New("no edge releases yet")
		}
	} else {
		b, err := c.get(ctx, api+"/latest", 1<<20)
		if err != nil {
			return "", err
		}
		var r struct {
			Tag string `json:"tag_name"`
		}
		if err := json.Unmarshal(b, &r); err != nil || r.Tag == "" {
			return "", errors.New("no stable releases yet")
		}
		tag = r.Tag
	}
	return "https://github.com/" + Repo + "/releases/download/" + tag, nil
}

// edgeNumber reads N from "edge-N".
func edgeNumber(tag string) (int, bool) {
	rest, ok := strings.CutPrefix(tag, "edge-")
	if !ok {
		return 0, false
	}
	n, err := strconv.Atoi(rest)
	return n, err == nil
}

func (c *Client) get(ctx context.Context, url string, limit int64) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "gridlume-updater")
	if strings.HasPrefix(url, "https://api.github.com/") {
		req.Header.Set("Accept", "application/vnd.github+json")
	}
	res, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s: %s", url, res.Status)
	}
	return io.ReadAll(io.LimitReader(res.Body, limit))
}

// Checked is a release whose checksums are signed: file names to their sha256.
type Checked struct {
	Manifest
	base string // every file comes from this one release
	sums map[string]string
}

// Latest finds the newest release of a channel and checks its signature and manifest.
func (c *Client) Latest(ctx context.Context, channel string) (*Checked, error) {
	base, err := c.Resolve(ctx, c, channel)
	if err != nil {
		return nil, err
	}
	sums, err := c.get(ctx, base+"/SHA256SUMS", 1<<20)
	if err != nil {
		return nil, err
	}
	sig, err := c.get(ctx, base+"/SHA256SUMS.sig", 4096)
	if err != nil {
		return nil, err
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(sig)))
	if err != nil || !ed25519.Verify(c.Key, sums, raw) {
		return nil, errors.New("release signature is not valid: refusing it")
	}
	out := &Checked{base: base, sums: parseSums(sums)}
	manifest, err := c.get(ctx, base+"/release.json", 1<<16)
	if err != nil {
		return nil, err
	}
	if err := out.verify("release.json", manifest); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(manifest, &out.Manifest); err != nil {
		return nil, err
	}
	return out, nil
}

func parseSums(b []byte) map[string]string {
	out := map[string]string{}
	sc := bufio.NewScanner(bytes.NewReader(b))
	for sc.Scan() {
		f := strings.Fields(sc.Text())
		if len(f) == 2 {
			out[strings.TrimPrefix(f[1], "*")] = strings.ToLower(f[0])
		}
	}
	return out
}

func (r *Checked) verify(name string, data []byte) error {
	want, ok := r.sums[name]
	if !ok {
		return fmt.Errorf("%s is not in the signed checksums", name)
	}
	got := sha256.Sum256(data)
	if hex.EncodeToString(got[:]) != want {
		return fmt.Errorf("%s does not match its signed checksum", name)
	}
	return nil
}

// Download saves a file of the release to dir/name after checking it against the signed checksums.
// The file appears only when it is complete and correct.
func (c *Client) Download(ctx context.Context, r *Checked, name, dir string) (string, error) {
	data, err := c.get(ctx, r.base+"/"+name, 256<<20)
	if err != nil {
		return "", err
	}
	if err := r.verify(name, data); err != nil {
		return "", err
	}
	path := filepath.Join(dir, name)
	tmp := path + ".part"
	if err := os.WriteFile(tmp, data, 0o755); err != nil {
		return "", err
	}
	return path, os.Rename(tmp, path)
}

// Sign is used by CI: the signature of sums with the private key seed (base64), as base64.
func Sign(seedB64 string, sums []byte) (string, error) {
	seed, err := base64.StdEncoding.DecodeString(strings.TrimSpace(seedB64))
	if err != nil || len(seed) != ed25519.SeedSize {
		return "", errors.New("signing key must be a base64 Ed25519 seed")
	}
	return base64.StdEncoding.EncodeToString(ed25519.Sign(ed25519.NewKeyFromSeed(seed), sums)), nil
}
