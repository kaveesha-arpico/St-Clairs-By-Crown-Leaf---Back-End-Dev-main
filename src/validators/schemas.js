// schemas.js
// Reusable express-validator chains, grouped by entity. Each group exposes the
// field rules for create/update plus a shared `idParam` for /:id routes.
//
// Rules mirror the columns each controller actually writes, so invalid input is
// rejected with a clear 400 before it ever reaches the database.

const { body, param, query } = require("express-validator");

// Validates the numeric :id route parameter used by getById/update/delete.
const idParam = [
  param("id").isInt({ min: 1 }).withMessage("id must be a positive integer"),
];

// Generic helper: a required non-empty string field.
const requiredString = (field) =>
  body(field)
    .exists({ checkFalsy: true })
    .withMessage(`${field} is required`)
    .bail()
    .isString()
    .withMessage(`${field} must be a string`)
    .trim();

// Generic helper: an optional string (allows missing/empty).
const optionalString = (field) =>
  body(field).optional({ nullable: true }).isString().trim();

// A required positive-integer foreign key / numeric field.
const requiredInt = (field) =>
  body(field)
    .exists()
    .withMessage(`${field} is required`)
    .bail()
    .isInt({ min: 1 })
    .withMessage(`${field} must be a positive integer`);

// ---- Auth ----
const auth = {
  signup: [
    requiredString("first_name"),
    requiredString("last_name"),
    body("email").isEmail().withMessage("A valid email is required").normalizeEmail(),
    body("password")
      .isLength({ min: 6 })
      .withMessage("password must be at least 6 characters"),
  ],
  login: [
    body("email").isEmail().withMessage("A valid email is required").normalizeEmail(),
    body("password").notEmpty().withMessage("password is required"),
  ],
};

// ---- Contact form (public) ----
const contact = {
  create: [
    body("name")
      .exists({ checkFalsy: true })
      .withMessage("name is required")
      .bail()
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage("name must be 1-100 characters"),
    body("email")
      .exists({ checkFalsy: true })
      .withMessage("email is required")
      .bail()
      .isEmail()
      .withMessage("A valid email is required")
      .isLength({ max: 254 })
      .withMessage("email must be at most 254 characters")
      .normalizeEmail(),
    body("message")
      .exists({ checkFalsy: true })
      .withMessage("message is required")
      .bail()
      .isString()
      .trim()
      .isLength({ min: 1, max: 5000 })
      .withMessage("message must be 1-5000 characters"),
    // Honeypot. Real users never see `company`, so it should be empty. A filled
    // value is handled by the `honeypot` middleware (fake 201) BEFORE this runs;
    // here we only ensure it's a string so validation never errors on it.
    body("company").optional().isString(),
  ],
};

// ---- Customers ----
const customer = {
  create: [
    requiredString("first_name"),
    optionalString("last_name"),
    body("email").optional({ nullable: true }).isEmail().withMessage("email must be valid").normalizeEmail(),
    optionalString("contact_number"),
  ],
  update: [
    requiredString("first_name"),
    optionalString("last_name"),
    body("email").optional({ nullable: true }).isEmail().withMessage("email must be valid").normalizeEmail(),
    optionalString("contact_number"),
  ],
  idParam,
};

// ---- Addresses ----
const address = {
  create: [
    requiredInt("customer_id"),
    requiredString("street"),
    requiredString("city"),
    optionalString("state"),
    optionalString("zip_code"),
    optionalString("country"),
    body("is_default").optional().isBoolean().withMessage("is_default must be a boolean"),
  ],
  update: [
    optionalString("street"),
    optionalString("city"),
    optionalString("state"),
    optionalString("zip_code"),
    optionalString("country"),
    body("is_default").optional().isBoolean().withMessage("is_default must be a boolean"),
  ],
  customerIdParam: [
    param("customerId").isInt({ min: 1 }).withMessage("customerId must be a positive integer"),
  ],
  idParam,
};

// ---- Orders ----
const order = {
  create: [
    requiredInt("customer_id"),
    body("order_time").optional().isISO8601().withMessage("order_time must be a valid date/time"),
    body("quantity").optional().isInt({ min: 1 }).withMessage("quantity must be a positive integer"),
    body("total").optional().isFloat({ min: 0 }).withMessage("total must be a non-negative number"),
  ],
  update: [
    body("order_time").optional().isISO8601().withMessage("order_time must be a valid date/time"),
    body("quantity").optional().isInt({ min: 1 }).withMessage("quantity must be a positive integer"),
    body("total").optional().isFloat({ min: 0 }).withMessage("total must be a non-negative number"),
  ],
  idParam,
};

// ---- Order <-> Address links ----
const orderAddress = {
  create: [requiredInt("order_id"), requiredInt("address_id")],
  linkParams: [
    param("orderId").isInt({ min: 1 }).withMessage("orderId must be a positive integer"),
    param("addressId").isInt({ min: 1 }).withMessage("addressId must be a positive integer"),
  ],
  orderIdParam: [
    param("orderId").isInt({ min: 1 }).withMessage("orderId must be a positive integer"),
  ],
};

// ---- Tea blend ----
const teaBlend = {
  createCustomBlend: [
    requiredInt("baseTeaId"),
    body("quantity").isInt({ min: 1 }).withMessage("quantity must be a positive integer"),
    body("spices").isArray({ min: 1 }).withMessage("spices must be a non-empty array"),
    body("spices.*.id").isInt({ min: 1 }).withMessage("each spice.id must be a positive integer"),
    body("spices.*.percentage").isFloat({ min: 0, max: 100 }).withMessage("each spice.percentage must be 0-100"),
  ],
  getCustomBlend: [
    param("ref").notEmpty().withMessage("blend reference is required"),
  ],
};

// ---- Shopify checkout ----
const shopify = {
  checkout: [
    body("items").isArray({ min: 1 }).withMessage("items must be a non-empty array"),
    body("items.*.variantId").notEmpty().withMessage("each item needs a variantId"),
    body("items.*.quantity").isInt({ min: 1 }).withMessage("each item quantity must be a positive integer"),
  ],
};

// ---- Storefront cart ----
// Cart/line ids are Shopify GIDs (opaque strings), so they're checked for
// presence only — never parsed or reformatted.
const storefrontCart = {
  create: [
    body("items").optional().isArray().withMessage("items must be an array"),
    body("items.*.variantId").notEmpty().withMessage("each item needs a variantId"),
    body("items.*.quantity").isInt({ min: 1 }).withMessage("each item quantity must be a positive integer"),
  ],
  get: [
    query("id").notEmpty().withMessage("id (cart) is required"),
  ],
  addLines: [
    body("cartId").notEmpty().withMessage("cartId is required"),
    body("items").isArray({ min: 1 }).withMessage("items must be a non-empty array"),
    body("items.*.variantId").notEmpty().withMessage("each item needs a variantId"),
    body("items.*.quantity").isInt({ min: 1 }).withMessage("each item quantity must be a positive integer"),
  ],
  updateLines: [
    body("cartId").notEmpty().withMessage("cartId is required"),
    body("lines").isArray({ min: 1 }).withMessage("lines must be a non-empty array"),
    body("lines.*.id").notEmpty().withMessage("each line needs an id"),
    body("lines.*.quantity").isInt({ min: 0 }).withMessage("each line quantity must be 0 or more"),
  ],
  removeLines: [
    body("cartId").notEmpty().withMessage("cartId is required"),
    body("lineIds").isArray({ min: 1 }).withMessage("lineIds must be a non-empty array"),
    body("lineIds.*").notEmpty().withMessage("each lineId must be non-empty"),
  ],
  buyerIdentity: [
    body("cartId").notEmpty().withMessage("cartId is required"),
  ],
};

// ---- Staff auth (admin site) ----
const staffAuth = {
  login: [
    body("email").isEmail().withMessage("A valid email is required").normalizeEmail(),
    body("password").notEmpty().withMessage("password is required"),
  ],
};

// ---- Traceability admin API ----
// Create rules require their fields; update rules make everything optional so a
// PUT can change one column without resending the whole record.
const admin = {
  idParam,

  estateCreate: [
    requiredString("name").isLength({ max: 150 }),
    optionalString("region").isLength({ max: 100 }),
  ],
  estateUpdate: [
    optionalString("name").isLength({ min: 1, max: 150 }),
    optionalString("region").isLength({ max: 100 }),
    body("is_active").optional().isBoolean().withMessage("is_active must be a boolean"),
  ],

  factoryCreate: [requiredString("name").isLength({ max: 150 })],
  factoryUpdate: [
    optionalString("name").isLength({ min: 1, max: 150 }),
    body("is_active").optional().isBoolean().withMessage("is_active must be a boolean"),
  ],

  lotCreate: [
    requiredString("lot_number").isLength({ max: 50 }),
    requiredInt("estate_id"),
    requiredInt("factory_id"),
    optionalString("grade").isLength({ max: 100 }),
  ],
  lotUpdate: [
    optionalString("lot_number").isLength({ min: 1, max: 50 }),
    body("estate_id").optional().isInt({ min: 1 }),
    body("factory_id").optional().isInt({ min: 1 }),
    optionalString("grade").isLength({ max: 100 }),
  ],

  packRunCreate: [
    requiredString("pack_run_code").isLength({ max: 50 }),
    requiredInt("lot_id"),
    body("packed_date").isISO8601().withMessage("packed_date must be a date (YYYY-MM-DD)"),
    optionalString("shopify_product_id").isLength({ max: 32 }),
    optionalString("sku").isLength({ max: 100 }),
    body("quantity_packed").optional({ nullable: true }).isInt({ min: 0 }),
  ],
  packRunUpdate: [
    optionalString("pack_run_code").isLength({ min: 1, max: 50 }),
    body("lot_id").optional().isInt({ min: 1 }),
    body("packed_date").optional().isISO8601(),
    optionalString("shopify_product_id").isLength({ max: 32 }),
    optionalString("sku").isLength({ max: 100 }),
    body("quantity_packed").optional({ nullable: true }).isInt({ min: 0 }),
  ],

  // Several scans submitted together. Quantities must be positive: a zero or
  // negative allocation would pass the "not over-allocated" check while
  // recording a link to a pack run that contributed nothing.
  allocations: [
    body("allocations").isArray({ min: 1 }).withMessage("allocations must be a non-empty array"),
    body("allocations.*.line_item_id").notEmpty().withMessage("line_item_id is required"),
    body("allocations.*.pack_run_code").notEmpty().withMessage("pack_run_code is required"),
    body("allocations.*.quantity").isInt({ min: 1 }).withMessage("quantity must be at least 1"),
  ],
};

module.exports = {
  idParam,
  auth,
  contact,
  customer,
  address,
  order,
  orderAddress,
  teaBlend,
  shopify,
  storefrontCart,
  staffAuth,
  admin,
};
