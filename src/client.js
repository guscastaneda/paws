import { cors, errRes, jsonRes, atFetch } from "./helpers.js";
import { BASE_ID, CLIENTS_TABLE, PETS_TABLE, COMPLIANCE_TABLE, PENDING_UPDATES_TABLE, APPOINTMENTS_TABLE, BOARDING_SERVICE_ID, FIELDS, AT } from "./constants.js";

const VETS_TABLE = "tblUC3XRDQnNCwTri";

// ── GET /client ───────────────────────────────────────────────────────────────
async function handleGetClient(req, env) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return errRes("Missing token");

  // Fetch client by token
  const formula = encodeURIComponent(`{Client Token} = "${token}"`);
  const res = await atFetch(env, `/${CLIENTS_TABLE}?filterByFormula=${formula}`);
  if (!res.ok) return errRes("Airtable error", 502);

  const data = await res.json();
  if (!data.records?.length) return errRes("Client not found", 404);

  const c  = data.records[0];
  const f  = c.fields;
  const clientName = f["Client Name"] || "";
  const linkedPets = f["Pets"] || [];
  // Extract IDs whether linked records come back as strings or {id,name} objects
  const petIdList = linkedPets.map(p => typeof p === "object" ? p.id : p).filter(Boolean);

  // Fetch pets with their compliance docs
  let pets = [];
  if (petIdList.length > 0) {
    const petFilter = encodeURIComponent(
      `OR(${petIdList.map(id => `RECORD_ID()="${id}"`).join(",")})`
    );
    const petsRes = await atFetch(env, `/${PETS_TABLE}?filterByFormula=${petFilter}&fields[]=Pet%20Name&fields[]=Active&fields[]=fldeME6BfqF8KhXag&fields[]=Date%20of%20Birth&fields[]=Breed%20(Text)&fields[]=Breeds&fields[]=Spayed%2FNeutered&fields[]=Microchip%20Number&fields[]=Allergies&fields[]=Current%20Medications&fields[]=Feeding%20Schedule&fields[]=Fears%20%26%20Triggers&fields[]=Temperament&fields[]=Pet%20Notes&fields[]=Photo&fields[]=Compliance%20Documents&fields[]=Veterinarians&fields[]=Clients`);
    if (petsRes.ok) {
      const petsData = await petsRes.json();

      for (const p of petsData.records || []) {
          const isActive = p.fields["Active"] === true;
        const petDocs = [];

        // Fetch compliance docs for this pet
        const docRefs = p.fields["Compliance Documents"] || [];
        // Airtable returns linked records as [{id, name}] objects or plain strings
        const docIds = docRefs.map(r => (typeof r === "object" ? r.id : r)).filter(Boolean);
        if (docIds.length > 0) {
          const docFilter = encodeURIComponent(
            `OR(${docIds.map(id => `RECORD_ID()="${id}"`).join(",")})`
          );
          const docsRes = await atFetch(env, `/${COMPLIANCE_TABLE}?filterByFormula=${docFilter}`);
          if (docsRes.ok) {
            const docsData = await docsRes.json();
            for (const d of docsData.records || []) {
              const docTypeField = d.fields[FIELDS.DOC_TYPE]   || d.fields["Document Type"];
              const expiredField = d.fields[FIELDS.DOC_EXPIRED] || d.fields["Is Expired?"];
              const expiryDate   = d.fields[FIELDS.DOC_EXPIRY]  || d.fields["Expiration Date"] || "";
              const uploadDate   = d.fields[FIELDS.DOC_DATE]    || d.fields["Upload Date"]      || "";
              const docType = (docTypeField && typeof docTypeField === "object") ? docTypeField.name : (docTypeField || "");
              const expired = expiredField === "Yes" || expiredField === true;
              if (docType) {
                petDocs.push({ type: docType, expired, expiryDate, uploadDate });
              }
            }
          }
        }

        // Docs complete = has rabies + town license + vaccination record (not expired)
        const hasRabies = petDocs.some(d => d.type === "Rabies Certificate" && !d.expired);
        const hasTown   = petDocs.some(d => d.type === "Town License"       && !d.expired);
        const hasVax    = petDocs.some(d => d.type === "Vaccination Record" && !d.expired);

        // Fetch vet info for this pet
        const vetRefs = p.fields["Veterinarians"] || [];
        const vetIds  = vetRefs.map(r => typeof r === "object" ? r.id : r).filter(Boolean);
        let vets = [];
        if (vetIds.length > 0) {
          const vetFilter = encodeURIComponent(
            `OR(${vetIds.map(id => `RECORD_ID()="${id}"`).join(",")})`
          );
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

        // Get photo URL if available
        const photoField = p.fields["Photo"] || [];
        const photoUrl   = photoField.length > 0 ? (photoField[0].thumbnails?.large?.url || photoField[0].url || "") : "";

        // Calculate age from DOB
        const dob = p.fields["Date of Birth"] || "";
        let age = "";
        if (dob) {
          const dobDate = new Date(dob + "T12:00:00");
          const now     = new Date();
          const years   = now.getFullYear() - dobDate.getFullYear();
          const months  = now.getMonth()   - dobDate.getMonth();
          const totalMonths = years * 12 + months;
          const y = Math.floor(totalMonths / 12);
          const m = totalMonths % 12;
          age = y + (m > 0 ? "." + m : "") + " yrs";
        }

        // Breed (Text) is the client-submitted plain text field
        // Breeds is the linked field with curated breed records
        const breedText = p.fields["Breed (Text)"] || "";
        const breedRefs = p.fields["Breeds"] || [];
        const breedLinked = breedRefs.map(b => {
          if (typeof b === "object" && b.name) return b.name;
          return null;
        }).filter(Boolean).join(", ");
        const breed = breedLinked || breedText;

        pets.push({
          id:            p.id,
          active:        isActive,
          rawPetFields:  Object.keys(p.fields), // debug
          name:          p.fields["Pet Name"]    || "",
          breed,
          dob,
          age,
          gender: (p.fields["Gender"] || p.fields["fldeME6BfqF8KhXag"] || {}).name || "",
          spayedNeutered: p.fields["Spayed/Neutered"] === true,
          microchip:     p.fields["Microchip Number"]    || "",
          allergies:     p.fields["Allergies"]           || "",
          medications:   p.fields["Current Medications"] || "",
          feeding:       p.fields["Feeding Schedule"]    || "",
          fears:         p.fields["Fears & Triggers"]    || "",
          temperament:   p.fields["Temperament"]         || "",
          notes:         p.fields["Pet Notes"]   || "",
          photoUrl,
          vets,
          docs:          petDocs,
          docsComplete:  hasRabies && hasTown && hasVax,
        });
      }
    }
  }

  const allDocsComplete = pets.length > 0 && pets.every(p => p.docsComplete);

  // Fetch appointments from client linked field — direct ID lookup, no filter formula needed
  const linkedApptRefs = f["Appointments"] || f["fldihTexoIBjRsFdJ"] || [];
  const linkedApptIds  = linkedApptRefs.map(r => typeof r === "object" ? r.id : r).filter(Boolean);
  let appointments = [];

  if (linkedApptIds.length > 0) {
    const today = new Date().toISOString().split("T")[0];
    const batchSize = 10;
    const allApptRecords = [];

    for (let i = 0; i < linkedApptIds.length; i += batchSize) {
      const batch = linkedApptIds.slice(i, i + batchSize);
      const idFilter = encodeURIComponent(
        `OR(${batch.map(id => `RECORD_ID()="${id}"`).join(",")})`
      );
      const batchRes = await atFetch(env,
        "/" + APPOINTMENTS_TABLE + "?filterByFormula=" + idFilter
      );
      if (batchRes.ok) {
        const batchData = await batchRes.json();
        allApptRecords.push(...(batchData.records || []));
      }
    }

    appointments = allApptRecords
      .map(a => {
        // Fields come back by name, not by ID
        const af = a.fields || a.cellValuesByFieldId || {};
        const status = af["Status"] || af["fldW123UTCTu1xjCe"] || {};
        const cat    = af["Service Category"] || af["fldqRv3nVQT5s9uWi"] || {};
        return {
          id:            a.id,
          startDate:     af["Start Date"]  || af["flddYyqOcOMXXlRmQ"] || "",
          endDate:       af["End Date"]    || af["fldxdh9mYKL7aOaTV"]  || "",
          startTime:     (typeof (af["Start Time"] || af["fldzh9OPPktIdyK5j"]) === "object" ? (af["Start Time"] || af["fldzh9OPPktIdyK5j"]).name : (af["Start Time"] || af["fldzh9OPPktIdyK5j"])) || "",
          endTime:       (typeof (af["End Time"]   || af["fldX6VYq3LeqtNzHj"])  === "object" ? (af["End Time"]   || af["fldX6VYq3LeqtNzHj"]).name  : (af["End Time"]   || af["fldX6VYq3LeqtNzHj"]))  || "",
          status:        (typeof status === "object" ? status.name : status) || "",
          category:      (typeof cat    === "object" ? cat.name    : cat)    || "",
          clientMessage: af["Client Message"] || af["fldYCBKRnM20ogYtm"] || "",
        };
      })
      .filter(a => {
        const isBoarding = a.category === "B";
        const isActive   = a.status === "Requested" || a.status === "Confirmed";
        const isFuture   = !a.endDate || a.endDate >= today;
        return isBoarding && isActive && isFuture;
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  return jsonRes({
    clientId:             c.id,
    firstName:            clientName.split(" ")[0],
    name:                 clientName,
    phone:                f["Phone Number"]                  || "",
    email:                f["Email Address"]                 || "",
    address:              f["Address"]                       || "",
    addName:              f["Additional Owner Name"]         || "",
    addPhone:             f["Additional Owner Phone Number"] || "",
    addEmail:             f["Additional Owner Email"]        || "",
    emergencyName:        f["Emergency Contact Name"]        || "",
    emergencyPhone:       f["Emergency Contact Phone"]       || "",
    emergencyRelationship: f["Emergency Contact Relationship"] || "",
    emailConfirmed:       f["Email Confirmed"]               === true,
    agreementSigned:      f["Agreement Signed"]              === true,
    docsComplete:         allDocsComplete,
    pets,
    appointments,
  });
}

export { handleGetClient };