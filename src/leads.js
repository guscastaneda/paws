import { errRes, jsonRes, atFetch } from "./helpers.js";

// ── NEW-CLIENT LEAD INTAKE ────────────────────────────────────────────────────
// Public, token-less endpoint for prospects requesting a meet & greet. Writes a
// record to the Leads table (Status = Requested, Lead Source = Portal form),
// then emails the owner (hello@) and a confirmation to the prospect.
//
// Light capture now, deep capture at conversion: this collects only what's needed
// for a useful first conversation. Full onboarding happens after the prospect
// becomes a real client with a token.

const LEADS_TABLE = "tbljFUzGv9rAQdGIt";

// Field IDs (Leads table).
const F = {
  LEAD_NAME:    "fldeRLG6gxkaBtkoJ",
  SUBMITTED_AT: "fldAz4C1teoPuXCQ9",
  STATUS:       "fld9qmOwIyNMLIOYi",
  LEAD_SOURCE:  "fldUcgk1Df2jc59XQ",
  OWNER_NAME:   "fldiVVEpLq0zvkk89",
  PHONE:        "fld5HN7N42mypsKLh",
  EMAIL:        "fldi5CSPm4hVDBSHo",
  DOG_NAME:     "fldfK1Cmut461q8BD",
  DOG_GENDER:   "fldmFRgir51Z658Qb",
  BREED:        "flddX4ciNCWinlreX",
  DOG_AGE:      "fldknDqRphZ77lffc",
  ALTERED:      "fldNzH22OCEDU3MeJ",
  SERVICES:     "fldQTHbThDwHBY2fT",
  MG_FORMAT:    "fldZ0WbbWQoLwiIDJ",
  DOG_SOCIAL:   "fldw9ldgfp1UUuy3r",
  HOUSE_TRAINED:"fldkmqKPQLS8tPJyA",
  AGGRESSION:   "fldCDxOFBg7kkU5il",
  AGG_DETAILS:  "fldtJFgsmxnL1xQfe",
  PRIOR_CARE:   "fldHxVbSmKiyiNwR7",
  NOTES:        "fldOxBKHN81MAEylZ",
};

// Allowed single/multi-select values, so a malformed payload can't silently fail
// an Airtable write (single-select rejects unknown options).
const GENDERS   = ["Male", "Female"];
const ALTERED_V = ["Yes", "No", "Not sure"];
const SERVICES_V = ["Boarding", "Daycare", "Half-Day Daycare", "House Sitting", "Drop-In Visits", "Group Walks", "Pet Taxi", "Not sure yet"];
const MG_FORMAT_V = ["Zoom", "In-person", "No preference"];
const SOCIAL_V  = ["Loves them", "Selective", "Nervous", "Not socialized yet", "Not sure"];
const HOUSE_V   = ["Yes", "Mostly", "No", "Not sure"];
const AGG_V     = ["No", "Yes"];
const PRIOR_V   = ["Yes regularly", "A little", "Never"];

const clean = v => (typeof v === "string" ? v.trim() : "");
const pick  = (v, allowed) => (allowed.includes(v) ? v : "");

async function sendEmail(env, { to, replyTo, subject, html }) {
  if (!env.RESEND_API_KEY) return { ok: false };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Paws on Longmeadow <bookings@pawsonlongmeadow.com>", to, reply_to: replyTo, subject, html }),
    });
    return { ok: res.ok };
  } catch (e) {
    console.error("Lead email error:", e);
    return { ok: false };
  }
}

function emailShell(body) {
  return `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:2rem;color:#2c1f14;background:#fdfcfb;">
    <div style="text-align:center;margin-bottom:2rem;">
      <div style="font-size:1.5rem;letter-spacing:0.15em;font-weight:600;color:#2D5A27;text-transform:uppercase;">Paws on Longmeadow</div>
      <div style="font-size:0.8rem;color:#7a6a5a;margin-top:0.25rem;">Sharon, Massachusetts</div>
    </div>
    ${body}
    <div style="border-top:1px solid #e8e0d8;margin-top:2.5rem;padding-top:1rem;text-align:center;font-size:0.8rem;color:#7a6a5a;">
      © Paws on Longmeadow · Sharon, MA
    </div>
  </div>`;
}

function summaryTable(rows) {
  return `<div style="background:#f5f0eb;border-radius:12px;padding:1.25rem 1.5rem;margin:1.25rem 0;">
    <table style="width:100%;font-size:0.88rem;line-height:1.9;border-collapse:collapse;">
      ${rows.filter(([, v]) => v).map(([label, value]) => `<tr><td style="color:#7a6a5a;width:150px;vertical-align:top;">${label}</td><td style="font-weight:500;color:#2c1f14;">${value}</td></tr>`).join("")}
    </table>
  </div>`;
}

// ── POST /lead ────────────────────────────────────────────────────────────────
async function handlePostLead(req, env) {
  let body;
  try { body = await req.json(); } catch { return errRes("Invalid JSON"); }

  const ownerName = clean(body.ownerName);
  const phone     = clean(body.phone);
  const email     = clean(body.email);
  const dogName   = clean(body.dogName);

  // Minimum viable lead: who you are, how to reach you, and the dog's name.
  if (!ownerName || !dogName) return errRes("Please tell us your name and your dog's name.");
  if (!phone && !email)       return errRes("Please give us a phone number or email so we can reach you.");

  const services = Array.isArray(body.services)
    ? body.services.filter(s => SERVICES_V.includes(s))
    : [];

  const fields = {
    [F.LEAD_NAME]:    `${ownerName} — ${dogName}`,
    [F.SUBMITTED_AT]: new Date().toISOString(),
    [F.STATUS]:       "Requested",
    [F.LEAD_SOURCE]:  "Portal form",
    [F.OWNER_NAME]:   ownerName,
    [F.DOG_NAME]:     dogName,
  };
  if (phone) fields[F.PHONE] = phone;
  if (email) fields[F.EMAIL] = email;

  const gender   = pick(body.dogGender, GENDERS);          if (gender)   fields[F.DOG_GENDER] = gender;
  const breed    = clean(body.breed);                      if (breed)    fields[F.BREED] = breed;
  const dogAge   = clean(body.dogAge);                     if (dogAge)   fields[F.DOG_AGE] = dogAge;
  const altered  = pick(body.spayedNeutered, ALTERED_V);   if (altered)  fields[F.ALTERED] = altered;
  if (services.length)                                     fields[F.SERVICES] = services;
  const mgFormat = pick(body.mgFormat, MG_FORMAT_V);       if (mgFormat) fields[F.MG_FORMAT] = mgFormat;
  const social   = pick(body.dogSocial, SOCIAL_V);         if (social)   fields[F.DOG_SOCIAL] = social;
  const house    = pick(body.houseTrained, HOUSE_V);       if (house)    fields[F.HOUSE_TRAINED] = house;
  const agg      = pick(body.aggression, AGG_V);           if (agg)      fields[F.AGGRESSION] = agg;
  const aggNotes = clean(body.aggressionDetails);          if (aggNotes) fields[F.AGG_DETAILS] = aggNotes;
  const prior    = pick(body.priorCare, PRIOR_V);          if (prior)    fields[F.PRIOR_CARE] = prior;
  const notes    = clean(body.notes);                      if (notes)    fields[F.NOTES] = notes;

  // Write the lead.
  const res = await atFetch(env, `/${LEADS_TABLE}`, {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return errRes("Could not save your request: " + JSON.stringify(err), 502);
  }

  // Build the summary shared by both emails.
  const summaryRows = [
    ["Owner", ownerName],
    ["Phone", phone],
    ["Email", email],
    ["Dog", [dogName, gender, breed].filter(Boolean).join(" · ")],
    ["Age", dogAge],
    ["Spayed/Neutered", altered],
    ["Interested in", services.join(", ")],
    ["Meet & greet", mgFormat],
    ["Around other dogs", social],
    ["House-trained", house],
    ["Aggression/bite history", agg === "Yes" ? `Yes${aggNotes ? " — " + aggNotes : ""}` : agg],
    ["Prior daycare/boarding", prior],
    ["Notes", notes],
  ];

  // Owner notification.
  await sendEmail(env, {
    to: ["hello@pawsonlongmeadow.com"],
    subject: `New meet & greet request — ${ownerName} (${dogName})`,
    html: emailShell(`
      <h2 style="font-size:1.3rem;font-weight:600;color:#2D5A27;margin-bottom:0.25rem;">New meet &amp; greet request</h2>
      <p style="color:#7a6a5a;font-size:0.88rem;">A prospective client requested a meet &amp; greet through the portal.</p>
      ${summaryTable(summaryRows)}
      <p style="font-size:0.88rem;color:#7a6a5a;">Review and follow up from the Leads table in Airtable.</p>
    `),
  });

  // Prospect confirmation (only if they gave an email).
  if (email) {
    const first = ownerName.split(" ")[0];
    await sendEmail(env, {
      to: [email],
      replyTo: "hello@pawsonlongmeadow.com",
      subject: `Thanks ${first} — we got your meet & greet request`,
      html: emailShell(`
        <h2 style="font-size:1.3rem;font-weight:600;color:#2D5A27;margin-bottom:0.25rem;">Request received!</h2>
        <p style="font-size:0.95rem;color:#2c1f14;line-height:1.7;">Hi ${first}, thank you for reaching out about ${dogName}. We received your meet &amp; greet request and will be in touch soon to set up a time.</p>
        <p style="font-size:0.95rem;color:#2c1f14;line-height:1.7;">The meet &amp; greet is a chance for us to talk through ${dogName}'s needs and whether our home environment is the right fit. If it feels like a good match, the next step is a half-day trial visit before any ongoing care begins.</p>
        ${summaryTable([
          ["Dog", [dogName, gender, breed].filter(Boolean).join(" · ")],
          ["Interested in", services.join(", ")],
          ["Meet & greet", mgFormat],
        ])}
        <p style="font-size:0.95rem;color:#2c1f14;line-height:1.7;">If anything above looks off, just reply to this email and let us know.</p>
        <p style="font-size:0.95rem;color:#2c1f14;line-height:1.7;margin-top:1.5rem;">— Gus &amp; Marian<br><span style="color:#7a6a5a;">Paws on Longmeadow</span></p>
      `),
    });
  }

  return jsonRes({ success: true }, 201);
}

export { handlePostLead };
