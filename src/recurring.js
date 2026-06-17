import { errRes, jsonRes, atFetch } from "./helpers.js";
import { CLIENTS_TABLE, PETS_TABLE } from "./constants.js";

const RECURRING_TABLE         = 'tblik1KKdS24p3Rz5';
const BOARDING_SERVICE_ID     = 'recToZsYSMELIVcMN';
const DAYCARE_SERVICE_ID      = 'rec99cemJqkCezIRN';
const HALF_DAYCARE_SERVICE_ID = 'rec4yyzqGvuDGomgy';

const SERVICE_MAP = {
  'boarding':     BOARDING_SERVICE_ID,
  'daycare':      DAYCARE_SERVICE_ID,
  'half-daycare': HALF_DAYCARE_SERVICE_ID,
};

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

// ── POST /recurring-request ───────────────────────────────────────────────────
export async function handlePostRecurringRequest(req, env) {
  let body;
  try { body = await req.json(); } catch { return errRes("Invalid JSON"); }

  const { token, clientId, petIds, serviceType, halfDayPreference, days, transport, notes } = body;
  if (!token || !clientId || !petIds?.length || !serviceType || !days?.length || !transport) return errRes("Missing required fields");

  const serviceId = SERVICE_MAP[serviceType];
  if (!serviceId) return errRes("Invalid service type");

  let startTime = null;
  let endTime   = null;
  if (serviceType === 'half-daycare') {
    startTime = halfDayPreference === 'PM' ? 'Noon (11:30AM–12:30PM)'       : 'Early morning (7:30–9AM)';
    endTime   = halfDayPreference === 'PM' ? 'Late Afternoon (4:00–5:30PM)' : 'Noon (11:30AM–12:30PM)';
  } else if (serviceType === 'daycare') {
    startTime = 'Early morning (7:30–9AM)';
    endTime   = 'Late Afternoon (4:00–5:30PM)';
  }

  let clientName  = clientId;
  let clientEmail = '';
  let petNames    = [];
  try {
    const cr = await atFetch(env, `/${CLIENTS_TABLE}/${clientId}`);
    if (cr.ok) { const cd = await cr.json(); clientName = cd.fields["Client Name"] || clientId; clientEmail = cd.fields["Email Address"] || ''; }
    for (const petId of petIds) {
      const pr = await atFetch(env, `/${PETS_TABLE}/${petId}`);
      if (pr.ok) { const pd = await pr.json(); petNames.push(pd.fields["Pet Name"] || petId); }
    }
  } catch (e) { console.error("Failed to fetch names:", e); }

  const serviceLabels = { 'boarding': 'Boarding', 'daycare': 'Daycare', 'half-daycare': 'Half-Daycare' };
  const serviceLabel  = serviceLabels[serviceType] || 'Daycare';
  const pluralDays    = days.map(d => d + 's').join(', ');
  const prefLabel     = serviceType === 'half-daycare'
    ? (halfDayPreference === 'PM' ? ' (Afternoon)' : ' (Morning)')
    : '';

  const fields = {
    'fldHvXQR3MenUZPeK': petIds,
    'fldLKB5AmHrUKNSFp': [serviceId],
    'fldmTXeB6oeF3yvpZ': days,
    'fldOZK4aNqgJ6XPTd': transport,
    'fldNO517PZokEAJew': 'Weekly',
    'fldRcrIYS8mBW5gkP': 'Requested',
  };
  if (startTime) fields['fldA9Rpn6LfklhBYy'] = startTime;
  if (endTime)   fields['fldbpasZ9gIQYusR7']  = endTime;

  let notesValue = notes || '';
  if (serviceType === 'half-daycare') {
    notesValue = `[Half-Daycare Preference: ${halfDayPreference === 'PM' ? 'PM' : 'AM'}]${notesValue ? '\n' + notesValue : ''}`;
  }
  if (notesValue) fields['fldfsbWrDjjtiq5mJ'] = notesValue;

  const res = await atFetch(env, `/${RECURRING_TABLE}`, {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return errRes("Failed to create recurring request: " + JSON.stringify(err), 502);
  }

  const created = await res.json();
  const recId   = created.records[0].id;

  const summaryRows = [
    ['Pet(s)',     petNames.join(', ')],
    ['Service',   serviceLabel],
    ['Schedule',  pluralDays + prefLabel],
    ['Frequency', 'Weekly'],
    ['Transport', transport],
  ];
  if (notes) summaryRows.push(['Notes', notes]);

  // Owner notification
  await sendEmail(env, {
    to: ['hello@pawsonlongmeadow.com'],
    subject: `New Recurring ${serviceLabel} Request — ${clientName}`,
    html: emailWrapper(`
      <h2 style="font-size:1.3rem;font-weight:600;color:#2D5A27;margin-bottom:0.25rem;">New Recurring Request</h2>
      <p style="color:#7a6a5a;font-size:0.88rem;">From: ${clientName}${clientEmail ? ' · ' + clientEmail : ''}</p>
      ${summaryTable(summaryRows)}
      <p style="font-size:0.88rem;color:#7a6a5a;">Review and activate in Airtable.</p>
    `),
  });

  // Client confirmation
  if (clientEmail) {
    await sendEmail(env, {
      to: [clientEmail],
      replyTo: 'hello@pawsonlongmeadow.com',
      subject: `We received your recurring ${serviceLabel} request`,
      html: emailWrapper(`
        <h2 style="font-size:1.3rem;font-weight:600;color:#2D5A27;margin-bottom:0.25rem;">Recurring service request received!</h2>
        <p style="font-size:0.95rem;color:#2c1f14;line-height:1.7;">Hi ${clientName.split(' ')[0]}, we've received your request for recurring ${serviceLabel.toLowerCase()}. Here's what you submitted:</p>
        ${summaryTable(summaryRows)}
        <p style="font-size:0.95rem;color:#2c1f14;line-height:1.7;">We'll review your request and confirm your schedule within 24 hours. Once confirmed, you'll see individual appointments appear in your portal as we schedule them out.</p>
        <p style="font-size:0.95rem;color:#2c1f14;line-height:1.7;margin-top:1.5rem;">— Gus &amp; Marian<br><span style="color:#7a6a5a;">Paws on Longmeadow</span></p>
      `),
    });
  }

  return jsonRes({ success: true, recurringId: recId }, 201);
}

// ── POST /recurring-pause ─────────────────────────────────────────────────────
export async function handlePostRecurringPause(req, env) {
  let body;
  try { body = await req.json(); } catch { return errRes("Invalid JSON"); }

  const { token, clientId, recurringId, pauseUntil } = body;
  if (!token || !clientId || !recurringId || !pauseUntil) return errRes("Missing required fields");

  const today    = new Date();
  const maxPause = new Date();
  maxPause.setDate(maxPause.getDate() + 14);
  const pauseDate = new Date(pauseUntil + 'T12:00:00');

  if (pauseDate > maxPause) return errRes("Pause period cannot exceed 2 weeks.", 400);
  if (pauseDate <= today)   return errRes("Pause date must be in the future.", 400);

  const res = await atFetch(env, `/${RECURRING_TABLE}/${recurringId}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: { 'fldRcrIYS8mBW5gkP': 'Paused', 'fldgiU49GyUGFBPJP': pauseUntil }, typecast: true }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return errRes("Failed to pause: " + JSON.stringify(err), 502);
  }

  let clientName  = clientId;
  let clientEmail = '';
  try {
    const cr = await atFetch(env, `/${CLIENTS_TABLE}/${clientId}`);
    if (cr.ok) { const cd = await cr.json(); clientName = cd.fields["Client Name"] || clientId; clientEmail = cd.fields["Email Address"] || ''; }
  } catch {}

  const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
  const resumeLabel = fmtDate(pauseUntil);

  // Owner notification
  await sendEmail(env, {
    to: ['hello@pawsonlongmeadow.com'],
    subject: `Recurring Service Pause Request — ${clientName}`,
    html: emailWrapper(`
      <h2 style="font-size:1.3rem;font-weight:600;color:#c07a2a;margin-bottom:0.25rem;">Pause Request</h2>
      <p style="color:#7a6a5a;font-size:0.88rem;">From: ${clientName}${clientEmail ? ' · ' + clientEmail : ''}</p>
      ${summaryTable([['Resume After', resumeLabel], ['Record ID', recurringId]])}
      <p style="font-size:0.88rem;color:#7a6a5a;">Status updated to Paused in Airtable.</p>
    `),
  });

  // Client confirmation
  if (clientEmail) {
    await sendEmail(env, {
      to: [clientEmail],
      replyTo: 'hello@pawsonlongmeadow.com',
      subject: 'Your recurring service has been paused',
      html: emailWrapper(`
        <h2 style="font-size:1.3rem;font-weight:600;color:#c07a2a;margin-bottom:0.25rem;">Service paused</h2>
        <p style="font-size:0.95rem;color:#2c1f14;line-height:1.7;">Hi ${clientName.split(' ')[0]}, we've received your pause request. Your spot is held and your service will resume automatically after:</p>
        ${summaryTable([['Resume After', resumeLabel]])}
        <p style="font-size:0.95rem;color:#2c1f14;line-height:1.7;">If you need to extend beyond 2 weeks, please reach out directly — we'll do our best to accommodate, though we can't always guarantee your spot after that window.</p>
        <p style="font-size:0.95rem;color:#2c1f14;line-height:1.7;margin-top:1.5rem;">— Gus &amp; Marian<br><span style="color:#7a6a5a;">Paws on Longmeadow</span></p>
      `),
    });
  }

  return jsonRes({ success: true });
}

// ── POST /recurring-cancel ────────────────────────────────────────────────────
export async function handlePostRecurringCancel(req, env) {
  let body;
  try { body = await req.json(); } catch { return errRes("Invalid JSON"); }

  const { token, clientId, recurringId, reason } = body;
  if (!token || !clientId || !recurringId) return errRes("Missing required fields");

  const res = await atFetch(env, `/${RECURRING_TABLE}/${recurringId}`, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        'fldRcrIYS8mBW5gkP': 'Cancellation Requested',
        ...(reason ? { 'fldfsbWrDjjtiq5mJ': `[CANCELLATION REQUEST]\n${reason}` } : {}),
      },
      typecast: true,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return errRes("Failed to cancel: " + JSON.stringify(err), 502);
  }

  let clientName  = clientId;
  let clientEmail = '';
  try {
    const cr = await atFetch(env, `/${CLIENTS_TABLE}/${clientId}`);
    if (cr.ok) { const cd = await cr.json(); clientName = cd.fields["Client Name"] || clientId; clientEmail = cd.fields["Email Address"] || ''; }
  } catch {}

  // Owner notification
  await sendEmail(env, {
    to: ['hello@pawsonlongmeadow.com'],
    subject: `Recurring Service Cancellation Request — ${clientName}`,
    html: emailWrapper(`
      <h2 style="font-size:1.3rem;font-weight:600;color:#c0392b;margin-bottom:0.25rem;">Cancellation Request</h2>
      <p style="color:#7a6a5a;font-size:0.88rem;">From: ${clientName}${clientEmail ? ' · ' + clientEmail : ''}</p>
      ${summaryTable([['Record ID', recurringId], ...(reason ? [['Reason', reason]] : [])])}
      <p style="font-size:0.88rem;color:#7a6a5a;">Status updated to Cancellation Requested in Airtable. Review and archive when ready.</p>
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
        <p style="font-size:0.95rem;color:#2c1f14;line-height:1.7;">Hi ${clientName.split(' ')[0]}, we've received your request to cancel your recurring service. We'll review it and follow up shortly.</p>
        <p style="font-size:0.95rem;color:#2c1f14;line-height:1.7;">Please note that any individual upcoming appointments already created will remain on your schedule unless cancelled separately through the portal.</p>
        ${reason ? `<p style="font-size:0.88rem;color:#7a6a5a;font-style:italic;">Your note: "${reason}"</p>` : ''}
        <p style="font-size:0.95rem;color:#2c1f14;line-height:1.7;margin-top:1.5rem;">— Gus &amp; Marian<br><span style="color:#7a6a5a;">Paws on Longmeadow</span></p>
      `),
    });
  }

  return jsonRes({ success: true });
}
