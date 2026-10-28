package server

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/metraveer/gridlume/internal/store"
)

const (
	sessionCookie = "gl_session"
	sessionTTL    = 30 * 24 * time.Hour
	// Mutating requests must carry this header. Browsers cannot add custom headers to cross-site
	// requests without a CORS preflight (which we never allow), so this blocks CSRF.
	csrfHeader = "X-Gridlume"
)

type ctxKey int

const userKey ctxKey = 1

func userFrom(ctx context.Context) (store.User, bool) {
	u, ok := ctx.Value(userKey).(store.User)
	return u, ok
}

// setupGate holds the one-time code that lets the very first person create the owner account.
// It is printed to the console at start; anyone who can read the console owns the machine anyway.
type setupGate struct {
	mu   sync.Mutex
	code string
}

func (g *setupGate) check(code string) bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	want := strings.ReplaceAll(strings.ToUpper(g.code), "-", "")
	got := strings.ReplaceAll(strings.ToUpper(strings.TrimSpace(code)), "-", "")
	return want != "" && subtle.ConstantTimeCompare([]byte(want), []byte(got)) == 1
}

func (g *setupGate) close() {
	g.mu.Lock()
	g.code = ""
	g.mu.Unlock()
}

// limiter allows a few sign-in attempts per address per minute, against password guessing.
type limiter struct {
	mu   sync.Mutex
	hits map[string][]time.Time
	max  int
	per  time.Duration
}

func newLimiter(max int, per time.Duration) *limiter {
	return &limiter{hits: map[string][]time.Time{}, max: max, per: per}
}

func (l *limiter) allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	recent := l.hits[key][:0]
	for _, t := range l.hits[key] {
		if now.Sub(t) < l.per {
			recent = append(recent, t)
		}
	}
	if len(recent) >= l.max {
		l.hits[key] = recent
		return false
	}
	l.hits[key] = append(recent, now)
	return true
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

type credentials struct {
	Code     string `json:"code"`
	Username string `json:"username"`
	Password string `json:"password"`
}

func (a *api) sessionInfo(w http.ResponseWriter, r *http.Request) {
	n, err := a.store.CountUsers(r.Context())
	if err != nil {
		a.fail(w, err)
		return
	}
	resp := map[string]any{"needsSetup": n == 0, "user": nil}
	if c, err := r.Cookie(sessionCookie); err == nil {
		if u, err := a.store.SessionUser(r.Context(), c.Value); err == nil {
			resp["user"] = u
		}
	}
	writeJSON(w, http.StatusOK, resp)
}

func (a *api) setup(w http.ResponseWriter, r *http.Request) {
	if !a.limit.allow(clientIP(r)) {
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "too_many_attempts"})
		return
	}
	var c credentials
	if !decode(w, r, &c) {
		return
	}
	n, err := a.store.CountUsers(r.Context())
	if err != nil {
		a.fail(w, err)
		return
	}
	if n > 0 {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "already_set_up"})
		return
	}
	if !a.gate.check(c.Code) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "validation", "field": "code", "code": "invalid"})
		return
	}
	u, err := a.store.CreateUser(r.Context(), c.Username, c.Password, "owner")
	if err != nil {
		a.fail(w, err)
		return
	}
	a.gate.close()
	a.log.Info("owner account created", "username", u.Username)
	a.startSession(w, r, u)
}

func (a *api) login(w http.ResponseWriter, r *http.Request) {
	if !a.limit.allow(clientIP(r)) {
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "too_many_attempts"})
		return
	}
	var c credentials
	if !decode(w, r, &c) {
		return
	}
	u, err := a.store.CheckLogin(r.Context(), c.Username, c.Password)
	if errors.Is(err, store.ErrBadCredentials) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "bad_credentials"})
		return
	} else if err != nil {
		a.fail(w, err)
		return
	}
	a.startSession(w, r, u)
}

func (a *api) startSession(w http.ResponseWriter, r *http.Request, u store.User) {
	token, err := a.store.CreateSession(r.Context(), u.ID, sessionTTL)
	if err != nil {
		a.fail(w, err)
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    token,
		Path:     "/",
		MaxAge:   int(sessionTTL.Seconds()),
		HttpOnly: true,
		Secure:   r.TLS != nil,
		SameSite: http.SameSiteStrictMode,
	})
	writeJSON(w, http.StatusOK, map[string]any{"user": u})
}

func (a *api) logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(sessionCookie); err == nil {
		_ = a.store.DeleteSession(r.Context(), c.Value)
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteStrictMode})
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// authed lets a request through only with a valid session; writes need the CSRF header and a non-viewer role.
func (a *api) authed(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie(sessionCookie)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		u, err := a.store.SessionUser(r.Context(), c.Value)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			if r.Header.Get(csrfHeader) == "" {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "csrf"})
				return
			}
			if u.Role == "viewer" {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
				return
			}
		}
		next(w, r.WithContext(context.WithValue(r.Context(), userKey, u)))
	}
}

// csrf protects the unauthenticated writes (setup, login, logout) the same way.
func csrf(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get(csrfHeader) == "" {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "csrf"})
			return
		}
		next(w, r)
	}
}

func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad_json"})
		return false
	}
	return true
}
