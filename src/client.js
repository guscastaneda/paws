import { cors, errRes, jsonRes, atFetch } from "./helpers.js";
import { BASE_ID, CLIENTS_TABLE, PETS_TABLE, COMPLIANCE_TABLE, PENDING_UPDATES_TABLE, APPOINTMENTS_TABLE, BOARDING_SERVICE_ID, FIELDS, AT } from "./constants.js";

const VETS_TABLE      = "tblUC3XRDQnNCwTri";
const RECURRING_TABLE = "tblik1KKdS24p3Rz5";

// ── GET /client ───────────────────────────────────────────────────────────────
async function handleGetClient(req, env) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return errRes("Missing token");

  const formula = encodeURIComponent(`{Client Token} = "${token}"`);
  const res = await atFetch(env, `/${CLIENTS_TABLE}?filterByFormula=${formula}`);
  if (!res.ok) return errRes("Airtable error", 502);

  const data = await res.json();
  if (!data.records?.length) return errRes("Client not found", 404);

  const c  = data.records[0];
  const f  = c.fields;
  const clientName = f["Client Name"] || "";
  const linkedPets = f["Pets"] || [];
  const petIdList  = linkedPets.map(p => typeof p === "object" ? p.id : p).filter(Boolean);

  // ── Pets ──────────────────────────────────────────────────────────────────────
  let pets = [];
  if (petIdList.length > 0) {
    const petFilter = encodeURIComponent(
      `OR(${petIdList.map(id => `RECORD_ID()="${id}"`).join(",")})`
    );
    const petsRes = await atFetch(env,
      `/${PETS_TABLE}?filterByFormula=${petFilter}` +
      `&fields[]=Pet%20Name&fields[]=Active&fields[]=Gender&fields[]=Date%20of%20Birth` +
      `&fields[]=Breed%20(Text)&fields[]=Breeds&fields[]=Spayed%2FNeutered` +
      `&fields[]=Microchip%20Number&fields[]=Allergies&fields[]=Current%20Medications` +
      `&fields[]=Feeding%20Schedule&fields[]=Fears%20%26%20Triggers&fields[]=Temperament` +
      `&fields[]=Pet%20Notes&fields[]=Photo&fields[]=Compliance%20Documents` +
      `&fields[]=Veterinarians&fields[]=Clients`
    );

    if (petsRes.ok) {
      const petsData = await petsRes.json();

      for (const p of petsData.records || []) {
        const isActive = p.fields["Active"] === true;
        const petDocs  = [];

        const docRefs = p.fields["Compliance Documents"] || [];
        const docIds  = docRefs.map(r => typeof r === "object" ? r.id : r).filter(Boolean);
        if (docIds.length > 0) {
          const docFilter = encodeURIComponent(`OR(${docIds.map(id => `RECORD_ID()="${id}"`).join(",")})`);
          const docsRes = await atFetch(env, `/${COMPLIANCE_TABLE}?filterByFormula=${docFilter}`);
          if (docsRes.ok) {
            const docsData = await docsRes.json();
            for (const d of docsData.records || []) {
              const docTypeField = d.fields[FIELDS.DOC_TYPE]    || d.fields["Document Type"];
              const expiredField = d.fields[FIELDS.DOC_EXPIRED] || d.fields["Is Expired?"];
              const expiryDate   = d.fields[FIELDS.DOC_EXPIRY]  || d.fields["Expiration Date"] || "";
              const uploadDate   = d.fields[FIELDS.DOC_DATE]    || d.fields["Upload Date"]      || "";
              const daysField    = d.fields["Days Until Expiration"];
              // Airtable's formula returns a number for dated docs, or {specialValue:"NaN"}
              // (or undefined) when there's no expiry date — only trust real numbers.
              const daysUntilExpiry = (typeof daysField === "number") ? daysField : null;
              const docType = (docTypeField && typeof docTypeField === "object") ? docTypeField.name : (docTypeField || "");
              const expired = expiredField === "Yes" || expiredField === true;
              if (docType) petDocs.push({ type: docType, expired, expiryDate, uploadDate, daysUntilExpiry });
            }
          }
        }

        const hasRabies = petDocs.some(d => d.type === "Rabies Certificate" && !d.expired);
        const hasTown   = petDocs.some(d => d.type === "Town License"       && !d.expired);
        const hasVax    = petDocs.some(d => d.type === "Vaccination Record" && !d.expired);

        const vetRefs = p.fields["Veterinarians"] || [];
        const vetIds  = vetRefs.map(r => typeof r === "object" ? r.id : r).filter(Boolean);
        let vets = [];
        if (vetIds.length > 0) {
          const vetFilter = encodeURIComponent(`OR(${vetIds.map(id => `RECORD_ID()="${id}"`).join(",")})`);
          const vetsRes = await atFetch(env, `/${VETS_TABLE}?filterByFormula=${vetFilter}`);
          if (vetsRes.ok) {
            const vetsData = await vetsRes.json();
            vets = (vetsData.records || []).map(v => ({
              id:      v.id,
              clinic:  v.fields["Clinic Name"]      || "",
              phone:   v.fields["Phone Number"]     || "",
              email:   v.fields["Email Address"]    || "",
              address: v.fields["Practice Address"] || "",
              url:     v.fields["URL"]              || "",
            }));
          }
        }

        const photoField = p.fields["Photo"] || [];
        const photoUrl   = photoField.length > 0 ? (photoField[0].thumbnails?.large?.url || photoField[0].url || "") : "";

        const dob = p.fields["Date of Birth"] || "";
        let age = "";
        if (dob) {
          const dobDate     = new Date(dob + "T12:00:00");
          const now         = new Date();
          const totalMonths = (now.getFullYear() - dobDate.getFullYear()) * 12 + (now.getMonth() - dobDate.getMonth());
          const y = Math.floor(totalMonths / 12);
          const m = totalMonths % 12;
          age = y + (m > 0 ? "." + m : "") + " yrs";
        }

        const breedText = p.fields["Breed (Text)"] || "";
        const breedRefs = p.fields["Breeds"] || [];
        const breedIds  = breedRefs.map(b => typeof b === "object" ? b.id : b).filter(Boolean);
        let breedLinked = "";
        if (breedIds.length > 0) {
          const breedFilter = encodeURIComponent(`OR(${breedIds.map(id => `RECORD_ID()="${id}"`).join(",")})`);
          const breedRes = await atFetch(env, `/tblLsiIKKeimLnBxF?filterByFormula=${breedFilter}&fields[]=fldFetxyc0IbkFadw`);
          if (breedRes.ok) {
            const breedData = await breedRes.json();
            const names = (breedData.records || [])
              .map(r => r.fields["fldFetxyc0IbkFadw"] || r.fields["Breed Name"] || r.fields["Name"] || "")
              .filter(Boolean);
            if (names.length === 1)    breedLinked = names[0];
            else if (names.length > 1) breedLinked = "Mixed Breed (" + names.join(" · ") + ")";
          }
        }
        const breed = breedLinked || breedText;

        pets.push({
          id:             p.id,
          active:         isActive,
          name:           p.fields["Pet Name"]            || "",
          breed,
          breedIds,
          dob,
          age,
          gender:         typeof p.fields["Gender"] === "object"
                            ? (p.fields["Gender"] || {}).name || ""
                            : p.fields["Gender"] || "",
          spayedNeutered: p.fields["Spayed/Neutered"]     === true,
          microchip:      p.fields["Microchip Number"]    || "",
          allergies:      p.fields["Allergies"]           || "",
          medications:    p.fields["Current Medications"] || "",
          feeding:        p.fields["Feeding Schedule"]    || "",
          fears:          p.fields["Fears & Triggers"]    || "",
          temperament:    p.fields["Temperament"]         || "",
          notes:          p.fields["Pet Notes"]           || "",
          photoUrl,
          vets,
          docs:           petDocs,
          docsComplete:   hasRabies && hasTown && hasVax,
        });
      }
    }
  }

  const allDocsComplete = pets.length > 0 && pets.every(p => p.docsComplete);

  // ── Appointments ──────────────────────────────────────────────────────────────
  const linkedApptRefs = f["Appointments"] || f["fldihTexoIBjRsFdJ"] || [];
  const linkedApptIds  = linkedApptRefs.map(r => typeof r === "object" ? r.id : r).filter(Boolean);
  let appointments = [];

  if (linkedApptIds.length > 0) {
    const today     = new Date().toISOString().split("T")[0];
    const batchSize = 10;
    const allApptRecords = [];

    for (let i = 0; i < linkedApptIds.length; i += batchSize) {
      const batch    = linkedApptIds.slice(i, i + batchSize);
      const idFilter = encodeURIComponent(`OR(${batch.map(id => `RECORD_ID()="${id}"`).join(",")})`);
      const batchRes = await atFetch(env, `/${APPOINTMENTS_TABLE}?filterByFormula=${idFilter}`);
      if (batchRes.ok) {
        const batchData = await batchRes.json();
        allApptRecords.push(...(batchData.records || []));
      }
    }

    appointments = allApptRecords
      .map(a => {
        const af     = a.fields || {};
        const status = af["Status"] || {};
        const cat    = af["Service Category"] || {};
        const fee    = typeof af["Cancellation Fee"] === "number" ? af["Cancellation Fee"] : null;
        return {
          id:                    a.id,
          startDate:              af["Start Date"]  || "",
          endDate:                af["End Date"]    || "",
          startTime:              (typeof af["Start Time"] === "object" ? af["Start Time"].name : af["Start Time"]) || "",
          endTime:                (typeof af["End Time"]   === "object" ? af["End Time"].name   : af["End Time"])   || "",
          status:                 (typeof status === "object" ? status.name : status) || "",
          category:               (typeof cat    === "object" ? cat.name    : cat)    || "",
          clientMessage:          af["Client Message"] || "",
          cancellationFee:        fee,
          cancellationFeeReason:  af["Cancellation Fee Reason"] || "",
        };
      })
      .filter(a => {
        const isActive = ["Requested", "Confirmed", "Waitlisted", "Cancellation Requested"].includes(a.status);
        const isFuture = !a.endDate || a.endDate >= today;
        return isActive && isFuture;
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  // ── Service prices ────────────────────────────────────────────────────────────
  let boardingPrice    = 85;
  let daycarePrice     = 50;
  let halfDaycarePrice = 35;
  try {
    const servicesRes = await atFetch(env, `/tbl2abVXy45haJAgC?fields[]=Service%20Name&fields[]=Base%20Price`);
    if (servicesRes.ok) {
      const servicesData = await servicesRes.json();
      for (const s of servicesData.records || []) {
        const name  = s.fields["Service Name"];
        const price = s.fields["Base Price"];
        if (name === "Boarding")     boardingPrice    = price;
        if (name === "Daycare")      daycarePrice     = price;
        if (name === "Half-Daycare") halfDaycarePrice = price;
      }
    }
  } catch (e) {
    console.error("Failed to fetch service prices:", e);
  }

// ── Recurring services ────────────────────────────────────────────────────────
  let recurringServices = [];
  try {
    const recurringRes = await atFetch(env, `/${RECURRING_TABLE}`);
    if (recurringRes.ok) {
      const recurringData = await recurringRes.json();
      const clientPetIds  = new Set(petIdList);

      recurringServices = (recurringData.records || [])
        .filter(r => {
          // Pets field returns plain string IDs
          const recPetIds = (r.fields['Pets'] || [])
            .map(p => typeof p === 'object' ? p.id : p)
            .filter(Boolean);
          const belongsToClient = recPetIds.some(id => clientPetIds.has(id));
          const status    = r.fields['Status'] || '';
          const isVisible = ['Active', 'Requested', 'Paused', 'Cancellation Requested'].includes(status);
          return belongsToClient && isVisible;
        })
        .map(r => ({
          id:         r.id,
          name:       r.fields['Recurring Appointment Name'] || '',
          service:    r.fields['Service']?.[0] === 'rec99cemJqkCezIRN' ? 'Daycare'
                    : r.fields['Service']?.[0] === 'rec4yyzqGvuDGomgy' ? 'Half-Daycare'
                    : r.fields['Service']?.[0] === 'recToZsYSMELIVcMN' ? 'Boarding'
                    : 'Daycare',
          pets:       (r.fields['Pets'] || [])
                        .map(id => pets.find(p => p.id === id)?.name || id)
                        .filter(Boolean),
          days:       r.fields['Days of Week'] || [],
          status:     r.fields['Status'] || '',
          transport:  r.fields['Transport Option'] || 'None',
          startTime:  r.fields['Start Time'] || '',
          endTime:    r.fields['End Time']   || '',
          pauseUntil: r.fields['Pause Until'] || r.fields['fldgiU49GyUGFBPJP'] || null,
          notes:      r.fields['Recurring Appointment Notes'] || '',
        }));
    }
  } catch (e) {
    console.error('Failed to fetch recurring services:', e);
  }

  return jsonRes({
    clientId:              c.id,
    firstName:             clientName.split(" ")[0],
    name:                  clientName,
    phone:                 f["Phone Number"]                    || "",
    email:                 f["Email Address"]                   || "",
    address:               f["Address"]                         || "",
    addName:               f["Additional Owner Name"]           || "",
    addPhone:              f["Additional Owner Phone Number"]   || "",
    addEmail:              f["Additional Owner Email"]          || "",
    emergencyName:         f["Emergency Contact Name"]          || "",
    emergencyPhone:        f["Emergency Contact Phone"]         || "",
    emergencyRelationship: f["Emergency Contact Relationship"]  || "",
    emailConfirmed:        f["Email Confirmed"]                 === true,
    agreementSigned:       f["Agreement Signed"]               === true,
    docsComplete:          allDocsComplete,
    pets,
    appointments,
    boardingPrice,
    daycarePrice,
    halfDaycarePrice,
    recurringServices,
  });
}

export { handleGetClient };