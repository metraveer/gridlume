package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"golang.org/x/crypto/argon2"
)

// User is someone who can sign in.
type User struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	Role     string `json:"role"`
}

// ErrBadCredentials is returned for a wrong username or password (deliberately the same for both).
var ErrBadCredentials = errors.New("bad credentials")

// Argon2id parameters: the OWASP minimum (19 MiB, 2 passes). Enough against guessing while keeping
// sign-in light on a small home server.
const (
	argonTime    = 2
	argonMemory  = 19 * 1024
	argonThreads = 1
	argonKeyLen  = 32
)

func hashPassword(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key := argon2.IDKey([]byte(password), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	b64 := base64.RawStdEncoding
	return fmt.Sprintf("$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s", argonMemory, argonTime, argonThreads, b64.EncodeToString(salt), b64.EncodeToString(key)), nil
}

func checkPassword(encoded, password string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false
	}
	var m, t uint32
	var p uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &m, &t, &p); err != nil {
		return false
	}
	b64 := base64.RawStdEncoding
	salt, err1 := b64.DecodeString(parts[4])
	want, err2 := b64.DecodeString(parts[5])
	if err1 != nil || err2 != nil {
		return false
	}
	got := argon2.IDKey([]byte(password), salt, t, m, p, uint32(len(want)))
	return subtle.ConstantTimeCompare(got, want) == 1
}

// ValidateCredentials checks the rules for a new username and password.
func ValidateCredentials(username, password string) error {
	username = strings.TrimSpace(username)
	if username == "" {
		return invalid("username", "required")
	}
	if utf8.RuneCountInString(username) > 40 || strings.ContainsAny(username, " \t\n/\\") {
		return invalid("username", "invalid")
	}
	if utf8.RuneCountInString(password) < 10 {
		return invalid("password", "too_short")
	}
	if len(password) > 256 {
		return invalid("password", "too_long")
	}
	return nil
}

// CountUsers returns how many users exist; zero means the first-run setup is still open.
func (s *Store) CountUsers(ctx context.Context) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM users`).Scan(&n)
	return n, err
}

// CreateUser adds a user with a hashed password.
func (s *Store) CreateUser(ctx context.Context, username, password, role string) (User, error) {
	username = strings.TrimSpace(username)
	if err := ValidateCredentials(username, password); err != nil {
		return User{}, err
	}
	hash, err := hashPassword(password)
	if err != nil {
		return User{}, err
	}
	u := User{ID: NewID(), Username: username, Role: role}
	_, err = s.db.ExecContext(ctx, `INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)`,
		u.ID, u.Username, hash, u.Role, s.now().Unix())
	if err != nil && strings.Contains(err.Error(), "UNIQUE") {
		return User{}, invalid("username", "taken")
	}
	return u, err
}

// dummyHash makes a sign-in with an unknown username take as long as one with a wrong password,
// so response time does not reveal which usernames exist.
var dummyHash, _ = hashPassword("gridlume-timing-equaliser")

// CheckLogin returns the user if the password is right.
func (s *Store) CheckLogin(ctx context.Context, username, password string) (User, error) {
	var u User
	var hash string
	err := s.db.QueryRowContext(ctx, `SELECT id, username, role, password_hash FROM users WHERE username = ?`, strings.TrimSpace(username)).
		Scan(&u.ID, &u.Username, &u.Role, &hash)
	if errors.Is(err, sql.ErrNoRows) {
		checkPassword(dummyHash, password)
		return User{}, ErrBadCredentials
	} else if err != nil {
		return User{}, err
	}
	if !checkPassword(hash, password) {
		return User{}, ErrBadCredentials
	}
	return u, nil
}

// ---------- Sessions ----------

func tokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// CreateSession starts a session and returns the secret token for the cookie. Only its hash is stored.
func (s *Store) CreateSession(ctx context.Context, userID string, ttl time.Duration) (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	token := base64.RawURLEncoding.EncodeToString(b)
	now := s.now()
	_, err := s.db.ExecContext(ctx, `INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
		tokenHash(token), userID, now.Unix(), now.Add(ttl).Unix())
	return token, err
}

// SessionUser returns the user of a valid session.
func (s *Store) SessionUser(ctx context.Context, token string) (User, error) {
	var u User
	err := s.db.QueryRowContext(ctx, `SELECT u.id, u.username, u.role FROM sessions s JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = ? AND s.expires_at > ?`, tokenHash(token), s.now().Unix()).Scan(&u.ID, &u.Username, &u.Role)
	if errors.Is(err, sql.ErrNoRows) {
		return u, ErrNotFound
	}
	return u, err
}

// DeleteSession ends a session (sign out).
func (s *Store) DeleteSession(ctx context.Context, token string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE token_hash = ?`, tokenHash(token))
	return err
}

// PurgeSessions removes expired sessions.
func (s *Store) PurgeSessions(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE expires_at <= ?`, s.now().Unix())
	return err
}

// ErrWrongPassword means the current password given to ChangePassword was wrong.
var ErrWrongPassword = errors.New("wrong current password")

// ChangePassword sets a new password after checking the current one, and ends every other session of
// the user: whoever might have had the old password is signed out everywhere but here.
func (s *Store) ChangePassword(ctx context.Context, userID, current, next, keepToken string) error {
	var hash string
	err := s.db.QueryRowContext(ctx, `SELECT password_hash FROM users WHERE id = ?`, userID).Scan(&hash)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return err
	}
	if !checkPassword(hash, current) {
		return ErrWrongPassword
	}
	if err := ValidateCredentials("x", next); err != nil {
		return err
	}
	if next == current {
		return invalid("password", "same")
	}
	newHash, err := hashPassword(next)
	if err != nil {
		return err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(ctx, `UPDATE users SET password_hash = ? WHERE id = ?`, newHash, userID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?`, userID, tokenHash(keepToken)); err != nil {
		return err
	}
	return tx.Commit()
}
