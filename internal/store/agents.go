package store

import (
	"context"
	"crypto/ed25519"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/metraveer/gridlume/internal/agentproto"
)

// Agent is the agent on a machine, tied to one node.
type Agent struct {
	ID       string `json:"id"`
	NodeID   string `json:"nodeId"`
	Hostname string `json:"hostname"`
	OS       string `json:"os"`
	Kernel   string `json:"kernel"`
	Arch     string `json:"arch"`
	Version  string `json:"version"`
	Mode     string `json:"mode"`
	LastSeen int64  `json:"lastSeen"` // unix seconds, 0 = never connected
	key      ed25519.PublicKey
}

// PublicKey is the key the agent proves itself with.
func (a Agent) PublicKey() ed25519.PublicKey { return a.key }

// ErrCodeInvalid means the enrollment code is unknown, used or expired.
var ErrCodeInvalid = errors.New("enrollment code is invalid")

// normCode makes "k7qm 2r9x" and "K7QM-2R9X" the same code.
func normCode(code string) string {
	return strings.NewReplacer("-", "", " ", "").Replace(strings.ToUpper(strings.TrimSpace(code)))
}

// CreateEnrollCode stores a one-time code for connecting a machine. nodeID "" means
// "create a new node named after the machine". Only the hash of the code is stored.
func (s *Store) CreateEnrollCode(ctx context.Context, code, nodeID, mode string, ttl time.Duration) error {
	return s.createEnrollCode(ctx, code, nodeID, mode, "", ttl)
}

// CreateCoreEnrollCode is CreateEnrollCode for the agent on the core's own machine, made by the core
// installer: the node it creates is remembered as "the core runs here".
func (s *Store) CreateCoreEnrollCode(ctx context.Context, code, mode string, ttl time.Duration) error {
	return s.createEnrollCode(ctx, code, "", mode, "core", ttl)
}

func (s *Store) createEnrollCode(ctx context.Context, code, nodeID, mode, purpose string, ttl time.Duration) error {
	if !agentproto.ValidMode(mode) {
		return invalid("mode", "invalid")
	}
	var node any
	if nodeID != "" {
		var kind string
		var parent sql.NullString
		err := s.db.QueryRowContext(ctx, `SELECT kind, parent_id FROM nodes WHERE id = ?`, nodeID).Scan(&kind, &parent)
		if errors.Is(err, sql.ErrNoRows) {
			return invalid("nodeId", "not_found")
		}
		if err != nil {
			return err
		}
		if !machineKinds[kind] || parent.Valid {
			return invalid("nodeId", "not_machine")
		}
		node = nodeID
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO enroll_codes (code_hash, node_id, mode, purpose, expires_at) VALUES (?, ?, ?, ?, ?)`,
		tokenHash(normCode(code)), node, mode, purpose, s.now().Add(ttl).Unix())
	return err
}

// machineKinds are node kinds an agent can run on.
var machineKinds = map[string]bool{"server": true, "vm": true, "vps": true, "storage": true, "smarthome": true, "device": true}

// Enroll uses a code once: it creates the node if the code asks for one, and binds a new agent to it.
// A machine enrolled again (reinstall) replaces its previous agent.
func (s *Store) Enroll(ctx context.Context, code string, pub ed25519.PublicKey, info agentproto.Info) (Agent, error) {
	if len(pub) != ed25519.PublicKeySize {
		return Agent{}, invalid("publicKey", "invalid")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Agent{}, err
	}
	defer func() { _ = tx.Rollback() }()

	var nodeID sql.NullString
	var mode, purpose string
	hash := tokenHash(normCode(code))
	err = tx.QueryRowContext(ctx, `SELECT node_id, mode, purpose FROM enroll_codes WHERE code_hash = ? AND expires_at > ?`, hash, s.now().Unix()).Scan(&nodeID, &mode, &purpose)
	if errors.Is(err, sql.ErrNoRows) {
		return Agent{}, ErrCodeInvalid
	}
	if err != nil {
		return Agent{}, err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM enroll_codes WHERE code_hash = ?`, hash); err != nil {
		return Agent{}, err
	}

	now := s.now()
	if !nodeID.Valid {
		name := strings.TrimSpace(info.Hostname)
		if name == "" {
			name = "machine"
		}
		nodeID = sql.NullString{String: NewID(), Valid: true}
		// New machines appear at the top level, below every node and place already drawn; the user moves them.
		var maxY sql.NullFloat64
		err := tx.QueryRowContext(ctx, `SELECT max(b) FROM (SELECT y + 60 AS b FROM nodes WHERE parent_id IS NULL UNION ALL SELECT y + h FROM places)`).Scan(&maxY)
		if err != nil {
			return Agent{}, err
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO nodes (id, parent_id, place_id, kind, name, subtitle, address, state, notes, x, y, created_at, updated_at)
			VALUES (?, NULL, NULL, 'server', ?, ?, '', 'unknown', '', 0, ?, ?, ?)`,
			nodeID.String, truncate(name, 80), truncate(info.OS, 120), maxY.Float64+60, now.UnixMilli(), now.UnixMilli())
		if err != nil {
			return Agent{}, err
		}
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM agents WHERE node_id = ?`, nodeID.String); err != nil {
		return Agent{}, err
	}
	if purpose == "core" {
		_, err := tx.ExecContext(ctx, `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`, SettingCoreNode, nodeID.String)
		if err != nil {
			return Agent{}, err
		}
	}
	a := Agent{ID: NewID(), NodeID: nodeID.String, Mode: mode, key: pub}
	a.setInfo(info)
	a.Mode = mode // the mode chosen in the interface wins over what the agent says
	_, err = tx.ExecContext(ctx, `INSERT INTO agents (id, node_id, public_key, hostname, os, kernel, arch, version, mode, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, a.ID, a.NodeID, []byte(pub), a.Hostname, a.OS, a.Kernel, a.Arch, a.Version, a.Mode, now.Unix())
	if err != nil {
		return Agent{}, err
	}
	return a, tx.Commit()
}

func (a *Agent) setInfo(i agentproto.Info) {
	a.Hostname = truncate(i.Hostname, 120)
	a.OS = truncate(i.OS, 120)
	a.Kernel = truncate(i.Kernel, 120)
	a.Arch = truncate(i.Arch, 20)
	a.Version = truncate(i.Version, 40)
	if agentproto.ValidMode(i.Mode) {
		a.Mode = i.Mode
	}
}

func truncate(s string, n int) string {
	r := []rune(strings.TrimSpace(s))
	if len(r) > n {
		r = r[:n]
	}
	return string(r)
}

const agentCols = `id, node_id, public_key, hostname, os, kernel, arch, version, mode, last_seen`

func scanAgent(row interface{ Scan(...any) error }) (Agent, error) {
	var a Agent
	var key []byte
	err := row.Scan(&a.ID, &a.NodeID, &key, &a.Hostname, &a.OS, &a.Kernel, &a.Arch, &a.Version, &a.Mode, &a.LastSeen)
	a.key = key
	return a, err
}

// GetAgent returns an agent by id.
func (s *Store) GetAgent(ctx context.Context, id string) (Agent, error) {
	a, err := scanAgent(s.db.QueryRowContext(ctx, `SELECT `+agentCols+` FROM agents WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return a, ErrNotFound
	}
	return a, err
}

// ListAgents returns all agents.
func (s *Store) ListAgents(ctx context.Context) ([]Agent, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+agentCols+` FROM agents ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Agent{}
	for rows.Next() {
		a, err := scanAgent(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// AgentConnected records what the agent reported about itself when it connected.
func (s *Store) AgentConnected(ctx context.Context, id string, info agentproto.Info) (Agent, error) {
	a, err := s.GetAgent(ctx, id)
	if err != nil {
		return a, err
	}
	mode := a.Mode
	a.setInfo(info)
	a.Mode = mode // set at enrollment from the interface; the agent cannot raise it
	a.LastSeen = s.now().Unix()
	_, err = s.db.ExecContext(ctx, `UPDATE agents SET hostname = ?, os = ?, kernel = ?, arch = ?, version = ?, last_seen = ? WHERE id = ?`,
		a.Hostname, a.OS, a.Kernel, a.Arch, a.Version, a.LastSeen, id)
	return a, err
}

// TouchAgent updates the time the agent was last heard from.
func (s *Store) TouchAgent(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE agents SET last_seen = ? WHERE id = ?`, s.now().Unix(), id)
	return err
}

// DeleteAgent unlinks the agent from its node; the agent can no longer connect.
func (s *Store) DeleteAgent(ctx context.Context, id string) error {
	return deleteByID(ctx, s.db, "agents", id)
}

// PurgeEnrollCodes removes expired codes.
func (s *Store) PurgeEnrollCodes(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM enroll_codes WHERE expires_at <= ?`, s.now().Unix())
	return err
}

// ---------- Metrics ----------

// Point is one minute of a series.
type Point struct {
	TS  int64   `json:"t"`
	Avg float64 `json:"avg"`
	Max float64 `json:"max"`
}

// MetricRow is one minute of one series of one node, as written by the core.
type MetricRow struct {
	NodeID string
	Series string
	Point
}

// WriteMetrics stores minute points; a repeated minute is overwritten.
func (s *Store) WriteMetrics(ctx context.Context, rows []MetricRow) error {
	if len(rows) == 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	st, err := tx.PrepareContext(ctx, `INSERT OR REPLACE INTO metrics (node_id, series, ts, avg, max) VALUES (?, ?, ?, ?, ?)`)
	if err != nil {
		return err
	}
	defer st.Close()
	for _, r := range rows {
		if _, err := st.ExecContext(ctx, r.NodeID, r.Series, r.TS, r.Avg, r.Max); err != nil {
			// The node may have been deleted while its agent was still connected.
			if strings.Contains(err.Error(), "FOREIGN KEY") {
				continue
			}
			return err
		}
	}
	return tx.Commit()
}

// Metrics returns points of the series since `since`, averaged into buckets of `step` seconds.
func (s *Store) Metrics(ctx context.Context, nodeID string, series []string, since time.Time, step int64) (map[string][]Point, error) {
	if step < 60 {
		step = 60
	}
	out := map[string][]Point{}
	for _, name := range series {
		rows, err := s.db.QueryContext(ctx, `SELECT (ts / ?) * ?, avg(avg), max(max) FROM metrics
			WHERE node_id = ? AND series = ? AND ts >= ? GROUP BY ts / ? ORDER BY 1`, step, step, nodeID, name, since.Unix(), step)
		if err != nil {
			return nil, err
		}
		pts := []Point{}
		for rows.Next() {
			var p Point
			if err := rows.Scan(&p.TS, &p.Avg, &p.Max); err != nil {
				rows.Close()
				return nil, err
			}
			pts = append(pts, p)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
		out[name] = pts
	}
	return out, nil
}

// MetricsRetention is how long minute points are kept.
const MetricsRetention = 14 * 24 * time.Hour

// PurgeMetrics deletes points older than MetricsRetention.
func (s *Store) PurgeMetrics(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM metrics WHERE ts < ?`, s.now().Add(-MetricsRetention).Unix())
	return err
}
