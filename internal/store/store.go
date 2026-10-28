// Package store keeps Gridlume's data in SQLite. Everything above it talks to *Store,
// so PostgreSQL can be added later behind the same methods.
package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"embed"
	"encoding/base32"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	_ "modernc.org/sqlite" // pure-Go SQLite driver, no C compiler needed
)

//go:embed migrations/*.sql
var migrations embed.FS

// ErrNotFound is returned when a record does not exist.
var ErrNotFound = errors.New("not found")

// Store is the database handle.
type Store struct {
	db  *sql.DB
	now func() time.Time
}

// Open opens (and creates, if needed) the database file and applies pending migrations.
func Open(path string) (*Store, error) {
	if path != ":memory:" {
		if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
			return nil, err
		}
	}
	dsn := "file:" + path + "?_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)&_pragma=synchronous(NORMAL)"
	if path == ":memory:" {
		dsn = "file::memory:?_pragma=foreign_keys(1)"
	}
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	// SQLite allows one writer at a time; a single connection avoids "database is locked"
	// and is plenty for one household's map. In-memory databases need it to stay one database.
	db.SetMaxOpenConns(1)
	s := &Store{db: db, now: time.Now}
	if err := s.migrate(context.Background()); err != nil {
		_ = db.Close()
		return nil, err
	}
	return s, nil
}

// Close closes the database.
func (s *Store) Close() error { return s.db.Close() }

func (s *Store) migrate(ctx context.Context) error {
	if _, err := s.db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`); err != nil {
		return err
	}
	names, err := fs.Glob(migrations, "migrations/*.sql")
	if err != nil {
		return err
	}
	sort.Strings(names)
	for _, name := range names {
		var done int
		if err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM schema_migrations WHERE name = ?`, name).Scan(&done); err != nil {
			return err
		}
		if done > 0 {
			continue
		}
		body, err := migrations.ReadFile(name)
		if err != nil {
			return err
		}
		tx, err := s.db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, string(body)); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("migration %s: %w", name, err)
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)`, name, s.now().Unix()); err != nil {
			_ = tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}

// NewID returns a short random id, e.g. "k7qm2r9x4f1t".
func NewID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		panic(err) // the system random source failing is unrecoverable
	}
	return strings.ToLower(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b))
}
