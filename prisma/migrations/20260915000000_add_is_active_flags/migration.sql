-- AlterTable: soft-delete flag for blend lookup options (base_teas, spices).
-- Retired options are marked inactive rather than deleted/renumbered, so
-- historical recipes referencing them by id still resolve.
ALTER TABLE `base_teas` ADD COLUMN `is_active` BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE `spices` ADD COLUMN `is_active` BOOLEAN NOT NULL DEFAULT true;
