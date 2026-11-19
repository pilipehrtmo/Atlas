# Running Atlas 24/7 on a free server

Atlas needs one small always-on Linux server with a disk (for its SQLite database). The scripts in `deploy/`
turn a fresh Ubuntu server into a running Atlas with HTTPS, password protection and automatic restarts.

Free options (check current terms when you sign up; all ask for a card to verify identity):

| Provider | What's free | Notes |
|---|---|---|
| Oracle Cloud Always Free | Ampere A1 VM (up to 4 cores / 24 GB) or 2 small AMD VMs | Recommended. Pick the "Always Free eligible" shape. |
| Google Cloud free tier | one e2-micro VM in us-west1, us-central1 or us-east1 | 1 GB RAM is enough for Atlas. |
| Render free web service | not a VM | Sleeps after idle time and loses the database on restart; not suitable for 24/7. |

## Oracle Cloud, step by step

1. Sign up at cloud.oracle.com (Always Free account). Choose a home region near you; it can't be changed later.
2. Compute → Instances → Create instance. Image: **Canonical Ubuntu 24.04**. Shape: an **Always Free eligible**
   one (VM.Standard.A1.Flex with 1 OCPU / 6 GB is plenty). Under "Add SSH keys", download the generated private key.
   Create.
3. Open ports 80 and 443: on the instance page, open its subnet → Security List → Add Ingress Rules:
   source `0.0.0.0/0`, TCP, destination port `80`; repeat for `443`.
4. Connect from Windows PowerShell (OpenSSH is built in):
   `ssh -i path\to\ssh-key.key ubuntu@<public IP>`
5. Give the server read-only access to the private repo with a deploy key:
   ```bash
   ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519 && cat ~/.ssh/id_ed25519.pub
   ```
   Copy the printed line into GitHub → the Atlas repo → Settings → Deploy keys → Add deploy key (leave "Allow write
   access" off).
6. Install:
   ```bash
   sudo apt-get update && sudo apt-get install -y git
   git clone git@github.com:pilipehrtmo/Atlas.git atlas && cd atlas
   sudo bash deploy/install.sh
   ```
   The script prints the address (`https://<ip-with-dashes>.sslip.io`) and the access token. Open the address and
   paste the token on the sign-in screen.

## Day to day

- Settings live in `~/atlas/.env` (data mode, API keys, token). After editing: `sudo systemctl restart atlas`.
- Update to the latest code: `sudo bash ~/atlas/deploy/update.sh`.
- Logs: `journalctl -u atlas -f`.
- Use your own domain: point an A record at the server, then `sudo ATLAS_DOMAIN=atlas.example.com bash deploy/install.sh`.

## Security notes

- The server listens only on 127.0.0.1; Caddy is the only thing exposed, over HTTPS (Let's Encrypt, automatic).
- Every API call needs the access token. Keep it private; change it in `.env` to sign everyone out.
- API keys stay in `.env` on the server and are never sent to the browser.
- Data provider terms still apply: most free tiers (Alpha Vantage, FRED's third-party series) are for personal use,
  so keep the terminal private rather than sharing it publicly.
