// staffAuthController.js
// Login for the admin site. Kept entirely separate from authController (the
// storefront's customer login) so the two can never be confused for each other.
//
// The token issued here carries `typ: "staff"`. Both token kinds are signed
// with the same JWT_SECRET, so that claim is the only thing distinguishing a
// staff session from a shopper's — see middleware/requireStaff.js.

const prisma = require("../config/prisma");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// POST /api/staff/auth/login
async function login(req, res) {
  const { email, password } = req.body;

  const staff = await prisma.staff_users.findUnique({ where: { email } });

  // One message and one status for every failure below — unknown email,
  // deactivated account and wrong password are indistinguishable from outside,
  // so the endpoint can't be used to discover who has an account.
  const reject = () =>
    res.status(401).json({ message: "Invalid email or password." });

  if (!staff || !staff.is_active) {
    // Hash anyway on the "no such user" path. Skipping it would return
    // noticeably faster than a real password check and leak which emails exist.
    await bcrypt.compare(password, "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
    return reject();
  }

  const passwordValid = await bcrypt.compare(password, staff.password);
  if (!passwordValid) return reject();

  // Best-effort: a failed timestamp write must not cost someone their login.
  await prisma.staff_users
    .update({
      where: { staff_id: staff.staff_id },
      data: { last_login_at: new Date() },
    })
    .catch(() => {});

  const payload = {
    staffId: staff.staff_id,
    email: staff.email,
    name: staff.name,
    role: staff.role,
    // The claim the admin API gates on. Customer tokens have no `typ`.
    typ: "staff",
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

  return res
    .status(200)
    .json({ message: "Login successful.", token, user: payload });
}

// GET /api/staff/auth/me
// Re-hydrates the admin UI after a page reload, the same way /auth/me does for
// the storefront. Re-reads the row rather than trusting the token, so an
// account deactivated mid-session stops working at the next page load instead
// of lingering until the token expires.
async function me(req, res) {
  const staff = await prisma.staff_users.findUnique({
    where: { staff_id: req.user.staffId },
    select: {
      staff_id: true,
      email: true,
      name: true,
      role: true,
      is_active: true,
    },
  });

  if (!staff || !staff.is_active) {
    return res.status(401).json({ message: "Staff account is no longer active." });
  }

  return res.status(200).json({
    user: {
      staffId: staff.staff_id,
      email: staff.email,
      name: staff.name,
      role: staff.role,
      typ: "staff",
    },
  });
}

module.exports = { login, me };
