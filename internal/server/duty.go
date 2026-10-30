package server

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/metraveer/gridlume/internal/outside"
	"github.com/metraveer/gridlume/internal/problems"
	"github.com/metraveer/gridlume/internal/version"
)

// "Watch by a duty core": a second Gridlume elsewhere (a cloud server) checks this one every DutyEvery
// and raises the alarm through its own notifications when it stops answering. This core, in turn,
// notices when its duty core stops checking, so a silent watcher does not go unnoticed.
//
// Pairing: this core makes a code; on the duty core the owner enters this core's address and the code.
const (
	settingDutyCode     = "duty_code"    // the code a duty core proves itself with (on the watched core)
	settingDutyName     = "duty_name"    // the duty core's name, as it last said
	settingDutySeen     = "duty_seen"    // unix seconds of its last check
	settingWatchedURL   = "watched_url"  // the core this one watches (on the duty core)
	settingWatchedCode  = "watched_code" //
	settingWatchedName  = "watched_name" //
	settingWatchedOK    = "watched_ok"   // unix seconds of its last answer: survives a restart of this core
	dutyHeader          = "X-Gridlume-Duty"
	dutyNameHeader      = "X-Gridlume-Duty-Name"
	dutySilentAfter     = 5 * time.Minute // the duty core checks every 30 s: five minutes is clearly gone
	watchedFailsToAlarm = 3
)

// DutyEvery is how often a duty core checks the core it watches.
var DutyEvery = 30 * time.Second

// watched is what a duty core knows about the core it watches.
type watched struct {
	mu     sync.Mutex
	OK     bool   `json:"ok"`
	Fails  int    `json:"fails"`
	LastOK int64  `json:"lastOk,omitempty"` // unix seconds
	Error  string `json:"error,omitempty"`
	At     int64  `json:"at,omitempty"`
}

func (a *api) dutyRoutes(mux *http.ServeMux) {
	// Called by the duty core, not a browser: the code is the proof.
	mux.HandleFunc("GET /api/watch/ping", a.dutyPing)
	mux.HandleFunc("POST /api/watch/duty", a.authed(a.ownerOnly(a.makeDutyCode)))
	mux.HandleFunc("DELETE /api/watch/duty", a.authed(a.ownerOnly(a.dropDutyCode)))
	mux.HandleFunc("PUT /api/watch/target", a.authed(a.ownerOnly(a.setWatchTarget)))
	mux.HandleFunc("DELETE /api/watch/target", a.authed(a.ownerOnly(a.dropWatchTarget)))
}

func (a *api) dutyStatus(ctx context.Context) map[string]any {
	get := func(k string) string { v, _ := a.store.Setting(ctx, k, ""); return v }
	seen, _ := strconv.ParseInt(get(settingDutySeen), 10, 64)
	out := map[string]any{"paired": get(settingDutyCode) != "", "dutyName": get(settingDutyName), "dutySeen": seen}
	if u := get(settingWatchedURL); u != "" {
		a.watched.mu.Lock()
		out["watching"] = map[string]any{"url": u, "name": get(settingWatchedName), "ok": a.watched.OK, "fails": a.watched.Fails,
			"lastOk": a.watched.LastOK, "error": a.watched.Error, "at": a.watched.At}
		a.watched.mu.Unlock()
	}
	return out
}

func newCode() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

// makeDutyCode makes (or replaces) the code; it is shown once, to the owner who made it.
func (a *api) makeDutyCode(w http.ResponseWriter, r *http.Request) {
	code := newCode()
	ctx := r.Context()
	for k, v := range map[string]string{settingDutyCode: code, settingDutySeen: "", settingDutyName: ""} {
		if err := a.store.SetSetting(ctx, k, v); err != nil {
			a.fail(w, err)
			return
		}
	}
	out := a.watchStatus(ctx)
	out["code"] = code
	writeJSON(w, http.StatusOK, out)
}

func (a *api) dropDutyCode(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	// What the duty core saw from outside goes with it: nobody would bring it up to date.
	for _, k := range []string{settingDutyCode, settingDutySeen, settingDutyName, settingOutside, settingOutsideAsk, settingOutsideGiven} {
		if err := a.store.SetSetting(ctx, k, ""); err != nil {
			a.fail(w, err)
			return
		}
	}
	writeJSON(w, http.StatusOK, a.watchStatus(ctx))
}

// dutyPing answers the duty core: alive, and who it is; when a check from outside is due, also the
// addresses and ports to check. It says nothing else about this installation.
func (a *api) dutyPing(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	code, _ := a.store.Setting(ctx, settingDutyCode, "")
	given := r.Header.Get(dutyHeader)
	if code == "" || subtle.ConstantTimeCompare([]byte(code), []byte(given)) != 1 {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "bad_code"})
		return
	}
	_ = a.store.SetSetting(ctx, settingDutySeen, strconv.FormatInt(time.Now().Unix(), 10))
	if name := strings.TrimSpace(r.Header.Get(dutyNameHeader)); name != "" && len(name) <= 80 {
		_ = a.store.SetSetting(ctx, settingDutyName, name)
	}
	out := map[string]any{"name": a.coreName(ctx), "version": version.Version}
	if t := a.outsideDue(ctx, time.Now()); t != nil {
		out["outside"] = t
	}
	writeJSON(w, http.StatusOK, out)
}

// setWatchTarget makes this core the duty core of another: it checks the address and code at once.
func (a *api) setWatchTarget(w http.ResponseWriter, r *http.Request) {
	var body struct {
		URL  string `json:"url"`
		Code string `json:"code"`
	}
	if !decode(w, r, &body) {
		return
	}
	u := strings.TrimRight(strings.TrimSpace(body.URL), "/")
	if !strings.HasPrefix(u, "http://") && !strings.HasPrefix(u, "https://") {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "validation", "field": "url", "code": "invalid"})
		return
	}
	ctx := r.Context()
	ans, err := a.pingWatched(ctx, u, strings.TrimSpace(body.Code))
	if err != nil {
		code := "unreachable"
		if errors.Is(err, errBadCode) {
			code = "bad_code"
		}
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "validation", "field": "watch", "code": code})
		return
	}
	for k, v := range map[string]string{settingWatchedURL: u, settingWatchedCode: strings.TrimSpace(body.Code), settingWatchedName: ans.Name} {
		if err := a.store.SetSetting(ctx, k, v); err != nil {
			a.fail(w, err)
			return
		}
	}
	a.watched.mu.Lock()
	a.watched.OK, a.watched.Fails, a.watched.Error, a.watched.LastOK, a.watched.At = true, 0, "", time.Now().Unix(), time.Now().UnixMilli()
	a.watched.mu.Unlock()
	if ans.Outside != nil {
		go a.checkOutside(context.WithoutCancel(ctx), u, strings.TrimSpace(body.Code), *ans.Outside)
	}
	writeJSON(w, http.StatusOK, a.watchStatus(ctx))
}

func (a *api) dropWatchTarget(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	for _, k := range []string{settingWatchedURL, settingWatchedCode, settingWatchedName, settingWatchedOK} {
		if err := a.store.SetSetting(ctx, k, ""); err != nil {
			a.fail(w, err)
			return
		}
	}
	a.watched.mu.Lock()
	a.watched.OK, a.watched.Fails, a.watched.Error, a.watched.LastOK, a.watched.At = false, 0, "", 0, 0
	a.watched.mu.Unlock()
	writeJSON(w, http.StatusOK, a.watchStatus(ctx))
}

var errBadCode = errors.New("the core does not accept this code")

var dutyClient = &http.Client{Timeout: 15 * time.Second}

// pingAnswer is what the watched core says: its name, and what to check from outside when that is due.
type pingAnswer struct {
	Name    string          `json:"name"`
	Outside *outside.Target `json:"outside,omitempty"`
}

// pingWatched asks the watched core whether it is alive.
func (a *api) pingWatched(ctx context.Context, url, code string) (pingAnswer, error) {
	var out pingAnswer
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url+"/api/watch/ping", nil)
	if err != nil {
		return out, err
	}
	req.Header.Set(dutyHeader, code)
	req.Header.Set(dutyNameHeader, a.coreName(ctx))
	res, err := dutyClient.Do(req)
	if err != nil {
		return out, err
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(res.Body, 16<<10))
	if res.StatusCode == http.StatusUnauthorized {
		return out, errBadCode
	}
	if res.StatusCode != http.StatusOK {
		return out, fmt.Errorf("HTTP %d", res.StatusCode)
	}
	_ = json.Unmarshal(b, &out)
	return out, nil
}

// watchTheCore checks the watched core every DutyEvery until ctx ends (a duty core's job).
func (a *api) watchTheCore(ctx context.Context) {
	t := time.NewTicker(DutyEvery)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		a.checkWatched(ctx)
	}
}

func (a *api) checkWatched(ctx context.Context) {
	u, _ := a.store.Setting(ctx, settingWatchedURL, "")
	if u == "" {
		return
	}
	code, _ := a.store.Setting(ctx, settingWatchedCode, "")
	ans, err := a.pingWatched(ctx, u, code)
	if err == nil && ans.Outside != nil {
		go a.checkOutside(ctx, u, code, *ans.Outside)
	}
	a.watched.mu.Lock()
	defer a.watched.mu.Unlock()
	a.watched.At = time.Now().UnixMilli()
	if err != nil {
		a.watched.OK, a.watched.Error = false, short(err)
		a.watched.Fails++
		return
	}
	a.watched.OK, a.watched.Fails, a.watched.Error, a.watched.LastOK = true, 0, "", time.Now().Unix()
	_ = a.store.SetSetting(ctx, settingWatchedOK, strconv.FormatInt(a.watched.LastOK, 10))
	if ans.Name != "" {
		_ = a.store.SetSetting(ctx, settingWatchedName, ans.Name)
	}
}

// short keeps the part of an error people can act on.
func short(err error) string {
	s := err.Error()
	switch {
	case errors.Is(err, errBadCode):
		return "bad_code"
	case strings.Contains(s, "timeout") || strings.Contains(s, "deadline"):
		return "timeout"
	case strings.Contains(s, "connection refused"):
		return "connection refused"
	case strings.Contains(s, "no such host"):
		return "no such host"
	}
	return s
}

// watchSignals are the problems of watching: the watched core does not answer (on a duty core), or the
// duty core stopped checking this one.
func (a *api) watchSignals(ctx context.Context, now time.Time) []problems.Signal {
	var out []problems.Signal
	get := func(k string) string { v, _ := a.store.Setting(ctx, k, ""); return v }
	if u := get(settingWatchedURL); u != "" {
		a.watched.mu.Lock()
		fails, errText := a.watched.Fails, a.watched.Error
		a.watched.mu.Unlock()
		if fails >= watchedFailsToAlarm {
			params := map[string]any{"name": get(settingWatchedName), "target": u, "error": errText}
			if last, _ := strconv.ParseInt(get(settingWatchedOK), 10, 64); last > 0 {
				params["lastSeen"] = last
			}
			out = append(out, problems.Signal{Key: "watched", Kind: "core_down", Severity: "crit", Params: params})
		}
	}
	if get(settingDutyCode) != "" {
		if seen, _ := strconv.ParseInt(get(settingDutySeen), 10, 64); seen > 0 && now.Sub(time.Unix(seen, 0)) > dutySilentAfter {
			out = append(out, problems.Signal{Key: "duty", Kind: "duty_silent", Severity: "warn",
				Params: map[string]any{"name": get(settingDutyName), "lastSeen": seen}})
		}
	}
	return out
}
