# St. Clair's — Go-Live Checklist

One place for everything left before launch. Grouped by owner + priority.
Tick as you go.

---

## 🔴 MUST DO before launch (Shopify — you)

- [ ] **Taxes — UK VAT** · Settings → Taxes and duties → United Kingdom
  - Is the company **VAT-registered**? If no → nothing to charge, leave it.
  - If yes → enter VAT number. **Teas are zero-rated (0%) food** in the UK — set a
    tea collection override to 0%; keep non-food (packaging/merch) at 20%.
  - ⚠️ Confirm exact rates with the **accountant** before finalising.

- [x] **Policies** · Settings → Policies — Refund/Return, Privacy, Terms, Shipping
  added. ✅

- [ ] **Email authentication** (almost done)
  - [x] Sender set to `orders@crownandleaf.uk`.
  - [x] Sanjaya added the **6 CNAME** records → Shopify shows **Authenticated** ✅.
  - [ ] Add the **DMARC** TXT record (Sanjaya): `_dmarc` →
    `v=DMARC1; p=none; rua=mailto:contact@crownandleaf.uk` (monitor-only, safe).

- [ ] **Confirm the Monzo payout account (...9144)** is the company's — with Sanjaya.
  Payments are LIVE; real money routes there.

- [ ] **Products final check** — every tea + "Custom Blend Tea":
  - [ ] Correct **price**
  - [ ] **SKU** set on every variant (TeaMatrix machine falls back to SKU when
    product_id is null — don't leave any blank)
  - [ ] **Image**
  - [ ] **Inventory / stock** tracked and in stock

- [ ] **Confirm you're on a PAID Shopify plan** (not a trial) — can't sell on a trial.

- [ ] **Markets** = United Kingdom / **GBP** primary (after the accidental
  International zone).

---

## 🔴 MUST DO before launch (our backend / system)

- [ ] **Remove test data** before real customers arrive:
  - Test order **#1042** (`shopify_order_id 7602572656937`)
  - Test customer **portaltest1@crownandleaf.uk**
  - (Cleanup SQL pattern is the same one used for the `820982911946154508` row.)

- [ ] **Decide + (recommended) rotate the exposed Shopify webhook secret** (`f016…`)
  before the TeaMatrix machine leaves observe-only. Real risk: forged `orders/paid`
  → paid order row → machine feed → dispensed tea. Zero-downtime rotation via the
  custom-app move is ready to apply on your word.

---

## 🟡 CLEANUP / nice-to-have (Shopify — you)

- [ ] **Checkout branding** · Settings → Checkout → Customize — logo + colours.
- [ ] **Email branding** · Settings → Brand — upload logo (flows into order emails).
- [ ] **"Show sign-in links" → OFF** · Settings → Checkout → Customer accounts —
  removes Shopify's competing login (you use your own account system).

---

## ✅ VERIFY before flipping the switch

- [ ] **One real end-to-end order**: buy the cheapest tea with a **real card** →
  confirm it (a) shows in Shopify Orders, (b) payout appears toward Monzo, (c) flows
  through our `orders/paid` webhook into order history + the machine feed → then
  **refund** it. This tests payment + shipping + webhooks + machine in one go.

---

## 👥 FRONTEND session

- [x] Build **profile page + order history + reorder** against the API contract —
  done & verified end-to-end (order #1042 returns correctly). ✅
- [x] `buyer-identity` prefill after login — wired. ✅
- [x] Static export confirmed working (HostGator-ready). ✅

---

## 🟠 UAT environment (uat.crownandleaf.uk — in progress)

- [x] Backend CORS entry for `https://uat.crownandleaf.uk` — **verify** it's live:
  `curl -s -D - -o /dev/null -H "Origin: https://uat.crownandleaf.uk" https://api.crownandleaf.uk/api/tea-options | grep -i access-control-allow-origin`
- [x] Frontend built & deployed to `/opt/stclairs-frontend/out` on VM 107 (static). ✅
- [x] **Static folder served on port 8080** on VM 107 (Sanjaya — separate from backend's 5000). ✅
- [x] **NPM proxy host** for `uat.crownandleaf.uk` → `10.0.255.150:8080` + SSL (Sanjaya). ✅
  - Note: reverse proxy is **Nginx Proxy Manager on VM 106** (not Caddy).
- [ ] Confirm the UAT site fully works end-to-end (products load, login, order history) —
  which also proves CORS in practice.

---

## ✅ ALREADY DONE (no action)

- Payments live (Shopify Payments, Monzo payouts)
- Shipping (UK zone, Standard £3.95, fulfilment location set)
- Guest checkout works; account system not blocked
- Shopify webhooks (orders/create, orders/paid, orders/updated) → our backend,
  HMAC-verified, API 2025-07
- Customer-account **backend** APIs (order history + reorder) built & live-verified
- Machine API key rotated; TeaMatrix feed live

---

## 🕓 POST-LAUNCH (can wait)

- Custom-blend reorder (v1 skips blend lines)
- Password-reset flow (doesn't exist yet)
- DB backups + off-site copy + Proxmox backups + SSH key hardening
