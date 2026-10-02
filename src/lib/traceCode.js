// traceCode.js
// Generation and validation of public traceability codes — the 12-character
// string that goes in the QR on a label/invoice and identifies an order on the
// public trace page.
//
// Two properties matter:
//
//  1. UNGUESSABLE. The code is the only thing protecting one customer's trace
//     page from another's. A sequential code (or anything derived from the
//     order number) would let anyone enumerate every order ever shipped —
//     leaking order volume and contents even though the page itself carries no
//     personal data. So codes come from crypto.randomBytes, never from a
//     counter, a timestamp or the order id.
//
//  2. TRANSCRIBABLE. A customer may read the code off a printed label and type
//     it, so the alphabet excludes every visually confusable character.

const crypto = require("crypto");

// Crockford base32 minus "0" and "1".
//
// Crockford itself excludes I, L, O and U (the first three are confusable, U is
// dropped to avoid accidental obscenities) but KEEPS 0 and 1, relying on
// decode-time mapping (O->0, I/L->1) to resolve misreadings. We go further and
// drop 0 and 1 as well, so neither half of a confusable pair can ever appear in
// a code and there is nothing to resolve: a reader who sees "O" has misread
// nothing, because no code contains 0 or O.
//
// 30 symbols over 12 characters = 30^12 ≈ 5.3e17 codes (~58.9 bits).
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 12;

// Rejection-sampling threshold. 256 is not a multiple of 30, so naively taking
// (byte % 30) would make the first 16 symbols ~3% likelier than the rest. We
// discard bytes at or above the largest multiple of 30 (240) instead, which
// keeps the distribution exactly uniform at the cost of ~6% of random bytes.
const REJECT_AT = Math.floor(256 / ALPHABET.length) * ALPHABET.length;

/**
 * Generate one cryptographically random trace code.
 * @returns {string} a 12-character code, e.g. "K7M2QP9XTR4B".
 */
function generateTraceCode() {
  let code = "";

  while (code.length < CODE_LENGTH) {
    // Over-draw so the common case needs a single randomBytes call even after
    // a few rejections.
    const bytes = crypto.randomBytes(CODE_LENGTH);
    for (const byte of bytes) {
      if (byte >= REJECT_AT) continue; // biased remainder — draw again
      code += ALPHABET[byte % ALPHABET.length];
      if (code.length === CODE_LENGTH) break;
    }
  }

  return code;
}

/**
 * Normalize a code as a human might have typed it: lowercase letters, spaces or
 * hyphens inserted for readability. Does NOT map confusable characters, because
 * the alphabet contains no confusable pairs to map between — see ALPHABET.
 * @param {unknown} input
 * @returns {string} the normalized candidate (not guaranteed valid).
 */
function normalizeTraceCode(input) {
  if (input === undefined || input === null) return "";
  return String(input)
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, ""); // strip spaces, hyphens, stray punctuation
}

/**
 * Whether a normalized string is a well-formed trace code. This is a FORMAT
 * check only — it says nothing about whether the code exists.
 * @param {unknown} input
 * @returns {boolean}
 */
function isValidTraceCode(input) {
  if (typeof input !== "string") return false;
  if (input.length !== CODE_LENGTH) return false;
  for (const char of input) {
    if (!ALPHABET.includes(char)) return false;
  }
  return true;
}

module.exports = {
  generateTraceCode,
  normalizeTraceCode,
  isValidTraceCode,
  ALPHABET,
  CODE_LENGTH,
};
