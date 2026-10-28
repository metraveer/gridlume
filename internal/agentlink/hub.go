// Package agentlink keeps the connections from agents: it checks who is connecting, holds the latest
// snapshot of each machine, writes minute metrics and tells the interface what changed.
package agentlink

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"errors"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"github.com/metraveer/gridlume/internal/agentproto"
	"github.com/metraveer/gridlume/internal/store"
)

// Silence is how long an agent may stay quiet before the core drops the connection.
const Silence = 30 * time.Second

// Event is something the interface should know about. Exactly one of the pointers is set.
type Event struct {
	Agent    *Status              `json:"agent,omitempty"`
	Snapshot *agentproto.Snapshot `json:"snapshot,omitempty"`
	NodeID   string               `json:"nodeId"`
	Removed  bool                 `json:"removed,omitempty"` // the agent was unlinked from the node
}

// Status is an agent as the interface sees it: what is stored plus whether it is connected now.
type Status struct {
	store.Agent
	Online bool `json:"online"`
}

// Hub holds connected agents and the interface's subscribers.
type Hub struct {
	store *store.Store
	log   *slog.Logger
	now   func() time.Time

	mu     sync.Mutex
	online map[string]*conn // by agent id
	last   map[string]agentproto.Snapshot
	subs   map[chan Event]struct{}
}

type conn struct {
	agent   store.Agent
	cancel  context.CancelFunc
	minute  *minute
	removed bool // unlinked: say "removed" instead of "offline" when the connection ends
}

// New returns a hub. Call Run to flush metrics in the background.
func New(s *store.Store, log *slog.Logger) *Hub {
	return &Hub{store: s, log: log, now: time.Now, online: map[string]*conn{}, last: map[string]agentproto.Snapshot{}, subs: map[chan Event]struct{}{}}
}

// Statuses returns every agent with its connection state.
func (h *Hub) Statuses(ctx context.Context) ([]Status, error) {
	agents, err := h.store.ListAgents(ctx)
	if err != nil {
		return nil, err
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	out := make([]Status, len(agents))
	for i, a := range agents {
		_, on := h.online[a.ID]
		out[i] = Status{Agent: a, Online: on}
	}
	return out, nil
}

// Snapshots returns the latest snapshot of every connected machine, by node id.
func (h *Hub) Snapshots() map[string]agentproto.Snapshot {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := make(map[string]agentproto.Snapshot, len(h.last))
	for k, v := range h.last {
		out[k] = v
	}
	return out
}

// Subscribe returns a channel of events and a function that stops them.
// A subscriber that does not keep up loses events rather than slowing agents down.
func (h *Hub) Subscribe() (<-chan Event, func()) {
	ch := make(chan Event, 64)
	h.mu.Lock()
	h.subs[ch] = struct{}{}
	h.mu.Unlock()
	return ch, func() {
		h.mu.Lock()
		delete(h.subs, ch)
		h.mu.Unlock()
	}
}

func (h *Hub) publish(e Event) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subs {
		select {
		case ch <- e:
		default:
		}
	}
}

// Unlinked drops the connection of an agent removed in the interface and tells the interface.
func (h *Hub) Unlinked(agentID, nodeID string) {
	h.mu.Lock()
	c := h.online[agentID]
	if c != nil {
		c.removed = true
	}
	h.mu.Unlock()
	if c != nil {
		c.cancel() // Connect publishes "removed" as it ends
		return
	}
	h.publish(Event{NodeID: nodeID, Removed: true})
}

// Connect is the /api/agent/connect handler.
func (h *Hub) Connect(w http.ResponseWriter, r *http.Request) {
	ws, err := websocket.Accept(w, r, nil)
	if err != nil {
		return // Accept has already answered
	}
	ws.SetReadLimit(1 << 20)
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	a, err := h.handshake(ctx, ws)
	if err != nil {
		code := "bad_handshake"
		if errors.Is(err, store.ErrNotFound) {
			code = "unknown_agent" // unlinked in the interface: the agent stops retrying often
		}
		h.log.Info("agent rejected", "remote", r.RemoteAddr, "err", err)
		_ = wsjson.Write(ctx, ws, agentproto.Message{Type: "error", Error: code})
		_ = ws.Close(websocket.StatusPolicyViolation, code)
		return
	}

	c := &conn{agent: a, cancel: cancel, minute: newMinute()}
	h.mu.Lock()
	if old := h.online[a.ID]; old != nil {
		old.cancel() // the same agent reconnected before the old connection timed out
	}
	h.online[a.ID] = c
	h.mu.Unlock()
	h.log.Info("agent connected", "node", a.NodeID, "host", a.Hostname, "version", a.Version)
	h.publish(Event{NodeID: a.NodeID, Agent: &Status{Agent: a, Online: true}})

	err = h.serve(ctx, ws, c)

	h.mu.Lock()
	if h.online[a.ID] == c {
		delete(h.online, a.ID)
		delete(h.last, a.NodeID)
	}
	removed := c.removed
	h.mu.Unlock()
	h.flush(c, true)
	if removed {
		h.publish(Event{NodeID: a.NodeID, Removed: true})
	} else {
		a.LastSeen = h.now().Unix()
		_ = h.store.TouchAgent(context.Background(), a.ID)
		h.publish(Event{NodeID: a.NodeID, Agent: &Status{Agent: a, Online: false}})
	}
	h.log.Info("agent disconnected", "node", a.NodeID, "host", a.Hostname, "err", err)
	_ = ws.CloseNow()
}

func (h *Hub) handshake(ctx context.Context, ws *websocket.Conn) (store.Agent, error) {
	nonce := make([]byte, 32)
	if _, err := rand.Read(nonce); err != nil {
		return store.Agent{}, err
	}
	hctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := wsjson.Write(hctx, ws, agentproto.Message{Type: "challenge", Nonce: nonce}); err != nil {
		return store.Agent{}, err
	}
	var hello agentproto.Message
	if err := wsjson.Read(hctx, ws, &hello); err != nil {
		return store.Agent{}, err
	}
	if hello.Type != "hello" || hello.Info == nil {
		return store.Agent{}, errors.New("expected hello")
	}
	a, err := h.store.GetAgent(ctx, hello.AgentID)
	if err != nil {
		return a, err
	}
	if !ed25519.Verify(a.PublicKey(), agentproto.SignedBytes(nonce), hello.Sig) {
		return a, errors.New("bad signature")
	}
	a, err = h.store.AgentConnected(ctx, a.ID, *hello.Info)
	if err != nil {
		return a, err
	}
	return a, wsjson.Write(hctx, ws, agentproto.Message{Type: "welcome"})
}

func (h *Hub) serve(ctx context.Context, ws *websocket.Conn, c *conn) error {
	for {
		rctx, cancel := context.WithTimeout(ctx, Silence)
		var m agentproto.Message
		err := wsjson.Read(rctx, ws, &m)
		cancel()
		if err != nil {
			return err
		}
		if m.Type != "snapshot" || m.Snapshot == nil {
			continue
		}
		snap := *m.Snapshot
		snap.At = h.now().UnixMilli() // the core's clock: machines' clocks may be wrong
		h.mu.Lock()
		h.last[c.agent.NodeID] = snap
		h.mu.Unlock()
		if c.minute.add(snap, h.now()) {
			h.flush(c, false)
		}
		h.publish(Event{NodeID: c.agent.NodeID, Snapshot: &snap})
	}
}

// flush writes the finished minute (or, when the agent leaves, the unfinished one too).
func (h *Hub) flush(c *conn, all bool) {
	rows := c.minute.take(c.agent.NodeID, h.now(), all)
	if len(rows) == 0 {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := h.store.WriteMetrics(ctx, rows); err != nil {
		h.log.Error("write metrics", "node", c.agent.NodeID, "err", err)
	}
	_ = h.store.TouchAgent(ctx, c.agent.ID)
}

// Maintain deletes old metrics and expired codes once an hour until ctx ends.
func (h *Hub) Maintain(ctx context.Context) {
	t := time.NewTicker(time.Hour)
	defer t.Stop()
	for {
		_ = h.store.PurgeMetrics(ctx)
		_ = h.store.PurgeEnrollCodes(ctx)
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}
