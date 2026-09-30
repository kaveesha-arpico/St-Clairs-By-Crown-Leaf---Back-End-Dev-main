
const prisma = require("../config/prisma");
const { sendContactEmail, sendContactConfirmation } = require("../lib/mailer");

// The same success body for a genuine submission and for a honeypot hit, so a
// bot can't tell the two apart.
const SUCCESS = { success: true, message: "Thanks — we'll be in touch." };


function honeypot(req, res, next) {
  const trap = req.body && req.body.company;
  if (typeof trap === "string" && trap.trim() !== "") {
    return res.status(201).json(SUCCESS);
  }
  return next();
}

// POST /api/contact — persist the enquiry. `name`/`email`/`message` are already

async function createContact(req, res) {
  const { name, email, message } = req.body;

  await prisma.contact_messages.create({
    data: {
      name,
      email,

      message,
      ip: req.ip ? String(req.ip).slice(0, 45) : null,
      user_agent: (req.get("user-agent") || "").slice(0, 512) || null,
    },
  });


  // Best-effort, fire-and-forget: notify the team AND acknowledge to the
  // customer. Neither blocks the response, and a mail failure never fails the
  // submission — the stored row above is the durable record.
  sendContactEmail({ name, email, message }).catch((err) =>
    console.error("[contact] team notification failed:", err.message)
  );
  sendContactConfirmation({ name, email, message }).catch((err) =>
    console.error("[contact] customer confirmation failed:", err.message)
  );

  return res.status(201).json(SUCCESS);
}

module.exports = { honeypot, createContact };
