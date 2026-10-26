-- TeaMatrix Addendum 2 (Traceability): one row per bottle the machine made for
-- a website order, holding the trace link printed as the QR on its label.
-- Written only by POST /api/machine/orders/:id/traceability; never updated.
--
-- Generated from prisma/schema.prisma with `prisma migrate diff --script`,
-- then trace_id given a BINARY collation by hand: trace ids are case-sensitive
-- (7Kq2xM9a and 7KQ2XM9A are different bottles) and the default
-- utf8mb4_unicode_ci would make the unique key treat them as the same.
-- Prisma does not model collation, so this is the one hand edit.


-- CreateTable
CREATE TABLE `machine_order_traces` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `machine_order_id` BIGINT NOT NULL,
    `unit_index` INTEGER NOT NULL,
    `trace_id` VARCHAR(12) COLLATE utf8mb4_bin NOT NULL,
    `url` VARCHAR(255) NOT NULL,
    `machine_ref` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uq_mot_unit`(`machine_order_id`, `unit_index`),
    UNIQUE INDEX `uq_mot_trace`(`trace_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `machine_order_traces` ADD CONSTRAINT `fk_mot_order` FOREIGN KEY (`machine_order_id`) REFERENCES `machine_orders`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;
