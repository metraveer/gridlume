package server

import (
	"errors"
	"net/http"

	"github.com/metraveer/gridlume/internal/notify"
	"github.com/metraveer/gridlume/internal/tg"
)

func (a *api) notifyRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/notify", a.authed(a.notifyState))
	// Changing where messages go is the owner's: a viewer must not redirect alerts to their own chat.
	mux.HandleFunc("POST /api/notify/telegram", a.authed(a.ownerOnly(a.connectTelegram)))
	mux.HandleFunc("DELETE /api/notify/telegram", a.authed(a.ownerOnly(a.disconnectTelegram)))
	mux.HandleFunc("POST /api/notify/test", a.authed(a.ownerOnly(a.testTelegram)))
	mux.HandleFunc("PUT /api/notify/rules", a.authed(a.ownerOnly(a.saveNotifyRules)))
}

func (a *api) notifyState(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"telegram": a.notify.Status(r.Context()), "rules": a.notify.GetRules(r.Context())})
}

func (a *api) connectTelegram(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token string `json:"token"`
	}
	if !decode(w, r, &body) {
		return
	}
	if err := a.notify.Connect(r.Context(), body.Token); err != nil {
		if errors.Is(err, tg.ErrToken) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "validation", "field": "token", "code": "invalid"})
			return
		}
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "telegram_unreachable"})
		return
	}
	a.notifyState(w, r)
}

func (a *api) disconnectTelegram(w http.ResponseWriter, r *http.Request) {
	if err := a.notify.Disconnect(r.Context()); err != nil {
		a.fail(w, err)
		return
	}
	a.notifyState(w, r)
}

func (a *api) testTelegram(w http.ResponseWriter, r *http.Request) {
	if err := a.notify.Test(r.Context()); err != nil {
		if errors.Is(err, notify.ErrNotConnected) {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "not_connected"})
			return
		}
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "telegram_unreachable"})
		return
	}
	a.notifyState(w, r)
}

func (a *api) saveNotifyRules(w http.ResponseWriter, r *http.Request) {
	var body notify.Rules
	if !decode(w, r, &body) {
		return
	}
	if err := a.notify.SaveRules(r.Context(), body); err != nil {
		if errors.Is(err, notify.ErrRules) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "validation", "field": "rules", "code": "invalid"})
			return
		}
		a.fail(w, err)
		return
	}
	a.notifyState(w, r)
}
