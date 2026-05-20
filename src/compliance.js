import { cors, errRes, jsonRes, atFetch } from "./helpers.js";
import { BASE_ID, CLIENTS_TABLE, PETS_TABLE, COMPLIANCE_TABLE, PENDING_UPDATES_TABLE, APPOINTMENTS_TABLE, BOARDING_SERVICE_ID, FIELDS, AT } from "./constants.js";

// ── POST /compliance ──────────────────────────────────────────────────────────
async function handlePostCompliance(req, env) {
  let body;
  try { body = await req.json(); } catch { return errRes("Invalid JSON"); }

  const { token, clientId, petId, documentType, expirationDate,
          fileName, fileBase64, fileType } = body;

  if (!token || !clientId || !petId || !documentType || !fileName || !fileBase64) {
    return errRes("Missing required fields");
  }

  const today = new Date().toISOString().split("T")[0];
  const fields = {
    [FIELDS.DOC_TYPE]:   documentType,
    [FIELDS.DOC_DATE]:   today,
    [FIELDS.DOC_PET]:    [petId],
    [FIELDS.DOC_STATUS]: "Received",
  };
  if (expirationDate) fields[FIELDS.DOC_EXPIRY] = expirationDate;

  const createRes = await atFetch(env, `/${COMPLIANCE_TABLE}`, {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });

  if (!createRes.ok) {
    const err = await createRes.json();
    console.error("Compliance create error:", JSON.stringify(err));
    return errRes("Failed to create record", 502);
  }

  const created  = await createRes.json();
  const recordId = created.records[0].id;

  // Upload file via Airtable content endpoint
  const uploadRes = await fetch(
    `https://content.airtable.com/v0/${BASE_ID}/${recordId}/${FIELDS.DOC_FILE}/uploadAttachment`,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.AIRTABLE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ contentType: fileType, filename: fileName, file: fileBase64 }),
    }
  );

  if (!uploadRes.ok) {
    console.error("File upload failed for record:", recordId);
    return jsonRes({ success: true, recordId, warning: "Record created but file upload failed." }, 201);
  }

  return jsonRes({ success: true, recordId }, 201);
}

export { handlePostCompliance };
