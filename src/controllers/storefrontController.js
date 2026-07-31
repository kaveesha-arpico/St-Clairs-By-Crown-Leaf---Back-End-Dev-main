// storefrontController.js


const { storefrontGraphQL } = require("../lib/shopifyStorefront");


const PRODUCTS_QUERY = `
  query Products($first: Int!, $variants: Int!) {
    products(first: $first) {
      edges {
        node {
          id
          handle
          title
          description
          productType
          vendor
          featuredImage { url altText }
          variants(first: $variants) {
            edges {
              node {
                id
                title
                sku
                availableForSale
                selectedOptions { name value }
                price { amount currencyCode }
                image { url altText }
              }
            }
          }
        }
      }
    }
  }
`;

// Flatten Shopify's edges/node envelope into a clean, frontend-friendly shape.
function shapeProduct(node) {
  return {
    id: node.id,
    handle: node.handle,
    title: node.title,
    description: node.description,
    productType: node.productType,
    vendor: node.vendor,
    featuredImage: node.featuredImage || null,
    variants: node.variants.edges.map(({ node: v }) => ({
      id: v.id,
      title: v.title,
      sku: v.sku,
      availableForSale: v.availableForSale,
      selectedOptions: v.selectedOptions,
      price: v.price, // { amount, currencyCode } — Shopify is the source of truth
      image: v.image || null,
    })),
  };
}

// GET /api/storefront/products
const getStorefrontProducts = async (req, res) => {
  const first = Math.min(Number(req.query.limit) || 50, 250);

  const data = await storefrontGraphQL(PRODUCTS_QUERY, {
    first,
    variants: 100,
  });

  const products = data.products.edges.map(({ node }) => shapeProduct(node));

  return res.status(200).json({
    count: products.length,
    products,
  });
};

module.exports = { getStorefrontProducts };
