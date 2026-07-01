// =====================================================================
// PRICINGENGINE v2.2
// Airtable Automation — Run Script
// Calculates final price for pet service appointments and writes
// Pricing Notes, Client Message, Locked Final Price, Peak Season,
// Applied Pricing Rule, Price Last Updated, Priced By,
// Service Category, and Client back to the Appointments record.
//
// Handles: Overnight (Boarding / House Sitting), Daycare, Pet Taxi,
//          Drop-In Visit
//
// New in v2.2:
// - PERFORMANCE FIX: all Pricing Rules are now loaded ONCE into an
//   in-memory map (pricingRulesById) and looked up from there, instead
//   of querying the Pricing Rules table one record at a time inside
//   loops. This eliminates the "Exceeded quota of 30 table queries per
//   script invocation" error that hit peak-season / multi-rule bookings.
//   Pricing math is unchanged — only how rule records are retrieved.
// - House Sitting and Drop-In branches now reuse the same in-memory
//   rules list instead of re-querying the whole table.
//
// From v2.1:
// - Client Pricing table override: custom base rates per client/service.
// - hasCustomBasePrice flag: skips standard discounts when a custom base
//   rate is set. Holiday immunity still applies.
//
// ---------------------------------------------------------------------
// REPO MIRROR NOTE (not executed here):
// The live copy of this script runs as an Airtable Automation on base
// appvQb876VInNJlnB. Airtable is the source of truth for the RUNNING
// version. This file is a version-controlled mirror — when you edit the
// script in Airtable, paste the updated copy here and commit it. It uses
// Airtable's scripting globals (input, base, output) and top-level await,
// so `node --check` will not pass on it; that is expected.
// =====================================================================

let inputConfig = input.config();
let apptId = inputConfig.apptId;
if (!apptId) {
    output.set("pricingNotes", "ERROR: No appointment ID provided.");
    return;
}

// =====================================================================
// MODULE 1: SETUP & DATA LOADING
// =====================================================================

const apptsTable        = base.getTable("Appointments");
const petsTable         = base.getTable("Pets");
const clientsTable      = base.getTable("Clients");
const servicesTable     = base.getTable("Services");
const holidayTable      = base.getTable("Holidays and Busy Periods");
const pricingRulesTable = base.getTable("Pricing Rules");
const clientPricingTable = base.getTable("Client Pricing");

// Load appointment record
let appt = await apptsTable.selectRecordAsync(apptId, {
    fields: [
        "Start Date", "End Date", "Service", "Number of Pets", "Pets",
        "Start Time", "End Time", "Manual Rate Adjustment", "Total Expenses",
        "Transport Option", "Total Mileage", "Wait Time", "Tolls",
        "Applied Pricing Rule", "Force Reprice"
    ]
});
if (!appt) {
    output.set("pricingNotes", "ERROR: Appointment record not found.");
    return;
}

// Core appointment values
const serviceLink = appt.getCellValue("Service");
const serviceId   = serviceLink?.[0]?.id;
const serviceName = serviceLink?.[0]?.name || "";
const numPets     = appt.getCellValue("Number of Pets") || 1;
const startTime   = appt.getCellValue("Start Time")?.name || "";
const endTime     = appt.getCellValue("End Time")?.name || "";
const manualAdj   = appt.getCellValue("Manual Rate Adjustment") || 0;
const expenses    = appt.getCellValue("Total Expenses") || 0;
const startDate   = new Date(appt.getCellValue("Start Date"));
const endDate     = new Date(appt.getCellValue("End Date") || appt.getCellValue("Start Date"));

if (!serviceId) {
    output.set("pricingNotes", "ERROR: No service linked to this appointment.");
    return;
}

// Load all services in one query
let servicesQuery = await servicesTable.selectRecordsAsync({
    fields: ["Service Name", "Base Price", "Service Type"]
});

// ─────────────────────────────────────────────────────────────────────
// Load ALL pricing rules ONCE, in a single query, and index by record ID.
// Every rule lookup below reads from this map instead of querying the
// Pricing Rules table per-rule. This is the v2.2 fix that keeps the whole
// script well under Airtable's 30-query-per-invocation limit.
// ─────────────────────────────────────────────────────────────────────
let pricingRulesQuery = await pricingRulesTable.selectRecordsAsync({
    fields: [
        "Pricing Rule Name", "Adjustment Amount", "Adjustment Type",
        "Services", "Holiday Immunity", "Rule Type", "Start Date", "End Date"
    ]
});
let pricingRulesById = {};
for (let r of pricingRulesQuery.records) {
    pricingRulesById[r.id] = r;
}

let mainServiceRec = servicesQuery.records.find(r => r.id === serviceId);
let halfDaycareRec = servicesQuery.records.find(r => r.getCellValue("Service Name") === "Half-Daycare");
let fullDaycareRec = servicesQuery.records.find(r => r.getCellValue("Service Name") === "Daycare");

const basePrice       = mainServiceRec?.getCellValue("Base Price") || 0;
const halfDaycareId   = halfDaycareRec?.id;
const halfDaycareBase = halfDaycareRec?.getCellValue("Base Price") || 0;
const fullDaycareId   = fullDaycareRec?.id;
const fullDaycareBase = fullDaycareRec?.getCellValue("Base Price") || 0;

if (basePrice === 0) {
    output.set("pricingNotes", `ERROR: Base price missing for service "${serviceName}".`);
    return;
}

// Service emoji + initial mapping
const SERVICE_INITIALS = {
    "Daycare":        "DC",
    "Half-Daycare":   "HD",
    "Boarding":       "B",
    "House Sitting":  "HS",
    "Pet Taxi":       "PT",
    "Group Walk":     "GW",
    "Drop-In Visit":  "DV",
};
const SERVICE_EMOJIS = {
    "Daycare":        "☀️",
    "Half-Daycare":   "🌤️",
    "Boarding":       "🏠🛏️",
    "House Sitting":  "🏡🔑",
    "Pet Taxi":       "🚙",
    "Group Walk":     "🦮",
    "Drop-In Visit":  "🚪",
};
const serviceInitial = SERVICE_INITIALS[serviceName] || serviceName;
const serviceEmoji   = SERVICE_EMOJIS[serviceName] || "🐾";

// ── EXTENDED STAY TIERS ───────────────────────────────────────────────
function getExtendedStayDiscount(nights) {
    if (nights >= 28) return 15;
    if (nights >= 18) return 10;
    if (nights >= 12) return 5;
    return 0;
}

// ── ADDITIONAL DOG DISCOUNT (Boarding only) ───────────────────────────
const ADDITIONAL_DOG_DISCOUNT_DEFAULT = 15;

// ── DROP-IN ADDITIONAL ANIMAL FEES ───────────────────────────────────
const DROP_IN_EXTRA_DOG_DEFAULT = 10;
const DROP_IN_EXTRA_CAT_DEFAULT = 5;

// ── LATE CHECKOUT PICKUP LABEL HELPER ────────────────────────────────
function getPickupLabel(endTimeStr) {
    if (endTimeStr.includes("Noon"))           return "Noon Pickup";
    if (endTimeStr.includes("Late Afternoon")) return "Evening";
    if (endTimeStr.includes("After Hours"))    return "After Hours Pickup";
    return "Late Pickup";
}

// =====================================================================
// MODULE 2: HOLIDAY DETECTION
// =====================================================================

let activeHolidayRecord = null;
let isPeakSeason        = false;
let seasonName          = "";
let appliedRuleIds      = [];

let holidays = await holidayTable.selectRecordsAsync({
    fields: ["Season Name", "Start Date", "End Date", "Active", "Pricing Rules"]
});

for (let hol of holidays.records) {
    if (!hol.getCellValue("Active")) continue;

    let actualHStart = new Date(hol.getCellValue("Start Date"));
    let actualHEnd   = new Date(hol.getCellValue("End Date") || hol.getCellValue("Start Date"));
    actualHStart.setHours(0, 0, 0, 0);
    actualHEnd.setHours(0, 0, 0, 0);

    const BUFFER_BEFORE = 1;
    const BUFFER_AFTER  = 1;

    let bufferedHStart = new Date(actualHStart);
    bufferedHStart.setDate(bufferedHStart.getDate() - BUFFER_BEFORE);

    let bufferedHEnd = new Date(actualHEnd);
    bufferedHEnd.setDate(bufferedHEnd.getDate() + BUFFER_AFTER);

    if (startDate <= bufferedHEnd && endDate >= actualHStart) {
        activeHolidayRecord = hol;
        isPeakSeason        = true;
        seasonName          = hol.getCellValue("Season Name") || "";
        break;
    }
}

// =====================================================================
// MODULE 3: CLIENT PRICING OVERRIDE + CLIENT RULES
// =====================================================================

// Helper: resolve adjustment amount based on type
function calcAdjustment(ruleRecord, base) {
    let amount = ruleRecord.getCellValue("Adjustment Amount") || 0;
    let type   = ruleRecord.getCellValue("Adjustment Type")?.name || "Fixed ($)";
    return type === "Percentage (%)" ? (amount / 100) * base : amount;
}

// Helper: check if a rule is active for the appointment date
function isRuleActive(ruleRecord, apptDate) {
    let ruleStart = ruleRecord.getCellValue("Start Date");
    let ruleEnd   = ruleRecord.getCellValue("End Date");
    if (ruleStart && new Date(ruleStart) > apptDate) return false;
    if (ruleEnd   && new Date(ruleEnd)   < apptDate) return false;
    return true;
}

// Helper: find the holiday surcharge for a given service ID.
// Reads rules from the in-memory pricingRulesById map (no per-rule query).
function getSurcharge(holidayRec, targetServiceId, baseForPct) {
    if (!holidayRec) return { amount: 0, ruleId: null };
    let ruleLinks = holidayRec.getCellValue("Pricing Rules") || [];
    for (let rLink of ruleLinks) {
        let r = pricingRulesById[rLink.id];
        if (!r) continue;
        if (r.getCellValue("Services")?.some(s => s.id === targetServiceId)) {
            if (!isRuleActive(r, startDate)) continue;
            return { amount: calcAdjustment(r, baseForPct), ruleId: r.id };
        }
    }
    return { amount: 0, ruleId: null };
}

// ── CLIENT PRICING TABLE OVERRIDE ────────────────────────────────────
// Resolve client link first (needed for both override and standard rules)
let clientLink = null;
{
    let petsLink = appt.getCellValue("Pets");
    if (petsLink && petsLink.length > 0) {
        let petRecord = await petsTable.selectRecordAsync(petsLink[0].id, { fields: ["Clients"] });
        clientLink = petRecord?.getCellValue("Clients");
    }
}

let customBasePrice      = null;  // overrides basePrice for main service
let customTransportFlat  = null;  // flat transport rate (no extra-pet fee)
let customPriceNote      = "";
let hasCustomTransport   = false;
let hasCustomBasePrice = false;
if (clientLink && clientLink.length > 0) {
    let pricingQuery = await clientPricingTable.selectRecordsAsync({
        fields: ["Client", "Service", "Rate", "Unit", "Notes", "Active"]
    });
    for (let pr of pricingQuery.records) {
        if (!pr.getCellValue("Active")) continue;
        let prClients = pr.getCellValue("Client") || [];
        if (!prClients.some(c => c.id === clientLink[0].id)) continue;
        let prService = pr.getCellValue("Service")?.name || "";
        let rate      = pr.getCellValue("Rate") || 0;
        let unit      = pr.getCellValue("Unit")?.name || "";
        let note      = pr.getCellValue("Notes") || "";

        if (prService === "Pet Taxi" && serviceName === "Pet Taxi") {
    // Standalone Pet Taxi service
    customTransportFlat = rate;
    hasCustomTransport  = true;
    customPriceNote    += `Custom Transport: $${rate}/${unit}${note ? " — " + note : ""}. `;
} else if (prService === "Transport" && serviceName !== "Pet Taxi") {
    // Transport add-on for Boarding/Daycare
    customTransportFlat = rate;
    hasCustomTransport  = true;
    customPriceNote    += `Custom Transport: $${rate}/${unit}${note ? " — " + note : ""}. `;
} else if (prService === serviceName) {
    // Custom base rate for this service — overrides all standard discounts
    customBasePrice = rate;
    customPriceNote += `Custom Rate: $${rate}/${unit}${note ? " — " + note : ""}. `;
    hasCustomBasePrice = true;
}
    }
}

// Effective base price — custom overrides standard
const effectiveBasePrice = customBasePrice !== null ? customBasePrice : basePrice;

// ── STANDARD CLIENT RULES ─────────────────────────────────────────────
let bonusAmt           = 0;
let bonusNames         = [];
let additionalDogAmt   = 0;
let additionalDogNames = [];
let hasImmunity        = false;
let clientRuleIds      = [];

let dropInExtraDogAmt = 0;
let dropInExtraCatAmt = 0;
let dropInExtraDogId  = null;
let dropInExtraCatId  = null;

{
    let petsLink = appt.getCellValue("Pets");
    if (clientLink && clientLink.length > 0) {
        let clientRecord = await clientsTable.selectRecordAsync(clientLink[0].id, { fields: ["Pricing Rules"] });
        let clientRules  = clientRecord?.getCellValue("Pricing Rules") || [];
        for (let ruleLink of clientRules) {
            let rule = pricingRulesById[ruleLink.id];
            if (!rule) continue;
            if (!rule.getCellValue("Services")?.some(s => s.id === serviceId)) continue;
            if (!isRuleActive(rule, startDate)) continue;

            let ruleType = rule.getCellValue("Rule Type")?.name || "Client Discount";
            let adj      = calcAdjustment(rule, effectiveBasePrice);
            let ruleName = rule.getCellValue("Pricing Rule Name") || "Client Bonus";

if (rule.getCellValue("Holiday Immunity") === true) {
    hasImmunity = true;
    // Always apply immunity even with custom pricing
}

// Skip discount rules when custom base price is set
if (!hasCustomBasePrice) {
    if (ruleType === "Per Additional Dog") {
        additionalDogAmt += adj;
        additionalDogNames.push(ruleName);
    } else {
        bonusAmt += adj;
        bonusNames.push(ruleName);
    }
    clientRuleIds.push(rule.id);
}
        }
    }
}

// Load Drop-In additional animal fee rules (reuse in-memory rules list)
if (serviceName === "Drop-In Visit") {
    for (let r of pricingRulesQuery.records) {
        if (!r.getCellValue("Services")?.some(s => s.id === serviceId)) continue;
        if (!isRuleActive(r, startDate)) continue;
        let ruleType = r.getCellValue("Rule Type")?.name;
        if (ruleType === "Per Additional Dog") {
            dropInExtraDogAmt = Math.abs(calcAdjustment(r, effectiveBasePrice)) || DROP_IN_EXTRA_DOG_DEFAULT;
            dropInExtraDogId  = r.id;
        }
        if (ruleType === "Per Additional Cat") {
            dropInExtraCatAmt = Math.abs(calcAdjustment(r, effectiveBasePrice)) || DROP_IN_EXTRA_CAT_DEFAULT;
            dropInExtraCatId  = r.id;
        }
    }
    if (dropInExtraDogAmt === 0) dropInExtraDogAmt = DROP_IN_EXTRA_DOG_DEFAULT;
    if (dropInExtraCatAmt === 0) dropInExtraCatAmt = DROP_IN_EXTRA_CAT_DEFAULT;
}

// Holiday surcharge lookup
let mainSurcharge    = { amount: 0, ruleId: null };
let wouldBeSurcharge = { amount: 0, ruleId: null };
if (activeHolidayRecord) {
    wouldBeSurcharge = getSurcharge(activeHolidayRecord, serviceId, effectiveBasePrice);
    if (!hasImmunity) {
        mainSurcharge = wouldBeSurcharge;
        if (mainSurcharge.ruleId) appliedRuleIds.push(mainSurcharge.ruleId);
    }
}

let halfDaycareSurcharge = { amount: 0, ruleId: null };
let fullDaycareSurcharge = { amount: 0, ruleId: null };
if (activeHolidayRecord && !hasImmunity) {
    halfDaycareSurcharge = getSurcharge(activeHolidayRecord, halfDaycareId, halfDaycareBase);
    fullDaycareSurcharge = getSurcharge(activeHolidayRecord, fullDaycareId, fullDaycareBase);
}

appliedRuleIds.push(...clientRuleIds);

// =====================================================================
// MODULE 4: PRICING CALCULATION
// =====================================================================

let finalPrice = 0;
let noteparts  = [];
let msgparts   = [];
let msgWaivers = [];

const serviceType = mainServiceRec?.getCellValue("Service Type")?.name || "";

if (!serviceType) {
    output.set("pricingNotes", `ERROR: Service Type not set for "${serviceName}".`);
    return;
}

function peakLabel(amount, immunity) {
    if (!isPeakSeason) return "";
    if (immunity) return ` + Peak: $0 [VIP Perk]`;
    if (amount !== 0) return ` + Peak: $${amount}`;
    return "";
}

function peakStr() {
    if (!isPeakSeason || hasImmunity || mainSurcharge.amount === 0) return "";
    return ` + $${mainSurcharge.amount} peak`;
}

function bonusStr() {
    if (bonusAmt === 0) return "";
    return ` ${bonusAmt < 0 ? "-" : "+"} $${Math.abs(bonusAmt)} ${bonusNames.join(" + ")}`;
}

function fmtDate(d) {
    return (d.getUTCMonth() + 1).toString().padStart(2, '0') + '/' + d.getUTCDate().toString().padStart(2, '0');
}

function fmtTime(t) {
    if (t.includes("Early morning"))  return "AM";
    if (t.includes("Noon"))           return "Noon";
    if (t.includes("Late Afternoon")) return "PM";
    if (t.includes("After Hours"))    return "After Hours";
    return t;
}

function fmtTimeInternal(t) {
    if (t.includes("Early morning"))  return "Early AM";
    if (t.includes("Noon"))           return "Noon";
    if (t.includes("Late Afternoon")) return "Late PM";
    if (t.includes("After Hours"))    return "After Hours";
    return t;
}

// ── BRANCH A: OVERNIGHT (Boarding / House Sitting) ───────────────────
if (serviceType === "Overnight") {

    let numNights            = Math.max(1, Math.floor(Math.abs(endDate - startDate) / (1000 * 60 * 60 * 24)));
    let extendedStayDiscount = getExtendedStayDiscount(numNights);
    let isExtendedStay       = extendedStayDiscount > 0;
    let lastDayWaived        = numNights >= 8;
    let isHouseSitting       = serviceName === "House Sitting";

    let numDogs        = 0;
    let numCats        = 0;
    let petNames       = [];
    let hsExtraDogAmt  = 0;
    let hsExtraCatAmt  = 0;
    let hsExtraDogId   = null;
    let hsExtraCatId   = null;
    let hsMileageTotal = 0;

    if (isHouseSitting) {
        let petsLink = appt.getCellValue("Pets");
        if (petsLink && petsLink.length > 0) {
            for (let petLink of petsLink) {
                let petRec = await petsTable.selectRecordAsync(petLink.id, {
                    fields: ["Species (from Breeds)", "Pet Name"]
                });
                let species     = petRec?.getCellValue("Species (from Breeds)");
                let speciesName = Array.isArray(species) ? species[0] : species;
                let petName     = petRec?.getCellValue("Pet Name") || "";
                if (petName) petNames.push(petName);
                if (speciesName === "Dog") numDogs++;
                else if (speciesName === "Cat") numCats++;
            }
        }

        // Reuse in-memory rules list (no extra query)
        for (let r of pricingRulesQuery.records) {
            if (!r.getCellValue("Services")?.some(s => s.id === serviceId)) continue;
            if (!isRuleActive(r, startDate)) continue;
            let ruleType = r.getCellValue("Rule Type")?.name;
            if (ruleType === "Per Additional Dog") {
                hsExtraDogAmt = Math.abs(calcAdjustment(r, effectiveBasePrice));
                hsExtraDogId  = r.id;
            }
            if (ruleType === "Per Additional Cat") {
                hsExtraCatAmt = Math.abs(calcAdjustment(r, effectiveBasePrice));
                hsExtraCatId  = r.id;
            }
        }

        let totalMileage = appt.getCellValue("Total Mileage") || 0;
        hsMileageTotal   = Math.max(0, totalMileage - 5) * 1.87;
    }

    let hsExtraDogs     = isHouseSitting ? (numDogs > 0 ? Math.max(0, numDogs - 2) : 0) : 0;
    let hsExtraCats     = isHouseSitting ? (numDogs > 0 ? numCats : Math.max(0, numCats - 2)) : 0;
    let hsExtraDogTotal = hsExtraDogs * hsExtraDogAmt * numNights;
    let hsExtraCatTotal = hsExtraCats * hsExtraCatAmt * numNights;

    if (hsExtraDogs > 0 && hsExtraDogId) appliedRuleIds.push(hsExtraDogId);
    if (hsExtraCats > 0 && hsExtraCatId) appliedRuleIds.push(hsExtraCatId);

    let dog1Rate = effectiveBasePrice + mainSurcharge.amount + bonusAmt + manualAdj - extendedStayDiscount;

    let dog2Rate = 0;
    let clientAdditionalDogDiscount = 0;
    let dog2BestDiscount            = 0;
    if (!isHouseSitting) {
        clientAdditionalDogDiscount = hasCustomBasePrice ? 0 : (additionalDogAmt !== 0 ? Math.abs(additionalDogAmt) : ADDITIONAL_DOG_DISCOUNT_DEFAULT);
        dog2BestDiscount            = Math.max(extendedStayDiscount, clientAdditionalDogDiscount);
        dog2Rate                    = effectiveBasePrice + mainSurcharge.amount + bonusAmt + manualAdj - dog2BestDiscount;
    }

    let dog1Total  = dog1Rate * numNights;
    let dog2Total  = !isHouseSitting && numPets > 1 ? dog2Rate * numNights * (numPets - 1) : 0;
    let nightTotal = dog1Total + dog2Total + hsExtraDogTotal + hsExtraCatTotal + hsMileageTotal;

    let lastDayBase      = 0;
    let lastDaySurcharge = 0;
    let lastDayLabel     = "";
    let lastDayRuleId    = null;

    if (endTime.includes("Noon")) {
        lastDayBase      = halfDaycareBase;
        lastDaySurcharge = halfDaycareSurcharge.amount;
        lastDayLabel     = "Half-Daycare";
        lastDayRuleId    = halfDaycareSurcharge.ruleId;
    } else if (endTime.includes("Late Afternoon") || endTime.includes("After Hours")) {
        lastDayBase      = fullDaycareBase;
        lastDaySurcharge = fullDaycareSurcharge.amount;
        lastDayLabel     = "Daycare";
        lastDayRuleId    = fullDaycareSurcharge.ruleId;
    }

    let lastDayDogTotal = 0;
    let lastDayCatTotal = 0;
    let lastDayTotal    = 0;

    if (!lastDayWaived && lastDayBase > 0) {
        lastDayDogTotal = lastDayBase + lastDaySurcharge;
        lastDayCatTotal = isHouseSitting ? (hsExtraCats * hsExtraCatAmt) : 0;
        lastDayTotal    = lastDayDogTotal + lastDayCatTotal + (!isHouseSitting ? (lastDayBase + lastDaySurcharge) * (numPets - 1) : 0);
        if (lastDayRuleId) appliedRuleIds.push(lastDayRuleId);
    }

    finalPrice = nightTotal + lastDayTotal + expenses;

    let pickupLabel = getPickupLabel(endTime);

    let dog1Breakdown = `$${effectiveBasePrice}/night`;
    dog1Breakdown += peakLabel(mainSurcharge.amount, hasImmunity);
    if (bonusAmt !== 0)  dog1Breakdown += ` ${bonusAmt < 0 ? "-" : "+"} ${bonusNames.join(" + ")}: $${Math.abs(bonusAmt)}`;
    if (manualAdj !== 0) dog1Breakdown += ` ${manualAdj < 0 ? "-" : "+"} Adjustment: $${Math.abs(manualAdj)}`;
    if (isExtendedStay)  dog1Breakdown += ` - Extended Stay: $${extendedStayDiscount}`;
    noteparts.push(`Dog 1: (${dog1Breakdown}) × ${numNights} night${numNights > 1 ? "s" : ""} = $${dog1Total.toFixed(2)}`);

    if (!isHouseSitting && numPets > 1) {
        let dog2Breakdown = `$${effectiveBasePrice}/night`;
        dog2Breakdown += peakLabel(mainSurcharge.amount, hasImmunity);
        if (bonusAmt !== 0)   dog2Breakdown += ` ${bonusAmt < 0 ? "-" : "+"} ${bonusNames.join(" + ")}: $${Math.abs(bonusAmt)}`;
        if (manualAdj !== 0)  dog2Breakdown += ` ${manualAdj < 0 ? "-" : "+"} Adjustment: $${Math.abs(manualAdj)}`;
        let dog2DiscountLabel = dog2BestDiscount === extendedStayDiscount && extendedStayDiscount > clientAdditionalDogDiscount ? "Extended Stay" : "2nd Dog";
        dog2Breakdown        += ` - ${dog2DiscountLabel}: $${dog2BestDiscount}`;
        noteparts.push(`Dog 2+: (${dog2Breakdown}) × ${numNights} night${numNights > 1 ? "s" : ""} × ${numPets - 1} dog${numPets - 1 > 1 ? "s" : ""} = $${dog2Total.toFixed(2)}`);
    }

    if (isHouseSitting) {
        if (hsExtraDogs > 0) noteparts.push(`Extra Dog${hsExtraDogs > 1 ? "s" : ""}: $${hsExtraDogAmt}/night × ${hsExtraDogs} × ${numNights} nights = $${hsExtraDogTotal.toFixed(2)}`);
        if (hsExtraCats > 0) noteparts.push(`Extra Cat${hsExtraCats > 1 ? "s" : ""}: $${hsExtraCatAmt}/night × ${hsExtraCats} × ${numNights} nights = $${hsExtraCatTotal.toFixed(2)}`);
        if (hsMileageTotal > 0) noteparts.push(`Mileage: $${hsMileageTotal.toFixed(2)}`);
    }

    if (lastDayLabel) {
        if (lastDayWaived) {
            noteparts.push(`(Late Checkout (${pickupLabel}): waived after 8 nights)`);
        } else {
            let lastDayBreakdown = `Late Checkout (${pickupLabel}): $${lastDayBase}`;
            if (lastDaySurcharge !== 0) lastDayBreakdown += hasImmunity ? ` + Peak: $0 [VIP Perk]` : ` + Peak: $${lastDaySurcharge}`;
            if (isHouseSitting && hsExtraCats > 0) lastDayBreakdown += ` + Cat${hsExtraCats > 1 ? "s" : ""}: $${lastDayCatTotal.toFixed(2)}`;
            else if (!isHouseSitting && numPets > 1) lastDayBreakdown += ` × ${numPets} pets`;
            noteparts.push(`(${lastDayBreakdown}) = $${lastDayTotal.toFixed(2)}`);
        }
    }

    let petNameStr = isHouseSitting && petNames.length > 0
        ? `[${petNames.join(" & ")}] `
        : "";

    msgparts.push(`${serviceEmoji} ${petNameStr}${serviceName} | ${fmtDate(startDate)} ${fmtTime(startTime)} – ${fmtDate(endDate)} ${fmtTime(endTime)}`);
    if (isPeakSeason) msgparts.push(`📅 ${seasonName}`);
    msgparts.push("");

    if (numPets === 1 || isHouseSitting) {
        let line = isExtendedStay
            ? `$${effectiveBasePrice}${peakStr()}${bonusStr()} - $${extendedStayDiscount} extended stay = $${dog1Rate}/night x ${numNights} night${numNights > 1 ? "s" : ""} = $${dog1Total.toFixed(2)}`
            : `$${effectiveBasePrice}${peakStr()}${bonusStr()}/night x ${numNights} night${numNights > 1 ? "s" : ""} = $${dog1Total.toFixed(2)}`;
        msgparts.push(line);
    } else {
        let dog2DiscountLabel = dog2BestDiscount === extendedStayDiscount && extendedStayDiscount > clientAdditionalDogDiscount ? "extended stay" : "2nd dog";
        let dog1Line = isExtendedStay
            ? `Dog 1: $${effectiveBasePrice}${peakStr()}${bonusStr()} - $${extendedStayDiscount} extended stay = $${dog1Rate}/night x ${numNights} nights = $${dog1Total.toFixed(2)}`
            : `Dog 1: $${effectiveBasePrice}${peakStr()}${bonusStr()}/night x ${numNights} nights = $${dog1Total.toFixed(2)}`;
        let dog2Line = hasCustomBasePrice
    ? `Dog 2: $${effectiveBasePrice}${peakStr()}/night x ${numNights} nights = $${dog2Total.toFixed(2)}`
    : `Dog 2: $${effectiveBasePrice}${peakStr()}${bonusStr()} - $${dog2BestDiscount} ${dog2DiscountLabel} = $${dog2Rate}/night x ${numNights} nights = $${dog2Total.toFixed(2)}`;
        msgparts.push(dog1Line);
        msgparts.push(dog2Line);
    }

    if (isHouseSitting) {
        if (hsExtraDogs > 0) msgparts.push(`+ $${hsExtraDogAmt} x ${hsExtraDogs} extra dog${hsExtraDogs > 1 ? "s" : ""}/night x ${numNights} nights = $${hsExtraDogTotal.toFixed(2)}`);
        if (hsExtraCats > 0) msgparts.push(`+ $${hsExtraCatAmt} x ${hsExtraCats} cat${hsExtraCats > 1 ? "s" : ""}/night x ${numNights} nights = $${hsExtraCatTotal.toFixed(2)}`);
        if (hsMileageTotal > 0) msgparts.push(`+ Mileage: $${hsMileageTotal.toFixed(2)}`);
    }

    if (lastDayLabel) {
        if (lastDayWaived) {
            let lastDayCostIfNotWaived = isHouseSitting
                ? (lastDayBase + lastDaySurcharge) + (hsExtraCats * hsExtraCatAmt)
                : (lastDayBase + lastDaySurcharge) * numPets;
            msgWaivers.push(`Late Checkout (${pickupLabel}): $${lastDayCostIfNotWaived.toFixed(2)} → $0 (8+ nights) 🎉`);
        } else {
            msgparts.push(`Late Checkout (${pickupLabel}): $${lastDayTotal.toFixed(2)}`);
        }
    }

    if (isPeakSeason && hasImmunity) {
        let peakSavings = wouldBeSurcharge.amount * numNights * numPets;
        msgWaivers.push(`Peak Season Charges: $${peakSavings.toFixed(2)} Waived (VIP Perk)`);
    }

// ── BRANCH B: DAYCARE ────────────────────────────────────────────────
} else if (serviceType === "Daycare") {

    let perSessionRate = effectiveBasePrice + mainSurcharge.amount + manualAdj + bonusAmt;
    let sessionTotal   = perSessionRate * numPets;

    finalPrice = sessionTotal + expenses;

    let breakdown = `$${effectiveBasePrice}/session`;
    breakdown += peakLabel(mainSurcharge.amount, hasImmunity);
    if (manualAdj !== 0) breakdown += ` ${manualAdj < 0 ? "-" : "+"} Adjustment: $${Math.abs(manualAdj)}`;
    if (bonusAmt  !== 0) breakdown += ` ${bonusAmt < 0 ? "-" : "+"} ${bonusNames.join(" + ")}: $${Math.abs(bonusAmt)}`;
    if (numPets   > 1)   breakdown += ` × ${numPets} pets`;
    noteparts.push(`(${breakdown}) = $${sessionTotal.toFixed(2)}`);

    let slot = serviceName === "Half-Daycare" ? (startTime.includes("Early") ? " AM" : " PM") : "";
    msgparts.push(`${serviceEmoji} ${serviceName} | ${fmtDate(startDate)}${slot}`);
    if (isPeakSeason) msgparts.push(`📅 ${seasonName}`);
    msgparts.push("");
    let sessionLine = `$${perSessionRate}/session`;
    if (numPets > 1) sessionLine += ` x ${numPets} dogs = $${sessionTotal.toFixed(2)}`;
    else sessionLine += ` = $${sessionTotal.toFixed(2)}`;
    msgparts.push(sessionLine);

    if (isPeakSeason && hasImmunity) {
        let peakSavings = wouldBeSurcharge.amount * numPets;
        msgWaivers.push(`Peak Season Charges: $${peakSavings.toFixed(2)} Waived (VIP Perk)`);
    }

// ── BRANCH C: TAXI ───────────────────────────────────────────────────
} else if (serviceType === "Taxi") {

    let transportOpt = appt.getCellValue("Transport Option")?.name || "One Way (Pick-up)";
    let tripMulti    = transportOpt === "Round Trip" ? 2 : 1;
    let totalMileage = appt.getCellValue("Total Mileage") || 0;
    let waitTime     = appt.getCellValue("Wait Time") || 0;
    let tolls        = appt.getCellValue("Tolls") || 0;

    // Use custom flat transport rate if set, otherwise standard base
    const effectiveTaxiBase = customTransportFlat !== null ? customTransportFlat : basePrice;

    // No extra-pet fee for clients with custom flat transport pricing
    const taxiExtraPetFee = hasCustomTransport ? 0 : Math.max(0, (numPets - 1)) * 5 * tripMulti;

    let taxiSurcharge = hasCustomTransport ? 0 : mainSurcharge.amount;
let taxiBonus = hasCustomTransport ? 0 : bonusAmt;
let baseTotal = (effectiveTaxiBase + taxiSurcharge + manualAdj + taxiBonus) * tripMulti;
    let mileageTotal = Math.max(0, totalMileage - 5) * 1.87;
    let waitTotal    = waitTime * 1.00;

    finalPrice = baseTotal + taxiExtraPetFee + mileageTotal + waitTotal + tolls + expenses;

    let breakdown = `$${effectiveTaxiBase} base (${transportOpt})`;
    breakdown += peakLabel(mainSurcharge.amount * tripMulti, hasImmunity);
    if (manualAdj !== 0)       breakdown += ` ${manualAdj < 0 ? "-" : "+"} Adjustment: $${Math.abs(manualAdj * tripMulti).toFixed(2)}`;
    if (taxiBonus !== 0)       breakdown += ` ${taxiBonus < 0 ? "-" : "+"} ${bonusNames.join(" + ")}: $${Math.abs(taxiBonus * tripMulti).toFixed(2)}`;
    if (taxiExtraPetFee  > 0)  breakdown += ` + Extra Pets: $${taxiExtraPetFee.toFixed(2)}`;
    if (mileageTotal > 0)      breakdown += ` + Mileage: $${mileageTotal.toFixed(2)}`;
    if (waitTotal    > 0)      breakdown += ` + Wait Time: $${waitTotal.toFixed(2)}`;
    if (tolls        > 0)      breakdown += ` + Tolls: $${tolls.toFixed(2)}`;
    if (hasCustomTransport)    breakdown += ` [Custom flat rate — no extra-pet fee]`;
    noteparts.push(`(${breakdown}) = $${(finalPrice - expenses).toFixed(2)}`);

    msgparts.push(`${serviceEmoji} ${serviceName} | ${fmtDate(startDate)} ${fmtTime(startTime)}`);
    msgparts.push(transportOpt);
    if (isPeakSeason) msgparts.push(`📅 ${seasonName}`);
    msgparts.push("");
    msgparts.push(`$${effectiveTaxiBase} base x ${tripMulti}`);
    if (mileageTotal     > 0) msgparts.push(`Mileage: $${mileageTotal.toFixed(2)}`);
    if (taxiExtraPetFee  > 0) msgparts.push(`Extra Pets: $${taxiExtraPetFee.toFixed(2)}`);
    if (waitTotal        > 0) msgparts.push(`Wait Time: $${waitTotal.toFixed(2)}`);
    if (tolls            > 0) msgparts.push(`Tolls: $${tolls.toFixed(2)}`);

    if (isPeakSeason && hasImmunity) {
        let peakSavings = wouldBeSurcharge.amount * tripMulti;
        msgWaivers.push(`Peak Season Charges: $${peakSavings.toFixed(2)} Waived (VIP Perk)`);
    }

// ── BRANCH D: DROP-IN VISIT ──────────────────────────────────────────
} else if (serviceType === "Drop-In") {

    let numDogs = 0;
    let numCats = 0;
    let petsLink = appt.getCellValue("Pets");

    if (petsLink && petsLink.length > 0) {
        for (let petLink of petsLink) {
            let petRec = await petsTable.selectRecordAsync(petLink.id, {
                fields: ["Species (from Breeds)"]
            });
            let species     = petRec?.getCellValue("Species (from Breeds)");
            let speciesName = Array.isArray(species) ? species[0] : species;
            if (speciesName === "Dog") numDogs++;
            else if (speciesName === "Cat") numCats++;
        }
    }

    let extraDogs = numDogs > 0 ? Math.max(0, numDogs - 2) : 0;
    let extraCats = numDogs > 0 ? numCats : Math.max(0, numCats - 2);

    let extraDogTotal = extraDogs * dropInExtraDogAmt;
    let extraCatTotal = extraCats * dropInExtraCatAmt;

    let totalMileage = appt.getCellValue("Total Mileage") || 0;
    let mileageTotal = Math.max(0, totalMileage - 5) * 1.87;

    finalPrice = effectiveBasePrice + mainSurcharge.amount + bonusAmt + manualAdj
               + extraDogTotal + extraCatTotal + mileageTotal + expenses;

    if (extraDogs > 0 && dropInExtraDogId) appliedRuleIds.push(dropInExtraDogId);
    if (extraCats > 0 && dropInExtraCatId) appliedRuleIds.push(dropInExtraCatId);

    let animalSummary = [];
    if (numDogs > 0) animalSummary.push(`${numDogs} dog${numDogs > 1 ? "s" : ""}`);
    if (numCats > 0) animalSummary.push(`${numCats} cat${numCats > 1 ? "s" : ""}`);
    let animalStr = animalSummary.join(" + ");

    let breakdown = `$${effectiveBasePrice} base (${animalStr})`;
    breakdown += peakLabel(mainSurcharge.amount, hasImmunity);
    if (bonusAmt !== 0)    breakdown += ` ${bonusAmt < 0 ? "-" : "+"} ${bonusNames.join(" + ")}: $${Math.abs(bonusAmt)}`;
    if (manualAdj !== 0)   breakdown += ` ${manualAdj < 0 ? "-" : "+"} Adjustment: $${Math.abs(manualAdj)}`;
    if (extraDogTotal > 0) breakdown += ` + ${extraDogs} extra dog${extraDogs > 1 ? "s" : ""}: $${extraDogTotal.toFixed(2)}`;
    if (extraCatTotal > 0) breakdown += ` + ${extraCats} cat${extraCats > 1 ? "s" : ""}: $${extraCatTotal.toFixed(2)}`;
    if (mileageTotal  > 0) breakdown += ` + Mileage: $${mileageTotal.toFixed(2)}`;
    noteparts.push(`(${breakdown}) = $${finalPrice.toFixed(2)}`);

    msgparts.push(`${serviceEmoji} Drop-In Visit | ${fmtDate(startDate)} ${fmtTime(startTime)}`);
    msgparts.push(animalStr);
    if (isPeakSeason) msgparts.push(`📅 ${seasonName}`);
    msgparts.push("");
    msgparts.push(`$${effectiveBasePrice} base`);
    if (extraDogTotal > 0) msgparts.push(`+ $${dropInExtraDogAmt} x ${extraDogs} extra dog${extraDogs > 1 ? "s" : ""} = $${extraDogTotal.toFixed(2)}`);
    if (extraCatTotal > 0) msgparts.push(`+ $${dropInExtraCatAmt} x ${extraCats} cat${extraCats > 1 ? "s" : ""} = $${extraCatTotal.toFixed(2)}`);
    if (mileageTotal  > 0) msgparts.push(`+ Mileage: $${mileageTotal.toFixed(2)}`);

    if (isPeakSeason && hasImmunity) {
        let peakSavings = wouldBeSurcharge.amount;
        msgWaivers.push(`Peak Season Charges: $${peakSavings.toFixed(2)} Waived (VIP Perk)`);
    }

} else {
    output.set("pricingNotes", `ERROR: Unrecognized Service Type "${serviceType}" for service "${serviceName}".`);
    return;
}

// Expenses
if (expenses > 0) {
    noteparts.push(`Expenses: $${expenses.toFixed(2)}`);
    msgparts.push(`Expenses: $${expenses.toFixed(2)}`);
}

// ── TRANSPORT ADD-ON (Overnight + Daycare only) ───────────────────────
if (serviceType === "Overnight" || serviceType === "Daycare") {
    let transportOpt = appt.getCellValue("Transport Option")?.name || "None";

    if (transportOpt === "None") {
        if (serviceName !== "House Sitting") {
            msgparts.push(`🚙 Transport: None`);
        }
    } else {
        let transportAddOnRec  = servicesQuery.records.find(r => r.getCellValue("Service Name") === "Transport (Add-on)");
        let transportAddOnBase = transportAddOnRec?.getCellValue("Base Price") || 0;
        let transportAddOnId   = transportAddOnRec?.id;
        let tripMulti          = transportOpt === "Round Trip" ? 2 : 1;

        let transportBonus = 0;
        let transportFree  = false;

        // Check for custom transport pricing first
        if (hasCustomTransport && customTransportFlat !== null) {
            // Use flat rate, no extra-pet fee, no standard add-on calculation
            let flatTotal = customTransportFlat * tripMulti;
            finalPrice += flatTotal;
            noteparts.push(`Transport (${transportOpt}): $${customTransportFlat} x ${tripMulti} = $${flatTotal.toFixed(2)} [Custom flat rate]`);
            msgparts.push(`🚙 Transport (${transportOpt}): $${flatTotal.toFixed(2)}`);
        } else {
            // Standard transport pricing (reuse in-memory rules list)
            if (clientLink && clientLink.length > 0) {
                let clientRecord = await clientsTable.selectRecordAsync(clientLink[0].id, { fields: ["Pricing Rules"] });
                let clientRules  = clientRecord?.getCellValue("Pricing Rules") || [];
                for (let ruleLink of clientRules) {
                    let rule = pricingRulesById[ruleLink.id];
                    if (!rule) continue;
                    if (!rule.getCellValue("Services")?.some(s => s.id === transportAddOnId)) continue;
                    if (!isRuleActive(rule, startDate)) continue;

                    let adj = calcAdjustment(rule, transportAddOnBase);
                    if (rule.getCellValue("Adjustment Type")?.name === "Percentage (%)" &&
                        (rule.getCellValue("Adjustment Amount") || 0) >= 100) {
                        transportFree = true;
                    } else {
                        transportBonus += adj;
                    }
                    if (!clientRuleIds.includes(rule.id)) {
                        appliedRuleIds.push(rule.id);
                        clientRuleIds.push(rule.id);
                    }
                    break;
                }
            }

            let firstDogFee       = transportAddOnBase * tripMulti;
            let additionalDogsFee = numPets > 1 ? (numPets - 1) * (transportAddOnBase * 0.5) * tripMulti : 0;
            let transportFee      = transportFree ? 0 : (firstDogFee + additionalDogsFee + transportBonus);

            finalPrice += transportFee;

            let transportNote = transportFree
                ? `Transport (${transportOpt}): $0.00 (waived)`
                : `Transport (${transportOpt}): $${firstDogFee.toFixed(2)}`;
            if (!transportFree && additionalDogsFee > 0) transportNote += ` + ${numPets - 1} additional dog${numPets - 1 > 1 ? "s" : ""} (50% off): $${additionalDogsFee.toFixed(2)}`;
            noteparts.push(transportNote);

            if (transportFree) {
                msgWaivers.push(`🚙 Transport: Waived (VIP Perk)`);
            } else {
                let tMsg = `🚙 Transport (${transportOpt}): $${firstDogFee.toFixed(2)}`;
                if (additionalDogsFee > 0) tMsg += ` + $${additionalDogsFee.toFixed(2)} (2nd dog) = $${transportFee.toFixed(2)}`;
                msgparts.push(tMsg);
            }
        }
    }
}

// =====================================================================
// MODULE 5: RECEIPT & OUTPUT
// =====================================================================

let dateHeader = "";
if (serviceType === "Overnight") {
    dateHeader = `${serviceName} ${fmtDate(startDate)} ${fmtTimeInternal(startTime)} – ${fmtDate(endDate)} ${fmtTimeInternal(endTime)}`;
} else if (serviceType === "Taxi") {
    let transportOpt = appt.getCellValue("Transport Option")?.name || "One Way (Pick-up)";
    dateHeader = `${serviceName} ${fmtDate(startDate)} ${fmtTimeInternal(startTime)} (${transportOpt})`;
} else if (serviceType === "Drop-In") {
    dateHeader = `${serviceName} ${fmtDate(startDate)} ${fmtTimeInternal(startTime)}`;
} else if (serviceType === "Daycare") {
    if (serviceName === "Half-Daycare") {
        let slot = startTime.includes("Early") ? "AM" : "PM";
        dateHeader = `${serviceName} ${fmtDate(startDate)} ${slot}`;
    } else {
        dateHeader = `${serviceName} ${fmtDate(startDate)}`;
    }
}

let seasonSegment = isPeakSeason ? `Season: ${seasonName}` : "";

let internalParts = [dateHeader];
if (seasonSegment)   internalParts.push(seasonSegment);
if (customPriceNote) internalParts.push(customPriceNote.trim());
internalParts.push(...noteparts);
internalParts.push(`Total: $${finalPrice.toFixed(2)}`);
let pricingNote = internalParts.join(" | ");

if (msgWaivers.length > 0) {
    msgparts.push("");
    msgparts.push(...msgWaivers);
}
msgparts.push("");
msgparts.push(`Total: $${finalPrice.toFixed(2)}`);
let clientMessage = msgparts.join("\n");

let existingRuleIds = (appt.getCellValue("Applied Pricing Rule") || []).map(r => r.id);
let uniqueRuleIds   = [...new Set([...existingRuleIds, ...appliedRuleIds].filter(Boolean))];

await apptsTable.updateRecordAsync(apptId, {
    "Pricing Notes":        pricingNote,
    "Client Message":       clientMessage,
    "Applied Pricing Rule": uniqueRuleIds.map(id => ({ id })),
    "Locked Final Price":   finalPrice,
    "Peak Season":          isPeakSeason,
    "Force Reprice":        false,
    "Price Last Updated":   new Date().toISOString(),
    "Priced By":            "PricingEngine v2.2",
    "Service Category":     { name: serviceInitial },
    "Client":               clientLink ? [{ id: clientLink[0].id }] : [],
});

output.set("finalAdjustment", finalPrice);
output.set("pricingNotes",    pricingNote);
output.set("isPeakSeason",    isPeakSeason);
