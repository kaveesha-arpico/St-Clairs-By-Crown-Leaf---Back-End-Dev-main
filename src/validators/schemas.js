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

// ---- Supply chain ----
const plantation = {
  create: [requiredString("plantation_name"), optionalString("tea_grade")],
  update: [requiredString("plantation_name"), optionalString("tea_grade")],
  idParam,
};

const field = {
  create: [requiredInt("plantation_id"), optionalString("field_information")],
  update: [requiredInt("plantation_id"), optionalString("field_information")],
  idParam,
};

const factory = {
  create: [requiredString("factory_name"), optionalString("other_info")],
  update: [requiredString("factory_name"), optionalString("other_info")],
  idParam,
};

const batch = {
  create: [
    requiredInt("factory_id"),
    requiredInt("field_id"),
    body("harvested_date").optional().isISO8601().withMessage("harvested_date must be a valid date"),
  ],
  update: [
    requiredInt("factory_id"),
    requiredInt("field_id"),
    body("harvested_date").optional().isISO8601().withMessage("harvested_date must be a valid date"),
  ],
  idParam,
};

const inventory = {
  create: [
    requiredInt("location_id"),
    requiredInt("batch_id"),
    body("quantity").isInt({ min: 0 }).withMessage("quantity must be a non-negative integer"),
  ],
  update: [
    requiredInt("location_id"),
    requiredInt("batch_id"),
    body("quantity").isInt({ min: 0 }).withMessage("quantity must be a non-negative integer"),
  ],
  idParam,
};

const location = {
  create: [requiredString("location_name"), optionalString("other_info")],
  update: [requiredString("location_name"), optionalString("other_info")],
  idParam,
};

const product = {
  create: [
    requiredInt("batch_id"),
    body("quantity").isInt({ min: 0 }).withMessage("quantity must be a non-negative integer"),
    requiredString("product_name"),
  ],
  update: [
    requiredInt("batch_id"),
    body("quantity").isInt({ min: 0 }).withMessage("quantity must be a non-negative integer"),
    requiredString("product_name"),
  ],
  idParam,
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

module.exports = {
  idParam,
  auth,
  contact,
  customer,
  address,
  order,
  orderAddress,
  plantation,
  field,
  factory,
  batch,
  inventory,
  location,
  product,
  teaBlend,
  shopify,
  storefrontCart,
};
