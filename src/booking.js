import { errRes, jsonRes, atFetch } from "./helpers.js";
import { CLIENTS_TABLE, PETS_TABLE, APPOINTMENTS_TABLE, BOARDING_SERVICE_ID, FIELDS } from "./constants.js";

const DAYCARE_SERVICE_ID      = 'rec99cemJqkCezIRN';
const HALF_DAYCARE_SERVICE_ID = 'rec4yyzqGvuDGomgy';

const WAITLIST_THRESHOLD_BOARDING = 180;
const WAITLIST_THRESHOLD_DAYCARE  = 60;

function serviceConfig(serviceType, halfDayPreference) {
  switch (serviceType) {
    case 'daycare':
      return { serviceId: DAYCARE_SERVICE_ID,       category: 'DC', threshold: WAITLIST_THRESHOLD_DAYCARE,  startTime: null, endTime: null };
    case 'half-daycare':
      return {
        serviceId: HALF_DAYCARE_SERVICE_ID, category: 'HD', threshold: WAITLIST_THRESHOLD_DAYCARE,
        startTime: halfDayPreference === 'PM' ? 'Noon (11:30AM–12:30PM)'       : 'Early morning (7:30–9AM)',
        endTime:   halfDayPreference === 'PM' ? 'Late Afternoon (4:00–5:30PM)' : 'Noon (11:30AM–12:30PM)',
      };
    default:
      return { serviceId: BOARDING_SERVICE_ID, category: 'B', threshold: WAITLIST_THRESHOLD_BOARDING, startTime: null, endTime: null };
  }
}

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

// ── POST /booking ─────────────────────────────────────────────────────────────
async function handlePostBooking(req, env) {
  let body;
  try { body = await req.json(); } catch { return errRes("Invalid JSON"); }

  const { token, clientId, petIds, serviceType, halfDayPreference, startDate, startTime, endDate, endTime, transport, notes } = body;
  const isBoarding    = !serviceType || serviceType === 'boarding';
  const isDaycare     = serviceType === 'daycare';
  const isHalfDaycare = serviceType === 'half-daycare';
  const isSingleDay   = isDaycare || isHalfDaycare;

  if (!token || !clientId || !petIds?.length || !startDate || !transport) return errRes("Missing required fields");
  if (isBoarding && (!startTime || !endDate || !endTime)) return errRes("Missing required fields for boarding");

  const cfg = serviceConfig(serviceType, halfDayPreference);

  const today     = new Date();
  const start     = new Date(startDate + 'T12:00:00');
  const daysAhead = Math.round((start - today) / (1000 * 60 * 60 * 24));
  const autoWaitlist = daysAhead > cfg.threshold;
  const isWaitlist   = autoWaitlist || isHalfDaycare;

  const fields = {
    [FIELDS.APPT_SERVICE]:    [cfg.serviceId],
    [FIELDS.APPT_CATEGORY]:   cfg.category,
    [FIELDS.APPT_PETS]:       petIds,
    [FIELDS.APPT_CLIENT]:     [clientId],
    [FIELDS.APPT_START_DATE]: startDate,
    [FIELDS.APPT_TRANSPORT]:  transport,
    [FIELDS.APPT_STATUS]:     isWaitlist ? "Waitlisted" : "Requested",
  };

  if (cfg.startTime)       fields[FIELDS.APPT_START_TIME] = cfg.startTime;
  else if (startTime)      fields[FIELDS.APPT_START_TIME] = startTime;
  if (isBoarding) {
    fields[FIELDS.APPT_END_DATE] = endDate;
    fields[FIELDS.APPT_END_TIME] = endTime;
  } else {
    fields[FIELDS.APPT_END_DATE] = startDate;
    if (cfg.endTime)  fields[FIELDS.APPT_END_TIME] = cfg.endTime;
    else if (endTime) fields[FIELDS.APPT_END_TIME] = endTime;
  }

  let notesValue = notes || '';
  if (isHalfDaycare) {
    const prefLabel = halfDayPreference === 'PM' ? 'PM (Noon–Late Afternoon)' : 'AM (Early Morning–Noon)';
    notesValue = `[Half-Daycare Preference: ${prefLabel}]${notesValue ? '\n' + notesValue : ''}`;
  }
  if (notesValue) fields[FIELDS.APPT_NOTES] = notesValue;

  const res = await atFetch(env, "/" + APPOINTMENTS_TABLE, {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return errRes("Failed to create booking: " + JSON.stringify(err), 502);
  }

  const created = await res.json();
  const apptId  = created.records[0].id;

  // Fetch client + pet names
  let clientName  = clientId;
  let clientEmail = '';
  let petNames    = petIds.join(", ");

  try {
    const clientRes = await atFetch(env, `/${CLIENTS_TABLE}/${clientId}`);
    if (clientRes.ok) {
      const cd = await clientRes.json();
      clientName  = cd.fields["Client Name"]    || clientId;
      clientEmail = cd.fields["Email Address"]  || '';
    }
    const petNameList = [];
    for (const petId of petIds) {
      const petRes = await atFetch(env, `/${PETS_TABLE}/${petId}`);
      if (petRes.ok) {
        const pd = await petRes.json();
        petNameList.push(pd.fields["Pet Name"] || petId);
      }
    }
    if (petNameList.length > 0) petNames = petNameList.join(", ");
  } catch (e) { console.error("Failed to fetch names:", e); }

  const serviceLabels = { boarding: '🏡 Boarding', daycare: '☀️ Daycare', 'half-daycare': '🌤️ Half-Daycare' };
  const serviceLabel  = serviceLabels[serviceType] || '🏡 Boarding';
  const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' }) : '';

  const dateLabel  = isBoarding ? `${fmtDate(startDate)} → ${fmtDate(endDate)}` : fmtDate(startDate);
  const timeLabel  = isHalfDaycare
    ? (halfDayPreference === 'PM' ? 'Afternoon (Noon–Late Afternoon)' : 'Morning (Early–Noon)')
    : isBoarding
      ? `Start: ${startTime}${endTime ? ' · End: ' + endTime : ''}`
      : 'Full Day';

  const statusNote = isHalfDaycare
    ? 'Your half-daycare request is on the waitlist. We\'ll confirm once we pair your session with the other half of the day.'
    : autoWaitlist
      ? `Your request has been waitlisted — it's more than ${isSingleDay ? '2' : '6'} months out. We'll confirm closer to the date.`
      : 'We\'ll review your request and confirm within 24 hours via text or email.';

  const summaryRows = [
    ['Pet(s)', petNames],
    ['Service', serviceLabel],
    ['Date(s)', dateLabel],
    ['Time', timeLabel],
    ['Transport', transport],
  ];
  if (notes) summaryRows.push(['Notes', notes]);

  // Owner notification
  await sendEmail(env, {
    to: ['hello@pawsonlongmeadow.com'],
    subject: `${isWaitlist ? 'Waitlist' : 'New'} ${serviceLabel} Request — ${clientName}`,
    html: emailWrapper(`
      <h2 style="font-size:1.3rem;font-weight:600;color:#2D5A27;margin-bottom:0.25rem;">New Booking Request</h2>
      <p style="color:#7a6a5a;font-size:0.88rem;">From: ${clientName}${clientEmail ? ' · ' + clientEmail : ''}</p>
      ${summaryTable([...summaryRows, ['Status', isWaitlist ? 'Waitlisted' : 'Requested']])}
      <p style="font-size:0.88rem;color:#7a6a5a;">Review and confirm in Airtable.</p>
    `),
  });

  // Client confirmation
  if (clientEmail) {
    await sendEmail(env, {
      to: [clientEmail],
      replyTo: 'hello@pawsonlongmeadow.com',
      subject: `We received your ${serviceLabel} request`,
      html: emailWrapper(`
        <h2 style="font-size:1.3rem;font-weight:600;color:#2D5A27;margin-bottom:0.25rem;">Request received!</h2>
        <p style="font-size:0.95rem;color:#2c1f14;line-height:1.7;">Hi ${clientName.split(' ')[0]}, thanks for reaching out. Here's a summary of your request:</p>
        ${summaryTable(summaryRows)}
        <p style="font-size:0.95rem;color:#2c1f14;line-height:1.7;">${statusNote}</p>
        <p style="font-size:0.95rem;color:#2c1f14;line-height:1.7;margin-top:1.5rem;">— Gus &amp; Marian<br><span style="color:#7a6a5a;">Paws on Longmeadow</span></p>
      `),
    });
  }

  return jsonRes({ success: true, appointmentId: apptId, waitlisted: isWaitlist, autoWaitlist }, 201);
}

export { handlePostBooking };
