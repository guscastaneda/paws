import { errRes, jsonRes, atFetch } from "./helpers.js";
import {
  COMPLIANCE_TABLE, PETS_TABLE, CLIENTS_TABLE, FIELDS,
} from "./constants.js";

// ── COMPLIANCE EXPIRY REMINDERS ───────────────────────────────────────────────
// Daily job (cron) that finds compliance documents approaching expiry and emails
// the affected clients, plus an owner digest. State is tracked on each document
// (Last Reminder Stage / Last Reminder Sent) so each milestone fires exactly once
// even though the job runs daily.
//
// Cadence:
//   Rabies / Vaccination  → 30 days before, 7 days before, and once on/after expiry
//   Town License          → a single nudge during December (Sharon calendar-year rule)
//   Spay/Neuter, Other    → never (no expiry-based reminders)
//
// STAGE 1 (this file): DRY RUN ONLY. Computes the plan and returns it as JSON.
// It does NOT send any email and does NOT write any stage. This lets us verify the
// targeting logic against real data before a single client email can go out.

const REMIND_TYPES = {
  "Rabies Certificate": "expiry",
  "Vaccination Record": "expiry",
  "Town License":       "december",
};

// Field IDs for the two reminder-state fields (verified in Airtable).
const F_LAST_STAGE = "fldGubOu7Seqe6Ppj"; // Last Reminder Stage (singleSelect)
const F_LAST_SENT  = "fldFCuGyyZNLRk3BK"; // Last Reminder Sent (date)

// Stage option names — must match the single-select options exactly.
const STAGE_30  = "30-day";
const STAGE_7   = "7-day";
const STAGE_EXP = "Expired";
const STAGE_DEC = "December nudge";

// ── Airtable paging helper ────────────────────────────────────────────────────
async function fetchAll(env, table, params = "") {
  const out = [];
  let offset = "";
  let pages = 0;
  do {
    if (++pages > 12) break; // safety stop: 12 pages = 1200 records, far beyond our data
    const qs = new URLSearchParams(params);
    qs.set("pageSize", "100");
    if (offset) qs.set("offset", offset);
    const res = await atFetch(env, `/${table}?${qs.toString()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Airtable read failed (${table}): ${JSON.stringify(err)}`);
    }
    const data = await res.json();
    out.push(...(data.records || []));
    offset = data.offset || "";
  } while (offset);
  return out;
}

// Build a lookup of pets and clients so we can resolve each document → pet → client.
async function loadContext(env) {
  const pets    = await fetchAll(env, PETS_TABLE);
  const clients = await fetchAll(env, CLIENTS_TABLE);

  const petById = {};
  for (const p of pets) {
    const f = p.fields || {};
    petById[p.id] = {
      id: p.id,
      name: f["Pet Name"] || "(unnamed)",
      active: f["Active"] === true,
      deceased: f["Deceased"] === true,
      clientIds: (f["Clients"] || []).map(c => (typeof c === "object" ? c.id : c)),
    };
  }

  const clientById = {};
  for (const c of clients) {
    const f = c.fields || {};
    clientById[c.id] = {
      id: c.id,
      name: f["Client Name"] || "(unnamed)",
      email: f["Email Address"] || "",
      active: f["Active"] === true,
      token: f["Client Token"] || "",
    };
  }

  return { petById, clientById };
}

// Decide what (if anything) to send for a single document. Returns a plan object
// or null. Pure function of the document's current state + today's date.
function planForDoc(doc, ctx, today) {
  const f = doc.fields || {};
  const type = (typeof f["Document Type"] === "object" ? f["Document Type"]?.name : f["Document Type"]) || "";
  const mode = REMIND_TYPES[type];
  if (!mode) return null; // Spay/Neuter, Other, etc. — never remind

  // Only remind on documents the owner has reviewed and accepted. A "Received" or
  // "Reviewed" doc isn't verified yet; "Rejected" is invalid. Reminding on those
  // would be wrong (and conveniently excludes unverified test/junk uploads).
  const subStatus = (typeof f["Submission Status"] === "object" ? f["Submission Status"]?.name : f["Submission Status"]) || "";
  if (subStatus !== "Accepted") return null;

  // Resolve pet. Skip with a specific, status-like reason for each case.
  const petLink = f["Pet"] || [];
  const petId = petLink.length ? (typeof petLink[0] === "object" ? petLink[0].id : petLink[0]) : null;
  const pet = petId ? ctx.petById[petId] : null;
  if (!pet)          return { skip: true, reason: "doc not linked to a pet", docId: doc.id };
  if (pet.deceased)  return { skip: true, reason: "pet is deceased", docId: doc.id, pet: pet.name };
  if (!pet.active)   return { skip: true, reason: "pet is inactive", docId: doc.id, pet: pet.name };

  // Resolve client. In this business, onboarding happens via a texted magic link
  // and email is captured during onboarding — so "no active client with email"
  // means the client simply hasn't onboarded yet. That's expected, not an error:
  // reminders should only ever go to onboarded clients.
  const client = pet.clientIds.map(id => ctx.clientById[id]).find(c => c && c.active && c.email);
  if (!client) {
    const linked = pet.clientIds.map(id => ctx.clientById[id]).filter(Boolean);
    const hasActive = linked.some(c => c.active);
    const reason = !linked.length
      ? "pet not linked to a client"
      : !hasActive
        ? "client is inactive"
        : "client not yet onboarded (no email on file)";
    return { skip: true, reason, docId: doc.id, pet: pet.name };
  }

  const stage = (typeof f[ "Last Reminder Stage"] === "object" ? f["Last Reminder Stage"]?.name : f["Last Reminder Stage"]) || "";
  const expiryStr = f["Expiration Date"] || "";

  const base = {
    docId: doc.id,
    type,
    petName: pet.name,
    clientName: client.name,
    clientEmail: client.email,
    clientToken: client.token,
    expiry: expiryStr,
    currentStage: stage,
  };

  if (mode === "december") {
    // Town license: one nudge during December to renew for the coming year.
    if (today.getMonth() === 11 && stage !== STAGE_DEC) {
      return { ...base, newStage: STAGE_DEC, milestone: STAGE_DEC };
    }
    return null;
  }

  // expiry mode (Rabies / Vaccination)
  if (!expiryStr) return null;
  const expiry = new Date(expiryStr + "T12:00:00");
  if (isNaN(expiry)) return null;
  const days = Math.round((expiry - today) / 86400000);

  if (days <= 0 && stage !== STAGE_EXP) {
    return { ...base, daysUntil: days, newStage: STAGE_EXP, milestone: STAGE_EXP };
  }
  if (days > 0 && days <= 7 && stage !== STAGE_7 && stage !== STAGE_EXP) {
    return { ...base, daysUntil: days, newStage: STAGE_7, milestone: STAGE_7 };
  }
  if (days > 7 && days <= 30 && stage !== STAGE_30 && stage !== STAGE_7 && stage !== STAGE_EXP) {
    return { ...base, daysUntil: days, newStage: STAGE_30, milestone: STAGE_30 };
  }
  return null;
}

// Compute the full plan: which documents would trigger which reminders today.
async function computePlan(env, today) {
  const ctx  = await loadContext(env);
  const docs = await fetchAll(env, COMPLIANCE_TABLE);

  const toSend = [];
  const skipped = [];
  for (const doc of docs) {
    const plan = planForDoc(doc, ctx, today);
    if (!plan) continue;
    if (plan.skip) { skipped.push(plan); continue; }
    toSend.push(plan);
  }
  return { toSend, skipped, scanned: docs.length };
}

// ── POST/GET /run-reminders ───────────────────────────────────────────────────
// Protected manual trigger. STAGE 1: dry run only — returns the plan, sends nothing.
async function handleRunReminders(req, env) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key") || "";
  if (!env.REMINDER_KEY || key !== env.REMINDER_KEY) {
    return errRes("Unauthorized", 401);
  }

  // Allow ?date=YYYY-MM-DD to simulate a given day for testing the windows.
  const dateParam = url.searchParams.get("date");
  const today = dateParam ? new Date(dateParam + "T12:00:00") : new Date();
  if (isNaN(today)) return errRes("Invalid date param", 400);

  try {
    const { toSend, skipped, scanned } = await computePlan(env, today);

    // Tally skips by reason so categories read as status at a glance, rather
    // than a flat list. e.g. { "client not yet onboarded ...": 11, "pet is deceased": 1 }
    const skipTally = {};
    for (const s of skipped) skipTally[s.reason] = (skipTally[s.reason] || 0) + 1;

    return jsonRes({
      mode: "DRY_RUN",
      note: "No emails sent and no stages written. This is a preview of what the live job would do.",
      asOf: today.toISOString().slice(0, 10),
      scanned,
      wouldSend: toSend.length,
      reminders: toSend.map(p => ({
        milestone: p.milestone,
        type: p.type,
        pet: p.petName,
        client: p.clientName,
        email: p.clientEmail,
        expiry: p.expiry,
        daysUntil: p.daysUntil,
        stageChange: (p.currentStage || "(none)") + " → " + p.newStage,
      })),
      skippedCount: skipped.length,
      skippedByReason: skipTally,
      skipped: skipped.slice(0, 50),
    });
  } catch (err) {
    return errRes("Reminder dry-run failed: " + err.message, 500);
  }
}

export { handleRunReminders, computePlan };