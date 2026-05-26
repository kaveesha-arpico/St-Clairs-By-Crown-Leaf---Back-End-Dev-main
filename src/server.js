require('dotenv').config();
const app = require('./app');
const pool = require('./config/db');
const PORT = process.env.PORT || 3000;

// Test the database connection
(async () => {
  try {
    const [rows] = await pool.query('SELECT 1 + 1 AS result');
    console.log('Database Connection Test:', rows[0].result); // should log "2"
  } catch (error) {
    console.error('Database Connection Error:', error);
  }
})();

// Basic route
app.get('/', (req, res) => {
  res.send('Hello from the Tea Project Backend!');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
