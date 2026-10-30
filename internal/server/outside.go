package server

import (
	"bytes"
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/metraveer/gridlume/internal/agentlink"
	"github.com/metraveer/gridlume/internal/outside"
	"github.com/metraveer/gridlume/internal/problems"
	"github.com/metraveer/gridlume/internal/store"
)

// "What is visible from the internet": the duty core, being outside, connects to this installation's
// public addresses and reports which ports answered. It asks for the list with its regular check
// (dutyPing hands it out when a check is due) and sends the result back to /api/watch/outside.
const (
	settingOutside      = "outside_result" // the last result, JSON
	settingOutsideAsk   = "outside_ask"    // unix ms: someone asked to check now
	settingOutsideGiven = "outside_given"  // unix ms: the list was last handed to the duty core
)

// OutsideEvery is how often the duty core checks from outside; a check asked for in the interface
// goes out with the next regular check (within DutyEvery).
var OutsideEvery = 10 * time.Minute

func (a *api) outsideRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/outside", a.authed(a.outsideState))
	mux.HandleFunc("POST /api/outside/check", a.authed(a.askOutside))
	// Called by the duty core: the code is the proof.
	mux.HandleFunc("POST /api/watch/outside", a.takeOutside)
}

func (a *api) settingInt(ctx context.Context, k string) int64 {
	v, _ := a.store.Setting(ctx, k, "")
	n, _ := strconv.ParseInt(v, 10, 64)
	return n
}

func (a *api) lastOutside(ctx context.Context) *outside.Result {
	v, _ := a.store.Setting(ctx, settingOutside, "")
	if v == "" {
		return nil
	}
	var r outside.Result
	if json.Unmarshal([]byte(v), &r) != nil {
		return nil
	}
	return &r
}

// outsideDue: the list to hand to the duty core when a check is due, else nil.
func (a *api) outsideDue(ctx context.Context, now time.Time) *outside.Target {
	given := time.UnixMilli(a.settingInt(ctx, settingOutsideGiven))
	if now.Sub(given) < 4*time.Minute { // it is checking now (a check gives up after three)
		return nil
	}
	last := int64(0)
	if r := a.lastOutside(ctx); r != nil {
		last = r.At
	}
	if now.Sub(time.UnixMilli(last)) < OutsideEvery && a.settingInt(ctx, settingOutsideAsk) <= last {
		return nil
	}
	m, err := a.store.GetMap(ctx)
	if err != nil {
		return nil
	}
	t := outside.Targets(m, a.hub.Snapshots())
	_ = a.store.SetSetting(ctx, settingOutsideGiven, strconv.FormatInt(now.UnixMilli(), 10))
	return &t
}

// takeOutside stores what the duty core found. Only the shape is trusted, and only within the limits.
func (a *api) takeOutside(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	code, _ := a.store.Setting(ctx, settingDutyCode, "")
	if code == "" || subtle.ConstantTimeCompare([]byte(code), []byte(r.Header.Get(dutyHeader))) != 1 {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "bad_code"})
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	var res outside.Result
	if !decode(w, r, &res) {
		return
	}
	res.At = time.Now().UnixMilli()
	res.By = clip(res.By, 80)
	res.Ports = clipList(res.Ports, outside.MaxPorts)
	res.Found = clipList(res.Found, outside.MaxIPs)
	res.Skip = clipList(res.Skip, outside.MaxHosts)
	for i := range res.Skip {
		res.Skip[i] = clip(res.Skip[i], 255)
	}
	for i := range res.Found {
		f := &res.Found[i]
		f.IP = clip(f.IP, 64)
		f.Names = clipList(f.Names, outside.MaxHosts)
		for j := range f.Names {
			f.Names[j] = clip(f.Names[j], 255)
		}
		f.Open = clipList(f.Open, outside.MaxPorts)
		if f.Open == nil {
			f.Open = []outside.Open{}
		}
	}
	if res.Found == nil {
		res.Found = []outside.Found{}
	}
	b, _ := json.Marshal(res)
	if err := a.store.SetSetting(ctx, settingOutside, string(b)); err != nil {
		a.fail(w, err)
		return
	}
	_ = a.store.SetSetting(ctx, settingOutsideGiven, "")
	a.hub.Publish(agentlink.Event{Outside: true})
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func clip(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}

func clipList[T any](xs []T, n int) []T {
	if len(xs) > n {
		return xs[:n]
	}
	return xs
}

// outsideState is the page: the last result with the nodes each open port leads to, what the next
// check will look at, and whether there is anyone outside to check.
func (a *api) outsideState(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, a.outsideStatus(r.Context()))
}

func (a *api) outsideStatus(ctx context.Context) map[string]any {
	m, _ := a.store.GetMap(ctx)
	snaps := a.hub.Snapshots()
	type port struct {
		outside.Open
		Service string   `json:"service"`
		Risk    string   `json:"risk"`
		Nodes   []string `json:"nodes"`
	}
	type found struct {
		IP    string   `json:"ip"`
		Names []string `json:"names"`
		Open  []port   `json:"open"`
	}
	out := map[string]any{
		"target": outside.Targets(m, snaps),
		"duty":   a.dutyStatus(ctx),
		"asked":  a.settingInt(ctx, settingOutsideAsk),
		"every":  int(OutsideEvery / time.Second),
	}
	if res := a.lastOutside(ctx); res != nil {
		list := []found{}
		for _, f := range res.Found {
			fo := found{IP: f.IP, Names: f.Names, Open: []port{}}
			for _, o := range f.Open {
				s := outside.ServiceOf(o.Port)
				nodes := outside.Explain(m, snaps, o.Port)
				if nodes == nil {
					nodes = []string{}
				}
				fo.Open = append(fo.Open, port{Open: o, Service: s.Name, Risk: s.Risk, Nodes: nodes})
			}
			list = append(list, fo)
		}
		out["result"] = map[string]any{"at": res.At, "by": res.By, "ports": res.Ports, "found": list, "skip": res.Skip}
	}
	return out
}

func (a *api) askOutside(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if err := a.store.SetSetting(ctx, settingOutsideAsk, strconv.FormatInt(time.Now().UnixMilli(), 10)); err != nil {
		a.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, a.outsideStatus(ctx))
}

// outsideSignals: the risky ports the last check found open.
func (a *api) outsideSignals(ctx context.Context, m store.Map) []problems.Signal {
	return outside.Signals(a.lastOutside(ctx), m, a.hub.Snapshots())
}

// checkOutside runs on the duty core: connect to the watched core's addresses (its own address first)
// and send back what answered.
func (a *api) checkOutside(ctx context.Context, watchedURL, code string, t outside.Target) {
	if !a.outsideBusy.CompareAndSwap(false, true) {
		return
	}
	defer a.outsideBusy.Store(false)
	hosts := t.Hosts
	if u, err := url.Parse(watchedURL); err == nil && u.Hostname() != "" {
		hosts = append([]string{u.Hostname()}, hosts...)
	}
	ctx, cancel := context.WithTimeout(ctx, 3*time.Minute)
	defer cancel()
	res := outside.Scan(ctx, outside.Target{Hosts: clipList(hosts, outside.MaxHosts+1), Ports: t.Ports}, a.coreName(ctx))
	b, _ := json.Marshal(res)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, watchedURL+"/api/watch/outside", bytes.NewReader(b))
	if err != nil {
		return
	}
	req.Header.Set(dutyHeader, code)
	req.Header.Set("Content-Type", "application/json")
	resp, err := dutyClient.Do(req)
	if err != nil {
		a.log.Warn("outside check: send", "err", err)
		return
	}
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		a.log.Warn("outside check: send", "err", fmt.Sprintf("HTTP %d", resp.StatusCode))
	}
}
