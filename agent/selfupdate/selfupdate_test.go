package selfupdate

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/metraveer/gridlume/agent/link"
	"github.com/metraveer/gridlume/internal/agentproto"
	"github.com/metraveer/gridlume/internal/release"
	"github.com/metraveer/gridlume/internal/version"
)

// fakeCore serves a signed release of an agent build, as the core does from its agents folder.
func fakeCore(t *testing.T, key ed25519.PrivateKey, build int, body string) *httptest.Server {
	t.Helper()
	name := "gridlume-agent-linux-" + runtime.GOARCH
	manifest, _ := json.Marshal(release.Manifest{Version: fmt.Sprintf("0.9.0-dev.%d", build), Channel: "edge", Build: build})
	files := map[string][]byte{name: []byte(body), "release.json": manifest}
	var sums strings.Builder
	for n, b := range files {
		h := sha256.Sum256(b)
		fmt.Fprintf(&sums, "%s  %s\n", hex.EncodeToString(h[:]), n)
	}
	files["SHA256SUMS"] = []byte(sums.String())
	files["SHA256SUMS.sig"] = []byte(base64.StdEncoding.EncodeToString(ed25519.Sign(key, []byte(sums.String()))))
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, ok := files[strings.TrimPrefix(r.URL.Path, "/download/")]
		if !ok {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write(b)
	}))
}

func setup(t *testing.T, core string, pub ed25519.PublicKey, connects bool) (*Updater, *[]string) {
	t.Helper()
	dir := t.TempDir()
	state := filepath.Join(dir, "state")
	_ = os.MkdirAll(state, 0o700)
	seed := make([]byte, ed25519.SeedSize)
	cfg, _ := json.Marshal(link.Config{Core: core, AgentID: "a1", Key: seed, Mode: "user"})
	_ = os.WriteFile(filepath.Join(state, "agent.json"), cfg, 0o600)
	bin := filepath.Join(dir, "gridlume-agent")
	_ = os.WriteFile(bin, []byte("old agent"), 0o755)
	var calls []string
	u := &Updater{State: state, Bin: bin, Units: []string{"gridlume-agent"}, Extra: []string{"gridlume-docker-ro"},
		Log: slog.New(slog.NewTextHandler(io.Discard, nil)), Client: &release.Client{HTTP: http.DefaultClient, Key: pub}, Wait: 3 * time.Second,
		Run: func(_ context.Context, name string, args ...string) error {
			// As on a machine in the "user" mode: there is no proxy unit, and systemctl says so.
			if strings.Contains(strings.Join(args, " "), "gridlume-docker-ro") {
				return fmt.Errorf("Unit gridlume-docker-ro.service not found")
			}
			calls = append(calls, name+" "+strings.Join(args, " "))
			// The restarted agent reports the version it runs, as link.Once does after a welcome.
			if connects || !strings.HasPrefix(readFile(bin), "new") {
				v := version.Version
				if strings.HasPrefix(readFile(bin), "new") {
					v = "0.9.0-dev.900"
				}
				_ = os.WriteFile(filepath.Join(state, link.ConnectedFile), []byte(v), 0o600)
			}
			return nil
		}}
	return u, &calls
}

func readFile(p string) string { b, _ := os.ReadFile(p); return string(b) }

func status(t *testing.T, u *Updater) agentproto.UpdateResult {
	t.Helper()
	var r agentproto.UpdateResult
	if err := json.Unmarshal([]byte(readFile(filepath.Join(u.State, link.StatusFile))), &r); err != nil {
		t.Fatal(err)
	}
	return r
}

func TestUpdateInstallsSignedBuild(t *testing.T) {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	srv := fakeCore(t, priv, 900, "new agent")
	defer srv.Close()
	u, calls := setup(t, srv.URL, pub, true)
	_ = os.WriteFile(filepath.Join(u.State, link.RequestFile), []byte("0.9.0-dev.900"), 0o600)
	if err := u.FromRequest(context.Background()); err != nil {
		t.Fatal(err)
	}
	if readFile(u.Bin) != "new agent" || readFile(u.Bin+".prev") != "old agent" {
		t.Fatalf("bin %q prev %q", readFile(u.Bin), readFile(u.Bin+".prev"))
	}
	if st := status(t, u); st.State != "done" || st.To != "0.9.0-dev.900" {
		t.Fatalf("status %+v", st)
	}
	if len(*calls) != 1 || !strings.Contains((*calls)[0], "try-restart gridlume-agent") {
		t.Fatalf("calls %v", *calls)
	}
	if _, err := os.Stat(filepath.Join(u.State, link.RequestFile)); err == nil {
		t.Fatal("the request must be consumed")
	}
}

func TestUpdateRollsBackWhenNewAgentDoesNotConnect(t *testing.T) {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	srv := fakeCore(t, priv, 900, "new agent")
	defer srv.Close()
	u, _ := setup(t, srv.URL, pub, false)
	if err := u.Apply(context.Background()); err == nil {
		t.Fatal("expected a failure")
	}
	if readFile(u.Bin) != "old agent" {
		t.Fatalf("the old agent must be back, got %q", readFile(u.Bin))
	}
	if st := status(t, u); st.State != "rolled_back" {
		t.Fatalf("status %+v", st)
	}
}

func TestUpdateRefusesForeignSignature(t *testing.T) {
	pub, _, _ := ed25519.GenerateKey(rand.Reader)
	_, other, _ := ed25519.GenerateKey(rand.Reader)
	srv := fakeCore(t, other, 900, "evil agent")
	defer srv.Close()
	u, calls := setup(t, srv.URL, pub, true)
	if err := u.Apply(context.Background()); err == nil {
		t.Fatal("a build signed with another key must be refused")
	}
	if readFile(u.Bin) != "old agent" || len(*calls) != 0 {
		t.Fatalf("nothing may change: bin %q calls %v", readFile(u.Bin), *calls)
	}
}

func TestUpdateSkipsWhenNotNewer(t *testing.T) {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	srv := fakeCore(t, priv, 0, "same agent") // build 0: not newer than a local build
	defer srv.Close()
	u, calls := setup(t, srv.URL, pub, true)
	if err := u.Apply(context.Background()); err != nil {
		t.Fatal(err)
	}
	if st := status(t, u); st.State != "up_to_date" || len(*calls) != 0 {
		t.Fatalf("status %+v calls %v", st, *calls)
	}
}
