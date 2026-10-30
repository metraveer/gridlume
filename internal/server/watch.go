package server

import (
	"context"
	"net/http"
	"os"
	"slices"
	"strconv"
	"strings"

	"github.com/metraveer/gridlume/internal/agentproto"
	"github.com/metraveer/gridlume/internal/i18n"
	"github.com/metraveer/gridlume/internal/store"
)

// Settings of "watch by agents": which agents watch the core, and after how many minutes they speak.
const (
	settingWatchAgents = "watch_agents" // agent ids, comma-separated
	settingWatchAfter  = "watch_after"  // minutes
)

type watchAgents struct {
	Agents []string `json:"agents"`
	After  int      `json:"after"` // minutes, 1–60
}

func (a *api) watchRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/watch", a.authed(a.watchState))
	// It hands the bot token to other machines: the owner's decision only.
	mux.HandleFunc("PUT /api/watch/agents", a.authed(a.ownerOnly(a.saveWatchAgents)))
}

func (a *api) getWatchAgents(ctx context.Context) watchAgents {
	ids, _ := a.store.Setting(ctx, settingWatchAgents, "")
	after, _ := a.store.Setting(ctx, settingWatchAfter, "3")
	w := watchAgents{Agents: []string{}}
	for _, id := range strings.Split(ids, ",") {
		if id = strings.TrimSpace(id); id != "" {
			w.Agents = append(w.Agents, id)
		}
	}
	w.After, _ = strconv.Atoi(after)
	if w.After < 1 {
		w.After = 3
	}
	return w
}

func (a *api) watchState(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, a.watchStatus(r.Context()))
}

func (a *api) watchStatus(ctx context.Context) map[string]any {
	return map[string]any{"agents": a.getWatchAgents(ctx), "duty": a.dutyStatus(ctx)}
}

func (a *api) saveWatchAgents(w http.ResponseWriter, r *http.Request) {
	var body watchAgents
	if !decode(w, r, &body) {
		return
	}
	if body.After < 1 || body.After > 60 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "validation", "field": "after", "code": "invalid"})
		return
	}
	ctx := r.Context()
	known := map[string]bool{}
	if list, err := a.store.ListAgents(ctx); err == nil {
		for _, ag := range list {
			known[ag.ID] = true
		}
	}
	ids := []string{}
	for _, id := range body.Agents {
		if known[id] && !slices.Contains(ids, id) {
			ids = append(ids, id)
		}
	}
	if err := a.store.SetSetting(ctx, settingWatchAgents, strings.Join(ids, ",")); err != nil {
		a.fail(w, err)
		return
	}
	if err := a.store.SetSetting(ctx, settingWatchAfter, strconv.Itoa(body.After)); err != nil {
		a.fail(w, err)
		return
	}
	go a.hub.RefreshWatch(context.Background())
	writeJSON(w, http.StatusOK, a.watchStatus(ctx))
}

// watchFor is what an agent gets: the bot and the texts if it is one of the watchers and Telegram is
// connected; nil otherwise (which also takes the token off a machine that is no longer a watcher).
func (a *api) watchFor(ctx context.Context, agentID string) *agentproto.Watch {
	cfg := a.getWatchAgents(ctx)
	if !slices.Contains(cfg.Agents, agentID) {
		return nil
	}
	token, chat, ok := a.notify.Target(ctx)
	if !ok {
		return nil
	}
	lang := a.notify.GetRules(ctx).Lang
	vars := map[string]any{"core": a.coreName(ctx)}
	// {min} and {host} stay as they are: the agent fills them in when it speaks.
	return &agentproto.Watch{Token: token, Chat: chat, After: cfg.After * 60,
		Down: i18n.T(lang, "watch.down", vars), Up: i18n.T(lang, "watch.up", vars)}
}

// coreName is how messages call this core: its machine's name on the map, else the host name.
func (a *api) coreName(ctx context.Context) string {
	if id, _ := a.store.Setting(ctx, store.SettingCoreNode, ""); id != "" {
		if m, err := a.store.GetMap(ctx); err == nil {
			for _, n := range m.Nodes {
				if n.ID == id {
					return n.Name
				}
			}
		}
	}
	h, _ := os.Hostname()
	return h
}
