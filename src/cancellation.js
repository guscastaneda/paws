import { errRes, jsonRes, atFetch } from "./helpers.js";
import { APPOINTMENTS_TABLE, CLIENTS_TABLE, PETS_TABLE } from "./constants.js";

async function sendEmail(env, { to, replyTo, subject, html }) {
  if (!env.RESEND_API_KEY) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Paws on Longmeadow <bookings@pawsonlongmeadow.com>", to, reply_to: replyTo, subject, html }),
  }).catch(e => console.error("Email error:", e));
}

function emailWrapper(body) {
  return `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:2rem;color:#2c1f14;background:#fdfcfb;">
    <div style="text-align:center;margin-bottom:2rem;">
      <div style="font-size:1.5rem;letter-spacing:0.15em;font-weight:600;color:#2D5A27;text-transform:uppercase;">Paws on Longmeadow</div>
      <div style="font-size:0.8rem;color:#7a6a5a;margin-top:0.25rem;">Sharon, Massachusetts</div>
    </div>
    ${body}
    <div style="border-top:1px solid #e8e0d8;margin-top:2.5rem;padding-top:1rem;text-align:center;font-size:0.8rem;color:#7a6a5a;">
      © Paws on Longmeadow · Sharon, MA · <a href="https://client.pawsonlongmeadow.com" style="color:#2D5A27;">Client Portal</a>
    </div>
  </div>`;
}

function summaryTable(rows) {
  return `<div style="background:#f5f0eb;border-radius:12px;padding:1.25rem 1.5rem;margin:1.25rem 0;">
    <table style="width:100%;font-size:0.88rem;line-height:1.9;border-collapse:collapse;">
      ${rows.map(([label, value]) => `<tr><td style="color:#7a6a5a;width:130px;vertical-align:top;">${label}</td><td style="font-weight:500;color:#2c1f14;">${value}</td></tr>`).join('')}
    </table>
  </div>`;
}

// ── POST /cancellation ────────────────────────────────────────────────────────
export async function handlePostCancellation(req, env) {
  let body;
  try { body = await req.json(); } catch { return errRes("Invalid JSON"); }

  const { token, clientId, appointmentId, serviceType, startDate, reason } = body;
  if (!token || !clientId || !appointmentId) return errRes("Missing required fields");

  const apptRes = await atFetch(env, `/${APPOINTMENTS_TABLE}/${appointmentId}`);
  if (!apptRes.ok) return errRes("Appointment not found", 404);

  const appt   = await apptRes.json();
  const af     = appt.fields || {};
  const status = typeof af["Status"] === "object" ? af["Status"].name : af["Status"] || "";

  if (status === "Cancelled" || status === "Cancellation Requested") {
    return errRes("Appointment is already cancelled or cancellation is pending", 400);
  }

  const patchRes = await atFetch(env, `/${APPOINTMENTS_TABLE}/${appointmentId}`, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        "Status": "Cancellation Requested",
        "Appointment Notes": reason ? `[CANCELLATION REQUEST]\n${reason}` : "[CANCELLATION REQUEST — no reason provided]",
      },
      typecast: true,
    }),
  });

  if (!patchRes.ok) {
    const err = await patchRes.json().catch(() => ({}));
    return errRes("Failed to update appointment: " + JSON.stringify(err), 502);
  }

  let clientName  = clientId;
  let clientEmail = '';
  try {
    const cr = await atFetch(env, `/${CLIENTS_TABLE}/${clientId}`);
    if (cr.ok) { const cd = await cr.json(); clientName = cd.fields["Client Name"] || clientId; clientEmail = cd.fields["Email Address"] || ''; }
  } catch {}

  const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' }) : 'Unknown';
  const serviceLabel = serviceType === 'DC' ? '☀️ Daycare' : serviceType === 'HD' ? '🌤️ Half-Daycare' : '🏡 Boarding';
  const dateLabel    = af["Start Date"] ? fmtDate(af["Start Date"]) + (af["End Date"] && af["End Date"] !== af["Start Date"] ? ' → ' + fmtDate(af["End Date"]) : '') : 'Unknown';

  const policy = serviceType === 'DC' || serviceType === 'HD'
    ? 'Cancellations received less than 24 hours in advance are charged 50% of the session rate. No-shows are charged the full rate.'
    : 'Cancellations received less than 48 hours before the start date are charged one night\'s boarding rate. No-shows are charged the full reservation amount.';

  // Owner notification
  await sendEmail(env, {
    to: ['hello@pawsonlongmeadow.com'],
    subject: `Cancellation Request — ${clientName}`,
    html: emailWrapper(`
      <h2 style="font-size:1.3rem;font-weight:600;color:#c0392b;margin-bottom:0.25rem;">Cancellation Request</h2>
      <p style="color:#7a6a5a;font-size:0.88rem;">From: ${clientName}${clientEmail ? ' · ' + clientEmail : ''}</p>
      ${summaryTable([['Service', serviceLabel], ['Dates', dateLabel], ...(reason ? [['Reason', reason]] : [])])}
      <p style="font-size:0.88rem;color:#7a6a5a;">Status updated to Cancellation Requested in Airtable. Review and confirm.</p>
    `),
  });

  // Client confirmation
  if (clientEmail) {
    await sendEmail(env, {
      to: [clientEmail],
      replyTo: 'hello@pawsonlongmeadow.com',
      subject: 'We received your cancellation request',
      html: emailWrapper(`
        <h2 style="font-size:1.3rem;font-weight:600;color:#c0392b;margin-bottom:0.25rem;">Cancellation request received</h2>
        <p style="font-size:0.95rem;color:#2c1f14;line-height:1.7;">Hi ${clientName.split(' ')[0]}, we've received your cancellation request for the following appointment:</p>
        ${summaryTable([['Service', serviceLabel], ['Dates', dateLabel]])}
        <p style="font-size:0.95rem;color:#2c1f14;line-height:1.7;">We'll review and follow up shortly. As a reminder:</p>
        <p style="font-size:0.88rem;color:#7a6a5a;font-style:italic;line-height:1.6;">${policy}</p>
        ${reason ? `<p style="font-size:0.88rem;color:#7a6a5a;font-style:italic;">Your note: "${reason}"</p>` : ''}
        <p style="font-size:0.95rem;color:#2c1f14;line-height:1.7;margin-top:1.5rem;">— Gus &amp; Marian<br><span style="color:#7a6a5a;">Paws on Longmeadow</span></p>
      `),
    });
  }

  return jsonRes({ success: true });
}
