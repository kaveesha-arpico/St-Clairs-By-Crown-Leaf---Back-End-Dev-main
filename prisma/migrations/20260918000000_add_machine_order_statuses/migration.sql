-- CreateTable: append-only log of machine status reports for an order.
-- Unique on (shopify_order_id, status) so retries/duplicates upsert idempotently
-- and each status is recorded independently (no status overwrites another).
CREATE TABLE `machine_order_statuses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shopify_order_id` VARCHAR(32) NOT NULL,
    `status` VARCHAR(30) NOT NULL,
    `reason` VARCHAR(500) NULL,
    `occurred_at` DATETIME(3) NOT NULL,
    `received_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_machine_status_order_status`(`shopify_order_id`, `status`),
    INDEX `fk_machine_status_order`(`shopify_order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `machine_order_statuses`
  ADD CONSTRAINT `fk_machine_status_order`
  FOREIGN KEY (`shopify_order_id`) REFERENCES `shopify_orders`(`shopify_order_id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;
