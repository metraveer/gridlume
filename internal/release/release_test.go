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
	return &Client{HTTP: srv.Client(), Base: func(string) string { return srv.URL + "/edge" }, Key: pub}, pub
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
