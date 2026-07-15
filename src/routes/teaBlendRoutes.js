const express = require("express");
const { getTeaOptions, createCustomBlend } = require("../controllers/teaBlendController");
const asyncHandler = require("../middleware/asyncHandler");
const validate = require("../middleware/validate");
const { teaBlend } = require("../validators/schemas");

const router = express.Router();

router.get("/tea-options", asyncHandler(getTeaOptions));
router.post("/create-custom-blend", validate(teaBlend.createCustomBlend), asyncHandler(createCustomBlend));

module.exports = router;
