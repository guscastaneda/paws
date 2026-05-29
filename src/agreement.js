import { cors, errRes, jsonRes, atFetch } from "./helpers.js";
import { CLIENTS_TABLE, FIELDS } from "./constants.js";

const AGREEMENT_VERSION = "v1.0";

// ── POST /agreement ───────────────────────────────────────────────────────────
async function handlePostAgreement(req, env) {
  let body;
  try { body = await req.json(); } catch { return errRes("Invalid JSON"); }

  const { token, clientId, signedName } = body;
  if (!token || !clientId || !signedName?.trim()) {
    return errRes("Missing required fields");
  }

  // Capture audit info from request
  const ip        = req.headers.get("CF-Connecting-IP") || req.headers.get("X-Forwarded-For") || "unknown";
  const userAgent = req.headers.get("User-Agent") || "unknown";
  const signedAt  = new Date().toISOString();

  // Write to Airtable
  const patchRes = await atFetch(env, `/${CLIENTS_TABLE}/${clientId}`, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        [FIELDS.CLIENT_AGREEMENT_SIGNED]: true,
        [FIELDS.CLIENT_AGREEMENT_DATE]:   signedAt.split("T")[0],
        "Agreement Signed Name":          signedName.trim(),
        "Agreement IP Address":           ip,
        "Agreement User Agent":           userAgent,
        "Agreement Version":              AGREEMENT_VERSION,
      }
    }),
  });

  if (!patchRes.ok) {
    const err = await patchRes.text();
    console.error("Agreement patch error:", err);
    return errRes("Failed to save agreement", 502);
  }

  // Fetch client email and name for confirmation
  const clientRes = await atFetch(env, `/${CLIENTS_TABLE}/${clientId}`);
  let clientEmail = "";
  let clientName  = "";
  if (clientRes.ok) {
    const clientData = await clientRes.json();
    clientEmail = clientData.fields["Email Address"] || "";
    clientName  = clientData.fields["Client Name"]  || signedName;
  }

  // Send confirmation email via Resend
  if (clientEmail && env.RESEND_API_KEY) {
    const emailBody = {
      from:    "Paws on Longmeadow <hello@pawsonlongmeadow.com>",
      to:      [clientEmail],
      subject: "Your Paws on Longmeadow Service Agreement",
      html: `
        <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:2rem;color:#2c1f14;">
          <div style="text-align:center;margin-bottom:2rem;">
            <div style="font-size:2rem;">🐾</div>
            <div style="font-family:Georgia,serif;font-size:1.4rem;font-weight:600;color:#2D5A27;letter-spacing:0.1em;text-transform:uppercase;">Paws on Longmeadow</div>
            <div style="font-size:0.85rem;color:#7a6a5a;margin-top:0.25rem;">Sharon, MA</div>
          </div>

          <p style="font-size:1rem;line-height:1.6;">Hi ${clientName.split(" ")[0]},</p>
          <p style="font-size:1rem;line-height:1.6;">Thank you for signing the Paws on Longmeadow Service Agreement. This email confirms your signature and serves as your record.</p>

          <div style="background:#f5f0eb;border-radius:12px;padding:1.5rem;margin:1.5rem 0;">
            <div style="font-size:0.85rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#7a6a5a;margin-bottom:1rem;">Signature Record</div>
            <table style="width:100%;font-size:0.9rem;line-height:1.8;">
              <tr><td style="color:#7a6a5a;width:140px;">Signed by</td><td style="font-weight:500;">${signedName.trim()}</td></tr>
              <tr><td style="color:#7a6a5a;">Date & time</td><td style="font-weight:500;">${new Date(signedAt).toLocaleString("en-US", { dateStyle:"long", timeStyle:"short", timeZone:"America/New_York" })} ET</td></tr>
              <tr><td style="color:#7a6a5a;">Agreement</td><td style="font-weight:500;">Paws on Longmeadow Service Agreement ${AGREEMENT_VERSION}</td></tr>
              <tr><td style="color:#7a6a5a;">IP address</td><td style="font-weight:500;">${ip}</td></tr>
            </table>
          </div>

          <p style="font-size:0.9rem;line-height:1.6;color:#7a6a5a;">By signing, you agreed to the terms of the Paws on Longmeadow Service Agreement. Please keep this email for your records. If you have any questions, reply to this email or reach out at hello@pawsonlongmeadow.com.</p>

          <div style="border-top:1px solid #e8e0d8;margin-top:2rem;padding-top:1rem;text-align:center;font-size:0.8rem;color:#7a6a5a;">
            © Paws on Longmeadow · Sharon, MA
          </div>
        </div>
      `,
    };

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailBody),
    });

    if (!emailRes.ok) {
      const emailErr = await emailRes.text();
      console.error("Resend error:", emailErr);
      // Don't fail the request — agreement is saved, email is best-effort
    }
  }

  return jsonRes({ ok: true, signedAt, version: AGREEMENT_VERSION });
}

export { handlePostAgreement };