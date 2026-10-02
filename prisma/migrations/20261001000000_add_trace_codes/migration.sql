-- CreateTable: public traceability codes, one per Shopify order.
--
-- `code` is the primary key: every lookup (public trace page, QR render, admin
-- search) is by code, and making it the PK gives the uniqueness the codes
-- depend on for free.
--
-- The unique index on shopify_order_id enforces "one code per order" at the
-- database level, so a duplicate orders/paid delivery cannot mint a second code
-- for an order that already has one — two concurrent deliveries race, one wins,
-- the loser re-reads the winner's code.
--
-- `status` is active/revoked ONLY. Dispatch is tracked separately in
-- dispatched_at rather than as a status value, so that a shipped code can still
-- be revoked (collapsing the two would make those mutually exclusive).
CREATE TABLE `trace_codes` (
    `code` VARCHAR(12) NOT NULL,
    `shopify_order_id` VARCHAR(32) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'active',
    `scan_count` INTEGER NOT NULL DEFAULT 0,
    `first_scanned_at` DATETIME(0) NULL,
    `dispatched_at` DATETIME(0) NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_trace_codes_order`(`shopify_order_id`),
    INDEX `idx_trace_codes_status`(`status`),
    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
-- ON DELETE CASCADE: a trace code is meaningless without its order (the public
-- page renders the order's products), so deleting an order retires its code and
-- the page correctly reports "not found" rather than rendering a hollow record.
ALTER TABLE `trace_codes`
  ADD CONSTRAINT `fk_trace_codes_order`
  FOREIGN KEY (`shopify_order_id`) REFERENCES `shopify_orders`(`shopify_order_id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;
