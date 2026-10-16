-- Store the base tea's share of a blend (TeaMatrix spec v1.1 §3).
--
-- Until now only the spice percentages were stored and the base tea was the
-- implied remainder. The machine needs every ingredient's percentage explicit,
-- and the recipe must be frozen exactly as validated.
--
-- Three-step so it is safe on a populated database: add nullable, fill existing
-- rows with the remainder (100 - sum of that blend's spices, floored at 0 — the
-- same value the old code implied), then make it NOT NULL. Nothing is deleted.

ALTER TABLE `custom_blends` ADD COLUMN `base_tea_percentage` DECIMAL(5,2) NULL;

UPDATE `custom_blends` b
LEFT JOIN (
  SELECT `blend_id`, COALESCE(SUM(`percentage`), 0) AS spice_sum
  FROM `blend_spices`
  GROUP BY `blend_id`
) s ON s.`blend_id` = b.`id`
SET b.`base_tea_percentage` = GREATEST(0, 100 - COALESCE(s.spice_sum, 0))
WHERE b.`base_tea_percentage` IS NULL;

ALTER TABLE `custom_blends` MODIFY `base_tea_percentage` DECIMAL(5,2) NOT NULL;
