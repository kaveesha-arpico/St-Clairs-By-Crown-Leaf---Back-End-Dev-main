#!/usr/bin/env node
// registerWebhooks.js
// Registers (or lists) the backend's Shopify order webhooks THROUGH THE CUSTOM
// APP, so deliveries are signed with the app's API secret key instead of the
// store's shared "Notifications" secret.
//
// Why: the shared secret was exposed in a screenshot and Shopify cannot
// regenerate it. App-owned subscriptions use the app's own secret, which was
// never exposed. verifyShopifyWebhook accepts a comma-separated
// SHOPIFY_WEBHOOK_SECRET ("new,old"), so the cutover is zero-downtime:
//
//   1. in Shopify admin, open the custom app -> API credentials -> copy the
//      "API secret key";
//   2. on the VM set SHOPIFY_WEBHOOK_SECRET=<app secret>,<old secret> and
//      `docker compose up -d`;
//   3. run this script from the VM:
//        docker compose exec -T backend node scripts/registerWebhooks.js
//      (it uses SHOPIFY_ADMIN_ACCESS_TOKEN from the container's env);
//   4. make any small change to an order and confirm 200s in the backend log —
//      you will see each topic delivered twice, once per registration;
//   5. delete the five old webhooks under Settings -> Notifications -> Webhooks;
//   6. remove the old secret from SHOPIFY_WEBHOOK_SECRET, `docker compose up -d`.
//
// Usage:
//   node scripts/registerWebhooks.js --list                 show app-owned subscriptions
//   node scripts/registerWebhooks.js [--base https://api.crownandleaf.uk]
//                                                           create any missing topics
//   node scripts/registerWebhooks.js --delete <gid>         remove one subscription
//
// Only subscriptions owned by THIS app are visible or deletable here; the old
// Notifications webhooks are managed in the admin UI.

const { adminGraphQL, API_VERSION } = require("../src/lib/shopifyAdmin");

const BASE = (arg("base") || "https://api.crownandleaf.uk").replace(/\/$/, "");

// Topic -> path the backend mounts (src/routes/shopifyWebhookRoutes.js).
const TOPICS = [
  ["ORDERS_CREATE", "/api/webhooks/shopify/orders-create"],
  ["ORDERS_PAID", "/api/webhooks/shopify/orders-paid"],
  ["ORDERS_UPDATED", "/api/webhooks/shopify/orders-updated"],
  ["ORDERS_CANCELLED", "/api/webhooks/shopify/orders-cancelled"],
  ["ORDERS_FULFILLED", "/api/webhooks/shopify/orders-fulfilled"],
];

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (flag) => process.argv.includes(`--${flag}`);

const LIST = `
  query {
    webhookSubscriptions(first: 50) {
      edges { node {
        id topic format createdAt
        endpoint { __typename ... on WebhookHttpEndpoint { callbackUrl } }
      } }
    }
  }`;

const CREATE = `
  mutation($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) {
      webhookSubscription { id topic endpoint { ... on WebhookHttpEndpoint { callbackUrl } } }
      userErrors { field message }
    }
  }`;

const DELETE = `
  mutation($id: ID!) {
    webhookSubscriptionDelete(id: $id) { deletedWebhookSubscriptionId userErrors { field message } }
  }`;

async function list() {
  const data = await adminGraphQL(LIST);
  return data.webhookSubscriptions.edges.map(({ node }) => ({
    id: node.id,
    topic: node.topic,
    format: node.format,
    url: node.endpoint && node.endpoint.callbackUrl,
    createdAt: node.createdAt,
  }));
}

async function main() {
  console.error(`Shopify Admin API ${API_VERSION}, base URL ${BASE}`);

  if (has("delete")) {
    const id = arg("delete");
    const data = await adminGraphQL(DELETE, { id });
    const errs = data.webhookSubscriptionDelete.userErrors;
    if (errs.length) throw new Error(JSON.stringify(errs));
    console.log("deleted", data.webhookSubscriptionDelete.deletedWebhookSubscriptionId);
    return;
  }

  const existing = await list();
  if (has("list")) {
    if (existing.length === 0) console.log("(no app-owned webhook subscriptions)");
    for (const s of existing) console.log(`${s.topic.padEnd(18)} ${s.format.padEnd(5)} ${s.url}   ${s.id}`);
    return;
  }

  for (const [topic, path] of TOPICS) {
    const url = BASE + path;
    const dup = existing.find((s) => s.topic === topic && s.url === url);
    if (dup) {
      console.log(`${topic.padEnd(18)} already registered -> ${url}`);
      continue;
    }
    const data = await adminGraphQL(CREATE, { topic, sub: { callbackUrl: url, format: "JSON" } });
    const errs = data.webhookSubscriptionCreate.userErrors;
    if (errs.length) {
      console.log(`${topic.padEnd(18)} FAILED: ${errs.map((e) => e.message).join("; ")}`);
      process.exitCode = 1;
      continue;
    }
    console.log(`${topic.padEnd(18)} registered -> ${url}`);
  }

  console.error("\nNow verify deliveries (step 4 in the header), then remove the old Notifications webhooks.");
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
