const Shopify = require("shopify-api-node");
const fs = require("fs");
const path = require("path");
const prisma = require("../config/prisma");
const {
  storefrontGraphQL,
  validateVariants,
} = require("../lib/shopifyStorefront");

require("dotenv").config();

// How long a confirmed-paid cart token stays valid for the frontend to observe.
const PAID_CART_TTL_MINUTES = 15;

// Authenticate the legacy REST client with the custom app's Admin API access
// token (the apiKey/password "private app" model Shopify retired). Modern GraphQL
// work uses src/lib/shopifyAdmin.js; this keeps the remaining REST calls working.
const { SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN } = process.env;

const shopify = new Shopify({
  shopName: SHOPIFY_STORE_DOMAIN,
  accessToken: SHOPIFY_ADMIN_ACCESS_TOKEN,
});


const createProduct = async (req, res) => {
  try {
    // Product data is now taken from the request body
    const { title, body_html, vendor, product_type, variants } = req.body;

    // Basic validation to ensure required fields are present
    if (!title || !body_html || !vendor || !product_type || !variants) {
      return res
        .status(400)
        .json({ message: "Missing required product fields" });
    }

    // Optional placeholder image. If the seed file is missing, create the
    // product without an image rather than throwing.
    let images;
    try {
      const imagePath = path.join(
        __dirname,
        "..",
        "seed",
        "data",
        "images",
        "tea-product-7.jpg"
      );
      const base64Image = fs.readFileSync(imagePath, { encoding: "base64" });
      images = [{ attachment: base64Image }];
    } catch (imgErr) {
      console.warn(
        "[Shopify] Seed image not found, creating product without image:",
        imgErr.message
      );
    }

    const product = {
      title,
      body_html,
      vendor,
      product_type,
      variants,
      ...(images ? { images } : {}),
    };

    const newProduct = await shopify.product.create(product);

    return res
      .status(201)
      .json({ message: "Product created successfully", product: newProduct });
  } catch (error) {
    console.error("Error creating product:", error);
    // Check for specific Shopify API errors if needed
    if (error.response) {
      return res
        .status(error.response.statusCode)
        .json({ message: "Shopify API Error", details: error.response.body });
    }
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

const getProducts = async (req, res) => {
  try {
    const products = await shopify.product.list();

    for (const product of products) {
      const {
        id: shopify_product_id,
        title,
        body_html: description,
        vendor,
        product_type,
        image,
        images,
        variants,
      } = product;

      // Use the main featured image URL as a fallback
      const main_image_src = image?.src || null;

      // Insert or update the main product data
      const productData = {
        title,
        description,
        vendor,
        product_type,
        image_src: main_image_src,
      };
      await prisma.shopify_store_products.upsert({
        where: { shopify_product_id: BigInt(shopify_product_id) },
        update: productData,
        create: { shopify_product_id: BigInt(shopify_product_id), ...productData },
      });

      for (const variant of variants) {
        const {
          id: shopify_variant_id,
          title: variant_title,
          price: variant_price,
          weight: variant_weight,
          image_id: variant_image_id,
        } = variant;

        let variant_image_src = main_image_src;

        if (variant_image_id && images) {
          const matchedImage = images.find(
            (img) => img.id === variant_image_id
          );
          if (matchedImage) {
            variant_image_src = matchedImage.src;
          }
        }

        const variantData = {
          shopify_product_id: BigInt(shopify_product_id),
          variant_title,
          variant_price,
          variant_weight,
          variant_image_src,
        };
        await prisma.product_variants.upsert({
          where: { shopify_variant_id: BigInt(shopify_variant_id) },
          update: variantData,
          create: { shopify_variant_id: BigInt(shopify_variant_id), ...variantData },
        });
      }
    }

    return res.status(200).json({
      message: "Products and variants retrieved and synced to DB successfully",
      count: products.length,
      products,
    });
  } catch (error) {
    console.error("Failed to retrieve or sync products:", error);

    return res.status(500).json({
      message: "Failed to retrieve or sync products",
      error: error.message,
    });
  }
};

/*.......SHOPIFY CHECKOUT------*/

const CART_CREATE_MUTATION = `
  mutation cartCreate($input: CartInput!) {
    cartCreate(input: $input) {
      cart {
        id
        checkoutUrl
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const checkout = async (req, res) => {
  const { items } = req.body;

  // Keep merchandiseId (variant GID) as the exact string the client sent.
  const lineItems = items.map((item) => ({
    merchandiseId: item.variantId,
    quantity: item.quantity,
  }));

  try {
    // 1) Validate the variants against Shopify. This stops a client from
    //    checking out a variant that doesn't exist or is sold out — the
    //    frontend must not be the only thing deciding what's purchasable.
    const { invalid, unavailable } = await validateVariants(
      lineItems.map((l) => l.merchandiseId),
      { buyerIp: req.ip }
    );

    if (invalid.length > 0 || unavailable.length > 0) {
      return res.status(400).json({
        error: "One or more items are invalid or unavailable.",
        invalid,
        unavailable,
      });
    }

    // 2) Create the Shopify cart and hand back its hosted checkout URL.
    const data = await storefrontGraphQL(
      CART_CREATE_MUTATION,
      { input: { lines: lineItems } },
      { buyerIp: req.ip }
    );

    const result = data.cartCreate;

    if (result.cart?.checkoutUrl) {
      return res.status(200).json({
        url: result.cart.checkoutUrl,
        cartId: result.cart.id,
      });
    }

    console.error("GraphQL UserErrors:", result.userErrors);
    return res.status(400).json({ error: result.userErrors });
  } catch (err) {
    console.error("Catch Block Error:", err.message);
    return res.status(500).json({ error: "Checkout creation failed" });
  }
};

/*.......GET ORDER DETAILS------*/
const getOrderDetails = async (req, res) => {
  try {
    const orders = await shopify.order.list();
    if (orders) {
      return res.status(200).json({
        message: "Orders retrieved successfully",
        orders_count: orders.length,
        orders: orders,
      });
    } else {
      return res.status(400).json({ message: "No orders found" });
    }
  } catch (error) {
    console.error("Failed to retrieve or sync orders:", error);
    return res.status(500).json({
      message: "Failed to retrieve or sync orders",
      error: error.message,
    });
  }
};

/*.......ORDER CONFIRM WITH WEBHOOK------*/
const paymentWebhookHandler = async (req, res) => {
  const orderData = req.body;
  const paidCartToken = orderData.cart_token;

  if (paidCartToken) {
    try {
      // Durably record the paid token (idempotent on retries).
      await prisma.paid_carts.upsert({
        where: { cart_token: paidCartToken },
        update: { paid_at: new Date() },
        create: { cart_token: paidCartToken },
      });
      console.log(
        `[Backend]: Payment confirmed for cart token: ${paidCartToken}`
      );
    } catch (err) {
      // Return non-2xx so Shopify retries the webhook instead of losing it.
      console.error("[Backend]: Failed to record paid cart:", err.message);
      return res.status(500).send("Failed to record payment.");
    }
  }
  console.log(`✅ Payment successful for Order ID: ${orderData.id}`);
  res.status(200).send("Webhook received.");
};

const getCartPaymentStatus = async (req, res) => {
  const { cartId } = req.params;

  try {
    // Prune expired tokens so stale confirmations never fire.
    await prisma.paid_carts.deleteMany({
      where: {
        paid_at: { lt: new Date(Date.now() - PAID_CART_TTL_MINUTES * 60 * 1000) },
      },
    });

    const found = await prisma.paid_carts.findUnique({
      where: { cart_token: cartId },
    });

    if (found) {
      // Consume the token so the cart is only cleared once.
      await prisma.paid_carts.delete({ where: { cart_token: cartId } });
      return res.json({ isPaid: true });
    }
    return res.json({ isPaid: false });
  } catch (err) {
    console.error("[Backend]: cart-status lookup failed:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to check cart status." });
  }
};

const getProductsFromShopify = async (req, res) => {
  try {
    const products = await shopify.product.list();

    for (const product of products) {
      const {
        id: shopify_product_id,
        title,
        body_html: description,
        vendor,
        product_type,
        images,
        variants,
        image,
      } = product;

      const main_image_src = image?.src || null;

      for (const variant of variants) {
        const { id: shopify_variant_id, price, image_id } = variant;

        let variant_image_src = main_image_src;

        if (image_id && images && images.length > 0) {
          const matchedImage = images.find((img) => img.id === image_id);
          if (matchedImage) {
            variant_image_src = matchedImage.src;
          }
        }

        const data = {
          shopify_product_id: BigInt(shopify_product_id),
          title,
          description,
          vendor,
          product_type,
          price,
          image_src: variant_image_src,
        };
        await prisma.shopify_products.upsert({
          where: { shopify_variant_id: BigInt(shopify_variant_id) },
          update: data,
          create: { shopify_variant_id: BigInt(shopify_variant_id), ...data },
        });
      }
    }

    return res.status(200).json({
      message: "Products and variants retrieved and synced to DB successfully",
      count: products.length,
      products,
    });
  } catch (error) {
    console.error("Failed to retrieve or sync products:", error);

    return res.status(500).json({
      message: "Failed to retrieve or sync products",
      error: error.message,
    });
  }
};

module.exports = {
  createProduct,
  getProducts,
  checkout,
  getOrderDetails,
  paymentWebhookHandler,
  getCartPaymentStatus,
  getProductsFromShopify,
};
