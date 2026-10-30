<div align="center">

# Gridlume

**Your whole infrastructure on one map.**<br>
Servers, routers, cloud, containers and the links between them: understood at a glance, managed from one place.

[![CI](https://github.com/metraveer/gridlume/actions/workflows/ci.yml/badge.svg)](https://github.com/metraveer/gridlume/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/metraveer/gridlume?sort=semver&label=release)](https://github.com/metraveer/gridlume/releases/latest)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)

English · [Русский](README.ru.md)

![Gridlume: a home network and a cloud server on one map](docs/images/map.png)

</div>

> [!NOTE]
> Gridlume is in early development (0.x). The map, live data from machines and self-updates work today;
> problems and notifications, actions and integrations are next. See the [roadmap](#roadmap).

## Why

Most monitoring tools show lists and graphs. Gridlume starts from a picture of how things are actually
connected: what lives where, what depends on what, and what breaks if something goes down. You draw what
you know, agents fill in the rest, and every link says what it is and why it exists.

It is built for home labs and small teams: one small program, no database server to run, a clean
interface in English and Russian.

## What works today

- **The map.** Areas (home, office, cloud), nodes of 15 kinds (router, server, VPS, container, domain, UPS…),
  typed links with speeds and a note on what breaks if a link is down. Network links show live traffic: `312 / 700 Mbit`, dots running in the direction of the data, amber above 80%. Open any machine to see what is
  inside it; breadcrumbs, search, a minimap, right-click menus.
- **Agents.** A small program on each Linux machine (amd64 and arm64) reports CPU, memory, disks, network
  and temperature, with history. It connects out to the core, so no ports need to be opened on the machine.
- **Docker.** Containers and Compose projects show up inside their machine by themselves, with state and
  resources. Gridlume notices likely links (`app → db` from `depends_on`, shared networks) and suggests them;
  you confirm.
- **Install and updates.** One command installs the core as a systemd service. Updates are signed releases
  from GitHub, applied from the web panel with a database backup and an automatic rollback if the new
  version does not start. Agents on other machines update from the core the same way, automatically or with a button.
- **Access.** The first account is created from a one-time setup link; sign-in sessions, password change.

![Inside a server: containers, live numbers and a suggested link](docs/images/server.png)

## Install

On a Linux machine with systemd (tested on Debian 13; other systemd distributions should work), as root:

```bash
curl -fsSL https://raw.githubusercontent.com/metraveer/gridlume/main/deploy/install-core.sh | sudo sh
```

The installer:

- runs the core as its own user;
- keeps data in `/var/lib/gridlume`;
- opens port 7420 to the local network only;
- puts an agent on the same machine.

At the end it prints a link: open it to create the owner account. To add other machines, use
**Machine with agent** on the map: it gives a one-line command with a one-time code.

Options: `--channel stable|edge`, `--agent-mode user|readonly|root|none`, `--addr`, `--lang ru|en`
(see the top of [`install-core.sh`](deploy/install-core.sh)). Running the installer again upgrades and
keeps your data.

> [!WARNING]
> Gridlume speaks plain HTTP for now and is meant for a trusted local network. Do not expose it to the
> internet until HTTPS and two-factor sign-in arrive (planned for 1.0).

## Updates

Choose a channel in **Settings → Updates**:

| Channel | What you get |
|---|---|
| **Stable** (default) | Tagged releases `vX.Y.Z` |
| **Edge** | A build from every change merged to `main` (`vX.Y.Z-dev.N`), plus the stable releases |

Every release is signed. The core refuses files whose signature does not match the key built into it.
How it all works, and what to do when something goes wrong: [`docs/updates.md`](docs/updates.md).

## How it works

```
 browser ──HTTP──► core (one Go binary: web UI, API, SQLite)
                     ▲
                     │ WebSocket, Ed25519 keys; the agent connects out
                     │
            agent on each machine: /proc, /sys, Docker API
```

- **Core:** Go, SQLite (no CGO), embedded React interface.
- **Agent:** Go, reads the system directly, no extra daemons.
- **Interface:** React, TypeScript, React Flow, i18next.

Design decisions and their reasons are in [`docs/decisions.md`](docs/decisions.md) (in Russian).

## Roadmap

| Stage | Status |
|---|---|
| Map: areas, nodes, links, levels | ✅ done |
| Agent, live data, Docker | ✅ done; latency and packet loss on links in progress |
| Signed releases, updates from the panel | ✅ done |
| Problems: the core finds what is wrong (machine offline, container down, disk full, packet loss…), one line per cause | ✅ done |
| Checks by the core for nodes without an agent: ping, TCP, HTTP, certificate expiry | ✅ done |
| Notifications in Telegram: rules, quiet hours, "solved" messages | ✅ done |
| Understanding: "what breaks if…", change journal, history | next |
| Actions: logs, terminal, container control with confirmation and undo | planned |
| Integrations: password vault, Keenetic, Timeweb Cloud, UPS (NUT), backups | planned |
| 1.0: HTTPS, 2FA, Docker image, full documentation | planned |

The detailed plan is in [`docs/plan.md`](docs/plan.md) (in Russian).

## Development

Go 1.26+ and Node.js 24+:

```bash
cd web && npm ci && cd ..
go run ./cmd/gridlume dev
```

Open http://127.0.0.1:7420. The core and Vite run together; the interface reloads as you save.
Checks, rules and conventions: [CONTRIBUTING.md](CONTRIBUTING.md).

Issues and ideas are welcome in English or Russian. Pull requests from others will be accepted once a
contributor agreement is in place.

## License

[AGPL-3.0](LICENSE): free and open source under its terms. A commercial license and paid features for
companies that cannot accept the AGPL will come later.

Found a security problem? Please report it privately: see [SECURITY.md](SECURITY.md).
