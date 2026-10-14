// dates.js
// Date formatting shared between the admin and public APIs.

/**
 * Render a DATE column as plain YYYY-MM-DD.
 *
 * `packed_date` is a DATE with no time and no zone. Serializing it as a full
 * ISO timestamp invents a midnight, which then displays as the previous day for
 * anyone west of UTC — a tin packed on the 12th showing as the 11th. Returning
 * only the date part keeps it unambiguous, and matches what staff typed in.
 *
 * @param {Date|string|null|undefined} value
 * @returns {string|null} "2026-03-12", or null.
 */
function toDateOnly(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/**
 * Return a pack-run row with its packed_date normalized. Safe on null and on
 * rows that carry a nested `lot`.
 */
function packRunDates(run) {
  if (!run) return run;
  return { ...run, packed_date: toDateOnly(run.packed_date) };
}

module.exports = { toDateOnly, packRunDates };
