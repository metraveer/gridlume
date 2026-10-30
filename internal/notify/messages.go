package notify

import (
	"context"
	"strings"
	"time"

	"github.com/metraveer/gridlume/internal/i18n"
	"github.com/metraveer/gridlume/internal/problems"
	"github.com/metraveer/gridlume/internal/store"
)

// ManyAtOnce: when more problems than this open at the same moment, they go as one message.
const ManyAtOnce = 3

// Changed turns what the problem engine just did into messages, following the rules. before gives the
// changes just before a problem began (nil: none).
func (n *Notifier) Changed(ctx context.Context, ch problems.Change, m store.Map, before func(store.Problem) []store.Change) {
	if len(ch.Opened) == 0 && len(ch.Ended) == 0 {
		return
	}
	if _, _, ok := n.target(ctx); !ok {
		return
	}
	for _, text := range Messages(n.GetRules(ctx), ch, m, n.Now(), before) {
		n.Enqueue(text)
	}
}

// Messages are the texts for one change. Amber problems are left out when the rules say so, and in
// quiet hours; red ones always go. "Resolved" follows the same choice as the opening it ends.
func Messages(r Rules, ch problems.Change, m store.Map, now time.Time, before func(store.Problem) []store.Change) []string {
	quiet := r.quietNow(now)
	tell := func(p store.Problem) bool { return p.Severity == "crit" || (r.Warn && !quiet) }
	var opened []store.Problem
	for _, p := range ch.Opened {
		if tell(p) {
			opened = append(opened, p)
		}
	}
	var out []string
	if len(opened) > ManyAtOnce {
		lines := []string{i18n.T(r.Lang, "notify.many", map[string]any{"count": len(opened)})}
		for _, p := range opened {
			lines = append(lines, icon(p)+" "+Title(r.Lang, p, m, now))
		}
		out = append(out, strings.Join(lines, "\n"))
	} else {
		for _, p := range opened {
			var bs []store.Change
			if before != nil {
				bs = before(p)
			}
			out = append(out, Message(r.Lang, p, m, now, bs...))
		}
	}
	if r.Resolved {
		for _, p := range ch.Ended {
			if !tell(p) {
				continue
			}
			lasted := time.UnixMilli(p.Ended).Sub(time.UnixMilli(p.Since))
			out = append(out, "✅ "+i18n.T(r.Lang, "notify.resolved", map[string]any{"title": Title(r.Lang, p, m, now), "dur": duration(r.Lang, lasted)}))
		}
	}
	return out
}

// Message is one problem: what, what it means and what to do, how many signals it covers, and what
// changed just before.
func Message(lang string, p store.Problem, m store.Map, now time.Time, before ...store.Change) string {
	vars := textVars(lang, p, m, now)
	parts := []string{icon(p) + " " + i18n.T(lang, "prob."+p.Kind, vars), i18n.T(lang, "prob."+p.Kind+".what", vars)}
	if len(p.Merged) > 0 {
		parts = append(parts, i18n.T(lang, "pr.merged", map[string]any{"count": len(p.Merged)}))
	}
	if len(before) > 0 {
		lines := []string{i18n.T(lang, "pr.before", nil)}
		for _, c := range before {
			lines = append(lines, "• "+ChangeText(lang, c)+" ("+ago(lang, now.Sub(time.UnixMilli(c.At)))+")")
		}
		parts = append(parts, strings.Join(lines, "\n"))
	}
	return strings.Join(parts, "\n\n")
}

// Title is the one-line text of a problem.
func Title(lang string, p store.Problem, m store.Map, now time.Time) string {
	return i18n.T(lang, "prob."+p.Kind, textVars(lang, p, m, now))
}

func icon(p store.Problem) string {
	if p.Severity == "crit" {
		return "🔴"
	}
	return "🟡"
}

// textVars are the problem's figures plus the names of its node or link, as the interface fills them in.
func textVars(lang string, p store.Problem, m store.Map, now time.Time) map[string]any {
	name := func(id string) string {
		for _, n := range m.Nodes {
			if n.ID == id {
				return n.Name
			}
		}
		return i18n.T(lang, "pr.unknown", nil)
	}
	vars := map[string]any{}
	for k, v := range p.Params {
		vars[k] = v
	}
	vars["node"] = name(p.NodeID)
	for _, l := range m.Links {
		if l.ID == p.LinkID {
			vars["from"], vars["to"] = name(l.FromID), name(l.ToID)
		}
	}
	if ls, ok := number(p.Params["lastSeen"]); ok {
		vars["ago"] = ago(lang, now.Sub(time.Unix(int64(ls), 0)))
	}
	return vars
}

func ago(lang string, d time.Duration) string {
	switch s := int(d.Seconds()); {
	case s < 60:
		return i18n.T(lang, "time.justNow", nil)
	case s < 3600:
		return i18n.T(lang, "time.minAgo", map[string]any{"n": s / 60})
	case s < 86400:
		return i18n.T(lang, "time.hAgo", map[string]any{"n": s / 3600})
	default:
		return i18n.T(lang, "time.dAgo", map[string]any{"n": s / 86400})
	}
}

func number(v any) (float64, bool) {
	switch x := v.(type) {
	case int:
		return float64(x), true
	case int64:
		return float64(x), true
	case float64:
		return x, true
	}
	return 0, false
}

// ChangeText is one change in words, as the interface says it.
func ChangeText(lang string, c store.Change) string {
	vars := map[string]any{"count": c.Count}
	for k, v := range c.Params {
		vars[k] = v
	}
	return i18n.T(lang, "chg."+c.Kind, vars)
}
