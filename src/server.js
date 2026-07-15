require('dotenv').config();

// Validate required env vars before anything that depends on them loads.
const validateEnv = require('./config/validateEnv');
validateEnv();

const app = require('./app');
const prisma = require('./config/prisma');
const PORT = process.env.PORT || 3000;

// Test the database connection
(async () => {
  try {
    const rows = await prisma.$queryRaw`SELECT 1 + 1 AS result`;
    console.log('Database Connection Test:', Number(rows[0].result));
  } catch (error) {
    console.error('Database Connection Error:', error);
  }
})();

// Basic route
app.get('/', (req, res) => {
  res.send('Hello from the Tea Project Backend!');
});

const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Graceful shutdown: close the HTTP server, then disconnect Prisma.
const shutdown = (signal) => {
  console.log(`\n${signal} received — shutting down...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
