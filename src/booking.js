import { cors, errRes, jsonRes, atFetch } from "./helpers.js";
import { BASE_ID, CLIENTS_TABLE, PETS_TABLE, COMPLIANCE_TABLE, PENDING_UPDATES_TABLE, APPOINTMENTS_TABLE, BOARDING_SERVICE_ID, FIELDS, AT } from "./constants.js";

const DAYCARE_SERVICE_ID = 'rec99cemJqkCezIRN';

// ── POST /booking ─────────────────────────────────────────────────────────────
async function handlePostBooking(req, env) {
  let body;
  try { body = await req.json(); } catch { return errRes("Invalid JSON"); }

  const { token, clientId, petIds, serviceType, startDate, startTime, endDate, endTime, transport, notes } = body;

  const isDaycare = serviceType === "daycare";

  if (!token || !clientId || !petIds?.length || !startDate || !startTime || !transport) {
    return errRes("Missing required fields");
  }

  if (!isDaycare && (!endDate || !endTime)) {
    return errRes("Missing required fields for boarding");
  }

  const fields = {
    [FIELDS.APPT_SERVICE]:    [isDaycare ? DAYCARE_SERVICE_ID : BOARDING_SERVICE_ID],
    [FIELDS.APPT_CATEGORY]:   isDaycare ? "DC" : "B",
    [FIELDS.APPT_PETS]:       petIds,
    [FIELDS.APPT_CLIENT]:     [clientId],
    [FIELDS.APPT_START_DATE]: startDate,
    [FIELDS.APPT_START_TIME]: startTime,
    [FIELDS.APPT_TRANSPORT]:  transport,
    [FIELDS.APPT_STATUS]:     "Requested",
  };

  if (!isDaycare) {
    fields[FIELDS.APPT_END_DATE] = endDate;
    fields[FIELDS.APPT_END_TIME] = endTime;
  } else {
    fields[FIELDS.APPT_END_DATE] = startDate;
    if (endTime) fields[FIELDS.APPT_END_TIME] = endTime;
  }

  if (notes) fields[FIELDS.APPT_NOTES] = notes;

  const res = await atFetch(env, "/" + APPOINTMENTS_TABLE, {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = JSON.stringify(err);
    console.error("Booking error:", msg);
    return errRes("Failed to create booking: " + msg, 502);
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
    const serviceLabel = isDaycare ? "☀️ Daycare" : "🏡 Boarding";
    const dateLabel    = isDaycare
      ? startDate
      : `${startDate} → ${endDate || "TBD"}`;
    const timeLabel    = isDaycare
      ? startTime
      : `Drop-off: ${startTime}${endTime ? " · Pick-up: " + endTime : ""}`;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:    "Paws on Longmeadow Bookings <bookings@pawsonlongmeadow.com>",
        to:      ["hello@pawsonlongmeadow.com"],
        subject: `New ${isDaycare ? "Daycare" : "Boarding"} Request — ${clientName}`,
        html: `
          <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:2rem;color:#2c1f14;">
            <div style="text-align:center;margin-bottom:2rem;">
              <div style="font-size:2rem;">${isDaycare ? "☀️" : "🏡"}</div>
              <div style="font-family:Georgia,serif;font-size:1.4rem;font-weight:600;color:#2D5A27;letter-spacing:0.1em;text-transform:uppercase;">New Booking Request</div>
              <div style="font-size:0.85rem;color:#7a6a5a;margin-top:0.25rem;">Paws on Longmeadow</div>
            </div>
            <div style="background:#f5f0eb;border-radius:12px;padding:1.5rem;margin:1.5rem 0;">
              <div style="font-size:0.85rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#7a6a5a;margin-bottom:1rem;">Request Details</div>
              <table style="width:100%;font-size:0.9rem;line-height:1.8;">
                <tr><td style="color:#7a6a5a;width:120px;">Client</td><td style="font-weight:500;">${clientName}</td></tr>
                <tr><td style="color:#7a6a5a;">Pet(s)</td><td style="font-weight:500;">${petNames}</td></tr>
                <tr><td style="color:#7a6a5a;">Service</td><td style="font-weight:500;">${serviceLabel}</td></tr>
                <tr><td style="color:#7a6a5a;">Date(s)</td><td style="font-weight:500;">${dateLabel}</td></tr>
                <tr><td style="color:#7a6a5a;">Time(s)</td><td style="font-weight:500;">${timeLabel}</td></tr>
                <tr><td style="color:#7a6a5a;">Transport</td><td style="font-weight:500;">${transport}</td></tr>
                ${notes ? `<tr><td style="color:#7a6a5a;">Notes</td><td style="font-weight:500;">${notes}</td></tr>` : ""}
              </table>
            </div>
            <p style="font-size:0.9rem;line-height:1.6;color:#7a6a5a;">Review and confirm this request in Airtable.</p>
            <div style="border-top:1px solid #e8e0d8;margin-top:2rem;padding-top:1rem;text-align:center;font-size:0.8rem;color:#7a6a5a;">
              © Paws on Longmeadow · Sharon, MA
            </div>
          </div>
        `,
      }),
    });

    if (!emailRes.ok) {
      console.error("Resend notification error:", await emailRes.text());
    }
  }

  return jsonRes({ success: true, appointmentId: apptId }, 201);
}

export { handlePostBooking };