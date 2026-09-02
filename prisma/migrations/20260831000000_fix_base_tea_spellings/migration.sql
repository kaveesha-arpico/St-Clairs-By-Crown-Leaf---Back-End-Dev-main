-- Correct two customer-facing base tea names. The site uses "Laxapana"
-- everywhere (including the /laxapana URL) and "Strathspey" is the estate's
-- real spelling.
--
-- Deliberately an UPDATE keyed on the old name, not a delete-and-reinsert:
-- base_teas.id is what the frontend sends as baseTeaId and what custom_blends
-- rows point at, so the ids must survive the rename.
--
-- The NOT EXISTS guard makes this safe even if a seed run has already inserted
-- the corrected name as a separate row (base_teas.name has no unique
-- constraint, so nothing else would stop a duplicate). Re-running is a no-op.

UPDATE `base_teas`
SET `name` = 'Strathspey'
WHERE `name` = 'Strathpey'
  AND NOT EXISTS (
    SELECT 1 FROM (SELECT `name` FROM `base_teas`) AS existing
    WHERE existing.`name` = 'Strathspey'
  );

UPDATE `base_teas`
SET `name` = 'Laxapana'
WHERE `name` = 'Lakshapana'
  AND NOT EXISTS (
    SELECT 1 FROM (SELECT `name` FROM `base_teas`) AS existing
    WHERE existing.`name` = 'Laxapana'
  );
