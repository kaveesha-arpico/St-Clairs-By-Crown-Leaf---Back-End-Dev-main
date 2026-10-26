-- Cutover (spec v1.1 §10 step 8), 2026-10-26: the v1.0 per-order status table
-- goes with its endpoint. TeaMatrix confirmed their poller and the planned
-- development machine use only the §7 endpoints; nothing on our side calls the
-- legacy feed. The table held joint-test data only — nothing is migrated.
-- machine_orders / machine_order_events / machine_order_traces are untouched.


-- DropForeignKey
ALTER TABLE `machine_order_statuses` DROP FOREIGN KEY `fk_machine_status_order`;

-- DropTable
DROP TABLE `machine_order_statuses`;
