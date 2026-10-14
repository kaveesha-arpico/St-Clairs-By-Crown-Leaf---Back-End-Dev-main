-- Add the reorder link to a product's trace record.
--
-- The public trace page is the one moment a customer is holding the tea and
-- thinking about it, so a "buy this again" link belongs there. Stored as a full
-- URL rather than a Shopify handle: staff can then point it at a collection, a
-- campaign page or a different domain without the frontend having to know how
-- our product URLs are built.
--
-- Nullable — a product with no link set simply has no reorder button.
ALTER TABLE `product_trace_info`
  ADD COLUMN `product_url` VARCHAR(500) NULL AFTER `package_weight_g`;
