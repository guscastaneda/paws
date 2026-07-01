# Handoff — Migrate to Claude Code + Build Client-Facing Website

> Paste this whole file into a fresh chat (ideally a Claude Code session) to pick up this
> task. It is self-contained. This is the recommended FIRST step before any larger scaling
> work, because it removes the biggest workflow bottleneck and produces the public website.

## Why this task exists / what it unlocks
Today the entire dev workflow is bottlenecked: the assistant's sandbox cannot touch the local
repo, so the owner (Gus) pastes files in and the assistant returns files to copy back and
commit. That's slow and error-prone (it caused a wrong field-name bug and a wrong git-path
command). **Claude Code works directly in the real repo** — reads/edits files in place, runs
`node --check` and `wrangler tail` itself, sees the whole codebase at once, makes commits.
That is a step-change for this project.

This task has two parts:
1. Get the existing repo working in Claude Code (fast, mostly setup).
2. Build a client-facing marketing website that connects to the existing portal via the
   already-built meet & greet lead flow.

## Business context (brief)
Paws on Longmeadow, LLC — home-based dog boarding & daycare, Sharon MA, 10-dog capacity.
Owner: Gus Castaneda; co-owner Marian. Pre / early launch. There is already a live, token-gated
**client portal** at `client.pawsonlongmeadow.com`. The public marketing site
(`pawsonlongmeadow.com`) does not exist yet — this task builds it.

## Existing tech stack (what's already built)
- **Cloudflare Worker** `winter-river-a9da` = the API/portal layer, serving both JSON endpoints
  and the built portal assets. Source in `src/` (handlers) + `index.js` (router). `wrangler.toml`
  has a daily cron (`14 11 * * *`) for compliance reminders and an `[assets]` block serving
  `portal/dist`.
- **Frontend portal** (Vite): `portal/index.html`, `portal/src/main.js`, `portal/src/style.css`.
  Single-page, token-gated via `?client=TOKEN`, view-switching via `showView()`.
- **Airtable** base `appvQb876VInNJlnB` = business database (Clients, Pets, Appointments,
  Compliance Documents, Leads, Pricing Rules, etc.).
- **Resend** = transactional email (from `bookings@pawsonlongmeadow.com`, reply-to
  `hello@pawsonlongmeadow.com`).
- **GitHub** `github.com/guscastaneda/paws` (private) — GitHub Actions auto-deploys the Worker
  on push to `main` (uses `CLOUDFLARE_API_TOKEN` secret).
- **Local repo**: `/Users/guscastaneda/Local Sites/paws/`. VS Code with `code` shell command.
- Debug pattern: `npx wrangler tail winter-river-a9da`; use the `workers.dev` URL to bypass
  caching while testing.

## What's already built and live in the portal (so the website can lean on it)
- Magic-link onboarding, contact info (direct write), pet profiles, vet/insurance, compliance
  document uploads, client service agreement (electronic signature), booking (Daycare /
  Half-Daycare / Boarding), recurring services, cancellation logic.
- **Meet & greet lead flow** (THIS is the integration point for the website): a tokenless
  welcome screen (`view-welcome`) + a lead form (`view-lead`) that POSTs to a `/lead` Worker
  endpoint, writing to the **Leads** table (`tbljFUzGv9rAQdGIt`) and emailing owner + prospect.
- Compliance expiry reminder system (cron), pricing engine (Airtable automation script).

## Gus's working preferences (carry into Claude Code)
- **No em dashes** in any copy. **No emojis** in UI. Warm, plain, non-overselling voice.
  Strong editorial instincts — he pushes back on unnatural or salesy language.
- Complete-file outputs historically (in Claude Code, in-place edits are fine and preferred).
- Wants `git commit` messages provided/created after changes.
- Tests on real iPhone + desktop. Approves decisions before build; explicit approval before
  Airtable data writes (especially financial).
- Validate JS with `node --check`; for template-heavy HTML, tag-balance/div-depth check too.
- Privacy: keep the home address OFF public-facing content — use neighborhood-level references
  ("Sharon, Massachusetts"), never the street address. This matters MORE on a public website.

## Design system (reuse so site + portal feel like one brand)
CSS custom properties: `--green #2F7D52`, `--green-bright #41A368`, `--green-deep #1F5538`,
`--green-wash #E8F3EC`, `--paper #F7F4EE`, `--ink #23201B`, `--muted #857C6E`,
`--line #E6E0D6`, `--line-soft #EFEAE0`, `--clay #C8643C`, `--surface #FBF9F5`,
`--surface-sunk #F4F1EA`. Fonts: **Fraunces** (display) + **Hanken Grotesk** (body).
Icons: stroke SVG sprite, `.ic` = `fill:none; stroke:currentColor; stroke-width:1.75`.
Core principle: green is an ACCENT (checkmark, thin rail, icon), never a flat panel fill.
NO emoji in UI.

---

## PART 1 — Get the repo into Claude Code

1. Install Claude Code (terminal or desktop app) and open the local project at
   `/Users/guscastaneda/Local Sites/paws/`. It already IS a git repo, so nothing to migrate —
   just open it. Claude Code immediately has full-codebase context.
2. **Seed a `CLAUDE.md`** at the repo root — a persistent project-context file Claude Code reads
   every session. It should capture: the stack above, the file map, Gus's preferences (no em
   dashes / no emoji / warm voice / approve-before-writes), the design-system tokens, the
   Airtable gotchas (below), and the key table/field IDs. The two existing handoff docs
   (`01_convert-to-client.md`, `02_semantic-html-a11y.md`) plus the Part-2 architecture below are
   good source material. This ends the "re-establish context every session" tax.
3. Verify Claude Code can run the local toolchain: `node --check`, the Vite build
   (`cd portal && npm run build`), and `npx wrangler tail winter-river-a9da`.

### Airtable gotchas to record in CLAUDE.md
- Single-select writes fail SILENTLY if the option value isn't an exact match (incl. emoji in
  the value). Verify option names against live schema before writing.
- Linked-record fields: GET returns `[{id,name}]`; POST/PATCH accept plain string arrays
  `["recXXX"]` (object syntax silently fails).
- `filterByFormula` unreliable for linked-record / single-select filtering — pull and filter
  client-side.
- Direct PATCH with a wrong field NAME errors loudly (`UNKNOWN_FIELD_NAME`); a wrong field ID
  can silently return empty. Verify names.
- 30 table-queries-per-invocation cap on Airtable automation scripts — load tables once into
  in-memory maps, never query inside loops. (Already bit the pricing engine once.)

---

## PART 2 — Build the client-facing website

### Architecture decision (recommended)
Build the public marketing site as a **separate static site on Cloudflare Pages** (NOT folded
into the portal Worker). Rationale: keeps marketing iteration separate from app deploys, stays
in the Cloudflare ecosystem Gus already uses, cheap + fast, and it connects to everything
already built through ONE integration point — the meet & greet flow.

- Domain: `pawsonlongmeadow.com` = the public site. `client.pawsonlongmeadow.com` = the existing
  portal (unchanged).
- Stack for the site: plain HTML/CSS is fine; **Astro** is a good upgrade if component reuse or
  a blog is wanted, still static-first and Cloudflare Pages-friendly. Reuse the design-system
  tokens and fonts so site and portal are visibly one brand.

### The integration point (the elegant part)
The website does NOT need to know about pricing engines, compliance, or booking internals. Its
job is: tell the story (home / about Gus & Marian / services / how it works / FAQ) and drive
visitors to **"Request a meet & greet."** That button links into the existing portal's lead flow
(`client.pawsonlongmeadow.com/?...` landing → `view-lead`, or directly to the lead form). From
there the ALREADY-BUILT machinery takes over: `/lead` endpoint → Leads table → owner triage →
manual conversion → magic-link onboarding. So the site is brochure + funnel; the portal is the app.

Decision to confirm with Gus: does the "Request a meet & greet" CTA (a) deep-link into the portal's
lead view, or (b) get its own copy of the lead form on the marketing site that POSTs to the same
`/lead` endpoint (cross-origin — the `/lead` handler already sends permissive CORS headers, verify)?
Option (a) is simplest and avoids duplicating the form.

### Content the site needs (draft with Gus, in his voice — no em dashes, no emoji, no overselling)
- Home: who they are, the vibe (small, home-based, personal), primary CTA.
- About: Gus & Marian, the story (left a creative PM career to run this full-time), why home-based
  is different. Keep it warm and real.
- Services: Boarding, Daycare, Half-Day Daycare (and note House Sitting / Drop-Ins / Group Walks /
  Pet Taxi as available case-by-case). Do NOT publish a rigid price list — pricing is bespoke and
  lives in the Rate Schedule; the meet & greet is where fit + pricing are discussed.
- How it works: meet & greet → half-day trial → ongoing care. Sets expectations honestly.
- FAQ: vaccination/Ollie's Law compliance, what to bring, hours (Mon-Sat 8:00-4:30, Sun 12:00-4:30),
  curbside drop-off.
- Trust signals: licensed commercial kennel, Ollie's Law compliant, Special Use Permit, insured.
- Privacy: neighborhood-level location only, NEVER the street address publicly.

### Design flow
Explore the visual direction in **Claude Design** (canvas + chat), starting from the existing
design system so it matches the portal. Once a direction is chosen, build it for real in Claude
Code and wire the Cloudflare Pages deploy. Keep it fast, accessible, and mobile-first (a large share
of pet-care research is on phones).

---

## Sequencing recommendation
Do Part 1 (Claude Code) first — it makes everything after faster and safer. Then Part 2. Both are
independent of the larger "multi-tenant SaaS" question, which should be gated on validated demand
(an actual other operator willing to pay) rather than built speculatively. If/when the Airtable →
Postgres migration happens, Claude Code is where that work lives — so this task is also the
foundation for real scaling later.

## Status when this handoff was written
Not started. Repo exists and is healthy. Portal (incl. the meet & greet lead flow that the website
plugs into) is built and live. Nothing blocks starting. Recommended as the immediate next project.
