# Paws on Longmeadow — Public Website

Static marketing site (Astro) for `pawsonlongmeadow.com`, deployed on Cloudflare Pages. Separate
from the client portal (`client.pawsonlongmeadow.com`) and the Worker. The only backend touchpoint
is the meet & greet lead form, which POSTs to the Worker `/lead` endpoint from the browser.

See `../Draft_Website content/01_site-structure.md` for the full page/component plan and
`../Draft_Website content/00_reconciliation.md` for the reconciled, source-of-truth copy.

## Structure
- `src/styles/tokens.css` — design tokens ported from the portal (`portal/src/style.css`), so site and portal are one brand.
- `src/content/config.ts` — data collections (`services`, `testimonials`, `faqs`). Add an entry = add a JSON file, no markup change.
- `src/content/{services,testimonials,faqs}/*.json` — seed data (a few examples; the rest come from the drafts).
- `src/layouts/BaseLayout.astro` — head, fonts (Fraunces + Hanken Grotesk), Header/Footer shell.
- `src/components/*.astro` — reusable section components (see structure doc §2).
- `src/pages/*.astro` — pages compose components. **Home** and the **meet & greet form** are scaffolded; the other pages are TODO.

## Develop
```
cd website
npm install
npm run dev
```

## Build & deploy (Cloudflare Pages)
```
npm run build   # outputs static site to dist/
```
Point a Cloudflare Pages project at this directory: build command `npm run build`, output directory
`dist`, then map `pawsonlongmeadow.com` to it. The portal and Worker are untouched.

## Status
**Scaffold only.** Layouts and component styling are intentionally plain placeholders pending the
Claude Design pass (see `../Draft_Website content/02_design-brief.md`). Copy still lives in the
drafts and moves into pages/collections as each page is built.

### Build TODOs carried from the drafts
- Map `LeadForm` fields to the `/lead` payload; confirm CORS from the site origin.
- Add remaining pages (About, Our Home, Services & Pricing, FAQ, Gallery, Contact, Ollie's Law) and their components (Steps, FAQAccordion, PricingList, PolicyBlock, GalleryGrid, ContactForm).
- Emoji → sprite icons; import the portal's icon sprite.
- Phone number, Gallery photography/video, neighborhood map embed.
