const express = require("express");
const { getTeaOptions,createCustomBlend } = require("../controllers/teaBlendController");

const router = express.Router();

router.get("/tea-options", getTeaOptions);
router.post("/create-custom-blend", createCustomBlend);

module.exports = router;