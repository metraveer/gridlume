// Package release finds Gridlume releases on GitHub and downloads them only if they are signed.
//
// Every release carries release.json (what it is), SHA256SUMS (checksums of all files) and
// SHA256SUMS.sig (an Ed25519 signature of SHA256SUMS made in CI). The public key is built into the
// core and the agent, so a release swapped on GitHub or on the way is refused.
//
// Versions follow semantic versioning. The next version is in the file VERSION; every merge to main is a
// development build of it, vX.Y.Z-dev.N (N is the release workflow's run number, so it only grows), and a
// tag vX.Y.Z makes the stable release. Each build has its own release that never changes. The newest one
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
	"regexp"
	"strings"
	"time"
)

// Repo is where releases are published.
const Repo = "metraveer/gridlume"

// Channels: stable follows tags vX.Y.Z, edge follows every merge to main and the stable releases too.
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
	Version string    `json:"version"` // "0.2.0" or "0.3.0-dev.142"
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
	// e.g. https://github.com/metraveer/gridlume/releases/download/v0.3.0-dev.12.
	Resolve func(ctx context.Context, c *Client, channel string) (string, error)
	Key     ed25519.PublicKey
}

// Default is the client for GitHub.
// No overall time limit: on a slow line a 13 MB build may take many minutes, and that is fine as long as
// data keeps coming. A download that stops moving for Stall is given up (see get).
func Default() *Client {
	t := http.DefaultTransport.(*http.Transport).Clone()
	t.ResponseHeaderTimeout = time.Minute
	return &Client{HTTP: &http.Client{Transport: t}, Resolve: GitHub, Key: PublicKey}
}

// Stall is how long a download may receive nothing before it is given up (a variable for tests).
var Stall = time.Minute

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
			Tag       string    `json:"tag_name"`
			Draft     bool      `json:"draft"`
			Published time.Time `json:"published_at"`
		}
		if err := json.Unmarshal(b, &list); err != nil {
			return "", err
		}
		// Edge takes stable releases too, so its users get them without switching channels. The newest by
		// publication: a stable tag carries no run number, and its run is the latest one when it comes out.
		var best time.Time
		for _, r := range list {
			if r.Draft || !(devTag.MatchString(r.Tag) || stableTag.MatchString(r.Tag)) {
				continue
			}
			if tag == "" || r.Published.After(best) {
				best, tag = r.Published, r.Tag
			}
		}
		if tag == "" {
			return "", ErrNoReleases
		}
	} else {
		b, err := c.get(ctx, api+"/latest", 1<<20)
		var he *HTTPError
		if errors.As(err, &he) && he.Status == http.StatusNotFound {
			return "", ErrNoReleases
		}
		if err != nil {
			return "", err
		}
		var r struct {
			Tag string `json:"tag_name"`
		}
		if err := json.Unmarshal(b, &r); err != nil || r.Tag == "" {
			return "", ErrNoReleases
		}
		tag = r.Tag
	}
	return "https://github.com/" + Repo + "/releases/download/" + tag, nil
}

var (
	devTag    = regexp.MustCompile(`^v\d+\.\d+\.\d+-dev\.\d+$`)
	stableTag = regexp.MustCompile(`^v\d+\.\d+\.\d+$`)
)

func (c *Client) get(ctx context.Context, url string, limit int64) ([]byte, error) {
	ctx, cancel := context.WithCancelCause(ctx)
	defer cancel(nil)
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
		return nil, &HTTPError{URL: url, Status: res.StatusCode}
	}
	// Every chunk that arrives pushes the deadline back.
	stall := time.AfterFunc(Stall, func() { cancel(fmt.Errorf("%s: nothing received for %s", url, Stall)) })
	defer stall.Stop()
	b, err := io.ReadAll(io.LimitReader(progress{res.Body, func() { stall.Reset(Stall) }}, limit))
	if err != nil && context.Cause(ctx) != nil && ctx.Err() != nil {
		return nil, context.Cause(ctx)
	}
	return b, err
}

// progress calls tick whenever data arrives.
type progress struct {
	r    io.Reader
	tick func()
}

func (p progress) Read(b []byte) (int, error) {
	n, err := p.r.Read(b)
	if n > 0 {
		p.tick()
	}
	return n, err
}

// HTTPError is an answer other than 200 from GitHub.
type HTTPError struct {
	URL    string
	Status int
}

func (e *HTTPError) Error() string { return fmt.Sprintf("%s: HTTP %d", e.URL, e.Status) }

// ErrNoReleases means the channel has nothing published yet.
var ErrNoReleases = errors.New("no releases in this channel yet")

// ErrSignature means a release was refused because its signature did not match the built-in key.
var ErrSignature = errors.New("release signature is not valid: refusing it")

// Problem names what went wrong for the interface: none (nothing published), limit (GitHub's hourly
// limit for anonymous requests), signature, network, or other.
func Problem(err error) string {
	var he *HTTPError
	switch {
	case err == nil:
		return ""
	case errors.Is(err, ErrNoReleases):
		return "none"
	case errors.Is(err, ErrSignature):
		return "signature"
	case errors.As(err, &he) && (he.Status == http.StatusForbidden || he.Status == http.StatusTooManyRequests):
		return "limit"
	case errors.As(err, &he):
		return "other"
	default:
		return "network"
	}
}

// Checked is a release whose checksums are signed: file names to their sha256.
type Checked struct {
	Manifest
	base string // every file comes from this one release
	sums map[string]string
	// The signed files as they came, so the core can hand them to agents (SaveSigned).
	rawSums, rawSig, rawManifest []byte
}

// Signed are the files that let anyone check this release: the checksums, their signature and release.json.
var Signed = []string{"SHA256SUMS", "SHA256SUMS.sig", "release.json"}

// SaveSigned writes the files named in Signed into dir. The core serves them with the agent builds, and
// an agent's updater checks them against the key built into it, as the core does with GitHub.
func (r *Checked) SaveSigned(dir string) error {
	for i, b := range [][]byte{r.rawSums, r.rawSig, r.rawManifest} {
		path := filepath.Join(dir, Signed[i])
		if err := os.WriteFile(path+".part", b, 0o644); err != nil {
			return err
		}
		if err := os.Rename(path+".part", path); err != nil {
			return err
		}
	}
	return nil
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
		return nil, ErrSignature
	}
	out := &Checked{base: base, sums: parseSums(sums), rawSums: sums, rawSig: sig}
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
	out.rawManifest = manifest
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
