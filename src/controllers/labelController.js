// labelController.js
// Renders every trace code on a pack run as a printable PDF of jar labels.
//
// One request for the whole run, rather than one <img> per label: a print view
// pulling 500 QR images individually would trip the per-IP rate limit on
// /api/qr/*, and a single PDF is also what a label printer actually wants.
//
// Layout is a plain grid whose geometry comes from query parameters, so the
// label stock can be matched later without a code change. Defaults suit an A4
// sheet of 3 x 8 (roughly 70 x 37 mm per label).

const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const prisma = require("../config/prisma");
const { toDateOnly } = require("../lib/dates");

const PAGE_SIZES = { A4: "A4", LETTER: "LETTER" };
const MM = 72 / 25.4; // PDF points per millimetre

function clampInt(raw, min, max, fallback) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// GET /api/admin/pack-runs/:id/labels.pdf?cols=3&rows=8&size=A4&margin_mm=8
exports.packRunLabelsPdf = async (req, res) => {
  const packRunId = Number(req.params.id);

  const run = await prisma.pack_runs.findUnique({
    where: { pack_run_id: packRunId },
    include: {
      lot: {
        include: {
          estate: { select: { name: true } },
          factory: { select: { name: true } },
        },
      },
      trace_codes: {
        where: { status: "active" },
        orderBy: { created_at: "asc" },
        select: { code: true },
      },
    },
  });
  if (!run) {
    return res.status(404).json({ message: "Pack run not found." });
  }
  if (run.trace_codes.length === 0) {
    return res
      .status(404)
      .json({ message: "This pack run has no active codes to print." });
  }

  const base = (process.env.TRACE_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!base) {
    return res
      .status(503)
      .json({ message: "Label printing is not configured (TRACE_BASE_URL)." });
  }

  // The display name comes from product details when staff have saved one;
  // the SKU is the fallback so a label is never blank.
  const info = run.shopify_product_id
    ? await prisma.product_trace_info.findUnique({
        where: { shopify_product_id: run.shopify_product_id },
        select: { title: true },
      })
    : null;
  const title = (info && info.title) || run.sku || run.lot.grade || "";

  const size = PAGE_SIZES[String(req.query.size || "A4").toUpperCase()] || "A4";
  const cols = clampInt(req.query.cols, 1, 10, 3);
  const rows = clampInt(req.query.rows, 1, 20, 8);
  const margin = clampInt(req.query.margin_mm, 0, 30, 8) * MM;

  const doc = new PDFDocument({ size, margin: 0, autoFirstPage: false });

  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="labels-${run.pack_run_code}.pdf"`,
    // Codes can be added to a run later, so this must not be cached as final.
    "Cache-Control": "no-store",
  });
  doc.pipe(res);

  doc.addPage();
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const cellW = (pageW - 2 * margin) / cols;
  const cellH = (pageH - 2 * margin) / rows;
  const pad = 2 * MM;
  // QR takes 40% of the width: at the default grid that is ~28 mm, plenty for a
  // ~50-character URL at error-correction Q, and leaves the text column wide
  // enough that a two-word product name does not wrap and truncate.
  const qrSide = Math.min(cellH - 2 * pad, cellW * 0.4);
  const perPage = cols * rows;
  const packed = toDateOnly(run.packed_date);

  for (let i = 0; i < run.trace_codes.length; i++) {
    if (i > 0 && i % perPage === 0) doc.addPage();

    const { code } = run.trace_codes[i];
    const slot = i % perPage;
    const x = margin + (slot % cols) * cellW;
    const y = margin + Math.floor(slot / cols) * cellH;

    // Error correction Q, as on the single-image endpoint: jar labels get
    // creased and scuffed, and the encoded URL is short enough that the
    // denser symbol costs nothing in print size.
    const png = await QRCode.toBuffer(`${base}/${code}`, {
      type: "png",
      errorCorrectionLevel: "Q",
      margin: 1,
      width: 256,
    });
    doc.image(png, x + pad, y + (cellH - qrSide) / 2, { width: qrSide, height: qrSide });

    const textX = x + pad + qrSide + pad;
    const textW = cellW - (textX - x) - pad;
    const lineH = Math.max(7, Math.min(10, cellH / 7));
    let ty = y + pad + 1;

    // Two full lines for the title. A line of Helvetica is ~1.15 x the font
    // size, so anything under 2.3 x lineH fits only ONE line and a wrapping
    // name like "Glentilt Golden Tips" silently truncates to "Glentilt Golden…".
    doc.font("Helvetica-Bold").fontSize(lineH).text(title, textX, ty, {
      width: textW,
      height: lineH * 2.6,
      ellipsis: true,
    });
    ty += lineH * 2.7;
    doc.font("Helvetica").fontSize(lineH * 0.85);
    doc.text(run.lot.estate.name, textX, ty, { width: textW, ellipsis: true });
    ty += lineH * 1.1;
    doc.text(`Packed ${packed}`, textX, ty, { width: textW });
    ty += lineH * 1.5;
    // The code in text, so a scuffed QR can still be typed in.
    doc.font("Courier-Bold").fontSize(lineH).text(code, textX, ty, { width: textW });

    // Faint cut guide.
    doc.save().lineWidth(0.25).strokeColor("#cccccc").rect(x, y, cellW, cellH).stroke().restore();
  }

  doc.end();
};
