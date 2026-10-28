// Package agentproto is what the agent and the core say to each other over /api/agent/connect.
//
// The core speaks first: {"type":"challenge","nonce":...}. The agent signs SignedBytes(nonce) with the
// Ed25519 key it made at enrollment and answers {"type":"hello",...}. The core checks the signature
// against the public key it stored and replies {"type":"welcome"} or {"type":"error"}. After that the
// agent sends a snapshot every few seconds.
package agentproto

// Modes the agent can be installed in; see docs/decisions.md, "Режимы прав агента".
const (
	ModeUser     = "user"     // own system user, in the docker group
	ModeReadOnly = "readonly" // own system user, read-only Docker
	ModeRoot     = "root"
)

// ValidMode reports whether m is one of the install modes.
func ValidMode(m string) bool { return m == ModeUser || m == ModeReadOnly || m == ModeRoot }

// Message is the envelope of every message; only the fields of its type are set.
type Message struct {
	Type     string    `json:"type"` // challenge, hello, welcome, error, snapshot
	Nonce    []byte    `json:"nonce,omitempty"`
	AgentID  string    `json:"agentId,omitempty"`
	Sig      []byte    `json:"sig,omitempty"`
	Info     *Info     `json:"info,omitempty"`
	Snapshot *Snapshot `json:"snapshot,omitempty"`
	Error    string    `json:"error,omitempty"` // a stable code, e.g. "unknown_agent"
}

// SignedBytes is what the agent signs: a fixed prefix keeps the signature useless anywhere else.
func SignedBytes(nonce []byte) []byte {
	return append([]byte("gridlume-agent-hello-v1:"), nonce...)
}

// Info describes the machine and the agent. Sent on enrollment and on every connection.
type Info struct {
	Hostname string `json:"hostname"`
	OS       string `json:"os"`     // e.g. "Debian GNU/Linux 13 (trixie)"
	Kernel   string `json:"kernel"` // e.g. "6.12.48-amd64"
	Arch     string `json:"arch"`   // GOARCH
	Version  string `json:"version"`
	Mode     string `json:"mode"`
}

// Snapshot is the state of the machine right now.
type Snapshot struct {
	At        int64   `json:"at"`  // unix milliseconds
	CPU       float64 `json:"cpu"` // percent of all cores since the previous snapshot
	Cores     int     `json:"cores"`
	Load1     float64 `json:"load1"`
	MemTotal  uint64  `json:"memTotal"` // bytes
	MemUsed   uint64  `json:"memUsed"`  // total minus available
	SwapTotal uint64  `json:"swapTotal"`
	SwapUsed  uint64  `json:"swapUsed"`
	Uptime    uint64  `json:"uptime"` // seconds
	Disks     []Disk  `json:"disks"`
	Net       []Iface `json:"net"`
	Temps     []Temp  `json:"temps"`
}

type Disk struct {
	Mount string `json:"mount"`
	FS    string `json:"fs"`
	Total uint64 `json:"total"` // bytes available to users plus used
	Used  uint64 `json:"used"`
}

type Iface struct {
	Name string  `json:"name"`
	Rx   float64 `json:"rx"` // bytes per second since the previous snapshot
	Tx   float64 `json:"tx"`
}

type Temp struct {
	Name string  `json:"name"` // chip and sensor, e.g. "coretemp Package id 0"
	C    float64 `json:"c"`
}

// EnrollRequest is POSTed to /api/agent/enroll with the one-time code from the interface.
type EnrollRequest struct {
	Code      string `json:"code"`
	PublicKey []byte `json:"publicKey"` // Ed25519, 32 bytes
	Info      Info   `json:"info"`
}

type EnrollResponse struct {
	AgentID string `json:"agentId"`
	NodeID  string `json:"nodeId"`
}
