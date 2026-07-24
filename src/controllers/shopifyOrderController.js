const Shopify = require("shopify-api-node");

// Uses the custom app's Admin API access token (see shopifyController.js note).
const { SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN } = process.env;

const shopify = new Shopify({
  shopName: SHOPIFY_STORE_DOMAIN,
  accessToken: SHOPIFY_ADMIN_ACCESS_TOKEN,
});

/*.......RETRIVE ALL ORDERS FROM SHOPIFY STORE------*/

const getAllOrders = async (req, res) => {
  try {
    const orders = await shopify.order.list({ limit: 250 });
    res.status(200).json(orders);
    console.log("Orders fetched successfully:", orders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ message: "Failed to fetch orders" });
  } finally {
    console.log("getAllOrders function executed");
  }
};

module.exports = {
  getAllOrders,
};
