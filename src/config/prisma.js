// prisma.js
// Shared Prisma Client instance (Prisma 7 + MariaDB driver adapter).
//
// Prisma 7 replaced the built-in query engine with JS driver adapters, so the
// runtime connection is configured here (not via a `url` in schema.prisma).
// The adapter connects with the same DB_* credentials used elsewhere in config.

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaMariaDb } = require("@prisma/adapter-mariadb");

// Prisma returns MySQL BIGINT columns (e.g. Shopify product/variant IDs) as
// BigInt, which JSON.stringify cannot serialize. Render them as numbers to
// match the previous mysql2 behaviour (Shopify IDs are within JS safe-integer
// range). Set once, globally, before any response is serialized.
if (typeof BigInt.prototype.toJSON !== "function") {
  BigInt.prototype.toJSON = function () {
    return Number(this);
  };
}

const adapter = new PrismaMariaDb({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 10,
});

const prisma = new PrismaClient({ adapter });

module.exports = prisma;
