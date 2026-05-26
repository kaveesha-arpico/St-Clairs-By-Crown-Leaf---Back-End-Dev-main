const express = require("express");
const { signUp, login } = require("../controllers/authController");

const router = express.Router();

router.post("/auth/login", login);
router.post("/auth/signup", signUp);

module.exports = router;
