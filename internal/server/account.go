package server

import (
	"errors"
	"net/http"

	"github.com/metraveer/gridlume/internal/store"
)

// changePassword: the current password is required even with a valid session, so a borrowed
// unlocked browser is not enough to take over the account. Other sessions end; this one stays.
func (a *api) changePassword(w http.ResponseWriter, r *http.Request) {
	if !a.limit.allow("password:" + clientIP(r)) {
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "too_many_attempts"})
		return
	}
	var body struct {
		Current string `json:"current"`
		Next    string `json:"next"`
	}
	if !decode(w, r, &body) {
		return
	}
	u, _ := userFrom(r.Context())
	c, _ := r.Cookie(sessionCookie)
	token := ""
	if c != nil {
		token = c.Value
	}
	err := a.store.ChangePassword(r.Context(), u.ID, body.Current, body.Next, token)
	if errors.Is(err, store.ErrWrongPassword) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "validation", "field": "current", "code": "wrong"})
		return
	}
	if err != nil {
		a.fail(w, err)
		return
	}
	a.log.Info("password changed", "username", u.Username)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
