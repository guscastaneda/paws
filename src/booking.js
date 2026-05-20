import { cors, errRes, jsonRes, atFetch } from "./helpers.js";
import { BASE_ID, CLIENTS_TABLE, PETS_TABLE, COMPLIANCE_TABLE, PENDING_UPDATES_TABLE, APPOINTMENTS_TABLE, BOARDING_SERVICE_ID, FIELDS, AT } from "./constants.js";

// ── POST /booking ─────────────────────────────────────────────────────────────
async function handlePostBooking(req, env) {
  let body;
  try { body = await req.json(); } catch { return errRes("Invalid JSON"); }

  const { token, clientId, petIds, startDate, startTime, endDate, endTime, transport, notes } = body;
  if (!token || !clientId || !petIds?.length || !startDate || !startTime || !endDate || !endTime || !transport) {
    return errRes("Missing required fields");
  }

  const fields = {
    [FIELDS.APPT_SERVICE]:    [BOARDING_SERVICE_ID],
    [FIELDS.APPT_CATEGORY]:   "B",
    [FIELDS.APPT_PETS]:       petIds,
    [FIELDS.APPT_CLIENT]:     [clientId],
    [FIELDS.APPT_START_DATE]: startDate,
    [FIELDS.APPT_START_TIME]: startTime,
    [FIELDS.APPT_END_DATE]:   endDate,
    [FIELDS.APPT_END_TIME]:   endTime,
    [FIELDS.APPT_TRANSPORT]:  transport,
    [FIELDS.APPT_STATUS]:     "Requested",
  };

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
  return jsonRes({ success: true, appointmentId: created.records[0].id }, 201);
}

export { handlePostBooking };
