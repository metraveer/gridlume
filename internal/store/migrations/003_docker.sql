-- Stage 2b: containers found by agents become nodes; the core suggests links between them.

-- source: '' for nodes drawn by hand, 'docker' for containers an agent reported.
-- ext_key: what the source calls it, e.g. 'docker:app/api' (compose project/service) or 'docker:name'.
ALTER TABLE nodes ADD COLUMN source TEXT NOT NULL DEFAULT '';
ALTER TABLE nodes ADD COLUMN ext_key TEXT;
CREATE UNIQUE INDEX nodes_ext_key ON nodes (parent_id, ext_key) WHERE ext_key IS NOT NULL;

-- "api seems to use postgres": shown to the user, who accepts (a link is made) or dismisses it.
-- A dismissed suggestion stays, so the same guess is not offered again.
CREATE TABLE link_suggestions (
    id          TEXT PRIMARY KEY,
    from_id     TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    to_id       TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    reason      TEXT NOT NULL,             -- compose_depends, env_ref
    detail      TEXT NOT NULL DEFAULT '',  -- e.g. the host name the environment pointed at
    dismissed   INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    UNIQUE (from_id, to_id, kind)
);
