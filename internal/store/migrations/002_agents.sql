-- Stage 2: agents on machines and their metrics.

CREATE TABLE agents (
    id          TEXT PRIMARY KEY,
    node_id     TEXT NOT NULL UNIQUE REFERENCES nodes(id) ON DELETE CASCADE,
    public_key  BLOB NOT NULL,               -- Ed25519; the private key never leaves the machine
    hostname    TEXT NOT NULL DEFAULT '',
    os          TEXT NOT NULL DEFAULT '',
    kernel      TEXT NOT NULL DEFAULT '',
    arch        TEXT NOT NULL DEFAULT '',
    version     TEXT NOT NULL DEFAULT '',
    mode        TEXT NOT NULL DEFAULT 'user',
    created_at  INTEGER NOT NULL,
    last_seen   INTEGER NOT NULL DEFAULT 0   -- unix seconds
);

-- One-time codes for "connect a machine". Only the hash is stored, like session tokens.
CREATE TABLE enroll_codes (
    code_hash   TEXT PRIMARY KEY,
    node_id     TEXT REFERENCES nodes(id) ON DELETE CASCADE, -- NULL: create a new node on enrollment
    mode        TEXT NOT NULL,
    expires_at  INTEGER NOT NULL
);

-- Minute averages and maxima; older than 14 days are deleted.
CREATE TABLE metrics (
    node_id  TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    series   TEXT NOT NULL,   -- cpu, mem, swap, load1, disk, temp, rx, tx
    ts       INTEGER NOT NULL, -- unix seconds, start of the minute
    avg      REAL NOT NULL,
    max      REAL NOT NULL,
    PRIMARY KEY (node_id, series, ts)
) WITHOUT ROWID;
