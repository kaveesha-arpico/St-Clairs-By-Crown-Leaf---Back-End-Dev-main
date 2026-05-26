const pool = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

async function signUp(req, res) {
  const { first_name, last_name, email, password } = req.body;
  if (!first_name || !last_name || !email || !password) {
    return res.status(400).json({ message: "All fields are required." });
  }
  try {
    const [existingCustomer] = await pool.query(
      "SELECT id FROM customer WHERE email = ?",
      [email]
    );
    if (existingCustomer.length > 0) {
      return res.status(409).json({ message: "Email already in use." });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      `INSERT INTO customer (first_name, last_name, email, password)
       VALUES (?, ?, ?, ?)`,
      [first_name, last_name, email, hashedPassword]
    );
    res.status(201).json({
      message: "Customer registered successfully.",
      userId: result.insertId,
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
    const [rows] = await pool.query("SELECT * FROM customer WHERE email = ?", [
      email,
    ]);
    if (rows.length === 0) {
      return res.status(401).json({ message: "Invalid email or password." });
    }
    const user = rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const payload = {
      userId: user.id,
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
    res.status(500).json({ message: "Error logging in.", error });
  }
}

module.exports = { signUp, login };
