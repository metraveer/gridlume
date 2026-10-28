package store

import (
	"context"
	"database/sql"
	"errors"
	"sort"
	"strings"

	"github.com/metraveer/gridlume/internal/agentproto"
)

// ContainerKey is how a container is recognised across restarts and re-creations: compose
// re-creates a container with a new id and the same project/service.
func ContainerKey(c agentproto.Container) string {
	if c.Project != "" && c.Service != "" {
		return "docker:" + c.Project + "/" + c.Service
	}
	return "docker:" + c.Name
}

// containerKind guesses the node kind from the image: databases get their own icon and "db" links.
func containerKind(image string) string {
	if dbImage(image) {
		return "database"
	}
	return "container"
}

func imageBase(image string) string {
	i := strings.ToLower(image)
	if at := strings.IndexByte(i, '@'); at >= 0 {
		i = i[:at]
	}
	if slash := strings.LastIndexByte(i, '/'); slash >= 0 {
		i = i[slash+1:]
	}
	name, _, _ := strings.Cut(i, ":")
	return name
}

func dbImage(image string) bool {
	switch imageBase(image) {
	case "postgres", "postgis", "timescaledb", "mysql", "mariadb", "mongo", "mongodb", "redis", "valkey", "keydb", "clickhouse-server", "clickhouse", "influxdb", "cassandra", "couchdb", "elasticsearch", "opensearch", "memcached":
		return true
	}
	return false
}

func queueImage(image string) bool {
	switch imageBase(image) {
	case "rabbitmq", "kafka", "redpanda", "nats", "mosquitto", "emqx", "activemq":
		return true
	}
	return false
}

// SyncContainers makes sure every container of a machine has a node inside it. New containers are laid
// out in a grid under what is there; existing nodes keep their name, place and notes (the user may have
// changed them). Nodes of containers that are gone stay: the interface shows them as gone, and the
// user decides. It returns whether anything changed.
func (s *Store) SyncContainers(ctx context.Context, machineID string, cs []agentproto.Container) (bool, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback() }()

	existing := map[string]string{} // ext key → node id
	rows, err := tx.QueryContext(ctx, `SELECT id, ext_key FROM nodes WHERE parent_id = ? AND ext_key IS NOT NULL`, machineID)
	if err != nil {
		return false, err
	}
	for rows.Next() {
		var id, key string
		if err := rows.Scan(&id, &key); err != nil {
			rows.Close()
			return false, err
		}
		existing[key] = id
	}
	rows.Close()
	var maxY sql.NullFloat64
	if err := tx.QueryRowContext(ctx, `SELECT max(y) FROM nodes WHERE parent_id = ?`, machineID).Scan(&maxY); err != nil {
		return false, err
	}

	changed := false
	added := 0
	now := s.now().UnixMilli()
	for _, c := range cs {
		key := ContainerKey(c)
		if _, ok := existing[key]; ok {
			continue
		}
		name := c.Service
		if name == "" {
			name = c.Name
		}
		y := 0.0
		if maxY.Valid {
			y = maxY.Float64 + 90
		}
		// Three per row, with room between them for a link's label.
		_, err := tx.ExecContext(ctx, `INSERT INTO nodes (id, parent_id, place_id, kind, name, subtitle, address, state, notes, x, y, source, ext_key, created_at, updated_at)
			VALUES (?, ?, NULL, ?, ?, ?, '', 'unknown', '', ?, ?, 'docker', ?, ?, ?)`,
			NewID(), machineID, containerKind(c.Image), truncate(name, 80), truncate(c.Image, 120), float64(added%3)*280, y+float64(added/3)*120, key, now, now)
		if err != nil {
			return false, err
		}
		existing[key] = ""
		added++
		changed = true
	}
	return changed, tx.Commit()
}

// Suggestion is a link the core thinks exists, waiting for the user.
type Suggestion struct {
	ID     string `json:"id"`
	FromID string `json:"fromId"`
	ToID   string `json:"toId"`
	Kind   string `json:"kind"`
	Reason string `json:"reason"` // compose_depends, env_ref
	Detail string `json:"detail"`
}

// Guess is a suggestion before it is stored: ends given by container key.
type Guess struct {
	From, To, Kind, Reason, Detail string
}

// GuessLinks works out likely links between the containers of one machine:
// compose depends_on, and environment values naming another container ("db" in DATABASE_URL).
func GuessLinks(cs []agentproto.Container) []Guess {
	byName := map[string]agentproto.Container{}
	for _, c := range cs {
		byName[strings.ToLower(c.Name)] = c
		if c.Service != "" {
			byName[strings.ToLower(c.Service)] = c
		}
	}
	seen := map[[2]string]bool{}
	var out []Guess
	add := func(from, to agentproto.Container, reason, detail string) {
		f, t := ContainerKey(from), ContainerKey(to)
		if f == t || seen[[2]string{f, t}] {
			return
		}
		seen[[2]string{f, t}] = true
		kind := "depends"
		switch {
		case dbImage(to.Image):
			kind = "db"
		case queueImage(to.Image):
			kind = "queue"
		case reason == "env_ref":
			kind = "http"
		}
		out = append(out, Guess{From: f, To: t, Kind: kind, Reason: reason, Detail: detail})
	}
	for _, c := range cs {
		for _, d := range c.DependsOn {
			if to, ok := byName[strings.ToLower(d)]; ok {
				add(c, to, "compose_depends", d)
			}
		}
		for _, h := range c.Refs {
			// "db", or a fully qualified "db.app_default" style alias: the first label is the name.
			name, _, _ := strings.Cut(h, ".")
			if to, ok := byName[name]; ok {
				add(c, to, "env_ref", h)
			}
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].From+out[i].To < out[j].From+out[j].To })
	return out
}

// SaveSuggestions stores new guesses for a machine's containers. Pairs that already have a link (in
// either direction) or a suggestion, dismissed ones included, are skipped. Returns how many were added.
func (s *Store) SaveSuggestions(ctx context.Context, machineID string, guesses []Guess) (int, error) {
	if len(guesses) == 0 {
		return 0, nil
	}
	ids := map[string]string{}
	rows, err := s.db.QueryContext(ctx, `SELECT id, ext_key FROM nodes WHERE parent_id = ? AND ext_key IS NOT NULL`, machineID)
	if err != nil {
		return 0, err
	}
	for rows.Next() {
		var id, key string
		if err := rows.Scan(&id, &key); err != nil {
			rows.Close()
			return 0, err
		}
		ids[key] = id
	}
	rows.Close()

	added := 0
	for _, g := range guesses {
		from, to := ids[g.From], ids[g.To]
		if from == "" || to == "" {
			continue
		}
		var linked int
		if err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM links WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)`, from, to, to, from).Scan(&linked); err != nil {
			return added, err
		}
		if linked > 0 {
			continue
		}
		res, err := s.db.ExecContext(ctx, `INSERT OR IGNORE INTO link_suggestions (id, from_id, to_id, kind, reason, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
			NewID(), from, to, g.Kind, g.Reason, truncate(g.Detail, 120), s.now().Unix())
		if err != nil {
			return added, err
		}
		if n, _ := res.RowsAffected(); n > 0 {
			added++
		}
	}
	return added, nil
}

// Suggestions returns the suggestions waiting for the user; ones whose pair got linked meanwhile are left out.
func (s *Store) Suggestions(ctx context.Context) ([]Suggestion, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT s.id, s.from_id, s.to_id, s.kind, s.reason, s.detail FROM link_suggestions s
		WHERE s.dismissed = 0 AND NOT EXISTS (SELECT 1 FROM links l WHERE (l.from_id = s.from_id AND l.to_id = s.to_id) OR (l.from_id = s.to_id AND l.to_id = s.from_id))
		ORDER BY s.created_at, s.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Suggestion{}
	for rows.Next() {
		var g Suggestion
		if err := rows.Scan(&g.ID, &g.FromID, &g.ToID, &g.Kind, &g.Reason, &g.Detail); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

// AcceptSuggestion turns a suggestion into a link with the explanation the user saw (or edited).
func (s *Store) AcceptSuggestion(ctx context.Context, id, about, ifBroken string) (Link, error) {
	var g Suggestion
	err := s.db.QueryRowContext(ctx, `SELECT id, from_id, to_id, kind FROM link_suggestions WHERE id = ? AND dismissed = 0`, id).Scan(&g.ID, &g.FromID, &g.ToID, &g.Kind)
	if errors.Is(err, sql.ErrNoRows) {
		return Link{}, ErrNotFound
	}
	if err != nil {
		return Link{}, err
	}
	l, err := s.CreateLink(ctx, Link{FromID: g.FromID, ToID: g.ToID, Kind: g.Kind, About: about, IfBroken: ifBroken})
	if err != nil {
		return l, err
	}
	_, err = s.db.ExecContext(ctx, `DELETE FROM link_suggestions WHERE id = ?`, id)
	return l, err
}

// DismissSuggestion hides a suggestion for good.
func (s *Store) DismissSuggestion(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx, `UPDATE link_suggestions SET dismissed = 1 WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}
