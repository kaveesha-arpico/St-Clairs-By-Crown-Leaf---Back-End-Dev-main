# St. Clair's — UAT Test Plan (uat.crownandleaf.uk)

For everyone testing UAT (you, Sanjaya, staff, CEO). Walk each scenario as a real
customer would, tick pass/fail, and log anything that looks wrong. Goal: find
issues now, then sign off that we're ready to go live.

## ⚠️ Rules while testing
- **Do NOT complete a real card payment.** UAT shares the LIVE store + LIVE
  payments — a real checkout charges a real card. **Stop at the Shopify payment
  screen.** To test a full paid order, use a Shopify admin "**mark as paid**" order.
- **Test data goes into the real database** (UAT shares production). Note any test
  orders/accounts you create so they can be cleaned before go-live.
- **Log every issue** (see template at the bottom) — what, where, steps, screenshot.

---

## 1. Browsing & catalogue
- [ ] Home page loads, images show, nav works
- [ ] Shop page lists teas; **prices + stock are correct**
- [ ] Each of the 5 single-origin tea pages opens (Strathspey BOPF, Maskeliya
  Silver Tips, Glentilt Golden Tips, Moray BOP, Laxapana PEKOE) — **names correct**
- [ ] About / Our Plantation / Factories / Contact pages load

## 2. Custom blend builder
- [ ] Can pick a base tea + spices and build a blend
- [ ] Blend adds to cart correctly
- [ ] Price/quantity look right

## 3. Cart
- [ ] Add item → cart count updates
- [ ] Change quantity, remove item — totals update
- [ ] Cart survives a page reload
- [ ] Cart survives logout (expected — cart is separate from login)

## 4. Accounts
- [ ] Register a new account → logged in
- [ ] Log out → log back in
- [ ] Profile page shows correct **name + email** (read-only)
- [ ] Leave it idle → confirm auto sign-out after the session expires
- [ ] Duplicate email registration is blocked ("Email already in use")
- [ ] Wrong password is rejected

## 5. Order history & reorder
- [ ] Logged-in user sees **their own** past orders (matched by email)
- [ ] Order details correct (items, price, status, date)
- [ ] Custom-blend orders show, flagged as custom
- [ ] **Reorder** rebuilds the cart → lands at checkout, email prefilled
- [ ] Reorder of a discontinued/blend item shows the "some items skipped" message

## 6. Checkout (STOP before paying)
- [ ] "Proceed to checkout" → Shopify checkout opens
- [ ] Logged-in user: email is **prefilled**; guest: blank
- [ ] Shipping shows **UK Standard £3.95**; tax correct
- [ ] ⛔ **Stop here — do not enter a real card**

## 7. Contact form
- [ ] Submit the form → success message
- [ ] Email actually arrives at **contact@crownandleaf.uk**

## 8. Full order flow (via admin "mark as paid" — no real card)
- [ ] Create/mark-paid an order for a test account email
- [ ] It appears in that account's **order history**
- [ ] Order-confirmation **email** arrives, from `orders@crownandleaf.uk`, branded
- [ ] (Machine team) order shows in the machine feed

## 9. Emails
- [ ] Order confirmation email looks right (logo, sender, content)
- [ ] Links in the email work

## 10. Devices & browsers
- [ ] Works on **mobile** (phone width), tablet, desktop
- [ ] Works on Chrome, Safari, Edge
- [ ] No obvious layout breakage or horizontal scroll

---

## Issue log (copy per issue)
```
#   | Area        | What went wrong                | Steps to reproduce        | Severity | Screenshot
1   | Reorder     | 500 error on reorder click     | Login → orders → Reorder  | High     | link
```
Severity: **High** (blocks a customer) / **Medium** (works but wrong) / **Low** (cosmetic).

---

## Sign-off = ready to go live
UAT is "passed" when:
- All **High** issues are fixed and re-tested
- Key journeys work: browse → cart → account → checkout(prefill) → order shows in
  history → confirmation email
- Stakeholders (CEO / Sanjaya) have clicked through and approved

Then complete the remaining `GO_LIVE_CHECKLIST.md` items (VAT, product check, remove
test data, etc.) and flip to live.
