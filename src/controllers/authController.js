const prisma = require("../config/prisma");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

async function signUp(req, res) {
  const { first_name, last_name, email, password } = req.body;
  if (!first_name || !last_name || !email || !password) {
    return res.status(400).json({ message: "All fields are required." });
  }
  try {
    const existingCustomer = await prisma.customers.findUnique({
      where: { email },
      select: { customer_id: true },
    });
    if (existingCustomer) {
      return res.status(409).json({ message: "Email already in use." });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const created = await prisma.customers.create({
      data: { first_name, last_name, email, password: hashedPassword },
      select: { customer_id: true },
    });

    // Return a token too, so the frontend doesn't need a second /auth/login
    // round trip right after registering. Same payload shape as login.
    const payload = {
      userId: created.customer_id,
      email,
      first_name,
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN,
    });

    res.status(201).json({
      message: "Customer registered successfully.",
      userId: created.customer_id, // kept for backward compatibility
      token,
      user: payload,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error creating customer." });
  }
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "Email and password are required." });
  }
  try {
    const user = await prisma.customers.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password." });
    }
    // Contacts folded in from the old CRM table have no password and cannot log in.
    if (!user.password) {
      return res.status(401).json({ message: "Invalid email or password." });
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const payload = {
      userId: user.customer_id,
      email: user.email,
      first_name: user.first_name,
    };

    // Sign token
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN,
    });

    res
      .status(200)
      .json({ message: "Login successful.", token, user: payload });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error logging in." });
  }
}

// GET /auth/me — resolve the Bearer token back into the current user. Used by
// the frontend on reload (the login response's `user` is gone by then). `protect`
// has already verified the token and set req.user, returning 401 on a bad token.
async function me(req, res) {
  try {
    const user = await prisma.customers.findUnique({
      where: { customer_id: req.user.userId },
      select: {
        customer_id: true,
        first_name: true,
        last_name: true,
        email: true,
        contact_number: true,
      },
    });

    // Token is valid but the account no longer exists -> treat as signed out.
    if (!user) {
      return res.status(401).json({ message: "User no longer exists." });
    }

    return res.status(200).json({
      user: {
        id: user.customer_id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        contact_number: user.contact_number,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error fetching user." });
  }
}

module.exports = { signUp, login, me };
