# Tea Traceability — Frontend API Contract

For the frontend sessions building the **public trace page** (`tea-details.crownandleaf.uk`)
and the **admin site**.

> **Status: the public endpoint and the admin endpoints are NOT built yet.** This
> document is the agreed shape so both frontends can be built against mock data in
> parallel with the backend. Field names here are final unless this file changes.
> The QR endpoint (§4) *is* live and usable today.

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

## 5. Admin site — endpoints to expect

Not built yet; shape subject to change until §5 loses this line.

Staff log in separately from customers (`POST /api/staff/auth/login`) and get a JWT
carrying a staff role. **A customer token will never be accepted on these routes**, so
the admin site needs its own login screen — don't reuse the storefront's.

Planned:

| Purpose | Endpoint |
|---|---|
| Staff login | `POST /api/staff/auth/login` |
| Estates / factories / lots / pack runs CRUD | `/api/admin/...` |
| Record packing (scan pack-run codes against an order) | `POST /api/admin/orders/:id/allocations` |
| Order list, with **search by trace code** | `GET /api/admin/orders?code=...` |

Two things worth knowing while you design the admin screens:

- **The QR download link is just the §4 URL.** No special endpoint, no auth — point an
  `<img>` or a download link at it.
- **Customer names are not stored in our database**, only the email. The order list
  will fetch names from Shopify on demand, so expect that field to be slower and to be
  absent if Shopify is unreachable. Don't block the table render on it.
