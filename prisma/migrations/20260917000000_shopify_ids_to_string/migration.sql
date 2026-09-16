-- Shopify order/line-item/product/variant ids were BIGINT and lost precision
-- (parsed through a 53-bit JS Number). Switch them to strings so they stay
-- exact. Existing rows are corrupt test data; clear children then parent so no
-- FK violation, then drop the constraint before altering the id columns.
DELETE FROM `shopify_order_line_items`;
DELETE FROM `shopify_orders`;

ALTER TABLE `shopify_order_line_items` DROP FOREIGN KEY `fk_line_items_shopify_order`;

-- AlterTable: shopify_orders id -> string, add cancelled_at (cancellation is the
-- signal that must stop a downstream dispense; it is not carried by financial_status).
ALTER TABLE `shopify_orders`
  MODIFY `shopify_order_id` VARCHAR(32) NOT NULL,
  ADD COLUMN `cancelled_at` DATETIME(0) NULL AFTER `cart_token`;

-- AlterTable: line-item ids -> strings.
ALTER TABLE `shopify_order_line_items`
  MODIFY `line_item_id` VARCHAR(32) NOT NULL,
  MODIFY `shopify_order_id` VARCHAR(32) NOT NULL,
  MODIFY `product_id` VARCHAR(32) NULL,
  MODIFY `variant_id` VARCHAR(32) NULL;

-- Recreate the foreign key on the new string columns.
ALTER TABLE `shopify_order_line_items`
  ADD CONSTRAINT `fk_line_items_shopify_order`
  FOREIGN KEY (`shopify_order_id`) REFERENCES `shopify_orders`(`shopify_order_id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

-- CreateIndex: the machine feed pages by updated_at ascending.
CREATE INDEX `idx_shopify_orders_updated_at` ON `shopify_orders`(`updated_at`);
