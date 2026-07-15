const Client = require("shopify-buy");
require("dotenv").config();

const client = Client.buildClient({
  domain: process.env.SHOPIFY_STORE_DOMAIN,
  storefrontAccessToken: process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN,
});


module.exports = client;


//https://admin.shopify.com/store/enc2fm-hd/settings/domains