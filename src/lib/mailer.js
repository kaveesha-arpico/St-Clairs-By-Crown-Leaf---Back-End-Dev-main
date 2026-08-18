// mailer.js
// Outbound notification email via the Microsoft Graph API using app-only
// (client-credentials) auth against Microsoft Entra ID.
//
// Why Graph and not SMTP:
//   - Microsoft is retiring SMTP AUTH (Basic Auth) client submission, and
//   - the shop inbox (contact@) is a SHARED mailbox with no sign-in credentials
//     to SMTP-auth as in the first place.
// Graph app-only auth sends *as* the shared mailbox without any mailbox
// password, and can be locked to just that mailbox with an Exchange
// Application Access Policy (see DEPLOYMENT / .env.example).
//
// Entirely optional: if the GRAPH_* vars aren't set, sendContactEmail() is a
// no-op that reports it was skipped, so callers never depend on mail being
// configured — the stored DB row is always the durable record.

const {
  GRAPH_TENANT_ID,
  GRAPH_CLIENT_ID,
  GRAPH_CLIENT_SECRET,
  GRAPH_SENDER, // the mailbox we send AS, e.g. contact@crownandleaf.co.uk
  CONTACT_TO, // where enquiries are delivered (defaults to GRAPH_SENDER)
} = process.env;

const isConfigured = Boolean(
  GRAPH_TENANT_ID && GRAPH_CLIENT_ID && GRAPH_CLIENT_SECRET && GRAPH_SENDER
);

if (!isConfigured) {
  console.warn(
    "[mailer] Microsoft Graph not configured (GRAPH_TENANT_ID / GRAPH_CLIENT_ID " +
      "/ GRAPH_CLIENT_SECRET / GRAPH_SENDER) — contact emails will be skipped; " +
      "submissions are still stored."
  );
}

// App tokens are valid ~60-90 min; cache and refresh a minute before expiry so
// we don't fetch a new one on every send.
let tokenCache = { value: null, expiresAt: 0 };

async function getAccessToken() {
  const now = Date.now();
  if (tokenCache.value && now < tokenCache.expiresAt) return tokenCache.value;

  const res = await fetch(
    `https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GRAPH_CLIENT_ID,
        client_secret: GRAPH_CLIENT_SECRET,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    }
  );

  if (!res.ok) {
    throw new Error(
      `Entra token request failed (${res.status}): ${await res.text()}`
    );
  }

  const json = await res.json();
  tokenCache = {
    value: json.access_token,
    expiresAt: now + (Number(json.expires_in) - 60) * 1000,
  };
  return tokenCache.value;
}

// Escape untrusted text for safe inclusion in the HTML body.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Forward a contact-form submission to the shop inbox. Reply-To is set to the
 * customer's address so a reply goes straight back to them.
 * @param {{name:string, email:string, message:string}} submission
 * @returns {Promise<{sent:boolean, skipped?:boolean}>}
 */
async function sendContactEmail({ name, email, message }) {
  if (!isConfigured) return { sent: false, skipped: true };

  const to = CONTACT_TO || GRAPH_SENDER;
  const token = await getAccessToken();

  const payload = {
    message: {
      subject: `New contact enquiry from ${name}`,
      body: {
        contentType: "HTML",
        content:
          `<p><strong>Name:</strong> ${escapeHtml(name)}</p>` +
          `<p><strong>Email:</strong> ${escapeHtml(email)}</p>` +
          `<p><strong>Message:</strong></p>` +
          `<p style="white-space:pre-wrap">${escapeHtml(message)}</p>`,
      },
      toRecipients: [{ emailAddress: { address: to } }],
      // A reply from the inbox goes straight to the customer.
      replyTo: [{ emailAddress: { address: email } }],
    },
    saveToSentItems: true,
  };

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
      GRAPH_SENDER
    )}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  // Graph returns 202 Accepted (empty body) on success.
  if (res.status !== 202) {
    throw new Error(
      `Graph sendMail failed (${res.status}): ${await res.text()}`
    );
  }

  return { sent: true };
}

module.exports = { sendContactEmail, isMailConfigured: isConfigured };
