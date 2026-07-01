# CLAUDE.md — Paws on Longmeadow

Persistent project context for Claude Code. Read this first every session.

---

## What this project is
**Paws on Longmeadow, LLC** — a home-based dog boarding and daycare business in Sharon,
Massachusetts, 10-dog capacity. Owner: **Gus Castaneda**; co-owner **Marian** (handles
greetings, departures, walks, transport, photography). Gus left a creative project-manager
career to run this full-time. Licensed commercial kennel, compliant with Massachusetts
Ollie's Law, holds a Special Use Permit from the Town of Sharon Zoning Board of Appeals.
Pre / early launch.

This repo is a **client portal + business automation layer**: a Cloudflare Worker API,
an Airtable database, a Vite frontend, transactional email, a compliance-reminder cron,
and an Airtable-based pricing engine.

---

## Working preferences (IMPORTANT — follow these every time)
- **No em dashes** anywhere in copy or UI. Use commas, sentence breaks, or removal. (Flagged as
  an AI writing tic.)
- **No emojis in the UI.** (Emojis DO appear in some internal Airtable/pricing script strings,
  but not in client-facing portal UI.)
- Warm, plain, non-overselling voice. Gus has strong editorial instincts and pushes back on
  unnatural or salesy language. Match that.
- **Approve before writes.** Get explicit approval before any Airtable data write, especially
  financial records. Explain decisions before implementing.
- Provide **`git commit` commands/messages** after every round of changes without being asked.
  Do NOT include a `Co-Authored-By` trailer. Include `git push` in the same command block so
  Gus can commit + push together; he runs git himself (don't run commit or push for him).
- Test on **real iPhone + desktop**. Gus catches UX issues by direct testing.
- Prefers precise, targeted in-place edits. (This project now runs in Claude Code, which edits
  the real repo directly, so in-place edits are the norm. The old paste-files-back-and-forth
  workflow described in some handoff docs is obsolete.)
- **Validate before handing off:** `node --check` on JS. For template-heavy HTML, ALSO run a
  Python tag-balance / div-depth walk — `node --check` does NOT catch nested-template collapse
  or HTML div imbalance inside template strings.
- Debug pattern: `npx wrangler tail winter-river-a9da`; use the `workers.dev` URL to bypass
  caching while troubleshooting.
- **Privacy:** keep the home/street address OFF all public-facing content. Use neighborhood-level
  references ("Sharon, Massachusetts"). This matters most on the (future) public website.

---

## Tech stack
- **Cloudflare Worker** `winter-river-a9da` — API + serves the built portal. At
  `client.pawsonlongmeadow.com`. Router `index.js`; handlers in `src/`. `wrangler.toml` has an
  `[assets]` block (`directory = "./portal/dist"`, `binding = "ASSETS"`) and a daily cron
  `crons = ["14 11 * * *"]` (7:14am EST / 8:14am EDT — Cloudflare crons are UTC and do NOT
  follow DST).
- **Frontend** (Vite): `portal/index.html`, `portal/src/main.js`, `portal/src/style.css`.
  Single-page, token-gated via `?client=TOKEN`; views are `<div class="view">` toggled by
  `showView(id)` in main.js.
- **Airtable** base `appvQb876VInNJlnB` — business DB.
- **Resend** — transactional email. Sender `bookings@pawsonlongmeadow.com`, reply-to
  `hello@pawsonlongmeadow.com`. Owner notifications go to `hello@`.
- **GitHub** `github.com/guscastaneda/paws` (private). GitHub Actions auto-deploys the Worker on
  push to `main` (secret `CLOUDFLARE_API_TOKEN`).
- **Local repo:** `/Users/guscastaneda/Local Sites/paws/`. VS Code, `code` shell command.
- Business runs cash-basis for tax. Rover used purely for lead-gen (clients convert to direct
  after 1-2 stays); Rover 1099-K reports gross; Rover fee auto-formula at 20%; "Dog Walking" in
  Rover maps to "Group Walk" in Services.

### Business emails
- `hello@pawsonlongmeadow.com` — owner notifications, agreement confirmations, reply-to.
- `bookings@pawsonlongmeadow.com` — transactional sends (with `hello@` as reply-to).

---

## File map
Worker: `index.js` (router), `src/{constants,helpers,client,profile,agreement,cancellation,
cancellation-confirmed,compliance,booking,message,pet,recurring,breeds,admin,reminders,leads,
setup-client}.js`.
Frontend: `portal/src/main.js`, `portal/src/style.css`, `portal/index.html`, `portal/src/views/pets.js`.
Airtable automation scripts (mirrored, NOT part of the Worker build): `airtable-scripts/` holds
version-controlled copies of the Airtable Automations; see `airtable-scripts/README.md` for the
current list and each script's trigger/purpose. Airtable is the source of truth for the running
copy; when a script changes in Airtable, paste the new copy here and commit. They use Airtable
scripting globals + top-level await/return, so `node --check` will not pass on them (expected).
Website content drafts + copy reconciliation: `Draft_Website content/` (see `00_reconciliation.md`,
which pins every page's copy to the master agreement + verified Airtable pricing).

### Shared helpers
- `helpers.js` exports `cors`, `errRes`, `jsonRes`, `atFetch`. `atFetch(env, path, opts)` wraps
  `fetch(AT + path)` with `Authorization: Bearer env.AIRTABLE_API_KEY`; returns raw response.
- Email helpers repeated across handlers: `sendEmail`, `emailWrapper(body, clientToken)` (builds
  portal URL with `?client=TOKEN` when a token is present), `summaryTable(rows)`. `reminders.js`
  also has `ownerWrapper(body)` whose footer links to the Airtable Reminder Worklist view instead
  of the client portal.
- `profile.js` `/profile` handler: writes `directFields` straight to the client record; routes
  `updates[]` into the Pending Updates queue; handles `markEmailConfirmed`.

### Env vars / secrets (Cloudflare)
`AIRTABLE_API_KEY`, `RESEND_API_KEY`, `REMINDER_KEY` (protects `/run-reminders`).

---

## Design system (locked)
CSS custom properties (style.css):
`--green #2F7D52`, `--green-bright #41A368`, `--green-deep #1F5538`, `--green-wash #E8F3EC`,
`--paper #F7F4EE`, `--ink #23201B`, `--muted #857C6E`, `--line #E6E0D6`, `--line-soft #EFEAE0`,
`--clay #C8643C`, `--surface #FBF9F5`, `--surface-sunk #F4F1EA`, plus `--warn`.
Fonts: **Fraunces** (display, `--font-display`) + **Hanken Grotesk** (body, `--font-body`).
Icons: stroke SVG sprite; `.ic` class = `fill:none; stroke:currentColor; stroke-width:1.75`;
referenced via `<svg class="ic"><use href="#i-..."/></svg>`.
**Core principle: green is an ACCENT (checkmark, thin left rail, icon), NEVER a flat panel fill.**
"green-wash panel" is a recurring anti-pattern to avoid.

---

## Key Airtable IDs

Base: `appvQb876VInNJlnB`

| Table | ID |
|---|---|
| Clients | `tblqksLnPLdE0nF8Q` |
| Pets | `tbl6FYNs5D3LLxCdd` |
| Appointments | `tbl9BGXYbTXh2Gwv1` |
| Compliance Documents | `tblRuPAAVBeMjeWSa` |
| Pending Updates | `tblte5MYEXmlJ4FvF` |
| Vets | `tblUC3XRDQnNCwTri` |
| Breeds | `tblLsiIKKeimLnBxF` |
| Leads | `tbljFUzGv9rAQdGIt` |

Service IDs (Services table): Boarding `recToZsYSMELIVcMN`, Daycare `rec99cemJqkCezIRN`,
Half-Daycare `rec4yyzqGvuDGomgy`.
Service Category single-select values (Appointments): DC, HD, B, HS, PT, GW, DV.

### Clients fields
Client Name `fld65O8M2r0KPgF9l`, Phone Number `fldrMb2on5Ah4XPGy`, Email Address
`fldEiyeDye0XPbQhG`, Address `fldtKuNB5rKnwfkBc`, Active `fldREuwCj3X2ne9qj`, Client Token
`fld1wfRpBUKakmrXC`, Email Confirmed `fldu4QVk4SU9q6KOh`. Additional Owner Name `fldCMY9D0FMxsjXO1`,
Additional Owner Phone **Number** `fldLaZn8rvz3980eW` (note: field name is "Additional Owner Phone
Number", NOT "Additional Owner Phone"), Additional Owner Email `fldObDDO77JkhdE4r`.
Agreement Signed `fldBbIbLhv61zvhBa`, Agreement Signed Date `fldEPvulUW1PnF8ur`, Agreement Signed
Name `fld4IbtG1PujbYRJl`, Agreement Version `fldC7se8t5xNmqmqU`.
Emergency Contact Name/Phone/Rel `fldPtLY3f9x4A8Gvg` / `fldT0hsGKW9uNcMO5` / `fldNY55KtTdeF0QE7`.
Alternate Caregiver Name/Phone/Rel `fld7fJcPSqmkPCitm` / `fldcrMT6OBbdgX62O` / `flduzNFlEidG1uDFE`.
Emergency Info Last Confirmed `fld7XBU94zpYwU9pl` (dateTime). Reverse lead link `fldHu07BVFCHQizD9`.

### Pets fields
Pet Name `fldcFRXue6vqhD1y8`, Active `fldozhvZNn8G5t8MZ`, Gender `fldeME6BfqF8KhXag`,
Spayed/Neutered `fldLPs7c9DxLG030o`, Clients link `fldfZQT4s8x3wIYet`, Deceased `fldGYCnQV6OA0VtTo`
(checkbox), Date of Death `fldiDYEZMfzRBxB1u`. Insurance: Provider `fldEmvJrltCihOE1X`,
Policy Number `fldVD5Zuaya0CTDve`, Coverage `fldeIxOSQgVG4vB05`, Renewal Date `fldIz28Ow1SToOSHG`.

### Compliance Documents fields
Doc Type `fld4i0GIKK6isMnhc` (single-select: Vaccination Record / Rabies Certificate / Town
License / Other / Spay-Neuter Certificate), Doc Date `fldGwyiZcVRWrPgyE`, Doc Expiry
`fld0ujeUQxBxRT73D`, Doc File `fldcif0z5lNqiW6mo`, Doc Pet link `fldNbMDIZOYbSMgKd`,
Days Until Expiration `fldbtFYsrI3LGm8uU` (formula, number), Is Expired? `fldPK1uooOqMOm0Bw`
(formula returns "Yes"/"No" strings), Submission Status `fldjgTSMKIedLFVJh` (single-select:
Received / Reviewed / Accepted / Rejected). Last Reminder Stage `fldGubOu7Seqe6Ppj` (single-select:
30-day / 7-day / Expired / December nudge), Last Reminder Sent `fldFCuGyyZNLRk3BK` (date).

### Leads fields
See `handoffs/01_convert-to-client.md` for the full field-ID map. Table `tbljFUzGv9rAQdGIt`;
primary Lead Name `fldeRLG6gxkaBtkoJ`; Status `fld9qmOwIyNMLIOYi`; Converted Client link
`fld5RWrZ01TRgjEKP`.

### Useful views
Reminder Worklist (Compliance) view `viwvGCkaRIZOQEG2g` — the owner digest links here.

---

## Airtable gotchas (these bite — internalize them)
- **Single-select writes fail SILENTLY** if the option value isn't an exact match, including any
  emoji that is part of the value (e.g. Pending Updates status is literally `"Pending 🟡"`).
  Verify option names against the live schema before writing.
- **Linked-record fields:** GET returns `[{id, name}]`; POST/PATCH accept plain string arrays
  `["recXXX"]`. Object syntax on write fails silently.
- **Single-select on GET** returns an object `{id, name, color}` — read `.name`.
- `filterByFormula` is unreliable for linked-record and single-select filtering. Pull records and
  filter client-side, or use `RECORD_ID()` with `OR()`.
- **Direct PATCH with a wrong field NAME errors loudly** (`UNKNOWN_FIELD_NAME`) — good, verify
  names first. A wrong field ID can silently return empty instead of erroring.
- **`fields[]`/`fieldIds[]` allowlist returns 422 if any name/ID doesn't exist** — useful as a
  cheap "do these names resolve?" check.
- File attachments: create record first, then POST base64 to
  `https://content.airtable.com/v0/{BASE_ID}/{recordId}/{fieldId}/uploadAttachment`.
- **30 table-queries-per-invocation cap** on Airtable automation scripts. NEVER query inside a
  loop. Load whole tables once into in-memory maps keyed by record ID and look up from there.
  (This bit the pricing engine — fixed in v2.2 by loading Pricing Rules once into
  `pricingRulesById`.)

---

## Policy / domain rules (don't violate these in code)
- **Profile write policy:** contact info (name, phone, email, address, additional owner,
  emergency contact, alternate caregiver) writes DIRECTLY to Clients. Vet / insurance / health
  (meds, allergies, feeding, temperament, fears, vet clinic) goes to the **Pending Updates**
  queue for manual review. Review (approval) is still a manual human decision, but APPLICATION is
  now automated: an Airtable automation (`airtable-scripts/apply-pending-update.js`) fires when a
  Pending Update enters the Status = "Approved 🟢" view and writes the New Value to the correct
  Clients or Pets field. EXCEPTION: vet updates (Primary Vet / Specialist Vet) are skipped by the
  automation and still require manual handling. Pet updates use the "PetName — FieldName" (em dash)
  Field Name convention.
- **Reminder engine gates (all three required):** pet active + not deceased; client active + has
  email; document Accepted + remindable type (Rabies / Vaccination / Town License) + in date
  window. "No email on file" = client not yet onboarded (onboarding happens via texted magic
  link), which is expected, not an error. Reminder cadence: Rabies/Vaccination → 30-day + 7-day +
  once-on/after-Expired; Town License → single December nudge; Spay-Neuter / Other → never. Each
  milestone fires exactly once via the Last Reminder Stage write-back.
- **Capacity model:** 10-dog hard simultaneous ceiling = yield management of perishable inventory.
  Full-day and boarding occupy a full daytime seat; half-days occupy only their half; boarding
  dogs count against the daytime cap across every night of the stay.
- **Cancellation policy (matches deployed Airtable formula):** 4-hour post-booking grace period
  (never charged). Overnight (Boarding/House Sitting): 7+ days free, 48hr-7d = 50%, under 48hr =
  100%; peak tightens to 14+/7-14/under-7. Single-session (Daycare/Half-Daycare/walks/drop-ins):
  24+ hr free, under 24hr = 100% (NO 50% daycare tier — the agreement was conformed to the code).
  Always CANCEL recurring appointments, never delete (deletion regenerates them).
- **Peak season:** applies to all nights of a qualifying stay; a stay ending before the holiday
  start date is not charged peak.
- **Operating hours:** Mon-Sat 8:00 AM - 4:30 PM, Sun 12:00 PM - 4:30 PM. Drop-off windows (single-
  select on Appointments Start/End Time): "Early morning (8:00-9AM)", "Noon (11:30AM-12:30PM)",
  "Late Afternoon (4:00-4:30PM)". These use en-dashes (U+2013) — the code string literals must
  match the Airtable option values exactly. System is NOT day-aware; Sunday coordination happens
  by text. (Permit actually allows 7:30-5:30 / 12:00-6:00; Gus deliberately runs narrower.)
- **Agreement:** Version 1.0. Disputes go to negotiation → mediation → Norfolk County courts (NOT
  arbitration). Liability cap = greater of (fees paid for that service) or $500. Emergency vet
  pre-auth $500 default. Dollar amounts live in the Rate Schedule, not the agreement, so pricing
  can change without re-execution. STILL NEEDS a Massachusetts attorney review before real launch.

---

## Current portal capabilities (built + live)
Magic-link onboarding; tokenless welcome landing (`view-welcome`) + meet-and-greet lead form
(`view-lead`) → `/lead` endpoint → Leads table + owner/prospect emails; helpful invalid-link
recovery (`view-invalid`); contact info (direct write); pet profiles + tabbed edit; vet/insurance;
compliance document uploads; client service agreement (electronic signature, consent banner);
booking (Daycare / Half-Daycare / Boarding) with one-time + weekly-recurring; cancellation logic;
deceased-pet memorial handling; emergency contact + alternate caregiver; compliance expiry reminder
cron + owner digest; pricing engine (Airtable automation, PricingEngine v2.2).

---

## Open threads / roadmap (see handoffs/ for full context)
- `handoffs/01_convert-to-client.md` — Convert-to-Client button (deferred until manual lead
  conversion becomes tedious).
- `handoffs/02_semantic-html-a11y.md` — semantic HTML + accessibility hardening pass.
- `handoffs/03_claude-code-and-website.md` — Claude Code migration + client-facing website.
- Attorney pass on the agreement (launch blocker). Payments / card-on-file migration (MA prohibits
  card surcharging; cash/prepay discounts allowed). New bookable services: House Sitting (category
  exists, not portal-bookable), Poop Scoop, Pet Taxi (parked on commercial auto insurance).
  Capacity dashboard (seat-math endpoint + Open/Limited/Full status). Relaunch announcement bundle.
- Larger scaling (multi-tenant SaaS / second facility): would require migrating Airtable →
  Postgres, a tenant model + per-tenant config, real auth/roles, Stripe (Billing + Connect), and
  staging/tests/monitoring. Gate this on validated demand (an actual paying operator), not
  speculation. A second facility of Gus's own is a much smaller lift than selling to a stranger.

---

## Housekeeping notes
- Three different dogs are named "Ollie" (three different owners) — this is a real coincidence,
  NOT duplicate data. Do not flag them as dupes.
- Test records get created during dev — delete them after (with Gus's approval). Watch for a
  "TEST ..." lead in the Leads table.
