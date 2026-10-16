#!/usr/bin/env node
// createTestBlendOrder.js
// Places a PAID test order for one custom blend so the TeaMatrix joint test can
// run while the storefront's custom-blend page is disabled.
//
// What it does:
//   1. asks the backend for the active ingredients and creates a blend through
//      the real API (so the recipe is validated and gets a Blend ID);
//   2. creates a Shopify DRAFT order for the Custom Blend Tea product carrying
//      that Blend ID as a line-item property, a "source=uat" order attribute
//      and a "test" tag (all three mark it is_test for the machine feed);
//   3. completes the draft as paid (manual payment — no card is charged).
// Shopify then fires orders/create + orders/paid at the backend exactly as a
// real purchase would, which writes the machine_orders row.
//
// The row has is_test = 1, so it appears in /pending ONLY while the backend
// runs with MACHINE_INCLUDE_TEST_ORDERS=true (joint test switch). Cancellations
// and refunds for the test are then done by hand in Shopify admin.
//
// Run on the VM inside the backend container (has the Admin token in env):
//   docker compose exec -T backend node scripts/createTestBlendOrder.js \
//       --api http://127.0.0.1:5000 --product 1234567890 [--units 2] [--grams 50]
//
//   --api      backend base URL the blend is created on (default http://127.0.0.1:5000)
//   --product  numeric Shopify product id of "Custom Blend Tea" (same value as
//              CUSTOM_BLEND_PRODUCT_ID). Its first variant is ordered.
//   --units    how many of the blend to buy (default 1)
//   --grams    blend weight per unit, 1..200 (default 50)
//   --spices   recipe as id:pct,id:pct (default: first two active spices at
//              12.50 and 7.50; base tea takes the remainder)
//
// Needs the Admin API scopes write_draft_orders and write_orders.

const { adminGraphQL } = require("../src/lib/shopifyAdmin");

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : def;
}

const API = String(arg("api", "http://127.0.0.1:5000")).replace(/\/$/, "");
const PRODUCT = arg("product");
const UNITS = parseInt(arg("units", "1"), 10);
const GRAMS = parseInt(arg("grams", "50"), 10);
const SPICES_ARG = arg("spices");

if (!PRODUCT) {
  console.error("Missing --product <numeric Shopify product id of Custom Blend Tea>");
  process.exit(1);
}

async function json(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  // 1. Build a valid recipe from what the backend currently offers.
  const { data: options } = await json("GET", "/api/tea-options");
  const baseTea = options.baseTeas[0];
  if (!baseTea) throw new Error("Backend offers no active base teas.");

  let spices;
  if (SPICES_ARG) {
    spices = SPICES_ARG.split(",").map((pair) => {
      const [id, pct] = pair.split(":");
      return { id: parseInt(id, 10), percentage: Number(pct) };
    });
  } else {
    const [s1, s2] = options.spices;
    spices = [s1 && { id: s1.id, percentage: 12.5 }, s2 && { id: s2.id, percentage: 7.5 }].filter(Boolean);
  }
  const spiceSum = spices.reduce((a, s) => a + Math.round(s.percentage * 100), 0);
  const basePct = ((10000 - spiceSum) / 100).toFixed(2);

  const blend = await json("POST", "/api/create-custom-blend", {
    baseTeaId: baseTea.id,
    quantity: GRAMS,
    baseTeaPercentage: basePct,
    spices,
  });
  const { blendRef, lineAttributes } = blend.data;
  console.error(`Blend ${blendRef}: ${baseTea.name} ${basePct}% + ${spices.map((s) => `${s.id}:${s.percentage}%`).join(", ")} @ ${GRAMS} g`);

  // 2. First variant of the Custom Blend Tea product.
  const productGid = String(PRODUCT).startsWith("gid://") ? PRODUCT : `gid://shopify/Product/${PRODUCT}`;
  const p = await adminGraphQL(
    `query($id: ID!) { product(id: $id) { title variants(first: 1) { edges { node { id title } } } } }`,
    { id: productGid }
  );
  const variant = p.product && p.product.variants.edges[0] && p.product.variants.edges[0].node;
  if (!variant) throw new Error(`Product ${PRODUCT} not found or has no variants.`);
  console.error(`Product "${p.product.title}", variant ${variant.id} (${variant.title})`);

  // 3. Draft order with the blend attributes, flagged as a test three ways.
  const draft = await adminGraphQL(
    `mutation($input: DraftOrderInput!) {
       draftOrderCreate(input: $input) {
         draftOrder { id name }
         userErrors { field message }
       }
     }`,
    {
      input: {
        email: "machine-test@crownandleaf.uk",
        note: "TeaMatrix joint test — created by scripts/createTestBlendOrder.js",
        tags: ["test", "teamatrix-joint-test"],
        customAttributes: [{ key: "source", value: "uat" }],
        shippingAddress: { firstName: "Test", lastName: "Machine", address1: "1 Test Lane", city: "London", zip: "N1 1AA", countryCode: "GB" },
        lineItems: [
          {
            variantId: variant.id,
            quantity: UNITS,
            customAttributes: lineAttributes.map((a) => ({ key: a.key, value: String(a.value) })),
          },
        ],
      },
    }
  );
  const dErr = draft.draftOrderCreate.userErrors;
  if (dErr.length) throw new Error(`draftOrderCreate: ${JSON.stringify(dErr)}`);
  const draftId = draft.draftOrderCreate.draftOrder.id;

  // 4. Complete as paid (manual payment). This fires orders/create + orders/paid.
  const done = await adminGraphQL(
    `mutation($id: ID!) {
       draftOrderComplete(id: $id, paymentPending: false) {
         draftOrder { order { id name } }
         userErrors { field message }
       }
     }`,
    { id: draftId }
  );
  const cErr = done.draftOrderComplete.userErrors;
  if (cErr.length) throw new Error(`draftOrderComplete: ${JSON.stringify(cErr)}`);
  const order = done.draftOrderComplete.draftOrder.order;

  console.log(JSON.stringify({
    order_name: order.name,
    shopify_order_id: String(order.id).split("/").pop(),
    blend_ref: blendRef,
    units: UNITS,
    total_weight_g: GRAMS,
    is_test: true,
    note: "Appears in /pending only while MACHINE_INCLUDE_TEST_ORDERS=true. Cancel / refund in Shopify admin to drive /changes.",
  }, null, 2));
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
