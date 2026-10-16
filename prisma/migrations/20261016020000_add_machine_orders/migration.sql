-- TeaMatrix machine orders (spec v1.1 §4.1, §4.2).
--
-- machine_orders: one row per CUSTOM-BLEND line item on a Shopify order, with
-- the frozen recipe, the payment status (written by webhooks, forward-only) and
-- the machine status (written only by the machine's status endpoint).
-- machine_order_events: history of every status change on either side.
--
-- Generated from prisma/schema.prisma with `prisma migrate diff --script` so
-- the SQL and the models cannot drift. updated_at is maintained by Prisma
-- (@updatedAt) rather than ON UPDATE CURRENT_TIMESTAMP, for the same reason.


-- CreateTable
CREATE TABLE `machine_orders` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `shopify_order_id` VARCHAR(32) NOT NULL,
    `shopify_line_item_id` VARCHAR(32) NOT NULL,
    `order_number` VARCHAR(32) NULL,
    `blend_id` INTEGER NULL,
    `blend_ref` VARCHAR(32) NULL,
    `customer_display_name` VARCHAR(100) NULL,
    `units` INTEGER NOT NULL DEFAULT 1,
    `total_weight_g` INTEGER NULL,
    `recipe_json` JSON NULL,
    `validation_error` VARCHAR(64) NULL,
    `is_test` BOOLEAN NOT NULL DEFAULT false,
    `payment_status` VARCHAR(24) NOT NULL,
    `payment_status_updated_at` DATETIME(3) NOT NULL,
    `paid_at` DATETIME(3) NULL,
    `machine_status` VARCHAR(24) NOT NULL DEFAULT 'new',
    `machine_status_updated_at` DATETIME(3) NULL,
    `machine_ref` VARCHAR(64) NULL,
    `machine_status_reason` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uq_machine_orders_line`(`shopify_line_item_id`),
    INDEX `ix_machine_orders_pending`(`payment_status`, `machine_status`, `validation_error`, `is_test`, `paid_at`, `id`),
    INDEX `ix_machine_orders_changes`(`payment_status_updated_at`, `id`),
    INDEX `ix_machine_orders_order`(`shopify_order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `machine_order_events` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `machine_order_id` BIGINT NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `from_status` VARCHAR(24) NULL,
    `to_status` VARCHAR(24) NOT NULL,
    `detail` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ix_moe_order`(`machine_order_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `machine_order_events` ADD CONSTRAINT `fk_moe_order` FOREIGN KEY (`machine_order_id`) REFERENCES `machine_orders`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

