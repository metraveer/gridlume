// Package i18n gives the core the interface's own texts (web/src/i18n), for what it says by itself:
// notifications. One dictionary for both, so a problem reads the same in Telegram and on the screen.
//
// It understands the subset of ICU the dictionaries use: {name} and
// {count, plural, =0 {…} one {…} few {…} many {…} other {…}} with # for the number.
package i18n

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"sync"

	"github.com/metraveer/gridlume/web"
)

// Langs are the languages there are dictionaries for.
var Langs = []string{"ru", "en"}

var (
	once  sync.Once
	dicts map[string]map[string]string
)

func load() {
	dicts = map[string]map[string]string{}
	for _, l := range Langs {
		b, err := web.Texts(l)
		if err != nil {
			continue
		}
		d := map[string]string{}
		if json.Unmarshal(b, &d) == nil {
			dicts[l] = d
		}
	}
}

// T returns the text for key in lang with vars filled in; the key itself if there is no such text.
func T(lang, key string, vars map[string]any) string {
	once.Do(load)
	d := dicts[lang]
	if d == nil {
		d = dicts["en"]
	}
	s, ok := d[key]
	if !ok {
		return key
	}
	return Format(lang, s, vars)
}

// Format fills a message in.
func Format(lang, s string, vars map[string]any) string {
	var b strings.Builder
	for i := 0; i < len(s); {
		if s[i] != '{' {
			b.WriteByte(s[i])
			i++
			continue
		}
		end := matching(s, i)
		if end < 0 {
			b.WriteString(s[i:])
			break
		}
		b.WriteString(placeholder(lang, s[i+1:end], vars))
		i = end + 1
	}
	return b.String()
}

// matching returns the index of the brace closing the one at i, or -1.
func matching(s string, i int) int {
	depth := 0
	for j := i; j < len(s); j++ {
		switch s[j] {
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return j
			}
		}
	}
	return -1
}

func placeholder(lang, body string, vars map[string]any) string {
	name, rest, plural := strings.Cut(body, ",")
	name = strings.TrimSpace(name)
	if !plural {
		if v, ok := vars[name]; ok {
			return str(v)
		}
		return "{" + body + "}"
	}
	kind, opts, _ := strings.Cut(strings.TrimSpace(rest), ",")
	if strings.TrimSpace(kind) != "plural" {
		return "{" + body + "}"
	}
	n, ok := number(vars[name])
	if !ok {
		return "{" + body + "}"
	}
	choices := map[string]string{}
	for o := strings.TrimSpace(opts); o != ""; o = strings.TrimSpace(o) {
		sel, after, found := strings.Cut(o, "{")
		if !found {
			break
		}
		start := len(o) - len(after) - 1
		end := matching(o, start)
		if end < 0 {
			break
		}
		choices[strings.TrimSpace(sel)] = o[start+1 : end]
		o = o[end+1:]
	}
	text, ok := choices["="+str(n)]
	if !ok {
		text, ok = choices[category(lang, n)]
	}
	if !ok {
		text = choices["other"]
	}
	inner := map[string]any{}
	for k, v := range vars {
		inner[k] = v
	}
	return Format(lang, strings.ReplaceAll(text, "#", str(n)), inner)
}

// category is the CLDR plural category of a whole number: Russian has one, few and many.
func category(lang string, n float64) string {
	if n != math.Trunc(n) {
		return "other"
	}
	i := int64(math.Abs(n))
	if lang == "ru" {
		switch {
		case i%10 == 1 && i%100 != 11:
			return "one"
		case i%10 >= 2 && i%10 <= 4 && (i%100 < 12 || i%100 > 14):
			return "few"
		default:
			return "many"
		}
	}
	if i == 1 {
		return "one"
	}
	return "other"
}

func number(v any) (float64, bool) {
	switch x := v.(type) {
	case int:
		return float64(x), true
	case int64:
		return float64(x), true
	case uint64:
		return float64(x), true
	case float64:
		return x, true
	case json.Number:
		f, err := x.Float64()
		return f, err == nil
	}
	return 0, false
}

func str(v any) string {
	switch x := v.(type) {
	case string:
		return x
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64)
	default:
		return fmt.Sprint(x)
	}
}
