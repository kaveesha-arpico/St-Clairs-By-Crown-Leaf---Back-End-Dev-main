const express = require("express");
const cors = require("cors");

const app = express();
// const corsOptions = {
//   origin: process.env.FRONTEND_URL,
// };
app.use(cors());

//Import Route Modules
const customerRoutes = require("./routes/customerRoutes");
const addressRoutes = require("./routes/addressRoutes");
const orderRoutes = require("./routes/orderRoutes");
const orderAddressRoutes = require("./routes/orderAddressRoutes");
const plantationRoutes = require("./routes/plantationRoutes");
const batchRoutes = require("./routes/batchRoutes");
const factoryRoutes = require("./routes/factoryRoutes");
const fieldRoutes = require("./routes/fieldRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");
const locationRoutes = require("./routes/locationRoutes");
const productRoutes = require("./routes/productRoutes");
const authRoutes = require("./routes/authRoutes"); // Authentication routes
const teaProductRoutes = require("./routes/teaProductsRoutes"); // Tea products routes
const teaOptionsRoutes = require("./routes/teaBlendRoutes"); // Tea options routes
const shopifyRoutes = require("./routes/shopifyRoutes");
const shopifyOrderRoutes = require("./routes/shopifyOrderRoutes"); // Shopify order routes

//Middleware to parse JSON bodies
app.use(express.json());

//Register Routes with Common prefix
app.use("/api", customerRoutes);
app.use("/api", addressRoutes);
app.use("/api", orderRoutes);
app.use("/api", orderAddressRoutes);
app.use("/api", plantationRoutes);
app.use("/api", fieldRoutes);
app.use("/api", factoryRoutes);
app.use("/api", batchRoutes);
app.use("/api", productRoutes);
app.use("/api", inventoryRoutes);
app.use("/api", locationRoutes);
app.use("/api", authRoutes); // Authentication routes
app.use("/api", teaProductRoutes); // Tea products routes
app.use("/api", teaOptionsRoutes); // Tea options routes
app.use("/api", shopifyRoutes);
app.use("/api", shopifyOrderRoutes); // Shopify order routes

//This is for global error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something went wrong!");
});

//export the app for use in the server.js file
module.exports = app;
