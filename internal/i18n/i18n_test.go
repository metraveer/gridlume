package i18n

import "testing"

func TestFormat(t *testing.T) {
	plural := "{count, plural, =0 {нет} one {# узел} few {# узла} many {# узлов} other {# узла}}"
	for n, want := range map[int]string{0: "нет", 1: "1 узел", 3: "3 узла", 5: "5 узлов", 11: "11 узлов", 21: "21 узел", 112: "112 узлов"} {
		if got := Format("ru", plural, map[string]any{"count": n}); got != want {
			t.Errorf("ru %d: got %q, want %q", n, got, want)
		}
	}
	if got := Format("en", "{count, plural, one {# day} other {# days}}", map[string]any{"count": 1}); got != "1 day" {
		t.Errorf("en: %q", got)
	}
	if got := Format("ru", "На {node} занят {mount}: {percent}%", map[string]any{"node": "calibur", "mount": "/", "percent": 93.5}); got != "На calibur занят /: 93.5%" {
		t.Errorf("vars: %q", got)
	}
	// A plural with a variable inside, as the certificate text has.
	got := Format("ru", "{days, plural, one {Сертификат {node} истекает через # день} other {через # дн.}}", map[string]any{"days": 1, "node": "example.org"})
	if got != "Сертификат example.org истекает через 1 день" {
		t.Errorf("nested: %q", got)
	}
	if got := Format("ru", "{missing}", nil); got != "{missing}" {
		t.Errorf("missing: %q", got)
	}
}

func TestTexts(t *testing.T) {
	if got := T("ru", "st.ok", nil); got != "Всё работает" {
		t.Fatalf("ru dictionary: %q", got)
	}
	if got := T("en", "prob.disk_full", map[string]any{"node": "calibur", "mount": "/", "percent": 93}); got != "calibur is running out of space: / is 93% full" {
		t.Fatalf("en problem: %q", got)
	}
	if got := T("xx", "st.ok", nil); got != "All good" {
		t.Fatalf("unknown language falls back to English: %q", got)
	}
}
