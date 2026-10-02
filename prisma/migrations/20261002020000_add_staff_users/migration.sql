-- CreateTable: staff accounts for the admin site.
--
-- Deliberately a SEPARATE table from `customers` rather than a role column on
-- it. `customers` is written by the public signup endpoint, so a role column
-- there would put the privilege flag one bug away from the open internet.
-- Staff and shoppers are also different kinds of record: a staff member has no
-- orders, no addresses and no storefront account.
--
-- There is no staff signup endpoint, by design. Accounts are created with
-- scripts/createStaffUser.js by someone with server access.
--
-- `role` is 'admin' or 'staff'. Both reach the admin API; only 'admin' sees
-- customer names on the order list (the one place the admin API exposes PII).
CREATE TABLE `staff_users` (
    `staff_id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(255) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `role` VARCHAR(20) NOT NULL DEFAULT 'staff',
    -- Deactivate rather than delete, so an audit trail of who entered which lot
    -- keeps resolving to a real person after they leave.
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `last_login_at` DATETIME(0) NULL,
    `created_at` TIMESTAMP(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_staff_users_email`(`email`),
    PRIMARY KEY (`staff_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
