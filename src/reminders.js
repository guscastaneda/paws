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
// STAGE 2: real sending, behind an explicit flag. By default this endpoint is
// still a DRY RUN — it computes the plan and returns it as JSON, sending nothing
// and writing nothing. Real emails + stage write-back happen only when the
// request includes &send=true. That keeps the bare URL a permanent safe preview
// (including for the cron, which can pass send=true while you keep the plain URL
// as your "what would it do right now" check).
//
// On a real run, for each due document:
//   1. email the client their milestone reminder (from bookings@, reply-to hello@)
//   2. only if that send resolves, write Last Reminder Stage + Last Reminder Sent
//      back to the doc (so a failed send retries next run instead of being lost)
// Then one owner digest summarising the run is sent last, to hello@.

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

// ── Email layer (mirrors src/booking.js exactly) ──────────────────────────────
async function sendEmail(env, { to, replyTo, subject, html }) {
  if (!env.RESEND_API_KEY) return { ok: false, skipped: "no RESEND_API_KEY" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Paws on Longmeadow <bookings@pawsonlongmeadow.com>",
        to, reply_to: replyTo, subject, html,
      }),
    });
    return { ok: res.ok };
  } catch (e) {
    console.error("Email error:", e);
    return { ok: false, error: String(e) };
  }
}

function emailWrapper(body, clientToken) {
  const portalUrl = clientToken
    ? `https://client.pawsonlongmeadow.com/?client=${clientToken}`
    : `https://client.pawsonlongmeadow.com`;
  return `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:2rem;color:#2c1f14;background:#fdfcfb;">
    <div style="text-align:center;margin-bottom:2rem;">
      <div style="font-size:1.5rem;letter-spacing:0.15em;font-weight:600;color:#2D5A27;text-transform:uppercase;">Paws on Longmeadow</div>
      <div style="font-size:0.8rem;color:#7a6a5a;margin-top:0.25rem;">Sharon, Massachusetts</div>
    </div>
    ${body}
    <div style="border-top:1px solid #e8e0d8;margin-top:2.5rem;padding-top:1rem;text-align:center;font-size:0.8rem;color:#7a6a5a;">
      © Paws on Longmeadow · Sharon, MA · <a href="${portalUrl}" style="color:#2D5A27;">Client Portal</a>
    </div>
  </div>`;
}

// Owner-facing wrapper for the internal digest. Identical masthead/styling to
// emailWrapper, but the footer links to the Airtable "Reminder Worklist" view
// (where the owner actually reviews and acts on compliance docs) rather than the
// client portal, which is meaningless for an internal ops email.
const OWNER_WORKLIST_URL = "https://airtable.com/appvQb876VInNJlnB/tblRuPAAVBeMjeWSa/viwvGCkaRIZOQEG2g";

function ownerWrapper(body) {
  return `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:2rem;color:#2c1f14;background:#fdfcfb;">
    <div style="text-align:center;margin-bottom:2rem;">
      <div style="font-size:1.5rem;letter-spacing:0.15em;font-weight:600;color:#2D5A27;text-transform:uppercase;">Paws on Longmeadow</div>
      <div style="font-size:0.8rem;color:#7a6a5a;margin-top:0.25rem;">Sharon, Massachusetts</div>
    </div>
    ${body}
    <div style="border-top:1px solid #e8e0d8;margin-top:2.5rem;padding-top:1rem;text-align:center;font-size:0.8rem;color:#7a6a5a;">
      © Paws on Longmeadow · Sharon, MA · <a href="${OWNER_WORKLIST_URL}" style="color:#2D5A27;">Open Reminder Worklist</a>
    </div>
  </div>`;
}

function summaryTable(rows) {
  return `<div style="background:#f5f0eb;border-radius:12px;padding:1.25rem 1.5rem;margin:1.25rem 0;">
    <table style="width:100%;font-size:0.88rem;line-height:1.9;border-collapse:collapse;">
      ${rows.map(([label, value]) => `<tr><td style="color:#7a6a5a;width:130px;vertical-align:top;">${label}</td><td style="font-weight:500;color:#2c1f14;">${value}</td></tr>`).join('')}
    </table>
  </div>`;
}

function fmtDate(d) {
  return d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "";
}

// A friendly label for the document type in client-facing copy.
const DOC_LABEL = {
  "Rabies Certificate": "rabies certificate",
  "Vaccination Record": "vaccination record",
  "Town License":       "town dog license",
};

// Build the client-facing email (subject + body) for a given reminder plan.
function buildClientEmail(plan) {
  const first   = (plan.clientName || "there").split(" ")[0];
  const pet     = plan.petName;
  const docLabel = DOC_LABEL[plan.type] || "document";
  const expiryNice = fmtDate(plan.expiry);

  const rows = [
    ["Pet", pet],
    ["Document", plan.type],
    ["Expires", expiryNice],
  ];

  let subject, lead, body;

  if (plan.milestone === STAGE_30) {
    subject = `${pet}'s ${docLabel} expires next month`;
    lead = `Hi ${first}, a friendly heads-up: ${pet}'s ${docLabel} is set to expire on ${expiryNice}. Whenever you have the updated paperwork from your vet, you can upload it through your portal and we'll take care of the rest.`;
    body = `There's no rush today, we just like to give plenty of notice so it's one less thing to think about.`;
  } else if (plan.milestone === STAGE_7) {
    subject = `Reminder: ${pet}'s ${docLabel} expires this week`;
    lead = `Hi ${first}, just a reminder that ${pet}'s ${docLabel} expires on ${expiryNice}. If you have the updated document, please upload it through your portal when you get a chance.`;
    body = `Keeping this current means there's never any hold-up at drop-off. If it's already renewed, you can send over the new copy any time.`;
  } else if (plan.milestone === STAGE_EXP) {
    subject = `${pet}'s ${docLabel} is now expired`;
    lead = `Hi ${first}, our records show ${pet}'s ${docLabel} expired on ${expiryNice}. Massachusetts requires us to keep a current rabies and vaccination record on file for every dog in our care, so we'll need the updated paperwork before ${pet}'s next visit.`;
    body = `As soon as you have it, upload it through your portal and you're all set. If you think this is out of date on our end, just reply and let us know.`;
  } else if (plan.milestone === STAGE_DEC) {
    const nextYear = new Date().getFullYear() + 1;
    subject = `Time to renew ${pet}'s town dog license`;
    lead = `Hi ${first}, a quick seasonal reminder: town dog licenses in Massachusetts renew each calendar year. When you pick up ${pet}'s ${nextYear} license from the town, please upload a copy through your portal so we have the current one on file.`;
    body = `Most towns make this easy to do online. Thanks for keeping ${pet}'s paperwork up to date.`;
    rows.pop(); // drop the "Expires" row for the December nudge — it's a renewal, not an expiry
    rows.push(["License year", `${nextYear}`]);
  }

  const html = emailWrapper(`
    <h2 style="font-size:1.3rem;font-weight:600;color:#2D5A27;margin-bottom:0.25rem;">A quick note about ${pet}'s records</h2>
    <p style="font-size:0.95rem;color:#2c1f14;line-height:1.7;">${lead}</p>
    ${summaryTable(rows)}
    <p style="font-size:0.95rem;color:#2c1f14;line-height:1.7;">${body}</p>
    <p style="font-size:0.95rem;color:#2c1f14;line-height:1.7;margin-top:1.5rem;">— Gus &amp; Marian<br><span style="color:#7a6a5a;">Paws on Longmeadow</span></p>
  `, plan.clientToken);

  return { subject, html };
}

// Write the advanced stage + today's date back to a document. Only called after
// a successful client send, so a milestone is recorded exactly once.
async function writeStage(env, docId, newStage, today) {
  const res = await atFetch(env, `/${COMPLIANCE_TABLE}/${docId}`, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        [F_LAST_STAGE]: newStage,
        [F_LAST_SENT]:  today.toISOString().slice(0, 10),
      },
      typecast: true,
    }),
  });
  return res.ok;
}

// Execute the plan for real: send each client email, write stage on success,
// then send one owner digest. Returns a per-document result list.
async function executePlan(env, plan, today) {
  const { toSend, skipped, scanned } = plan;
  const results = [];

  for (const r of toSend) {
    const { subject, html } = buildClientEmail(r);
    const sendRes = await sendEmail(env, {
      to: [r.clientEmail],
      replyTo: "hello@pawsonlongmeadow.com",
      subject,
      html,
    });

    let stageWritten = false;
    if (sendRes.ok) {
      stageWritten = await writeStage(env, r.docId, r.newStage, today);
    }

    results.push({
      milestone: r.milestone,
      type: r.type,
      pet: r.petName,
      client: r.clientName,
      email: r.clientEmail,
      expiry: r.expiry,
      daysUntil: r.daysUntil,
      stageChange: (r.currentStage || "(none)") + " → " + r.newStage,
      emailSent: !!sendRes.ok,
      stageWritten,
      error: sendRes.ok ? undefined : (sendRes.error || sendRes.skipped || "send failed"),
    });
  }

  // Owner digest — one email summarising the whole run.
  await sendOwnerDigest(env, results, skipped, scanned, today);

  return results;
}

// Single owner digest to hello@: what went out, and anything that failed.
async function sendOwnerDigest(env, results, skipped, scanned, today) {
  const sent   = results.filter(r => r.emailSent);
  const failed = results.filter(r => !r.emailSent);
  const dateNice = fmtDate(today.toISOString().slice(0, 10));

  const sentRows = sent.length
    ? sent.map(r => [
        `${r.pet} · ${r.milestone}`,
        `${r.client} — ${r.type}${r.expiry ? ", expires " + r.expiry : ""}${r.stageWritten ? "" : " (⚠ stage not written)"}`,
      ])
    : [["—", "No reminders were due today."]];

  let body = `
    <h2 style="font-size:1.3rem;font-weight:600;color:#2D5A27;margin-bottom:0.25rem;">Compliance reminders sent</h2>
    <p style="color:#7a6a5a;font-size:0.88rem;">${dateNice} · scanned ${scanned} documents · ${sent.length} reminder${sent.length === 1 ? "" : "s"} sent</p>
    ${summaryTable(sentRows)}
  `;

  if (failed.length) {
    body += `
      <p style="font-size:0.9rem;color:#9a3b2c;font-weight:600;margin-top:1rem;">${failed.length} reminder${failed.length === 1 ? "" : "s"} failed to send (will retry next run):</p>
      ${summaryTable(failed.map(r => [`${r.pet} · ${r.milestone}`, `${r.client} — ${r.error || "unknown error"}`]))}
    `;
  }

  body += `<p style="font-size:0.82rem;color:#7a6a5a;line-height:1.7;margin-top:1rem;">${skipped.length} document${skipped.length === 1 ? "" : "s"} skipped (not yet onboarded, deceased, not accepted, etc.). This is normal.</p>`;

  await sendEmail(env, {
    to: ["hello@pawsonlongmeadow.com"],
    subject: `Compliance reminders — ${sent.length} sent${failed.length ? `, ${failed.length} failed` : ""}`,
    html: ownerWrapper(body),
  });
}

// ── POST/GET /run-reminders ───────────────────────────────────────────────────
// Protected manual trigger.
//   ?key=SECRET                  → dry run (default): preview JSON, sends nothing
//   ?key=SECRET&send=true        → REAL run: emails clients, writes stages, digests
//   &date=YYYY-MM-DD             → simulate a given day (works in both modes)
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

  const doSend = url.searchParams.get("send") === "true";

  try {
    const plan = await computePlan(env, today);
    const { toSend, skipped, scanned } = plan;

    // Tally skips by reason so categories read as status at a glance.
    const skipTally = {};
    for (const s of skipped) skipTally[s.reason] = (skipTally[s.reason] || 0) + 1;

    if (doSend) {
      const results = await executePlan(env, plan, today);
      return jsonRes({
        mode: "LIVE",
        note: "Emails sent and stages written for any successful sends. An owner digest was sent to hello@.",
        asOf: today.toISOString().slice(0, 10),
        scanned,
        sent: results.filter(r => r.emailSent).length,
        failed: results.filter(r => !r.emailSent).length,
        results,
        skippedCount: skipped.length,
        skippedByReason: skipTally,
      });
    }

    return jsonRes({
      mode: "DRY_RUN",
      note: "No emails sent and no stages written. Add &send=true to actually send. This is a preview of what the live job would do.",
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
    return errRes("Reminder run failed: " + err.message, 500);
  }
}

export { handleRunReminders, computePlan };