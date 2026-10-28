#!/bin/sh
# Gridlume core installer: the core as a systemd service, the agent on this same machine, updates.
#
#   curl -fsSL https://raw.githubusercontent.com/metraveer/gridlume/main/deploy/install-core.sh | sudo sh
#   curl -fsSL https://raw.githubusercontent.com/metraveer/gridlume/main/deploy/install-core.sh | sudo sh -s -- --channel edge
#
# Options:
#   --channel stable|edge          which releases to follow (changeable later in Settings)
#   --agent-mode user|readonly|root|none   rights of the agent on this machine (docs/decisions.md)
#   --addr 0.0.0.0:7420            where the core listens; the firewall opens it to the local network only
#   --lang ru|en                   language of these messages
#
# Running it again upgrades the core and keeps the data. Later updates: Settings → Updates, or `sudo gridlume update`.
set -eu

REPO=metraveer/gridlume
CHANNEL=""
AGENT_MODE=user
ADDR=0.0.0.0:7420
case "${LANG:-}" in ru*) LANG_UI=ru ;; *) LANG_UI=en ;; esac
CORE_USER=gridlume-core
DATA=/var/lib/gridlume
BIN=/usr/local/bin/gridlume
CONF_DIR=/etc/gridlume

while [ $# -gt 0 ]; do
	case "$1" in
		--channel) CHANNEL="${2:-}"; shift 2 ;;
		--agent-mode) AGENT_MODE="${2:-}"; shift 2 ;;
		--addr) ADDR="${2:-}"; shift 2 ;;
		--lang) LANG_UI="${2:-}"; shift 2 ;;
		*) echo "unknown option: $1" >&2; exit 2 ;;
	esac
done

say() { if [ "$LANG_UI" = ru ]; then printf '%s\n' "$2"; else printf '%s\n' "$1"; fi; }
die() { say "Error: $1" "Ошибка: $2" >&2; exit 1; }

# No --channel: keep the one chosen before (Settings → Updates writes the same file), else stable.
if [ -z "$CHANNEL" ]; then
	CHANNEL=$(cat /var/lib/gridlume/update-channel 2>/dev/null || true)
	case "$CHANNEL" in stable|edge) ;; *) CHANNEL=stable ;; esac
	CHANNEL_GIVEN=0
else
	CHANNEL_GIVEN=1
fi
case "$CHANNEL" in stable|edge) ;; *) die "--channel must be stable or edge" "--channel: stable или edge" ;; esac
case "$AGENT_MODE" in user|readonly|root|none) ;; *) die "--agent-mode must be user, readonly, root or none" "--agent-mode: user, readonly, root или none" ;; esac
[ "$(id -u)" = 0 ] || die "run with sudo" "запустите через sudo"
[ "$(uname -s)" = Linux ] || die "only Linux is supported" "поддерживается только Linux"
command -v systemctl >/dev/null 2>&1 || die "systemd is required" "нужен systemd"
command -v curl >/dev/null 2>&1 || die "curl is required" "нужен curl"
command -v sha256sum >/dev/null 2>&1 || die "sha256sum is required" "нужен sha256sum"

case "$(uname -m)" in
	x86_64|amd64) ARCH=amd64 ;;
	aarch64|arm64) ARCH=arm64 ;;
	*) die "unsupported processor: $(uname -m)" "процессор не поддерживается: $(uname -m)" ;;
esac
PORT="${ADDR##*:}"

# Every build is its own release (vX.Y.Z, or vX.Y.Z-dev.N for edge); take all files from the newest one.
API="https://api.github.com/repos/$REPO/releases"
if [ "$CHANNEL" = edge ]; then
	TAG=$(curl -fsSL "$API?per_page=30" | grep -o '"tag_name": *"v[0-9.]*-dev\.[0-9]*"' | grep -o 'v[0-9.]*-dev\.[0-9]*' |
		awk -F'dev.' '{print $2" "$0}' | sort -n | tail -n 1 | cut -d' ' -f2)
else
	TAG=$(curl -fsSL "$API/latest" | grep -o '"tag_name": *"[^"]*"' | head -n 1 | sed 's/.*"\([^"]*\)"$/\1/')
fi
[ -n "$TAG" ] || die "no $CHANNEL release found on GitHub" "на GitHub нет выпусков канала $CHANNEL"
BASE="https://github.com/$REPO/releases/download/$TAG"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
say "Downloading Gridlume ($CHANNEL) ..." "Скачиваю Gridlume ($CHANNEL) ..."
for f in SHA256SUMS release.json "gridlume-linux-$ARCH" gridlume-agent-linux-amd64 gridlume-agent-linux-arm64; do
	curl -fsSL "$BASE/$f" -o "$TMP/$f" || die "could not download $f" "не удалось скачать $f"
done
# Every later update also checks the Ed25519 signature of SHA256SUMS (the key is built into the core).
(cd "$TMP" && grep -E " (release\.json|gridlume-linux-$ARCH|gridlume-agent-linux-(amd64|arm64))$" SHA256SUMS | sha256sum -c --quiet) ||
	die "downloaded files do not match their checksums" "скачанные файлы не совпадают с контрольными суммами"

# The core's own user: it serves the web interface, so it gets no Docker and no root.
if ! id "$CORE_USER" >/dev/null 2>&1; then
	useradd --system --home-dir "$DATA" --no-create-home --shell /usr/sbin/nologin "$CORE_USER"
fi
mkdir -p "$DATA/agents" "$DATA/backups" "$CONF_DIR"
chown "$CORE_USER:" "$DATA" "$DATA/backups"
chmod 700 "$DATA" "$DATA/backups"
install -m 755 "$TMP"/gridlume-agent-linux-amd64 "$TMP"/gridlume-agent-linux-arm64 "$DATA/agents/"

if [ ! -f "$CONF_DIR/gridlume.env" ]; then
	cat > "$CONF_DIR/gridlume.env" <<CONF
# Read by the gridlume service and by the gridlume command.
GRIDLUME_ADDR=$ADDR
GRIDLUME_DATA=$DATA
GRIDLUME_AGENTS=$DATA/agents
GRIDLUME_USER=$CORE_USER
GRIDLUME_UPDATER=1
CONF
fi
if [ "$CHANNEL_GIVEN" = 1 ] || [ ! -f "$DATA/update-channel" ]; then
	echo "$CHANNEL" > "$DATA/update-channel"
	chown "$CORE_USER:" "$DATA/update-channel"
fi

systemctl stop gridlume 2>/dev/null || true
install -m 755 "$TMP/gridlume-linux-$ARCH" "$BIN"

cat > /etc/systemd/system/gridlume.service <<UNIT
[Unit]
Description=Gridlume core
Documentation=https://github.com/$REPO
After=network-online.target
Wants=network-online.target

[Service]
User=$CORE_USER
Group=$CORE_USER
EnvironmentFile=$CONF_DIR/gridlume.env
ExecStart=$BIN serve
Restart=always
RestartSec=3
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ReadWritePaths=$DATA

[Install]
WantedBy=multi-user.target
UNIT

# Updates: the core only leaves a request file; this root service downloads, checks and installs.
cat > /etc/systemd/system/gridlume-update.path <<UNIT
[Unit]
Description=Gridlume update requests

[Path]
PathExists=$DATA/update-request

[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/gridlume-update.service <<UNIT
[Unit]
Description=Gridlume update

[Service]
Type=oneshot
EnvironmentFile=$CONF_DIR/gridlume.env
ExecStart=$BIN update --from-request
UNIT

systemctl daemon-reload
systemctl enable --now gridlume-update.path >/dev/null 2>&1
systemctl enable gridlume >/dev/null 2>&1
systemctl restart gridlume

i=0
until curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; do
	i=$((i + 1))
	[ $i -lt 30 ] || die "the core did not start: journalctl -u gridlume" "ядро не запустилось: journalctl -u gridlume"
	sleep 1
done
say "Core is running: $($BIN version)" "Ядро работает: $($BIN version)"
# Settings → Updates shows this install, not the result of an older update.
"$BIN" installed 2>/dev/null || true

# Firewall: the core is for the local network (or a VPN), not the internet.
DEV=$(ip route show default 2>/dev/null | awk '{for (i=1;i<NF;i++) if ($i=="dev") {print $(i+1); exit}}')
# The subnet of that interface, whoever set it up ("proto kernel", "proto dhcp" with NetworkManager, ...).
NET=$(ip route show dev "$DEV" scope link 2>/dev/null | awk '$1 ~ /\// {print $1; exit}')
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active" && [ -n "$NET" ]; then
	ufw allow from "$NET" to any port "$PORT" proto tcp comment "Gridlume" >/dev/null
	say "Firewall: port $PORT opened for $NET only." "Брандмауэр: порт $PORT открыт только для $NET."
fi

# The agent on this machine: connected without a code from the interface; on a re-run it gets the new build.
if [ -f /etc/systemd/system/gridlume-agent.service ]; then
	install -m 755 "$DATA/agents/gridlume-agent-linux-$ARCH" /usr/local/bin/gridlume-agent
	systemctl try-restart gridlume-agent
elif [ "$AGENT_MODE" != none ]; then
	CODE=$(runuser -u "$CORE_USER" -- "$BIN" agent-code --mode "$AGENT_MODE")
	curl -fsSL "http://127.0.0.1:$PORT/install.sh" | sh -s -- --code "$CODE" --mode "$AGENT_MODE" --lang "$LANG_UI" ||
		say "The agent on this machine was not installed; the core works without it." "Агент на этой машине не установился; ядро работает и без него."
fi

echo
LINKS=$(runuser -u "$CORE_USER" -- "$BIN" setup-link 2>/dev/null || true)
case "$LINKS" in
	http*)
		say "Open one of these links to create the owner account:" "Откройте одну из ссылок, чтобы создать владельца:"
		printf '%s\n' "$LINKS" | sed 's/^/    /'
		say "Lost it later? sudo gridlume setup-link" "Потеряли? sudo gridlume setup-link"
		;;
	*)
		say "Gridlume is updated. Open http://<this machine>:$PORT" "Gridlume обновлён. Откройте http://<эта машина>:$PORT"
		;;
esac
