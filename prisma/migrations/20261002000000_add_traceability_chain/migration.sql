-- Traceability chain backing the public trace page.
--
-- SCOPE: this models exactly the five details the page shows —
--   Plantation (estates) · Factory (factories) · Packed Date (pack_runs) ·
--   Ingredients + Package Weight (product_trace_info)
-- and the links needed to reach them from a Shopify order line:
--   order line -> order_allocations -> pack_runs -> lots -> estates/factories
--
-- The original brief also described harvests, wither hours, moisture, cupping
-- results, shipments and Tea Board refs. Those were deliberately cut: the data
-- would have to be supplied per lot, forever, by the estate, the factory and
-- the shipping agent, and a page with blanks reads worse than a short page that
-- is always complete. Every one of them can be added later as a new nullable
-- column or a new table hanging off `lots` — none of it requires reshaping what
-- is created here.
--
-- NAMING: `estates` and `factories` are new tables. The schema also contains
-- unused legacy tables from an earlier phase (`plantation`, `field`, `factory`,
-- `batch`, `product`, `inventory`, `location`) which nothing references and
-- which are empty in staging. They are intentionally left alone here — drop
-- them in a separate migration once production row counts confirm they are
-- empty. Note `factory` (legacy, singular) vs `factories` (new, plural).

-- CreateTable: tea estates. "Plantation" on the customer-facing page.
CREATE TABLE `estates` (
    `estate_id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    -- Growing region, e.g. "Dimbula". Shown alongside the name when present.
    `region` VARCHAR(100) NULL,
    -- Soft delete, matching base_teas/spices: a retired estate is marked
    -- inactive, never deleted, so historic lots still read back.
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_estates_name`(`name`),
    PRIMARY KEY (`estate_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: tea factories. Kept separate from estates rather than as a
-- column on them, because a factory serves many lots and tea is not always
-- manufactured on the estate that grew it.
CREATE TABLE `factories` (
    `factory_id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_factories_name`(`name`),
    PRIMARY KEY (`factory_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: a manufactured lot of tea — the unit that carries provenance.
-- It is what connects a packed tin back to where the tea came from, so estate
-- and factory are both NOT NULL: a lot whose origin is unknown has no business
-- appearing on a traceability page.
CREATE TABLE `lots` (
    `lot_id` INTEGER NOT NULL AUTO_INCREMENT,
    `lot_number` VARCHAR(50) NOT NULL,
    `estate_id` INTEGER NOT NULL,
    `factory_id` INTEGER NOT NULL,
    -- e.g. "Golden Tips". Drives the pilot: only lots of the piloted grade are
    -- exposed on the public page at launch.
    `grade` VARCHAR(100) NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_lots_lot_number`(`lot_number`),
    INDEX `fk_lots_estate`(`estate_id`),
    INDEX `fk_lots_factory`(`factory_id`),
    INDEX `idx_lots_grade`(`grade`),
    PRIMARY KEY (`lot_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: a packing run — one batch of retail units packed on one day.
-- Supplies "Packed Date".
--
-- `lot_id` is NOT NULL, which is how the brief's "exactly one lot per pack run"
-- rule is enforced: the database makes a run without a lot, or with two lots,
-- unrepresentable rather than relying on application code to check.
CREATE TABLE `pack_runs` (
    `pack_run_id` INTEGER NOT NULL AUTO_INCREMENT,
    -- The human/barcode identifier staff scan when packing an order.
    `pack_run_code` VARCHAR(50) NOT NULL,
    `lot_id` INTEGER NOT NULL,
    `packed_date` DATE NOT NULL,
    -- Which Shopify product this run produced. String, not BIGINT: Shopify ids
    -- exceed JS Number's safe range and are stored as strings throughout.
    `shopify_product_id` VARCHAR(32) NULL,
    `sku` VARCHAR(100) NULL,
    `quantity_packed` INTEGER NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_pack_runs_code`(`pack_run_code`),
    INDEX `fk_pack_runs_lot`(`lot_id`),
    INDEX `idx_pack_runs_product`(`shopify_product_id`),
    PRIMARY KEY (`pack_run_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: which pack run(s) fulfilled a given order line.
--
-- One row per (line item, pack run) pair, NOT one per line item: the brief
-- notes an order line can span two pack runs when a run runs out mid-pick, so
-- the quantity is split across rows. The unique index allows the split while
-- preventing the same run being recorded twice against one line.
--
-- Note the database cannot check that the allocated quantities sum to the line
-- item's quantity (that is a cross-row rule); the packing endpoint validates it.
CREATE TABLE `order_allocations` (
    `allocation_id` INTEGER NOT NULL AUTO_INCREMENT,
    `line_item_id` VARCHAR(32) NOT NULL,
    `pack_run_id` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_order_allocations_line_run`(`line_item_id`, `pack_run_id`),
    INDEX `fk_order_allocations_line_item`(`line_item_id`),
    INDEX `fk_order_allocations_pack_run`(`pack_run_id`),
    PRIMARY KEY (`allocation_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: per-product trace copy. Supplies "Ingredients" and
-- "Package Weight" for standard products.
--
-- No foreign key to a products table: `shopify_store_products` keys on BIGINT
-- while every id in the traceability chain is VARCHAR(32) (see shopify_orders),
-- and the two cannot be joined by a constraint. The Shopify product id is the
-- key, and a missing row simply means those two fields are omitted.
--
-- For CUSTOM BLENDS the ingredients come from the order's own recipe instead
-- (shopify_order_line_items.blend_id -> custom_blends -> blend_spices), since
-- each blend is per-customer. The public endpoint prefers that when present.
CREATE TABLE `product_trace_info` (
    `shopify_product_id` VARCHAR(32) NOT NULL,
    `ingredients` VARCHAR(500) NULL,
    -- Net weight in grams. Stored numerically rather than as "100g" so it can
    -- be formatted per locale and compared; the frontend renders the unit.
    `package_weight_g` INTEGER NULL,
    `updated_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`shopify_product_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
-- RESTRICT on delete throughout the provenance chain: an estate, factory or lot
-- that is already referenced by shipped product must not be removable, or the
-- trace page for an order already in a customer's hands would lose its origin.
-- Retire them with is_active instead.
ALTER TABLE `lots`
  ADD CONSTRAINT `fk_lots_estate`
  FOREIGN KEY (`estate_id`) REFERENCES `estates`(`estate_id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `lots`
  ADD CONSTRAINT `fk_lots_factory`
  FOREIGN KEY (`factory_id`) REFERENCES `factories`(`factory_id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `pack_runs`
  ADD CONSTRAINT `fk_pack_runs_lot`
  FOREIGN KEY (`lot_id`) REFERENCES `lots`(`lot_id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- CASCADE here, unlike the chain above: allocations describe an order, so if
-- the order (and with it the line item) is deleted, its allocations are history
-- with nothing to attach to. Matches trace_codes' behaviour on order deletion.
ALTER TABLE `order_allocations`
  ADD CONSTRAINT `fk_order_allocations_line_item`
  FOREIGN KEY (`line_item_id`) REFERENCES `shopify_order_line_items`(`line_item_id`)
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE `order_allocations`
  ADD CONSTRAINT `fk_order_allocations_pack_run`
  FOREIGN KEY (`pack_run_id`) REFERENCES `pack_runs`(`pack_run_id`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;
