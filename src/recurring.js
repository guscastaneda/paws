import { errRes, jsonRes, atFetch } from "./helpers.js";
import { CLIENTS_TABLE, PETS_TABLE } from "./constants.js";

const RECURRING_TABLE        = 'tblik1KKdS24p3Rz5';
const BOARDING_SERVICE_ID    = 'recToZsYSMELIVcMN';
const DAYCARE_SERVICE_ID     = 'rec99cemJqkCezIRN';
const HALF_DAYCARE_SERVICE_ID = 'rec4yyzqGvuDGomgy';

const SERVICE_MAP = {
  'boarding':     BOARDING_SERVICE_ID,
  'daycare':      DAYCARE_SERVICE_ID,
  'half-daycare': HALF_DAYCARE_SERVICE_ID,
};

// ── POST /recurring-request ───────────────────────────────────────────────────
// Client requests a new recurring service
export async function handlePostRecurringRequest(req, env) {
  let body;
  try { body = await req.json(); } catch { return errRes("Invalid JSON"); }

  const {
    token, clientId, petIds,
    serviceType, halfDayPreference,
    days, transport, notes,
  } = body;

  if (!token || !clientId || !petIds?.length || !serviceType || !days?.length || !transport) {
    return errRes("Missing required fields");
  }

  const serviceId = SERVICE_MAP[serviceType];
  if (!serviceId) return errRes("Invalid service type");

  // Map half-day preference to start/end times
  let startTime = null;
  let endTime   = null;
  if (serviceType === 'half-daycare') {
    if (halfDayPreference === 'PM') {
      startTime = 'Noon (11:30AM–12:30PM)';
      endTime   = 'Late Afternoon (4:00–5:30PM)';
    } else {
      startTime = 'Early morning (7:30–9AM)';
      endTime   = 'Noon (11:30AM–12:30PM)';
    }
  } else if (serviceType === 'daycare') {
    startTime = 'Early morning (7:30–9AM)';
    endTime   = 'Late Afternoon (4:00–5:30PM)';
  }

  // Fetch client name for the record name
  let clientName = clientId;
  let petNames   = [];
  try {
    const clientRes = await atFetch(env, `/${CLIENTS_TABLE}/${clientId}`);
    if (clientRes.ok) {
      const cd = await clientRes.json();
      clientName = cd.fields["Client Name"] || clientId;
    }
    for (const petId of petIds) {
      const petRes = await atFetch(env, `/${PETS_TABLE}/${petId}`);
      if (petRes.ok) {
        const pd = await petRes.json();
        petNames.push(pd.fields["Pet Name"] || petId);
      }
    }
  } catch (e) {
    console.error("Failed to fetch names:", e);
  }

  const serviceLabel = serviceType === 'half-daycare' ? 'Half-Daycare' : serviceType === 'daycare' ? 'Daycare' : 'Boarding';
  const recordName   = `Recurring ${serviceLabel} for ${petNames.join(', ')} — ${days.join(', ')}`;

  const fields = {
    'fldD8xTYhIYf4x0K9': [clientId],                    // Client (linked)
    'fldHvXQR3MenUZPeK': petIds,                        // Pets (linked)
    'fldLKB5AmHrUKNSFp': [serviceId],                   // Service (linked)
    'fldmTXeB6oeF3yvpZ': days,                          // Days of Week (multi-select)
    'fldOZK4aNqgJ6XPTd': transport,                     // Transport (single select)
    'fldNO517PZokEAJew': 'Weekly',                      // Frequency
    'fldRcrIYS8mBW5gkP': 'Requested',                   // Status
  };

  if (startTime) fields['fldA9Rpn6LfklhBYy'] = startTime;
  if (endTime)   fields['fldbpasZ9gIQYusR7'] = endTime;

  let notesValue = notes || '';
  if (serviceType === 'half-daycare') {
    const prefLabel = halfDayPreference === 'PM' ? 'PM (Noon–Late Afternoon)' : 'AM (Early Morning–Noon)';
    notesValue = `[Half-Daycare Preference: ${prefLabel}]${notesValue ? '\n' + notesValue : ''}`;
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

  // Send notification email
  if (env.RESEND_API_KEY) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:    "Paws on Longmeadow Bookings <bookings@pawsonlongmeadow.com>",
        to:      ["hello@pawsonlongmeadow.com"],
        subject: `New Recurring ${serviceLabel} Request — ${clientName}`,
        html: `
          <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:2rem;color:#2c1f14;">
            <div style="text-align:center;margin-bottom:2rem;">
              <div style="font-size:2rem;">🔄</div>
              <div style="font-size:1.4rem;font-weight:600;color:#2D5A27;letter-spacing:0.1em;text-transform:uppercase;">New Recurring Request</div>
            </div>
            <div style="background:#f5f0eb;border-radius:12px;padding:1.5rem;margin:1.5rem 0;">
              <table style="width:100%;font-size:0.9rem;line-height:1.8;">
                <tr><td style="color:#7a6a5a;width:120px;">Client</td><td style="font-weight:500;">${clientName}</td></tr>
                <tr><td style="color:#7a6a5a;">Pet(s)</td><td style="font-weight:500;">${petNames.join(', ')}</td></tr>
                <tr><td style="color:#7a6a5a;">Service</td><td style="font-weight:500;">${serviceLabel}</td></tr>
                <tr><td style="color:#7a6a5a;">Days</td><td style="font-weight:500;">${days.join(', ')}</td></tr>
                <tr><td style="color:#7a6a5a;">Transport</td><td style="font-weight:500;">${transport}</td></tr>
                ${halfDayPreference ? `<tr><td style="color:#7a6a5a;">Preference</td><td style="font-weight:500;">${halfDayPreference === 'PM' ? 'PM' : 'AM'}</td></tr>` : ''}
                ${notes ? `<tr><td style="color:#7a6a5a;">Notes</td><td style="font-weight:500;">${notes}</td></tr>` : ''}
              </table>
            </div>
            <p style="font-size:0.9rem;color:#7a6a5a;">Review and activate in Airtable.</p>
            <div style="border-top:1px solid #e8e0d8;margin-top:2rem;padding-top:1rem;text-align:center;font-size:0.8rem;color:#7a6a5a;">© Paws on Longmeadow · Sharon, MA</div>
          </div>`,
      }),
    }).catch(e => console.error("Email error:", e));
  }

  return jsonRes({ success: true, recurringId: recId }, 201);
}

// ── POST /recurring-pause ─────────────────────────────────────────────────────
// Client requests a pause for up to 2 weeks
export async function handlePostRecurringPause(req, env) {
  let body;
  try { body = await req.json(); } catch { return errRes("Invalid JSON"); }

  const { token, clientId, recurringId, pauseUntil } = body;
  if (!token || !clientId || !recurringId || !pauseUntil) return errRes("Missing required fields");

  // Validate pause is within 2 weeks
  const today    = new Date();
  const maxPause = new Date();
  maxPause.setDate(maxPause.getDate() + 14);
  const pauseDate = new Date(pauseUntil + 'T12:00:00');

  if (pauseDate > maxPause) {
    return errRes("Pause period cannot exceed 2 weeks. Contact us for longer holds.", 400);
  }
  if (pauseDate <= today) {
    return errRes("Pause date must be in the future.", 400);
  }

  const res = await atFetch(env, `/${RECURRING_TABLE}/${recurringId}`, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        'fldRcrIYS8mBW5gkP': 'Paused',
        'fldgiU49GyUGFBPJP': pauseUntil,
      },
      typecast: true,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return errRes("Failed to pause: " + JSON.stringify(err), 502);
  }

  // Notify
  if (env.RESEND_API_KEY) {
    let clientName = clientId;
    try {
      const cr = await atFetch(env, `/${CLIENTS_TABLE}/${clientId}`);
      if (cr.ok) { const cd = await cr.json(); clientName = cd.fields["Client Name"] || clientId; }
    } catch {}

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:    "Paws on Longmeadow Bookings <bookings@pawsonlongmeadow.com>",
        to:      ["hello@pawsonlongmeadow.com"],
        subject: `Recurring Service Pause Request — ${clientName}`,
        html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:2rem;color:#2c1f14;">
          <p><strong>${clientName}</strong> has requested a pause on recurring service until <strong>${new Date(pauseUntil + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong>.</p>
          <p style="color:#7a6a5a;">Record ID: ${recurringId}. Review in Airtable.</p>
        </div>`,
      }),
    }).catch(e => console.error("Email error:", e));
  }

  return jsonRes({ success: true });
}

// ── POST /recurring-cancel ────────────────────────────────────────────────────
// Client requests cancellation of a recurring service
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

  // Notify
  if (env.RESEND_API_KEY) {
    let clientName = clientId;
    try {
      const cr = await atFetch(env, `/${CLIENTS_TABLE}/${clientId}`);
      if (cr.ok) { const cd = await cr.json(); clientName = cd.fields["Client Name"] || clientId; }
    } catch {}

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:    "Paws on Longmeadow Bookings <bookings@pawsonlongmeadow.com>",
        to:      ["hello@pawsonlongmeadow.com"],
        subject: `Recurring Service Cancellation Request — ${clientName}`,
        html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:2rem;color:#2c1f14;">
          <p><strong>${clientName}</strong> has requested cancellation of a recurring service.</p>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
          <p style="color:#7a6a5a;">Record ID: ${recurringId}. Review and archive in Airtable.</p>
        </div>`,
      }),
    }).catch(e => console.error("Email error:", e));
  }

  return jsonRes({ success: true });
}
