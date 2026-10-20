#!/usr/bin/env bash
# Installs Atlas on a fresh Ubuntu 22.04/24.04 server (x86_64 or arm64) as an always-on service:
#   Node.js 22, the app built from this checkout, a systemd service that restarts on crash and boot,
#   and Caddy in front with automatic HTTPS.
#
# Run from the repository root:   sudo bash deploy/install.sh
# Options (environment variables):
#   ATLAS_DOMAIN=atlas.example.com   use your own domain (DNS A record -> this server). Default: <ip>.sslip.io
#   ATLAS_DATA_MODE=live             default demo
# Re-running is safe: it rebuilds and restarts, and keeps an existing .env and database.
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Run with sudo: sudo bash deploy/install.sh" >&2; exit 1; }
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_USER="${SUDO_USER:-$(stat -c %U "$REPO")}"
DATA_DIR=/var/lib/atlas
ENV_FILE="$REPO/.env"
say() { printf '\n\033[1;33m== %s\033[0m\n' "$*"; }

say "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https openssl

if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]]; then
  say "Installing Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if ! command -v caddy >/dev/null; then
  say "Installing Caddy (HTTPS reverse proxy)"
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

say "Building Atlas"
mkdir -p "$DATA_DIR"
chown "$RUN_USER" "$DATA_DIR"
sudo -u "$RUN_USER" bash -c "cd '$REPO' && npm ci --no-audit --no-fund && npm run build"

if [[ ! -f "$ENV_FILE" ]]; then
  say "Creating $ENV_FILE with a new access token"
  TOKEN="$(openssl rand -hex 20)"
  sed -e "s|^ATLAS_DATA_MODE=.*|ATLAS_DATA_MODE=${ATLAS_DATA_MODE:-demo}|" \
      -e "s|^HOST=.*|HOST=127.0.0.1|" \
      -e "s|^ATLAS_DB_PATH=.*|ATLAS_DB_PATH=$DATA_DIR/atlas.db|" \
      -e "s|^ATLAS_ACCESS_TOKEN=.*|ATLAS_ACCESS_TOKEN=$TOKEN|" \
      "$REPO/.env.example" > "$ENV_FILE"
  chown "$RUN_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi
grep -q '^ATLAS_ACCESS_TOKEN=.\+' "$ENV_FILE" || { echo "ATLAS_ACCESS_TOKEN is empty in $ENV_FILE; refusing to expose Atlas without it." >&2; exit 1; }

say "Installing the atlas service"
cat > /etc/systemd/system/atlas.service <<UNIT
[Unit]
Description=Atlas terminal
After=network-online.target
Wants=network-online.target

[Service]
User=$RUN_USER
WorkingDirectory=$REPO/apps/server
ExecStart=$(command -v node) $REPO/node_modules/tsx/dist/cli.mjs --env-file-if-exists=$ENV_FILE src/index.ts
Restart=always
RestartSec=3
Environment=NODE_NO_WARNINGS=1

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable atlas
systemctl restart atlas

say "Configuring HTTPS"
IP="$(curl -fsS4 https://api.ipify.org || true)"
DOMAIN="${ATLAS_DOMAIN:-${IP//./-}.sslip.io}"
[[ -n "$DOMAIN" && "$DOMAIN" != ".sslip.io" ]] || { echo "Could not detect the public IP; set ATLAS_DOMAIN and re-run." >&2; exit 1; }
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
	encode gzip
	reverse_proxy 127.0.0.1:8787
}
CADDY
systemctl reload caddy || systemctl restart caddy

# Oracle Cloud's Ubuntu images ship iptables rules that only allow SSH. Open 80/443 before the REJECT rule.
if iptables -S INPUT 2>/dev/null | grep -q -- '-j REJECT'; then
  say "Opening ports 80 and 443 in the server firewall"
  for p in 80 443; do
    iptables -C INPUT -p tcp --dport $p -j ACCEPT 2>/dev/null || iptables -I INPUT 5 -p tcp --dport $p -m state --state NEW -j ACCEPT
  done
  command -v netfilter-persistent >/dev/null && netfilter-persistent save || true
fi
command -v ufw >/dev/null && ufw status | grep -q 'Status: active' && { ufw allow 80/tcp; ufw allow 443/tcp; } || true

say "Checking"
for i in $(seq 1 30); do curl -fsS http://127.0.0.1:8787/ -o /dev/null && break; sleep 1; done
systemctl --no-pager --lines=0 status atlas | head -3

cat <<DONE

Atlas is installed and will restart on its own after crashes and reboots.

  Open:          https://$DOMAIN
  Access token:  $(grep '^ATLAS_ACCESS_TOKEN=' "$ENV_FILE" | cut -d= -f2-)
  Settings:      $ENV_FILE   (then: sudo systemctl restart atlas)
  Logs:          journalctl -u atlas -f
  Update:        sudo bash $REPO/deploy/update.sh

If the page does not load, the cloud provider's own firewall must allow TCP 80 and 443
(Oracle: VCN > Security List > Ingress rules; Google: VPC firewall rule). HTTPS starts
working within a minute of that.
DONE
