import { cors, errRes, jsonRes, atFetch } from "./helpers.js";
import { BASE_ID, CLIENTS_TABLE, PETS_TABLE, COMPLIANCE_TABLE, PENDING_UPDATES_TABLE, APPOINTMENTS_TABLE, BOARDING_SERVICE_ID, FIELDS, AT } from "./constants.js";

// ── POST /profile ─────────────────────────────────────────────────────────────
async function handlePostProfile(req, env) {
  let body;
  try { body = await req.json(); } catch { return errRes("Invalid JSON"); }

  const { token, clientId, updates = [], markEmailConfirmed, directFields } = body;
  if (!token || !clientId) return errRes("Missing token or clientId");

  const now = new Date().toISOString();

  // Write direct fields straight to the client record (emergency contact, etc.)
  if (directFields && Object.keys(directFields).length > 0) {
    const directRes = await atFetch(env, `/${CLIENTS_TABLE}/${clientId}`, {
      method: "PATCH",
      body: JSON.stringify({ fields: directFields }),
    });
    if (!directRes.ok) {
      const err = await directRes.json().catch(() => ({}));
      console.error("Direct field update error:", JSON.stringify(err));
      return errRes("Failed to save: " + JSON.stringify(err), 502);
    }
  }

  // Create a Pending Update record for each contact info change (requires review)
  const records = updates
    .filter(u => u.proposed && u.proposed !== u.current)
    .map(u => ({
      fields: {
        [FIELDS.PU_CLIENT]:    [clientId],
        [FIELDS.PU_SUBMITTED]: now,
        [FIELDS.PU_STATUS]:    "Pending 🟡",
        [FIELDS.PU_FIELD]:     u.field,
        [FIELDS.PU_CURRENT]:   u.current || "",
        [FIELDS.PU_NEW]:       u.proposed,
      }
    }));

  if (records.length > 0) {
    for (let i = 0; i < records.length; i += 10) {
      const batch = records.slice(i, i + 10);
      const res = await atFetch(env, `/${PENDING_UPDATES_TABLE}`, {
        method: "POST",
        body: JSON.stringify({ records: batch }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = JSON.stringify(err);
        console.error("Pending update error:", msg);
        return errRes("Failed to save updates: " + msg, 502);
      }
    }
  }

  // Mark email confirmed directly on client record
  if (markEmailConfirmed) {
    const confirmRes = await atFetch(env, `/${CLIENTS_TABLE}/${clientId}`, {
      method: "PATCH",
      body: JSON.stringify({
        fields: { [FIELDS.CLIENT_EMAIL_CONFIRMED]: true }
      }),
    });
    if (!confirmRes.ok) {
      const err = await confirmRes.json().catch(() => ({}));
      console.error("Email confirm error:", JSON.stringify(err));
    }
  }

  return jsonRes({ success: true, updatesSubmitted: records.length });
}

export { handlePostProfile };
