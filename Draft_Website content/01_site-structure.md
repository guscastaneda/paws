---
title: Site Structure & Build Plan
type: meta
status: active
last_reviewed: 2026-07-01
---

# Site Structure & Build Plan

How the public marketing site is organized so it stays consistent and scalable: pages compose
from a shared set of section components, content lives as data, and the whole thing reuses the
portal's design system so site and portal read as one brand. Written to feed Claude Design (design
the components) and the Cloudflare Pages build (implement them).

The public site is `pawsonlongmeadow.com`; the existing portal stays at
`client.pawsonlongmeadow.com`. The only integration point is the meet & greet funnel: CTAs drive
to the portal's lead flow (`/lead`), and everything downstream (triage, conversion, onboarding)
is already built.

---

## 1. Page inventory & navigation

**Primary nav (lean):** Home · About · Our Home · Services & Pricing · FAQ · Gallery · Contact,
plus a persistent **Request a Meet & Greet** button (the primary conversion action).

**Secondary / linked (not in top nav):**
- Ollie's Law (linked from Home callout, FAQ, About, and footer)
- Request a Stay / returning-client flow (reached from Contact, footer, and post-conversion email, not the marketing nav)

**Funnel pages (thin, task-focused):**
- Request a Meet & Greet → posts to the portal `/lead` endpoint
- Request a Stay (public split: new → Meet & Greet, returning → magic link)
- Book Us (returning clients, via personal magic link; pre-filled from Airtable)

**Footer:** compact nav, Sharon MA (neighborhood only), phone, social, © line, and future
Privacy/Terms links.

Decision to keep flexible: **Services and Pricing can be one page or two.** Recommendation: one
"Services & Pricing" page with a section per service, since the content is tightly coupled and it
keeps the nav short. Split later only if either grows long.

---

## 2. Reusable section components (the scalable core)

Every page is an ordered composition of these section types. Add a page by composing existing
sections; add a section type once and reuse it everywhere. This is what keeps the site scalable
and what Claude Design should produce as a component set.

| Component | Purpose | Used by |
|---|---|---|
| `Hero` | Headline + subhead + primary CTA + image | Home, most pages (compact variant) |
| `TrustBar` | Row of icon + short label items | Home |
| `FeatureBlock` | Heading + prose + optional CTA/image | Home, About, Our Home |
| `ServiceCards` | Grid of service cards (icon, name, status label, blurb, price) | Home, Services & Pricing |
| `Testimonials` | Quote + attribution + service | Home, Gallery |
| `CalloutBand` | Full-width accent band with heading + CTA (e.g. Ollie's Law, booking) | Home, several |
| `Steps` | Numbered "how it works" sequence | Request a Meet & Greet, How it works |
| `FAQAccordion` | Grouped, collapsible Q&A | FAQ, inline on service pages |
| `PricingList` | Per-service rate blocks (base + modifiers + notes) | Services & Pricing |
| `PolicyBlock` | Long-form structured legal/plain-language copy | Ollie's Law, cancellation |
| `GalleryGrid` | Responsive photo/video grid | Gallery |
| `ContactForm` | Fielded form + info + neighborhood map | Contact |
| `LeadForm` | Multi-step meet & greet intake → `/lead` | Request a Meet & Greet |
| `Footer` | Nav, contact, social, legal | all |

Each service card carries a **status**: `bookable` (Daycare, Half-Day, Boarding), `by-request`
(House Sitting, Drop-In, Group Walk, Pet Taxi), or `coming-soon` (Poop Scoop). One field drives
the label and whether a price shows.

---

## 3. Per-page section maps

- **Home:** Hero → TrustBar → FeatureBlock (the difference) → ServiceCards → Testimonials → CalloutBand (Ollie's Law) → CalloutBand (booking) → Footer
- **About:** Hero (compact) → FeatureBlock ×N (story beats) → FeatureBlock (the people) → FeatureBlock (Ollie) → FeatureBlock (why families choose us) → CalloutBand → Footer
- **Our Home:** Hero → FeatureBlock ×N (the space, yard, inside, arrivals) → CalloutBand (meet & greet) → Footer
- **Services & Pricing:** Hero (compact) → PricingList → PolicyBlock (cancellation) → PolicyBlock (payment/peak) → CalloutBand → Footer
- **FAQ:** Hero (compact) → FAQAccordion (grouped) → CalloutBand (contact) → Footer
- **Gallery:** Hero (compact) → GalleryGrid → Testimonials → Footer
- **Contact:** Hero (compact) → ContactForm → Footer
- **Ollie's Law:** Hero (compact) → PolicyBlock ×N → CalloutBand → Footer
- **Request a Meet & Greet:** Hero (compact) → FeatureBlock (what to expect) → LeadForm → Steps (what happens next) → Footer

---

## 4. Content model (data-driven)

Keep content as data, not hardcoded markup, so adding a service/testimonial/FAQ is a data edit,
not a template change. Suggested collections:

- `services` — name, slug, status (bookable/by-request/coming-soon), price, modifiers[], blurb, icon
- `testimonials` — quote, name, service
- `faqs` — question, answer, group
- `pages` — per-page hero + ordered section list

These drafts in `Draft_Website content/` are the content source; they map onto the collections
above during the build.

---

## 5. Design system (reuse the portal's)

Site and portal share one system so they feel continuous:
- Tokens (from `portal/src/style.css`): `--green`, `--green-bright`, `--green-deep`, `--green-wash`,
  `--paper`, `--ink`, `--muted`, `--line`, `--clay`, `--surface`, etc.
- Fonts: Fraunces (display) + Hanken Grotesk (body).
- Icons: the stroke SVG sprite (`.ic`). Emoji in the drafts map to sprite icons at build; no emoji
  ships in the UI.
- Principle: green is an accent (rule, checkmark, icon), never a flat panel fill.

---

## 6. Build stack & Claude Design workflow

**Stack:** Astro on Cloudflare Pages. Astro is component-based and static-first, and its content
collections make the data model above real (type-checked `services`/`testimonials`/`faqs`). This
is the scalable choice over hand-written HTML, and it stays in the Cloudflare ecosystem next to the
Worker. Plain HTML would work for v1 but doesn't scale to reusable components + data.

**Workflow:**
1. In **Claude Design**, start from the shared tokens/fonts and design the component set in section 2 (Hero, ServiceCards, CalloutBand, etc.) as a small system, not one-off page mockups.
2. Implement those as Astro components in Claude Code; port the tokens from the portal CSS.
3. Move the reconciled copy from these drafts into content collections.
4. Wire `LeadForm` to the portal `/lead` endpoint (confirm CORS; the handler already sends permissive headers).
5. Deploy on Cloudflare Pages; point `pawsonlongmeadow.com` at it. Portal is untouched.

Scalability payoff: new page = compose existing sections; new service = one data row; brand change
= edit tokens once.
