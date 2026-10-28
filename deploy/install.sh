#!/bin/sh
# Gridlume agent installer.
#
#   curl -fsSL <core>/install.sh | sudo sh -s -- --code K7QM-2R9X [--mode user|readonly|root] [--lang ru|en]
#
# Modes (docs/decisions.md, "Режимы прав агента"):
#   user      own system user "gridlume" in the docker group (default)
#   readonly  own system user without write access to Docker
#   root      runs as root: sees everything, and can do everything if compromised
set -eu

CORE="__GRIDLUME_CORE__"
CODE=""
MODE="user"
LANG_UI="en"
BIN=/usr/local/bin/gridlume-agent
STATE=/var/lib/gridlume-agent
UNIT=/etc/systemd/system/gridlume-agent.service

while [ $# -gt 0 ]; do
	case "$1" in
		--code) CODE="${2:-}"; shift 2 ;;
		--mode) MODE="${2:-}"; shift 2 ;;
		--lang) LANG_UI="${2:-}"; shift 2 ;;
		--core) CORE="${2:-}"; shift 2 ;;
		*) echo "unknown option: $1" >&2; exit 2 ;;
	esac
done

# say <english> <russian>
say() { if [ "$LANG_UI" = ru ]; then printf '%s\n' "$2"; else printf '%s\n' "$1"; fi; }
die() { say "Error: $1" "Ошибка: $2" >&2; exit 1; }

[ -n "$CODE" ] || die "--code is required: copy the command from Gridlume" "нужен --code: скопируйте команду из Gridlume"
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

mkdir -p "$STATE"
systemctl stop gridlume-agent 2>/dev/null || true
"$BIN" enroll --core "$CORE" --code "$CODE" --mode "$MODE" --state "$STATE" || die "the core did not accept the code (expired or already used?)" "ядро не приняло код (истёк или уже использован?)"
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
After=network-online.target
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

systemctl daemon-reload
systemctl enable --now gridlume-agent >/dev/null 2>&1
sleep 2
if systemctl is-active --quiet gridlume-agent; then
	say "Done: the agent is running (mode: $MODE). The machine will appear on the map in a few seconds." \
	    "Готово: агент работает (режим: $MODE). Машина появится на схеме через несколько секунд."
else
	say "The agent did not start. Logs: journalctl -u gridlume-agent" "Агент не запустился. Журнал: journalctl -u gridlume-agent"
	exit 1
fi
