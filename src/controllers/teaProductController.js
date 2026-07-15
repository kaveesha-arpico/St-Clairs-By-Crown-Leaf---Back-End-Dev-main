const prisma = require("../config/prisma");

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

    await prisma.tea_products.create({
      data: {
        name,
        category,
        price,
        originalPrice: originalPrice || 0,
        imageSrc: imageSrc || "",
        tagline: tagline || "",
        rating: rating || 0,
        reviewsCount: reviewsCount || 0,
      },
    });

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
  try {
    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.custom_orders.create({
        data: { base_tea_id: baseTeaId, quantity, created_at: new Date() },
        select: { id: true },
      });
      await tx.order_spices.createMany({
        data: spices.map((spice) => ({
          order_id: created.id,
          spice_name: spice.spice,
          percentage: spice.percentage,
        })),
      });
      return created;
    });
    res.json({ message: "Order saved successfully", orderId: order.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
}

async function getAllTeaProducts(req, res) {
  try {
    const rows = await prisma.tea_products.findMany();
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
    const rows = await prisma.shopify_products.findMany();
    if (rows.length === 0) {
      return res.status(404).json({ message: "No tea products found from shopify tea table" });
    }
    return res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching tea products:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function getAllTeaShopifyProductsVariants(req, res) {
  try {
    const rows = await prisma.product_variants.findMany();
    if (rows.length === 0) {
      return res.status(404).json({ message: "No tea products variants found from shopify tea product variants table" });
    }
    return res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching tea products variants:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = { createTeaProduct, customOrder, getAllTeaProducts, getAllTeaShopifyProducts, getAllTeaShopifyProductsVariants };
