package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSetupCodeSurvivesRestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data", "setup-code")
	a, err := loadOrCreateSetupCode(path)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := loadOrCreateSetupCode(path)
	if a != b || len(a) != 9 {
		t.Fatalf("the code must stay the same across restarts: %q %q", a, b)
	}
	if st, _ := os.Stat(path); st.Mode().Perm()&0o077 != 0 && os.PathSeparator == '/' {
		t.Fatalf("the code file must be private, got %v", st.Mode().Perm())
	}
}

func TestSetupLinksKeepTheCodeOutOfTheRequest(t *testing.T) {
	links := setupLinks("192.168.1.20:7420", "K7QM-2R9X")
	if len(links) != 1 || links[0] != "http://192.168.1.20:7420/#setup=K7QM-2R9X" {
		t.Fatalf("got %v", links)
	}
	// Listening on all addresses: one link per address of this machine.
	for _, l := range setupLinks("0.0.0.0:7420", "K7QM-2R9X") {
		if strings.Contains(l, "0.0.0.0") || !strings.HasSuffix(l, ":7420/#setup=K7QM-2R9X") {
			t.Fatalf("bad link %q", l)
		}
	}
}
