import { errRes, jsonRes, atFetch } from "./helpers.js";
import { APPOINTMENTS_TABLE, CLIENTS_TABLE, PETS_TABLE } from "./constants.js";

const RECURRING_TABLE = 'tblik1KKdS24p3Rz5';

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
      ${rows.map(([label, value]) => `<tr><td style="color:#7a6a5a;width:140px;vertical-align:top;">${label}</td><td style="font-weight:500;color:#2c1f14;">${value}</td></tr>`).join('')}
    </table>
  </div>`;
}

// ── POST /cancellation-confirmed ───────────────────────────────────────────────
// Called by Airtable automation: Status -> Cancelled, after a 5-minute delay.
// Re-checks current state before emailing so a reversed cancellation is a no-op.
export async function handlePostCancellationConfirmed(req, env) {
  let body;
  try { body = await req.json(); } catch { return errRes("Invalid JSON"); }

  const { recordId } = body;
  if (!recordId) return errRes("Missing recordId");

  const apptRes = await atFetch(env, `/${APPOINTMENTS_TABLE}/${recordId}`);
  if (!apptRes.ok) return errRes("Appointment not found", 404);

  const appt   = await apptRes.json();
  const af     = appt.fields || {};
  const status = typeof af["Status"] === "object" ? af["Status"].name : af["Status"] || "";

  // If the cancellation was reversed during the delay window, do nothing.
  if (status !== "Cancelled") {
    return jsonRes({ success: true, skipped: true, reason: `Status is now "${status}", not Cancelled` });
  }

  // Only send for appointments that actually went through the request flow.
  const notes = af["Appointment Notes"] || "";
  if (!notes.includes("[CANCELLATION REQUEST]")) {
    return jsonRes({ success: true, skipped: true, reason: "No cancellation request found in notes" });
  }

  const clientRefs = af["Client"] || af["Clients"] || [];
  const clientId    = (clientRefs[0] && (typeof clientRefs[0] === "object" ? clientRefs[0].id : clientRefs[0])) || null;
  if (!clientId) return errRes("No client linked to appointment", 400);

  let clientName  = clientId;
  let clientEmail = '';
  try {
    const cr = await atFetch(env, `/${CLIENTS_TABLE}/${clientId}`);
    if (cr.ok) {
      const cd = await cr.json();
      clientName  = cd.fields["Client Name"]   || clientId;
      clientEmail = cd.fields["Email Address"] || '';
    }
  } catch (e) { console.error("Failed to fetch client:", e); }

  const category = typeof af["Service Category"] === "object" ? af["Service Category"].name : af["Service Category"] || "";
  const serviceLabels = { B: '🏡 Boarding', DC: '☀️ Daycare', HD: '🌤️ Half-Daycare', HS: '🏠 House Sitting', PT: '🚗 Pet Transport', GW: '🐾 Group Walk', DV: '📋 Drop-in Visit' };
  const serviceLabel  = serviceLabels[category] || category || 'Service';

  const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' }) : '';
  const dateLabel = af["Start Date"]
    ? fmtDate(af["Start Date"]) + (af["End Date"] && af["End Date"] !== af["Start Date"] ? ' → ' + fmtDate(af["End Date"]) : '')
    : '';

  const fee = typeof af["Cancellation Fee"] === "number" ? af["Cancellation Fee"] : null;
  const feeRows = fee !== null
    ? (fee > 0
        ? [['Cancellation fee', `$${fee.toFixed(2)}`]]
        : [['Cancellation fee', 'None — cancelled with sufficient notice']])
    : [];

  const summaryRows = [
    ['Service', serviceLabel],
    ['Date(s)', dateLabel],
    ...feeRows,
  ];

  const feeNote = fee !== null && fee > 0
    ? `A cancellation fee of $${fee.toFixed(2)} applies per our cancellation policy, based on the notice given. We'll include this on your next invoice.`
    : 'No cancellation fee applies — thank you for the advance notice.';

  // Owner notification
  await sendEmail(env, {
    to: ['hello@pawsonlongmeadow.com'],
    subject: `Cancellation Confirmed — ${clientName}`,
    html: emailWrapper(`
      <h2 style="font-size:1.3rem;font-weight:600;color:#7a6a5a;margin-bottom:0.25rem;">Cancellation Confirmed</h2>
      <p style="color:#7a6a5a;font-size:0.88rem;">Client: ${clientName}${clientEmail ? ' · ' + clientEmail : ''}</p>
      ${summaryTable(summaryRows)}
      <p style="font-size:0.88rem;color:#7a6a5a;">Client confirmation email sent.</p>
    `),
  });

  // Client confirmation
  if (clientEmail) {
    await sendEmail(env, {
      to: [clientEmail],
      replyTo: 'hello@pawsonlongmeadow.com',
      subject: 'Your cancellation is confirmed',
      html: emailWrapper(`
        <h2 style="font-size:1.3rem;font-weight:600;color:#7a6a5a;margin-bottom:0.25rem;">Cancellation confirmed</h2>
        <p style="font-size:0.95rem;color:#2c1f14;line-height:1.7;">Hi ${clientName.split(' ')[0]}, this confirms the following appointment has been cancelled:</p>
        ${summaryTable(summaryRows)}
        <p style="font-size:0.95rem;color:#2c1f14;line-height:1.7;">${feeNote}</p>
        <p style="font-size:0.95rem;color:#2c1f14;line-height:1.7;margin-top:1.5rem;">— Gus &amp; Marian<br><span style="color:#7a6a5a;">Paws on Longmeadow</span></p>
      `),
    });
  }

  return jsonRes({ success: true, fee });
}

// ── POST /recurring-archived ───────────────────────────────────────────────────
// Called by Airtable automation: Recurring Appointments Status -> Archived, after a 5-minute delay.
export async function handlePostRecurringArchived(req, env) {
  let body;
  try { body = await req.json(); } catch { return errRes("Invalid JSON"); }

  const { recordId } = body;
  if (!recordId) return errRes("Missing recordId");

  const recRes = await atFetch(env, `/${RECURRING_TABLE}/${recordId}`);
  if (!recRes.ok) return errRes("Recurring appointment not found", 404);

  const rec = await recRes.json();
  const rf  = rec.fields || {};
  const status = rf['Status'] || '';

  if (status !== 'Archived') {
    return jsonRes({ success: true, skipped: true, reason: `Status is now "${status}", not Archived` });
  }

  const notes = rf['Recurring Appointment Notes'] || '';
  if (!notes.includes('[CANCELLATION REQUEST]')) {
    return jsonRes({ success: true, skipped: true, reason: 'No cancellation request found in notes' });
  }

  const petIds = (rf['Pets'] || []).map(p => typeof p === 'object' ? p.id : p).filter(Boolean);
  let petNames = [];
  let clientId = null;
  let clientName  = '';
  let clientEmail = '';

  try {
    for (const petId of petIds) {
      const pr = await atFetch(env, `/${PETS_TABLE}/${petId}`);
      if (pr.ok) {
        const pd = await pr.json();
        petNames.push(pd.fields["Pet Name"] || petId);
        const clientLinks = pd.fields["Clients"] || [];
        if (!clientId && clientLinks.length > 0) {
          clientId = typeof clientLinks[0] === 'object' ? clientLinks[0].id : clientLinks[0];
        }
      }
    }
    if (clientId) {
      const cr = await atFetch(env, `/${CLIENTS_TABLE}/${clientId}`);
      if (cr.ok) {
        const cd = await cr.json();
        clientName  = cd.fields["Client Name"]   || '';
        clientEmail = cd.fields["Email Address"] || '';
      }
    }
  } catch (e) { console.error("Failed to fetch pet/client info:", e); }

  const serviceId = (rf['Service'] || [])[0];
  const serviceLabels = { 'rec99cemJqkCezIRN': 'Daycare', 'rec4yyzqGvuDGomgy': 'Half-Daycare', 'recToZsYSMELIVcMN': 'Boarding' };
  const serviceLabel  = serviceLabels[serviceId] || 'Recurring service';
  const days = (rf['Days of Week'] || []).map(d => d + 's').join(', ');

  const summaryRows = [
    ['Pet(s)',  petNames.join(', ')],
    ['Service', serviceLabel],
    ['Schedule', days],
  ];

  // Owner notification
  await sendEmail(env, {
    to: ['hello@pawsonlongmeadow.com'],
    subject: `Recurring Service Cancellation Confirmed — ${clientName || 'Client'}`,
    html: emailWrapper(`
      <h2 style="font-size:1.3rem;font-weight:600;color:#7a6a5a;margin-bottom:0.25rem;">Recurring Cancellation Confirmed</h2>
      <p style="color:#7a6a5a;font-size:0.88rem;">Client: ${clientName || 'Unknown'}${clientEmail ? ' · ' + clientEmail : ''}</p>
      ${summaryTable(summaryRows)}
    `),
  });

  // Client confirmation
  if (clientEmail) {
    await sendEmail(env, {
      to: [clientEmail],
      replyTo: 'hello@pawsonlongmeadow.com',
      subject: 'Your recurring service has been cancelled',
      html: emailWrapper(`
        <h2 style="font-size:1.3rem;font-weight:600;color:#7a6a5a;margin-bottom:0.25rem;">Recurring service cancelled</h2>
        <p style="font-size:0.95rem;color:#2c1f14;line-height:1.7;">Hi ${(clientName || 'there').split(' ')[0]}, this confirms your recurring service has been cancelled:</p>
        ${summaryTable(summaryRows)}
        <p style="font-size:0.95rem;color:#2c1f14;line-height:1.7;">Any individual appointments already scheduled remain on your calendar unless cancelled separately through the portal. We'd love to have you back anytime — just reach out or submit a new request through the portal.</p>
        <p style="font-size:0.95rem;color:#2c1f14;line-height:1.7;margin-top:1.5rem;">— Gus &amp; Marian<br><span style="color:#7a6a5a;">Paws on Longmeadow</span></p>
      `),
    });
  }

  return jsonRes({ success: true });
}
