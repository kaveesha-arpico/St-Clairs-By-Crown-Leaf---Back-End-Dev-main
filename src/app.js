const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const { protect } = require("./middleware/authMiddleware");
const { apiLimiter } = require("./middleware/rateLimiter");
const prisma = require("./config/prisma");

const app = express();

// Behind a reverse proxy / load balancer (AWS ALB, nginx), trust the first hop
// so req.ip reflects the real client. Rate limiting and Shopify's buyerIp both
// depend on this; without it every client looks like the proxy's IP.
app.set("trust proxy", 1);

// Security headers.
app.use(helmet());

// Request logging. Verbose "combined" (with client IPs/timestamps) in
// production; concise "dev" locally; silent under test.
if (process.env.NODE_ENV !== "test") {
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
}

// Allowed CORS origins come from FRONTEND_URL (comma-separated).
// If unset, allow all (preserves dev behaviour) but warn.
const allowedOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0) {
  console.warn(
    "[CORS] FRONTEND_URL not set — allowing all origins. Set it in .env to restrict."
  );
}

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser clients (no Origin header) and whitelisted origins.
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
};
app.use(cors(corsOptions));

// Health check for load balancers / uptime monitors. Kept above the rate
// limiter so frequent polling is never throttled. Pings the DB so a failed
// connection surfaces as 503 (unhealthy) rather than a false "ok".
app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.status(200).json({ status: "ok", db: "up" });
  } catch (err) {
    return res.status(503).json({ status: "error", db: "down" });
  }
});

//Import Route Modules
const customerRoutes = require("./routes/customerRoutes");
const addressRoutes = require("./routes/addressRoutes");
const orderRoutes = require("./routes/orderRoutes");
const orderAddressRoutes = require("./routes/orderAddressRoutes");
const plantationRoutes = require("./routes/plantationRoutes");
const batchRoutes = require("./routes/batchRoutes");
const factoryRoutes = require("./routes/factoryRoutes");
const fieldRoutes = require("./routes/fieldRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");
const locationRoutes = require("./routes/locationRoutes");
const productRoutes = require("./routes/productRoutes");
const authRoutes = require("./routes/authRoutes"); // Authentication routes
const contactRoutes = require("./routes/contactRoutes"); // Public contact form
const teaProductRoutes = require("./routes/teaProductsRoutes"); // Tea products routes
const teaOptionsRoutes = require("./routes/teaBlendRoutes"); // Tea options routes
const shopifyRoutes = require("./routes/shopifyRoutes");
const shopifyOrderRoutes = require("./routes/shopifyOrderRoutes"); // Shopify order routes
const storefrontRoutes = require("./routes/storefrontRoutes"); // Storefront GraphQL catalog
const shopifyWebhookRoutes = require("./routes/shopifyWebhookRoutes"); // Shopify order webhooks

//Middleware to parse JSON bodies. Capture the raw body so the Shopify
//webhook route can verify its HMAC signature against the exact bytes.
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

// App-wide rate limit on everything under /api (auth routes add a stricter
// limiter of their own on top of this).
app.use("/api", apiLimiter);

// ---- PUBLIC routes (no JWT required) ----
app.use("/api", authRoutes); // Authentication routes (login/signup)
app.use("/api", contactRoutes); // Public contact form (rate-limited, honeypot)
app.use("/api", teaProductRoutes); // Storefront tea products
app.use("/api", teaOptionsRoutes); // Storefront tea options / custom blends
app.use("/api", shopifyRoutes); // Storefront checkout, product listing, webhook, cart-status
app.use("/api", shopifyOrderRoutes); // Shopify order listing
app.use("/api", storefrontRoutes); // Storefront GraphQL catalog (products, cart)
app.use("/api", shopifyWebhookRoutes); // Shopify order webhooks (HMAC-verified)

// ---- AUTH GATE: every /api route below this line requires a valid JWT ----
app.use("/api", protect);

// ---- PROTECTED admin / CRUD routes ----
app.use("/api", customerRoutes);
app.use("/api", addressRoutes);
app.use("/api", orderRoutes);
app.use("/api", orderAddressRoutes);
app.use("/api", plantationRoutes);
app.use("/api", fieldRoutes);
app.use("/api", factoryRoutes);
app.use("/api", batchRoutes);
app.use("/api", productRoutes);
app.use("/api", inventoryRoutes);
app.use("/api", locationRoutes);

//This is for global error handling middleware.
//Logs full detail server-side; never leaks internals to the client.
app.use((err, req, res, next) => {
  // Malformed JSON body (thrown by express.json()).
  if (err.type === "entity.parse.failed") {
    return res
      .status(400)
      .json({ success: false, message: "Invalid JSON in request body." });
  }

  // Origin blocked by the CORS policy.
  if (err.message === "Not allowed by CORS") {
    return res
      .status(403)
      .json({ success: false, message: "Origin not allowed by CORS." });
  }

  console.error(err.stack || err);
  res
    .status(err.status || 500)
    .json({ success: false, message: "Something went wrong." });
});

//export the app for use in the server.js file
module.exports = app;
