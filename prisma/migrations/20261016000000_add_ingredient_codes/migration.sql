-- Permanent ingredient codes for the TeaMatrix machine (spec v1.1 §2).
--
-- The machine matches ingredients on `code` only, so `name` stays free to
-- change. A code never changes once shipped and is never reused.
--
-- Three-step so it is safe on a populated database: add the column nullable,
-- fill every existing row, then make it NOT NULL + UNIQUE. Rows are matched by
-- their current name, case-insensitively and tolerant of the longer display
-- forms ("Cinnamon chips", "Ginger pieces"). Any row this file does not
-- recognise gets a LEGACY_<id> code and is retired (is_active = false) rather
-- than left NULL, so the final step cannot fail and a stray row never reaches
-- the blend builder or the machine. Those rows should be reviewed by hand.

-- ---- base_teas ----
ALTER TABLE `base_teas` ADD COLUMN `code` VARCHAR(40) NULL;

UPDATE `base_teas` SET `code` = 'STRATHSPEY_BOPF'       WHERE `code` IS NULL AND LOWER(`name`) IN ('strathspey bopf', 'strathspey');
UPDATE `base_teas` SET `code` = 'LAXAPANA_PEKOE'        WHERE `code` IS NULL AND LOWER(`name`) IN ('laxapana pekoe', 'laxapana', 'lakshapana pekoe', 'lakshapana');
UPDATE `base_teas` SET `code` = 'MORAY_BOP'             WHERE `code` IS NULL AND LOWER(`name`) IN ('moray bop', 'moray');
UPDATE `base_teas` SET `code` = 'MASKELIYA_SILVER_TIPS' WHERE `code` IS NULL AND LOWER(`name`) IN ('maskeliya silver tips', 'maskeliya');
UPDATE `base_teas` SET `code` = 'GLENTILT_GOLDEN_TIPS'  WHERE `code` IS NULL AND LOWER(`name`) IN ('glentilt golden tips', 'glentilt');

-- If a name matched twice (e.g. an old "Strathspey" row AND "Strathspey BOPF"),
-- only the lowest id keeps the real code; the duplicate falls through to LEGACY
-- below, because the UNIQUE index would otherwise reject it.
UPDATE `base_teas` t
JOIN (
  SELECT `code`, MIN(`id`) AS keep_id
  FROM `base_teas`
  WHERE `code` IS NOT NULL
  GROUP BY `code`
  HAVING COUNT(*) > 1
) d ON d.`code` = t.`code` AND t.`id` <> d.keep_id
SET t.`code` = NULL;

UPDATE `base_teas`
SET `code` = CONCAT('LEGACY_', `id`), `is_active` = false
WHERE `code` IS NULL;

ALTER TABLE `base_teas` MODIFY `code` VARCHAR(40) NOT NULL;
CREATE UNIQUE INDEX `uq_base_teas_code` ON `base_teas`(`code`);

-- ---- spices ----
ALTER TABLE `spices` ADD COLUMN `code` VARCHAR(40) NULL;

-- Offered ingredients.
UPDATE `spices` SET `code` = 'CINNAMON_CHIPS' WHERE `code` IS NULL AND LOWER(`name`) IN ('cinnamon', 'cinnamon chips');
UPDATE `spices` SET `code` = 'GINGER_PIECES'  WHERE `code` IS NULL AND LOWER(`name`) IN ('ginger', 'ginger pieces');
UPDATE `spices` SET `code` = 'ORANGE_PEEL'    WHERE `code` IS NULL AND LOWER(`name`) = 'orange peel';
UPDATE `spices` SET `code` = 'LEMON_PEEL'     WHERE `code` IS NULL AND LOWER(`name`) = 'lemon peel';
UPDATE `spices` SET `code` = 'LEMONGRASS'     WHERE `code` IS NULL AND LOWER(`name`) = 'lemongrass';
UPDATE `spices` SET `code` = 'ROSE_PETALS'    WHERE `code` IS NULL AND LOWER(`name`) = 'rose petals';
UPDATE `spices` SET `code` = 'JASMINE_PETALS' WHERE `code` IS NULL AND LOWER(`name`) = 'jasmine petals';

-- Retired ingredients (is_active = false already). They keep stable codes so
-- historical recipes read back with a code, but they are not in the seed and
-- not offered by the builder or the machine.
UPDATE `spices` SET `code` = 'CARDAMOM'     WHERE `code` IS NULL AND LOWER(`name`) = 'cardamom';
UPDATE `spices` SET `code` = 'CLOVE'        WHERE `code` IS NULL AND LOWER(`name`) = 'clove';
UPDATE `spices` SET `code` = 'BLACK_PEPPER' WHERE `code` IS NULL AND LOWER(`name`) = 'black pepper';
UPDATE `spices` SET `code` = 'NUTMEG'       WHERE `code` IS NULL AND LOWER(`name`) = 'nutmeg';
UPDATE `spices` SET `code` = 'STAR_ANISE'   WHERE `code` IS NULL AND LOWER(`name`) = 'star anise';
UPDATE `spices` SET `code` = 'FENNEL'       WHERE `code` IS NULL AND LOWER(`name`) = 'fennel';
UPDATE `spices` SET `code` = 'PEPPERMINT'   WHERE `code` IS NULL AND LOWER(`name`) = 'peppermint';

UPDATE `spices` s
JOIN (
  SELECT `code`, MIN(`id`) AS keep_id
  FROM `spices`
  WHERE `code` IS NOT NULL
  GROUP BY `code`
  HAVING COUNT(*) > 1
) d ON d.`code` = s.`code` AND s.`id` <> d.keep_id
SET s.`code` = NULL;

UPDATE `spices`
SET `code` = CONCAT('LEGACY_', `id`), `is_active` = false
WHERE `code` IS NULL;

ALTER TABLE `spices` MODIFY `code` VARCHAR(40) NOT NULL;
CREATE UNIQUE INDEX `uq_spices_code` ON `spices`(`code`);
