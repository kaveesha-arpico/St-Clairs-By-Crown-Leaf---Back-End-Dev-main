# Deployment Guide — St. Clair's Backend

How to take this Node/Express + Prisma + MariaDB backend from the repo to a live
production server on AWS. Written for a first deployment — follow it top to bottom.

> **Golden rules**
> - **Never** put the real `.env` in git. It's gitignored; keep it that way. On the
>   server, provide config through the platform's env/secret store (see §3).
> - Run **`prisma migrate deploy`** on every release — never `migrate dev` in prod.
> - The app terminates TLS at a load balancer / reverse proxy, **not** in Node.
>   `app.set("trust proxy", 1)` is already set for exactly this.

---

## 1. What you're deploying

| Piece | Detail |
|---|---|
| Runtime | Node.js 18+ (20 LTS recommended) |
| Start command | `npm start` → `node src/server.js` |
| Default port | `PORT` env (falls back to 3000) |
| Health check | `GET /health` → `200 {status:"ok"}` (or `503` if DB is down) |
| Database | MariaDB/MySQL reachable from the app host |
| Migrations | `npm run migrate` (`prisma migrate deploy`) |
| Graceful shutdown | Handles `SIGINT`/`SIGTERM` — closes HTTP then Prisma |

---

## 2. Pre-flight checklist (before first deploy)

- [ ] `JWT_SECRET` is a long random string (e.g. `openssl rand -base64 48`) — **not** the placeholder.
- [ ] `FRONTEND_URL` is set to the real frontend domain(s), comma-separated. *If unset, CORS allows every origin.*
- [ ] `NODE_ENV=production` (enables combined access logs + Express prod mode).
- [ ] All `SHOPIFY_*` tokens are the **production** store's tokens, and `SHOPIFY_STOREFRONT_TOKEN` is the **private** (server-side) token.
- [ ] `SHOPIFY_WEBHOOK_SECRET` is set — webhooks fail-closed (reject) without it.
- [ ] `DATABASE_URL` points at the production DB (used by the Prisma **CLI** for migrations).
- [ ] The DB is reachable from the app host (security group / firewall — see §5).
- [ ] `.env` is **not** tracked: `git ls-files | grep .env` shows only `.env.example`.

---

## 3. Environment variables & secrets

The app reads config from environment variables (via `dotenv` locally). In
production, **do not copy `.env` onto the box.** Use one of:

- **AWS SSM Parameter Store** (SecureString) or **AWS Secrets Manager** — pull at
  boot or inject into the process environment. Best for secrets (DB password, JWT, Shopify tokens).
- **Platform env vars** — Elastic Beanstalk config, ECS task definition, or your
  process manager's env file with locked-down permissions (`chmod 600`).

Full list and meaning: see [`.env.example`](.env.example). The required ones are
validated at boot by `src/config/validateEnv.js` — a missing var stops startup
with a clear message.

Required in production:

```
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://your-frontend-domain.com
DB_HOST=...        DB_PORT=3306
DB_USER=...        DB_PASSWORD=...        DB_NAME=...
DATABASE_URL="mysql://USER:PASSWORD@DB_HOST:3306/DB_NAME"
JWT_SECRET=...     JWT_EXPIRES_IN=1d
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_API_VERSION=2025-07
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_...
SHOPIFY_STOREFRONT_TOKEN=shpat_...        # PRIVATE headless token
SHOPIFY_WEBHOOK_SECRET=...
```

---

## 4. Database

You need a MariaDB/MySQL the app host can reach. Two common choices:

**A) Amazon RDS for MariaDB (recommended for production)**
- Create an RDS MariaDB instance in the same VPC as the app.
- Put it in a **private subnet**; only the app's security group may reach port 3306.
- Point `DB_*` and `DATABASE_URL` at the RDS endpoint.

**B) The existing office MariaDB (staging only)**
- The current staging DB lives on the office LAN (`192.168.x.x`) — a cloud host
  cannot reach that. For real production, move to RDS or a DB with a routable address.

**Run migrations on every deploy** (after code is on the box, before/at startup):

```bash
npm ci --omit=dev          # install prod deps (runs prisma generate via postinstall)
npm run migrate            # prisma migrate deploy — applies pending migrations
npm run db:seed            # first deploy only: load base teas + spices (idempotent)
```

---

## 5. Networking & security groups (AWS)

| From | To | Port | Why |
|---|---|---|---|
| Internet | Load balancer (ALB) | 443 | HTTPS from users |
| ALB | App host | `PORT` (3000) | Forward requests |
| App host | Database | 3306 | Prisma connection |
| Shopify | ALB | 443 | Order webhooks (public internet) |

- **TLS/HTTPS:** terminate at the ALB (attach an ACM certificate) or at nginx. Never
  expose the raw Node port to the internet.
- **Trust proxy** is already configured (`app.set("trust proxy", 1)`) so rate
  limiting and Shopify `buyerIp` see the real client IP behind the ALB.

---

## 6. Deploy options

### Option A — EC2 + PM2 (simplest to reason about)

```bash
# on the EC2 box (Amazon Linux 2023 / Ubuntu)
sudo dnf install -y nodejs git     # or: apt install nodejs npm git
git clone <repo-url> && cd St-Clairs-By-Crown-Leaf---Back-End-Dev
npm ci --omit=dev
npm run migrate

# provide env vars (SSM/Secrets Manager, or a chmod 600 .env you create ON the box)
npm i -g pm2
pm2 start src/server.js --name stclairs-backend
pm2 save && pm2 startup        # restart on reboot
```

- Put an **ALB** (or nginx) in front for HTTPS, targeting the instance on `PORT`.
- Configure the ALB **target group health check** to `GET /health`.
- Deploys after the first: `git pull && npm ci --omit=dev && npm run migrate && pm2 reload stclairs-backend`.

PM2 sends `SIGINT` on `reload`, which the app handles gracefully.

### Option B — Docker / ECS / Elastic Beanstalk

There's no Dockerfile yet; a minimal one:

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev          # postinstall runs prisma generate
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/server.js"]
```

- Run migrations as a one-off task / release step: `npm run migrate` (don't bake it
  into `CMD` — you don't want every replica racing to migrate).
- Health check path: `/health`. Injection of env vars via the ECS task definition
  or Beanstalk environment properties (secrets via Secrets Manager).
- ECS/Beanstalk send `SIGTERM` on stop — handled.

---

## 7. Shopify webhooks (after the backend is live with a public HTTPS URL)

The order flow depends on Shopify calling back. Register these against your
**production** store (Settings → Notifications → Webhooks, or the Admin API),
using the live backend URL:

| Topic | Endpoint | Format |
|---|---|---|
| `orders/create` | `https://<backend>/api/webhooks/shopify/orders-create` | JSON |
| `orders/paid` | `https://<backend>/api/webhooks/shopify/orders-paid` | JSON |

- The signing secret Shopify shows must match `SHOPIFY_WEBHOOK_SECRET`.
- All webhook routes verify the HMAC signature (timing-safe) and are **idempotent**
  (deduped by `X-Shopify-Webhook-Id`), so Shopify retries are safe.
- Test a real order end-to-end once live: place an order → confirm rows land in
  `shopify_orders` / `shopify_order_line_items` and the cart flips to paid via
  `GET /api/cart-status/:cartId`.

---

## 8. Post-deploy smoke test

```bash
curl https://<backend>/health
# -> {"status":"ok","db":"up"}

curl https://<backend>/api/storefront/products?limit=1
# -> 200 with a product from the live Shopify store

curl -i -X POST https://<backend>/api/auth/login \
  -H "Content-Type: application/json" -d '{}'
# -> 400 (validation) — proves the API + validation pipeline is up
```

Then confirm from the frontend: signup/login, browse, add to cart, checkout
redirect, and the return-from-Shopify paid status.

---

## 9. Operations

- **Logs:** access logs go to stdout (`morgan combined`); errors to stderr. In
  ECS/Beanstalk they flow to CloudWatch automatically; on EC2, `pm2 logs`.
- **Restart on crash:** PM2 or the container orchestrator restarts the process.
- **Rate limits:** app-wide 300 req / 15 min per IP on `/api`; stricter 20 / 15 min
  on auth. Tune in `src/middleware/rateLimiter.js` if legitimate traffic hits them.
- **Rotating secrets:** update the secret store, then restart the app. JWTs signed
  with the old `JWT_SECRET` become invalid on rotation (users re-login).

---

## 10. Known follow-ups (not blockers)

- Phase-5 cleanup with the senior dev: the legacy `/api/payment-webhook` overlaps
  with `/api/webhooks/shopify/orders-paid` (both record paid carts); the REST
  Admin sync endpoints and redundant product tables are slated for GraphQL migration.
- Consider centralized log/metrics (CloudWatch dashboards, alarms on 5xx + health).
