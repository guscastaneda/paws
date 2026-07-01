# airtable-scripts

Version-controlled **mirrors** of the Airtable Automation scripts that run on base
`appvQb876VInNJlnB`. These are NOT part of the Cloudflare Worker build and are never imported
by it. They run inside Airtable's scripting environment.

## Source of truth
**Airtable is the source of truth for the running copy.** These files exist so the automations
have version history and can be diffed, reviewed, and recovered. When a script changes in
Airtable, paste the updated copy here and commit it. This is a manual mirror; it does not
auto-sync, so keep the habit or the repo copy will drift.

## Why `node --check` won't pass
Each script uses Airtable scripting globals (`input`, `base`, `output`), top-level `await`, and
top-level `return`. That is valid in Airtable's runner but not in plain Node, so `node --check`
is expected to fail on these. Do not "fix" that; validate by running in Airtable instead.

## Scripts

| File | Automation | Trigger | Purpose |
|---|---|---|---|
| `pricing-engine.js` | PricingEngine v2.2 | On appointment (run script action) | Calculates the locked final price for an appointment and writes Pricing Notes, Client Message, Locked Final Price, Peak Season, Applied Pricing Rule, etc. back to the record. Handles Overnight (Boarding / House Sitting), Daycare, Pet Taxi, Drop-In. |
| `recurring-appointment-generator.js` | Recurring Appointment Generator v1.3 | Weekly, Sunday ~5:45am | Generates appointments 4 weeks ahead for active recurring records (dedupe on Pet + Date + Service), then recomputes Active/Inactive on Pets and Clients (active = non-cancelled appointment within 180 days or in the future). |
| `mileage-log-from-appointment.js` | Create Mileage Log from Appointment | On appointment w/ route template (run script action) | Reads a Route Template (Total Miles, Direction, Service Model, Vehicle), doubles miles for Round Trip, and creates a Mileage Log record linked to the source appointment and its pets. Takes `appointmentId` + `routeTemplateId` as input config. |
| `new-client-setup.js` | New Client Setup | On new client (run script action) | Bridge to the Worker: POSTs `recordId` to `client.pawsonlongmeadow.com/setup-client` with an `X-Webhook-Secret` header; the Worker (`src/setup-client.js`) mints the client token and returns it. Takes `recordId` + `webhookSecret` as input config. Depends on the `/setup-client` handler and a shared secret staying in sync. |
| `apply-pending-update.js` | Apply Approved Pending Update | When a Pending Update record enters the Status = "Approved 🟢" view | Auto-applies an approved Pending Update: writes the New Value to the correct Clients or Pets field. Pet updates use the "PetName — FieldName" (em dash) convention; pet is resolved via a "Pet ID: recXXX" note or by name lookup. **Vet updates (Primary Vet / Specialist Vet) are skipped and still require manual handling.** Takes `recordId`; uses the `AIRTABLE_API_KEY` secret. |
| `cancellation-check-and-send.js` | Cancellation "Check and Send" | Periodic re-check of an appointment pending cancellation confirmation (confirm cadence) | Debounced confirmation trigger. If the appointment's `Cancellation Webhook Sent` is unchecked and at least 5 minutes have passed since `Cancellation Webhook Send At`, POSTs `recordId` to the Worker's `/cancellation-confirmed` (`src/cancellation-confirmed.js`) to finalize; otherwise skips. The 5-minute gap is an undo/settle window. Takes `recordId`. Second script that calls the Worker. |

Note: the recurring generator's own header says it runs **weekly** (Sunday 5:45am); confirm the
actual Airtable trigger cadence and update this table if it differs.
