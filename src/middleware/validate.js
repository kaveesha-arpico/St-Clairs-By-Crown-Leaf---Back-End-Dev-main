// validate.js
// Runs a set of express-validator chains and, if any fail, short-circuits with
// a standardized 400 response. Success responses are left untouched.

const { validationResult } = require("express-validator");

const validate = (validations) => async (req, res, next) => {
  await Promise.all(validations.map((v) => v.run(req)));

  const result = validationResult(req);
  if (result.isEmpty()) {
    return next();
  }

  return res.status(400).json({
    success: false,
    message: "Validation failed",
    errors: result.array().map((e) => ({ field: e.path, message: e.msg })),
  });
};

module.exports = validate;
