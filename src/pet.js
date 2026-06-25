import { errRes, jsonRes, atFetch } from "./helpers.js";
import { CLIENTS_TABLE, PETS_TABLE, PENDING_UPDATES_TABLE, FIELDS } from "./constants.js";

const VETS_TABLE      = "tblUC3XRDQnNCwTri";
const BREEDS_TABLE    = "tblLsiIKKeimLnBxF";

// ── POST /pet ─────────────────────────────────────────────────────────────────
export async function handlePostPet(req, env) {
  let body;
  try { body = await req.json(); } catch { return errRes("Invalid JSON"); }

  const {
    token, clientId,
    petName, species, breed, dob, gender, spayedNeutered,
    notes, vetClinic, vetPhone, vetAddress,
  } = body;

  if (!token || !clientId || !petName) return errRes("Missing required fields");

  const petFields = {
    "Pet Name": petName,
    "Active":   false,
    "Clients":  [clientId],
  };
  if (gender)         petFields["Gender"]          = gender;
  if (dob)            petFields["Date of Birth"]   = dob;
  if (spayedNeutered) petFields["Spayed/Neutered"] = true;
  if (notes)          petFields["Pet Notes"]       = `[SUBMITTED VIA PORTAL]\n${notes}`;

  const petRes = await atFetch(env, `/${PETS_TABLE}`, {
    method: "POST",
    body: JSON.stringify({ records: [{ fields: petFields }], typecast: true }),
  });

  if (!petRes.ok) {
    const err = await petRes.json().catch(() => ({}));
    return errRes("Failed to create pet: " + JSON.stringify(err), 502);
  }

  const petData  = await petRes.json();
  const petId    = petData.records[0].id;
  const petLabel = petName + (breed ? ` (${breed})` : "");

  const now = new Date().toISOString();
  const updates = [];

  if (breed || species) {
    updates.push({
      fields: {
        [FIELDS.PU_CLIENT]:    [clientId],
        [FIELDS.PU_SUBMITTED]: now,
        [FIELDS.PU_STATUS]:    "Pending 🟡",
        [FIELDS.PU_FIELD]:     "New Pet — Breed/Species",
        [FIELDS.PU_CURRENT]:   "",
        [FIELDS.PU_NEW]:       [species, breed].filter(Boolean).join(" / "),
        [FIELDS.PU_NOTES]:     `Pet record ID: ${petId} (${petLabel})`,
      }
    });
  }

  if (vetClinic || vetPhone || vetAddress) {
    updates.push({
      fields: {
        [FIELDS.PU_CLIENT]:    [clientId],
        [FIELDS.PU_SUBMITTED]: now,
        [FIELDS.PU_STATUS]:    "Pending 🟡",
        [FIELDS.PU_FIELD]:     "New Pet — Vet Information",
        [FIELDS.PU_CURRENT]:   "",
        [FIELDS.PU_NEW]:       [vetClinic, vetPhone, vetAddress].filter(Boolean).join(" | "),
        [FIELDS.PU_NOTES]:     `Pet record ID: ${petId} (${petLabel}) — please link vet in Airtable`,
      }
    });
  }

  if (updates.length > 0) {
    await atFetch(env, `/${PENDING_UPDATES_TABLE}`, {
      method: "POST",
      body: JSON.stringify({ records: updates }),
    });
  }

  return jsonRes({ success: true, petId }, 201);
}

// ── POST /vet ─────────────────────────────────────────────────────────────────
export async function handlePostVet(req, env) {
  let body;
  try { body = await req.json(); } catch { return errRes("Invalid JSON"); }

  const { token, clientId, petId, petName, vetType, vetClinic, vetPhone, vetAddress, vetEmail, vetUrl } = body;
  if (!token || !clientId || !petId || !vetClinic) return errRes("Missing required fields");

  const now     = new Date().toISOString();
  const vetInfo = [vetClinic, vetPhone, vetAddress, vetEmail, vetUrl].filter(Boolean).join(" | ");
  const label   = vetType === "specialist" ? "Specialist Vet" : "Primary Vet";

  const res = await atFetch(env, `/${PENDING_UPDATES_TABLE}`, {
    method: "POST",
    body: JSON.stringify({
      records: [{
        fields: {
          [FIELDS.PU_CLIENT]:    [clientId],
          [FIELDS.PU_SUBMITTED]: now,
          [FIELDS.PU_STATUS]:    "Pending 🟡",
          [FIELDS.PU_FIELD]:     `${label} — ${petName || petId}`,
          [FIELDS.PU_CURRENT]:   "",
          [FIELDS.PU_NEW]:       vetInfo,
          [FIELDS.PU_NOTES]:     `Pet ID: ${petId} — please link or update vet record in Airtable`,
        }
      }]
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return errRes("Failed to submit vet update: " + JSON.stringify(err), 502);
  }

  return jsonRes({ success: true });
}

// ── POST /pet-update ──────────────────────────────────────────────────────────
export async function handlePostPetUpdate(req, env) {
  let body;
  try { body = await req.json(); } catch { return errRes("Invalid JSON"); }

  const { token, clientId, petId, petName, fields } = body;
  if (!token || !clientId || !petId || !fields) return errRes("Missing required fields");

  const directFields = {};

  if (fields["Date of Birth"])       directFields["Date of Birth"]       = fields["Date of Birth"];
  if (fields["Gender"])              directFields["Gender"]              = fields["Gender"];
  if (fields["Microchip Number"])    directFields["Microchip Number"]    = fields["Microchip Number"];
  if (fields["Allergies"])           directFields["Allergies"]           = fields["Allergies"];
  if (fields["Current Medications"]) directFields["Current Medications"] = fields["Current Medications"];
  if (fields["Feeding Schedule"])    directFields["Feeding Schedule"]    = fields["Feeding Schedule"];
  if (fields["Fears & Triggers"])    directFields["Fears & Triggers"]    = fields["Fears & Triggers"];
  if (fields["Temperament"])         directFields["Temperament"]         = fields["Temperament"];

  // Insurance: self-reported, low-stakes pet attributes — write directly like the
  // other profile fields above (no review queue needed; provider is a constrained
  // single-select, the rest are plain text/date).
  if (fields["Insurance Provider"])      directFields["Insurance Provider"]      = fields["Insurance Provider"];
  if (fields["Insurance Policy Number"]) directFields["Insurance Policy Number"] = fields["Insurance Policy Number"];
  if (fields["Insurance Coverage"])      directFields["Insurance Coverage"]      = fields["Insurance Coverage"];
  if (fields["Insurance Renewal Date"])  directFields["Insurance Renewal Date"]  = fields["Insurance Renewal Date"];

  if (fields["Spayed/Neutered"] === "Yes") directFields["Spayed/Neutered"] = true;
  else if (fields["Spayed/Neutered"] === "No") directFields["Spayed/Neutered"] = false;

  if (Object.keys(directFields).length > 0) {
    const patchRes = await atFetch(env, `/${PETS_TABLE}/${petId}`, {
      method: "PATCH",
      body: JSON.stringify({ fields: directFields, typecast: true }),
    });
    if (!patchRes.ok) {
      const err = await patchRes.json().catch(() => ({}));
      return errRes("Failed to update pet: " + JSON.stringify(err), 502);
    }
  }

  const now = new Date().toISOString();
  const pendingUpdates = [];

  const vetParts = [
    fields["Vet Clinic"]  ? `Clinic: ${fields["Vet Clinic"]}`   : "",
    fields["Vet Phone"]   ? `Phone: ${fields["Vet Phone"]}`     : "",
    fields["Vet Email"]   ? `Email: ${fields["Vet Email"]}`     : "",
    fields["Vet Address"] ? `Address: ${fields["Vet Address"]}` : "",
  ].filter(Boolean);

  if (vetParts.length > 0) {
    pendingUpdates.push({
      fields: {
        [FIELDS.PU_CLIENT]:    [clientId],
        [FIELDS.PU_SUBMITTED]: now,
        [FIELDS.PU_STATUS]:    "Pending 🟡",
        [FIELDS.PU_FIELD]:     `${petName} — Primary Vet`,
        [FIELDS.PU_CURRENT]:   "",
        [FIELDS.PU_NEW]:       vetParts.join(" | "),
        [FIELDS.PU_NOTES]:     `Pet ID: ${petId} — please update vet record in Airtable`,
      }
    });
  }

  if (pendingUpdates.length > 0) {
    const puRes = await atFetch(env, `/${PENDING_UPDATES_TABLE}`, {
      method: "POST",
      body: JSON.stringify({ records: pendingUpdates }),
    });
    if (!puRes.ok) {
      const err = await puRes.json().catch(() => ({}));
      return errRes("Failed to create pending updates: " + JSON.stringify(err), 502);
    }
  }

  return jsonRes({
    success: true,
    directUpdates: Object.keys(directFields).length,
    pendingUpdates: pendingUpdates.length,
  });
}

// ── POST /pet-breed ───────────────────────────────────────────────────────────
// Writes breed linked record IDs directly to the Pets table.
// Accepts breedIds: string[] of Airtable record IDs from the Breeds table.
// Empty array clears all breeds.
export async function handlePostPetBreed(req, env) {
  let body;
  try { body = await req.json(); } catch { return errRes("Invalid JSON"); }

  const { token, clientId, petId, breedIds } = body;
  if (!token || !clientId || !petId) return errRes("Missing required fields");
  if (!Array.isArray(breedIds))      return errRes("breedIds must be an array");
  if (breedIds.length > 3)           return errRes("Maximum 3 breeds allowed");

  const patchRes = await atFetch(env, `/${PETS_TABLE}/${petId}`, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        "Breeds": breedIds,  // plain string array — Airtable accepts this for linked fields
      }
    }),
  });

  if (!patchRes.ok) {
    const err = await patchRes.json().catch(() => ({}));
    return errRes("Failed to update breeds: " + JSON.stringify(err), 502);
  }

  return jsonRes({ success: true, breedIds });
}