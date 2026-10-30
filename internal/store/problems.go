package store

import (
	"context"
	"encoding/json"
	"time"
)

// Problem is something wrong the core noticed: open while Ended is 0.
type Problem struct {
	ID       string         `json:"id"`
	Key      string         `json:"key"`
	Kind     string         `json:"kind"`
	Severity string         `json:"severity"` // warn, crit
	NodeID   string         `json:"nodeId,omitempty"`
	LinkID   string         `json:"linkId,omitempty"`
	Params   map[string]any `json:"params"`
	Merged   []string       `json:"merged,omitempty"`
	Since    int64          `json:"since"`           // unix milliseconds
	Ended    int64          `json:"ended,omitempty"` // unix milliseconds; 0 while open
}

const problemCols = `id, key, kind, severity, COALESCE(node_id, ''), COALESCE(link_id, ''), params, merged, started_at, COALESCE(ended_at, 0)`

func (s *Store) problems(ctx context.Context, where string, args ...any) ([]Problem, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+problemCols+` FROM problems WHERE `+where+` ORDER BY started_at DESC`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Problem{}
	for rows.Next() {
		var p Problem
		var params, merged string
		if err := rows.Scan(&p.ID, &p.Key, &p.Kind, &p.Severity, &p.NodeID, &p.LinkID, &params, &merged, &p.Since, &p.Ended); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(params), &p.Params)
		_ = json.Unmarshal([]byte(merged), &p.Merged)
		out = append(out, p)
	}
	return out, rows.Err()
}

// OpenProblems are the problems happening now.
func (s *Store) OpenProblems(ctx context.Context) ([]Problem, error) {
	return s.problems(ctx, `ended_at IS NULL`)
}

// EndedProblems are the problems that ended after since (unix milliseconds), newest first.
func (s *Store) EndedProblems(ctx context.Context, since int64) ([]Problem, error) {
	return s.problems(ctx, `ended_at IS NOT NULL AND ended_at >= ?`, since)
}

// ProblemsBetween are the problems that were open at some moment between from and to (unix
// milliseconds): started before to, and not ended before from.
func (s *Store) ProblemsBetween(ctx context.Context, from, to int64) ([]Problem, error) {
	return s.problems(ctx, `started_at <= ? AND (ended_at IS NULL OR ended_at >= ?)`, to, from)
}

// OpenProblem records a new problem and returns it with its id.
func (s *Store) OpenProblem(ctx context.Context, p Problem) (Problem, error) {
	p.ID = NewID()
	params, merged := encodeProblem(p)
	_, err := s.db.ExecContext(ctx, `INSERT INTO problems (id, key, kind, severity, node_id, link_id, params, merged, started_at) VALUES (?, ?, ?, ?, NULLIF(?, ''), NULLIF(?, ''), ?, ?, ?)`,
		p.ID, p.Key, p.Kind, p.Severity, p.NodeID, p.LinkID, params, merged, p.Since)
	return p, err
}

// UpdateProblem changes the severity and figures of an open problem.
func (s *Store) UpdateProblem(ctx context.Context, p Problem) error {
	params, merged := encodeProblem(p)
	_, err := s.db.ExecContext(ctx, `UPDATE problems SET severity = ?, params = ?, merged = ? WHERE id = ?`, p.Severity, params, merged, p.ID)
	return err
}

// EndProblem marks a problem as over.
func (s *Store) EndProblem(ctx context.Context, id string, at int64) error {
	_, err := s.db.ExecContext(ctx, `UPDATE problems SET ended_at = ? WHERE id = ?`, at, id)
	return err
}

// PruneProblems forgets problems that ended more than keep ago.
func (s *Store) PruneProblems(ctx context.Context, keep time.Duration) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM problems WHERE ended_at IS NOT NULL AND ended_at < ?`, s.now().Add(-keep).UnixMilli())
	return err
}

func encodeProblem(p Problem) (string, string) {
	if p.Params == nil {
		p.Params = map[string]any{}
	}
	if p.Merged == nil {
		p.Merged = []string{}
	}
	a, _ := json.Marshal(p.Params)
	b, _ := json.Marshal(p.Merged)
	return string(a), string(b)
}
