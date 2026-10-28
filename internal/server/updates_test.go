package server

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/metraveer/gridlume/internal/release"
	"github.com/metraveer/gridlume/internal/store"
	upd "github.com/metraveer/gridlume/internal/update"
	"github.com/metraveer/gridlume/internal/version"
)

// fakeGitHub serves one signed release per channel: stable 0.2.0 (build 8), edge 0.3.0-dev.9 (build 9).
func fakeGitHub(t *testing.T) *release.Client {
	t.Helper()
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	files := map[string]map[string][]byte{
		"stable": {"release.json": []byte(`{"version":"0.2.0","channel":"stable","build":8}`)},
		"edge":   {"release.json": []byte(`{"version":"0.3.0-dev.9","channel":"edge","build":9}`)},
	}
	for _, f := range files {
		s := sha256.Sum256(f["release.json"])
		f["SHA256SUMS"] = []byte(hex.EncodeToString(s[:]) + "  release.json\n")
		sig, _ := release.Sign(base64.StdEncoding.EncodeToString(priv.Seed()), f["SHA256SUMS"])
		f["SHA256SUMS.sig"] = []byte(sig)
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		if b, ok := files[parts[0]][parts[len(parts)-1]]; ok {
			_, _ = w.Write(b)
			return
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(srv.Close)
	return &release.Client{HTTP: srv.Client(), Key: pub, Resolve: func(_ context.Context, _ *release.Client, ch string) (string, error) {
		return srv.URL + "/" + ch, nil
	}}
}

func systemOf(t *testing.T, a *api) map[string]any {
	t.Helper()
	w := httptest.NewRecorder()
	a.system(w, httptest.NewRequest("GET", "/api/system", nil))
	var out map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	return out
}

func TestUpdatesSeeBothChannels(t *testing.T) {
	oldV, oldB, oldC := version.Version, version.Build, version.Channel
	version.Version, version.Build, version.Channel = "0.2.0", "8", "stable"
	t.Cleanup(func() { version.Version, version.Build, version.Channel = oldV, oldB, oldC })

	data := t.TempDir()
	s, err := store.Open(filepath.Join(data, "gridlume.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	a := newAPI(Options{Store: s, DataDir: data, UpdatesEnabled: true}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	a.upd.client = fakeGitHub(t)

	// An update of an older version is history: not shown for the version running now.
	_ = upd.MarkInstalled(data, "edge-4")
	a.check(context.Background())
	out := systemOf(t, a)
	if out["channel"] != "stable" || out["newer"] != false || out["ahead"] != false || out["last"] != nil {
		t.Fatalf("on stable 0.2.0: %v", out)
	}
	edge := out["channels"].(map[string]any)["edge"].(map[string]any)
	if edge["newer"] != true || edge["latest"].(map[string]any)["version"] != "0.3.0-dev.9" {
		t.Fatalf("stable must still see the fresh edge build: %v", edge)
	}

	// The channel file is the one source: what the installer or the console wrote is what the panel shows.
	_ = upd.WriteChannel(data, release.Edge)
	if out := systemOf(t, a); out["channel"] != "edge" || out["newer"] != true {
		t.Fatalf("after switching the file to edge: %v", out)
	}

	// Running a newer build than the chosen channel has: "ahead", nothing to install.
	version.Build = "10"
	_ = upd.WriteChannel(data, release.Stable)
	a.check(context.Background())
	if out := systemOf(t, a); out["ahead"] != true || out["newer"] != false {
		t.Fatalf("ahead of stable: %v", out)
	}
	_ = upd.MarkInstalled(data, "0.2.0")
	if out := systemOf(t, a); out["last"].(map[string]any)["state"] != "installed" {
		t.Fatalf("this install must be shown: %v", out)
	}
}
