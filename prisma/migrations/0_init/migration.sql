-- CreateTable
CREATE TABLE `addresses` (
    `address_id` INTEGER NOT NULL AUTO_INCREMENT,
    `customer_id` INTEGER NOT NULL,
    `street` VARCHAR(255) NULL,
    `city` VARCHAR(100) NULL,
    `state` VARCHAR(100) NULL,
    `zip_code` VARCHAR(20) NULL,
    `country` VARCHAR(100) NULL,
    `is_default` BOOLEAN NULL DEFAULT false,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_addresses_customer`(`customer_id`),
    PRIMARY KEY (`address_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `base_teas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `batch` (
    `batch_id` INTEGER NOT NULL AUTO_INCREMENT,
    `factory_id` INTEGER NOT NULL,
    `field_id` INTEGER NOT NULL,
    `harvested_date` DATE NULL,

    INDEX `fk_batch_factory`(`factory_id`),
    INDEX `fk_batch_field`(`field_id`),
    PRIMARY KEY (`batch_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `blend_spices` (
    `blend_id` INTEGER NOT NULL,
    `spice_id` INTEGER NOT NULL,
    `percentage` DECIMAL(5, 2) NULL,

    INDEX `fk_bs_spice`(`spice_id`),
    PRIMARY KEY (`blend_id`, `spice_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `custom_blends` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `base_tea_id` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_blend_base_tea`(`base_tea_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `custom_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `base_tea_id` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,
    `created_at` DATETIME(0) NULL,

    INDEX `fk_custom_order_base_tea`(`base_tea_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customers` (
    `customer_id` INTEGER NOT NULL AUTO_INCREMENT,
    `first_name` VARCHAR(100) NOT NULL,
    `last_name` VARCHAR(100) NULL,
    `email` VARCHAR(255) NULL,
    `password` VARCHAR(255) NULL,
    `contact_number` VARCHAR(30) NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_customers_email`(`email`),
    PRIMARY KEY (`customer_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `factory` (
    `factory_id` INTEGER NOT NULL AUTO_INCREMENT,
    `factory_name` VARCHAR(150) NOT NULL,
    `other_info` TEXT NULL,

    PRIMARY KEY (`factory_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `field` (
    `field_id` INTEGER NOT NULL AUTO_INCREMENT,
    `plantation_id` INTEGER NOT NULL,
    `field_information` TEXT NULL,

    INDEX `fk_field_plantation`(`plantation_id`),
    PRIMARY KEY (`field_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory` (
    `inventory_id` INTEGER NOT NULL AUTO_INCREMENT,
    `location_id` INTEGER NOT NULL,
    `batch_id` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 0,

    INDEX `fk_inventory_batch`(`batch_id`),
    INDEX `fk_inventory_location`(`location_id`),
    PRIMARY KEY (`inventory_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `location` (
    `location_id` INTEGER NOT NULL AUTO_INCREMENT,
    `location_name` VARCHAR(150) NOT NULL,
    `other_info` TEXT NULL,

    PRIMARY KEY (`location_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_addresses` (
    `order_id` INTEGER NOT NULL,
    `address_id` INTEGER NOT NULL,

    INDEX `fk_oa_address`(`address_id`),
    PRIMARY KEY (`order_id`, `address_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_spices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `spice_name` VARCHAR(100) NULL,
    `percentage` DECIMAL(5, 2) NULL,

    INDEX `fk_order_spices_order`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orders` (
    `order_id` INTEGER NOT NULL AUTO_INCREMENT,
    `customer_id` INTEGER NOT NULL,
    `order_time` DATETIME(0) NULL,
    `quantity` INTEGER NULL,
    `total` DECIMAL(10, 2) NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_orders_customer`(`customer_id`),
    PRIMARY KEY (`order_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `paid_carts` (
    `cart_token` VARCHAR(255) NOT NULL,
    `paid_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`cart_token`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `plantation` (
    `plantation_id` INTEGER NOT NULL AUTO_INCREMENT,
    `plantation_name` VARCHAR(150) NOT NULL,
    `tea_grade` VARCHAR(100) NULL,

    PRIMARY KEY (`plantation_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product` (
    `traceability_id` INTEGER NOT NULL AUTO_INCREMENT,
    `batch_id` INTEGER NOT NULL,
    `quantity` INTEGER NULL,
    `product_name` VARCHAR(150) NULL,

    INDEX `fk_product_batch`(`batch_id`),
    PRIMARY KEY (`traceability_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_variants` (
    `shopify_variant_id` BIGINT NOT NULL,
    `shopify_product_id` BIGINT NOT NULL,
    `variant_title` VARCHAR(255) NULL,
    `variant_price` DECIMAL(10, 2) NULL,
    `variant_weight` DECIMAL(10, 2) NULL,
    `variant_image_src` VARCHAR(1024) NULL,

    INDEX `fk_variant_product`(`shopify_product_id`),
    PRIMARY KEY (`shopify_variant_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shopify_products` (
    `shopify_variant_id` BIGINT NOT NULL,
    `shopify_product_id` BIGINT NOT NULL,
    `title` VARCHAR(512) NULL,
    `description` MEDIUMTEXT NULL,
    `vendor` VARCHAR(255) NULL,
    `product_type` VARCHAR(255) NULL,
    `price` DECIMAL(10, 2) NULL,
    `image_src` VARCHAR(1024) NULL,

    PRIMARY KEY (`shopify_variant_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shopify_store_products` (
    `shopify_product_id` BIGINT NOT NULL,
    `title` VARCHAR(512) NULL,
    `description` MEDIUMTEXT NULL,
    `vendor` VARCHAR(255) NULL,
    `product_type` VARCHAR(255) NULL,
    `image_src` VARCHAR(1024) NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`shopify_product_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `spices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tea_products` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `category` VARCHAR(100) NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `originalPrice` DECIMAL(10, 2) NULL DEFAULT 0.00,
    `imageSrc` VARCHAR(512) NULL DEFAULT '',
    `tagline` VARCHAR(255) NULL DEFAULT '',
    `rating` DECIMAL(3, 2) NULL DEFAULT 0.00,
    `reviewsCount` INTEGER NULL DEFAULT 0,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `addresses` ADD CONSTRAINT `fk_addresses_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`customer_id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `batch` ADD CONSTRAINT `fk_batch_factory` FOREIGN KEY (`factory_id`) REFERENCES `factory`(`factory_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `batch` ADD CONSTRAINT `fk_batch_field` FOREIGN KEY (`field_id`) REFERENCES `field`(`field_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `blend_spices` ADD CONSTRAINT `fk_bs_blend` FOREIGN KEY (`blend_id`) REFERENCES `custom_blends`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `blend_spices` ADD CONSTRAINT `fk_bs_spice` FOREIGN KEY (`spice_id`) REFERENCES `spices`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `custom_blends` ADD CONSTRAINT `fk_blend_base_tea` FOREIGN KEY (`base_tea_id`) REFERENCES `base_teas`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `custom_orders` ADD CONSTRAINT `fk_custom_order_base_tea` FOREIGN KEY (`base_tea_id`) REFERENCES `base_teas`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `field` ADD CONSTRAINT `fk_field_plantation` FOREIGN KEY (`plantation_id`) REFERENCES `plantation`(`plantation_id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `inventory` ADD CONSTRAINT `fk_inventory_batch` FOREIGN KEY (`batch_id`) REFERENCES `batch`(`batch_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `inventory` ADD CONSTRAINT `fk_inventory_location` FOREIGN KEY (`location_id`) REFERENCES `location`(`location_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `order_addresses` ADD CONSTRAINT `fk_oa_address` FOREIGN KEY (`address_id`) REFERENCES `addresses`(`address_id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `order_addresses` ADD CONSTRAINT `fk_oa_order` FOREIGN KEY (`order_id`) REFERENCES `orders`(`order_id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `order_spices` ADD CONSTRAINT `fk_order_spices_order` FOREIGN KEY (`order_id`) REFERENCES `custom_orders`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `fk_orders_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`customer_id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `product` ADD CONSTRAINT `fk_product_batch` FOREIGN KEY (`batch_id`) REFERENCES `batch`(`batch_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `product_variants` ADD CONSTRAINT `fk_variant_product` FOREIGN KEY (`shopify_product_id`) REFERENCES `shopify_store_products`(`shopify_product_id`) ON DELETE CASCADE ON UPDATE RESTRICT;

