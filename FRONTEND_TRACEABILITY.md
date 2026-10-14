# Tea Traceability — Frontend API Contract

For the frontend sessions building the **public trace page** (`tea-details.crownandleaf.uk`)
and the **admin site**.

> **Status: everything in this document is built and working**, verified against a
> real database. **The model changed on 9 Oct: trace codes are now per JAR, not
> per order** — see §1. The public trace endpoint (§2) and the admin API (§5)
> both changed shape as a result; anything built against the earlier shapes
> needs updating. The trace *site* still needs DNS and its origin added to the
> CORS allowlist before a browser can call it — see §3.

## Pilot scope

At launch the page shows **five details only**: Plantation, Factory, Packed Date,
Ingredients, Package Weight. The richer chain from the original brief (harvest
dates, wither hours, moisture, cupping notes, shipping records) was deliberately
cut — it would need per-lot data entry from the estate, factory and shipping agent
forever, and a page with blank fields reads worse than a short page that is always
complete. Don't design layouts that assume those fields will appear.

Rolling out to **Golden Tips first**, then other grades.

---

## 1. The trace code

A 12-character code, e.g. `K7M2QP9XTR4B`. **One per jar.** Codes are minted when
a pack run is created — `quantity_packed: 48` mints 48 codes — so every jar has
an identity and a printable QR before any order exists. A jar is linked to an
online order later, when the packer scans it into the box.

Why per jar, not per order: the QR goes on the jar label. An order of two teas
is two jars. And a jar sold in a shop or given as a gift has no order at all —
it still needs to trace.

- Alphabet is `23456789ABCDEFGHJKMNPQRSTVWXYZ` — **no `0`, `1`, `I`, `L`, `O` or `U`**,
  so there is nothing for a customer to misread off a printed label.
- The API accepts codes lowercase, with spaces or hyphens (`k7m2-qp9x-tr4b` works).
  **Normalize to uppercase before display**, but don't reject messy input — if you
  build a "type your code" box, pass whatever the user typed straight through.
- Codes are random, never sequential. Do not try to derive anything from them.
- **Scan counts are per jar.** One code scanned many times from many places is a
  copied label — that is the counterfeit signal this model gives you.

---

## 2. Public trace page — `GET /api/trace/:code` ✅ built

No auth. This is the endpoint the QR opens. **A code identifies one jar**, so the
response is one product, not a list.

### 200 — a jar that has been packed into an online order

```json
{
  "verified": true,
  "code": "K7M2QP9XTR4B",
  "traced": true,
  "product": {
    "title": "Glentilt Golden Tips",
    "variant_title": "100g",
    "ingredients": "Pure Ceylon black tea",
    "package_weight_g": 100,
    "product_url": "https://crownandleaf.uk/products/golden-tips"
  },
  "plantation": { "name": "Glentilt Estate", "region": "Dimbula" },
  "factory": "Glentilt Factory",
  "packed_date": "2026-03-12",
  "grade": "Golden Tips",
  "order": { "order_number": "#1043", "dispatched_at": "2026-03-20T09:14:00.000Z" },
  "first_scanned_at": "2026-03-24T18:02:11.000Z",
  "scan_count": 3
}
```

### 200 — a jar NOT in any online order

Same shape, with **`order: null`**. This is a shelf jar, a shop sale, a gift, or
a jar scanned on the packing bench. **It is a normal state, not "coming soon"**:
plantation, factory, packed date and product all render. Only the order number
and dispatch date are absent. `product.variant_title` is also `null` here, since
it comes from the order line.

### 200 — a jar whose grade is not yet public

```json
{ "verified": true, "code": "K7M2QP9XTR4B", "traced": false,
  "first_scanned_at": "...", "scan_count": 1 }
```

`traced: false` means a real jar whose grade is held back during the pilot. Show
"details coming soon". No provenance fields are present at all in this case.

### Notes you have to design around

**Every `product.*` field can be `null` individually** when staff haven't filled
it in. `title` falls back to the order line's title when the jar is in an order
and nothing is saved; otherwise it is `null` too — render the grade in that case.

**`packed_date` is plain `YYYY-MM-DD`.** `dispatched_at` is a full timestamp.

**`package_weight_g` is a number in grams** (`100`, `1500`). Format it yourself —
the API never sends `"100g"`.

**`product_url`** is the full reorder link, or `null` — hide the button then. It's
a complete URL; render as-is.

**`scan_count` includes bots.** Link previews in WhatsApp, iMessage and Slack each
fetch the page. Treat it as a rough figure, and **do not prefetch this endpoint** —
every call increments it.

**No personal data, ever.** No name, email or address will appear in this response,
by design. Don't build a "Hi <name>" greeting on it.

**There is no `items[]` or `sources[]` any more.** One jar came from one run.

### 404 — unknown or revoked code

```json
{ "verified": false, "message": "We couldn't find that code." }
```

A revoked code and a code that never existed return **exactly the same response**, on
purpose — telling them apart would let someone confirm which codes are real. Render
one "not found" state for both.

### 429 — too many lookups

Rate-limited per IP so codes can't be hunted for by brute force. Normal customers
will never see this. Show "please wait a moment and try again".

---

## 3. What the page needs from you

Scanning the QR lands on `tea-details.crownandleaf.uk/<CODE>`. Read the code from the
path and call `GET /api/trace/<CODE>` on `https://api.crownandleaf.uk`.

CORS: the trace domain must be in the backend's allowlist before the page can read
the API. Tell the backend session the exact origin (including `https://`) once it's
decided.

---

## 4. QR images — `GET /api/qr/:code.png` ✅ live now

No auth, so it works directly in an `<img>` tag:

```html
<img src="https://api.crownandleaf.uk/api/qr/2ZHVJK7YW3W7.png?size=512" alt="Trace QR">
```

- `.png` or `.svg`. Use **`.svg` for print** — it stays sharp at any label size.
- `?size=` in pixels, clamped to 128–2048, default 512. Ignored for practical purposes
  on SVG, which scales anyway.
- `400` if the code is malformed, `503` if the backend hasn't been given the trace
  domain yet.
- This endpoint does **not** check whether the code exists — it will happily render a
  QR for a code that was never issued. That's deliberate (it stops the endpoint being
  used to discover valid codes), so **don't use a successful QR render to validate a
  code**. Use `GET /api/trace/:code` for that.
- Responses are immutable and cached forever. The image for a code never changes.
- Served with `Cross-Origin-Resource-Policy: cross-origin`, so it embeds in an
  `<img>` from any origin. (It previously inherited `same-origin` from our
  security headers, which blocked exactly that — fixed.) **If you tested before
  this fix, hard-refresh**: the response is cached `immutable`, so your browser
  may still be holding the blocked copy.

---

## 5. Admin site — built ✅

Staff log in separately from customers and get a JWT carrying `typ: "staff"`.
**A customer token is rejected with 403 on every admin route**, so the admin site
needs its own login screen — don't reuse the storefront's.

### Login — `POST /api/staff/auth/login`

```json
// body
{ "email": "ann@crownandleaf.uk", "password": "..." }
```
```json
// 200
{ "message": "Login successful.", "token": "<jwt>",
  "user": { "staffId": 1, "email": "ann@crownandleaf.uk", "name": "Ann Perera",
            "role": "admin", "typ": "staff" } }
```

- `401 { "message": "Invalid email or password." }` — identical for a wrong
  password, an unknown email and a deactivated account. Don't try to tell them
  apart in the UI.
- `GET /api/staff/auth/me` → `{ "user": { ... } }` re-hydrates after a reload. A
  staff member deactivated mid-session gets a `401` at their next page load —
  treat that as logged out.
- **There is no signup endpoint.** Accounts are created on the server with
  `scripts/createStaffUser.js`. Don't build a registration screen.

### Roles

| Role | Can do |
|---|---|
| `staff` | everything below except customer details |
| `admin` | the above, plus `GET /api/admin/orders/:orderId/customer` |

### Endpoints

Send `Authorization: Bearer <staff jwt>` on all of these.

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/api/admin/estates` | `?include_inactive=true` to see retired ones |
| GET/PUT/DELETE | `/api/admin/estates/:id` | DELETE **deactivates**, never removes |
| GET/POST | `/api/admin/factories` | same shape as estates |
| GET/PUT/DELETE | `/api/admin/factories/:id` | DELETE **deactivates** |
| GET/POST | `/api/admin/lots` | `?grade=Golden Tips`, `?estate_id=1` |
| GET/PUT/DELETE | `/api/admin/lots/:id` | DELETE is real, but `409` once it has pack runs |
| GET/POST | `/api/admin/pack-runs` | **POST mints one trace code per unit** |
| GET/PUT/DELETE | `/api/admin/pack-runs/:id` | DELETE `409` once any jar is scanned or packed |
| GET | `/api/admin/pack-runs/by-code/:code` | look a run up by its own identifier |
| GET/POST | `/api/admin/pack-runs/:id/codes` | **the jar codes**; POST mints more |
| GET | `/api/admin/pack-runs/:id/labels.pdf` | **printable labels**, one PDF per run |
| GET | `/api/admin/product-info` | all saved product details |
| GET/PUT/DELETE | `/api/admin/product-info/:shopifyProductId` | **PUT upserts** — no POST |
| GET | `/api/admin/orders` | `?code=`, `?order_number=`, `?limit=` |
| GET | `/api/admin/orders/:orderId/allocations` | packing state |
| POST | `/api/admin/orders/:orderId/allocations` | **scan jars into the order** |
| DELETE | `/api/admin/orders/:orderId/allocations/:code` | take a jar back out |
| GET | `/api/admin/orders/:orderId/customer` | **admin role only** |

### Reference data — estates, factories, lots

Unchanged. Real captured shapes:

```json
// POST /api/admin/estates     { "name": "Glentilt Estate", "region": "Dimbula" }
// 201
{ "estate_id": 9, "name": "Glentilt Estate", "region": "Dimbula",
  "is_active": true, "created_at": "2026-10-05T07:38:24.000Z" }

// POST /api/admin/factories   { "name": "Glentilt Factory" }    — no estate_id, by design
// POST /api/admin/lots        { "lot_number": "GT-2026-038", "estate_id": 9, "factory_id": 8, "grade": "Golden Tips" }
// 201 includes nested "estate" and "factory" objects
```

`is_active` is writable on PUT for estates and factories (that's how you
reactivate). **Unknown fields are silently ignored, not rejected** — a typo like
`active` gives a 201 that did nothing. Validation errors come back as
`{ "success": false, "message": "Validation failed", "errors": [ { "field", "message" } ] }`.

### Product details — title, ingredients, weight, reorder link

Keyed by **Shopify product id** (a string). `PUT` creates or updates; there's no
POST. **Full replace** — always send all four fields; omitting one clears it.

```json
// PUT /api/admin/product-info/7700000000099
{ "title": "Glentilt Golden Tips",
  "ingredients": "Pure Ceylon black tea",
  "package_weight_g": 100,
  "product_url": "https://crownandleaf.uk/products/golden-tips" }
```

`title` is new: it's the name on the trace page and on the printed label, so a
jar that isn't in any order still has one. `GET` on a product with nothing saved
returns **404** — show a blank form, not an error. `product_url` must include
`https://`.

### Pack runs mint the codes

```json
// POST /api/admin/pack-runs
{ "pack_run_code": "PR-0412", "lot_id": 14, "packed_date": "2026-03-12",
  "sku": "GT-100", "shopify_product_id": "7700000000011", "quantity_packed": 48 }

// 201 — the run, with its lot/estate/factory nested, plus:
{ ..., "packed_date": "2026-03-12", "quantity_packed": 48,
  "codes_count": 48, "codes_created": 48 }
```

- **`quantity_packed` is required (1–10000)** — it's how many codes are minted.
- **`PUT` can't change `quantity_packed`.** It counts codes that exist; to record
  more jars than planned, mint more:

```json
// POST /api/admin/pack-runs/:id/codes     { "count": 12 }
// 201
{ "pack_run_id": 18, "codes_created": 12,
  "codes": [ { "code": "H7CQET33KKYF", "qr_url": "/api/qr/H7CQET33KKYF.png" }, ... ] }
```

  Returns only the new codes, so you can print just those labels.

- `pack_run_code` is **typed in, not generated** — it's the identifier already on
  the physical batch/case. Must be unique (`409`).
- `shopify_product_id` must be a **string** — Shopify ids exceed JavaScript's safe
  integer range.
- **DELETE** works only while no jar from the run has been scanned or packed;
  after that it's `409` and individual codes are revoked instead.

### The codes on a run

```json
// GET /api/admin/pack-runs/:id/codes
{ "pack_run_id": 18, "pack_run_code": "PR-0412", "count": 48,
  "codes": [
    { "code": "K7M2QP9XTR4B", "status": "active", "scan_count": 0,
      "first_scanned_at": null, "qr_url": "/api/qr/K7M2QP9XTR4B.png",
      "line_item_id": null, "order_number": null,
      "allocated_at": null, "mismatch_override": false },
    { "code": "H7CQET33KKYF", "status": "active", "scan_count": 2,
      "first_scanned_at": "2026-03-24T18:02:11.000Z", "qr_url": "/api/qr/H7CQET33KKYF.png",
      "line_item_id": "1234...", "order_number": "#1043",
      "allocated_at": "2026-03-20T08:10:00.000Z", "mismatch_override": false }
  ] }
```

`order_number` is `null` for a jar still on the shelf. This is the "where did
this batch go" view.

### Printing labels

`GET /api/admin/pack-runs/:id/labels.pdf` — **one PDF, every active code on the
run**, each label with QR, product title, estate, packed date and the code in
text (so a scuffed QR can still be typed). Fetch with the auth header → blob →
open/print.

One request for the whole run — **don't build a print view from 500 `<img>`
tags**, it will trip the per-IP rate limit on `/api/qr/*`.

Layout is a grid; match the label stock with query params, all optional:

| Param | Default | Range |
|---|---|---|
| `size` | `A4` | `A4`, `LETTER` |
| `cols` | `3` | 1–10 |
| `rows` | `8` | 1–20 |
| `margin_mm` | `8` | 0–30 |

Defaults give 24 labels of ≈70×37 mm per A4 sheet. `503` if the backend hasn't
been given the trace domain; `404` if the run has no active codes. Not cached —
codes can be added to a run later.

The existing `/api/qr/:code.png|svg` stays for single previews (§4).

### The packing screen — scan jars, not runs

The packer scans **the jar's QR** as it goes into the box. No quantity: a jar is
one unit. Submit several scans together:

```json
// POST /api/admin/orders/<shopify_order_id>/allocations
{ "scans": [
  { "line_item_id": "1234...", "code": "K7M2QP9XTR4B" },
  { "line_item_id": "1234...", "code": "H7CQET33KKYF" },
  { "line_item_id": "5678...", "code": "2ZHVJK7YW3W7", "allow_product_mismatch": true }
] }

// 201
{ "message": "Jars recorded.", "recorded": 3, "skipped": 0 }
```

**All-or-nothing:** if any scan is bad, nothing is written — the operator
re-submits the batch rather than hunting for which ones landed. `skipped` counts
jars that were already on that same line (a double-scan is harmless and ignored).

Every error is a `400` with an `error` code you can switch on:

| `error` | Meaning | Extra fields |
|---|---|---|
| `unknown_codes` | a code that doesn't exist (or is malformed) | `unknown_codes[]` |
| `line_not_on_order` | that line belongs to a different order | `line_item_id` |
| `code_revoked` | the jar's code has been revoked | `code` |
| `code_already_used` | the jar is already in another order/line | `code`, `order_number` |
| `product_mismatch` | the jar holds a different product than the line | `code`, `pack_run_code`, `field`, `ordered`, `scanned` |
| `over_allocated` | more jars than the line's quantity | `line_item_id`, `allocated`, `ordered` |

**Product mismatch** compares the jar's run against the line on both Shopify
product id and SKU; either differing is a mismatch. Keep your "Wrong product?"
confirm step — on confirm, resend that scan with `allow_product_mismatch: true`
(a real boolean; the string `"false"` is rejected). The override is **recorded**
as `mismatch_override: true` on the jar — mark it in the UI.

Undo a mis-scan: `DELETE /api/admin/orders/:orderId/allocations/:code` → `200`,
or `404` if that jar isn't in that order. The jar keeps its identity; it just
stops being in the order.

### Packing state

```json
// GET /api/admin/orders/:orderId/allocations
{ "shopify_order_id": "999000000000000001", "order_number": "#DEMO1043",
  "fully_packed": false,
  "lines": [
    { "line_item_id": "999000000000000101", "title": "Glentilt Golden Tips",
      "variant_title": "100g", "sku": "GT-100",
      "quantity": 3, "allocated": 3, "outstanding": 0,
      "codes": [
        { "code": "BQDNEVMH25NF", "pack_run_code": "DEMO-PR-0412", "packed_date": "2026-03-12",
          "lot_number": "DEMO-LOT-GT-038", "estate": "Demo Glentilt Estate",
          "factory": "Demo Glentilt Factory", "allocated_at": "2026-10-09T09:00:00.000Z",
          "mismatch_override": false }
      ] },
    { "line_item_id": "999000000000000102", "title": "Moray BOP", "variant_title": "250g",
      "sku": "BOP-250", "quantity": 1, "allocated": 0, "outstanding": 1, "codes": [] }
  ] }
```

`outstanding` per line and `fully_packed` on the order drive a "needs packing"
filter.

### The order list

```json
// GET /api/admin/orders?limit=50
{ "count": 1, "orders": [ {
    "shopify_order_id": "...", "order_number": "#1043",
    "financial_status": "paid", "fulfillment_status": null,
    "created_at": "...", "dispatched_at": null,
    "fully_packed": false,
    "items": [ { "line_item_id": "...", "title": "Glentilt Golden Tips", "variant_title": "100g",
                 "sku": "GT-100", "quantity": 3, "allocated": 2,
                 "codes": [ { "code": "K7M2QP9XTR4B", "pack_run_code": "PR-0412",
                              "packed_date": "2026-03-12", "mismatch_override": false,
                              "qr_url": "/api/qr/K7M2QP9XTR4B.png" } ] } ]
} ] }
```

- **`trace_code`, `trace_status`, `scan_count` and `qr_url` are gone from the order
  row** — there is no order-level code any more. Each item carries its jars.
- **`?code=` is the support path**: a customer emails "my jar's code is X" and this
  finds the order that jar went out in. Tolerates lowercase and hyphens. A
  malformed code or a shelf jar returns `count: 0`.
- `dispatched_at` is now on the order (set by the fulfilment webhook).
- **No customer name or email is in this response.** Fetch it separately:

```json
// GET /api/admin/orders/:orderId/customer      (admin role only; asks Shopify live)
{ "shopify_order_id": "...", "order_number": "#1043",
  "customer_name": "Ann Perera", "email": "ann@example.com",
  "city": "Colombo", "country": "LK" }
```

  Any field can be `null`. `502` means "Shopify unreachable", not "no customer" —
  don't render it as blank on an error. Load per-row after the table renders.

### Demo data

`node scripts/seedTraceDemo.js` builds the whole thing: estate, factory, two
lots, three runs with their jar codes, product details, and a test order with
line 1 fully packed from two runs and line 2 unpacked, plus one unlinked jar so
you can see the `order: null` page. It prints the codes and ready-made URLs.
`--clean` removes it; re-run for fresh codes.
