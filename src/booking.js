import { cors, errRes, jsonRes, atFetch } from "./helpers.js";
import { CLIENTS_TABLE, PETS_TABLE, APPOINTMENTS_TABLE, BOARDING_SERVICE_ID, FIELDS } from "./constants.js";

const DAYCARE_SERVICE_ID      = 'rec99cemJqkCezIRN';
const HALF_DAYCARE_SERVICE_ID = 'rec4yyzqGvuDGomgy';

// Auto-waitlist thresholds in days
const WAITLIST_THRESHOLD_BOARDING = 180; // 6 months
const WAITLIST_THRESHOLD_DAYCARE  = 60;  // 2 months

function serviceConfig(serviceType, halfDayPreference) {
  switch (serviceType) {
    case 'daycare':
      return {
        serviceId:  DAYCARE_SERVICE_ID,
        category:   'DC',
        threshold:  WAITLIST_THRESHOLD_DAYCARE,
        startTime:  null,
        endTime:    null,
      };
    case 'half-daycare':
      return {
        serviceId:  HALF_DAYCARE_SERVICE_ID,
        category:   'HD',
        threshold:  WAITLIST_THRESHOLD_DAYCARE,
        startTime:  halfDayPreference === 'PM' ? 'Noon (11:30AM–12:30PM)'      : 'Early morning (7:30–9AM)',
        endTime:    halfDayPreference === 'PM' ? 'Late Afternoon (4:00–5:30PM)': 'Noon (11:30AM–12:30PM)',
      };
    default: // boarding
      return {
        serviceId:  BOARDING_SERVICE_ID,
        category:   'B',
        threshold:  WAITLIST_THRESHOLD_BOARDING,
        startTime:  null,
        endTime:    null,
      };
  }
}

// ── POST /booking ─────────────────────────────────────────────────────────────
async function handlePostBooking(req, env) {
  let body;
  try { body = await req.json(); } catch { return errRes("Invalid JSON"); }

  const {
    token, clientId, petIds,
    serviceType, halfDayPreference,
    startDate, startTime, endDate, endTime,
    transport, notes,
    waitlist: clientRequestedWaitlist,
  } = body;

  const isBoarding     = !serviceType || serviceType === 'boarding';
  const isDaycare      = serviceType === 'daycare';
  const isHalfDaycare  = serviceType === 'half-daycare';
  const isSingleDay    = isDaycare || isHalfDaycare;

  if (!token || !clientId || !petIds?.length || !startDate || !transport) {
    return errRes("Missing required fields");
  }
  if (isBoarding && (!startTime || !endDate || !endTime)) {
    return errRes("Missing required fields for boarding");
  }
  if (isSingleDay && !startDate) {
    return errRes("Missing date for daycare");
  }

  const cfg = serviceConfig(serviceType, halfDayPreference);

  // ── Auto-waitlist detection ───────────────────────────────────────────────
  const today     = new Date();
  const start     = new Date(startDate + 'T12:00:00');
  const daysAhead = Math.round((start - today) / (1000 * 60 * 60 * 24));
  const autoWaitlist = daysAhead > cfg.threshold;
  const isWaitlist   = clientRequestedWaitlist || autoWaitlist || isHalfDaycare;

  // ── Build appointment fields ──────────────────────────────────────────────
  const fields = {
    [FIELDS.APPT_SERVICE]:    [cfg.serviceId],
    [FIELDS.APPT_CATEGORY]:   cfg.category,
    [FIELDS.APPT_PETS]:       petIds,
    [FIELDS.APPT_CLIENT]:     [clientId],
    [FIELDS.APPT_START_DATE]: startDate,
    [FIELDS.APPT_TRANSPORT]:  transport,
    [FIELDS.APPT_STATUS]:     isWaitlist ? "Waitlisted" : "Requested",
  };

  // Start time
  if (cfg.startTime) {
    fields[FIELDS.APPT_START_TIME] = cfg.startTime;
  } else if (startTime) {
    fields[FIELDS.APPT_START_TIME] = startTime;
  }

  // End date + time
  if (isBoarding) {
    fields[FIELDS.APPT_END_DATE] = endDate;
    fields[FIELDS.APPT_END_TIME] = endTime;
  } else {
    fields[FIELDS.APPT_END_DATE] = startDate; // same day
    if (cfg.endTime) {
      fields[FIELDS.APPT_END_TIME] = cfg.endTime;
    } else if (endTime) {
      fields[FIELDS.APPT_END_TIME] = endTime;
    }
  }

  // Notes — prepend half-day preference if relevant
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
    console.error("Booking error:", JSON.stringify(err));
    return errRes("Failed to create booking: " + JSON.stringify(err), 502);
  }

  const created = await res.json();
  const apptId  = created.records[0].id;

  // ── Fetch client + pet names for notification ─────────────────────────────
  let clientName = clientId;
  let petNames   = petIds.join(", ");

  try {
    const clientRes = await atFetch(env, `/${CLIENTS_TABLE}/${clientId}`);
    if (clientRes.ok) {
      const clientData = await clientRes.json();
      clientName = clientData.fields["Client Name"] || clientId;
    }
    const petNameList = [];
    for (const petId of petIds) {
      const petRes = await atFetch(env, `/${PETS_TABLE}/${petId}`);
      if (petRes.ok) {
        const petData = await petRes.json();
        petNameList.push(petData.fields["Pet Name"] || petId);
      }
    }
    if (petNameList.length > 0) petNames = petNameList.join(", ");
  } catch (e) {
    console.error("Failed to fetch names for notification:", e);
  }

  // ── Send notification email ───────────────────────────────────────────────
  if (env.RESEND_API_KEY) {
    const serviceLabels = { boarding: '🏡 Boarding', daycare: '☀️ Daycare', 'half-daycare': '🌤️ Half-Daycare' };
    const serviceLabel  = serviceLabels[serviceType] || '🏡 Boarding';
    const dateLabel     = isBoarding
      ? `${startDate} → ${endDate}`
      : startDate;
    const timeLabel = isHalfDaycare
      ? (halfDayPreference === 'PM' ? 'PM preference (Noon–Late Afternoon)' : 'AM preference (Early Morning–Noon)')
      : isBoarding
        ? `Start: ${startTime}${endTime ? ' · End: ' + endTime : ''}`
        : 'Full Day';

    const emailSubject = isWaitlist
      ? `Waitlist Request — ${clientName}`
      : `New ${serviceLabel} Request — ${clientName}`;

    const emailIcon    = isWaitlist ? '📋' : (isDaycare || isHalfDaycare ? '☀️' : '🏡');
    const emailHeading = isWaitlist ? 'Waitlist Request' : 'New Booking Request';
    const emailColor   = isWaitlist ? '#7a6a5a' : '#2D5A27';
    const reasonNote   = autoWaitlist
      ? `Auto-waitlisted: booking is ${daysAhead} days in advance (threshold: ${cfg.threshold} days).`
      : isHalfDaycare
        ? 'Auto-waitlisted: half-daycare requires pairing with another booking.'
        : '';

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:    "Paws on Longmeadow Bookings <bookings@pawsonlongmeadow.com>",
        to:      ["hello@pawsonlongmeadow.com"],
        subject: emailSubject,
        html: `
          <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:2rem;color:#2c1f14;">
            <div style="text-align:center;margin-bottom:2rem;">
              <div style="font-size:2rem;">${emailIcon}</div>
              <div style="font-size:1.4rem;font-weight:600;color:${emailColor};letter-spacing:0.1em;text-transform:uppercase;">${emailHeading}</div>
              <div style="font-size:0.85rem;color:#7a6a5a;margin-top:0.25rem;">Paws on Longmeadow</div>
            </div>
            <div style="background:#f5f0eb;border-radius:12px;padding:1.5rem;margin:1.5rem 0;">
              <table style="width:100%;font-size:0.9rem;line-height:1.8;">
                <tr><td style="color:#7a6a5a;width:120px;">Client</td><td style="font-weight:500;">${clientName}</td></tr>
                <tr><td style="color:#7a6a5a;">Pet(s)</td><td style="font-weight:500;">${petNames}</td></tr>
                <tr><td style="color:#7a6a5a;">Service</td><td style="font-weight:500;">${serviceLabel}</td></tr>
                <tr><td style="color:#7a6a5a;">Date(s)</td><td style="font-weight:500;">${dateLabel}</td></tr>
                <tr><td style="color:#7a6a5a;">Time</td><td style="font-weight:500;">${timeLabel}</td></tr>
                <tr><td style="color:#7a6a5a;">Transport</td><td style="font-weight:500;">${transport}</td></tr>
                ${isWaitlist ? `<tr><td style="color:#7a6a5a;">Status</td><td style="font-weight:500;color:#c07a2a;">Waitlisted${reasonNote ? ' — ' + reasonNote : ''}</td></tr>` : ''}
                ${notes ? `<tr><td style="color:#7a6a5a;">Notes</td><td style="font-weight:500;">${notes}</td></tr>` : ''}
              </table>
            </div>
            <p style="font-size:0.9rem;color:#7a6a5a;">${isWaitlist ? 'Review in Airtable and confirm when a spot opens.' : 'Review and confirm in Airtable.'}</p>
            <div style="border-top:1px solid #e8e0d8;margin-top:2rem;padding-top:1rem;text-align:center;font-size:0.8rem;color:#7a6a5a;">© Paws on Longmeadow · Sharon, MA</div>
          </div>`,
      }),
    }).catch(e => console.error("Resend error:", e));
  }

  return jsonRes({
    success:     true,
    appointmentId: apptId,
    waitlisted:  isWaitlist,
    autoWaitlist,
  }, 201);
}

export { handlePostBooking };