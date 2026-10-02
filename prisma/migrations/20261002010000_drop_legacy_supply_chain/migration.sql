-- Drop the unused supply-chain skeleton from an earlier phase.
--
-- These seven tables modelled an earlier, thinner idea of traceability
-- (plantation -> field -> batch -> product, plus inventory/location). They were
-- superseded by the chain added in 20261002000000_add_traceability_chain and
-- were never wired into anything: no code outside their own CRUD controllers
-- ever read or wrote them.
--
-- Verified empty and unreferenced before writing this migration:
--   * 0 rows in all seven, in production (and in staging)
--   * no application code touches them outside their own controllers
--   * information_schema shows every foreign key aimed at them originates from
--     within the same seven tables — nothing outside points in
--   * production access logs show zero requests ever made to their endpoints
--
-- Their controllers, routes and validators are deleted in the same change, as
-- are their Prisma models. Note those routes sat behind nothing but the generic
-- customer JWT gate, so any signed-up storefront customer could call them —
-- removing them closes that off as well.
--
-- `product` here is the LEGACY table. It is unrelated to `product_variants`,
-- `shopify_products` and `shopify_store_products`, all of which stay.
--
-- Drop order follows the foreign keys inward-out, so no constraint is ever
-- violated mid-migration:
--   inventory -> {batch, location}
--   product   -> {batch}
--   batch     -> {factory, field}
--   field     -> {plantation}

DROP TABLE IF EXISTS `inventory`;
DROP TABLE IF EXISTS `product`;
DROP TABLE IF EXISTS `batch`;
DROP TABLE IF EXISTS `field`;
DROP TABLE IF EXISTS `location`;
DROP TABLE IF EXISTS `factory`;
DROP TABLE IF EXISTS `plantation`;
