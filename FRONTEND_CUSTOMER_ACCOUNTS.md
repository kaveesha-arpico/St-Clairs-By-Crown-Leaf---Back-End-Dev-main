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
          "quantity": 1, "price": "25.00", "is_custom_blend": false }
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

## Behaviour notes

- **Guest orders exist but never show here.** Every order is stored (the tea-dispensing
  machine needs them), but order history only surfaces orders whose email matches the
  signed-in account. A guest checkout under a different email won't appear.
- **Email match is the only link.** Encourage checkout with the account email — the
  buyer-identity call above does this automatically for logged-in users, so their future
  orders show up in history.
- **No password reset yet** — that's a separate future flow.
