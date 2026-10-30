-- Stage 3: problems the core noticed. Open while ended_at is NULL; kept 30 days afterwards as history.
CREATE TABLE problems (
    id          TEXT PRIMARY KEY,
    key         TEXT NOT NULL,              -- the kind and its subject, e.g. "disk:<node>:/": one open per key
    kind        TEXT NOT NULL,              -- agent_offline, container_down, disk_full, link_loss, ...
    severity    TEXT NOT NULL,              -- warn or crit
    node_id     TEXT,                       -- no foreign key: a deleted node's problem simply ends
    link_id     TEXT,
    params      TEXT NOT NULL DEFAULT '{}', -- figures for the text (percent, mount, container name...)
    merged      TEXT NOT NULL DEFAULT '[]', -- kinds of other signals with the same cause, folded in
    started_at  INTEGER NOT NULL,           -- unix milliseconds
    ended_at    INTEGER
);

CREATE INDEX problems_open ON problems (ended_at);
