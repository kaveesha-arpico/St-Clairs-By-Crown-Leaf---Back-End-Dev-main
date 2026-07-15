const prisma = require("../config/prisma");

// CREATE a new product traceability record
exports.createProduct = async (req, res) => {
  try {
    const { batch_id, quantity, product_name } = req.body;
    const created = await prisma.product.create({
      data: { batch_id, quantity, product_name },
      select: { traceability_id: true },
    });
    res.status(201).json({
      traceability_id: created.traceability_id,
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
    const rows = await prisma.product.findMany();
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
    const row = await prisma.product.findUnique({ where: { traceability_id: Number(id) } });
    if (!row) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.status(200).json(row);
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
    await prisma.product.update({
      where: { traceability_id: Number(id) },
      data: { batch_id, quantity, product_name },
    });
    res.status(200).json({ message: "Product updated successfully" });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Product not found" });
    }
    console.error(error);
    res.status(500).json({ error: "Error updating product" });
  }
};

// DELETE a product
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.product.delete({ where: { traceability_id: Number(id) } });
    res.status(200).json({ message: "Product deleted successfully" });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Product not found" });
    }
    console.error(error);
    res.status(500).json({ error: "Error deleting product" });
  }
};
