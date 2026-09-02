# Deploy Runbook — VM 107 (Docker)

The actual deployment path per Sanjaya's VM handover. The backend + MariaDB run as
Docker containers on **VM 107 (Ubuntu 24.04, 10.0.255.150)**. Public traffic + TLS
are handled by the **reverse-proxy VM 106** — we do **not** set up nginx/certbot here.

```
Internet ──► VM 106 (reverse proxy, TLS, DNS) ──► 10.0.255.150:5000 (backend)
                                                        │
                                                   MariaDB (container, internal only)
```

> Already done by Sanjaya (handover doc): Ubuntu, Docker + Compose, UFW, SSH, base
> snapshot. Our job: deploy the app + DB, then have VM 106 route to it.

## Before you start — gather
- [ ] **Public domain** for the API (e.g. `api.crownandleaf.uk`) that VM 106 will serve.
- [ ] **Frontend origin(s)** for CORS (the live site URL).
- [ ] Confirm Sanjaya will **route VM 106 → `10.0.255.150:5000`** and handle the cert.
- [ ] **Off-site backup** destination for DB dumps (+ ask Sanjaya to enable scheduled **Proxmox** backups).

## 1. SSH in and get the code
```bash
ssh kaveesha@10.0.255.150
sudo mkdir -p /opt/stclairs && sudo chown $USER:$USER /opt/stclairs
cd /opt/stclairs
git clone <repo-url> .
```

## 2. Create the production .env
Copy the template and fill in **production** values:
```bash
cp .env.example .env
nano .env            # or vim
chmod 600 .env
```
Set at least:
- `NODE_ENV=production`
- `PORT=5000`
- `FRONTEND_URL=https://<your-frontend-domain>`
- `DB_USER`, `DB_PASSWORD`, `DB_NAME`, **`DB_ROOT_PASSWORD`** (strong values)
- **`DATABASE_URL="mysql://<DB_USER>:<DB_PASSWORD>@db:3306/<DB_NAME>"`** ← host is **`db`** (the container), not localhost
- `JWT_SECRET` (long random — `openssl rand -base64 48`), `JWT_EXPIRES_IN=1d`
- All `SHOPIFY_*` (production store) and the `GRAPH_*` email vars (already tested)

> `DB_HOST` is overridden to `db` by docker-compose automatically — only
> `DATABASE_URL` needs the `@db` host set by hand.

## 3. Build, migrate, seed, run
```bash
docker compose build

# apply DB schema (starts the db container as needed)
docker compose run --rm backend npm run migrate

# first deploy only — load base teas + spices
docker compose run --rm backend npm run db:seed

# start everything in the background
docker compose up -d
```

## 4. Verify (on the VM)
```bash
docker compose ps                 # both services "Up"; db healthy
curl http://localhost:5000/health # -> {"status":"ok","db":"up"}
docker compose logs -f backend    # watch for a clean boot
```

## 5. Reverse proxy (VM 106) — coordinate with Sanjaya
Ask Sanjaya to:
- Point DNS `api.crownandleaf.uk` → the site's public IP (VM 106).
- Configure VM 106 to proxy `https://api.crownandleaf.uk` → `http://10.0.255.150:5000` with a TLS cert.

The app already trusts the proxy (`trust proxy`), so it reads real client IPs.
Then verify from outside: `curl https://api.crownandleaf.uk/health`.

## 6. Shopify webhooks (once the public URL is live)
Register against the **production** store (matching `SHOPIFY_WEBHOOK_SECRET`):
| Topic | URL |
|---|---|
| `orders/create` | `https://api.crownandleaf.uk/api/webhooks/shopify/orders-create` |
| `orders/paid`   | `https://api.crownandleaf.uk/api/webhooks/shopify/orders-paid` |

Then place one real test order and confirm it lands in `shopify_orders`.

## 7. Backups (do not skip)
Two layers:
- **Proxmox scheduled backups** of VM 107 — ask Sanjaya (the handover flags this).
- **Nightly DB dump, copied off-site.** On the VM:
```bash
sudo tee /usr/local/bin/backup-db.sh >/dev/null <<'SH'
#!/bin/bash
set -e
cd /opt/stclairs
STAMP=$(date +%F_%H%M)
source .env
docker compose exec -T db mariadb-dump -u root -p"$DB_ROOT_PASSWORD" "$DB_NAME" \
  | gzip > /var/backups/stclairs_$STAMP.sql.gz
find /var/backups -name 'stclairs_*.sql.gz' -mtime +14 -delete
# TODO: copy the dump OFF the VM (rclone / aws s3 cp to a cloud bucket)
SH
sudo mkdir -p /var/backups && sudo chmod +x /usr/local/bin/backup-db.sh
echo "30 2 * * * root /usr/local/bin/backup-db.sh" | sudo tee /etc/cron.d/stclairs-backup
```
**Test a restore before go-live** — a backup you've never restored is not a backup.

## 8. Redeploy (after the first time)
```bash
cd /opt/stclairs
git pull
docker compose build
docker compose run --rm backend npm run migrate   # if there are new migrations
docker compose up -d
```

## Go-live checklist
- [ ] `.env` complete, `NODE_ENV=production`, `chmod 600`, `DATABASE_URL` uses `@db`
- [ ] `docker compose ps` healthy; `/health` ok locally
- [ ] VM 106 routes the public domain → `10.0.255.150:5000` over HTTPS
- [ ] `https://<domain>/health` ok from outside
- [ ] Shopify webhooks registered + one real order tested
- [ ] Nightly DB dump running + **restore tested** + Proxmox backups scheduled
- [ ] SSH keys set up + password auth disabled (handover hardening item)
