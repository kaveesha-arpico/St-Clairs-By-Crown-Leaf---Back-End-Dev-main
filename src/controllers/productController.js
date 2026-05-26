const pool = require("../config/db");

//CRUD operations for product controller

// CREATE a new product traceability record
exports.createProduct = async (req, res) => {
  try {
    const { batch_id, quantity, product_name } = req.body;
    const [result] = await pool.query(
      "INSERT INTO product (batch_id, quantity, product_name) VALUES (?, ?, ?)",
      [batch_id, quantity, product_name]
    );
    res.status(201).json({
      traceability_id: result.insertId,
      batch_id,
      quantity,
      product_name,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error creating product" });
  }
};

// READ all products
exports.getAllProducts = async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM product");
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error fetching products" });
  }
};

// READ one product by id
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      "SELECT * FROM product WHERE traceability_id = ?",
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.status(200).json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error fetching product" });
  }
};

// UPDATE a product
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { batch_id, quantity, product_name } = req.body;
    const [result] = await pool.query(
      "UPDATE product SET batch_id = ?, quantity = ?, product_name = ? WHERE traceability_id = ?",
      [batch_id, quantity, product_name, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.status(200).json({ message: "Product updated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error updating product" });
  }
};

// DELETE a product
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query(
      "DELETE FROM product WHERE traceability_id = ?",
      [id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.status(200).json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error deleting product" });
  }
};
