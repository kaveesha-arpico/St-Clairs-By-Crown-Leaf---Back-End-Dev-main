const pool = require("../config/db");

async function createTeaProduct(req, res) {
  try {
    const {
      name,
      category,
      price,
      originalPrice,
      imageSrc,
      tagline,
      rating,
      reviewsCount,
    } = req.body;

    if (!name || !category || !price) {
      return res.status(400).json({
        error: "product_name, category, and price are required.",
      });
    }

    await pool.query(
      `INSERT INTO tea_products
      (name, category, price, originalPrice, imageSrc, tagline, rating, reviewsCount)
      VALUES (?, ?, ?, ?, ?, ?, ?,?)`,
      [
        name,
        category,
        price,
        originalPrice || 0,
        imageSrc || "",
        tagline || "",
        rating || 0,
        reviewsCount || 0,
      ]
    );


    const newTeaProduct = {
      name,
      category,
      price,
      reviewsCount,
      originalPrice: originalPrice || 0,
      rating: rating || 0,
      imageSrc: imageSrc || "",
      tagline: tagline || "",
    };

    console.log("Tea product created:", newTeaProduct);
    return res.status(201).json(newTeaProduct);
  } catch (error) {
    console.error("Error creating tea product:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function customOrder(req, res) {
  const { baseTeaId, quantity, spices } = req.body;
  if (!baseTeaId || !quantity || !spices) {
    return res.status(400).json({ message: "Invalid request" });
  }
  const connection = await pool.getConnection();
  try {
    const [orderResult] = await connection.query(
      "INSERT INTO custom_orders (base_tea_id, quantity, created_at) VALUES (?, ?, NOW())",
      [baseTeaId, quantity]
    );
    const orderId = orderResult.insertId;
    for (const spice of spices) {
      await connection.query(
        "INSERT INTO order_spices (order_id, spice_name, percentage) VALUES (?, ?, ?)",
        [orderId, spice.spice, spice.percentage]
      );
    }
    await connection.commit();
    res.json({ message: "Order saved successfully", orderId });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ message: "Server error" });
  } finally {
    connection.release();
  }
}

async function getAllTeaProducts(req, res) {
  try {
    const [rows] = await pool.query("SELECT * FROM tea_products");
    if (rows.length === 0) {
      return res.status(404).json({ message: "No tea products found" });
    }
    return res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching tea products:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function getAllTeaShopifyProducts(req, res) {
  try {
    const [rows] = await pool.query("SELECT * FROM shopify_products");
    if (rows.length === 0) {
      return res.status(404).json({ message: "No tea products found from shopify tea table" });
    }
    return res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching tea products:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
async function getAllTeaShopifyProductsVariants(req, res) {
  try {
    const [rows] = await pool.query("SELECT * FROM product_variants");
    if (rows.length === 0) {
      return res.status(404).json({ message: "No tea products variants found from shopify tea product variants table" });
    }
    return res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching tea products variants:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}


module.exports = { createTeaProduct, customOrder, getAllTeaProducts,getAllTeaShopifyProducts,getAllTeaShopifyProductsVariants };
