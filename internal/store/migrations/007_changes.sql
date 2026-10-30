-- Stage 4: what changed on machines (new image, restart, reboot...), noticed by comparing snapshots.
CREATE TABLE changes (
    id          TEXT PRIMARY KEY,
    at          INTEGER NOT NULL,           -- unix milliseconds (of the latest one when several were folded)
    node_id     TEXT NOT NULL,              -- the container's node, or the machine's
    machine_id  TEXT NOT NULL,              -- the machine it happened on
    kind        TEXT NOT NULL,              -- image_changed, container_restarted, machine_rebooted, ...
    params      TEXT NOT NULL DEFAULT '{}',
    count       INTEGER NOT NULL DEFAULT 1  -- repeats folded into one (a container restarting in a loop)
);

CREATE INDEX changes_machine ON changes (machine_id, at);
CREATE INDEX changes_node ON changes (node_id, at);

-- The last state each machine was seen in, so changes made while the core was down are noticed too.
CREATE TABLE machine_state (
    node_id  TEXT PRIMARY KEY,
    state    TEXT NOT NULL
);
