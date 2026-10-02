// qrController.js
// Renders the QR image for a traceability code, as PNG or SVG.
//
// Deliberately does NO database lookup. The handler turns a code into a picture
// of a URL and nothing more, for two reasons:
//
//  1. No enumeration oracle. If this route 404'd on codes that don't exist, it
//     would answer "is this code real?" for anyone who asked — outside the rate
//     limiting that protects the public trace lookup. Rendering unconditionally
//     means there is nothing here to probe.
//  2. It stays cheap and cacheable. The QR for a given code never changes, so
//     responses are immutable and can sit in any cache indefinitely.
//
// A QR for a non-existent code is harmless: scanning it reaches the trace page,
// which reports "not found" like any other unknown code.

const QRCode = require("qrcode");
const { normalizeTraceCode, isValidTraceCode } = require("../lib/traceCode");

// Error correction level Q (~25% recoverable). Higher than the "M" default
// because these are printed on tea packaging, which gets creased, curved and
// scuffed in transit. At ~50 characters the encoded URL is short enough that
// the denser symbol costs nothing meaningful in print size.
const ERROR_CORRECTION_LEVEL = "Q";

const DEFAULT_SIZE = 512;
const MIN_SIZE = 128;
const MAX_SIZE = 2048;

// Quiet-zone width, in modules. The QR spec requires 4; anything less and some
// scanners fail to lock on.
const MARGIN = 4;

const FORMATS = {
  png: "image/png",
  svg: "image/svg+xml",
};

/**
 * Build the URL a scanned code resolves to.
 * @param {string} code - a validated trace code.
 * @returns {string|null} the full URL, or null if the base URL is unconfigured.
 */
function buildTraceUrl(code) {
  const base = (process.env.TRACE_BASE_URL || "").trim();
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/${code}`;
}

/**
 * Clamp the requested pixel size into a sane range. Anything unparseable falls
 * back to the default rather than erroring — this is a rendering hint, not
 * meaningful input.
 */
function resolveSize(raw) {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_SIZE;
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, parsed));
}

// GET /api/qr/:file   where :file is "<CODE>.png" or "<CODE>.svg"
exports.renderQr = async (req, res) => {
  const file = String(req.params.file || "");
  const lastDot = file.lastIndexOf(".");

  if (lastDot === -1) {
    return res.status(400).json({
      success: false,
      message: "Request a .png or .svg image, e.g. /api/qr/K7M2QP9XTR4B.png",
    });
  }

  const extension = file.slice(lastDot + 1).toLowerCase();
  const contentType = FORMATS[extension];
  if (!contentType) {
    return res.status(400).json({
      success: false,
      message: `Unsupported format ".${extension}". Use .png or .svg.`,
    });
  }

  // Accept a code as a human might have typed it (lowercase, hyphenated) but
  // encode the canonical uppercase form into the image.
  const code = normalizeTraceCode(file.slice(0, lastDot));
  if (!isValidTraceCode(code)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid trace code format." });
  }

  const url = buildTraceUrl(code);
  if (!url) {
    console.error(
      "[qr] TRACE_BASE_URL is not set — refusing to render a QR pointing nowhere."
    );
    return res
      .status(503)
      .json({ success: false, message: "QR rendering is not configured." });
  }

  const options = {
    errorCorrectionLevel: ERROR_CORRECTION_LEVEL,
    margin: MARGIN,
    width: resolveSize(req.query.size),
  };

  const body =
    extension === "svg"
      ? await QRCode.toString(url, { ...options, type: "svg" })
      : await QRCode.toBuffer(url, { ...options, type: "png" });

  res.set({
    "Content-Type": contentType,
    // The image for a code is fixed forever, so let caches keep it.
    "Cache-Control": "public, max-age=31536000, immutable",
    // Offer a sensible filename when staff click the download link in admin.
    "Content-Disposition": `inline; filename="trace-${code}.${extension}"`,
  });
  return res.send(body);
};
