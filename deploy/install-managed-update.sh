#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run this installer with sudo." >&2
  exit 1
fi

REPO_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
DEPLOY_USER="${2:-${SUDO_USER:-}}"
if [[ -z "$DEPLOY_USER" || "$DEPLOY_USER" == "root" ]]; then
  echo "A non-root deployment user is required as the second argument." >&2
  exit 1
fi
if [[ ! -d "$REPO_DIR/.git" || ! -f "$REPO_DIR/docker-compose.yml" ]]; then
  echo "Repository or docker-compose.yml not found at $REPO_DIR" >&2
  exit 1
fi
for required_command in git docker python3 flock systemctl runuser; do
  command -v "$required_command" >/dev/null || { echo "Required command not found: $required_command" >&2; exit 1; }
done
if ! runuser -u "$DEPLOY_USER" -- docker info >/dev/null 2>&1; then
  echo "$DEPLOY_USER cannot access Docker. Add the user to the docker group, sign in again, and rerun this installer." >&2
  exit 1
fi

STATE_DIR="$REPO_DIR/data/deployment-update"
mkdir -p "$STATE_DIR"
chown "$DEPLOY_USER" "$STATE_DIR"
chmod 750 "$STATE_DIR"

cat > /etc/systemd/system/myresearchmate-update.service <<EOF
[Unit]
Description=Update and rebuild MyResearchMate
After=docker.service network-online.target
Wants=network-online.target
Requires=docker.service

[Service]
Type=oneshot
User=$DEPLOY_USER
WorkingDirectory=$REPO_DIR
ExecStart=$REPO_DIR/deploy/run-managed-update.sh $REPO_DIR $STATE_DIR
TimeoutStartSec=0
EOF

cat > /etc/systemd/system/myresearchmate-update.path <<EOF
[Unit]
Description=Watch for authorized MyResearchMate update requests

[Path]
PathExists=$STATE_DIR/request.json
Unit=myresearchmate-update.service

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now myresearchmate-update.path
printf '{"installed": true}\n' > "$STATE_DIR/installed.json"
chmod 664 "$STATE_DIR/installed.json"
chown "$DEPLOY_USER" "$STATE_DIR/installed.json"

echo "Managed updates are ready. Future updates can be started from the Managers page."
