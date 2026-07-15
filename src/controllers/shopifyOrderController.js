const Shopify = require("shopify-api-node");
const { SHOPIFY_STORE_DOMAIN, SHOPIFY_API_KEY, SHOPIFY_API_PASSWORD } =
  process.env;

const shopify = new Shopify({
  shopName: SHOPIFY_STORE_DOMAIN,
  apiKey: SHOPIFY_API_KEY,
  password: SHOPIFY_API_PASSWORD,
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
