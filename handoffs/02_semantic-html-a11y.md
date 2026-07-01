# Handoff — Semantic HTML + Accessibility Hardening Pass

> Paste this whole file into a fresh chat to pick up this task. It is self-contained.

## What this is
The Paws on Longmeadow client portal (`portal/index.html` + `portal/src/main.js`) is
functional and, after a recent label pass, reasonably accessible — but it is **not fully
semantic HTML** and has concrete a11y gaps. This task is **one holistic pass** to harden it,
done as a unit so the markup stays consistent rather than half-migrated.

Do this as its own focused session. It touches markup across the whole file and deserves a
careful, holistic pass, not piecemeal edits mixed into feature work.

## Business context (brief)
Home-based dog boarding/daycare, Sharon MA, 10-dog capacity, pre/early launch. Owner: Gus
Castaneda. The portal is a single-page, token-gated (`?client=TOKEN`) app: a hidden SVG
sprite of `<symbol>` icons at the top, then a series of `<div id="view-...">` "views"
toggled by a `showView()` function in main.js. Forms are plain inputs (mostly not wrapped
in `<form>`), interactions via `onclick` handlers.

## Tech stack
- Frontend: `portal/index.html`, `portal/src/main.js`, `portal/src/style.css` (Vite build).
- Worker `winter-river-a9da`, repo `github.com/guscastaneda/paws`, GitHub Actions deploy on
  push to `main`. Local repo `/Users/guscastaneda/Local Sites/paws/`.
- Claude's sandbox CANNOT access the local repo — Gus pastes/uploads files; Claude returns
  complete files to `/mnt/user-data/outputs/` and presents them.

## Gus's working preferences
- Complete-file outputs over diffs; provide `git add/commit` lines after every change.
- **No em dashes** in copy. **No emojis** in UI. Warm, plain voice.
- Tests on real iPhone + desktop.
- Validate: `node --check` for JS; for template-heavy HTML also run a python tag-balance /
  div-depth walk (node --check does NOT catch HTML imbalance or nested-template issues).
- Preserve the existing design system and visual output exactly — this is a *semantic/a11y*
  refactor, it must not change how anything looks.

## Design system (do not alter visuals)
CSS custom properties (in style.css): `--green #2F7D52`, `--green-bright #41A368`,
`--green-deep #1F5538`, `--green-wash #E8F3EC`, `--paper #F7F4EE`, `--ink #23201B`,
`--muted #857C6E`, `--line #E6E0D6`, `--line-soft #EFEAE0`, `--clay #C8643C`,
`--surface #FBF9F5`, `--surface-sunk #F4F1EA`. Fonts: Fraunces (display, `--font-display`),
Hanken Grotesk (body, `--font-body`). Icons are a stroke SVG sprite: `.ic` class =
`fill:none; stroke:currentColor; stroke-width:1.75`. NO emoji anywhere in UI.

Core visual principle: green is an ACCENT (checkmark, thin left rail, icon), never a flat
panel fill. Don't introduce green-wash panels.

## The known gaps to fix (this is the scope)
1. **Icons have no ARIA treatment.** Every `<svg class="ic"><use href="#i-..."/></svg>` has
   neither `aria-hidden="true"` (for decorative icons — the vast majority) nor an accessible
   name (`role="img"` + `<title>` or `aria-label`) for meaningful ones. Add `aria-hidden="true"`
   to decorative icons; give the few meaningful/standalone ones an accessible name. Most portal
   icons sit next to text and are decorative → `aria-hidden="true"`.
2. **No landmark elements.** The `<div id="view-...">` screens are generic divs. Introduce
   semantic landmarks where appropriate: a `<main>` wrapper for the active content region,
   `<section>` for views, `<nav>`/`<header>`/`<footer>` where they fit. Screens should be
   navigable by region for assistive tech. (Views are toggled by showView(); keep that working —
   this is about the element tag, not the toggling mechanism.)
3. **Grouped controls lack `<fieldset>`/`<legend>`.** Radio/checkbox groups — e.g. Service,
   Frequency, Days of the Week, Half-day AM/PM Preference, Transport — are a shared label over
   a set of inputs. Wrap each group in `<fieldset>` with a `<legend>`. NOTE: the recent label
   pass linked 43 single-input labels via `for`/`id`; the ~3 remaining unlinked labels are
   exactly these group headers — they need `<fieldset>`/`<legend>`, not `for=`.
4. **Forms not wrapped in `<form>`.** Inputs sit as loose `.form-group` divs. Wrap each logical
   form in a `<form>` (with `onsubmit` returning false / preventDefault, since submission is via
   JS fetch, not native POST). This enables Enter-to-submit and correct semantics. IMPORTANT:
   this is a React-free vanilla page, but if any part were React, note the repo rule "never use
   HTML <form> tags in React artifacts" — this portal is plain HTML/JS so `<form>` is correct here.
5. **Heading hierarchy.** Audit `<h1>`–`<h4>` order; fix skipped levels so each view has a sane,
   ordered heading outline.
6. **Interactive semantics.** Audit for `onclick` on non-interactive elements (divs/spans acting
   as buttons). Convert to `<button>` (or add `role="button"` + `tabindex="0"` + key handlers if a
   structural change is too invasive). Confirm links vs buttons are used correctly (`<a>` navigates,
   `<button>` acts).

## Already done (do NOT redo)
- **Label `for`/`id` linking**: 43 single-input labels already linked. 63/74 labels now have
  `for=`; the remaining 11 are 8 wrapping labels (input nested inside — correct, no `for` needed)
  + ~3 group headers (which THIS task converts to `<fieldset>`/`<legend>`).
- **CSS `appearance` lint**: already resolved — every `-webkit-appearance` has an unprefixed
  `appearance` partner. Nothing to do there.
- **Invalid-link recovery view** (`view-invalid`): already rewritten to a helpful state with a
  mailto and a new-client path. Its `<a>`/`<button>` usage is already correct — use it as the
  reference pattern for links-vs-buttons.

## Views in the portal (for orientation)
Token-gated app. Key view IDs include: `view-welcome` (tokenless new-client landing),
`view-lead` (meet & greet form), `view-lead-success`, `view-invalid` (broken-link recovery),
`view-contact` / `view-contact-success`, `view-emergency` (emergency + alternate caregiver),
`view-booking` (+ booking-success), plus onboarding/agreement/compliance/pets views. All are
`<div class="view">` toggled by `showView(id)` in main.js.

## Approach guidance
- **Preserve visuals exactly.** Changing a `<div>` to a `<section>` or wrapping in `<main>`/`<form>`
  must not shift layout. Check that any CSS selectors keying off `div`/class still match; if a
  rule targets `.view` as a div, changing the tag is fine as long as the class stays.
- **Do it in reviewable chunks** but deliver as one consistent final file. Suggested order:
  (a) icon aria-hidden sweep (mechanical, low-risk), (b) fieldset/legend for the ~3 groups,
  (c) form wrappers, (d) landmarks, (e) heading audit, (f) interactive-element audit.
- After edits: run a tag-balance / div-depth python walk AND spot-check rendered structure.
  Confirm `showView()` still shows/hides correctly (it likely toggles a class or style on the
  view element — make sure the selector still matches after tag changes).
- Consider a quick pass with the browser's built-in a11y checker or axe mental-model against the
  WCAG 2.1 AA basics (name/role/value, contrast already handled by design tokens, focus order,
  keyboard operability).

## Files needed to start
Ask Gus to paste the **current** `portal/index.html` (primary target) and `portal/src/main.js`
(to confirm `showView()` and any handlers that assume current markup). `style.css` only if a tag
change risks breaking a selector.

## Status when this handoff was written
Not started. Deferred as its own dedicated pass. The portal is functional and partially
accessible (labels linked, invalid-link state good). This pass makes it semantically correct.
Nothing blocks starting whenever Gus is ready. Purely a refactor — no new features, no visual
change intended.
