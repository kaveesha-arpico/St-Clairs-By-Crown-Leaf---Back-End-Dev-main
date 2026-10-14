const express = require("express");
const router = express.Router();

const asyncHandler = require("../middleware/asyncHandler");
const validate = require("../middleware/validate");
const { requireStaff, requireAdmin } = require("../middleware/requireStaff");
const { admin } = require("../validators/schemas");

const estate = require("../controllers/estateController");
const factory = require("../controllers/factoryController");
const lot = require("../controllers/lotController");
const packRun = require("../controllers/packRunController");
const packing = require("../controllers/packingController");
const orders = require("../controllers/adminOrderController");
const productInfo = require("../controllers/productTraceController");
const labels = require("../controllers/labelController");

// Every admin route lives in this one file, and the staff gate is applied here
// once, to the whole router — rather than per-route or spread across a file per
// entity. A forgotten `requireStaff` on a single route would silently expose
// the admin API to any logged-in shopper, and that is far easier to miss when
// the check is repeated twenty times. Here there is one line to get right.
//
// `protect` has already run (app.js gates all of /api), so req.user is set and
// the JWT signature is verified by the time anything below is reached.
router.use("/admin", requireStaff);

// ---- Estates (Plantation) ----
router.get("/admin/estates", asyncHandler(estate.listEstates));
router.get("/admin/estates/:id", validate(admin.idParam), asyncHandler(estate.getEstate));
router.post("/admin/estates", validate(admin.estateCreate), asyncHandler(estate.createEstate));
router.put("/admin/estates/:id", validate([...admin.idParam, ...admin.estateUpdate]), asyncHandler(estate.updateEstate));
router.delete("/admin/estates/:id", validate(admin.idParam), asyncHandler(estate.deactivateEstate));

// ---- Factories ----
router.get("/admin/factories", asyncHandler(factory.listFactories));
router.get("/admin/factories/:id", validate(admin.idParam), asyncHandler(factory.getFactory));
router.post("/admin/factories", validate(admin.factoryCreate), asyncHandler(factory.createFactory));
router.put("/admin/factories/:id", validate([...admin.idParam, ...admin.factoryUpdate]), asyncHandler(factory.updateFactory));
router.delete("/admin/factories/:id", validate(admin.idParam), asyncHandler(factory.deactivateFactory));

// ---- Lots ----
router.get("/admin/lots", asyncHandler(lot.listLots));
router.get("/admin/lots/:id", validate(admin.idParam), asyncHandler(lot.getLot));
router.post("/admin/lots", validate(admin.lotCreate), asyncHandler(lot.createLot));
router.put("/admin/lots/:id", validate([...admin.idParam, ...admin.lotUpdate]), asyncHandler(lot.updateLot));
router.delete("/admin/lots/:id", validate(admin.idParam), asyncHandler(lot.deleteLot));

// ---- Pack runs ----
// by-code is declared before /:id so a scanned barcode is never swallowed by
// the numeric-id route.
router.get("/admin/pack-runs/by-code/:code", asyncHandler(packRun.getPackRunByCode));
router.get("/admin/pack-runs", asyncHandler(packRun.listPackRuns));
router.get("/admin/pack-runs/:id", validate(admin.idParam), asyncHandler(packRun.getPackRun));
router.post("/admin/pack-runs", validate(admin.packRunCreate), asyncHandler(packRun.createPackRun));
router.put("/admin/pack-runs/:id", validate([...admin.idParam, ...admin.packRunUpdate]), asyncHandler(packRun.updatePackRun));
router.delete("/admin/pack-runs/:id", validate(admin.idParam), asyncHandler(packRun.deletePackRun));

// ---- Trace codes on a run (one per jar) + printable labels ----
router.get("/admin/pack-runs/:id/codes", validate(admin.idParam), asyncHandler(packRun.listCodes));
router.post("/admin/pack-runs/:id/codes", validate([...admin.idParam, ...admin.packRunAddCodes]), asyncHandler(packRun.addCodes));
router.get("/admin/pack-runs/:id/labels.pdf", validate(admin.idParam), asyncHandler(labels.packRunLabelsPdf));

// ---- Product trace details (Ingredients, Package Weight, reorder link) ----
// Keyed by Shopify product id (a string), so these do not use the numeric
// idParam. PUT upserts — there is no POST, because the key comes from Shopify.
router.get("/admin/product-info", asyncHandler(productInfo.listProductInfo));
router.get("/admin/product-info/:shopifyProductId", validate(admin.shopifyProductIdParam), asyncHandler(productInfo.getProductInfo));
router.put("/admin/product-info/:shopifyProductId", validate([...admin.shopifyProductIdParam, ...admin.productInfoUpsert]), asyncHandler(productInfo.upsertProductInfo));
router.delete("/admin/product-info/:shopifyProductId", validate(admin.shopifyProductIdParam), asyncHandler(productInfo.deleteProductInfo));

// ---- Packing (scan jars into an order's lines) ----
router.get("/admin/orders/:orderId/allocations", asyncHandler(packing.getOrderAllocations));
router.post("/admin/orders/:orderId/allocations", validate(admin.scans), asyncHandler(packing.recordScans));
router.delete("/admin/orders/:orderId/allocations/:code", asyncHandler(packing.removeScan));

// ---- Orders ----
router.get("/admin/orders", asyncHandler(orders.listOrders));
// Customer details come from Shopify and are the only PII the admin API
// exposes, so they need the admin role on top of staff access.
router.get("/admin/orders/:orderId/customer", requireAdmin, asyncHandler(orders.getOrderCustomer));

module.exports = router;
