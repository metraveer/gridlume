package update

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"testing"

	"github.com/metraveer/gridlume/internal/release"
	"github.com/metraveer/gridlume/internal/version"
)

// setup makes an "installed" Gridlume in a temp folder and a signed release (build 7) to update to.
func setup(t *testing.T) (*Updater, *[]string) {
	t.Helper()
	oldBuild, oldVersion := version.Build, version.Version
	version.Build, version.Version = "5", "edge-5"
	t.Cleanup(func() { version.Build, version.Version = oldBuild, oldVersion })

	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	files := map[string][]byte{
		"release.json":                     []byte(`{"version":"edge-7","channel":"edge","build":7}`),
		"gridlume-linux-" + runtime.GOARCH: []byte("core v7"),
		"gridlume-agent-linux-amd64":       []byte("agent v7 amd64"),
		"gridlume-agent-linux-arm64":       []byte("agent v7 arm64"),
	}
	var sums []string
	for n, b := range files {
		s := sha256.Sum256(b)
		sums = append(sums, hex.EncodeToString(s[:])+"  "+n)
	}
	files["SHA256SUMS"] = []byte(strings.Join(sums, "\n") + "\n")
	sig, _ := release.Sign(base64.StdEncoding.EncodeToString(priv.Seed()), files["SHA256SUMS"])
	files["SHA256SUMS.sig"] = []byte(sig)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if b, ok := files[filepath.Base(r.URL.Path)]; ok {
			_, _ = w.Write(b)
			return
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(srv.Close)

	root := t.TempDir()
	p := Paths{
		Bin: filepath.Join(root, "bin", "gridlume"), AgentBin: filepath.Join(root, "bin", "gridlume-agent"),
		Data: filepath.Join(root, "data"), Agents: filepath.Join(root, "data", "agents"),
		CoreUser: "gridlume-core", CoreUnit: "gridlume", AgentUnit: "gridlume-agent", Health: "http://core",
	}
	for _, d := range []string{filepath.Dir(p.Bin), p.Agents, filepath.Join(p.Data, "backups")} {
		_ = os.MkdirAll(d, 0o755)
	}
	_ = os.WriteFile(p.Bin, []byte("core v5"), 0o755)
	_ = os.WriteFile(p.AgentBin, []byte("agent v5"), 0o755)
	_ = os.WriteFile(filepath.Join(p.Data, "gridlume.db"), []byte("db before"), 0o600)

	var ran []string
	u := &Updater{
		Paths:  p,
		Client: &release.Client{HTTP: srv.Client(), Resolve: func(context.Context, *release.Client, string) (string, error) { return srv.URL + "/edge-7", nil }, Key: pub},
		Log:    slog.New(slog.NewTextHandler(io.Discard, nil)),
		Run: func(_ context.Context, name string, args ...string) error {
			ran = append(ran, name+" "+strings.Join(args, " "))
			if i := slices.Index(args, "--to"); i >= 0 { // the backup, made as the core's user
				return os.WriteFile(args[i+1], []byte("db before"), 0o600)
			}
			if name == "systemctl" && args[0] == "restart" { // the new core migrates the database
				return os.WriteFile(filepath.Join(p.Data, "gridlume.db"), []byte("db migrated"), 0o600)
			}
			return nil
		},
		Ready: func(context.Context, string, string) error { return nil },
	}
	return u, &ran
}

func read(t *testing.T, path string) string {
	t.Helper()
	b, _ := os.ReadFile(path)
	return string(b)
}

func TestUpdateSwapsFilesAndKeepsTheOldOnes(t *testing.T) {
	u, ran := setup(t)
	st, err := u.Apply(context.Background(), release.Edge)
	if err != nil || st.State != "done" || st.To != "edge-7" {
		t.Fatalf("apply: %v %+v", err, st)
	}
	if read(t, u.Paths.Bin) != "core v7" || read(t, u.Paths.Bin+".prev") != "core v5" {
		t.Fatal("core not swapped")
	}
	if read(t, u.Paths.AgentBin) != "agent v7 "+runtime.GOARCH || read(t, filepath.Join(u.Paths.Agents, "gridlume-agent-linux-arm64")) != "agent v7 arm64" {
		t.Fatal("agents not updated")
	}
	if !slices.ContainsFunc(*ran, func(s string) bool { return strings.HasPrefix(s, "runuser -u gridlume-core -- ") }) {
		t.Fatalf("the backup must be made as the core's user: %v", *ran)
	}
	if got, _ := ReadStatus(u.Paths.Data); got.State != "done" {
		t.Fatalf("status: %+v", got)
	}
	// Nothing newer: nothing happens.
	version.Build = "7"
	if st, _ := u.Apply(context.Background(), release.Edge); st.State != "up_to_date" {
		t.Fatalf("second apply: %+v", st)
	}
}

func TestUpdateRollsBackWhenTheNewCoreDoesNotStart(t *testing.T) {
	u, _ := setup(t)
	u.Ready = func(context.Context, string, string) error { return errors.New("no answer") }
	st, err := u.Apply(context.Background(), release.Edge)
	if err == nil || st.State != "rolled_back" {
		t.Fatalf("want rolled_back, got %v %+v", err, st)
	}
	if read(t, u.Paths.Bin) != "core v5" {
		t.Fatal("old core not restored")
	}
	if read(t, filepath.Join(u.Paths.Data, "gridlume.db")) != "db before" {
		t.Fatal("database not restored from the backup")
	}
	if read(t, u.Paths.AgentBin) != "agent v5" {
		t.Fatal("the local agent must not change when the core failed")
	}
}

func TestRequestRoundTrip(t *testing.T) {
	dir := t.TempDir()
	if err := WriteRequest(dir, release.Stable); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(RequestFile(dir)); err != nil {
		t.Fatal(err)
	}
}
