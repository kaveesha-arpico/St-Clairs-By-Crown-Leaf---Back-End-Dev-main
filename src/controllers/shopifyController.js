const Shopify = require("shopify-api-node");
const fs = require("fs");
const path = require("path");
const db = require("../config/db");
const paidCartIds = new Set();

const imagePath = path.join(
  __dirname,
  "..",
  "seed",
  "data",
  "images",
  "tea-product-7.jpg"
);
const base64Image = fs.readFileSync(imagePath, { encoding: "base64" });

require("dotenv").config();

const { SHOPIFY_STORE_DOMAIN, SHOPIFY_API_KEY, SHOPIFY_API_PASSWORD } =
  process.env;

const shopify = new Shopify({
  shopName: SHOPIFY_STORE_DOMAIN,
  apiKey: SHOPIFY_API_KEY,
  password: SHOPIFY_API_PASSWORD,
});

/*.......CREATE PRODUCTS IN SHOPIFY STORE------*/
const createProduct = async (req, res) => {
  try {
    // Product data is now taken from the request body
    const { title, body_html, vendor, product_type, variants } = req.body;
    const imagePath = path.join(
      __dirname,
      "..",
      "seed",
      "data",
      "images",
      "tea-product-7.jpg"
    );
    const base64Image = fs.readFileSync(imagePath, { encoding: "base64" });

    // Basic validation to ensure required fields are present
    if (!title || !body_html || !vendor || !product_type || !variants) {
      return res
        .status(400)
        .json({ message: "Missing required product fields" });
    }

    const product = {
      title,
      body_html,
      vendor,
      product_type,
      variants,
      images: [
        {
          attachment: base64Image,
        },
      ],
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

      // First, insert or update the main product data
      const productQuery = `
        INSERT INTO shopify_store_products 
          (shopify_product_id, title, description, vendor, product_type, image_src)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          title = VALUES(title),
          description = VALUES(description),
          vendor = VALUES(vendor),
          product_type = VALUES(product_type),
          image_src = VALUES(image_src),
          updated_at = CURRENT_TIMESTAMP
      `;

      await db.query(productQuery, [
        shopify_product_id,
        title,
        description,
        vendor,
        product_type,
        main_image_src, 
      ]);

   
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

        const variantQuery = `
          INSERT INTO product_variants
           (shopify_product_id, shopify_variant_id, variant_title, variant_price, variant_weight, variant_image_src) 
          VALUES (?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            variant_title = VALUES(variant_title),
            variant_price = VALUES(variant_price),
            variant_weight = VALUES(variant_weight),
            variant_image_src = VALUES(variant_image_src)
        `;

        await db.query(variantQuery, [
          shopify_product_id,
          shopify_variant_id,
          variant_title,
          variant_price,
          variant_weight,
          variant_image_src, 
        ]);
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
const checkout = async (req, res) => {
  const { items } = req.body;

  const lineItems = items.map((item) => ({
    merchandiseId: item.variantId,
    quantity: item.quantity,
  }));

  const mutation = `
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

  const variables = {
    input: {
      lines: lineItems,
    },
  };

  try {
    const response = await fetch(
      `https://${process.env.SHOPIFY_STORE_DOMAIN}/api/2024-01/graphql.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Storefront-Access-Token":
            process.env.SHOPIFY_STOREFRONT_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: mutation,
          variables: variables,
        }),
      }
    );

    const data = await response.json();
    console.log(data);

    if (data.data.cartCreate.cart?.checkoutUrl) {
      res.status(200).json({
        url: data.data.cartCreate.cart.checkoutUrl,
        cartId: data.data.cartCreate.cart.id,
      });
    } else {
      console.error("GraphQL UserErrors:", data.data.cartCreate.userErrors);
      res.status(400).json({ error: data.data.cartCreate.userErrors });
    }
  } catch (err) {
    console.error("Catch Block Error:", err);
    res.status(500).json({ error: "Checkout creation failed" });
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
  console.log(orderData);
  console.log(paidCartToken);
  if (paidCartToken) {
    console.log(
      `[Backend]: Webhook received! Payment confirmed for cart token: ${paidCartToken}`
    );
    // Add the paid token to temorary storage
    paidCartIds.add(paidCartToken);
    setTimeout(() => {
      paidCartIds.delete(paidCartToken);
      console.log(`[Backend]: Cleaned up old cart token: ${paidCartToken}`);
    }, 1000 * 60 * 15);
  }
  console.log(`✅ Payment successful for Order ID: ${orderData.id}`);
  res.status(200).send("Webhook received.");
};
const getCartPaymentStatus = async (req, res) => {
  const { cartId } = req.params;
  console.log(`[Backend]: Frontend is asking about cart token: ${cartId}`);
  console.log(`[Backend]: Current paidCartIds:`, paidCartIds);

  if (paidCartIds.has(cartId)) {
    console.log(`[Backend]: Match found! Telling frontend to clear cart.`);
    paidCartIds.delete(cartId);
    res.json({ isPaid: true });
  } else {
    console.log(`[Backend]: No match found.`);
    res.json({ isPaid: false });
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
        const {
          id: shopify_variant_id,
          price,
          image_id,
        } = variant;
 
        let variant_image_src = main_image_src;
 
       
        if (image_id && images && images.length > 0) {
          const matchedImage = images.find((img) => img.id === image_id);
          if (matchedImage) {
            variant_image_src = matchedImage.src;
          }
        }
 
        const query = `
          INSERT INTO shopify_products
            (shopify_product_id, shopify_variant_id, title, description, vendor, product_type, price, image_src)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            title = VALUES(title),
            description = VALUES(description),
            vendor = VALUES(vendor),
            product_type = VALUES(product_type),
            price = VALUES(price),
            image_src = VALUES(image_src)
        `;
 
        await db.query(query, [
          shopify_product_id,
          shopify_variant_id,
          title,
          description,
          vendor,
          product_type,
          price,
          variant_image_src,
        ]);
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
