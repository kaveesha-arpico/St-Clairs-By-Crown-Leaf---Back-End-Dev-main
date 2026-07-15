// authMiddleware.js
// Verifies a JWT from the Authorization header and attaches the decoded
// payload to req.user. Returns 401 on any failure.

const jwt = require("jsonwebtoken");

function protect(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res
      .status(401)
      .json({ message: "Authentication required. Provide a Bearer token." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { userId, email, first_name }
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

module.exports = { protect };
