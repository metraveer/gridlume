#!/bin/sh
# Gridlume agent installer.
#
#   curl -fsSL <core>/install.sh | sudo sh -s -- --code K7QM-2R9X [--mode user|readonly|root] [--lang ru|en]
#   curl -fsSL <core>/install.sh | sudo sh -s -- --upgrade     new build and updater, keeping the enrollment
#
# Modes (docs/decisions.md, "Режимы прав агента"):
#   user      own system user "gridlume" in the docker group (default)
#   readonly  own system user; Docker only through a read-only proxy run by the user "gridlume-docker"
#   root      runs as root: sees everything, and can do everything if compromised
set -eu

CORE="__GRIDLUME_CORE__"
CODE=""
MODE="user"
LANG_UI="en"
BIN=/usr/local/bin/gridlume-agent
STATE=/var/lib/gridlume-agent
UNIT=/etc/systemd/system/gridlume-agent.service
PROXY_UNIT=/etc/systemd/system/gridlume-docker-ro.service
UPDATE_UNIT=/etc/systemd/system/gridlume-agent-update
UPGRADE=0

while [ $# -gt 0 ]; do
	case "$1" in
		--code) CODE="${2:-}"; shift 2 ;;
		--mode) MODE="${2:-}"; shift 2 ;;
		--lang) LANG_UI="${2:-}"; shift 2 ;;
		--core) CORE="${2:-}"; shift 2 ;;
		--upgrade) UPGRADE=1; shift ;;
		*) echo "unknown option: $1" >&2; exit 2 ;;
	esac
done

# say <english> <russian>
say() { if [ "$LANG_UI" = ru ]; then printf '%s\n' "$2"; else printf '%s\n' "$1"; fi; }
die() { say "Error: $1" "Ошибка: $2" >&2; exit 1; }

# --upgrade: an agent that is already enrolled keeps its key, mode and core.
if [ "$UPGRADE" = 1 ]; then
	[ -f "$STATE/agent.json" ] || die "no agent here to upgrade: install it with --code" "здесь нет агента для обновления: установите его с --code"
	MODE=$(sed -n 's/.*"mode": *"\([a-z]*\)".*/\1/p' "$STATE/agent.json")
	MODE=${MODE:-user}
else
	[ -n "$CODE" ] || die "--code is required: copy the command from Gridlume" "нужен --code: скопируйте команду из Gridlume"
fi
case "$MODE" in user|readonly|root) ;; *) die "--mode must be user, readonly or root" "--mode: user, readonly или root" ;; esac
[ "$(id -u)" = 0 ] || die "run with sudo" "запустите через sudo"
[ "$(uname -s)" = Linux ] || die "only Linux is supported for now" "пока поддерживается только Linux"
command -v systemctl >/dev/null 2>&1 || die "systemd is required" "нужен systemd"
command -v curl >/dev/null 2>&1 || die "curl is required" "нужен curl"

case "$(uname -m)" in
	x86_64|amd64) ARCH=amd64 ;;
	aarch64|arm64) ARCH=arm64 ;;
	*) die "unsupported processor: $(uname -m)" "процессор не поддерживается: $(uname -m)" ;;
esac

say "Downloading the agent from $CORE ..." "Скачиваю агента с $CORE ..."
curl -fsSL "$CORE/download/gridlume-agent-linux-$ARCH" -o "$BIN.new" || die "could not download the agent" "не удалось скачать агента"
chmod 755 "$BIN.new"
mv -f "$BIN.new" "$BIN"

if [ "$MODE" = root ]; then
	RUN_USER=root
else
	RUN_USER=gridlume
	if ! id gridlume >/dev/null 2>&1; then
		useradd --system --no-create-home --home-dir "$STATE" --shell /usr/sbin/nologin gridlume
	fi
	if [ "$MODE" = user ] && getent group docker >/dev/null 2>&1; then
		usermod -aG docker gridlume
	fi
	# Switching from "user" to "readonly" must take the write access away.
	if [ "$MODE" = readonly ] && id -nG gridlume | grep -qw docker; then
		gpasswd -d gridlume docker >/dev/null
	fi
fi

# Read-only mode: a separate user in the docker group runs the proxy; the agent only reaches its socket.
PROXY_ON=0
if [ "$MODE" = readonly ] && getent group docker >/dev/null 2>&1; then
	if ! id gridlume-docker >/dev/null 2>&1; then
		useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --gid gridlume gridlume-docker
	fi
	usermod -aG docker gridlume-docker
	cat > "$PROXY_UNIT" <<PROXY
[Unit]
Description=Gridlume read-only Docker proxy
Before=gridlume-agent.service

[Service]
User=gridlume-docker
Group=gridlume
SupplementaryGroups=docker
RuntimeDirectory=gridlume-docker
RuntimeDirectoryMode=0750
ExecStart=$BIN docker-proxy
Restart=always
RestartSec=5
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
PROXY
	PROXY_ON=1
elif [ -f "$PROXY_UNIT" ]; then
	# Another mode now: the proxy is not needed any more.
	systemctl disable --now gridlume-docker-ro >/dev/null 2>&1 || true
	rm -f "$PROXY_UNIT"
fi

mkdir -p "$STATE"
systemctl stop gridlume-agent 2>/dev/null || true
if [ "$UPGRADE" = 0 ]; then
	"$BIN" enroll --core "$CORE" --code "$CODE" --mode "$MODE" --state "$STATE" || die "the core did not accept the code (expired or already used?)" "ядро не приняло код (истёк или уже использован?)"
fi
chown -R "$RUN_USER:" "$STATE"
chmod 700 "$STATE"

GROUPS_LINE=""
if [ "$MODE" = user ] && getent group docker >/dev/null 2>&1; then
	GROUPS_LINE="SupplementaryGroups=docker"
fi

cat > "$UNIT" <<EOF
[Unit]
Description=Gridlume agent
Documentation=https://github.com/metraveer/gridlume
After=network-online.target gridlume-docker-ro.service
Wants=network-online.target

[Service]
User=$RUN_USER
$GROUPS_LINE
ExecStart=$BIN run --state $STATE
Restart=always
RestartSec=5
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=read-only
PrivateTmp=yes
ReadWritePaths=$STATE

[Install]
WantedBy=multi-user.target
EOF

# Updates from the core: the agent (not root) leaves a request in its folder; this root service installs
# the build the core hands out, after checking its signature, and puts the old one back if it fails.
cat > "$UPDATE_UNIT.path" <<EOF
[Unit]
Description=Gridlume agent update request

[Path]
PathExists=$STATE/update-request

[Install]
WantedBy=paths.target
EOF
cat > "$UPDATE_UNIT.service" <<EOF
[Unit]
Description=Gridlume agent update

[Service]
Type=oneshot
ExecStart=$BIN update --from-request --state $STATE
EOF

systemctl daemon-reload
systemctl enable --now gridlume-agent-update.path >/dev/null 2>&1
if [ "$PROXY_ON" = 1 ]; then
	systemctl enable gridlume-docker-ro >/dev/null 2>&1
	systemctl restart gridlume-docker-ro
fi
systemctl enable gridlume-agent >/dev/null 2>&1
systemctl restart gridlume-agent
sleep 2
if systemctl is-active --quiet gridlume-agent; then
	say "Done: the agent is running (mode: $MODE). The machine will appear on the map in a few seconds." \
	    "Готово: агент работает (режим: $MODE). Машина появится на схеме через несколько секунд."
else
	say "The agent did not start. Logs: journalctl -u gridlume-agent" "Агент не запустился. Журнал: journalctl -u gridlume-agent"
	exit 1
fi
