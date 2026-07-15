const express = require("express");
const { getAllOrders } = require("../controllers/shopifyOrderController");

const router = express.Router();

router.get("/get-all-orders", getAllOrders);
module.exports = router;
