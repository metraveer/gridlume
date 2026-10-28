-- Stage 1: the map drawn by hand, plus users and sessions.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'viewer')),
  created_at    INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,           -- sha256 of the cookie value; the value itself is never stored
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

-- A place is a coloured area on the top level of the map: home, village, cloud.
CREATE TABLE places (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  tone       TEXT NOT NULL DEFAULT 'green',
  x          REAL NOT NULL DEFAULT 0,
  y          REAL NOT NULL DEFAULT 0,
  w          REAL NOT NULL DEFAULT 440,
  h          REAL NOT NULL DEFAULT 320,
  created_at INTEGER NOT NULL
);

-- A node is anything on the map. parent_id puts it inside a machine (containers, services):
-- it is then shown one level down, when you open the machine.
CREATE TABLE nodes (
  id         TEXT PRIMARY KEY,
  parent_id  TEXT REFERENCES nodes(id) ON DELETE CASCADE,
  place_id   TEXT REFERENCES places(id) ON DELETE SET NULL,
  kind       TEXT NOT NULL,
  name       TEXT NOT NULL,
  subtitle   TEXT NOT NULL DEFAULT '',
  address    TEXT NOT NULL DEFAULT '',
  state      TEXT NOT NULL DEFAULT 'unknown' CHECK (state IN ('ok', 'warn', 'crit', 'unknown', 'planned')),
  notes      TEXT NOT NULL DEFAULT '',
  x          REAL NOT NULL DEFAULT 0,
  y          REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX nodes_parent ON nodes(parent_id);

-- A link always explains itself: what it is (about), what breaks without it (if_broken), protocol/port.
-- Direction: from = the caller / the side closer to the internet, to = the called / the side further away.
CREATE TABLE links (
  id           TEXT PRIMARY KEY,
  from_id      TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  to_id        TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  proto        TEXT NOT NULL DEFAULT '',
  about        TEXT NOT NULL DEFAULT '',
  if_broken    TEXT NOT NULL DEFAULT '',
  speed_mbit   REAL,
  planned      INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  CHECK (from_id <> to_id)
);
CREATE INDEX links_from ON links(from_id);
CREATE INDEX links_to ON links(to_id);
