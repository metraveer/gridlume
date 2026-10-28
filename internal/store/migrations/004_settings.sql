-- Stage 2r: settings changed in the interface (update channel, automatic updates, the core's own machine).
CREATE TABLE settings (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
);

-- A code made by the core installer for the agent on the core's own machine: that node gets marked.
ALTER TABLE enroll_codes ADD COLUMN purpose TEXT NOT NULL DEFAULT '';
