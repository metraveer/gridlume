package store

import (
	"context"
	"database/sql"
	"errors"
)

// Setting keys.
const (
	SettingUpdateChannel = "update_channel" // stable or edge
	SettingUpdateAuto    = "update_auto"    // "1" installs updates without asking
	SettingCoreNode      = "core_node"      // node of the machine the core runs on
	// SettingAgentUpdateAuto: "1" (the default) sends agents a newer build as soon as they connect.
	SettingAgentUpdateAuto = "agent_update_auto"
)

// Setting returns a setting, or def when it was never set.
func (s *Store) Setting(ctx context.Context, key, def string) (string, error) {
	var v string
	err := s.db.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, key).Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		return def, nil
	}
	return v, err
}

// SetSetting stores a setting.
func (s *Store) SetSetting(ctx context.Context, key, value string) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`, key, value)
	return err
}

// Backup writes a consistent copy of the database to path while the core keeps running.
func (s *Store) Backup(ctx context.Context, path string) error {
	_, err := s.db.ExecContext(ctx, `VACUUM INTO ?`, path)
	return err
}
