#!/usr/bin/env bash
# Pulls the latest code, rebuilds and restarts Atlas. Run: sudo bash deploy/update.sh
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "Run with sudo: sudo bash deploy/update.sh" >&2; exit 1; }
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_USER="${SUDO_USER:-$(stat -c %U "$REPO")}"
sudo -u "$RUN_USER" bash -c "cd '$REPO' && git pull --ff-only && npm ci --no-audit --no-fund && npm run build"
systemctl restart atlas
echo "Updated to $(sudo -u "$RUN_USER" git -C "$REPO" log --oneline -1)"
