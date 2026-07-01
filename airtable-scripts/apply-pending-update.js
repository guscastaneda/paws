// Paws on Longmeadow — Apply Approved Pending Update
// Trigger: "When record enters a view" → Pending Updates filtered to Status = "Approved 🟢"
// Input variables:
//   - recordId  → trigger record's Record ID
// Secrets:
//   - AIRTABLE_API_KEY → your Airtable Personal Access Token

const { recordId } = input.config();
const apiKey = input.secret('AIRTABLE_API_KEY');

const BASE_ID        = 'appvQb876VInNJlnB';
const PENDING_TABLE  = 'tblte5MYEXmlJ4FvF';
const CLIENTS_TABLE  = 'tblqksLnPLdE0nF8Q';
const PETS_TABLE     = 'tbl6FYNs5D3LLxCdd';

// ── Field maps ────────────────────────────────────────────────────────────────

const CLIENT_FIELD_IDS = {
  'Email Address':                  'fldEiyeDye0XPbQhG',
  'Phone Number':                   'fldrMb2on5Ah4XPGy',
  'Emergency Contact Name':         'fldPtLY3f9x4A8Gvg',
  'Emergency Contact Phone':        'fldT0hsGKW9uNcMO5',
  'Emergency Contact Relationship': 'fldNY55KtTdeF0QE7',
};

const PET_FIELD_IDS = {
  'Breed':               { id: 'fldPoJvt28uyqIA07', type: 'text' },
  'Date of Birth':       { id: 'fldyQWVSP9CoIszey', type: 'date' },
  'Microchip Number':    { id: 'fldQxA3gcLmaK7HXY', type: 'text' },
  'Allergies':           { id: 'fldnQ3mHnc66Lnybm', type: 'text' },
  'Current Medications': { id: 'fldWfjDuc9sZzgkn9', type: 'text' },
  'Feeding Schedule':    { id: 'fld5li03PB28SRlfc', type: 'text' },
  'Fears & Triggers':    { id: 'fldlON4oKKblikvYC', type: 'text' },
  'Temperament':         { id: 'flde6oyRitUZSnyJr', type: 'text' },
  'Spayed/Neutered':     { id: 'fldozhvZNn8G5t8MZ', type: 'checkbox' },
  'Gender':              { id: 'fldeME6BfqF8KhXag', type: 'singleSelect' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function atGet(path) {
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}${path}`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`GET ${path} → ${await res.text()}`);
  return res.json();
}

async function atPatch(tableId, recId, fields) {
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tableId}/${recId}`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`PATCH ${tableId}/${recId} → ${await res.text()}`);
  return res.json();
}

// ── 1. Fetch the Pending Update ───────────────────────────────────────────────

const pending = await atGet(`/${PENDING_TABLE}/${recordId}`);
const f = pending.fields;

const fieldName = f['Field Name'];
const newValue  = f['New Value'];
const clientArr = f['Client'];

if (!fieldName || newValue == null || !clientArr?.length) {
  throw new Error(`Missing required fields on record ${recordId}`);
}

const clientId   = clientArr[0];
const clientName = clientArr[0];
console.log(`Processing: "${fieldName}" → "${newValue}" (client: ${clientName})`);

// ── 2. Determine pet vs client field ─────────────────────────────────────────

const petMatch = fieldName.match(/^(.+)\s—\s(.+)$/);

if (petMatch) {
  const petName  = petMatch[1].trim();
  const petField = petMatch[2].trim();

  // Skip vet updates — require manual handling
  if (petField === 'Primary Vet' || petField === 'Specialist Vet') {
    await atPatch(PENDING_TABLE, recordId, {
      'fldl4Gvd9SGCARBya': 'Vet updates require manual processing — skipped by automation.',
    });
    console.log(`Skipped: vet update for ${petName}`);
    output.set('result', 'skipped');
    return;
  }

  const petFieldDef = PET_FIELD_IDS[petField];
  if (!petFieldDef) throw new Error(`Unknown pet field: "${petField}"`);

  // Use Pet ID from Notes if available, otherwise search by name
  let petId = null;
  const notes = f['Notes'] || '';
  const petIdMatch = notes.match(/Pet ID: (rec\w+)/);
  if (petIdMatch) {
    petId = petIdMatch[1];
  } else {
    const clientRec = await atGet(`/${CLIENTS_TABLE}/${clientId}`);
    const petLinks = clientRec.fields['Pets'] || [];
    for (const link of petLinks) {
      const pet = await atGet(`/${PETS_TABLE}/${link}`);
      if (pet.fields['Pet Name']?.toLowerCase() === petName.toLowerCase()) {
        petId = link;
        break;
      }
    }
  }
  if (!petId) throw new Error(`Pet "${petName}" not found for client ${clientId}`);

  // Coerce value to correct type
  let value;
  if (petFieldDef.type === 'checkbox') {
    value = newValue === 'Yes' || newValue === true;
  } else if (petFieldDef.type === 'singleSelect') {
    value = newValue;
  } else {
    value = newValue;
  }

  await atPatch(PETS_TABLE, petId, { [petFieldDef.id]: value });
  console.log(`✓ ${petName} — ${petField} updated to "${newValue}"`);

} else {
  // Client field
  const fieldId = CLIENT_FIELD_IDS[fieldName];
  if (!fieldId) throw new Error(`Unknown client field: "${fieldName}"`);

  await atPatch(CLIENTS_TABLE, clientId, { [fieldId]: newValue });
  console.log(`✓ Client ${clientName} — ${fieldName} updated to "${newValue}"`);
}

output.set('result', 'applied');
