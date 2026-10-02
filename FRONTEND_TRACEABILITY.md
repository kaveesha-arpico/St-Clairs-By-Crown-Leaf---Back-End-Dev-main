# Tea Traceability — Frontend API Contract

For the frontend sessions building the **public trace page** (`tea-details.crownandleaf.uk`)
and the **admin site**.

> **Status:** the QR endpoint (§4) and the whole admin API (§5) are **built and
> working**. The public trace endpoint (§2) is **not built yet** — that section is
> the agreed response shape so the trace page can be built against mock data in
> parallel. Field names there are final unless this file changes.

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

A 12-character code, e.g. `2ZHVJK7YW3W7`. One per order, generated when the order
is paid.

- Alphabet is `23456789ABCDEFGHJKMNPQRSTVWXYZ` — **no `0`, `1`, `I`, `L`, `O` or `U`**,
  so there is nothing for a customer to misread off a printed label.
- The API accepts codes lowercase, with spaces or hyphens (`2zhv-jk7y-w3w7` works).
  **Normalize to uppercase before display**, but don't reject messy input — if you
  build a "type your code" box, pass whatever the user typed straight through.
- Codes are random, never sequential. Do not try to derive anything from them.

---

## 2. Public trace page — `GET /api/trace/:code`

No auth. This is the endpoint the QR opens.

### 200 — a known, active code

```json
{
  "verified": true,
  "code": "2ZHVJK7YW3W7",
  "order_number": "#1043",
  "dispatched_at": "2026-03-20T09:14:00.000Z",
  "first_scanned_at": "2026-03-24T18:02:11.000Z",
  "scan_count": 3,
  "items": [
    {
      "title": "Glentilt Golden Tips",
      "quantity": 3,
      "ingredients": "Pure Ceylon black tea",
      "package_weight_g": 100,
      "sources": [
        {
          "quantity": 2,
          "plantation": { "name": "Glentilt Estate", "region": "Dimbula" },
          "factory": "Glentilt Factory",
          "packed_date": "2026-03-12",
          "grade": "Golden Tips"
        },
        {
          "quantity": 1,
          "plantation": { "name": "Glentilt Estate", "region": "Dimbula" },
          "factory": "Glentilt Factory",
          "packed_date": "2026-03-19",
          "grade": "Golden Tips"
        }
      ]
    }
  ]
}
```

### Notes you have to design around

**`sources` is an array, and usually has one entry — but not always.**
If a packing run ran out mid-order, one line item is filled from two runs, which can
mean **two different packed dates for the same product in the same order**. This is
normal, not an error. Either show both, or show a single date and mention the tea
came from more than one run — just don't assume `sources.length === 1`.

**`dispatched_at` is `null` until the order ships.** Expect to render a "preparing
your order" state. It is also `null` for any order fulfilled before the webhook went
live.

**`items[].ingredients` and `package_weight_g` may be `null`** if staff haven't filled
them in for that product yet. Render the row only when present.

**`package_weight_g` is a number in grams** (`100`, `1500`). Format it yourself —
the API never sends `"100g"`.

**`scan_count` includes bots.** Link previews in WhatsApp, iMessage and Slack each
fetch the page. Treat it as a rough figure, and **do not prefetch this endpoint** —
every call increments it.

**No personal data, ever.** No name, email or address will appear in this response,
by design. Don't build a "Hi <name>" greeting on it.

### 200 — a code with no trace data yet

Pilot grades only, or an order packed before the system went live:

```json
{ "verified": true, "code": "2ZHVJK7YW3W7", "order_number": "#1043",
  "dispatched_at": null, "items": [] }
```

`verified: true` with an empty `items` array means *"this is a real order, but its
journey isn't recorded"*. Show a friendly "details coming soon", **not** an error.

### 404 — unknown or revoked code

```json
{ "verified": false, "message": "We couldn't find that code." }
```

A revoked code and a code that never existed return **exactly the same response**, on
purpose — telling them apart would let someone confirm which codes are real. Render
one "not found" state for both. Don't show the raw code back in a way that implies it
was almost right.

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

---

## 5. Admin site — these are built ✅

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
  password, an unknown email and a deactivated account, so the endpoint can't be
  used to discover who has an account. Don't try to tell them apart in the UI.
- `GET /api/staff/auth/me` re-hydrates the user after a page reload. It re-reads
  the account, so a staff member deactivated mid-session gets a `401` at their
  next page load — treat that as logged out.
- **There is no signup endpoint.** Accounts are created on the server with
  `scripts/createStaffUser.js`. Don't build a registration screen.

### Roles

| Role | Can do |
|---|---|
| `staff` | everything below except customer details |
| `admin` | the above, plus `GET /api/admin/orders/:id/customer` |

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
| GET/POST | `/api/admin/pack-runs` | `?lot_id=`, `?sku=` |
| GET/PUT/DELETE | `/api/admin/pack-runs/:id` | DELETE gives `409` once allocated to an order |
| GET | `/api/admin/pack-runs/by-code/:code` | **the barcode scan** |
| GET | `/api/admin/orders` | `?code=`, `?order_number=`, `?limit=` |
| GET | `/api/admin/orders/:orderId/allocations` | packing progress |
| POST | `/api/admin/orders/:orderId/allocations` | record packing |
| DELETE | `/api/admin/allocations/:id` | undo a mis-scan |
| GET | `/api/admin/orders/:orderId/customer` | **admin role only** |

### The packing screen

Scan a barcode → `GET /api/admin/pack-runs/by-code/PRT-A` returns the run with
its lot, estate and factory, so the operator can confirm what they picked up
before committing it.

Then submit, several scans at a time:

```json
// POST /api/admin/orders/<shopify_order_id>/allocations
{ "allocations": [
    { "line_item_id": "1234...", "pack_run_code": "PRT-A", "quantity": 2 },
    { "line_item_id": "1234...", "pack_run_code": "PRT-B", "quantity": 1 }
] }
```

**The whole request succeeds or fails together.** If one scan is bad, nothing is
written — so on an error, the operator re-submits the batch rather than hunting
for which ones landed. Errors are `400` with a specific message:

- `unknown_codes: [...]` — a barcode that doesn't exist
- allocating more than the line ordered (the message gives both numbers)
- a `line_item_id` that belongs to a different order

**Re-scanning the same pack run on the same line REPLACES its quantity**, it does
not add to it. That's what an operator fixing a typo expects — but it means your
UI should show the current allocation, not assume it's adding.

`GET .../allocations` returns `outstanding` per line and `fully_packed` for the
order — use those to drive a "needs packing" filter.

### The order list

```json
{ "count": 1, "orders": [ {
    "shopify_order_id": "...", "order_number": "#1043",
    "trace_code": "2ZHVJK7YW3W7", "trace_status": "active",
    "qr_url": "/api/qr/2ZHVJK7YW3W7.png",
    "dispatched_at": null, "scan_count": 0,
    "fully_packed": false,
    "items": [ { "line_item_id": "...", "title": "Glentilt Golden Tips",
                 "sku": "GT-100", "quantity": 3, "allocated": 2 } ]
} ] }
```

- **`?code=` is the support path.** A customer emails "my code is X and the page
  is broken" — this is the only way to find that order, because the code exists
  nowhere else, not even in Shopify. Build a search box for it.
  It tolerates lowercase and hyphens. A malformed code returns `count: 0` rather
  than an unfiltered first page.
- **`qr_url` is relative** — resolve it against whatever API origin you're already
  using. It needs no auth, so it drops straight into an `<img>` or a download link.
- **No customer name or email is in this response.** Fetch the name separately
  from `/api/admin/orders/:id/customer` (admin role), which asks Shopify live.
  It's slower than the rest of the list and returns `502` when Shopify is
  unreachable, so load it per-row *after* the table renders — never block on it.
