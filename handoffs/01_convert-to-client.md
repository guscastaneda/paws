# Handoff — Convert-to-Client Button (Leads → Clients)

> Paste this whole file into a fresh chat to pick up this task. It is self-contained.

## What this is
Paws on Longmeadow (home dog boarding/daycare, Sharon MA) has a **Leads** table that
captures new-client meet & greet requests from the portal. Right now, when a lead
becomes a real client, the owner (Gus) **manually** creates the Clients + Pets records,
copies the info over, and links them. This task builds a **semi-automated "Convert"
action** that does that copy in one step, while keeping Gus as the human who decides
*when* a lead converts.

**Do not build this until manual conversion has actually become tedious.** If Gus has
only converted 0–2 leads by hand, the friction isn't understood yet and the design will
be guesswork. Confirm with Gus that he's felt the manual flow before building.

## Business context
- 10-dog capacity, home-based. Co-owner Marian. Pre/early launch.
- Funnel: lead → meet & greet (Zoom or in-person, a *conversation*, not a playdate) →
  half-day trial assessment → thumbs up → ongoing client. Dogs that aren't a fit for the
  group space get redirected to drop-ins/house-sitting case by case.
- Conversion is a **human judgment call** (dog passed trial, terms agreed). It must NOT
  auto-fire on a status change. The button is manually triggered by Gus.

## Tech stack
- **Airtable** base `appvQb876VInNJlnB` (business DB).
- **Cloudflare Worker** `winter-river-a9da` at `client.pawsonlongmeadow.com`. Repo
  `github.com/guscastaneda/paws` (private), GitHub Actions auto-deploy on push to `main`.
  Worker source in `src/`, entry/router `index.js`. Frontend in `portal/` (Vite:
  `portal/index.html`, `portal/src/main.js`, `portal/src/style.css`).
- **Resend** for email (from `bookings@pawsonlongmeadow.com`, reply-to
  `hello@pawsonlongmeadow.com`).
- Local repo: `/Users/guscastaneda/Local Sites/paws/`. Claude's sandbox CANNOT access
  the local repo — Gus pastes/uploads files, Claude returns complete files to
  `/mnt/user-data/outputs/` and presents them.

## Gus's working preferences
- Complete-file outputs over diffs; provide `git add/commit` lines after every change.
- **No em dashes** in any copy. **No emojis** in UI. Warm, plain, non-overselling voice.
- Tests on real iPhone + desktop. Approves decisions before build; explicit approval
  required before any Airtable data write (especially financial).
- Validate JS with `node --check`; for template-heavy HTML also run a python div-balance
  walk (node --check misses nested-template and div-imbalance issues).

## Key Airtable IDs

### Leads table `tbljFUzGv9rAQdGIt`
| Field | ID |
|---|---|
| Lead Name (primary) | `fldeRLG6gxkaBtkoJ` |
| Submitted At | `fldAz4C1teoPuXCQ9` |
| Status (single-select: Requested / M&G Scheduled / M&G Completed / Trial Scheduled / Trial Completed / Converted / Declined / Redirected) | `fld9qmOwIyNMLIOYi` |
| Lead Source | `fldUcgk1Df2jc59XQ` |
| Owner Name | `fldiVVEpLq0zvkk89` |
| Phone | `fld5HN7N42mypsKLh` |
| Email | `fldi5CSPm4hVDBSHo` |
| Dog Name | `fldfK1Cmut461q8BD` |
| Dog Gender | `fldmFRgir51Z658Qb` |
| Breed | `flddX4ciNCWinlreX` |
| Dog Age | `fldknDqRphZ77lffc` |
| Spayed/Neutered | `fldNzH22OCEDU3MeJ` |
| Services Interested In (multi) | `fldQTHbThDwHBY2fT` |
| M&G Format Preference | `fldZ0WbbWQoLwiIDJ` |
| Dog Around Other Dogs | `fldw9ldgfp1UUuy3r` |
| House-Trained | `fldkmqKPQLS8tPJyA` |
| Aggression or Bite History | `fldCDxOFBg7kkU5il` |
| Aggression Details | `fldtJFgsmxnL1xQfe` |
| Prior Daycare/Boarding | `fldHxVbSmKiyiNwR7` |
| Notes | `fldOxBKHN81MAEylZ` |
| Converted Client (link to Clients) | `fld5RWrZ01TRgjEKP` |

There is a reverse link on Clients (`fldHu07BVFCHQizD9`) showing which lead a client came from.

### Clients table `tblqksLnPLdE0nF8Q` (targets to seed)
- Client Name `fld65O8M2r0KPgF9l`
- Phone Number `fldrMb2on5Ah4XPGy`
- Email Address `fldEiyeDye0XPbQhG`
- Address `fldtKuNB5rKnwfkBc`
- Active `fldREuwCj3X2ne9qj` (checkbox)
- Client Token `fld1wfRpBUKakmrXC` (the magic-link token)
- Additional Owner Name `fldCMY9D0FMxsjXO1`, Additional Owner Phone Number `fldLaZn8rvz3980eW`, Additional Owner Email `fldObDDO77JkhdE4r`
- (reverse lead link) `fldHu07BVFCHQizD9`

### Pets table `tbl6FYNs5D3LLxCdd` (create a pet for the dog)
- Pet Name `fldcFRXue6vqhD1y8`
- Active `fldozhvZNn8G5t8MZ` (checkbox)
- Gender `fldeME6BfqF8KhXag`
- Spayed/Neutered `fldLPs7c9DxLG030o`
- Clients link `fldfZQT4s8x3wIYet`
- Breed is stored as free text `Breed (Text)` at lead stage; the Pets table uses a linked
  Breeds table (`tblLsiIKKeimLnBxF`) — decide whether to leave breed blank on the new pet
  and let Gus link it, or store the text. (See open questions.)

## The design — decisions already made
- **Semi-automated (Option B), manually triggered.** Gus decides a lead has converted, then
  triggers the button/endpoint. It does the record creation + copy + link + status flip.
  It does NOT auto-fire on a status change.
- The **"Converted Client" link field is the bridge** — already exists.
- Philosophy is **light-capture-at-lead, deep-capture-at-conversion**: the lead has only
  light info. Full onboarding (agreement, compliance docs, vet, emergency contacts) happens
  *after* conversion via the existing magic-link portal flow — the button does NOT try to
  collect all that. It just creates the shell records and gets the client into onboarding.

## What to build
A conversion action that, for a given Lead record:
1. Creates a **Clients** record seeded from the lead (name, phone, email, address, additional
   owner if present), `Active = true`, and **generates a Client Token** (the magic-link token —
   check how existing client setup generates tokens; see `src/setup-client.js` / `handleSetupClient`
   in the router, that's the likely token-mint path to mirror).
2. Creates a **Pets** record for the dog (name, gender, spayed/neutered), `Active = true`,
   linked to the new client.
3. Sets the lead's **Converted Client** link to the new client record, and flips lead
   **Status → Converted**.
4. Optionally: sends the client their magic link (or returns it so Gus sends it). Decide with Gus.

## Delivery mechanism — decide with Gus first
Two viable shapes:
- **(a) Cloudflare Worker endpoint** (e.g. `POST /convert-lead` with a lead ID + an auth key),
  triggered from an Airtable button field (URL) or a small admin action. More control, mirrors
  the existing `/lead`, `/booking` handler patterns. Recommended if Gus wants the magic-link
  send bundled in.
- **(b) Airtable automation / scripting button** on the Leads table (a "Convert" button field
  that runs a script). Lives entirely in Airtable, no Worker. Simpler to trigger from the grid,
  but token generation must match however the Worker mints tokens (avoid divergence).
Ask Gus which he prefers before building.

## Open questions to resolve with Gus
1. **Multi-dog households.** A lead has one Dog Name. If a converting client has 2+ dogs, does
   the button create one pet (and Gus adds the rest), or should conversion support multiple pets?
   (Lead form only captures one dog, so one-pet-then-Gus-adds-more is the likely v1.)
2. **Breed.** Lead breed is free text; Pets uses linked Breeds. Leave the new pet's breed blank
   for Gus to link, or attempt a text match? (Blank-and-link is safer.)
3. **Magic link.** Does the button send the client their magic link automatically, or just create
   the records and let Gus send it? (Sending automatically is smoother but commits to the endpoint
   route so Resend can fire.)
4. **Token generation.** Confirm the exact token format/mint used by `handleSetupClient`
   (`src/setup-client.js`) so a converted client's token matches existing clients.

## Airtable gotchas (carry forward — these bite)
- Single-select writes fail **silently** if the option value doesn't exist exactly (incl. any
  emoji as part of the value). Verify option names against the live schema before writing.
- Linked-record fields: GET returns `[{id,name}]`; POST/PATCH accept plain string arrays
  `["recXXX"]` (object syntax silently fails).
- `filterByFormula` is unreliable for linked-record and single-select filtering — pull records
  and filter client-side.
- When unsure of a field name, fetch all fields and read the actual keys; requesting a wrong
  field ID/name can silently return empty rather than erroring.
- Writing a field name that doesn't exist DOES error loudly on a direct PATCH
  (`UNKNOWN_FIELD_NAME`) — so verify names first.

## Test plan
- Create/confirm a real test lead in Leads.
- Run the conversion. Verify: a Clients record exists with the seeded fields + a token +
  Active; a Pets record exists linked to that client + Active; the lead's Converted Client
  link is set and Status = Converted.
- If magic-link send is included, verify the client receives it and the link opens their portal.
- Clean up test records after (Gus approves deletes).

## Status when this handoff was written
Not started. Deferred intentionally until manual conversion becomes tedious. The Leads table,
the `/lead` intake endpoint, and the portal meet-and-greet flow are all built and live. The
"Converted Client" bridge field exists. Nothing blocks starting this whenever Gus is ready.
