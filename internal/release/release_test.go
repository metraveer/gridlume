package release

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// fakeRelease serves a channel's files; tamper changes the binary after it was signed.
func fakeRelease(t *testing.T, tamper bool) (*Client, ed25519.PublicKey) {
	t.Helper()
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	files := map[string][]byte{
		"release.json":         []byte(`{"version":"edge-7","channel":"edge","build":7,"commit":"abc1234"}`),
		"gridlume-linux-amd64": []byte("new core"),
	}
	var sums []string
	for name, b := range files {
		s := sha256.Sum256(b)
		sums = append(sums, hex.EncodeToString(s[:])+"  "+name)
	}
	files["SHA256SUMS"] = []byte(strings.Join(sums, "\n") + "\n")
	sig, err := Sign(base64.StdEncoding.EncodeToString(priv.Seed()), files["SHA256SUMS"])
	if err != nil {
		t.Fatal(err)
	}
	files["SHA256SUMS.sig"] = []byte(sig)
	if tamper {
		files["gridlume-linux-amd64"] = []byte("evil core")
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, ok := files[filepath.Base(r.URL.Path)]
		if !ok {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write(b)
	}))
	t.Cleanup(srv.Close)
	return &Client{HTTP: srv.Client(), Resolve: func(context.Context, *Client, string) (string, error) { return srv.URL + "/edge-7", nil }, Key: pub}, pub
}

func TestLatestAndDownload(t *testing.T) {
	c, _ := fakeRelease(t, false)
	r, err := c.Latest(context.Background(), Edge)
	if err != nil {
		t.Fatal(err)
	}
	if r.Build != 7 || r.Version != "edge-7" {
		t.Fatalf("manifest: %+v", r.Manifest)
	}
	dir := t.TempDir()
	path, err := c.Download(context.Background(), r, "gridlume-linux-amd64", dir)
	if err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(path); string(b) != "new core" {
		t.Fatalf("downloaded %q", b)
	}
}

func TestRefusesTamperedFilesAndWrongKey(t *testing.T) {
	c, _ := fakeRelease(t, true)
	r, err := c.Latest(context.Background(), Edge)
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	if _, err := c.Download(context.Background(), r, "gridlume-linux-amd64", dir); err == nil {
		t.Fatal("a file changed after signing must be refused")
	}
	if _, err := os.Stat(filepath.Join(dir, "gridlume-linux-amd64")); err == nil {
		t.Fatal("a refused file must not be left on disk")
	}

	other, _, _ := ed25519.GenerateKey(rand.Reader)
	c.Key = other
	if _, err := c.Latest(context.Background(), Edge); err == nil {
		t.Fatal("a release signed with another key must be refused")
	}
}

func TestBuiltInKeyIsValid(t *testing.T) {
	if len(PublicKey) != ed25519.PublicKeySize {
		t.Fatal("bad built-in key")
	}
}

func TestNewestEdgeIsFoundByDate(t *testing.T) {
	for _, tc := range []struct{ name, list, want string }{
		// Not in order, with a draft, an older stable one and the old moving "edge" tags mixed in.
		{"dev", `[{"tag_name":"v0.3.0-dev.9","published_at":"2026-10-01T10:00:00Z"},{"tag_name":"v0.2.0","published_at":"2026-09-01T10:00:00Z"},
			{"tag_name":"v0.3.0-dev.12","draft":true},{"tag_name":"v0.3.0-dev.10","published_at":"2026-10-02T10:00:00Z"},
			{"tag_name":"edge","published_at":"2026-10-05T10:00:00Z"},{"tag_name":"edge-11","published_at":"2026-10-05T10:00:00Z"}]`, "v0.3.0-dev.10"},
		// A stable release right after the last dev build: edge offers it, no need to switch channels.
		{"stable", `[{"tag_name":"v0.3.0","published_at":"2026-10-03T10:00:00Z"},{"tag_name":"v0.3.0-dev.10","published_at":"2026-10-02T10:00:00Z"}]`, "v0.3.0"},
	} {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(tc.list)) }))
		c := &Client{HTTP: &http.Client{Transport: rewrite{srv.URL}}}
		base, err := GitHub(context.Background(), c, Edge)
		srv.Close()
		if err != nil || !strings.HasSuffix(base, "/releases/download/"+tc.want) {
			t.Fatalf("%s: got %q %v", tc.name, base, err)
		}
	}
}

// rewrite sends every request to a test server.
type rewrite struct{ to string }

func (r rewrite) RoundTrip(req *http.Request) (*http.Response, error) {
	u, _ := http.NewRequest(req.Method, r.to+req.URL.Path, nil)
	return http.DefaultTransport.RoundTrip(u)
}

func TestSlowDownloadIsFineStalledIsNot(t *testing.T) {
	old := Stall
	Stall = 300 * time.Millisecond
	t.Cleanup(func() { Stall = old })
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f := w.(http.Flusher)
		// Slow but steady: 8 chunks over ~1.2 s, longer than Stall in total.
		for range 8 {
			_, _ = w.Write([]byte("chunk"))
			f.Flush()
			time.Sleep(150 * time.Millisecond)
		}
		if r.URL.Path == "/stalls" {
			time.Sleep(2 * time.Second) // then nothing more comes
		}
	}))
	defer srv.Close()
	c := Default()
	b, err := c.get(context.Background(), srv.URL+"/slow", 1<<20)
	if err != nil || len(b) != 40 {
		t.Fatalf("a slow download that keeps going must finish: %d bytes, %v", len(b), err)
	}
	if _, err := c.get(context.Background(), srv.URL+"/stalls", 1<<20); err == nil || !strings.Contains(err.Error(), "nothing received") {
		t.Fatalf("a stalled download must be given up: %v", err)
	}
}
