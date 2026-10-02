#!/usr/bin/env node
// createStaffUser.js
// Creates or updates a staff account for the admin site.
//
// This exists instead of a signup endpoint. An HTTP route that mints privileged
// accounts is the single most valuable thing an attacker could find, so staff
// accounts are only creatable by someone who can already run commands on the
// server.
//
// Usage (from the project root, or inside the backend container):
//   node scripts/createStaffUser.js <email> <name> <role>
//   node scripts/createStaffUser.js kaveesha@crownandleaf.uk "Kaveesha" admin
//
// The password is NOT a command-line argument on purpose: anything typed as an
// argument lands in your shell history and in the process list, where other
// users on the box can read it. The script generates a strong password and
// prints it once instead.
//
// Roles:
//   staff  - full access to the traceability admin API
//   admin  - the above, plus customer details on the order list
//
// Re-running for an existing email RESETS that account's password and
// reactivates it, which is also how you recover a locked-out colleague.

require("dotenv").config();
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const prisma = require("../src/config/prisma");

const ROLES = ["staff", "admin"];

// Password alphabet excludes characters that are ambiguous when read aloud or
// copied off a screen, since this gets handed over by message or in person.
const PASSWORD_ALPHABET =
  "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PASSWORD_LENGTH = 20;

function generatePassword() {
  const bytes = crypto.randomBytes(PASSWORD_LENGTH * 2);
  let out = "";
  for (const byte of bytes) {
    // Reject the biased remainder so every character is equally likely.
    const limit =
      Math.floor(256 / PASSWORD_ALPHABET.length) * PASSWORD_ALPHABET.length;
    if (byte >= limit) continue;
    out += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length];
    if (out.length === PASSWORD_LENGTH) break;
  }
  return out;
}

async function main() {
  const [email, name, role = "staff"] = process.argv.slice(2);

  if (!email || !name) {
    console.error(
      "\nUsage: node scripts/createStaffUser.js <email> <name> [staff|admin]\n" +
        '  e.g. node scripts/createStaffUser.js ann@crownandleaf.uk "Ann Perera" admin\n'
    );
    process.exit(1);
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error(`\n"${email}" does not look like an email address.\n`);
    process.exit(1);
  }

  if (!ROLES.includes(role)) {
    console.error(`\nRole must be one of: ${ROLES.join(", ")}\n`);
    process.exit(1);
  }

  const password = generatePassword();
  const hashed = await bcrypt.hash(password, 10);

  const existing = await prisma.staff_users.findUnique({ where: { email } });

  const staff = await prisma.staff_users.upsert({
    where: { email },
    update: { name, role, password: hashed, is_active: true },
    create: { email, name, role, password: hashed },
    select: { staff_id: true, email: true, name: true, role: true },
  });

  console.log(
    `\n${existing ? "Updated" : "Created"} staff account #${staff.staff_id}\n` +
      `  email : ${staff.email}\n` +
      `  name  : ${staff.name}\n` +
      `  role  : ${staff.role}\n` +
      `\n  password: ${password}\n` +
      `\nThis password is shown ONCE and is not recoverable — only its hash is\n` +
      `stored. Send it over something private, and re-run this script to reset\n` +
      `it if it is ever lost or exposed.\n` +
      (existing
        ? "\nNOTE: this account already existed. Its password has been RESET and\n" +
          "the account reactivated.\n"
        : "")
  );
}

main()
  .catch((err) => {
    console.error("\nFailed to create staff account:", err.message, "\n");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
