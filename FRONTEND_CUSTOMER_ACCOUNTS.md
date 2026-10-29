# Customer Accounts — Frontend API Contract

For the frontend session. Everything needed to build the **profile page**, **order
history**, and **reorder**, plus the **logged-in checkout prefill**. All endpoints
are live on `https://api.crownandleaf.uk`.

## Auth model

- Register/login return a **JWT**. Store it (e.g. `localStorage`) and send it on every
  account request as `Authorization: Bearer <token>`.
- On page reload the login response is gone — call `GET /api/auth/me` with the stored
  token to re-hydrate the user.
- A missing/invalid/expired token → `401 { "message": "..." }`. On a 401, treat the
  user as logged out and send them to login.

---

## 1. Register — `POST /api/auth/signup`

```json
// body
{ "first_name": "Ann", "last_name": "Lee", "email": "ann@example.com", "password": "secret" }
```
```json
// 201
{ "message": "Customer registered successfully.", "token": "<jwt>",
  "user": { "userId": 12, "email": "ann@example.com", "first_name": "Ann" } }
```
- `409 { "message": "Email already in use." }` if the email is taken.
- `400` if a field is missing.
- Returns a token, so no separate login call is needed right after signup.

## 2. Login — `POST /api/auth/login`

```json
// body
{ "email": "ann@example.com", "password": "secret" }
```
```json
// 200
{ "message": "Login successful.", "token": "<jwt>",
  "user": { "userId": 12, "email": "ann@example.com", "first_name": "Ann" } }
```
- `401 { "message": "Invalid email or password." }` on bad credentials.

## 3. Profile — `GET /api/auth/me`  *(Bearer)*

Powers the **read-only** profile page (name, email, contact). No edit endpoint —
profile is display-only by design.

```json
// 200
{ "user": { "id": 12, "first_name": "Ann", "last_name": "Lee",
            "email": "ann@example.com", "contact_number": "+44..." } }
```

## 4. Order history — `GET /api/account/orders?limit=&offset=`  *(Bearer)*

The signed-in user's own orders (matched by their account email), newest first.
`limit` default 20 / max 100, `offset` default 0.

```json
// 200
{
  "orders": [
    {
      "id": "7602572656937",              // Shopify order id (string) — use for reorder
      "order_number": "#1042",
      "placed_at": "2026-09-18T06:32:25.000Z",
      "financial_status": "paid",          // paid | pending | refunded | ...
      "fulfillment_status": null,          // unfulfilled | fulfilled | null
      "cancelled": false,                  // show a "Cancelled" badge + disable reorder when true
      "currency": "GBP",
      "subtotal": "25.00",
      "total": "25.00",
      "item_count": 1,
      "items": [
        { "title": "Black Tea-Lakshapana", "variant_title": "50g", "sku": "1000",
          "quantity": 1, "price": "25.00", "is_custom_blend": false,
          "blend_status": null, "traces": [] },
        { "title": "Custom Blend Tea", "variant_title": "Laxapana PEKOE", "sku": null,
          "quantity": 2, "price": "12.50", "is_custom_blend": true,
          "blend_status": { "stage": "being_made", "label": "Being blended",
                            "updated_at": "2026-10-16T11:42:40.874Z" },
          "traces": [
            { "bottle": 1, "of": 2, "url": "https://trace.crownandleaf.uk/t/7Kq2xM9a" }
          ] }
      ]
    }
  ],
  "count": 1,
  "has_more": false
}
```
- New customer with no orders → `{ "orders": [], "count": 0, "has_more": false }`.
- Money fields are **strings** already formatted to 2dp.
- Only the user's **own** orders are ever returned — the query is scoped to the token's
  email server-side; there's no way to request someone else's.

### Custom-blend lines: `blend_status` and `traces` ✅ live

Both are present on **every** item; on shelf products they are `null` / `[]`.

**`blend_status`** — where the blend is in the tea machine. `null` until the shop's
machine has seen the order (normally within a minute of payment), so render nothing
for `null`, not "unknown". It also stays `null` **forever** on a line the machine can
never make (a line whose Blend ID is missing or unknown — staff follow those up), and
on every shelf product. `stage` is one of exactly four values; `label` is a
ready-made English string you may use or replace:

| `stage` | `label` | Meaning |
|---|---|---|
| `received` | Order received | Paid; the shop has it; not started |
| `being_made` | Being blended | The machine is working on it (also while retrying a failed run) |
| `ready` | Ready | Blended; the shop will dispatch it |
| `cancelled` | Cancelled | Cancelled/refunded in Shopify, or the shop could not make it |

`updated_at` is when the stage last changed (`null` while `received` and untouched).
A cancelled or refunded order is `cancelled` whatever the machine did. Do **not**
infer stage from `financial_status` — use this field.

**`traces`** — "Trace your tea", one entry per **bottle** that has a QR link. A line of
2 units has up to 2 entries (`bottle` 1 and 2 `of` 2), which can arrive at different
times. A bottle without a link yet is simply absent — show nothing, not an error.
- Open `url` in a new tab, exactly as given. Don't rewrite, shorten or proxy it; the
  QR printed on the bottle holds the same link.
- Treat `url` as untrusted text when rendering: set `href` from it, never inject it
  as HTML.
- Optional: draw a QR from `url` client-side with any QR library; no image is sent.
- The trace page shows no customer data, so linking to it from a signed-in page leaks
  nothing.

### Custom-blend lookups now include grams

`GET /api/custom-blends/:ref` (and the create response) carry a `grams` block —
the recipe resolved against the pack weight, e.g. 37.5 g base + 10 g lemongrass +
2.5 g rose petals = 50 g. Show those rather than re-deriving from percentages.

### UAT and local checkouts must be tagged as test orders

The backend hides test orders from the tea machine. On UAT **and localhost**, set
the cart-level attribute `{ key: "source", value: "uat" }` via
`POST /api/storefront/cart/attributes` (or on `POST /api/storefront/cart`) before
checkout. Full details in `FRONTEND_CUSTOM_BLENDS.md` §4.

## 5. Reorder — `POST /api/account/orders/:id/reorder`  *(Bearer)*

`:id` is the `id` from an order above. Rebuilds a Shopify cart from that order and
returns a checkout URL (with the user's email already prefilled).

```json
// 200 — at least one item added
{
  "success": true,
  "checkout_url": "https://enc2fm-hd.myshopify.com/cart/c/...",
  "cart_id": "gid://shopify/Cart/...",
  "added":   [ { "title": "Black Tea-Lakshapana – 50g", "quantity": 1 } ],
  "skipped": [ { "title": "Custom Blend Tea", "reason": "custom_blend" } ]
}
```
- **Redirect** the browser to `checkout_url`.
- `skipped[].reason` ∈ `custom_blend | discontinued | sold_out | no_variant`. If
  `skipped` is non-empty, surface e.g. *"2 of 3 items added — 1 no longer available."*
- **Nothing reorderable** → `200 { "success": false, "reason": "no_items_available",
  "added": [], "skipped": [...] }`. Show the skipped reasons; don't redirect.
- `404 { "success": false, "message": "Order not found." }` if the id isn't this
  user's order.
- **v1 limitation:** custom-blend lines are skipped (they carry a recipe that needs
  re-resolving). Full custom-blend reorder is a later pass.

## 6. Checkout prefill after login — `POST /api/storefront/cart/buyer-identity`  *(Bearer)*

This is how you get **"logged-in = prefilled checkout, guest = blank."** After a user
logs in **and** has an active cart, call this once to stamp their email onto the cart;
Shopify's hosted checkout then opens with the email filled in.

```json
// body
{ "cartId": "gid://shopify/Cart/..." }
```
- Email is taken from the **token**, never the body — a client can't set an arbitrary
  identity.
- `401` if not logged in (so only call it for authenticated users). `404` if the cart
  is unknown/expired.
- For **guests**, simply don't call it — their checkout stays blank. That's the whole
  split; no extra work.

---

## 7. Guest order tracking — `POST /api/orders/lookup`  *(public, no token)*

For visitors without an account. The visitor proves they own the order by giving
**both** its number and the email it was placed with.

```json
// body
{ "order_number": "#1044", "email": "amal@example.com" }
```
- `order_number` with or without the leading `#`, spaces trimmed.
- `email` matched case-insensitively.

```json
// 200 — exactly one order, same shape as an item of GET /api/account/orders
{ "success": true, "order": { "id": "…", "order_number": "#1044", "placed_at": "…",
    "financial_status": "paid", "fulfillment_status": null, "cancelled": false,
    "currency": "GBP", "subtotal": "12.50", "total": "12.50", "item_count": 1,
    "items": [ { "title": "Custom Blend Tea", "variant_title": "…", "sku": null,
                 "quantity": 1, "price": "12.50", "is_custom_blend": true,
                 "blend_status": { "stage": "ready", "label": "Ready", "updated_at": "…" },
                 "traces": [ { "bottle": 1, "of": 1, "url": "https://trace.crownandleaf.uk/t/…" } ] } ]
} }
```
- `items[].blend_status` and `traces` follow §4 exactly.
- No email, name or address is in the response.

```json
// 404 — unknown number, wrong email, or any other miss: ALWAYS this one body
{ "success": false, "message": "We couldn't find an order with that number and email." }
```
Render one "not found" state. Don't tell the user which half was wrong — the
message is identical on purpose so the pair can't be probed.

- `400` with `errors[]` only for a malformed body (missing field, invalid email).
- `429` after 20 attempts per IP in 15 minutes: "please wait a few minutes".
  A genuine customer never sees this; don't auto-retry.
- This route needs no token even when the visitor happens to be signed in.

## Behaviour notes

- **Guest orders exist but never show here.** Every order is stored (the tea-dispensing
  machine needs them), but order history only surfaces orders whose email matches the
  signed-in account. A guest checkout under a different email won't appear.
- **Email match is the only link.** Encourage checkout with the account email — the
  buyer-identity call above does this automatically for logged-in users, so their future
  orders show up in history.
- **No password reset yet** — that's a separate future flow.
