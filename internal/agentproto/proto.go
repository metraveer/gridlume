// Package agentproto is what the agent and the core say to each other over /api/agent/connect.
//
// The core speaks first: {"type":"challenge","nonce":...}. The agent signs SignedBytes(nonce) with the
// Ed25519 key it made at enrollment and answers {"type":"hello",...}. The core checks the signature
// against the public key it stored and replies {"type":"welcome"} or {"type":"error"}. After that the
// agent sends a snapshot every few seconds, and the core may send {"type":"update","version":...}: the
// agent leaves a request for its root updater (gridlume-agent update), which installs the build the
// core hands out after checking its signature.
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
	Type     string    `json:"type"` // challenge, hello, welcome, error, snapshot, update, probes
	Nonce    []byte    `json:"nonce,omitempty"`
	AgentID  string    `json:"agentId,omitempty"`
	Sig      []byte    `json:"sig,omitempty"`
	Info     *Info     `json:"info,omitempty"`
	Snapshot *Snapshot `json:"snapshot,omitempty"`
	Error    string    `json:"error,omitempty"`   // a stable code, e.g. "unknown_agent"
	Version  string    `json:"version,omitempty"` // update: the version the core hands out
	Probes   []Probe   `json:"probes,omitempty"`  // probes: what to ping (the whole list; it replaces the previous one)
}

// Probe asks the agent to ping a host: the far end of a network link (ID is the link's id).
type Probe struct {
	ID   string `json:"id"`
	Host string `json:"host"` // IPv4 address or name
}

// ProbeResult is how a probe went over the last minute (a ping every 10 seconds).
type ProbeResult struct {
	ID    string  `json:"id"`
	Host  string  `json:"host"`
	Sent  int     `json:"sent"`
	RTT   float64 `json:"rtt"`             // milliseconds, average of the answered pings; 0 if none
	Loss  float64 `json:"loss"`            // percent of pings without an answer
	Error string  `json:"error,omitempty"` // why it cannot ping at all: "resolve", "no_icmp"
}

// SignedBytes is what the agent signs: a fixed prefix keeps the signature useless anywhere else.
func SignedBytes(nonce []byte) []byte {
	return append([]byte("gridlume-agent-hello-v1:"), nonce...)
}

// Info describes the machine and the agent. Sent on enrollment and on every connection.
type Info struct {
	Hostname string        `json:"hostname"`
	OS       string        `json:"os"`     // e.g. "Debian GNU/Linux 13 (trixie)"
	Kernel   string        `json:"kernel"` // e.g. "6.12.48-amd64"
	Arch     string        `json:"arch"`   // GOARCH
	Version  string        `json:"version"`
	Mode     string        `json:"mode"`
	Build    int           `json:"build"`            // release run number: "newer" is a plain comparison (0 = a local build)
	Updater  bool          `json:"updater"`          // the root updater is installed: the agent can be updated from the core
	Update   *UpdateResult `json:"update,omitempty"` // how the last update went
}

// UpdateResult is written by the agent's updater to <state>/update-status.json and sent with Info.
type UpdateResult struct {
	State   string `json:"state"` // done, up_to_date, failed, rolled_back
	From    string `json:"from"`
	To      string `json:"to,omitempty"`
	Message string `json:"message,omitempty"`
	At      int64  `json:"at"` // unix seconds
}

// Snapshot is the state of the machine right now.
type Snapshot struct {
	At        int64   `json:"at"`      // unix milliseconds
	CPU       float64 `json:"cpu"`     // percent of all threads since the previous snapshot
	Cores     int     `json:"cores"`   // physical cores
	Threads   int     `json:"threads"` // logical processors (cores × hyper-threading)
	Load1     float64 `json:"load1"`
	MemTotal  uint64  `json:"memTotal"` // bytes
	MemUsed   uint64  `json:"memUsed"`  // total minus available
	SwapTotal uint64  `json:"swapTotal"`
	SwapUsed  uint64  `json:"swapUsed"`
	Uptime    uint64  `json:"uptime"` // seconds
	Disks     []Disk  `json:"disks"`
	Net       []Iface `json:"net"`
	Temps     []Temp  `json:"temps"`
	// Docker is nil when Docker is not installed; DockerError says why it could not be read.
	Docker      *Docker       `json:"docker,omitempty"`
	DockerError string        `json:"dockerError,omitempty"` // "no_access" or "unavailable"
	Probes      []ProbeResult `json:"probes,omitempty"`
}

// Docker is the containers on the machine.
type Docker struct {
	Containers []Container `json:"containers"`
}

// Container is one container. Environment values are never sent: Refs holds only the host names they point at.
type Container struct {
	ID        string   `json:"id"` // short id
	Name      string   `json:"name"`
	Image     string   `json:"image"`
	State     string   `json:"state"`  // running, exited, restarting, paused, created, dead
	Status    string   `json:"status"` // as `docker ps` says it, e.g. "Up 3 hours (healthy)"
	Health    string   `json:"health,omitempty"`
	Project   string   `json:"project,omitempty"` // docker compose project
	Service   string   `json:"service,omitempty"` // docker compose service
	CPU       float64  `json:"cpu"`               // percent of the whole machine
	MemUsed   uint64   `json:"memUsed"`
	MemLimit  uint64   `json:"memLimit"`
	Restarts  int      `json:"restarts"`
	Ports     []Port   `json:"ports,omitempty"`
	Networks  []string `json:"networks,omitempty"`
	Refs      []string `json:"refs,omitempty"`      // hosts named in environment values, e.g. "db"
	DependsOn []string `json:"dependsOn,omitempty"` // compose depends_on
}

type Port struct {
	Private int    `json:"private"`
	Public  int    `json:"public,omitempty"` // published on the machine
	Proto   string `json:"proto"`
	IP      string `json:"ip,omitempty"`
}

// DockerSocket is where the agent finds Docker in each mode. The read-only mode talks to a proxy
// (gridlume-agent docker-proxy) that refuses everything except reading.
func DockerSocket(mode string) string {
	if mode == ModeReadOnly {
		return "/run/gridlume-docker/docker.sock"
	}
	return "/var/run/docker.sock"
}

type Disk struct {
	Mount string `json:"mount"`
	FS    string `json:"fs"`
	Total uint64 `json:"total"` // bytes available to users plus used
	Used  uint64 `json:"used"`
}

type Iface struct {
	Name    string  `json:"name"`
	Rx      float64 `json:"rx"` // bytes per second since the previous snapshot
	Tx      float64 `json:"tx"`
	Default bool    `json:"default,omitempty"` // carries the default route: the way out of the machine
	Speed   int     `json:"speed,omitempty"`   // link speed the cards agreed on, Mbit/s; 0 = unknown (Wi-Fi, virtual)
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
