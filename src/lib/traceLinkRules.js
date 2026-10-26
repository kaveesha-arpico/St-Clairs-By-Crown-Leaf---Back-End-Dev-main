// traceLinkRules.js
// Validation for a bottle's trace link as the TeaMatrix machine posts it
// (Addendum 2 §3, §5 rule 3). Pure functions, no database.
//
// A trace link is a trace_id and a url, both created on the machine side and
// never changed. The url must be https and on one of TRACE_URL_HOSTS, so a
// stored link can never send a customer anywhere else, even if the machine key
// leaked. The domain lives in config, never in code (§9).

const TRACE_ID_RE = /^[A-Za-z0-9]{8,12}$/;
const URL_MAX = 255;

function traceUrlHosts() {
  return (process.env.TRACE_URL_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Check one trace link against the line it is for.
 * Returns { ok: true, value } or { ok: false, field, message }.
 *
 * @param {object} input
 * @param {*} input.unit_index   1..units
 * @param {*} input.trace_id
 * @param {*} input.url
 * @param {*} [input.machine_ref]
 * @param {number} units         the line's units (machine_orders.units)
 * @param {string[]} [hosts]     allowed hosts; defaults to TRACE_URL_HOSTS
 */
function validateTraceLink(input, units, hosts = traceUrlHosts()) {
  const fail = (field, message) => ({ ok: false, field, message });
  const { unit_index, trace_id, url, machine_ref } = input || {};

  if (!Number.isInteger(unit_index) || unit_index < 1 || unit_index > units) {
    return fail("unit_index", `unit_index must be an integer from 1 to ${units}.`);
  }

  if (typeof trace_id !== "string" || !TRACE_ID_RE.test(trace_id)) {
    return fail("trace_id", "trace_id must be 8 to 12 letters or digits.");
  }

  if (typeof url !== "string" || url.length === 0 || url.length > URL_MAX) {
    return fail("url", `url is required and must be at most ${URL_MAX} characters.`);
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return fail("url", "url must be a valid absolute URL.");
  }
  if (parsed.protocol !== "https:") {
    return fail("url", "url must use https.");
  }
  if (hosts.length === 0) {
    return fail("url", "TRACE_URL_HOSTS is not configured on the server.");
  }
  if (!hosts.includes(parsed.hostname.toLowerCase())) {
    return fail("url", `url host must be one of: ${hosts.join(", ")}.`);
  }

  return {
    ok: true,
    value: {
      unit_index,
      trace_id,
      url,
      machine_ref: machine_ref != null ? String(machine_ref).slice(0, 64) : null,
    },
  };
}

module.exports = { validateTraceLink, traceUrlHosts, TRACE_ID_RE, URL_MAX };
