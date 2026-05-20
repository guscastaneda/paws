import { cors, errRes, jsonRes, atFetch } from "./helpers.js";
import { BASE_ID, CLIENTS_TABLE, PETS_TABLE, COMPLIANCE_TABLE, PENDING_UPDATES_TABLE, APPOINTMENTS_TABLE, BOARDING_SERVICE_ID, FIELDS, AT } from "./constants.js";

// ── POST /agreement ───────────────────────────────────────────────────────────
async function handlePostAgreement(req, env) {
  let body;
  try { body = await req.json(); } catch { return errRes("Invalid JSON"); }

  const { token, clientId } = body;
  if (!token || !clientId) return errRes("Missing token or clientId");

  const today = new Date().toISOString().split("T")[0];

  const res = await atFetch(env, `/${CLIENTS_TABLE}/${clientId}`, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        [FIELDS.CLIENT_AGREEMENT_SIGNED]: true,
        [FIELDS.CLIENT_AGREEMENT_DATE]:   today,
      }
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    console.error("Agreement error:", JSON.stringify(err));
    return errRes("Failed to save agreement", 502);
  }

  return jsonRes({ success: true });
}

export { handlePostAgreement };
