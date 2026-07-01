---
title: Website Copy Reconciliation
type: meta
status: active
last_reviewed: 2026-07-01
---

# Website Copy Reconciliation

Single source of truth for resolving conflicts across the draft website pages before build.

**Authority order (highest wins):**
1. Master Client Agreement, Version 1.0, effective June 25, 2026 (Google Doc). Key sections:
   §4 Health & Vaccination, §14 Payment (incl. §14.5 Peak-Season Deposit), §15 Cancellation,
   §16 Operating Hours, §6.4 Designated Veterinary Providers. All dollar amounts defer to the
   Rate Schedule. (The condensed copy embedded in `portal/index.html` matches in substance but
   uses slightly different section numbers.)
2. Deployed code behavior (Airtable formulas, portal booking flow).
3. Gus's decisions recorded below.

Public copy must mirror 1 and 2. Where they disagree, the agreement controls and the code
discrepancy is flagged separately (see "Code discrepancy to fix" at the bottom).

---

## Locked decisions (2026-07-01)

| # | Item | Decision |
|---|------|----------|
| 1 | Operating hours | **Mon-Sat 8:00 AM - 4:30 PM, Sun 12:00 PM - 4:30 PM.** These are the deliberately narrower operating hours, not the wider permit hours (7:30-5:30). Use everywhere. |
| 2 | Peak deposit | **50%** (Gus decision, 2026-07-01). Applied against the final invoice per agreement §14.5. Fix the 25% instances on Home, Book Now, and Pricing to 50% (FAQ's 50% was already right). |
| 3 | Cancellation policy | Mirror agreement §14 verbatim (reference text below). The draft Pricing and FAQ copy is wrong and gets replaced. |
| 4 | Vaccinations | Mirror agreement §3: **Rabies (full certificate), DHPP, and Bordetella (within 12 months) are REQUIRED. Canine Influenza is strongly recommended.** FAQ currently calls Bordetella "recommended" which is wrong. |
| 5 | Founding year | **"Since 2018"** everywhere. Fix the "since 2017" claims on Home body, About, and Pricing. Dated story beats in About (2017 home purchase, VA road trip) can stay as narrative, but reconcile so nothing reads as "operating since 2017." |
| 6 | Booking language | **Do not use "Book" or "Book Now."** Clients **request** a booking / submit a request for review and approval. This is accurate to how the system works (bookings route to owner approval, they are not instant). Rename accordingly (see per-page list). |
| 7 | records@ email | **Not used.** Clients bring a copy to the Meet & Greet or upload directly through the client portal. Remove all `records@pawsonlongmeadow.com` references. |
| 8 | Hosting | **Cloudflare Pages** (same ecosystem as the Worker). Update the Next Steps decision that says GitHub Pages / Netlify. |

---

## Authoritative reference text (copy from these, do not paraphrase loosely)

### Cancellation policy (agreement §15)
- **Grace period:** Cancellations within 4 hours of booking are never charged, regardless of dates. Overrides every tier.
- **Daycare, Half-Day Daycare, Walks & Drop-Ins:** 24+ hours notice = no charge. Under 24 hours, or a no-show = **full session rate**. (There is NO 50% daycare tier.)
- **Boarding & Multi-Night House Sitting:** 7+ days notice = no charge. 48 hours to 7 days = **50% of the total reservation**. Under 48 hours, or a no-show = **full reservation**.
- **Peak season (all tiers tighten):** 14+ days = no charge. 7 to 14 days = 50%. Under 7 days, or a no-show = full.
- **Fine print:** Fees are calculated on the locked final price (already includes any peak surcharge). On an exact boundary, the tier more favorable to the client applies. One-off house sitting, pet taxi, poop scoop, and bath are at reasonable discretion, up to 50% short notice / 100% no-show.

### Designated veterinary providers (agreement §6.4) — for FAQ emergency protocol
- **Local clinic (Sharon):** Sharon Veterinary Clinic, 586 South Main St, Sharon, MA 02067 · (781) 784-7554
- **Primary hospital (daytime):** Foxboro Animal Hospital, 200 Mechanic St, Foxborough, MA 02035 · (508) 543-5350
- **24-hr emergency:** Tufts Veterinary Emergency Treatment & Specialties, 525 South St, Walpole, MA 02081 · (508) 668-5454 (15-20 min away)

The FAQ currently lists only Foxboro and Tufts (no Tufts phone) and omits the Sharon clinic. Align to these three, and note emergency pre-authorization is $500 per incident by default (§6.3).

### Vaccination requirements (agreement §4.1 / §4.3 / §4.6)
- **Required:** Rabies (full certificate per Ollie's Law, not a vaccine-date note), DHPP, Bordetella (within the last 12 months).
- **Strongly recommended:** Canine Influenza.
- **Also required:** at least 6 months old; spayed/neutered (unless written exception); free of fleas, ticks, parasites; not in heat; valid municipal dog license; collar/harness with current rabies tag and municipal dog tag.

---

## Per-page changes

**Home.md**
- Trust bar: "since 2018" (already correct here); remove emoji, convert to sprite icons at build.
- Body "doing this professionally since 2018" already fine; ensure no "2017" anywhere.
- Rename the "[Book a Stay]" CTA to "[Request a Stay]"; "Ready to Book?" section heading to request-based language.
- Services list emoji become sprite icons at build.

**About.md**
- Reconcile founding-year framing to "since 2018" (keep 2017 as a story date, not an "operating since" claim).
- **Privacy:** remove the street name ("Longmeadow Lane"). Use neighborhood-level phrasing.
- Resolve the open question of naming the kids publicly (Next Steps already flags this).

**Our Home.md**
- No pricing/policy conflicts. Confirm curbside/hours references match decision #1.

**Pricing.md**
- **Replace the entire Cancellation Policy section** with agreement §14 text above (the current 24hr/50% daycare tier and "48hr no charge" boarding are wrong).
- Peak deposit: state agreement language; hold the exact % until confirmed (#2).
- **Remove the internal "For reference Rover / Holiday Rate" block** (internal, and its dates conflict with the Peak Season 2026 table above it).
- Keep the Peak Season 2026 table (verify dates against Rate Schedule).
- Rename booking CTAs to request-based language.

**FAQ.md**
- Hours: change to **Mon-Sat 8:00-4:30, Sun 12:00-4:30** (currently 7:30-5:30 / 12-6).
- Bordetella: change from "recommended" to **required (within 12 months)** per #4.
- Payment Q (`#todo`): resolve with agreement Payment/Rate Schedule language.
- Deposit Q: reconcile to one percentage (#2).
- Cancellation Q: replace with agreement §14 language.
- Booking Q "How do I book" → request-based language.

**Ollie's Law.md**
- Insert verified mass.gov URL before launch (`#todo`).
- No policy conflicts.

**Gallery.md**
- Blocked on photography. Confirm social handles before publishing.

**Contact.md**
- Hours: change "Mon-Fri 8:15-4:45" to decision #1 hours (and Sat/Sun).
- Map: neighborhood-level only, no street address.
- "Book a Stay" CTA → "Request a Stay".

**Request a Meet & Greet.md**
- Step 4: remove `records@` instruction; replace with "bring a copy to your Meet & Greet or upload through your client portal."
- Vaccination list: align to #4 (Bordetella required).
- Reconcile the 5-step form fields against the live Leads table (see `handoffs/01_convert-to-client.md` field map) so the site form matches what `/lead` accepts.

**Next Steps.md**
- Hosting decision → Cloudflare Pages (#8).
- records@ item → drop (#7).

**Book Now.md**
- Rename page away from "Book Now" (e.g. "Request a Stay" / "Request a Booking") per #6.
- Step 5: remove `records@` reference.
- Cancellation confirm text: match agreement §14.
- All "Book" CTAs → "Request".

**Book Us.md** (returning-client request flow)
- Rename title "Book a Stay" → "Request a Stay".
- Confirm the form maps to the portal's booking request flow and only offers services the portal can book (Daycare / Half-Daycare / Boarding), routing other services to manual/meet-and-greet handling.
- Cancellation confirm text: match agreement §14.

---

## Services: advertise vs. book
The site advertises 7 services; the portal currently books 3 (Daycare, Half-Daycare, Boarding).
House Sitting, Drop-In, Group Walk are handled manually; **Pet Taxi is parked pending commercial
auto insurance.** Decision needed: advertise all but only accept online requests for the live 3
(others route to Meet & Greet / direct contact), and **do not publish Pet Taxi pricing until the
insurance is resolved.**

---

## Verified pricing (Airtable Services + Pricing Rules, pulled 2026-07-01)

Prices live in the **Services** table (base rates) and **Pricing Rules** table (modifiers).
There is no "Rate Schedule" document; this section is the closest thing to one.

### Base rates (all match the draft Pricing page, confirmed correct)
| Service | Base rate |
|---|---|
| Boarding | $85 / night |
| Full-Day Daycare | $50 / day |
| Half-Day Daycare | $35 |
| House Sitting | $105 / night |
| Drop-In Visit | $35 |
| Group Walk | $35 |
| Pet Taxi | $20 base |
| Transport (Add-on) | $5 / leg |
| Poop Scoop | $60 base (inactive; keep "Coming Soon" on site) |

### Modifier discrepancies — draft Pricing page is WRONG, fix to these
| Item | Draft says | Correct (verified) |
|---|---|---|
| House Sitting peak surcharge | +$10/night | **+$25/night** |
| House Sitting additional cat | +$20/night | **+$25/night** |
| Drop-In additional dog | +$10/visit | **+$15/visit** |
| Drop-In additional cat | +$5/visit | **+$10/visit** |

Note: **Boarding second dog = $15 off/night is CORRECT** (the code default,
`ADDITIONAL_DOG_DISCOUNT_DEFAULT = 15`). The $20 "Additional Dog Discount: Boarding" rule in
Pricing Rules only applies to clients who have it explicitly linked, so it is a per-client perk,
not the standard rate. Do not publish $20.

### Script-only numbers — all VERIFIED correct against pricing-engine.js
- Multi-night boarding: $5/$10/$15 off per night at 12+/18+/28+ nights → nets to $80/$75/$70 on the $85 base. Correct. (Applies to any Overnight stay, incl. House Sitting.)
- Late checkout: Noon = half-day base ($35), Late Afternoon = full-day base ($50), waived at 8+ nights. Correct.
- Mileage: `(miles - 5) * 1.87` = first 5 free, then $1.87/mi. Correct.
- Transport second dog: `base * 0.5` = 50% off the $5 add-on. Correct.

### Peak surcharges (2026) the draft omits (decide whether to publish per-service)
Daycare +$10, Half-Day +$5, Drop-In +$5, Group Walk +$2.50, Pet Taxi +$10,
Boarding +$10 (draft has this), House Sitting +$25.

### NOT encoded in Airtable — live only in the pricing automation script (need Gus/script to verify)
- Multi-night boarding discount tiers (draft: 12-17 $80, 18-27 $75, 28+ $70)
- Late-checkout fees (draft: noon $35, late afternoon $50)
- Mileage rate (draft: first 5 mi free, then $1.87/mile)
- Transport second-dog 50% off (draft)

### Not public — never put on the website
"Friends & Family Discount", "Beta Buddy Bonus", and "Holiday Immunity" are internal
client-specific pricing rules. Keep them off all public copy.

### Peak deposit %
**Not encoded anywhere** (not in Services, Pricing Rules, or the agreement). This is a business
decision Gus must make. Draft uses 25% on Home/Book Now/Pricing and 50% on FAQ.

---

## Open items (need input)
- [x] Master Client Agreement received (Version 1.0, eff. June 25, 2026). Cancellation, vaccinations, hours, and vet providers locked to it.
- [x] Pricing pulled from Airtable (Services + Pricing Rules). Base rates verified; modifier discrepancies logged above.
- [x] Peak Season 2026 dates verified against the Holidays table (draft table is correct; strip the Rover reference block).
- [x] **Peak deposit % = 50%** (Gus, 2026-07-01). Fix 25% on Home/Book Now/Pricing.
- [x] Script-only numbers verified against `airtable-scripts/pricing-engine.js` (multi-night, late-checkout, mileage, transport 2nd-dog all correct). Script now mirrored in the repo.
- [ ] Services decision above (advertise-all vs. book-three; Pet Taxi hold).
- [ ] mass.gov Ollie's Law URL.
- [ ] Social handles confirmed live.
- [ ] Business phone number.

---

## Code discrepancy to fix (separate from copy)
`src/cancellation.js` (lines 85-86) sends a client confirmation email whose policy wording is
**stale** and contradicts the deployed agreement §14:
- It tells daycare clients "under 24 hours = 50% of the session rate." Agreement says **full**.
- It tells boarding clients "under 48 hours = one night's boarding rate." Agreement says the
  tiered 7-day / 48-hour structure (48hr-7d = 50%, under 48hr = full reservation).
This is deployed code emailing clients an incorrect policy. Worth fixing so the email matches the
agreement and the website copy.
