---
title: Claude Design Brief — Public Website
type: meta
status: active
last_reviewed: 2026-07-01
---

# Claude Design Brief — Public Website

Use this to drive a Claude Design session. The goal is to design a small, coherent **component
system** (not a set of one-off page mockups) that we then implement as the Astro components already
scaffolded in `website/`. Design the parts once; the pages compose from them.

Companion docs: `01_site-structure.md` (pages + component list + build plan), `00_reconciliation.md`
(the reconciled, source-of-truth copy). The site is `pawsonlongmeadow.com`; the portal
(`client.pawsonlongmeadow.com`) stays as is and shares this brand.

---

## 1. Brand & voice
Home-based dog boarding and daycare in Sharon, MA. Small, personal, family-run, trustworthy.
The feeling: the warmth of a family home plus the reliability of professionals. Warm, plain,
never salesy.

Hard rules (carry into every label and string):
- **No em dashes.** Commas, periods, or a rewrite.
- **No emoji in the UI.** Emoji in the copy drafts are placeholders for line icons.
- Neighborhood-level location only (**Sharon, Massachusetts**). Never the street or address.

## 2. Design tokens (exact, ported from the portal)
Colors: `--green #2F7D52`, `--green-bright #41A368`, `--green-deep #1F5538`, `--green-wash #E8F3EC`,
`--paper #F7F4EE`, `--card #FFFFFF`, `--ink #23201B`, `--muted #857C6E`, `--line #E6E0D6`,
`--clay #C8643C`, `--clay-wash #F6E7DF`, `--surface #FBF9F5`, `--surface-sunk #F4F1EA`, `--warn #B4690E`.
Type: **Fraunces** (display) + **Hanken Grotesk** (body). Radii 10/14/18px. Soft warm card shadow.
Full values live in `website/src/styles/tokens.css`.

## 3. Core visual principle (do not violate)
**Green is an ACCENT, never a flat panel fill.** Use it for a thin left rail, a checkmark, an icon,
a button, an underline. Backgrounds are paper/cream ground with white cards and subtle warm insets
(`--surface`). Clay is the secondary accent (tags, small highlights). The recurring anti-pattern to
avoid is a "green-wash panel" (a flat pale-green filled box). Icons are stroke line icons, not
filled, not emoji.

## 4. Components to design (with the states each needs)
Design these as a system with shared spacing, type scale, and card treatment:

- **Header** — brand wordmark, lean nav, one primary CTA button. States: default, sticky, mobile (collapsed menu).
- **Hero** — home variant (large headline + subhead + CTA + image) and a compact page-top variant.
- **TrustBar** — a quiet row of short proof points (icon + label).
- **FeatureBlock** — heading + prose + optional CTA; text-only and text-with-image (left/right) variants.
- **ServiceCards** — a card grid. Card variants: bookable (shows price), by-request (clay tag, may show price), coming-soon (tag, no price). Icon per service.
- **Testimonials** — quote cards with a green left rail; attribution + service.
- **CalloutBand** — full-width accent band (green left rail) with heading + CTA. Used for the Ollie's Law and booking prompts.
- **Steps** — numbered "how it works" sequence.
- **FAQAccordion** — grouped, collapsible Q&A; collapsed and expanded states, keyboard-operable.
- **PricingList** — per-service rate block: base price, modifier list, notes. Handle "by request, no price."
- **PolicyBlock** — long-form structured legal / plain-language copy (Ollie's Law, cancellation). Readable, scannable, a short "plain version" callout then full terms.
- **GalleryGrid** — responsive photo/video grid; include an empty/placeholder state (photography pending).
- **ContactForm / LeadForm** — labeled fields, focus state, success and error states. Real forms wrap in `<form>`; the lead form is the funnel to the portal.
- **Footer** — compact nav, Sharon MA, social, © line.

## 5. Iconography (emoji → line icons)
The drafts use emoji as icon placeholders. Target line-icon mapping:
Boarding → home, Full-Day Daycare → sun, Half-Day Daycare → cloud-sun, House Sitting → house/key,
Drop-In Visit → door, Group Walk → leash, Pet Taxi → car. Reuse the portal's stroke SVG sprite style
(`fill:none; stroke:currentColor; stroke-width:1.75`).

## 6. Layout, responsive, accessibility
- Content column ~1080px max, generous vertical rhythm, mobile-first.
- WCAG 2.1 AA: the tokens are already high-contrast; keep it. Visible focus states, semantic
  landmarks (header/main/footer/nav), 44px touch targets, keyboard-operable accordion and forms.
- Photography is warm and candid (dogs on the deck, in the yard, on the couch); Marian's real
  photos, not stock. Neighborhood-level only, no identifying address.

## 7. Deliverables from the design session
1. The component library above as a small connected system (shared tokens, type scale, spacing).
2. Three composed page examples built from those components: **Home**, **Services & Pricing**, and the **Request a Meet & Greet** form page.
3. One light theme (no dark mode needed for v1).

## 8. Do NOT
- No green-wash panel fills. No emoji. No em dashes. No street address.
- No generic corporate/stock-photo feel. No rigid, cold layout. Keep it warm, personal, calm.
