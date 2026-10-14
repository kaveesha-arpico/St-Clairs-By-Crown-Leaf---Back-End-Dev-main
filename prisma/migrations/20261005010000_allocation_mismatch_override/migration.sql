-- Record when a packing allocation was accepted despite the scanned pack run
-- not matching the ordered product.
--
-- The packing endpoint now rejects a scan whose SKU or Shopify product id
-- disagrees with the order line: a packer reaching for the wrong caddy would
-- otherwise produce a trace page claiming the customer's tea came from a lot it
-- never came from. Wrong provenance is worse than none — it is the one failure
-- this whole system exists to prevent.
--
-- An override is still possible, because a hard block at shipping time invites
-- worse workarounds (skipping the packing record altogether). But it has to be
-- asked for explicitly, and it is recorded here, so a later complaint can be
-- traced to a deliberate decision rather than looking like clean data.
ALTER TABLE `order_allocations`
  ADD COLUMN `mismatch_override` BOOLEAN NOT NULL DEFAULT false AFTER `quantity`;
