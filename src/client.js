import { cors, errRes, jsonRes, atFetch } from "./helpers.js";
import { BASE_ID, CLIENTS_TABLE, PETS_TABLE, COMPLIANCE_TABLE, PENDING_UPDATES_TABLE, APPOINTMENTS_TABLE, BOARDING_SERVICE_ID, FIELDS, AT } from "./constants.js";

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
    const petsRes = await atFetch(env, `/${PETS_TABLE}?filterByFormula=${petFilter}`);
    if (petsRes.ok) {
      const petsData = await petsRes.json();

      for (const p of petsData.records || []) {
        if (p.fields["Active"] !== true) continue;
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

        pets.push({
          id:   p.id,
          name: p.fields["Pet Name"] || "",
          docs: petDocs,
          docsComplete: hasRabies && hasTown && hasVax,
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
