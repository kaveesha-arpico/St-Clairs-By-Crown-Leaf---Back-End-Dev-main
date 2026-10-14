-- Trace codes become per-JAR instead of per-order.
--
-- The QR goes on the jar label, not the parcel or invoice. An order of two teas
-- is two jars, each needing its own code, so "one code per order" was the wrong
-- unit. Codes are now minted when a pack run is created — one per unit packed —
-- and exist before any order does. A jar is linked to an order line later, when
-- the packer scans it into a box.
--
-- Consequences:
--   * Jars sold through shops or as gifts get traceability too; previously only
--     online orders did, because the Shopify webhook minted the code.
--   * scan_count is per physical jar, which makes it a counterfeit signal: one
--     code scanned from many places is a copied label.
--   * order_allocations is redundant — a jar linked to a line IS the allocation,
--     and "allocated" is now a count of codes on that line. Dropped.
--   * dispatched_at is a fact about the order, not a jar. Moved to shopify_orders.
--
-- DATA LOSS, DELIBERATE: existing trace_codes rows are order-level codes. None
-- has been printed on a label (confirmed 2026-10-09), so they are discarded
-- rather than migrated — there is nothing in the world they identify.
-- Take a backup before applying, as for any destructive migration.

-- 1. The allocation table is replaced by trace_codes.line_item_id.
DROP TABLE IF EXISTS `order_allocations`;

-- 2. Rebuild trace_codes around the jar.
DROP TABLE IF EXISTS `trace_codes`;

CREATE TABLE `trace_codes` (
    `code` VARCHAR(12) NOT NULL,
    -- The run this jar came out of: its lot, estate, factory and packed date.
    `pack_run_id` INTEGER NOT NULL,
    -- Set when the jar is scanned into an online order; NULL for a jar on the
    -- shelf, sold in a shop, or given as a gift. ON DELETE SET NULL below: if
    -- the order is ever removed the jar still exists and still traces to its
    -- run — it just stops being "in an order".
    `line_item_id` VARCHAR(32) NULL,
    -- True when the jar was linked to a line despite its product not matching.
    `mismatch_override` BOOLEAN NOT NULL DEFAULT false,
    `allocated_at` DATETIME(0) NULL,
    -- active | revoked. Dispatch no longer lives here.
    `status` VARCHAR(20) NOT NULL DEFAULT 'active',
    `scan_count` INTEGER NOT NULL DEFAULT 0,
    `first_scanned_at` DATETIME(0) NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_trace_codes_pack_run`(`pack_run_id`),
    INDEX `fk_trace_codes_line_item`(`line_item_id`),
    INDEX `idx_trace_codes_status`(`status`),
    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CASCADE from pack run: deleting a run deletes its codes. The application only
-- allows that while no code has been scanned or linked to an order — i.e. while
-- the labels are, as far as we can tell, not yet in the world. Past that point
-- the run is kept and codes are revoked instead.
ALTER TABLE `trace_codes`
  ADD CONSTRAINT `fk_trace_codes_pack_run`
  FOREIGN KEY (`pack_run_id`) REFERENCES `pack_runs`(`pack_run_id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE `trace_codes`
  ADD CONSTRAINT `fk_trace_codes_line_item`
  FOREIGN KEY (`line_item_id`) REFERENCES `shopify_order_line_items`(`line_item_id`)
  ON DELETE SET NULL ON UPDATE RESTRICT;

-- 3. Dispatch date belongs to the order.
ALTER TABLE `shopify_orders`
  ADD COLUMN `dispatched_at` DATETIME(0) NULL AFTER `cancelled_at`;

-- 4. A display name per product, so a jar not yet in any order still has one.
ALTER TABLE `product_trace_info`
  ADD COLUMN `title` VARCHAR(255) NULL AFTER `shopify_product_id`;
