# Custom Blend Builder — Frontend API Contract

For the frontend session relaunching the **custom blend page**. The backend side
is live in production; these are the shapes to build against. Everything here is
additive to what the page used before it was disabled, except where marked.

Related: `FRONTEND_CUSTOMER_ACCOUNTS.md` §4 (how a blend shows on the order
page: `blend_status`, `traces`) and its UAT cart-attribute rule.

---

## 1. Ingredients — `GET /api/tea-options`

No auth. Returns only the ingredients currently offered.

```json
{ "success": true, "data": {
  "baseTeas": [ { "id": 8,  "code": "STRATHSPEY_BOPF", "name": "Strathspey BOPF" }, … ],
  "spices":   [ { "id": 2,  "code": "GINGER_PIECES",   "name": "Ginger" }, … ],
  "limits":   { "min_weight_g": 1, "max_weight_g": 200, "max_spices": 7,
                "percentage_decimals": 2, "min_ingredient_g": 0 }
} }
```

- **`limits` is what the server enforces** on create. Read it instead of
  hard-coding: `min_ingredient_g` is 0 today (check off) and will become a
  small positive number once the machine team measures it — then warn before
  sending if `quantity × percentage / 100` for any ingredient is below it.

- **Send `id`** back when creating a blend. `code` is the permanent identifier the
  tea machine uses; show it nowhere, but keep it in state if you log/debug.
- `name` is display text and may change; never match on it.
- Expect exactly 5 base teas and 7 spices today. Don't hard-code either count.

---

## 2. Create a blend — `POST /api/create-custom-blend`

No auth (the blend is attached to the cart line, not to an account).

```json
// body
{
  "baseTeaId": 8,
  "quantity": 50,
  "baseTeaPercentage": 80,
  "spices": [ { "id": 2, "percentage": 12.5 }, { "id": 3, "percentage": 7.5 } ]
}
```

| Field | Rule |
|---|---|
| `quantity` | **whole grams, 1 to 200** (was 100 — the cap went up) |
| `baseTeaPercentage` | optional. If sent, base + spices must total **exactly 100.00**. If omitted, the base takes the remainder. Send it: the UI should show the base share. |
| `spices` | 0 to 7 entries, no duplicate ids. **May be empty** (a tea-only blend is valid). |
| `percentage` | each > 0, **at most 2 decimals** ("33.333" is rejected, not rounded) |

### 201
```json
{ "success": true, "message": "Custom tea blend created successfully!", "data": {
  "blendId": 19,
  "blendRef": "BLEND-2026-000019",
  "baseTeaPercentage": "80.00",
  "lineAttributes": [
    { "key": "Blend ID",    "value": "BLEND-2026-000019" },
    { "key": "Base Tea",    "value": "Strathspey BOPF" },
    { "key": "Ingredients", "value": "Ginger 12.50%, Cinnamon 7.50%" }
  ],
  "grams": {
    "pack_weight_g": 50,
    "base":   { "name": "Strathspey BOPF", "percentage": "80.00", "grams": 40 },
    "spice_total_g": 10,
    "spices": [ { "name": "Ginger", "percentage": "12.50", "grams": 6.25 },
                { "name": "Cinnamon", "percentage": "7.50", "grams": 3.75 } ]
  }
} }
```

- **Attach `lineAttributes` unchanged** to the Custom Blend Tea cart line
  (`POST /api/storefront/cart/lines`, `attributes`). The `Blend ID` attribute is how
  the paid order is matched back to this recipe and sent to the machine. Without
  it the order is flagged invalid and never made.
- `grams` is the recipe resolved against the pack weight — show these ("40 g
  Strathspey + 6.25 g ginger …") rather than recomputing from percentages. Parts
  always sum to exactly `pack_weight_g`.
- Percentages come back as **2-decimal strings**.

### 400 — a rule failed
```json
{ "success": false, "error_code": "PERCENTAGE_SUM",
  "message": "Base tea plus spices must total exactly 100.00 (got 99.99)." }
```

| `error_code` | Show the user |
|---|---|
| `WEIGHT_OUT_OF_RANGE` | weight must be 1–200 g |
| `PERCENTAGE_SUM` | shares must add up to exactly 100% |
| `INVALID_PERCENTAGE` | a share is 0, negative, or has more than 2 decimals |
| `TOO_MANY_SPICES` | at most 7 spices |
| `DUPLICATE_SPICE` | the same spice twice |
| `INVALID_SPICE` / `INVALID_BASE_TEA` | ingredient no longer offered — refresh `/tea-options` |
| `MIN_INGREDIENT` | an ingredient would be below the machine's minimum grams (currently off; may be enabled later) |

Validate client-side first (sum in **hundredths**, not floats: `Math.round(p*100)`),
but always handle the 400 — the server is the source of truth.
Shape errors (missing fields) come back as the usual `{ success:false, errors:[…] }`.

---

## 3. Look a blend up — `GET /api/custom-blends/:ref`

No auth. `:ref` accepts `BLEND-2026-000019`, `000019` or `19`.

```json
{ "success": true, "data": {
  "blendId": 19, "blendRef": "BLEND-2026-000019",
  "baseTea": "Strathspey BOPF", "baseTeaCode": "STRATHSPEY_BOPF", "baseTeaPercentage": "80.00",
  "quantity": 50, "createdAt": "2026-10-16T09:00:00.000Z",
  "spices": [ { "code": "GINGER_PIECES", "name": "Ginger", "percentage": "12.50" }, … ],
  "grams": { … same shape as above … }
} }
```
`404 { "success": false, "message": "Blend not found." }` for an unknown ref.

---

## 4. UAT and local checkouts must tag test orders

Any checkout that is **not the live site** must mark the order as a test, so the tea
machine never makes it. That means the UAT hostname **and localhost** (local dev
points at the live store). Never on crownandleaf.uk.

Set a **cart-level** attribute (not a line attribute):

```json
// POST /api/storefront/cart/attributes
{ "cartId": "gid://shopify/Cart/…?key=…", "attributes": [ { "key": "source", "value": "uat" } ] }
```

- Replaces the cart's whole attribute set (Shopify semantics) — send every
  attribute you want kept.
- `POST /api/storefront/cart` also accepts `attributes` at creation.
- `GET /api/storefront/cart?id=` echoes `cart.attributes` so you can verify.
- 404 for an unknown/expired cart, 400 with `errors` for anything Shopify rejects.
- The attribute arrives on the order as a note attribute; the backend treats
  `source|environment|env|channel` = `uat|test|testing|staging` as a test order.
  An order tag of `test` and Shopify's own test flag work too.

Do it in the checkout handler (next to buyer-identity) so carts created before
the deploy are covered.

---

## 5. Where it ends up

After payment the order line shows on the customer's order page with
`blend_status` (received → being_made → ready) and, once made, one
"Trace your tea" link per bottle — see `FRONTEND_CUSTOMER_ACCOUNTS.md` §4.
