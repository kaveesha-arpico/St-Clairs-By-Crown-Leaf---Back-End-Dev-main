const express = require("express");
const {
  getTeaOptions,
  createCustomBlend,
  getCustomBlend,
} = require("../controllers/teaBlendController");
const asyncHandler = require("../middleware/asyncHandler");
const validate = require("../middleware/validate");
const { teaBlend } = require("../validators/schemas");

const router = express.Router();

router.get("/tea-options", asyncHandler(getTeaOptions));
router.post("/create-custom-blend", validate(teaBlend.createCustomBlend), asyncHandler(createCustomBlend));
router.get("/custom-blends/:ref", validate(teaBlend.getCustomBlend), asyncHandler(getCustomBlend));

module.exports = router;
