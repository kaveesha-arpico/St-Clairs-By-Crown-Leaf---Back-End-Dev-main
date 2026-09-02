# Bare-Metal Deployment Guide — Office Server (London)

How to deploy this Node/Express + Prisma + **MariaDB** backend onto a physical
Linux server in the office, with the database on the **same machine**. Written to
be followed top-to-bottom on your first deployment.

> **Why the "DB fails on a different network" problem disappears here:** the
> backend and MariaDB run on the *same server*, and the backend connects to the
> DB at `127.0.0.1` (localhost). There is no roaming laptop in the path, so the
> connection can never break due to your network. Co-location **is** the fix.

> **Golden rules**
> - The database listens on **localhost only** — port 3306 is **never** exposed to the internet.
> - Only ports **80/443** (web) and **22** (SSH, ideally office-LAN only) are open.
> - The real `.env` never goes in git. Secrets live only on the server.
> - Back up the database **off the server**, automatically, and **test a restore** before go-live.

---

## 0. Gather these first (you don't have the server info yet)

Ask whoever manages the office IT/network for:

- [ ] **The server** — make/OS. Target: **Ubuntu Server 24.04 LTS** (install it if bare). Spec: 4+ cores, 8GB+ RAM, SSD.
- [ ] **SSH access** — an account + the server's LAN IP (e.g. `192.168.x.x`). You'll harden this in Part A.
- [ ] **A business internet line with a STATIC public IP.** Home/dynamic IPs won't reliably work for Shopify webhooks. (If truly unavailable, a Cloudflare Tunnel is a fallback — see Part D note.)
- [ ] **Router/firewall admin access** — to port-forward 80/443 to the server, and to give the server a fixed LAN IP.
- [ ] **A domain/subdomain for the API** — e.g. `api.crownandleaf.uk`, that you can add a DNS **A record** to.
- [ ] **A UPS** (battery) for the server + network gear — office power blips otherwise = downtime/lost orders.
- [ ] **An off-site backup destination** — a cloud bucket (e.g. S3/Backblaze) or another machine at a different site.

---

## 1. Architecture on the server

```
       Internet  (Shopify webhooks + customers' browsers)
                         │  HTTPS :443
        Office router ───┼── port-forward 80/443 ONLY ──► server
                         ▼
     ┌───────────────────────────────────────────┐
     │  Office server — Ubuntu 24.04              │
     │                                            │
     │   nginx (443, TLS)  ──►  Node app (:5000)  │
     │                              │             │
     │                              ▼             │
     │   MariaDB  bind-address = 127.0.0.1        │  ◄─ DB never leaves the box
     └───────────────────────────────────────────┘
```

---

## Part A — Prepare & harden the server

SSH in, then:

```bash
# create a non-root deploy user (skip if you already have one)
sudo adduser deploy && sudo usermod -aG sudo deploy

# --- as 'deploy', set up SSH keys from your laptop, then disable passwords ---
# in /etc/ssh/sshd_config set:  PasswordAuthentication no  and  PermitRootLogin no
sudo systemctl restart ssh

# firewall: allow SSH + web only (restrict SSH to the office LAN if you can)
sudo apt update && sudo apt install -y ufw
sudo ufw allow 22/tcp        # or: sudo ufw allow from 192.168.0.0/16 to any port 22
sudo ufw allow 80,443/tcp
sudo ufw enable

# brute-force protection + automatic security updates
sudo apt install -y fail2ban unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

---

## Part B — MariaDB (on the same box, localhost only)

```bash
sudo apt install -y mariadb-server
sudo mysql_secure_installation      # set root pw, remove test db, disallow remote root
```

**Bind it to localhost** — edit `/etc/mysql/mariadb.conf.d/50-server.cnf`:
```ini
bind-address = 127.0.0.1
```
```bash
sudo systemctl restart mariadb
```

Create the database + a **dedicated app user** (not root):
```bash
sudo mariadb
```
```sql
CREATE DATABASE stclairs CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'stclairs_app'@'localhost' IDENTIFIED BY 'CHOOSE_A_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON stclairs.* TO 'stclairs_app'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

---

## Part C — The backend app

```bash
# install Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git

# get the code
git clone <your-repo-url> stclairs-backend && cd stclairs-backend
npm ci --omit=dev            # postinstall runs `prisma generate`
```

Create `.env` on the server (see [`.env.example`](.env.example)) — **DB host is localhost**:
```ini
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://<your-frontend-domain>
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=stclairs_app
DB_PASSWORD=THE_STRONG_PASSWORD
DB_NAME=stclairs
DATABASE_URL="mysql://stclairs_app:THE_STRONG_PASSWORD@127.0.0.1:3306/stclairs"
JWT_SECRET=<long random string>
JWT_EXPIRES_IN=1d
# Shopify + Microsoft Graph email vars — copy from your working .env
```
Lock it down: `chmod 600 .env`.

Create the schema + seed:
```bash
npm run migrate      # prisma migrate deploy
npm run db:seed      # first deploy only (base teas + spices)
```

Run it under **PM2** (restarts on crash + on reboot):
```bash
sudo npm i -g pm2
pm2 start src/server.js --name stclairs-backend
pm2 save
pm2 startup          # run the command it prints
```

Check it's alive locally: `curl http://localhost:5000/health` → `{"status":"ok"}`.

---

## Part D — Public access (office networking)

1. **Give the server a fixed LAN IP** (DHCP reservation or static) so port-forwards don't drift.
2. **On the router: port-forward** external **80 → server:80** and **443 → server:443**. **Do NOT forward 3306** (or anything else).
3. **DNS:** add an **A record** `api.crownandleaf.uk` → your **static public IP**.
4. Verify from outside the office (e.g. phone on mobile data) that the domain reaches the server once nginx is up.

> No static IP available? A **Cloudflare Tunnel** (`cloudflared`) can expose the
> server over HTTPS without opening router ports or needing a static IP — a solid
> fallback for an office line. Ask me and I'll add those steps.

---

## Part E — HTTPS (nginx + free auto-renewing cert)

```bash
sudo apt install -y nginx
```
Create `/etc/nginx/sites-available/stclairs`:
```nginx
server {
    server_name api.crownandleaf.uk;
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/stclairs /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# free TLS cert (auto-renews)
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.crownandleaf.uk
```
The app already sets `trust proxy`, so it reads the real client IP behind nginx.

---

## Part F — Shopify webhooks

Once `https://api.crownandleaf.uk` is live, register these against the **production** store (Settings → Notifications → Webhooks), matching `SHOPIFY_WEBHOOK_SECRET`:

| Topic | URL |
|---|---|
| `orders/create` | `https://api.crownandleaf.uk/api/webhooks/shopify/orders-create` |
| `orders/paid` | `https://api.crownandleaf.uk/api/webhooks/shopify/orders-paid` |

Then place one real test order and confirm rows appear in `shopify_orders` and the cart flips to paid via `/api/cart-status/:cartId`.

---

## Part G — Backups (do NOT skip — this is now 100% on you)

Automated nightly dump, copied **off the server**:

```bash
sudo mkdir -p /var/backups/stclairs
sudo tee /usr/local/bin/backup-db.sh >/dev/null <<'SH'
#!/bin/bash
set -e
STAMP=$(date +%F_%H%M)
FILE=/var/backups/stclairs/stclairs_$STAMP.sql.gz
mysqldump --single-transaction --user=stclairs_app --password='THE_STRONG_PASSWORD' stclairs | gzip > "$FILE"
# keep 14 days locally
find /var/backups/stclairs -name '*.sql.gz' -mtime +14 -delete
# TODO: copy $FILE OFF-SITE (e.g. `aws s3 cp` / rclone to a cloud bucket)
SH
sudo chmod +x /usr/local/bin/backup-db.sh

# run every night at 02:30
echo "30 2 * * * root /usr/local/bin/backup-db.sh" | sudo tee /etc/cron.d/stclairs-backup
```

**Before go-live, TEST a restore** into a throwaway database:
```bash
gunzip < /var/backups/stclairs/<file>.sql.gz | sudo mariadb test_restore
```
A backup you've never restored is not a backup.

---

## Part H — Monitoring & keeping it running

- **Uptime alert:** point a free monitor (UptimeRobot) at `https://api.crownandleaf.uk/health` — it emails you if the site/DB goes down.
- **App logs:** `pm2 logs stclairs-backend` · **DB/nginx:** journalctl / `/var/log/nginx`.
- **Updates:** `unattended-upgrades` handles security patches; reboot occasionally during a quiet window.
- **Deploys after the first:** `git pull && npm ci --omit=dev && npm run migrate && pm2 reload stclairs-backend`.

---

## Part I — Go-live checklist

- [ ] Server hardened (SSH keys, no root/password login, ufw, fail2ban)
- [ ] MariaDB bound to `127.0.0.1`; app user (not root); strong password
- [ ] `.env` complete, `NODE_ENV=production`, `chmod 600`
- [ ] `npm run migrate` applied; `db:seed` run once
- [ ] PM2 running + `pm2 startup` enabled (survives reboot)
- [ ] Router forwards **only** 80/443; 3306 not exposed
- [ ] DNS A record → static public IP; reachable from outside
- [ ] HTTPS working (valid cert), `/health` returns ok over `https://`
- [ ] Shopify webhooks registered + one real order tested end-to-end
- [ ] Nightly backup running **and a restore tested**
- [ ] Uptime monitor live
- [ ] UPS protecting server + network gear

---

## Office-server risks to accept & mitigate

| Risk | Mitigation |
|---|---|
| Office power cut | UPS on server + router; consider auto-restart on power return |
| Office internet outage | Orders/webhooks pause; Shopify **retries** webhooks, so paid orders aren't lost, but the site is unreachable meanwhile |
| Single machine / disk failure | Off-site nightly backups (Part G); document a rebuild procedure |
| Exposing the office network | Only 80/443 forwarded; DB localhost-only; ideally put the server in a router DMZ / isolated VLAN |
| No auto-failover | Accept for v1; if uptime becomes critical, revisit a data-center/dedicated host |
