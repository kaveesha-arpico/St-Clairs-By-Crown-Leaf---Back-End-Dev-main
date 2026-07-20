# Tea Project Backend — St. Clair's by Crown Leaf

REST API for the St. Clair's / Crown Leaf tea business. It covers two areas:

1. **Supply-chain management** — plantations, fields, factories, batches, inventory, locations, products.
2. **E-commerce** — customer accounts, orders, addresses, custom tea blends, and a Shopify storefront integration (product sync, checkout, payment webhooks).

## Tech stack

- **Node.js / Express 4** — HTTP API
- **MariaDB / MySQL** via **Prisma ORM 7** (with the `@prisma/adapter-mariadb` driver adapter)
- **JWT** (`jsonwebtoken`) + **bcrypt** — authentication
- **express-validator** — request validation
- **helmet**, **morgan**, **express-rate-limit** — security headers, logging, throttling
- **shopify-api-node** (Admin API) + Shopify Storefront GraphQL — e-commerce

## Getting started

### Prerequisites
- Node.js 18+ and npm
- A MariaDB or MySQL database

### Setup
```bash
# 1. Install dependencies (also runs `prisma generate` via postinstall)
npm install

# 2. Configure environment
cp .env.example .env      # then edit .env with your real values

# 3. Create the schema (fresh database — applies the baseline migration)
npm run migrate           # prisma migrate deploy

# 4. Load reference data (base teas + spices for the blend builder)
npm run db:seed           # idempotent — safe to re-run

# 5. Run
npm start                 # starts with nodemon on the configured PORT (default 3000)
```

On boot the server validates required env vars (see `src/config/validateEnv.js`) and
fails fast with a clear message if any are missing.

### Environment variables
See [`.env.example`](.env.example) for the full list. Summary:

| Variable | Required | Purpose |
|---|---|---|
| `PORT` | no (default 3000) | HTTP port |
| `FRONTEND_URL` | no | Comma-separated allowed CORS origins; unset = allow all |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | yes | DB connection (used by the Prisma runtime adapter) |
| `DATABASE_URL` | yes (for Prisma CLI) | Connection string used by `prisma migrate` / `db pull` |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | yes | Token signing |
| `SHOPIFY_STORE_DOMAIN` / `SHOPIFY_API_KEY` / `SHOPIFY_API_PASSWORD` | yes | Shopify Admin API |
| `SHOPIFY_STOREFRONT_TOKEN` / `SHOPIFY_STOREFRONT_ACCESS_TOKEN` | yes | Shopify Storefront API |
| `SHOPIFY_WEBHOOK_SECRET` | for webhooks | HMAC verification of `/api/payment-webhook` |

## Database & Prisma

The data layer uses **Prisma ORM**. `prisma/schema.prisma` is the source of truth;
the client is generated into `node_modules/@prisma/client`.

### Migrations (versioned)
```bash
# apply pending migrations (staging/prod — no shadow DB needed)
npm run migrate                       # = prisma migrate deploy

# after changing schema.prisma, generate the next migration:
npx prisma migrate diff --from-config-datasource \
  --to-schema prisma/schema.prisma --script > prisma/migrations/<name>/migration.sql

# re-introspect an existing DB into schema.prisma
npm run db:pull                       # = prisma db pull
```

### Seeding
`prisma/seed.js` populates the `base_teas` and `spices` lookup tables that
`GET /api/tea-options` serves to the blend builder. It only inserts names that
are missing, so re-running it is a safe no-op.

```bash
npm run db:seed                       # = prisma db seed
```

### Prisma 7 notes (important — these differ from most tutorials)
- The generator is `prisma-client-js` (classic CommonJS output). The newer
  `prisma-client` generator emits TypeScript/ESM and does **not** work with this
  project's `require()`-based CommonJS.
- Prisma 7 has **no `url` in the datasource**; the runtime connects through a
  **driver adapter** (`@prisma/adapter-mariadb`) configured in `src/config/prisma.js`.
  `DATABASE_URL` is used only by the Prisma **CLI** (via `prisma.config.ts`).

> Prisma is the single source of truth for both schema and seed data. The old
> hand-run `db/schema.sql` + `db/migrations/*.sql` were removed once the baseline
> migration superseded them — keeping a second copy of the schema only invited drift.

## Scripts

```bash
npm start        # run the server (nodemon)
npm test         # run the smoke tests (node:test)
npm run migrate  # apply Prisma migrations (prisma migrate deploy)
npm run db:seed  # load base teas + spices (idempotent)
npm run db:pull  # re-introspect the DB into schema.prisma
```

## Authentication

- `POST /api/auth/signup` and `POST /api/auth/login` are public. Login returns a JWT.
- Send it as `Authorization: Bearer <token>` on protected routes.
- **Protected (JWT required):** the admin/CRUD resources — `customers`, `addresses`,
  `orders`, `order-addresses`, `plantation`, `field`, `factory`, `batch`, `inventory`,
  `location`, `product`.
- **Public:** auth, storefront (`checkout`, tea options/products, Shopify product listing,
  `cart-status`) and the Shopify `payment-webhook` (verified by HMAC, not JWT).

## API overview

All routes are prefixed with `/api`. Admin resources follow standard CRUD:
`POST /x`, `GET /x`, `GET /x/:id`, `PUT /x/:id`, `DELETE /x/:id`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/signup`, `POST /auth/login` |
| Customers | CRUD on `/customers` |
| Addresses | CRUD on `/addresses`, `GET /addresses/customer/:customerId` |
| Orders | CRUD on `/orders` |
| Order↔Address | `POST /order-addresses`, `GET /order-addresses/:orderId`, `DELETE /order-addresses/:orderId/:addressId` |
| Supply chain | CRUD on `/plantation`, `/field`, `/factory`, `/batch`, `/inventory`, `/location`, `/product` |
| Tea blends | `GET /tea-options`, `POST /create-custom-blend` |
| Tea products | `POST /tea-product-create`, `GET /get-tea-products`, `GET /get-tea-shopify-products`, `GET /get-tea-shopify-products-variants` |
| Storefront catalog | `GET /storefront/products` |
| Storefront cart | `POST /storefront/cart`, `GET /storefront/cart?id=`, `POST /storefront/cart/lines`, `PATCH /storefront/cart/lines`, `DELETE /storefront/cart/lines` |
| Shopify | `POST /checkout`, `POST /create-shopify-product`, `GET /get-shopify-store-products`, `GET /get-shopify-products`, `GET /get-order-list`, `POST /payment-webhook`, `GET /cart-status/:cartId`, `GET /get-all-orders` |

## Project structure

```
src/
  app.js               # Express app: middleware, route mounting, error handler
  server.js            # Entry point: env validation, DB ping, listen
  config/
    prisma.js          # Shared Prisma Client (MariaDB driver adapter)
    validateEnv.js     # Boot-time env var validation
  controllers/         # Request handlers (one per resource)
  routes/              # Route definitions (validation + async wrapping)
  middleware/          # auth, validation, rate limiting, webhook HMAC, asyncHandler
  validators/schemas.js# express-validator rule sets
  lib/shopify.js       # shopify-buy storefront client
prisma/
  schema.prisma        # Source of truth for the data model (22 models)
  migrations/          # Versioned schema history (0_init = baseline)
  seed.js              # Idempotent reference data (base teas, spices)
prisma.config.ts       # Prisma CLI config (loads DATABASE_URL, seed command)
tests/
  smoke.test.js        # Middleware-level smoke tests
```

## Shopify storefront (Storefront GraphQL API)

`src/lib/shopifyStorefront.js` is the shared client for all buyer-facing Shopify
reads and cart operations. Two things are easy to get wrong here:

- **Token/header pairing.** The Headless channel issues a *private* token (for
  server-side use, sent as `Shopify-Storefront-Private-Token`) and a *public*
  token (for browsers, sent as `X-Shopify-Storefront-Access-Token`). This backend
  uses the **private** token. Sending it in the public header returns `401`.
- **Shopify owns prices.** Cart totals, availability and line costs all come from
  Shopify. Neither the frontend nor this backend should calculate money.

Cart and variant IDs are Shopify GIDs — opaque strings that must be passed back
verbatim. The cart GID contains a `?key=...` component, so it travels as a query
parameter or body field, never as a URL path segment, and must never be split.

Variant IDs supplied by a client are validated against Shopify (exists +
`availableForSale`) before any cart is created or modified.

## Notes

- Payment confirmations are stored in the `paid_carts` table (durable across restarts
  and multiple instances), consumed on read and pruned after 15 minutes.
- The global error handler logs full detail server-side and never leaks internals to clients.
