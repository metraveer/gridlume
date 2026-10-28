package store

import (
	"context"
	"database/sql"
	"errors"
	"slices"
	"strings"
)

// Allowed values. The interface translates them; the database keeps these stable codes.
var (
	NodeKinds  = []string{"internet", "router", "server", "vm", "vps", "container", "service", "database", "domain", "vpn", "storage", "smarthome", "camera", "ups", "device"}
	LinkKinds  = []string{"uplink", "lan", "wifi", "vpn", "power", "runs", "depends", "http", "db", "queue", "ws", "dns"}
	PlaceTones = []string{"green", "blue", "violet", "amber", "gray"}
	NodeStates = []string{"ok", "warn", "crit", "unknown", "planned"}
)

// ValidationError says which field is wrong and why, as codes the interface translates.
type ValidationError struct {
	Field string `json:"field"`
	Code  string `json:"code"` // required, too_long, invalid, not_found, cycle
}

func (e *ValidationError) Error() string { return e.Field + ": " + e.Code }

func invalid(field, code string) error { return &ValidationError{Field: field, Code: code} }

// Place is a coloured area on the top level of the map.
type Place struct {
	ID   string  `json:"id"`
	Name string  `json:"name"`
	Tone string  `json:"tone"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	W    float64 `json:"w"`
	H    float64 `json:"h"`
}

// Node is anything on the map.
type Node struct {
	ID       string  `json:"id"`
	ParentID *string `json:"parentId"`
	PlaceID  *string `json:"placeId"`
	Kind     string  `json:"kind"`
	Name     string  `json:"name"`
	Subtitle string  `json:"subtitle"`
	Address  string  `json:"address"`
	State    string  `json:"state"`
	Notes    string  `json:"notes"`
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	// Source is "docker" for containers an agent reported, "" for nodes drawn by hand.
	Source string `json:"source"`
	// ExtKey is what the source calls the node, e.g. "docker:app/api"; the interface matches live data by it.
	ExtKey string `json:"extKey,omitempty"`
}

// Link connects two nodes and explains itself.
type Link struct {
	ID        string   `json:"id"`
	FromID    string   `json:"fromId"`
	ToID      string   `json:"toId"`
	Kind      string   `json:"kind"`
	Proto     string   `json:"proto"`
	About     string   `json:"about"`
	IfBroken  string   `json:"ifBroken"`
	SpeedMbit *float64 `json:"speedMbit"`
	Planned   bool     `json:"planned"`
}

// Map is everything needed to draw the map.
type Map struct {
	Places []Place `json:"places"`
	Nodes  []Node  `json:"nodes"`
	Links  []Link  `json:"links"`
}

// GetMap returns all places, nodes and links.
func (s *Store) GetMap(ctx context.Context) (Map, error) {
	m := Map{Places: []Place{}, Nodes: []Node{}, Links: []Link{}}
	rows, err := s.db.QueryContext(ctx, `SELECT id, name, tone, x, y, w, h FROM places ORDER BY created_at`)
	if err != nil {
		return m, err
	}
	for rows.Next() {
		var p Place
		if err := rows.Scan(&p.ID, &p.Name, &p.Tone, &p.X, &p.Y, &p.W, &p.H); err != nil {
			rows.Close()
			return m, err
		}
		m.Places = append(m.Places, p)
	}
	rows.Close()

	rows, err = s.db.QueryContext(ctx, `SELECT `+nodeCols+` FROM nodes ORDER BY created_at`)
	if err != nil {
		return m, err
	}
	for rows.Next() {
		n, err := scanNode(rows)
		if err != nil {
			rows.Close()
			return m, err
		}
		m.Nodes = append(m.Nodes, n)
	}
	rows.Close()

	rows, err = s.db.QueryContext(ctx, `SELECT id, from_id, to_id, kind, proto, about, if_broken, speed_mbit, planned FROM links ORDER BY created_at`)
	if err != nil {
		return m, err
	}
	defer rows.Close()
	for rows.Next() {
		var l Link
		if err := rows.Scan(&l.ID, &l.FromID, &l.ToID, &l.Kind, &l.Proto, &l.About, &l.IfBroken, &l.SpeedMbit, &l.Planned); err != nil {
			return m, err
		}
		m.Links = append(m.Links, l)
	}
	return m, rows.Err()
}

// ---------- Places ----------

func checkText(field, v string, max int, required bool) error {
	v = strings.TrimSpace(v)
	if required && v == "" {
		return invalid(field, "required")
	}
	if len([]rune(v)) > max {
		return invalid(field, "too_long")
	}
	return nil
}

func validatePlace(p *Place) error {
	p.Name = strings.TrimSpace(p.Name)
	if err := checkText("name", p.Name, 60, true); err != nil {
		return err
	}
	if p.Tone == "" {
		p.Tone = "green"
	}
	if !slices.Contains(PlaceTones, p.Tone) {
		return invalid("tone", "invalid")
	}
	if p.W < 160 || p.H < 120 {
		return invalid("size", "invalid")
	}
	return nil
}

// CreatePlace adds a place.
func (s *Store) CreatePlace(ctx context.Context, p Place) (Place, error) {
	if p.W == 0 {
		p.W, p.H = 440, 320
	}
	if err := validatePlace(&p); err != nil {
		return p, err
	}
	p.ID = NewID()
	_, err := s.db.ExecContext(ctx, `INSERT INTO places (id, name, tone, x, y, w, h, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		p.ID, p.Name, p.Tone, p.X, p.Y, p.W, p.H, s.now().UnixMilli())
	return p, err
}

// PlacePatch changes some fields of a place; nil fields stay as they are.
type PlacePatch struct {
	Name *string  `json:"name"`
	Tone *string  `json:"tone"`
	X    *float64 `json:"x"`
	Y    *float64 `json:"y"`
	W    *float64 `json:"w"`
	H    *float64 `json:"h"`
}

// UpdatePlace applies a patch and returns the result.
func (s *Store) UpdatePlace(ctx context.Context, id string, patch PlacePatch) (Place, error) {
	var p Place
	err := s.db.QueryRowContext(ctx, `SELECT id, name, tone, x, y, w, h FROM places WHERE id = ?`, id).Scan(&p.ID, &p.Name, &p.Tone, &p.X, &p.Y, &p.W, &p.H)
	if errors.Is(err, sql.ErrNoRows) {
		return p, ErrNotFound
	} else if err != nil {
		return p, err
	}
	set(&p.Name, patch.Name)
	set(&p.Tone, patch.Tone)
	set(&p.X, patch.X)
	set(&p.Y, patch.Y)
	set(&p.W, patch.W)
	set(&p.H, patch.H)
	if err := validatePlace(&p); err != nil {
		return p, err
	}
	_, err = s.db.ExecContext(ctx, `UPDATE places SET name = ?, tone = ?, x = ?, y = ?, w = ?, h = ? WHERE id = ?`, p.Name, p.Tone, p.X, p.Y, p.W, p.H, id)
	return p, err
}

// DeletePlace removes a place; its nodes stay on the map without a place.
func (s *Store) DeletePlace(ctx context.Context, id string) error {
	return deleteByID(ctx, s.db, "places", id)
}

// ---------- Nodes ----------

func (s *Store) validateNode(ctx context.Context, n *Node) error {
	n.Name = strings.TrimSpace(n.Name)
	if err := checkText("name", n.Name, 80, true); err != nil {
		return err
	}
	if err := checkText("subtitle", n.Subtitle, 120, false); err != nil {
		return err
	}
	if err := checkText("address", n.Address, 255, false); err != nil {
		return err
	}
	if len([]rune(n.Notes)) > 20000 {
		return invalid("notes", "too_long")
	}
	if !slices.Contains(NodeKinds, n.Kind) {
		return invalid("kind", "invalid")
	}
	if n.State == "" {
		n.State = "unknown"
	}
	if !slices.Contains(NodeStates, n.State) {
		return invalid("state", "invalid")
	}
	if n.ParentID != nil && *n.ParentID == "" {
		n.ParentID = nil
	}
	if n.PlaceID != nil && *n.PlaceID == "" {
		n.PlaceID = nil
	}
	if n.ParentID != nil {
		if *n.ParentID == n.ID {
			return invalid("parentId", "cycle")
		}
		// Only one level of nesting: a machine contains containers and services, not machines with machines.
		var parentOfParent sql.NullString
		err := s.db.QueryRowContext(ctx, `SELECT parent_id FROM nodes WHERE id = ?`, *n.ParentID).Scan(&parentOfParent)
		if errors.Is(err, sql.ErrNoRows) {
			return invalid("parentId", "not_found")
		} else if err != nil {
			return err
		}
		if parentOfParent.Valid {
			return invalid("parentId", "too_deep")
		}
		n.PlaceID = nil // a node inside a machine belongs to the machine's place
	}
	if n.PlaceID != nil {
		var ok int
		if err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM places WHERE id = ?`, *n.PlaceID).Scan(&ok); err != nil {
			return err
		}
		if ok == 0 {
			return invalid("placeId", "not_found")
		}
	}
	return nil
}

const nodeCols = `id, parent_id, place_id, kind, name, subtitle, address, state, notes, x, y, source, coalesce(ext_key, '')`

func scanNode(row interface{ Scan(...any) error }) (Node, error) {
	var n Node
	err := row.Scan(&n.ID, &n.ParentID, &n.PlaceID, &n.Kind, &n.Name, &n.Subtitle, &n.Address, &n.State, &n.Notes, &n.X, &n.Y, &n.Source, &n.ExtKey)
	return n, err
}

// CreateNode adds a node.
func (s *Store) CreateNode(ctx context.Context, n Node) (Node, error) {
	n.ID = NewID()
	if err := s.validateNode(ctx, &n); err != nil {
		return n, err
	}
	now := s.now().UnixMilli()
	_, err := s.db.ExecContext(ctx, `INSERT INTO nodes (id, parent_id, place_id, kind, name, subtitle, address, state, notes, x, y, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		n.ID, n.ParentID, n.PlaceID, n.Kind, n.Name, n.Subtitle, n.Address, n.State, n.Notes, n.X, n.Y, now, now)
	return n, err
}

// NodePatch changes some fields of a node. ParentID/PlaceID use "" to clear.
type NodePatch struct {
	ParentID *string  `json:"parentId"`
	PlaceID  *string  `json:"placeId"`
	Kind     *string  `json:"kind"`
	Name     *string  `json:"name"`
	Subtitle *string  `json:"subtitle"`
	Address  *string  `json:"address"`
	State    *string  `json:"state"`
	Notes    *string  `json:"notes"`
	X        *float64 `json:"x"`
	Y        *float64 `json:"y"`
}

// UpdateNode applies a patch and returns the result.
func (s *Store) UpdateNode(ctx context.Context, id string, patch NodePatch) (Node, error) {
	n, err := scanNode(s.db.QueryRowContext(ctx, `SELECT `+nodeCols+` FROM nodes WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return n, ErrNotFound
	} else if err != nil {
		return n, err
	}
	if patch.ParentID != nil {
		n.ParentID = patch.ParentID
	}
	if patch.PlaceID != nil {
		n.PlaceID = patch.PlaceID
	}
	set(&n.Kind, patch.Kind)
	set(&n.Name, patch.Name)
	set(&n.Subtitle, patch.Subtitle)
	set(&n.Address, patch.Address)
	set(&n.State, patch.State)
	set(&n.Notes, patch.Notes)
	set(&n.X, patch.X)
	set(&n.Y, patch.Y)
	if err := s.validateNode(ctx, &n); err != nil {
		return n, err
	}
	if n.ParentID != nil {
		// A machine cannot be put inside another machine while it still contains nodes itself.
		var kids int
		if err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM nodes WHERE parent_id = ?`, id).Scan(&kids); err != nil {
			return n, err
		}
		if kids > 0 {
			return n, invalid("parentId", "too_deep")
		}
	}
	_, err = s.db.ExecContext(ctx, `UPDATE nodes SET parent_id = ?, place_id = ?, kind = ?, name = ?, subtitle = ?, address = ?, state = ?, notes = ?, x = ?, y = ?, updated_at = ? WHERE id = ?`,
		n.ParentID, n.PlaceID, n.Kind, n.Name, n.Subtitle, n.Address, n.State, n.Notes, n.X, n.Y, s.now().UnixMilli(), id)
	return n, err
}

// DeleteNode removes a node, everything inside it and all its links.
func (s *Store) DeleteNode(ctx context.Context, id string) error {
	return deleteByID(ctx, s.db, "nodes", id)
}

// ---------- Links ----------

func (s *Store) validateLink(ctx context.Context, l *Link) error {
	if !slices.Contains(LinkKinds, l.Kind) {
		return invalid("kind", "invalid")
	}
	if l.FromID == l.ToID {
		return invalid("toId", "cycle")
	}
	for field, id := range map[string]string{"fromId": l.FromID, "toId": l.ToID} {
		var ok int
		if err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM nodes WHERE id = ?`, id).Scan(&ok); err != nil {
			return err
		}
		if ok == 0 {
			return invalid(field, "not_found")
		}
	}
	if err := checkText("proto", l.Proto, 80, false); err != nil {
		return err
	}
	if err := checkText("about", l.About, 1000, false); err != nil {
		return err
	}
	if err := checkText("ifBroken", l.IfBroken, 1000, false); err != nil {
		return err
	}
	if l.SpeedMbit != nil && (*l.SpeedMbit <= 0 || *l.SpeedMbit > 1_000_000) {
		return invalid("speedMbit", "invalid")
	}
	return nil
}

// CreateLink adds a link.
func (s *Store) CreateLink(ctx context.Context, l Link) (Link, error) {
	if err := s.validateLink(ctx, &l); err != nil {
		return l, err
	}
	l.ID = NewID()
	_, err := s.db.ExecContext(ctx, `INSERT INTO links (id, from_id, to_id, kind, proto, about, if_broken, speed_mbit, planned, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		l.ID, l.FromID, l.ToID, l.Kind, strings.TrimSpace(l.Proto), strings.TrimSpace(l.About), strings.TrimSpace(l.IfBroken), l.SpeedMbit, l.Planned, s.now().UnixMilli())
	return l, err
}

// LinkPatch changes some fields of a link.
type LinkPatch struct {
	Kind      *string  `json:"kind"`
	Proto     *string  `json:"proto"`
	About     *string  `json:"about"`
	IfBroken  *string  `json:"ifBroken"`
	SpeedMbit *float64 `json:"speedMbit"`
	Planned   *bool    `json:"planned"`
	// Swap reverses the direction.
	Swap bool `json:"swap"`
}

// UpdateLink applies a patch and returns the result.
func (s *Store) UpdateLink(ctx context.Context, id string, patch LinkPatch) (Link, error) {
	var l Link
	err := s.db.QueryRowContext(ctx, `SELECT id, from_id, to_id, kind, proto, about, if_broken, speed_mbit, planned FROM links WHERE id = ?`, id).
		Scan(&l.ID, &l.FromID, &l.ToID, &l.Kind, &l.Proto, &l.About, &l.IfBroken, &l.SpeedMbit, &l.Planned)
	if errors.Is(err, sql.ErrNoRows) {
		return l, ErrNotFound
	} else if err != nil {
		return l, err
	}
	set(&l.Kind, patch.Kind)
	set(&l.Proto, patch.Proto)
	set(&l.About, patch.About)
	set(&l.IfBroken, patch.IfBroken)
	set(&l.Planned, patch.Planned)
	if patch.SpeedMbit != nil {
		if *patch.SpeedMbit == 0 {
			l.SpeedMbit = nil // 0 clears the speed
		} else {
			l.SpeedMbit = patch.SpeedMbit
		}
	}
	if patch.Swap {
		l.FromID, l.ToID = l.ToID, l.FromID
	}
	if err := s.validateLink(ctx, &l); err != nil {
		return l, err
	}
	_, err = s.db.ExecContext(ctx, `UPDATE links SET from_id = ?, to_id = ?, kind = ?, proto = ?, about = ?, if_broken = ?, speed_mbit = ?, planned = ? WHERE id = ?`,
		l.FromID, l.ToID, l.Kind, strings.TrimSpace(l.Proto), strings.TrimSpace(l.About), strings.TrimSpace(l.IfBroken), l.SpeedMbit, l.Planned, id)
	return l, err
}

// DeleteLink removes a link.
func (s *Store) DeleteLink(ctx context.Context, id string) error {
	return deleteByID(ctx, s.db, "links", id)
}

// ---------- Layout ----------

// Position is where a node sits on its level.
type Position struct {
	ID string  `json:"id"`
	X  float64 `json:"x"`
	Y  float64 `json:"y"`
}

// SaveLayout stores node positions and place rectangles in one transaction (after dragging on the map).
func (s *Store) SaveLayout(ctx context.Context, nodes []Position, places []Place) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	for _, p := range nodes {
		if _, err := tx.ExecContext(ctx, `UPDATE nodes SET x = ?, y = ? WHERE id = ?`, p.X, p.Y, p.ID); err != nil {
			return err
		}
	}
	for _, p := range places {
		if p.W < 160 || p.H < 120 {
			return invalid("size", "invalid")
		}
		if _, err := tx.ExecContext(ctx, `UPDATE places SET x = ?, y = ?, w = ?, h = ? WHERE id = ?`, p.X, p.Y, p.W, p.H, p.ID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// ---------- helpers ----------

func set[T any](dst *T, v *T) {
	if v != nil {
		*dst = *v
	}
}

func deleteByID(ctx context.Context, db *sql.DB, table, id string) error {
	res, err := db.ExecContext(ctx, `DELETE FROM `+table+` WHERE id = ?`, id) // table is a constant from this package
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}
