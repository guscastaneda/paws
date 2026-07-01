// =====================================================================
// RECURRING APPOINTMENT GENERATOR v1.3
// Runs weekly (every Sunday at 5:45am)
// Creates appointments 4 weeks ahead for all active recurring records
// Duplicate check: Pet + Date + Service
// Updated in v1.3:
// - Updates Active/Inactive status on Pets and Clients tables
// - Pet is Active if appointment in last 180 days or future (non-cancelled)
// - Client is Active if any linked pet is Active
// =====================================================================

const recurringTable = base.getTable("Recurring Appointments");
const apptsTable     = base.getTable("Appointments");
const petsTable      = base.getTable("Pets");
const clientsTable   = base.getTable("Clients");

const DAYS_MAP = {
    "Sunday":    0,
    "Monday":    1,
    "Tuesday":   2,
    "Wednesday": 3,
    "Thursday":  4,
    "Friday":    5,
    "Saturday":  6,
};

// Service initial mapping
// Adjust here if new services are added
const SERVICE_INITIALS = {
    "Daycare":        "DC",
    "Half-Daycare":   "HD",
    "Boarding":       "B",
    "House Sitting":  "HS",
    "Pet Taxi":       "PT",
    "Group Walk":     "GW",
    "Drop-In Visit":  "DV",
};

// Lookahead window — adjust here as needed
const LOOKAHEAD_DAYS = 28; // 4 weeks

// Active window — adjust here as needed
const ACTIVE_DAYS = 180; // 6 months

// =====================================================================
// SECTION 1: GENERATE RECURRING APPOINTMENTS
// =====================================================================

// Load all recurring records
let recurringRecords = await recurringTable.selectRecordsAsync({
    fields: [
        "Service", "Assigned Staff", "Pets", "Start Time", "End Time",
        "Transport Option", "Pick Up Location", "Drop Off Location",
        "Days of Week", "Frequency", "Status",
        "Start Recurring Appointments On", "Stop Recurring Appointments On",
        "Recurring Appointment Notes", "Last Generated Date"
    ]
});

// Load all existing appointments for duplicate checking
let existingAppts = await apptsTable.selectRecordsAsync({
    fields: ["Pets", "Start Date", "Service", "Status"]
});

// Build a lookup set of existing Pet+Date+Service combos
let existingSet = new Set();
for (let appt of existingAppts.records) {
    let pets    = appt.getCellValue("Pets") || [];
    let date    = appt.getCellValue("Start Date");
    let service = appt.getCellValue("Service")?.[0]?.id;
    if (pets.length > 0 && date && service) {
        let dateStr = new Date(date).toISOString().split("T")[0];
        for (let pet of pets) {
            existingSet.add(`${pet.id}_${dateStr}_${service}`);
        }
    }
}

let created = 0;
let skipped = 0;
let errors  = 0;

let today = new Date();
today.setHours(0, 0, 0, 0);

let windowEnd = new Date(today);
windowEnd.setDate(windowEnd.getDate() + LOOKAHEAD_DAYS);

for (let rec of recurringRecords.records) {

    // Only process active recurring records
    if (rec.getCellValue("Status")?.name !== "Active") continue;
    if (!rec.getCellValue("Frequency")) continue;

    // Respect start/stop dates
    let startOn  = rec.getCellValue("Start Recurring Appointments On");
    let stopOn   = rec.getCellValue("Stop Recurring Appointments On");
    let recStart = startOn ? new Date(startOn) : today;
    let recStop  = stopOn  ? new Date(stopOn)  : windowEnd;
    recStart.setHours(0, 0, 0, 0);
    recStop.setHours(0, 0, 0, 0);

    // Get scheduled days of week
    let daysOfWeek    = rec.getCellValue("Days of Week") || [];
    let scheduledDays = daysOfWeek.map(d => DAYS_MAP[d.name]).filter(d => d !== undefined);
    if (scheduledDays.length === 0) continue;

    // Get service and pet IDs
    let serviceLink = rec.getCellValue("Service");
    let petsLink    = rec.getCellValue("Pets");
    if (!serviceLink || !petsLink) continue;

    let serviceId   = serviceLink[0].id;
    let serviceName = serviceLink[0].name;
    let petId       = petsLink[0].id;

    // Walk through every day in the lookahead window
    let cursor = new Date(today);
    while (cursor <= windowEnd) {
        let dayOfWeek = cursor.getDay();

        if (
            scheduledDays.includes(dayOfWeek) &&
            cursor >= recStart &&
            cursor <= recStop
        ) {
            let dateStr = cursor.toISOString().split("T")[0];
            let dupeKey = `${petId}_${dateStr}_${serviceId}`;

            if (existingSet.has(dupeKey)) {
                skipped++;
            } else {
                try {
                    let fields = {
                        "Service":                [{ id: serviceId }],
                        "Pets":                   petsLink.map(p => ({ id: p.id })),
                        "Start Date":             dateStr,
                        "End Date":               dateStr,
                        "Status":                 { name: "Requested" },
                        "Recurring Appointments": [{ id: rec.id }],
                        "Service Category":       { name: SERVICE_INITIALS[serviceName] || serviceName },
                    };

                    let startTime = rec.getCellValue("Start Time");
                    if (startTime) fields["Start Time"] = { name: startTime.name };

                    let endTime = rec.getCellValue("End Time");
                    if (endTime) fields["End Time"] = { name: endTime.name };

                    let transportOpt = rec.getCellValue("Transport Option");
                    if (transportOpt) fields["Transport Option"] = { name: transportOpt.name };

                    let pickUp = rec.getCellValue("Pick Up Location");
                    if (pickUp) fields["Pick Up Location"] = { name: pickUp.name };

                    let dropOff = rec.getCellValue("Drop Off Location");
                    if (dropOff) fields["Drop Off Location"] = { name: dropOff.name };

                    let staff = rec.getCellValue("Assigned Staff");
                    if (staff && staff.length > 0) fields["Assigned Staff"] = staff.map(s => ({ id: s.id }));

                    let notes = rec.getCellValue("Recurring Appointment Notes");
                    if (notes) fields["Appointment Notes"] = notes;

                    await apptsTable.createRecordAsync(fields);

                    for (let pet of petsLink) {
                        existingSet.add(`${pet.id}_${dateStr}_${serviceId}`);
                    }

                    created++;
                    console.log(`✓ Created: ${serviceName} for ${petsLink[0].name} on ${dateStr}`);

                } catch (err) {
                    errors++;
                    console.log(`✗ Error for ${petsLink[0].name} on ${dateStr}: ${err.message}`);
                }
            }
        }

        cursor.setDate(cursor.getDate() + 1);
    }

    // Update Last Generated Date on the recurring record
    try {
        await recurringTable.updateRecordAsync(rec.id, {
            "Last Generated Date": new Date().toISOString()
        });
    } catch (err) {
        console.log(`✗ Could not update Last Generated Date for ${rec.name}: ${err.message}`);
    }
}

console.log(`\nAppointments — Created: ${created} | Skipped: ${skipped} | Errors: ${errors}`);

// =====================================================================
// SECTION 2: UPDATE ACTIVE/INACTIVE STATUS ON PETS AND CLIENTS
// =====================================================================

console.log(`\nUpdating Active status for Pets and Clients...`);

// Reload all appointments with pet and date info
let allAppts = await apptsTable.selectRecordsAsync({
    fields: ["Pets", "Start Date", "Status"]
});

// Calculate the active window cutoff — 6 months ago
let activeCutoff = new Date(today);
activeCutoff.setDate(activeCutoff.getDate() - ACTIVE_DAYS);

// Build a set of active pet IDs
// A pet is active if it has a non-cancelled appointment in the last 180 days OR in the future
let activePetIds = new Set();

for (let appt of allAppts.records) {
    let status    = appt.getCellValue("Status")?.name;
    let startDate = appt.getCellValue("Start Date");
    let pets      = appt.getCellValue("Pets") || [];

    if (status === "Cancelled") continue;
    if (!startDate) continue;

    let apptDate = new Date(startDate);

    // Active if within last 180 days or in the future
    if (apptDate >= activeCutoff) {
        for (let pet of pets) {
            activePetIds.add(pet.id);
        }
    }
}

// Load all pets with their linked clients
let allPets = await petsTable.selectRecordsAsync({
    fields: ["Clients", "Active"]
});

// Track which clients have at least one active pet
let activeClientIds = new Set();
let petsUpdated = 0;

for (let pet of allPets.records) {
    let isActive    = activePetIds.has(pet.id);
    let currentVal  = pet.getCellValue("Active") || false;

    // Update pet Active field if it changed
    if (isActive !== currentVal) {
        try {
            await petsTable.updateRecordAsync(pet.id, { "Active": isActive });
            petsUpdated++;
        } catch (err) {
            console.log(`✗ Error updating pet ${pet.name}: ${err.message}`);
        }
    }

    // Track active clients
    if (isActive) {
        let clientLink = pet.getCellValue("Clients") || [];
        for (let client of clientLink) {
            activeClientIds.add(client.id);
        }
    }
}

// Load all clients
let allClients = await clientsTable.selectRecordsAsync({
    fields: ["Active"]
});

let clientsUpdated = 0;

for (let client of allClients.records) {
    let isActive   = activeClientIds.has(client.id);
    let currentVal = client.getCellValue("Active") || false;

    if (isActive !== currentVal) {
        try {
            await clientsTable.updateRecordAsync(client.id, { "Active": isActive });
            clientsUpdated++;
        } catch (err) {
            console.log(`✗ Error updating client ${client.name}: ${err.message}`);
        }
    }
}

console.log(`Pets updated: ${petsUpdated}`);
console.log(`Clients updated: ${clientsUpdated}`);
console.log(`\nAll done!`);
