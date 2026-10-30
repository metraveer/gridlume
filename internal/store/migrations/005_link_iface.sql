-- Stage 2v: which network interface of the machine with the agent carries a link ('' = the one with
-- the default route). Its counters are the link's live traffic.
ALTER TABLE links ADD COLUMN iface TEXT NOT NULL DEFAULT '';
