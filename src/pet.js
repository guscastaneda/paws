import { errRes, jsonRes, atFetch } from "./helpers.js";
import { CLIENTS_TABLE, PETS_TABLE, PENDING_UPDATES_TABLE, FIELDS } from "./constants.js";

const VETS_TABLE = "tblUC3XRDQnNCwTri";

// ── POST /pet ─────────────────────────────────────────────────────────────────
// Registers a new pet as a draft (inactive) linked to the client.
// Vet info goes to Pending Updates for manual linking.
export async function handlePostPet(req, env) {
  let body;
  try { body = await req.json(); } catch { return errRes("Invalid JSON"); }

  const {
    token, clientId,
    petName, species, breed, dob, gender, spayedNeutered,
    notes, vetClinic, vetPhone, vetAddress,
  } = body;

  if (!token || !clientId || !petName) {
    return errRes("Missing required fields");
  }

  // Create pet record — inactive until you review and activate
  const petFields = {
    "Pet Name":        petName,
    "Active":          false,
    "Clients":         [clientId],
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

  // Submit vet info + breed + species as a Pending Update for your review
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
// Submits a vet update for a specific pet to Pending Updates.
export async function handlePostVet(req, env) {
  let body;
  try { body = await req.json(); } catch { return errRes("Invalid JSON"); }

  const { token, clientId, petId, petName, vetType, vetClinic, vetPhone, vetAddress, vetEmail, vetUrl } = body;

  if (!token || !clientId || !petId || !vetClinic) {
    return errRes("Missing required fields");
  }

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
// Submits pet profile updates to Pending Updates for review
export async function handlePostPetUpdate(req, env) {
  let body;
  try { body = await req.json(); } catch { return errRes("Invalid JSON"); }

  const { token, clientId, petId, petName, fields } = body;
  if (!token || !clientId || !petId || !fields) return errRes("Missing required fields");

  const now = new Date().toISOString();
  const updates = [];

  // Create one Pending Update per changed field
  const fieldMap = {
    'Breed':               'Breed',
    'Date of Birth':       'Date of Birth',
    'Gender':              'Gender',
    'Spayed/Neutered':     'Spayed/Neutered',
    'Microchip Number':    'Microchip Number',
    'Allergies':           'Allergies',
    'Current Medications': 'Current Medications',
    'Feeding Schedule':    'Feeding Schedule',
    'Fears & Triggers':    'Fears & Triggers',
    'Temperament':         'Temperament',
  };

  // Regular pet fields
  for (const [fieldName, airtableField] of Object.entries(fieldMap)) {
    const val = fields[fieldName];
    if (val && val.trim()) {
      updates.push({
        fields: {
          [FIELDS.PU_CLIENT]:    [clientId],
          [FIELDS.PU_SUBMITTED]: now,
          [FIELDS.PU_STATUS]:    "Pending 🟡",
          [FIELDS.PU_FIELD]:     `${petName} — ${airtableField}`,
          [FIELDS.PU_CURRENT]:   "",
          [FIELDS.PU_NEW]:       val.trim(),
          [FIELDS.PU_NOTES]:     `Pet ID: ${petId}`,
        }
      });
    }
  }

  // Vet fields grouped into one update
  const vetParts = [
    fields['Vet Clinic']  ? `Clinic: ${fields['Vet Clinic']}`   : '',
    fields['Vet Phone']   ? `Phone: ${fields['Vet Phone']}`     : '',
    fields['Vet Email']   ? `Email: ${fields['Vet Email']}`     : '',
    fields['Vet Address'] ? `Address: ${fields['Vet Address']}` : '',
  ].filter(Boolean);

  if (vetParts.length > 0) {
    updates.push({
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

  if (updates.length === 0) {
    return jsonRes({ success: true, updatesSubmitted: 0 });
  }

  // Batch in groups of 10
  for (let i = 0; i < updates.length; i += 10) {
    const batch = updates.slice(i, i + 10);
    const res = await atFetch(env, `/${PENDING_UPDATES_TABLE}`, {
      method: "POST",
      body: JSON.stringify({ records: batch }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return errRes("Failed to submit updates: " + JSON.stringify(err), 502);
    }
  }

  return jsonRes({ success: true, updatesSubmitted: updates.length });
}
