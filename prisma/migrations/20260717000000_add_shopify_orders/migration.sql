-- CreateTable
CREATE TABLE `shopify_webhook_events` (
    `webhook_id` VARCHAR(255) NOT NULL,
    `topic` VARCHAR(100) NOT NULL,
    `shop_domain` VARCHAR(255) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'received',
    `error_message` TEXT NULL,
    `received_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `processed_at` TIMESTAMP(0) NULL,

    INDEX `idx_webhook_events_topic`(`topic`),
    PRIMARY KEY (`webhook_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shopify_orders` (
    `shopify_order_id` BIGINT NOT NULL,
    `order_number` VARCHAR(50) NULL,
    `email` VARCHAR(255) NULL,
    `financial_status` VARCHAR(50) NULL,
    `fulfillment_status` VARCHAR(50) NULL,
    `currency` VARCHAR(10) NULL,
    `subtotal_amount` DECIMAL(10, 2) NULL,
    `total_amount` DECIMAL(10, 2) NULL,
    `cart_token` VARCHAR(255) NULL,
    `shopify_created_at` DATETIME(0) NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NULL,

    INDEX `idx_shopify_orders_email`(`email`),
    INDEX `idx_shopify_orders_cart_token`(`cart_token`),
    PRIMARY KEY (`shopify_order_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shopify_order_line_items` (
    `line_item_id` BIGINT NOT NULL,
    `shopify_order_id` BIGINT NOT NULL,
    `product_id` BIGINT NULL,
    `variant_id` BIGINT NULL,
    `title` VARCHAR(255) NULL,
    `variant_title` VARCHAR(255) NULL,
    `sku` VARCHAR(100) NULL,
    `quantity` INTEGER NOT NULL,
    `price` DECIMAL(10, 2) NULL,
    `blend_id` VARCHAR(100) NULL,
    `properties` TEXT NULL,

    INDEX `fk_line_items_shopify_order`(`shopify_order_id`),
    INDEX `idx_line_items_blend_id`(`blend_id`),
    PRIMARY KEY (`line_item_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `shopify_order_line_items` ADD CONSTRAINT `fk_line_items_shopify_order` FOREIGN KEY (`shopify_order_id`) REFERENCES `shopify_orders`(`shopify_order_id`) ON DELETE CASCADE ON UPDATE RESTRICT;

