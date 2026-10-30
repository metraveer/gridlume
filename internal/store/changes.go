package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

// Change is something that changed on a machine.
type Change struct {
	ID        string         `json:"id"`
	At        int64          `json:"at"` // unix milliseconds
	NodeID    string         `json:"nodeId"`
	MachineID string         `json:"machineId"`
	Kind      string         `json:"kind"`
	Params    map[string]any `json:"params"`
	Count     int            `json:"count"` // repeats folded in (1 = once)
}

// FoldWithin: a repeat of the same change on the same node this soon is counted, not listed again.
const FoldWithin = 10 * time.Minute

// foldable kinds repeat in loops: a container restarting, stopping and starting.
var foldable = map[string]bool{"container_restarted": true, "container_stopped": true, "container_started": true}

// AddChange records a change, or counts it into the same one a moment ago.
func (s *Store) AddChange(ctx context.Context, c Change) (Change, error) {
	params, _ := json.Marshal(nonNil(c.Params))
	if foldable[c.Kind] {
		var id string
		var count int
		err := s.db.QueryRowContext(ctx, `SELECT id, count FROM changes WHERE node_id = ? AND kind = ? AND at >= ? ORDER BY at DESC LIMIT 1`,
			c.NodeID, c.Kind, c.At-FoldWithin.Milliseconds()).Scan(&id, &count)
		if err == nil {
			c.ID, c.Count = id, count+1
			_, err = s.db.ExecContext(ctx, `UPDATE changes SET at = ?, params = ?, count = ? WHERE id = ?`, c.At, string(params), c.Count, id)
			return c, err
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return c, err
		}
	}
	c.ID, c.Count = NewID(), 1
	_, err := s.db.ExecContext(ctx, `INSERT INTO changes (id, at, node_id, machine_id, kind, params, count) VALUES (?, ?, ?, ?, ?, ?, 1)`,
		c.ID, c.At, c.NodeID, c.MachineID, c.Kind, string(params))
	return c, err
}

// Changes lists the newest changes first. machines and nodes narrow it (either matches); from and to
// (unix milliseconds, 0 = open) bound the time.
func (s *Store) Changes(ctx context.Context, machines, nodes []string, from, to int64, limit int) ([]Change, error) {
	var where []string
	var args []any
	var who []string
	if len(machines) > 0 {
		who = append(who, `machine_id IN (`+marks(len(machines))+`)`)
		for _, m := range machines {
			args = append(args, m)
		}
	}
	if len(nodes) > 0 {
		who = append(who, `node_id IN (`+marks(len(nodes))+`)`)
		for _, n := range nodes {
			args = append(args, n)
		}
	}
	if len(who) > 0 {
		where = append(where, "("+strings.Join(who, " OR ")+")")
	}
	if from > 0 {
		where = append(where, `at >= ?`)
		args = append(args, from)
	}
	if to > 0 {
		where = append(where, `at <= ?`)
		args = append(args, to)
	}
	q := `SELECT id, at, node_id, machine_id, kind, params, count FROM changes`
	if len(where) > 0 {
		q += ` WHERE ` + strings.Join(where, " AND ")
	}
	q += ` ORDER BY at DESC LIMIT ?`
	args = append(args, limit)
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Change{}
	for rows.Next() {
		var c Change
		var params string
		if err := rows.Scan(&c.ID, &c.At, &c.NodeID, &c.MachineID, &c.Kind, &params, &c.Count); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(params), &c.Params)
		out = append(out, c)
	}
	return out, rows.Err()
}

// PruneChanges forgets changes older than keep.
func (s *Store) PruneChanges(ctx context.Context, keep time.Duration) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM changes WHERE at < ?`, s.now().Add(-keep).UnixMilli())
	return err
}

// MachineState returns the last stored state of a machine (as JSON), "" if none.
func (s *Store) MachineState(ctx context.Context, nodeID string) (string, error) {
	var v string
	err := s.db.QueryRowContext(ctx, `SELECT state FROM machine_state WHERE node_id = ?`, nodeID).Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return v, err
}

// SetMachineState stores the state of a machine.
func (s *Store) SetMachineState(ctx context.Context, nodeID, state string) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO machine_state (node_id, state) VALUES (?, ?) ON CONFLICT (node_id) DO UPDATE SET state = excluded.state`, nodeID, state)
	return err
}

func marks(n int) string {
	return strings.TrimSuffix(strings.Repeat("?,", n), ",")
}

func nonNil(m map[string]any) map[string]any {
	if m == nil {
		return map[string]any{}
	}
	return m
}
