import { errRes, jsonRes, atFetch } from "./helpers.js";
import { APPOINTMENTS_TABLE, CLIENTS_TABLE, PETS_TABLE } from "./constants.js";

// ── POST /cancellation ────────────────────────────────────────────────────────
// Client requests cancellation of an appointment.
// Updates appointment status to "Cancellation Requested" and sends email.
export async function handlePostCancellation(req, env) {
  let body;
  try { body = await req.json(); } catch { return errRes("Invalid JSON"); }

  const { token, clientId, appointmentId, serviceType, startDate, reason } = body;
  if (!token || !clientId || !appointmentId) return errRes("Missing required fields");

  // Verify the appointment belongs to this client
  const apptRes = await atFetch(env, `/${APPOINTMENTS_TABLE}/${appointmentId}`);
  if (!apptRes.ok) return errRes("Appointment not found", 404);

  const appt   = await apptRes.json();
  const af     = appt.fields || {};
  const status = typeof af["Status"] === "object" ? af["Status"].name : af["Status"] || "";

  // Don't allow cancellation of already-cancelled or completed appointments
  if (status === "Cancelled" || status === "Cancellation Requested") {
    return errRes("Appointment is already cancelled or cancellation is pending", 400);
  }

  // Update appointment status
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

  // Fetch client name for email
  let clientName = clientId;
  try {
    const clientRes = await atFetch(env, `/${CLIENTS_TABLE}/${clientId}`);
    if (clientRes.ok) {
      const clientData = await clientRes.json();
      clientName = clientData.fields["Client Name"] || clientId;
    }
  } catch {}

  // Send notification email
  if (env.RESEND_API_KEY) {
    const fmt = d => {
      if (!d) return "Unknown";
      return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    };

    const serviceLabel = serviceType === "DC" ? "☀️ Daycare" : "🏡 Boarding";
    const dateLabel    = af["Start Date"] ? fmt(af["Start Date"]) + (af["End Date"] && af["End Date"] !== af["Start Date"] ? " → " + fmt(af["End Date"]) : "") : "Unknown dates";

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:    "Paws on Longmeadow Bookings <bookings@pawsonlongmeadow.com>",
        to:      ["hello@pawsonlongmeadow.com"],
        subject: `Cancellation Request — ${clientName}`,
        html: `
          <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:2rem;color:#2c1f14;">
            <div style="text-align:center;margin-bottom:2rem;">
              <div style="font-size:2rem;">🚫</div>
              <div style="font-size:1.4rem;font-weight:600;color:#c0392b;letter-spacing:0.1em;text-transform:uppercase;">Cancellation Request</div>
              <div style="font-size:0.85rem;color:#7a6a5a;margin-top:0.25rem;">Paws on Longmeadow</div>
            </div>
            <div style="background:#f5f0eb;border-radius:12px;padding:1.5rem;margin:1.5rem 0;">
              <div style="font-size:0.85rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#7a6a5a;margin-bottom:1rem;">Request Details</div>
              <table style="width:100%;font-size:0.9rem;line-height:1.8;">
                <tr><td style="color:#7a6a5a;width:120px;">Client</td><td style="font-weight:500;">${clientName}</td></tr>
                <tr><td style="color:#7a6a5a;">Service</td><td style="font-weight:500;">${serviceLabel}</td></tr>
                <tr><td style="color:#7a6a5a;">Dates</td><td style="font-weight:500;">${dateLabel}</td></tr>
                ${reason ? `<tr><td style="color:#7a6a5a;">Reason</td><td style="font-weight:500;">${reason}</td></tr>` : ""}
              </table>
            </div>
            <p style="font-size:0.9rem;color:#7a6a5a;">The appointment status has been updated to "Cancellation Requested" in Airtable. Please review and confirm the cancellation.</p>
            <div style="border-top:1px solid #e8e0d8;margin-top:2rem;padding-top:1rem;text-align:center;font-size:0.8rem;color:#7a6a5a;">
              © Paws on Longmeadow · Sharon, MA
            </div>
          </div>
        `,
      }),
    });
  }

  return jsonRes({ success: true });
}
