/**
 * Paws on Longmeadow — Client Portal Worker
 * Serves the portal at client.pawsonlongmeadow.com
 *
 * Environment variables (set as secrets in Cloudflare dashboard):
 *   AIRTABLE_API_KEY  — Airtable Personal Access Token
 */

// ── AIRTABLE CONFIG ──────────────────────────────────────────────────────────
const BASE_ID              = "appvQb876VInNJlnB";
const CLIENTS_TABLE        = "tblqksLnPLdE0nF8Q";
const PETS_TABLE           = "tbl6FYNs5D3LLxCdd";
const COMPLIANCE_TABLE     = "tblRuPAAVBeMjeWSa";
const PENDING_UPDATES_TABLE = "tblte5MYEXmlJ4FvF";

const FIELDS = {
  // Clients
  CLIENT_NAME:               "fld65O8M2r0KPgF9l",
  CLIENT_TOKEN:              "fld1wfRpBUKakmrXC",
  CLIENT_PETS:               "fldnqv9rshSaXcyg4",
  CLIENT_PHONE:              "fldrMb2on5Ah4XPGy",
  CLIENT_EMAIL:              "fldEiyeDye0XPbQhG",
  CLIENT_ADDRESS:            "fldtKuNB5rKnwfkBc",
  CLIENT_ADD_NAME:           "fldCMY9D0FMxsjXO1",
  CLIENT_ADD_PHONE:          "fldLaZn8rvz3980eW",
  CLIENT_ADD_EMAIL:          "fldObDDO77JkhdE4r",
  CLIENT_EMERGENCY_NAME:     "fldPtLY3f9x4A8Gvg",
  CLIENT_EMERGENCY_PHONE:    "fldT0hsGKW9uNcMO5",
  CLIENT_EMERGENCY_REL:      "fldNY55KtTdeF0QE7",
  CLIENT_AGREEMENT_SIGNED:   "fldBbIbLhv61zvhBa",
  CLIENT_AGREEMENT_DATE:     "fldEPvulUW1PnF8ur",
  CLIENT_EMAIL_CONFIRMED:    "fldu4QVk4SU9q6KOh",

  // Pets
  PET_NAME:   "fldcFRXue6vqhD1y8",
  PET_ACTIVE: "fldozhvZNn8G5t8MZ",
  PET_DOCS:   "fld1ySZtYttHQiwVa",

  // Compliance Documents
  DOC_TYPE:    "fld4i0GIKK6isMnhc",
  DOC_DATE:    "fldGwyiZcVRWrPgyE",
  DOC_EXPIRY:  "fld0ujeUQxBxRT73D",
  DOC_FILE:    "fldcif0z5lNqiW6mo",
  DOC_PET:     "fldNbMDIZOYbSMgKd",
  DOC_STATUS:  "fldjgTSMKIedLFVJh",
  DOC_EXPIRED: "fldPK1uooOqMOm0Bw",

  // Appointments
  APPT_SERVICE:    "fldUwAFOmprtGiJO1",
  APPT_CATEGORY:   "fldqRv3nVQT5s9uWi",
  APPT_PETS:       "fldwQvJRjq1HpOsPq",
  APPT_CLIENT:     "fldCGBunq3pwM75sw",
  APPT_START_DATE: "flddYyqOcOMXXlRmQ",
  APPT_START_TIME: "fldzh9OPPktIdyK5j",
  APPT_END_DATE:   "fldxdh9mYKL7aOaTV",
  APPT_END_TIME:   "fldX6VYq3LeqtNzHj",
  APPT_TRANSPORT:  "fldfuZ43EQtPDwfhh",
  APPT_NOTES:      "fldLEZa7Wtkyp5Zzr",
  APPT_STATUS:     "fldW123UTCTu1xjCe",
  APPT_MSG:        "fldYCBKRnM20ogYtm",

  // Pending Updates
  PU_CLIENT:     "flds9YOzTvMc2RJTR",
  PU_SUBMITTED:  "fld73j2wvAS2EMx9D",
  PU_STATUS:     "fldrrXbH3ZbYXL4zD",
  PU_FIELD:      "fldqCPoWFx10EmDti",
  PU_CURRENT:    "fldu7tMvfL47261Vp",
  PU_NEW:        "fldzmXieCp1eM50Um",
  PU_NOTES:      "fldl4Gvd9SGCARBya",
};

const AT = "https://api.airtable.com/v0/" + BASE_ID;
const BOARDING_SERVICE_ID = "recToZsYSMELIVcMN";
const APPOINTMENTS_TABLE  = "tbl9BGXYbTXh2Gwv1";

// ── HELPERS ───────────────────────────────────────────────────────────────────
function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors() },
  });
}

function errRes(msg, status = 400) {
  return jsonRes({ error: msg }, status);
}

async function atFetch(env, path, opts = {}) {
  return fetch(AT + path, {
    ...opts,
    headers: {
      Authorization: "Bearer " + env.AIRTABLE_API_KEY,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
}

// ── GET /client ───────────────────────────────────────────────────────────────
async function handleGetClient(req, env) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return errRes("Missing token");

  // Fetch client by token
  const formula = encodeURIComponent(`{Client Token} = "${token}"`);
  const res = await atFetch(env, `/${CLIENTS_TABLE}?filterByFormula=${formula}`);
  if (!res.ok) return errRes("Airtable error", 502);

  const data = await res.json();
  if (!data.records?.length) return errRes("Client not found", 404);

  const c  = data.records[0];
  const f  = c.fields;
  const clientName = f["Client Name"] || "";
  const linkedPets = f["Pets"] || [];
  // Extract IDs whether linked records come back as strings or {id,name} objects
  const petIdList = linkedPets.map(p => typeof p === "object" ? p.id : p).filter(Boolean);

  // Fetch pets with their compliance docs
  let pets = [];
  if (petIdList.length > 0) {
    const petFilter = encodeURIComponent(
      `OR(${petIdList.map(id => `RECORD_ID()="${id}"`).join(",")})`
    );
    const petsRes = await atFetch(env, `/${PETS_TABLE}?filterByFormula=${petFilter}`);
    if (petsRes.ok) {
      const petsData = await petsRes.json();

      for (const p of petsData.records || []) {
        if (p.fields["Active"] !== true) continue;
        const petDocs = [];

        // Fetch compliance docs for this pet
        const docRefs = p.fields["Compliance Documents"] || [];
        // Airtable returns linked records as [{id, name}] objects or plain strings
        const docIds = docRefs.map(r => (typeof r === "object" ? r.id : r)).filter(Boolean);
        if (docIds.length > 0) {
          const docFilter = encodeURIComponent(
            `OR(${docIds.map(id => `RECORD_ID()="${id}"`).join(",")})`
          );
          const docsRes = await atFetch(env, `/${COMPLIANCE_TABLE}?filterByFormula=${docFilter}`);
          if (docsRes.ok) {
            const docsData = await docsRes.json();
            for (const d of docsData.records || []) {
              const docTypeField = d.fields[FIELDS.DOC_TYPE]   || d.fields["Document Type"];
              const expiredField = d.fields[FIELDS.DOC_EXPIRED] || d.fields["Is Expired?"];
              const expiryDate   = d.fields[FIELDS.DOC_EXPIRY]  || d.fields["Expiration Date"] || "";
              const uploadDate   = d.fields[FIELDS.DOC_DATE]    || d.fields["Upload Date"]      || "";
              const docType = (docTypeField && typeof docTypeField === "object") ? docTypeField.name : (docTypeField || "");
              const expired = expiredField === "Yes" || expiredField === true;
              if (docType) {
                petDocs.push({ type: docType, expired, expiryDate, uploadDate });
              }
            }
          }
        }

        // Docs complete = has rabies + town license + vaccination record (not expired)
        const hasRabies = petDocs.some(d => d.type === "Rabies Certificate" && !d.expired);
        const hasTown   = petDocs.some(d => d.type === "Town License"       && !d.expired);
        const hasVax    = petDocs.some(d => d.type === "Vaccination Record" && !d.expired);

        pets.push({
          id:   p.id,
          name: p.fields["Pet Name"] || "",
          docs: petDocs,
          docsComplete: hasRabies && hasTown && hasVax,
        });
      }
    }
  }

  const allDocsComplete = pets.length > 0 && pets.every(p => p.docsComplete);

  // Fetch appointments from client linked field — direct ID lookup, no filter formula needed
  const linkedApptRefs = f["Appointments"] || f["fldihTexoIBjRsFdJ"] || [];
  const linkedApptIds  = linkedApptRefs.map(r => typeof r === "object" ? r.id : r).filter(Boolean);
  let appointments = [];

  if (linkedApptIds.length > 0) {
    const today = new Date().toISOString().split("T")[0];
    const batchSize = 10;
    const allApptRecords = [];

    for (let i = 0; i < linkedApptIds.length; i += batchSize) {
      const batch = linkedApptIds.slice(i, i + batchSize);
      const idFilter = encodeURIComponent(
        `OR(${batch.map(id => `RECORD_ID()="${id}"`).join(",")})`
      );
      const batchRes = await atFetch(env,
        "/" + APPOINTMENTS_TABLE + "?filterByFormula=" + idFilter
      );
      if (batchRes.ok) {
        const batchData = await batchRes.json();
        allApptRecords.push(...(batchData.records || []));
      }
    }

    appointments = allApptRecords
      .map(a => {
        // Fields come back by name, not by ID
        const af = a.fields || a.cellValuesByFieldId || {};
        const status = af["Status"] || af["fldW123UTCTu1xjCe"] || {};
        const cat    = af["Service Category"] || af["fldqRv3nVQT5s9uWi"] || {};
        return {
          id:            a.id,
          startDate:     af["Start Date"]  || af["flddYyqOcOMXXlRmQ"] || "",
          endDate:       af["End Date"]    || af["fldxdh9mYKL7aOaTV"]  || "",
          startTime:     (typeof (af["Start Time"] || af["fldzh9OPPktIdyK5j"]) === "object" ? (af["Start Time"] || af["fldzh9OPPktIdyK5j"]).name : (af["Start Time"] || af["fldzh9OPPktIdyK5j"])) || "",
          endTime:       (typeof (af["End Time"]   || af["fldX6VYq3LeqtNzHj"])  === "object" ? (af["End Time"]   || af["fldX6VYq3LeqtNzHj"]).name  : (af["End Time"]   || af["fldX6VYq3LeqtNzHj"]))  || "",
          status:        (typeof status === "object" ? status.name : status) || "",
          category:      (typeof cat    === "object" ? cat.name    : cat)    || "",
          clientMessage: af["Client Message"] || af["fldYCBKRnM20ogYtm"] || "",
        };
      })
      .filter(a => {
        const isBoarding = a.category === "B";
        const isActive   = a.status === "Requested" || a.status === "Confirmed";
        const isFuture   = !a.endDate || a.endDate >= today;
        return isBoarding && isActive && isFuture;
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  return jsonRes({
    clientId:             c.id,
    firstName:            clientName.split(" ")[0],
    name:                 clientName,
    phone:                f["Phone Number"]                  || "",
    email:                f["Email Address"]                 || "",
    address:              f["Address"]                       || "",
    addName:              f["Additional Owner Name"]         || "",
    addPhone:             f["Additional Owner Phone Number"] || "",
    addEmail:             f["Additional Owner Email"]        || "",
    emergencyName:        f["Emergency Contact Name"]        || "",
    emergencyPhone:       f["Emergency Contact Phone"]       || "",
    emergencyRelationship: f["Emergency Contact Relationship"] || "",
    emailConfirmed:       f["Email Confirmed"]               === true,
    agreementSigned:      f["Agreement Signed"]              === true,
    docsComplete:         allDocsComplete,
    pets,
    appointments,
  });
}

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

// ── HTML ──────────────────────────────────────────────────────────────────────
const HTML = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Paws on Longmeadow</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&display=swap" rel="stylesheet"/>
  <style>
    /* ── BRAND TOKENS — swap these when brand is ready ── */
    :root {
      --brand-primary: #4A6741;
      --brand-primary-light: #6B9162;
      --brand-primary-dark: #2E4A28;
      --brand-sage: #C8D8B8;
      --brand-sage-light: #EBF2E4;
      --brand-cream: #FAF7F2;
      --brand-bark: #2C1F14;
      --brand-stone: #8C7B6B;
      --brand-stone-light: #E8E0D8;
      --brand-gold: #C4922A;
      --brand-gold-light: #F5E6C8;
      --brand-error: #C0392B;
      --brand-error-light: #FDECEA;
      --brand-success: #2E7D32;
      --brand-success-light: #E8F5E9;
      --brand-warning: #B45309;
      --brand-warning-light: #FEF3C7;

      /* Typography */
      --font-display: 'Cormorant Garamond', Georgia, serif;
      --font-body: 'DM Sans', sans-serif;

      /* Spacing */
      --card-radius: 20px;
      --card-shadow: 0 1px 3px rgba(44,31,20,0.06), 0 8px 32px rgba(44,31,20,0.08), 0 0 0 1px rgba(44,31,20,0.04);
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }

    body {
      font-family: var(--font-body);
      background: var(--brand-cream);
      color: var(--brand-bark);
      min-height: 100vh;
      padding: 0 1rem 5rem;
    }

    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background:
        radial-gradient(ellipse at 15% 10%, rgba(74,103,65,0.08) 0%, transparent 55%),
        radial-gradient(ellipse at 85% 85%, rgba(196,146,42,0.06) 0%, transparent 50%);
      pointer-events: none;
      z-index: 0;
    }

    /* ── HEADER ── */
    .site-header {
      max-width: 600px;
      margin: 0 auto;
      padding: 2.5rem 0 1.5rem;
      text-align: center;
      position: relative;
      z-index: 1;
    }

    .logo-mark {
      font-size: 2.25rem;
      display: block;
      margin-bottom: 0.5rem;
      animation: float 4s ease-in-out infinite;
    }

    @keyframes float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-7px); }
    }

    .site-name {
      font-family: var(--font-display);
      font-size: 1.5rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--brand-primary);
    }

    .site-tagline {
      font-size: 0.78rem;
      font-weight: 300;
      color: var(--brand-stone);
      letter-spacing: 0.04em;
      margin-top: 0.2rem;
    }

    /* ── CARD ── */
    .card {
      background: #fff;
      border-radius: var(--card-radius);
      padding: 2rem 1.75rem;
      max-width: 600px;
      margin: 0 auto 1rem;
      box-shadow: var(--card-shadow);
      position: relative;
      z-index: 1;
      overflow: hidden;
      min-height: 100px;
      animation: rise 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
    }

    @keyframes rise {
      from { opacity: 0; transform: translateY(18px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* ── STATES ── */
    .view { display: none; }
    .view.active { display: block; }

    /* ── LOADING ── */
    .loading-wrap { text-align: center; padding: 2.5rem 0; }
    .spinner {
      width: 36px; height: 36px;
      border: 3px solid var(--brand-stone-light);
      border-top-color: var(--brand-primary);
      border-radius: 50%;
      animation: spin 0.75s linear infinite;
      margin: 0 auto 1rem;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .loading-wrap p { font-size: 0.875rem; color: var(--brand-stone); font-weight: 300; }

    /* ── INVALID ── */
    .invalid-wrap { text-align: center; padding: 2rem 0; }
    .invalid-icon { font-size: 3rem; margin-bottom: 1rem; }

    /* ── GREETING ── */
    .greeting-name {
      font-family: var(--font-display);
      font-size: 2rem;
      font-weight: 400;
      line-height: 1.2;
      color: var(--brand-bark);
      margin-bottom: 0.4rem;
    }
    .greeting-name em { font-style: italic; color: var(--brand-primary); }
    .greeting-sub {
      font-size: 0.875rem;
      font-weight: 300;
      color: var(--brand-stone);
      line-height: 1.6;
    }

    .divider {
      height: 1px;
      background: var(--brand-stone-light);
      margin: 1.5rem 0;
    }

    /* ── PROGRESS BAR ── */
    .progress-wrap { margin-bottom: 1.75rem; }
    .progress-label {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.6rem;
    }
    .progress-label span {
      font-size: 0.75rem;
      font-weight: 500;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--brand-stone);
    }
    .progress-label strong {
      font-size: 0.75rem;
      color: var(--brand-primary);
    }
    .progress-track {
      height: 6px;
      background: var(--brand-stone-light);
      border-radius: 999px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--brand-primary), var(--brand-primary-light));
      border-radius: 999px;
      transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);
    }

    /* ── CHECKLIST ── */
    .checklist { display: flex; flex-direction: column; gap: 0.75rem; }

    .check-item {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      padding: 1rem 1.1rem;
      border-radius: 12px;
      border: 1.5px solid var(--brand-stone-light);
      cursor: pointer;
      transition: all 0.2s;
      text-decoration: none;
      color: inherit;
      background: #fff;
    }

    .check-item:hover:not(.done) {
      border-color: var(--brand-primary);
      background: var(--brand-sage-light);
      transform: translateX(3px);
    }

    .check-item.done {
      border-color: var(--brand-sage);
      background: var(--brand-sage-light);
      cursor: default;
    }

    .check-item.active-step {
      border-color: var(--brand-primary);
      background: var(--brand-sage-light);
      box-shadow: 0 0 0 3px rgba(74,103,65,0.12);
    }

    .check-icon {
      width: 32px; height: 32px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 1rem;
      flex-shrink: 0;
    }

    .check-item.done .check-icon { background: var(--brand-primary); color: #fff; }
    .check-item:not(.done) .check-icon { background: var(--brand-stone-light); color: var(--brand-stone); }
    .check-item.active-step .check-icon { background: var(--brand-primary); color: #fff; }

    .check-text { flex: 1; }
    .check-title {
      font-size: 0.9rem;
      font-weight: 500;
      color: var(--brand-bark);
      margin-bottom: 0.15rem;
    }
    .check-desc {
      font-size: 0.78rem;
      font-weight: 300;
      color: var(--brand-stone);
    }

    .check-arrow {
      font-size: 0.85rem;
      color: var(--brand-stone);
      transition: transform 0.2s;
    }
    .check-item:hover:not(.done) .check-arrow { transform: translateX(3px); }

    /* ── COMPLETE BANNER ── */
    .complete-banner {
      background: var(--brand-success-light);
      border: 1px solid rgba(46,125,50,0.2);
      border-radius: 12px;
      padding: 1.25rem 1.25rem;
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .complete-banner-icon { font-size: 2rem; flex-shrink: 0; }
    .complete-banner-text h3 {
      font-family: var(--font-display);
      font-size: 1.2rem;
      font-weight: 600;
      color: var(--brand-success);
      margin-bottom: 0.2rem;
    }
    .complete-banner-text p {
      font-size: 0.82rem;
      font-weight: 300;
      color: var(--brand-bark);
    }

    /* ── QUICK ACTIONS (dashboard) ── */
    .quick-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
      margin-top: 1rem;
    }

    .action-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      padding: 1.25rem 0.75rem;
      border-radius: 14px;
      border: 1.5px solid var(--brand-stone-light);
      background: #fff;
      cursor: pointer;
      text-decoration: none;
      color: inherit;
      transition: all 0.2s;
      text-align: center;
    }

    .action-btn:hover {
      border-color: var(--brand-primary);
      background: var(--brand-sage-light);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(74,103,65,0.15);
    }

    .action-btn-icon { font-size: 1.5rem; }
    .action-btn-label {
      font-size: 0.8rem;
      font-weight: 500;
      color: var(--brand-bark);
    }

    /* ── PET CARDS ── */
    .pet-cards { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 0.5rem; }

    .pet-card {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.875rem 1rem;
      border-radius: 12px;
      border: 1.5px solid var(--brand-stone-light);
      background: #fff;
    }

    .pet-avatar {
      width: 44px; height: 44px;
      border-radius: 50%;
      background: var(--brand-sage-light);
      display: flex; align-items: center; justify-content: center;
      font-size: 1.25rem;
      flex-shrink: 0;
      border: 2px solid var(--brand-sage);
    }

    .pet-info { flex: 1; }
    .pet-name { font-size: 0.95rem; font-weight: 500; margin-bottom: 0.2rem; }
    .pet-docs { display: flex; gap: 0.35rem; flex-wrap: wrap; }

    .doc-badge {
      font-size: 0.68rem;
      font-weight: 500;
      padding: 0.2rem 0.5rem;
      border-radius: 999px;
      letter-spacing: 0.02em;
    }
    .doc-badge.ok { background: var(--brand-success-light); color: var(--brand-success); }
    .doc-badge.missing { background: var(--brand-warning-light); color: var(--brand-warning); }
    .doc-badge.expired { background: var(--brand-error-light); color: var(--brand-error); }

    /* ── SECTION HEADER ── */
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.75rem;
    }
    .section-title {
      font-family: var(--font-display);
      font-size: 1.3rem;
      font-weight: 600;
      color: var(--brand-bark);
    }

    /* ── STEP PAGES ── */
    .step-header { margin-bottom: 1.5rem; }
    .step-back {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.8rem;
      font-weight: 500;
      color: var(--brand-stone);
      cursor: pointer;
      margin-bottom: 1rem;
      border: none;
      background: none;
      padding: 0;
      transition: color 0.2s;
    }
    .step-back:hover { color: var(--brand-primary); }

    .step-title {
      font-family: var(--font-display);
      font-size: 1.7rem;
      font-weight: 400;
      color: var(--brand-bark);
      margin-bottom: 0.35rem;
    }
    .step-title em { font-style: italic; color: var(--brand-primary); }
    .step-desc {
      font-size: 0.875rem;
      font-weight: 300;
      color: var(--brand-stone);
      line-height: 1.6;
    }

    /* ── FORM ELEMENTS ── */
    .form-group { margin-bottom: 1.1rem; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }

    label {
      display: block;
      font-size: 0.73rem;
      font-weight: 500;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--brand-stone);
      margin-bottom: 0.45rem;
    }

    label .req { color: var(--brand-gold); margin-left: 2px; }
    label .opt { color: var(--brand-stone); font-weight: 300; text-transform: none; letter-spacing: 0; font-size: 0.72rem; }

    input[type="text"],
    input[type="email"],
    input[type="tel"],
    textarea,
    select {
      width: 100%;
      padding: 0.7rem 0.9rem;
      border: 1.5px solid var(--brand-stone-light);
      border-radius: 10px;
      font-family: var(--font-body);
      font-size: 0.9rem;
      font-weight: 400;
      color: var(--brand-bark);
      background: #fff;
      appearance: none;
      transition: border-color 0.2s, box-shadow 0.2s;
      outline: none;
    }

    input:focus, textarea:focus, select:focus {
      border-color: var(--brand-primary);
      box-shadow: 0 0 0 3px rgba(74,103,65,0.1);
    }

    textarea { resize: vertical; min-height: 80px; }

    /* ── FILE DROP ── */
    .file-drop {
      border: 2px dashed var(--brand-stone-light);
      border-radius: 12px;
      padding: 1.75rem 1rem;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
      position: relative;
      background: var(--brand-cream);
    }
    .file-drop:hover, .file-drop.drag-over {
      border-color: var(--brand-primary);
      background: rgba(74,103,65,0.04);
    }
    .file-drop.has-file { border-color: var(--brand-primary); background: var(--brand-success-light); }
    .file-drop input[type="file"] { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
    .file-drop-icon { font-size: 1.75rem; margin-bottom: 0.4rem; pointer-events: none; }
    .file-drop-text { font-size: 0.825rem; color: var(--brand-stone); font-weight: 300; pointer-events: none; }
    .file-drop-text strong { color: var(--brand-primary); font-weight: 500; }
    .file-name { font-size: 0.8rem; color: var(--brand-success); font-weight: 500; margin-top: 0.4rem; pointer-events: none; }

    /* ── DOC TYPE PILLS ── */
    .doc-pills { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .doc-pill-input { display: none; }
    .doc-pill-input + label {
      display: inline-flex;
      align-items: center;
      padding: 0.45rem 0.9rem;
      border: 1.5px solid var(--brand-stone-light);
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 400;
      letter-spacing: 0;
      text-transform: none;
      color: var(--brand-stone);
      cursor: pointer;
      transition: all 0.2s;
      user-select: none;
    }
    .doc-pill-input:checked + label {
      border-color: var(--brand-primary);
      background: var(--brand-sage);
      color: var(--brand-bark);
      font-weight: 500;
    }

    /* ── PET PILLS ── */
    .pet-pill-input { display: none; }
    .pet-pill-input + label {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.45rem 0.9rem;
      border: 1.5px solid var(--brand-stone-light);
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 400;
      letter-spacing: 0;
      text-transform: none;
      color: var(--brand-stone);
      cursor: pointer;
      transition: all 0.2s;
    }
    .pet-pill-input:checked + label {
      border-color: var(--brand-primary);
      background: var(--brand-sage);
      color: var(--brand-bark);
      font-weight: 500;
    }
    .pet-pill-input + label::before { content: '🐾'; font-size: 0.75rem; }

    /* ── AGREEMENT ── */
    .agreement-box {
      background: var(--brand-cream);
      border: 1px solid var(--brand-stone-light);
      border-radius: 12px;
      padding: 1.25rem;
      max-height: 220px;
      overflow-y: auto;
      font-size: 0.82rem;
      line-height: 1.7;
      color: var(--brand-bark);
      font-weight: 300;
      margin-bottom: 1.25rem;
    }

    .agreement-box h4 {
      font-family: var(--font-display);
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
      color: var(--brand-bark);
    }

    .agreement-box p { margin-bottom: 0.75rem; }
    .agreement-box p:last-child { margin-bottom: 0; }

    .checkbox-row {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 0.9rem 1rem;
      background: var(--brand-gold-light);
      border: 1px solid rgba(196,146,42,0.3);
      border-radius: 10px;
    }

    .checkbox-row input[type="checkbox"] {
      width: 18px; height: 18px;
      accent-color: var(--brand-primary);
      flex-shrink: 0;
      margin-top: 2px;
      cursor: pointer;
    }

    .checkbox-row label {
      font-size: 0.82rem;
      font-weight: 400;
      letter-spacing: 0;
      text-transform: none;
      color: var(--brand-bark);
      cursor: pointer;
      line-height: 1.5;
      margin: 0;
    }

    /* ── INFO BOX ── */
    .info-box {
      background: var(--brand-gold-light);
      border-left: 3px solid var(--brand-gold);
      border-radius: 0 8px 8px 0;
      padding: 0.7rem 0.9rem;
      font-size: 0.8rem;
      color: var(--brand-bark);
      font-weight: 300;
      line-height: 1.5;
      margin-top: 0.5rem;
    }

    /* ── BUTTONS ── */
    .btn-primary {
      width: 100%;
      padding: 0.9rem 1rem;
      background: var(--brand-primary);
      color: #fff;
      border: none;
      border-radius: 12px;
      font-family: var(--font-body);
      font-size: 0.95rem;
      font-weight: 500;
      cursor: pointer;
      margin-top: 1.5rem;
      transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
      box-shadow: 0 4px 12px rgba(74,103,65,0.25);
    }
    .btn-primary:hover:not(:disabled) {
      background: var(--brand-primary-light);
      transform: translateY(-1px);
      box-shadow: 0 6px 18px rgba(74,103,65,0.3);
    }
    .btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }
    .btn-primary.loading .btn-text { display: none; }
    .btn-primary.loading .btn-loading { display: inline; }
    .btn-primary .btn-loading { display: none; }

    /* ── FIELD ERROR ── */
    .field-error { font-size: 0.75rem; color: var(--brand-error); margin-top: 0.3rem; display: none; }
    .field-error.visible { display: block; }
    .form-error {
      background: var(--brand-error-light);
      border: 1px solid rgba(192,57,43,0.2);
      border-radius: 10px;
      padding: 0.8rem 1rem;
      font-size: 0.85rem;
      color: var(--brand-error);
      margin-top: 1rem;
      display: none;
    }
    .form-error.visible { display: block; }

    /* ── SUCCESS STATE ── */
    .success-wrap { text-align: center; padding: 1.5rem 0; }
    .success-circle {
      width: 68px; height: 68px;
      background: var(--brand-success-light);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 1.1rem;
      font-size: 1.85rem;
      animation: pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
    }
    @keyframes pop { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }

    h2 {
      font-family: var(--font-display);
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--brand-bark);
      margin-bottom: 0.5rem;
    }

    p { font-size: 0.875rem; font-weight: 300; color: var(--brand-stone); line-height: 1.6; }

    /* ── DOC CARDS ── */
    .doc-cards { display: flex; flex-direction: column; gap: 1rem; }

    .doc-card {
      border-radius: 14px;
      border: 1.5px solid var(--brand-stone-light);
      overflow: hidden;
      background: #fff;
    }

    .doc-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.9rem 1rem;
      background: var(--brand-cream);
      border-bottom: 1px solid var(--brand-stone-light);
    }

    .doc-card-header.ok {
      background: var(--brand-sage-light);
      border-bottom-color: var(--brand-sage);
    }

    .doc-card-header.missing {
      background: var(--brand-warning-light);
      border-bottom-color: rgba(180,83,9,0.15);
    }

    .doc-card-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.88rem;
      font-weight: 500;
      color: var(--brand-bark);
    }

    .doc-card-status {
      font-size: 0.72rem;
      font-weight: 500;
      padding: 0.2rem 0.6rem;
      border-radius: 999px;
    }

    .doc-card-status.ok      { background: var(--brand-success-light); color: var(--brand-success); }
    .doc-card-status.missing { background: var(--brand-warning-light);  color: var(--brand-warning); }

    .doc-card-body { padding: 0.75rem 1rem; }

    .doc-card-pet-row {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .doc-card-pet {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.83rem;
    }

    .doc-card-pet-name {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      color: var(--brand-bark);
      font-weight: 400;
    }

    .btn-upload-small {
      padding: 0.35rem 0.85rem;
      background: var(--brand-primary);
      color: #fff;
      border: none;
      border-radius: 999px;
      font-family: var(--font-body);
      font-size: 0.75rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
      white-space: nowrap;
    }

    .btn-upload-small:hover { background: var(--brand-primary-light); }
    .btn-upload-small.ok {
      background: transparent;
      color: var(--brand-success);
      border: 1.5px solid var(--brand-sage);
    }

    /* ── COMPLIANCE BANNERS ── */
    .compliance-banner {
      border-radius: 14px;
      padding: 1.1rem 1.25rem;
      margin-bottom: 0.25rem;
      display: flex;
      align-items: flex-start;
      gap: 0.85rem;
    }
    .compliance-banner.compliant {
      background: var(--brand-success-light);
      border: 1.5px solid rgba(46,125,50,0.2);
    }
    .compliance-banner.warning {
      background: var(--brand-warning-light);
      border: 1.5px solid rgba(180,83,9,0.2);
    }
    .compliance-banner.blocked {
      background: var(--brand-error-light);
      border: 1.5px solid rgba(192,57,43,0.2);
    }
    .compliance-banner-icon { font-size: 1.5rem; flex-shrink: 0; margin-top: 0.1rem; }
    .compliance-banner-body { flex: 1; }
    .compliance-banner-title {
      font-family: var(--font-display);
      font-size: 1.05rem;
      font-weight: 600;
      margin-bottom: 0.25rem;
    }
    .compliance-banner.compliant .compliance-banner-title { color: var(--brand-success); }
    .compliance-banner.warning  .compliance-banner-title { color: var(--brand-warning); }
    .compliance-banner.blocked  .compliance-banner-title { color: var(--brand-error); }
    .compliance-banner-desc {
      font-size: 0.8rem;
      font-weight: 300;
      color: var(--brand-bark);
      line-height: 1.5;
    }

    /* ── BOOK BUTTON ── */
    .btn-book {
      width: 100%;
      padding: 1rem;
      background: var(--brand-primary);
      color: #fff;
      border: none;
      border-radius: 12px;
      font-family: var(--font-body);
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      margin-top: 1.25rem;
      transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
      box-shadow: 0 4px 12px rgba(74,103,65,0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }
    .btn-book:hover { background: var(--brand-primary-light); transform: translateY(-1px); box-shadow: 0 6px 18px rgba(74,103,65,0.3); }
    .btn-book:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

    /* ── BOOKING PET PILLS (multi-select checkboxes) ── */
    .booking-pet-check { display: none; }
    .booking-pet-check + label {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.45rem 0.9rem;
      border: 1.5px solid var(--brand-stone-light);
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 400;
      color: var(--brand-stone);
      cursor: pointer;
      transition: all 0.2s;
      user-select: none;
    }
    .booking-pet-check:checked + label {
      border-color: var(--brand-primary);
      background: var(--brand-sage);
      color: var(--brand-bark);
      font-weight: 500;
    }
    .booking-pet-check + label::before { content: "🐾"; font-size: 0.75rem; }

    footer {
      text-align: center;
      font-size: 0.72rem;
      color: var(--brand-stone);
      opacity: 0.5;
      margin-top: 2rem;
      position: relative;
      z-index: 1;
    }

    @media (max-width: 420px) {
      .card { padding: 1.5rem 1.25rem; }
      .form-row { grid-template-columns: 1fr; }
      .quick-actions { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>

<header class="site-header">
  <span class="logo-mark">🐾</span>
  <div class="site-name">Paws on Longmeadow</div>
  <div class="site-tagline">Client Portal</div>
</header>

<!-- ══ LOADING ══ -->
<div class="card">
  <div id="view-loading" class="view active">
    <div class="loading-wrap">
      <div class="spinner"></div>
      <p>Loading your portal…</p>
    </div>
  </div>

  <!-- ══ INVALID ══ -->
  <div id="view-invalid" class="view">
    <div class="invalid-wrap">
      <div class="invalid-icon">🔒</div>
      <h2>Link not recognized</h2>
      <p style="margin-top:0.5rem;">This link doesn't match any account. Please use the personal link sent to you, or reach out directly.</p>
    </div>
  </div>

  <!-- ══ ONBOARDING HOME ══ -->
  <div id="view-onboarding" class="view">
    <div class="greeting-name">Hi, <em id="ob-first-name">there</em> 👋</div>
    <p class="greeting-sub" style="margin-top:0.35rem;">Let's get your account set up. It takes about 5 minutes and you only have to do it once.</p>

    <div class="divider"></div>

    <div class="progress-wrap">
      <div class="progress-label">
        <span>Setup Progress</span>
        <strong id="ob-progress-text">0 of 4 complete</strong>
      </div>
      <div class="progress-track">
        <div class="progress-fill" id="ob-progress-fill" style="width:0%"></div>
      </div>
    </div>

    <div class="checklist" id="ob-checklist">
      <div class="check-item" id="step-contact-item" onclick="goToStep('contact')">
        <div class="check-icon" id="step-contact-icon">1</div>
        <div class="check-text">
          <div class="check-title">Contact Information</div>
          <div class="check-desc">Confirm your name, phone, email & address</div>
        </div>
        <span class="check-arrow">→</span>
      </div>
      <div class="check-item" id="step-emergency-item" onclick="goToStep('emergency')">
        <div class="check-icon" id="step-emergency-icon">2</div>
        <div class="check-text">
          <div class="check-title">Emergency Contact</div>
          <div class="check-desc">Someone to reach if you&#39;re both unavailable</div>
        </div>
        <span class="check-arrow">→</span>
      </div>
      <div class="check-item" id="step-docs-item" onclick="goToStep('docs')">
        <div class="check-icon" id="step-docs-icon">3</div>
        <div class="check-text">
          <div class="check-title">Compliance Documents</div>
          <div class="check-desc" id="step-docs-desc">Rabies certificate, town license & vaccination records per pet</div>
        </div>
        <span class="check-arrow">→</span>
      </div>
      <div class="check-item" id="step-agreement-item" onclick="goToStep('agreement')">
        <div class="check-icon" id="step-agreement-icon">4</div>
        <div class="check-text">
          <div class="check-title">Client Agreement</div>
          <div class="check-desc">Review and sign our service agreement</div>
        </div>
        <span class="check-arrow">→</span>
      </div>
    </div>
  </div>

  <!-- ══ DASHBOARD ══ -->
  <div id="view-dashboard" class="view">
    <!-- Compliance status banner injected by buildDashboard() -->
    <div id="dash-status-banner"></div>

    <!-- Upcoming appointments - shown if any exist -->
    <div id="dash-appointments" style="display:none;margin-bottom:0.5rem;">
      <div class="section-header" style="margin-top:1.25rem;">
        <div class="section-title">Upcoming Stays</div>
      </div>
      <div id="dash-appt-cards" style="display:flex;flex-direction:column;gap:0.5rem;"></div>
      <div class="divider"></div>
    </div>

    <div class="section-header" style="margin-top:1.25rem;">
      <div class="section-title">Your Pets</div>
    </div>
    <div class="pet-cards" id="dash-pet-cards"></div>

    <div class="divider"></div>

    <div class="section-header">
      <div class="section-title">Quick Actions</div>
    </div>
    <div class="quick-actions">
      <a class="action-btn" onclick="goToStep('docs')">
        <span class="action-btn-icon">📎</span>
        <span class="action-btn-label">Upload Document</span>
      </a>
      <a class="action-btn" onclick="goToStep('contact')">
        <span class="action-btn-icon">✏️</span>
        <span class="action-btn-label">Update Info</span>
      </a>
      <a class="action-btn" onclick="goToStep('emergency')">
        <span class="action-btn-icon">🚨</span>
        <span class="action-btn-label">Emergency Contact</span>
      </a>
      <a class="action-btn" onclick="goToStep('agreement')">
        <span class="action-btn-icon">📋</span>
        <span class="action-btn-label">View Agreement</span>
      </a>
    </div>
  </div>

  <!-- ══ STEP: CONTACT INFO ══ -->
  <div id="view-contact" class="view">
    <div class="step-header">
      <button class="step-back" onclick="goHome()">← Back</button>
      <div class="step-title">Contact <em>Information</em></div>
      <p class="step-desc">Your current details are pre-filled below. Update anything that has changed — we will review and apply it to your account.</p>
    </div>
    <div id="contact-current-info" style="margin-bottom:1.25rem;padding:0.85rem 1rem;background:var(--brand-sage-light);border:1.5px solid var(--brand-sage);border-radius:12px;font-size:0.82rem;line-height:1.8;color:var(--brand-bark);"></div>

    <div class="form-group">
      <label>Full Name <span class="req">*</span></label>
      <input type="text" id="c-name" placeholder="Your full name"/>
      <div class="field-error" id="c-name-error">Please enter your name.</div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Phone <span class="req">*</span></label>
        <input type="tel" id="c-phone" placeholder="(555) 555-5555"/>
        <div class="field-error" id="c-phone-error">Please enter a phone number.</div>
      </div>
      <div class="form-group">
        <label>Email <span class="req">*</span></label>
        <input type="email" id="c-email" placeholder="you@example.com"/>
        <div class="field-error" id="c-email-error">Please enter a valid email.</div>
      </div>
    </div>
    <div class="form-group">
      <label>Address <span class="opt">(optional)</span></label>
      <input type="text" id="c-address" placeholder="123 Main St, Sharon MA"/>
    </div>

    <div class="divider"></div>

    <p class="step-desc" style="margin-bottom:1rem;">Additional owner <span style="font-weight:300;color:var(--brand-stone);">(optional)</span></p>
    <div class="form-row">
      <div class="form-group">
        <label>Name</label>
        <input type="text" id="c-add-name" placeholder="Partner or co-owner"/>
      </div>
      <div class="form-group">
        <label>Phone</label>
        <input type="tel" id="c-add-phone" placeholder="(555) 555-5555"/>
      </div>
    </div>
    <div class="form-group">
      <label>Email</label>
      <input type="email" id="c-add-email" placeholder="partner@example.com"/>
    </div>

    <div class="form-error" id="c-form-error"></div>
    <button class="btn-primary" id="c-submit" onclick="submitContact()">
      <span class="btn-text">Save & Continue</span>
      <span class="btn-loading">Saving…</span>
    </button>
  </div>

  <!-- ══ STEP: EMERGENCY CONTACT ══ -->
  <div id="view-emergency" class="view">
    <div class="step-header">
      <button class="step-back" onclick="goHome()">← Back</button>
      <div class="step-title">Emergency <em>Contact</em></div>
      <p class="step-desc">Someone we can reach if both owners are unavailable — a family member, neighbor, or trusted friend.</p>
    </div>

    <div class="form-group">
      <label>Full Name <span class="req">*</span></label>
      <input type="text" id="e-name" placeholder="Emergency contact's name"/>
      <div class="field-error" id="e-name-error">Please enter a name.</div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Phone <span class="req">*</span></label>
        <input type="tel" id="e-phone" placeholder="(555) 555-5555"/>
        <div class="field-error" id="e-phone-error">Please enter a phone number.</div>
      </div>
      <div class="form-group">
        <label>Relationship <span class="req">*</span></label>
        <input type="text" id="e-relationship" placeholder="Sister, neighbor, friend…"/>
        <div class="field-error" id="e-rel-error">Please enter the relationship.</div>
      </div>
    </div>

    <div class="form-error" id="e-form-error"></div>
    <button class="btn-primary" id="e-submit" onclick="submitEmergency()">
      <span class="btn-text">Save & Continue</span>
      <span class="btn-loading">Saving…</span>
    </button>
  </div>

  <!-- ══ STEP: DOCUMENTS ══ -->
  <div id="view-docs" class="view">
    <div class="step-header">
      <button class="step-back" onclick="goHome()">← Back</button>
      <div class="step-title">Compliance <em>Documents</em></div>
      <p class="step-desc">We need three documents for each pet. Upload each one below.</p>
    </div>

    <!-- Dynamic pet + doc cards -->
    <div id="docs-cards-container"></div>

    <div class="form-error" id="docs-form-error"></div>
  </div>

  <!-- ══ UPLOAD MODAL (inline, shown when a card upload btn is tapped) ══ -->
  <div id="view-doc-upload" class="view">
    <div class="step-header">
      <button class="step-back" onclick="showView('view-docs')">← Back</button>
      <div class="step-title" id="upload-title">Upload <em>Document</em></div>
      <p class="step-desc" id="upload-desc">Attach the file below.</p>
    </div>

    <div class="form-group">
      <label>Expiration Date <span class="opt">(if applicable)</span></label>
      <input type="date" id="docs-expiry"/>
      <div class="info-box">Leave blank for documents that don't expire.</div>
    </div>

    <div class="form-group">
      <label>Document File <span class="req">*</span></label>
      <div class="file-drop" id="docs-file-drop">
        <input type="file" id="docs-file-input" accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.webp"/>
        <div class="file-drop-icon">📎</div>
        <div class="file-drop-text"><strong>Tap to choose a file</strong> or drag and drop<br/>PDF, JPG, PNG, or HEIC accepted</div>
        <div class="file-name" id="docs-file-name"></div>
      </div>
      <div class="field-error" id="docs-file-error">Please attach a document.</div>
    </div>

    <div class="form-error" id="docs-upload-form-error"></div>
    <button class="btn-primary" id="docs-submit" onclick="submitDoc()">
      <span class="btn-text">Upload Document</span>
      <span class="btn-loading">Uploading… please wait</span>
    </button>
  </div>

  <!-- ══ STEP: DOCS SUCCESS ══ -->
  <div id="view-docs-success" class="view">
    <div class="success-wrap">
      <div class="success-circle">✅</div>
      <h2>Document received!</h2>
      <p style="margin-top:0.5rem;">We&#39;ll review it and you&#39;re good to go.</p>
    </div>
    <button class="btn-primary" style="margin-top:1.5rem;" onclick="goToStep('docs')">Upload Another Document</button>
    <button class="btn-primary" style="margin-top:0.75rem;background:transparent;color:var(--brand-primary);box-shadow:none;border:1.5px solid var(--brand-primary);" onclick="goHome()">Next Section</button>
  </div>

  <!-- ══ STEP: AGREEMENT ══ -->
  <div id="view-agreement" class="view">
    <div class="step-header">
      <button class="step-back" onclick="goHome()">← Back</button>
      <div class="step-title">Client <em>Agreement</em></div>
      <p class="step-desc">Please read and sign our service agreement below.</p>
    </div>

    <div class="agreement-box">
      <h4>Paws on Longmeadow — Service Agreement</h4>
      <p><em>This agreement is currently being finalized and will be updated with full terms shortly.</em></p>
      <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.</p>
      <p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>
      <p>Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.</p>
      <p>Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.</p>
    </div>

    <div class="checkbox-row">
      <input type="checkbox" id="agree-check" onchange="toggleAgreeBtn()"/>
      <label for="agree-check">By checking this box I acknowledge that I have read and agree to the Paws on Longmeadow service agreement and policies.</label>
    </div>

    <div class="form-error" id="ag-form-error"></div>
    <button class="btn-primary" id="ag-submit" onclick="submitAgreement()" disabled>
      <span class="btn-text">Sign Agreement</span>
      <span class="btn-loading">Saving…</span>
    </button>
  </div>

  <!-- ══ STEP: CONTACT SUCCESS ══ -->
  <div id="view-contact-success" class="view">
    <div class="success-wrap">
      <div class="success-circle">📬</div>
      <h2>Updates received!</h2>
      <p style="margin-top:0.5rem;">Your changes have been sent for review and will be applied to your account shortly. No action needed on your end.</p>
    </div>
    <button class="btn-primary" style="margin-top:1.5rem;" onclick="goHome()">Next Section</button>
  </div>

</div><!-- end .card -->

<div class="card" id="booking-card" style="display:none;">
  <!-- ══ STEP: BOOK BOARDING ══ -->
  <div id="view-booking">
    <div class="step-header">
      <button class="step-back" onclick="goHome()">← Back</button>
      <div class="step-title">Book a <em>Boarding Stay</em></div>
      <p class="step-desc">Fill out the details below. We will confirm your dates within 24 hours.</p>
    </div>

    <div class="form-group">
      <label>Which pet(s)? <span class="req">*</span></label>
      <div class="pet-pills" id="booking-pet-pills"></div>
      <div class="field-error" id="booking-pet-error">Please select at least one pet.</div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Drop-off Date <span class="req">*</span></label>
        <input type="date" id="booking-start-date"/>
        <div class="field-error" id="booking-start-date-error">Please select a date.</div>
      </div>
      <div class="form-group">
        <label>Drop-off Time <span class="req">*</span></label>
        <select id="booking-start-time">
          <option value="">Select time...</option>
          <option value="Early morning (7:30–9AM)">Early morning (7:30–9AM)</option>
          <option value="Noon (11:30AM–12:30PM)">Noon (11:30AM–12:30PM)</option>
          <option value="Late Afternoon (4:00–5:30PM)">Late Afternoon (4:00–5:30PM)</option>
        </select>
        <div class="field-error" id="booking-start-time-error">Please select a time.</div>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Pick-up Date <span class="req">*</span></label>
        <input type="date" id="booking-end-date"/>
        <div class="field-error" id="booking-end-date-error">Please select a date.</div>
      </div>
      <div class="form-group">
        <label>Pick-up Time <span class="req">*</span></label>
        <select id="booking-end-time">
          <option value="">Select time...</option>
          <option value="Early morning (7:30–9AM)">Early morning (7:30–9AM)</option>
          <option value="Noon (11:30AM–12:30PM)">Noon (11:30AM–12:30PM)</option>
          <option value="Late Afternoon (4:00–5:30PM)">Late Afternoon (4:00–5:30PM)</option>
        </select>
        <div class="field-error" id="booking-end-time-error">Please select a time.</div>
      </div>
    </div>

    <div class="form-group">
      <label>Transport <span class="req">*</span></label>
      <div class="doc-pills" id="booking-transport-pills">
        <input type="radio" name="booking-transport" class="doc-pill-input" id="bt-none" value="None"/>
        <label for="bt-none">No transport needed</label>
        <input type="radio" name="booking-transport" class="doc-pill-input" id="bt-pickup" value="One Way (Pick-up)"/>
        <label for="bt-pickup">Pick-up only</label>
        <input type="radio" name="booking-transport" class="doc-pill-input" id="bt-dropoff" value="One Way (Drop-off)"/>
        <label for="bt-dropoff">Drop-off only</label>
        <input type="radio" name="booking-transport" class="doc-pill-input" id="bt-round" value="Round Trip"/>
        <label for="bt-round">Round trip</label>
      </div>
      <div class="field-error" id="booking-transport-error">Please select a transport option.</div>
    </div>

    <div class="form-group">
      <label>Notes <span class="opt">(optional)</span></label>
      <textarea id="booking-notes" placeholder="Anything we should know — feeding schedule, medications, special instructions..."></textarea>
    </div>

    <div class="info-box" style="margin-bottom:0;">Boarding is $85/night. Pricing is confirmed when we review your request.</div>

    <div class="form-error" id="booking-form-error"></div>
    <button class="btn-primary" id="booking-submit" onclick="submitBooking()">
      <span class="btn-text">Request Boarding Stay</span>
      <span class="btn-loading">Sending request...</span>
    </button>
  </div>
</div>

<div class="card" id="booking-success-card" style="display:none;">
  <!-- ══ BOOKING SUCCESS ══ -->
  <div id="view-booking-success">
    <div class="success-wrap">
      <div class="success-circle">🐾</div>
      <h2>Request sent!</h2>
      <p style="margin-top:0.5rem;">Your boarding request has been received. We will confirm your dates within 24 hours via text or email.</p>
    </div>

    <!-- Booking summary injected by JS -->
    <div id="booking-summary" style="margin-top:1.25rem;padding:1rem;background:var(--brand-sage-light);border:1.5px solid var(--brand-sage);border-radius:12px;font-size:0.875rem;line-height:1.7;"></div>

    <button class="btn-primary" style="margin-top:1rem;" onclick="bookAnother()">
      Book Another Stay
    </button>
    <button class="btn-primary" style="margin-top:0.6rem;background:transparent;color:var(--brand-primary);box-shadow:none;border:1.5px solid var(--brand-primary);" onclick="goHome()">
      Back to Portal
    </button>
  </div>
</div>

<footer>© Paws on Longmeadow · Sharon, MA</footer>

<script>
// ── CONFIG ──────────────────────────────────────────────────────────────────
const WORKER_URL = "";

// ── STATE ────────────────────────────────────────────────────────────────────
let clientToken = null;
let clientData  = null;
let selectedDocPetId   = null;
let selectedDocPetName = null;
let selectedDocFile    = null;

// ── HELPERS ──────────────────────────────────────────────────────────────────
function showView(id) {
  // Hide/show booking cards vs main card
  const mainCard = document.querySelector('.card');
  const bookingCard = document.getElementById('booking-card');
  const bookingSuccessCard = document.getElementById('booking-success-card');

  if (id === 'view-booking') {
    mainCard.style.display = 'none';
    bookingCard.style.display = 'block';
    bookingSuccessCard.style.display = 'none';
  } else if (id === 'view-booking-success') {
    mainCard.style.display = 'none';
    bookingCard.style.display = 'none';
    bookingSuccessCard.style.display = 'block';
  } else {
    mainCard.style.display = '';
    bookingCard.style.display = 'none';
    bookingSuccessCard.style.display = 'none';
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function getToken() {
  return new URLSearchParams(window.location.search).get('client');
}

// ── ONBOARDING STATUS ────────────────────────────────────────────────────────
function calcOnboardingSteps(data) {
  return {
    contact:   !!(data.emailConfirmed),
    emergency: !!(data.emergencyName && data.emergencyPhone),
    docs:      !!(data.docsComplete),
    agreement: !!(data.agreementSigned),
  };
}

function updateProgressUI(steps) {
  const keys = ['contact','emergency','docs','agreement'];
  const done  = keys.filter(k => steps[k]).length;
  const pct   = Math.round((done / keys.length) * 100);

  document.getElementById('ob-progress-fill').style.width = pct + '%';
  document.getElementById('ob-progress-text').textContent = done + ' of ' + keys.length + ' complete';

  keys.forEach((k, i) => {
    const item = document.getElementById('step-' + k + '-item');
    const icon = document.getElementById('step-' + k + '-icon');
    if (steps[k]) {
      item.classList.add('done');
      item.onclick = null;
      icon.textContent = '✓';
    } else {
      item.classList.remove('done');
      item.onclick = () => goToStep(k);
      icon.textContent = i + 1;
    }
  });

  // Update docs description to show what's missing per pet
  const docsDesc = document.getElementById('step-docs-desc');
  if (docsDesc && clientData?.pets?.length > 0) {
    if (steps.docs) {
      docsDesc.textContent = 'All documents on file ✓';
    } else {
      const missing = [];
      (clientData.pets || []).forEach(pet => {
        const docs = pet.docs || [];
        const hasRabies = docs.some(d => d.type === 'Rabies Certificate' && !d.expired);
        const hasTown   = docs.some(d => d.type === 'Town License'       && !d.expired);
        const hasVax    = docs.some(d => d.type === 'Vaccination Record' && !d.expired);
        const petMissing = [];
        if (!hasRabies) petMissing.push('rabies certificate');
        if (!hasTown)   petMissing.push('town license');
        if (!hasVax)    petMissing.push('vaccination record');
        if (petMissing.length > 0) {
          missing.push(pet.name + ': ' + petMissing.join(', '));
        }
      });
      docsDesc.textContent = missing.length > 0
        ? 'Missing — ' + missing.join(' · ')
        : 'Upload required documents for each pet';
    }
  }

  return done === keys.length;
}

// ── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  clientToken = getToken();
  if (!clientToken) { showView('view-invalid'); return; }

  try {
    const res = await fetch(WORKER_URL + '/client?token=' + encodeURIComponent(clientToken));
    if (!res.ok) throw new Error('not found');
    clientData = await res.json();
  } catch {
    showView('view-invalid');
    return;
  }

  const firstName = clientData.firstName || 'there';
  document.getElementById('ob-first-name').textContent = firstName;

  // Calc step completion
  const steps    = calcOnboardingSteps(clientData);
  const complete = updateProgressUI(steps);

  if (complete) {
    buildDashboard();
    showView('view-dashboard');
  } else {
    showView('view-onboarding');
  }

  // Pre-fill contact fields
  if (clientData.name)        document.getElementById('c-name').value    = clientData.name;
  if (clientData.phone)       document.getElementById('c-phone').value   = clientData.phone;
  if (clientData.email)       document.getElementById('c-email').value   = clientData.email;
  if (clientData.address)     document.getElementById('c-address').value = clientData.address;
  if (clientData.addName)     document.getElementById('c-add-name').value  = clientData.addName;
  if (clientData.addPhone)    document.getElementById('c-add-phone').value = clientData.addPhone;
  if (clientData.addEmail)    document.getElementById('c-add-email').value = clientData.addEmail;
  if (clientData.emergencyName)         document.getElementById('e-name').value         = clientData.emergencyName;
  if (clientData.emergencyPhone)        document.getElementById('e-phone').value        = clientData.emergencyPhone;
  if (clientData.emergencyRelationship) document.getElementById('e-relationship').value = clientData.emergencyRelationship;
}

// ── NAVIGATION ───────────────────────────────────────────────────────────────
async function goHome() {
  // Always re-fetch client data so compliance status is fresh
  try {
    const res = await fetch(WORKER_URL + '/client?token=' + encodeURIComponent(clientToken));
    if (res.ok) clientData = await res.json();
  } catch {}

  const steps    = calcOnboardingSteps(clientData);
  const complete = updateProgressUI(steps);
  if (complete) {
    buildDashboard();
    showView('view-dashboard');
  } else {
    showView('view-onboarding');
  }
}

// Current upload context
let uploadContext = { petId: null, petName: null, docType: null };
// Last booking for success summary
let lastBooking = {};

function goToStep(step) {
  showView('view-' + step);
  if (step === 'docs')    buildDocCards();
  if (step === 'booking') buildBookingPetPills();
  if (step === 'contact') buildContactCurrentInfo();
}

function buildContactCurrentInfo() {
  const el = document.getElementById('contact-current-info');
  if (!el || !clientData) return;
  const d = clientData;
  const lines = [
    d.name  ? '<strong>' + d.name + '</strong>' : '',
    d.phone ? '📞 ' + d.phone : '',
    d.email ? '✉️ ' + d.email : '',
    d.address ? '📍 ' + d.address : '',
    (d.addName || d.addPhone) ? '<span style="color:var(--brand-stone);">Additional: ' + [d.addName, d.addPhone].filter(Boolean).join(' · ') + '</span>' : '',
  ].filter(Boolean).join('<br>');
  el.innerHTML = lines || '<span style="color:var(--brand-stone);">No information on file yet.</span>';
}

function buildDocCards() {
  const container = document.getElementById('docs-cards-container');
  if (!container || !clientData?.pets?.length) return;
  container.innerHTML = '';

  const DOC_TYPES = [
    { type: 'Rabies Certificate', icon: '💉', desc: 'Required by MA law' },
    { type: 'Town License',       icon: '🏛', desc: 'Current year registration' },
    { type: 'Vaccination Record', icon: '📋', desc: 'Up-to-date vaccine history' },
  ];

  const wrap = document.createElement('div');
  wrap.className = 'doc-cards';

  DOC_TYPES.forEach(({ type, icon, desc }) => {
    // Check status across all pets
    const allPetsOk = clientData.pets.every(pet => {
      const docs = pet.docs || [];
      return docs.some(d => d.type === type && !d.expired);
    });

    const card = document.createElement('div');
    card.className = 'doc-card';

    // Header
    const header = document.createElement('div');
    header.className = 'doc-card-header ' + (allPetsOk ? 'ok' : 'missing');
    header.innerHTML =
      '<div class="doc-card-title">' + icon + ' ' + type + '</div>' +
      '<span class="doc-card-status ' + (allPetsOk ? 'ok' : 'missing') + '">' +
      (allPetsOk ? '✓ Complete' : 'Needed') + '</span>';

    // Body — one row per pet
    const body = document.createElement('div');
    body.className = 'doc-card-body';
    const petRows = document.createElement('div');
    petRows.className = 'doc-card-pet-row';

    clientData.pets.forEach(pet => {
      const docs = pet.docs || [];
      const hasDoc = docs.some(d => d.type === type && !d.expired);

      const row = document.createElement('div');
      row.className = 'doc-card-pet';
      row.innerHTML =
        '<div class="doc-card-pet-name">🐾 ' + pet.name + '</div>';

      const btn = document.createElement('button');
      btn.className = 'btn-upload-small' + (hasDoc ? ' ok' : '');
      btn.textContent = hasDoc ? '✓ On file' : 'Upload';

      if (!hasDoc) {
        btn.onclick = () => openUploadModal(pet.id, pet.name, type);
      }

      row.appendChild(btn);
      petRows.appendChild(row);
    });

    body.appendChild(petRows);
    card.appendChild(header);
    card.appendChild(body);
    wrap.appendChild(card);
  });

  container.appendChild(wrap);

  // Show completion banner if all docs are on file
  const allComplete = (clientData.pets || []).every(pet => {
    const docs = pet.docs || [];
    return ['Rabies Certificate','Town License','Vaccination Record'].every(type =>
      docs.some(d => d.type === type && !d.expired)
    );
  });

  const existing = document.getElementById('docs-complete-banner');
  if (existing) existing.remove();

  if (allComplete) {
    const banner = document.createElement('div');
    banner.id = 'docs-complete-banner';
    banner.style.cssText = 'margin-top:1.25rem;background:var(--brand-success-light);border:1.5px solid rgba(46,125,50,0.25);border-radius:14px;padding:1.25rem;text-align:center;';
    banner.innerHTML =
      '<div style="font-size:1.75rem;margin-bottom:0.5rem;">🎉</div>' +
      '<div style="font-family:var(--font-display);font-size:1.2rem;font-weight:600;color:var(--brand-success);margin-bottom:0.35rem;">All documents on file!</div>' +
      '<p style="font-size:0.82rem;color:var(--brand-bark);margin-bottom:1rem;">You&#39;re all set on compliance. Head back to finish your account setup.</p>' +
      '<button class="btn-primary" style="margin-top:0;max-width:260px;margin:0 auto;display:block;" onclick="goHome()">Back to Portal</button>';
    container.appendChild(banner);
  }
}

function openUploadModal(petId, petName, docType) {
  uploadContext = { petId, petName, docType };

  // Reset upload form
  selectedDocFile = null;
  document.getElementById('docs-file-input').value = '';
  document.getElementById('docs-file-name').textContent = '';
  document.getElementById('docs-file-drop').classList.remove('has-file');
  document.getElementById('docs-expiry').value = '';
  document.getElementById('docs-file-error').classList.remove('visible');
  document.getElementById('docs-upload-form-error').classList.remove('visible');

  const btn = document.getElementById('docs-submit');
  btn.disabled = false;
  btn.classList.remove('loading');

  document.getElementById('upload-title').innerHTML = 'Upload <em>' + docType + '</em>';
  document.getElementById('upload-desc').textContent = 'For ' + petName + ' — attach the file below.';

  showView('view-doc-upload');
}

// ── DASHBOARD ────────────────────────────────────────────────────────────────
function getComplianceState() {
  const pets = clientData.pets || [];
  const REQUIRED = ['Rabies Certificate', 'Town License', 'Vaccination Record'];
  const missing = [];
  const expiring = [];

  pets.forEach(pet => {
    const docs = pet.docs || [];
    REQUIRED.forEach(type => {
      // Only count valid (non-expired) docs
      const validDoc = docs.find(d => d.type === type && !d.expired);
      if (!validDoc) {
        // Only flag as missing if the Worker also says docs are incomplete
        if (!clientData.docsComplete) {
          missing.push({ pet: pet.name, type });
        }
      } else if (validDoc.daysUntilExpiry !== undefined && validDoc.daysUntilExpiry <= 30) {
        expiring.push({ pet: pet.name, type, days: validDoc.daysUntilExpiry });
      }
    });
  });

  // Trust the Worker's docsComplete as the source of truth
  if (clientData.docsComplete) {
    if (expiring.length > 0) return { state: 'warning', missing: [], expiring };
    return { state: 'compliant', missing: [], expiring: [] };
  }

  return { state: 'blocked', missing, expiring };
}

function buildDashboard() {
  const { state, missing, expiring } = getComplianceState();
  const banner = document.getElementById('dash-status-banner');
  const firstName = clientData.firstName || 'there';

  // ── Status banner ──
  if (state === 'compliant') {
    banner.innerHTML =
      '<div class="compliance-banner compliant">' +
        '<div class="compliance-banner-icon">✅</div>' +
        '<div class="compliance-banner-body">' +
          '<div class="compliance-banner-title">All set, ' + firstName + '!</div>' +
          '<div class="compliance-banner-desc">Your account is fully up to date. Ready to book.</div>' +
        '</div>' +
      '</div>' +
      '<button class="btn-book" id="dash-book-btn">' +
        '🏡 Book a Boarding Stay' +
      '</button>';
  // Wire buttons after innerHTML is set
  setTimeout(() => {
    const bookBtn = document.getElementById('dash-book-btn');
    if (bookBtn && !bookBtn.disabled) bookBtn.onclick = () => goToStep('booking');
    const uploadBtn = document.getElementById('pet-docs-upload-btn');
    if (uploadBtn) uploadBtn.onclick = () => goToStep('docs');
  }, 0);

  } else if (state === 'warning') {
    const items = expiring.map(e => e.pet + "'s " + e.type + ' expires in ' + e.days + ' days').join(' · ');
    banner.innerHTML =
      '<div class="compliance-banner warning">' +
        '<div class="compliance-banner-icon">⚠️</div>' +
        '<div class="compliance-banner-body">' +
          '<div class="compliance-banner-title">Documents expiring soon</div>' +
          '<div class="compliance-banner-desc">' + items + '. Please renew before your next stay.</div>' +
        '</div>' +
      '</div>' +
      '<button class="btn-book" id="dash-book-btn">' +
        '🏡 Book a Boarding Stay' +
      '</button>';
  // Wire book button for warning state
  setTimeout(() => {
    const bookBtn2 = document.getElementById('dash-book-btn');
    if (bookBtn2 && !bookBtn2.disabled) bookBtn2.onclick = () => goToStep('booking');
  }, 0);

  } else {
    const items = missing.map(m => m.pet + ': ' + m.type).join(' · ');
    banner.innerHTML =
      '<div class="compliance-banner blocked">' +
        '<div class="compliance-banner-icon">🔒</div>' +
        '<div class="compliance-banner-body">' +
          '<div class="compliance-banner-title">Documents needed before booking</div>' +
          '<div class="compliance-banner-desc">' + items + '</div>' +
        '</div>' +
      '</div>' +
      '<button class="btn-book" disabled title="Please upload missing documents first">' +
        '🏡 Book a Boarding Stay' +
      '</button>';
  }

  // ── Upcoming appointments ──
  const appts = clientData.appointments || [];
  const apptSection = document.getElementById('dash-appointments');
  const apptCards   = document.getElementById('dash-appt-cards');
  if (appts.length > 0) {
    apptSection.style.display = 'block';
    apptCards.innerHTML = '';
    const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });

    appts.forEach(appt => {
      const isConfirmed = appt.status === 'Confirmed';
      const statusColor = isConfirmed ? 'var(--brand-success)' : 'var(--brand-warning)';
      const statusBg    = isConfirmed ? 'var(--brand-success-light)' : 'var(--brand-warning-light)';

      // Parse nights for estimate
      const nights = appt.startDate && appt.endDate
        ? Math.max(1, Math.round((new Date(appt.endDate) - new Date(appt.startDate)) / 86400000))
        : null;

      // Pricing line — show confirmed message or estimate
      let pricingLine = '';
      if (appt.clientMessage) {
        // Extract total from message e.g. "Total: $255.00"
        const totalMatch = appt.clientMessage.match(/Total:\s*(\$[\d,.]+)/);
        pricingLine = totalMatch
          ? '<div style="font-size:0.75rem;font-weight:500;color:var(--brand-success);margin-top:0.2rem;">' + totalMatch[1] + ' confirmed</div>'
          : '';
      } else if (nights) {
        pricingLine = '<div style="font-size:0.75rem;font-weight:300;color:var(--brand-stone);margin-top:0.2rem;">Pricing starts at $85/night — confirmation coming soon</div>';
      }

      apptCards.innerHTML +=
        '<div style="padding:0.85rem 1rem;border-radius:12px;border:1.5px solid var(--brand-stone-light);background:#fff;">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.3rem;">' +
            '<div style="font-size:0.7rem;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:var(--brand-stone);">🏡 Boarding</div>' +
            '<span style="font-size:0.72rem;font-weight:500;padding:0.2rem 0.6rem;border-radius:999px;background:' + statusBg + ';color:' + statusColor + ';">' + appt.status + '</span>' +
          '</div>' +
          '<div style="font-size:0.92rem;font-weight:500;color:var(--brand-bark);margin-bottom:0.2rem;">' + fmt(appt.startDate) + ' → ' + fmt(appt.endDate) + '</div>' +
          '<div style="font-size:0.78rem;font-weight:300;color:var(--brand-stone);">' +
            (appt.startTime ? appt.startTime + ' drop-off · ' : '') +
            (appt.endTime   ? appt.endTime   + ' pick-up'     : '') +
          '</div>' +
          pricingLine +
        '</div>';
    });
  } else {
    apptSection.style.display = 'none';
  }

  // ── Pet cards with doc detail ──
  const container = document.getElementById('dash-pet-cards');
  container.innerHTML = '';
  const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '';
  const REQUIRED_DOCS = ['Rabies Certificate', 'Town License', 'Vaccination Record'];

  (clientData.pets || []).forEach(pet => {
    const docs = pet.docs || [];

    // Build doc rows — one per required doc type, pick best (non-expired) record
    const docRows = REQUIRED_DOCS.map(type => {
      const validDoc   = docs.find(d => d.type === type && !d.expired);
      const expiredDoc = docs.find(d => d.type === type &&  d.expired);
      const doc = validDoc || expiredDoc;
      const ok  = !!validDoc;

      let expiryText = '';
      if (doc?.expiryDate) {
        expiryText = ok
          ? 'Expires ' + fmtDate(doc.expiryDate)
          : 'Expired ' + fmtDate(doc.expiryDate);
      }

      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:0.45rem 0;border-bottom:1px solid var(--brand-stone-light);">' +
        '<div style="display:flex;align-items:center;gap:0.5rem;">' +
          '<span style="font-size:0.85rem;">' + (ok ? '✅' : '⚠️') + '</span>' +
          '<span style="font-size:0.82rem;font-weight:' + (ok ? '400' : '500') + ';color:' + (ok ? 'var(--brand-bark)' : 'var(--brand-warning)') + ';">' + type + '</span>' +
        '</div>' +
        '<span style="font-size:0.75rem;color:' + (ok ? 'var(--brand-stone)' : 'var(--brand-warning)') + ';font-weight:300;">' + (expiryText || (ok ? 'On file' : 'Missing')) + '</span>' +
      '</div>';
    }).join('');

    container.innerHTML +=
      '<div class="pet-card" style="flex-direction:column;align-items:stretch;gap:0;">' +
        '<div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem;">' +
          '<div class="pet-avatar">🐶</div>' +
          '<div class="pet-name">' + pet.name + '</div>' +
        '</div>' +
        '<div style="border-top:1px solid var(--brand-stone-light);padding-top:0.5rem;">' +
          docRows.replace(/border-bottom[^;]+;[^"]*"[^>]*>(?=[^<]*<\/div><\/div>$)/, '') +
        '</div>' +
        '<button style="margin-top:0.75rem;padding:0.4rem 0.85rem;background:transparent;color:var(--brand-primary);border:1.5px solid var(--brand-primary);border-radius:999px;font-family:var(--font-body);font-size:0.78rem;font-weight:500;cursor:pointer;" id="pet-docs-upload-btn">Upload / Update Docs</button>' +
      '</div>';
  });
}



// ── FILE HANDLING ─────────────────────────────────────────────────────────────
function handleFile(file) {
  if (!file) return;
  selectedDocFile = file;
  document.getElementById('docs-file-name').textContent = file.name;
  document.getElementById('docs-file-drop').classList.add('has-file');
  document.getElementById('docs-file-error').classList.remove('visible');
}

document.getElementById('docs-file-input').addEventListener('change', function() { handleFile(this.files[0]); });
document.getElementById('docs-file-drop').addEventListener('dragover',  e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); });
document.getElementById('docs-file-drop').addEventListener('dragleave', e => e.currentTarget.classList.remove('drag-over'));
document.getElementById('docs-file-drop').addEventListener('drop', e => {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  handleFile(e.dataTransfer.files[0]);
});

// ── SUBMIT: CONTACT ───────────────────────────────────────────────────────────
async function submitContact() {
  let valid = true;
  const name  = document.getElementById('c-name').value.trim();
  const phone = document.getElementById('c-phone').value.trim();
  const email = document.getElementById('c-email').value.trim();

  const show = (id, msg) => {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.classList.add('visible');
    valid = false;
  };
  const hide = id => document.getElementById(id).classList.remove('visible');

  if (!name)  show('c-name-error',  'Please enter your name.');  else hide('c-name-error');
  if (!phone) show('c-phone-error', 'Please enter a phone number.'); else hide('c-phone-error');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) show('c-email-error', 'Please enter a valid email.'); else hide('c-email-error');
  if (!valid) return;

  const btn = document.getElementById('c-submit');
  btn.disabled = true; btn.classList.add('loading');
  document.getElementById('c-form-error').classList.remove('visible');

  const payload = {
    token: clientToken, clientId: clientData.clientId,
    updates: [
      { field: 'Client Name',                current: clientData.name  || '', proposed: name },
      { field: 'Phone Number',               current: clientData.phone || '', proposed: phone },
      { field: 'Email Address',              current: clientData.email || '', proposed: email },
      { field: 'Address',                    current: clientData.address  || '', proposed: document.getElementById('c-address').value.trim() },
      { field: 'Additional Owner Name',      current: clientData.addName  || '', proposed: document.getElementById('c-add-name').value.trim() },
      { field: 'Additional Owner Phone',     current: clientData.addPhone || '', proposed: document.getElementById('c-add-phone').value.trim() },
      { field: 'Additional Owner Email',     current: clientData.addEmail || '', proposed: document.getElementById('c-add-email').value.trim() },
    ].filter(u => u.proposed !== u.current && (u.proposed || u.current)),
    markEmailConfirmed: true,
  };

  try {
    const res = await fetch(WORKER_URL + '/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Server error');
    }
    clientData.emailConfirmed = true;
    clientData.email = email;
    clientData.name  = name;
    clientData.phone = phone;
    showView('view-contact-success');
  } catch (err) {
    document.getElementById('c-form-error').textContent = 'Error: ' + err.message;
    document.getElementById('c-form-error').classList.add('visible');
    btn.disabled = false; btn.classList.remove('loading');
  }
}

// ── SUBMIT: EMERGENCY ─────────────────────────────────────────────────────────
async function submitEmergency() {
  let valid = true;
  const name = document.getElementById('e-name').value.trim();
  const phone = document.getElementById('e-phone').value.trim();
  const rel   = document.getElementById('e-relationship').value.trim();

  if (!name)  { document.getElementById('e-name-error').classList.add('visible');  valid = false; }
  else          document.getElementById('e-name-error').classList.remove('visible');
  if (!phone) { document.getElementById('e-phone-error').classList.add('visible'); valid = false; }
  else          document.getElementById('e-phone-error').classList.remove('visible');
  if (!rel)   { document.getElementById('e-rel-error').classList.add('visible');   valid = false; }
  else          document.getElementById('e-rel-error').classList.remove('visible');
  if (!valid) return;

  const btn = document.getElementById('e-submit');
  btn.disabled = true; btn.classList.add('loading');
  document.getElementById('e-form-error').classList.remove('visible');

  const payload = {
    token: clientToken, clientId: clientData.clientId,
    directFields: {
      "Emergency Contact Name":         name,
      "Emergency Contact Phone":        phone,
      "Emergency Contact Relationship": rel,
    },
  };

  try {
    const res = await fetch(WORKER_URL + '/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Server error');
    }
    clientData.emergencyName         = name;
    clientData.emergencyPhone        = phone;
    clientData.emergencyRelationship = rel;
    showView('view-contact-success');
  } catch (err) {
    document.getElementById('e-form-error').textContent = 'Error: ' + err.message;
    document.getElementById('e-form-error').classList.add('visible');
    btn.disabled = false; btn.classList.remove('loading');
  }
}

// ── SUBMIT: DOC ───────────────────────────────────────────────────────────────
async function submitDoc() {
  if (!selectedDocFile) {
    document.getElementById('docs-file-error').classList.add('visible');
    return;
  }
  document.getElementById('docs-file-error').classList.remove('visible');

  const btn = document.getElementById('docs-submit');
  btn.disabled = true; btn.classList.add('loading');
  document.getElementById('docs-upload-form-error').classList.remove('visible');

  let fileBase64, fileType;
  try {
    fileBase64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(selectedDocFile);
    });
    fileType = selectedDocFile.type || 'application/octet-stream';
  } catch {
    document.getElementById('docs-upload-form-error').textContent = 'Could not read the file. Please try again.';
    document.getElementById('docs-upload-form-error').classList.add('visible');
    btn.disabled = false; btn.classList.remove('loading');
    return;
  }

  try {
    const res = await fetch(WORKER_URL + '/compliance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: clientToken,
        clientId: clientData.clientId,
        petId: uploadContext.petId,
        documentType: uploadContext.docType,
        expirationDate: document.getElementById('docs-expiry').value || null,
        fileName: selectedDocFile.name,
        fileBase64, fileType,
      }),
    });
    if (!res.ok) throw new Error();

    // Optimistically update clientData so card refreshes immediately
    const pet = clientData.pets.find(p => p.id === uploadContext.petId);
    if (pet) {
      pet.docs = pet.docs || [];
      pet.docs.push({ type: uploadContext.docType, expired: false });
    }

    // Return to cards view with updated optimistic status
    showView('view-docs');
    buildDocCards();
    updateProgressUI(calcOnboardingSteps(clientData));

    // Re-fetch in background — merge carefully to preserve optimistic updates
    fetch(WORKER_URL + '/client?token=' + encodeURIComponent(clientToken))
      .then(r => r.ok ? r.json() : null)
      .then(fresh => {
        if (!fresh) return;
        // Merge: keep any optimistic docs that fresh data might not have yet
        if (fresh.pets && clientData.pets) {
          fresh.pets.forEach(freshPet => {
            const localPet = clientData.pets.find(p => p.id === freshPet.id);
            if (localPet) {
              // Add any local optimistic docs not yet in fresh data
              const freshTypes = (freshPet.docs || []).map(d => d.type);
              (localPet.docs || []).forEach(localDoc => {
                if (!freshTypes.includes(localDoc.type)) {
                  freshPet.docs = freshPet.docs || [];
                  freshPet.docs.push(localDoc);
                }
              });
            }
          });
        }
        clientData = fresh;
        buildDocCards();
        updateProgressUI(calcOnboardingSteps(clientData));
      })
      .catch(() => {});

  } catch {
    document.getElementById('docs-upload-form-error').textContent = 'Upload failed. Please try again or email the document directly.';
    document.getElementById('docs-upload-form-error').classList.add('visible');
    btn.disabled = false; btn.classList.remove('loading');
  }
}

// ── AGREEMENT ─────────────────────────────────────────────────────────────────
function toggleAgreeBtn() {
  document.getElementById('ag-submit').disabled =
    !document.getElementById('agree-check').checked;
}

async function submitAgreement() {
  const btn = document.getElementById('ag-submit');
  btn.disabled = true; btn.classList.add('loading');
  document.getElementById('ag-form-error').classList.remove('visible');

  try {
    const res = await fetch(WORKER_URL + '/agreement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: clientToken, clientId: clientData.clientId }),
    });
    if (!res.ok) throw new Error();
    clientData.agreementSigned = true;
    showView('view-contact-success');
  } catch {
    document.getElementById('ag-form-error').textContent = 'Something went wrong. Please try again.';
    document.getElementById('ag-form-error').classList.add('visible');
    btn.disabled = false; btn.classList.remove('loading');
  }
}

// ── BOOKING ───────────────────────────────────────────────────────────────────
function buildBookingPetPills() {
  const container = document.getElementById('booking-pet-pills');
  if (!container) return;
  container.innerHTML = '';
  (clientData.pets || []).forEach((pet, i) => {
    const inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.name = 'booking-pet';
    inp.value = pet.id;
    inp.id = 'bp-' + i;
    inp.className = 'booking-pet-check';
    const lbl = document.createElement('label');
    lbl.htmlFor = 'bp-' + i;
    lbl.textContent = pet.name;
    container.appendChild(inp);
    container.appendChild(lbl);
    if (clientData.pets.length === 1) inp.checked = true;
  });
}

async function submitBooking() {
  let valid = true;
  const selectedPets = Array.from(document.querySelectorAll('input[name="booking-pet"]:checked')).map(el => el.value);
  const startDate  = document.getElementById('booking-start-date').value;
  const startTime  = document.getElementById('booking-start-time').value;
  const endDate    = document.getElementById('booking-end-date').value;
  const endTime    = document.getElementById('booking-end-time').value;
  const transport  = document.querySelector('input[name="booking-transport"]:checked')?.value;
  const notes      = document.getElementById('booking-notes').value.trim();

  const showErr = (id, msg) => { const el = document.getElementById(id); el.textContent = msg; el.classList.add('visible'); valid = false; };
  const hideErr = id => document.getElementById(id).classList.remove('visible');

  if (!selectedPets.length) showErr('booking-pet-error', 'Please select at least one pet.'); else hideErr('booking-pet-error');
  if (!startDate) showErr('booking-start-date-error', 'Please select a drop-off date.'); else hideErr('booking-start-date-error');
  if (!startTime) showErr('booking-start-time-error', 'Please select a drop-off time.'); else hideErr('booking-start-time-error');
  if (!endDate)   showErr('booking-end-date-error',   'Please select a pick-up date.');  else hideErr('booking-end-date-error');
  if (!endTime)   showErr('booking-end-time-error',   'Please select a pick-up time.');  else hideErr('booking-end-time-error');
  if (!transport) showErr('booking-transport-error',  'Please select a transport option.'); else hideErr('booking-transport-error');

  if (startDate && endDate && endDate < startDate) {
    showErr('booking-end-date-error', 'Pick-up date must be after drop-off date.');
  }
  if (!valid) return;

  const btn = document.getElementById('booking-submit');
  btn.disabled = true; btn.classList.add('loading');
  document.getElementById('booking-form-error').classList.remove('visible');

  try {
    const res = await fetch(WORKER_URL + '/booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: clientToken,
        clientId: clientData.clientId,
        petIds: selectedPets,
        startDate, startTime, endDate, endTime,
        transport, notes,
      }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || ('HTTP ' + res.status));
    }

    // Store booking details for summary
    const selectedPetNames = Array.from(document.querySelectorAll('input[name="booking-pet"]:checked'))
      .map(el => el.closest('.pet-pills')?.querySelector('label[for="' + el.id + '"]')?.textContent || el.value);
    lastBooking = { startDate, startTime, endDate, endTime, transport, pets: selectedPetNames };

    // Populate summary
    const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
    const summary = document.getElementById('booking-summary');
    if (summary) {
      summary.innerHTML =
        '<strong>🐾 ' + (lastBooking.pets.join(', ') || 'Your pet') + '</strong><br>' +
        '📅 Drop-off: ' + fmt(startDate) + ' · ' + startTime + '<br>' +
        '📅 Pick-up: '  + fmt(endDate)   + ' · ' + endTime   + '<br>' +
        '🚗 Transport: ' + transport + '<br>' +
        '💰 Pricing starts at $85/night — final total confirmed within 24 hrs';
    }

    // Refresh client data in background
    fetch(WORKER_URL + '/client?token=' + encodeURIComponent(clientToken))
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) clientData = d; })
      .catch(() => {});

    showView('view-booking-success');
  } catch (err) {
    document.getElementById('booking-form-error').textContent = 'Something went wrong: ' + err.message;
    document.getElementById('booking-form-error').classList.add('visible');
    btn.disabled = false; btn.classList.remove('loading');
  }
}

function bookAnother() {
  // Reset booking form
  document.querySelectorAll('input[name="booking-pet"]').forEach(el => {
    if (clientData.pets?.length === 1) el.checked = true;
    else el.checked = false;
  });
  document.getElementById('booking-start-date').value = '';
  document.getElementById('booking-start-time').value = '';
  document.getElementById('booking-end-date').value   = '';
  document.getElementById('booking-end-time').value   = '';
  document.querySelectorAll('input[name="booking-transport"]').forEach(el => el.checked = false);
  document.getElementById('booking-notes').value = '';
  document.getElementById('booking-form-error').classList.remove('visible');
  const btn = document.getElementById('booking-submit');
  btn.disabled = false; btn.classList.remove('loading');
  showView('view-booking');
}

init();
</script>

</body>
</html>`;

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default {
  async fetch(req, env) {
    const url    = new URL(req.url);
    const path   = url.pathname;
    const method = req.method;

    if (method === "OPTIONS") {
      return new Response(null, { headers: cors() });
    }

    if ((path === "/" || path === "") && method === "GET") {
      return new Response(HTML, {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    if (path === "/client"     && method === "GET")  return handleGetClient(req, env);
    if (path === "/profile"    && method === "POST") return handlePostProfile(req, env);
    if (path === "/agreement"  && method === "POST") return handlePostAgreement(req, env);
    if (path === "/compliance" && method === "POST") return handlePostCompliance(req, env);
    if (path === "/booking"    && method === "POST") return handlePostBooking(req, env);

    return errRes("Not found", 404);
  },
};