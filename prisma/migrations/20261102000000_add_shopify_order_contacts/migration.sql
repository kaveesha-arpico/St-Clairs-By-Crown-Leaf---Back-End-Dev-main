-- Contact side channel for Shopify orders.
--
-- Order webhooks come through the custom app, which on the shop's current
-- Shopify plan is denied "protected customer data": email, customer and
-- addresses are stripped from every delivery. The store-level (Settings ->
-- Notifications) webhooks still carry them, so "Order creation" and "Order
-- update" are also pointed at POST /api/webhooks/shopify/order-contact, which
-- may only record the order's email and display name here and copy them onto
-- shopify_orders / machine_orders where those are NULL. Its own table so a
-- note can arrive before the order it belongs to.
--
-- Generated from prisma/schema.prisma with `prisma migrate diff --script`.

-- CreateTable
CREATE TABLE `shopify_order_contacts` (
    `shopify_order_id` VARCHAR(32) NOT NULL,
    `email` VARCHAR(255) NULL,
    `customer_display_name` VARCHAR(100) NULL,
    `shopify_updated_at` DATETIME(0) NULL,
    `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`shopify_order_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
