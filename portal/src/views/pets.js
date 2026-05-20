// ── PETS VIEW ────────────────────────────────────────────────────────────────
// Renders pet profile cards on the dashboard and handles:
// - Pet detail expansion
// - Vet info display and update
// - New pet registration

export function buildPetCards(clientData, goToStep, WORKER_URL, clientToken) {
  const container = document.getElementById('dash-pet-cards');
  if (!container) return;
  container.innerHTML = '';

  const pets = clientData.pets || [];
  if (pets.length === 0) {
    container.innerHTML = '<p style="font-size:0.85rem;color:var(--brand-stone);font-weight:300;">No pets on file yet. <a href="#" id="add-first-pet" style="color:var(--brand-primary);font-weight:500;">Register your pet →</a></p>';
    setTimeout(() => {
      const link = document.getElementById('add-first-pet');
      if (link) link.onclick = (e) => { e.preventDefault(); goToStep('new-pet'); };
    }, 0);
    return;
  }

  pets.forEach(pet => {
    const card = document.createElement('div');
    card.className = 'pet-profile-card';
    card.id = 'pet-card-' + pet.id;

    // ── Header ──
    const photoHtml = pet.photoUrl
      ? `<img src="${pet.photoUrl}" alt="${pet.name}" style="width:52px;height:52px;border-radius:50%;object-fit:cover;border:2px solid var(--brand-sage);">`
      : `<div style="width:52px;height:52px;border-radius:50%;background:var(--brand-sage-light);border:2px solid var(--brand-sage);display:flex;align-items:center;justify-content:center;font-size:1.5rem;">🐶</div>`;

    const genderIcon = pet.gender === 'Male' ? '♂' : pet.gender === 'Female' ? '♀' : '';
    const snBadge = pet.spayedNeutered
      ? `<span style="font-size:0.68rem;background:var(--brand-sage-light);color:var(--brand-primary);padding:0.15rem 0.45rem;border-radius:999px;font-weight:500;">✓ Spayed/Neutered</span>`
      : '';

    // ── Doc rows ──
    const REQUIRED_DOCS = ['Rabies Certificate', 'Town License', 'Vaccination Record'];
    const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '';

    const docRows = REQUIRED_DOCS.map(type => {
      const validDoc   = (pet.docs || []).find(d => d.type === type && !d.expired);
      const expiredDoc = (pet.docs || []).find(d => d.type === type &&  d.expired);
      const doc = validDoc || expiredDoc;
      const ok  = !!validDoc;
      const expiryText = doc?.expiryDate
        ? (ok ? 'Expires ' : 'Expired ') + fmtDate(doc.expiryDate)
        : (ok ? 'On file' : 'Missing');

      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:0.35rem 0;border-bottom:1px solid var(--brand-stone-light);">
        <span style="font-size:0.8rem;color:${ok ? 'var(--brand-bark)' : 'var(--brand-warning)'};">${ok ? '✅' : '⚠️'} ${type}</span>
        <span style="font-size:0.72rem;color:${ok ? 'var(--brand-stone)' : 'var(--brand-warning)'};font-weight:300;">${expiryText}</span>
      </div>`;
    }).join('');

    // ── Vet rows ──
    const primaryVet = pet.vets?.[0];
    const specialists = pet.vets?.slice(1) || [];

    const vetHtml = primaryVet
      ? `<div style="margin-bottom:0.5rem;">
          <div style="font-size:0.78rem;font-weight:500;color:var(--brand-bark);">🏥 ${primaryVet.clinic}</div>
          ${primaryVet.phone ? `<div style="font-size:0.75rem;color:var(--brand-stone);font-weight:300;">📞 ${primaryVet.phone}</div>` : ''}
          ${primaryVet.address ? `<div style="font-size:0.75rem;color:var(--brand-stone);font-weight:300;">📍 ${primaryVet.address}</div>` : ''}
        </div>
        ${specialists.map(v => `<div style="margin-bottom:0.4rem;padding-left:0.75rem;border-left:2px solid var(--brand-sage);">
          <div style="font-size:0.75rem;font-weight:500;color:var(--brand-bark);">🔬 ${v.clinic}</div>
          ${v.phone ? `<div style="font-size:0.72rem;color:var(--brand-stone);font-weight:300;">📞 ${v.phone}</div>` : ''}
        </div>`).join('')}`
      : `<div style="font-size:0.78rem;color:var(--brand-stone);font-weight:300;font-style:italic;">No vet on file</div>`;

    card.innerHTML = `
      <div class="pet-card" style="flex-direction:column;align-items:stretch;gap:0;cursor:pointer;" onclick="togglePetCard('${pet.id}')">
        <div style="display:flex;align-items:center;gap:0.85rem;">
          ${photoHtml}
          <div style="flex:1;">
            <div style="font-size:1rem;font-weight:500;color:var(--brand-bark);">${pet.name} <span style="color:var(--brand-stone);font-weight:300;font-size:0.85rem;">${genderIcon}</span></div>
            <div style="font-size:0.78rem;color:var(--brand-stone);font-weight:300;">${[pet.breed, pet.age].filter(Boolean).join(' · ')}</div>
            <div style="margin-top:0.25rem;">${snBadge}</div>
          </div>
          <div style="display:flex;align-items:center;gap:0.5rem;">
            <button id="edit-pet-btn-${pet.id}" style="padding:0.25rem 0.65rem;background:transparent;color:var(--brand-primary);border:1.5px solid var(--brand-primary);border-radius:999px;font-family:var(--font-body);font-size:0.72rem;font-weight:500;cursor:pointer;" onclick="event.stopPropagation()">Edit</button>
            <span style="font-size:0.75rem;color:var(--brand-stone);" id="pet-toggle-${pet.id}">▼</span>
          </div>
        </div>
      </div>

      <div id="pet-detail-${pet.id}" style="display:none;padding:0.75rem 0 0.25rem;">

        ${pet.dob ? `<div style="font-size:0.78rem;color:var(--brand-stone);margin-bottom:0.75rem;">🎂 Born ${fmtDate(pet.dob)}</div>` : ''}

        ${pet.notes ? `<div style="background:var(--brand-gold-light);border-left:3px solid var(--brand-gold);border-radius:0 8px 8px 0;padding:0.6rem 0.8rem;margin-bottom:0.75rem;">
          <div style="font-size:0.7rem;font-weight:500;text-transform:uppercase;letter-spacing:0.05em;color:var(--brand-stone);margin-bottom:0.25rem;">Health Notes</div>
          <div style="font-size:0.8rem;color:var(--brand-bark);font-weight:300;line-height:1.5;">${pet.notes}</div>
        </div>` : ''}

        <div style="margin-bottom:0.75rem;">
          <div style="font-size:0.7rem;font-weight:500;text-transform:uppercase;letter-spacing:0.05em;color:var(--brand-stone);margin-bottom:0.4rem;">Documents</div>
          ${docRows}
          <button id="pet-docs-btn-${pet.id}" style="margin-top:0.6rem;padding:0.35rem 0.75rem;background:transparent;color:var(--brand-primary);border:1.5px solid var(--brand-primary);border-radius:999px;font-family:var(--font-body);font-size:0.75rem;font-weight:500;cursor:pointer;">Upload / Update Docs</button>
        </div>

        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.4rem;">
            <div style="font-size:0.7rem;font-weight:500;text-transform:uppercase;letter-spacing:0.05em;color:var(--brand-stone);">Veterinarians</div>
            <button id="add-vet-btn-${pet.id}" style="padding:0.25rem 0.6rem;background:transparent;color:var(--brand-primary);border:1.5px solid var(--brand-primary);border-radius:999px;font-family:var(--font-body);font-size:0.72rem;font-weight:500;cursor:pointer;">+ Add Specialist</button>
          </div>
          ${vetHtml}
          <button id="update-vet-btn-${pet.id}" style="margin-top:0.5rem;padding:0.35rem 0.75rem;background:transparent;color:var(--brand-primary);border:1.5px solid var(--brand-primary);border-radius:999px;font-family:var(--font-body);font-size:0.75rem;font-weight:500;cursor:pointer;">${primaryVet ? 'Update Primary Vet' : 'Add Vet'}</button>
        </div>
      </div>`;

    container.appendChild(card);

    // Wire buttons after render
    setTimeout(() => {
      const docsBtn = document.getElementById('pet-docs-btn-' + pet.id);
      if (docsBtn) docsBtn.onclick = () => goToStep('docs');

      const updateVetBtn = document.getElementById('update-vet-btn-' + pet.id);
      if (updateVetBtn) updateVetBtn.onclick = () => openVetForm(pet, 'primary', clientData, WORKER_URL, clientToken);

      const addVetBtn = document.getElementById('add-vet-btn-' + pet.id);
      if (addVetBtn) addVetBtn.onclick = () => openVetForm(pet, 'specialist', clientData, WORKER_URL, clientToken);

      const editBtn = document.getElementById('edit-pet-btn-' + pet.id);
      if (editBtn) editBtn.onclick = () => openEditPetForm(pet, clientData, WORKER_URL, clientToken);
    }, 0);
  });

  // Add Register New Pet button
  const addBtn = document.createElement('button');
  addBtn.style.cssText = 'width:100%;padding:0.75rem;background:transparent;color:var(--brand-primary);border:1.5px dashed var(--brand-primary);border-radius:12px;font-family:var(--font-body);font-size:0.875rem;font-weight:500;cursor:pointer;margin-top:0.25rem;';
  addBtn.textContent = '+ Register a New Pet';
  addBtn.onclick = () => goToStep('new-pet');
  container.appendChild(addBtn);
}

// ── Toggle pet detail ─────────────────────────────────────────────────────────
window.togglePetCard = function(petId) {
  const detail = document.getElementById('pet-detail-' + petId);
  const toggle = document.getElementById('pet-toggle-' + petId);
  if (!detail) return;
  const isOpen = detail.style.display !== 'none';
  detail.style.display = isOpen ? 'none' : 'block';
  if (toggle) toggle.textContent = isOpen ? '▼' : '▲';
};

// ── Vet form ──────────────────────────────────────────────────────────────────
function openVetForm(pet, vetType, clientData, WORKER_URL, clientToken) {
  const existing = document.getElementById('vet-form-modal');
  if (existing) existing.remove();

  const isSpecialist = vetType === 'specialist';
  const title = isSpecialist ? 'Add Specialist Vet' : (pet.vets?.[0] ? 'Update Primary Vet' : 'Add Primary Vet');
  const current = !isSpecialist && pet.vets?.[0];

  const modal = document.createElement('div');
  modal.id = 'vet-form-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(44,31,20,0.4);z-index:100;display:flex;align-items:flex-end;justify-content:center;padding:1rem;';

  modal.innerHTML = `
    <div style="background:#fff;border-radius:20px 20px 0 0;width:100%;max-width:560px;padding:1.75rem 1.5rem 2.5rem;max-height:85vh;overflow-y:auto;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem;">
        <div style="font-family:var(--font-display);font-size:1.3rem;font-weight:600;">${title}</div>
        <button onclick="document.getElementById('vet-form-modal').remove()" style="background:none;border:none;font-size:1.25rem;cursor:pointer;color:var(--brand-stone);">✕</button>
      </div>
      <div style="font-size:0.82rem;color:var(--brand-stone);margin-bottom:1.25rem;font-weight:300;">For ${pet.name}. Changes will be reviewed before updating your account.</div>

      <div style="margin-bottom:1rem;">
        <label style="display:block;font-size:0.72rem;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:var(--brand-stone);margin-bottom:0.4rem;">Clinic Name <span style="color:var(--brand-gold);">*</span></label>
        <input id="vet-clinic" type="text" value="${current?.clinic || ''}" placeholder="e.g. MSPCA Angell" style="width:100%;padding:0.65rem 0.85rem;border:1.5px solid var(--brand-stone-light);border-radius:10px;font-family:var(--font-body);font-size:0.9rem;outline:none;">
      </div>
      <div style="margin-bottom:1rem;">
        <label style="display:block;font-size:0.72rem;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:var(--brand-stone);margin-bottom:0.4rem;">Phone</label>
        <input id="vet-phone" type="tel" value="${current?.phone || ''}" placeholder="(555) 555-5555" style="width:100%;padding:0.65rem 0.85rem;border:1.5px solid var(--brand-stone-light);border-radius:10px;font-family:var(--font-body);font-size:0.9rem;outline:none;">
      </div>
      <div style="margin-bottom:1rem;">
        <label style="display:block;font-size:0.72rem;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:var(--brand-stone);margin-bottom:0.4rem;">Address</label>
        <input id="vet-address" type="text" value="${current?.address || ''}" placeholder="123 Main St, Boston MA" style="width:100%;padding:0.65rem 0.85rem;border:1.5px solid var(--brand-stone-light);border-radius:10px;font-family:var(--font-body);font-size:0.9rem;outline:none;">
      </div>
      <div style="margin-bottom:1.25rem;">
        <label style="display:block;font-size:0.72rem;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:var(--brand-stone);margin-bottom:0.4rem;">Email</label>
        <input id="vet-email" type="email" value="${current?.email || ''}" placeholder="info@vetclinic.com" style="width:100%;padding:0.65rem 0.85rem;border:1.5px solid var(--brand-stone-light);border-radius:10px;font-family:var(--font-body);font-size:0.9rem;outline:none;">
      </div>

      <div id="vet-error" style="color:var(--brand-error);font-size:0.8rem;margin-bottom:0.75rem;display:none;"></div>

      <button id="vet-submit-btn" onclick="submitVetForm('${pet.id}', '${pet.name}', '${vetType}', '${clientData.clientId}', '${clientToken}', '${WORKER_URL}')"
        style="width:100%;padding:0.85rem;background:var(--brand-primary);color:#fff;border:none;border-radius:12px;font-family:var(--font-body);font-size:0.95rem;font-weight:500;cursor:pointer;">
        Submit Update
      </button>
    </div>`;

  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

window.submitVetForm = async function(petId, petName, vetType, clientId, clientToken, WORKER_URL) {
  const clinic  = document.getElementById('vet-clinic')?.value.trim();
  const phone   = document.getElementById('vet-phone')?.value.trim();
  const address = document.getElementById('vet-address')?.value.trim();
  const email   = document.getElementById('vet-email')?.value.trim();
  const errEl   = document.getElementById('vet-error');
  const btn     = document.getElementById('vet-submit-btn');

  if (!clinic) {
    errEl.textContent = 'Please enter the clinic name.';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Submitting…';

  try {
    const res = await fetch(WORKER_URL + '/vet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: clientToken, clientId, petId, petName, vetType, vetClinic: clinic, vetPhone: phone, vetAddress: address, vetEmail: email }),
    });
    if (!res.ok) throw new Error('Server error');
    document.getElementById('vet-form-modal').remove();
    // Show brief success toast
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:var(--brand-success);color:#fff;padding:0.75rem 1.5rem;border-radius:999px;font-size:0.875rem;font-weight:500;z-index:200;';
    toast.textContent = 'Vet info submitted for review ✓';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  } catch {
    errEl.textContent = 'Something went wrong. Please try again.';
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Submit Update';
  }
};

// ── Build new pet registration HTML ──────────────────────────────────────────
export function buildNewPetView() {
  return `
  <div id="view-new-pet">
    <div class="step-header">
      <button class="step-back" id="new-pet-back">← Back</button>
      <div class="step-title">Register a <em>New Pet</em></div>
      <p class="step-desc">Tell us about your pet. We will review and add them to your account within 24 hours.</p>
    </div>

    <div class="form-group">
      <label>Pet Name <span class="req">*</span></label>
      <input type="text" id="np-name" placeholder="e.g. Buddy"/>
      <div class="field-error" id="np-name-error">Please enter your pet's name.</div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Species <span class="req">*</span></label>
        <select id="np-species">
          <option value="">Select...</option>
          <option value="Dog">Dog</option>
          <option value="Cat">Cat</option>
          <option value="Other">Other</option>
        </select>
        <div class="field-error" id="np-species-error">Please select a species.</div>
      </div>
      <div class="form-group">
        <label>Gender</label>
        <select id="np-gender">
          <option value="">Select...</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
        </select>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Breed <span class="opt">(optional)</span></label>
        <input type="text" id="np-breed" placeholder="e.g. Golden Retriever"/>
      </div>
      <div class="form-group">
        <label>Date of Birth <span class="opt">(optional)</span></label>
        <input type="date" id="np-dob"/>
      </div>
    </div>

    <div class="form-group">
      <label style="display:flex;align-items:center;gap:0.5rem;text-transform:none;letter-spacing:0;font-size:0.875rem;font-weight:400;cursor:pointer;">
        <input type="checkbox" id="np-spayed" style="width:16px;height:16px;accent-color:var(--brand-primary);">
        Spayed / Neutered
      </label>
    </div>

    <div class="form-group">
      <label>Health Notes <span class="opt">(optional)</span></label>
      <textarea id="np-notes" placeholder="Any medical history, allergies, medications, or special needs we should know about..."></textarea>
    </div>

    <div class="divider"></div>
    <p class="step-desc" style="margin-bottom:1rem;">Veterinarian <span style="color:var(--brand-stone);font-weight:300;">(optional — you can add this later)</span></p>

    <div class="form-group">
      <label>Clinic Name</label>
      <input type="text" id="np-vet-clinic" placeholder="e.g. MSPCA Angell"/>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Phone</label>
        <input type="tel" id="np-vet-phone" placeholder="(555) 555-5555"/>
      </div>
      <div class="form-group">
        <label>Address</label>
        <input type="text" id="np-vet-address" placeholder="Boston, MA"/>
      </div>
    </div>

    <div class="form-error" id="np-form-error"></div>
    <button class="btn-primary" id="np-submit">
      <span class="btn-text">Register Pet</span>
      <span class="btn-loading">Submitting…</span>
    </button>
  </div>

  <div id="view-new-pet-success" style="display:none;">
    <div class="success-wrap">
      <div class="success-circle">🐾</div>
      <h2>Pet registered!</h2>
      <p style="margin-top:0.5rem;">We will review and add them to your account within 24 hours. You can upload their compliance documents in the meantime.</p>
    </div>
    <button class="btn-primary" style="margin-top:1.5rem;" id="np-success-back">Back to Portal</button>
  </div>`;
}

// ── Wire new pet form ─────────────────────────────────────────────────────────
export function wireNewPetForm(clientData, goHome, WORKER_URL, clientToken) {
  const backBtn = document.getElementById('new-pet-back');
  if (backBtn) backBtn.onclick = goHome;

  const successBack = document.getElementById('np-success-back');
  if (successBack) successBack.onclick = goHome;

  const submit = document.getElementById('np-submit');
  if (!submit) return;

  submit.onclick = async () => {
    let valid = true;
    const name    = document.getElementById('np-name')?.value.trim();
    const species = document.getElementById('np-species')?.value;

    if (!name)    { document.getElementById('np-name-error').classList.add('visible');    valid = false; }
    else            document.getElementById('np-name-error').classList.remove('visible');
    if (!species) { document.getElementById('np-species-error').classList.add('visible'); valid = false; }
    else            document.getElementById('np-species-error').classList.remove('visible');
    if (!valid) return;

    submit.disabled = true;
    submit.classList.add('loading');
    document.getElementById('np-form-error').classList.remove('visible');

    try {
      const res = await fetch(WORKER_URL + '/pet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token:          clientToken,
          clientId:       clientData.clientId,
          petName:        name,
          species,
          breed:          document.getElementById('np-breed')?.value.trim()      || '',
          dob:            document.getElementById('np-dob')?.value                || '',
          gender:         document.getElementById('np-gender')?.value             || '',
          spayedNeutered: document.getElementById('np-spayed')?.checked           || false,
          notes:          document.getElementById('np-notes')?.value.trim()      || '',
          vetClinic:      document.getElementById('np-vet-clinic')?.value.trim() || '',
          vetPhone:       document.getElementById('np-vet-phone')?.value.trim()  || '',
          vetAddress:     document.getElementById('np-vet-address')?.value.trim()|| '',
        }),
      });
      if (!res.ok) throw new Error('Server error');
      document.getElementById('view-new-pet').style.display       = 'none';
      document.getElementById('view-new-pet-success').style.display = 'block';
    } catch {
      document.getElementById('np-form-error').textContent = 'Something went wrong. Please try again.';
      document.getElementById('np-form-error').classList.add('visible');
      submit.disabled = false;
      submit.classList.remove('loading');
    }
  };
}

// ── Edit pet bottom sheet ─────────────────────────────────────────────────────
export function openEditPetForm(pet, clientData, WORKER_URL, clientToken) {
  const existing = document.getElementById('edit-pet-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'edit-pet-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(44,31,20,0.4);z-index:100;display:flex;align-items:flex-end;justify-content:center;padding:0;';

  modal.innerHTML = `
    <div style="background:#fff;border-radius:20px 20px 0 0;width:100%;max-width:560px;max-height:90vh;overflow-y:auto;">
      <!-- Header -->
      <div style="position:sticky;top:0;background:#fff;padding:1.25rem 1.5rem 0.75rem;border-bottom:1px solid var(--brand-stone-light);z-index:1;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
          <div style="font-family:var(--font-display);font-size:1.3rem;font-weight:600;">Update ${pet.name}</div>
          <button onclick="document.getElementById('edit-pet-modal').remove()" style="background:none;border:none;font-size:1.25rem;cursor:pointer;color:var(--brand-stone);">✕</button>
        </div>
        <!-- Tabs -->
        <div style="display:flex;gap:0;">
          <button class="edit-pet-tab active" data-tab="basic" onclick="switchEditPetTab('basic')" style="flex:1;padding:0.6rem 0.5rem;background:none;border:none;border-bottom:2px solid var(--brand-primary);font-family:var(--font-body);font-size:0.8rem;font-weight:500;color:var(--brand-primary);cursor:pointer;">Basic Info</button>
          <button class="edit-pet-tab" data-tab="health" onclick="switchEditPetTab('health')" style="flex:1;padding:0.6rem 0.5rem;background:none;border:none;border-bottom:2px solid transparent;font-family:var(--font-body);font-size:0.8rem;font-weight:400;color:var(--brand-stone);cursor:pointer;">Health & Behavior</button>
          <button class="edit-pet-tab" data-tab="vet" onclick="switchEditPetTab('vet')" style="flex:1;padding:0.6rem 0.5rem;background:none;border:none;border-bottom:2px solid transparent;font-family:var(--font-body);font-size:0.8rem;font-weight:400;color:var(--brand-stone);cursor:pointer;">Vet Info</button>
        </div>
      </div>

      <div style="padding:1.25rem 1.5rem 2rem;">

        <!-- Tab: Basic Info -->
        <div id="edit-tab-basic">
          <p style="font-size:0.8rem;color:var(--brand-stone);font-weight:300;margin-bottom:1rem;">Updates go to review before being applied.</p>

          <div style="margin-bottom:1rem;">
            <label style="display:block;font-size:0.72rem;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:var(--brand-stone);margin-bottom:0.4rem;">Breed</label>
            <input id="ep-breed" type="text" value="${pet.breed || ''}" placeholder="e.g. German Shorthaired Pointer" style="width:100%;padding:0.65rem 0.85rem;border:1.5px solid var(--brand-stone-light);border-radius:10px;font-family:var(--font-body);font-size:0.9rem;outline:none;box-sizing:border-box;">
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1rem;">
            <div>
              <label style="display:block;font-size:0.72rem;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:var(--brand-stone);margin-bottom:0.4rem;">Date of Birth</label>
              <input id="ep-dob" type="date" value="${pet.dob || ''}" style="width:100%;padding:0.65rem 0.85rem;border:1.5px solid var(--brand-stone-light);border-radius:10px;font-family:var(--font-body);font-size:0.9rem;outline:none;box-sizing:border-box;">
            </div>
            <div>
              <label style="display:block;font-size:0.72rem;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:var(--brand-stone);margin-bottom:0.4rem;">Gender</label>
              <select id="ep-gender" style="width:100%;padding:0.65rem 0.85rem;border:1.5px solid var(--brand-stone-light);border-radius:10px;font-family:var(--font-body);font-size:0.9rem;outline:none;box-sizing:border-box;background:#fff;">
                <option value="">Select...</option>
                <option value="Male" ${pet.gender === 'Male' ? 'selected' : ''}>Male</option>
                <option value="Female" ${pet.gender === 'Female' ? 'selected' : ''}>Female</option>
              </select>
            </div>
          </div>

          <div style="margin-bottom:1rem;">
            <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.875rem;font-weight:400;cursor:pointer;color:var(--brand-bark);">
              <input type="checkbox" id="ep-spayed" ${pet.spayedNeutered ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--brand-primary);">
              Spayed / Neutered
            </label>
          </div>

          <div style="margin-bottom:1rem;">
            <label style="display:block;font-size:0.72rem;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:var(--brand-stone);margin-bottom:0.4rem;">Microchip Number</label>
            <input id="ep-microchip" type="text" value="${pet.microchip || ''}" placeholder="15-digit microchip ID" style="width:100%;padding:0.65rem 0.85rem;border:1.5px solid var(--brand-stone-light);border-radius:10px;font-family:var(--font-body);font-size:0.9rem;outline:none;box-sizing:border-box;">
          </div>
        </div>

        <!-- Tab: Health & Behavior -->
        <div id="edit-tab-health" style="display:none;">
          <p style="font-size:0.8rem;color:var(--brand-stone);font-weight:300;margin-bottom:1rem;">This information helps us provide the best care for ${pet.name}.</p>

          <div style="margin-bottom:1rem;">
            <label style="display:block;font-size:0.72rem;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:var(--brand-stone);margin-bottom:0.4rem;">Allergies</label>
            <textarea id="ep-allergies" placeholder="e.g. chicken, pollen, penicillin" style="width:100%;padding:0.65rem 0.85rem;border:1.5px solid var(--brand-stone-light);border-radius:10px;font-family:var(--font-body);font-size:0.9rem;outline:none;box-sizing:border-box;min-height:70px;resize:vertical;">${pet.allergies || ''}</textarea>
          </div>

          <div style="margin-bottom:1rem;">
            <label style="display:block;font-size:0.72rem;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:var(--brand-stone);margin-bottom:0.4rem;">Current Medications</label>
            <textarea id="ep-medications" placeholder="e.g. Apoquel 16mg once daily with food" style="width:100%;padding:0.65rem 0.85rem;border:1.5px solid var(--brand-stone-light);border-radius:10px;font-family:var(--font-body);font-size:0.9rem;outline:none;box-sizing:border-box;min-height:70px;resize:vertical;">${pet.medications || ''}</textarea>
          </div>

          <div style="margin-bottom:1rem;">
            <label style="display:block;font-size:0.72rem;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:var(--brand-stone);margin-bottom:0.4rem;">Feeding Schedule</label>
            <textarea id="ep-feeding" placeholder="e.g. 1 cup Orijen dry kibble AM and PM, no treats before noon" style="width:100%;padding:0.65rem 0.85rem;border:1.5px solid var(--brand-stone-light);border-radius:10px;font-family:var(--font-body);font-size:0.9rem;outline:none;box-sizing:border-box;min-height:70px;resize:vertical;">${pet.feeding || ''}</textarea>
          </div>

          <div style="margin-bottom:1rem;">
            <label style="display:block;font-size:0.72rem;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:var(--brand-stone);margin-bottom:0.4rem;">Fears & Triggers</label>
            <textarea id="ep-fears" placeholder="e.g. thunderstorms, fireworks, vacuum cleaners, men with hats" style="width:100%;padding:0.65rem 0.85rem;border:1.5px solid var(--brand-stone-light);border-radius:10px;font-family:var(--font-body);font-size:0.9rem;outline:none;box-sizing:border-box;min-height:70px;resize:vertical;">${pet.fears || ''}</textarea>
          </div>

          <div style="margin-bottom:1rem;">
            <label style="display:block;font-size:0.72rem;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:var(--brand-stone);margin-bottom:0.4rem;">Temperament</label>
            <textarea id="ep-temperament" placeholder="e.g. friendly with other dogs, reactive on leash, shy with strangers at first" style="width:100%;padding:0.65rem 0.85rem;border:1.5px solid var(--brand-stone-light);border-radius:10px;font-family:var(--font-body);font-size:0.9rem;outline:none;box-sizing:border-box;min-height:70px;resize:vertical;">${pet.temperament || ''}</textarea>
          </div>
        </div>

        <!-- Tab: Vet Info -->
        <div id="edit-tab-vet" style="display:none;">
          <p style="font-size:0.8rem;color:var(--brand-stone);font-weight:300;margin-bottom:1rem;">Primary vet for ${pet.name}. Changes go to review before being applied.</p>

          <div style="margin-bottom:1rem;">
            <label style="display:block;font-size:0.72rem;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:var(--brand-stone);margin-bottom:0.4rem;">Clinic Name <span style="color:var(--brand-gold);">*</span></label>
            <input id="ep-vet-clinic" type="text" value="${pet.vets?.[0]?.clinic || ''}" placeholder="e.g. MSPCA Angell" style="width:100%;padding:0.65rem 0.85rem;border:1.5px solid var(--brand-stone-light);border-radius:10px;font-family:var(--font-body);font-size:0.9rem;outline:none;box-sizing:border-box;">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1rem;">
            <div>
              <label style="display:block;font-size:0.72rem;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:var(--brand-stone);margin-bottom:0.4rem;">Phone</label>
              <input id="ep-vet-phone" type="tel" value="${pet.vets?.[0]?.phone || ''}" placeholder="(617) 522-7282" style="width:100%;padding:0.65rem 0.85rem;border:1.5px solid var(--brand-stone-light);border-radius:10px;font-family:var(--font-body);font-size:0.9rem;outline:none;box-sizing:border-box;">
            </div>
            <div>
              <label style="display:block;font-size:0.72rem;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:var(--brand-stone);margin-bottom:0.4rem;">Email</label>
              <input id="ep-vet-email" type="email" value="${pet.vets?.[0]?.email || ''}" placeholder="info@vet.com" style="width:100%;padding:0.65rem 0.85rem;border:1.5px solid var(--brand-stone-light);border-radius:10px;font-family:var(--font-body);font-size:0.9rem;outline:none;box-sizing:border-box;">
            </div>
          </div>
          <div style="margin-bottom:1.25rem;">
            <label style="display:block;font-size:0.72rem;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:var(--brand-stone);margin-bottom:0.4rem;">Address</label>
            <input id="ep-vet-address" type="text" value="${pet.vets?.[0]?.address || ''}" placeholder="350 S Huntington Ave, Boston MA" style="width:100%;padding:0.65rem 0.85rem;border:1.5px solid var(--brand-stone-light);border-radius:10px;font-family:var(--font-body);font-size:0.9rem;outline:none;box-sizing:border-box;">
          </div>
        </div>

        <!-- Error + Submit -->
        <div id="ep-error" style="color:var(--brand-error);font-size:0.8rem;margin-bottom:0.75rem;display:none;"></div>
        <button id="ep-submit-btn" style="width:100%;padding:0.85rem;background:var(--brand-primary);color:#fff;border:none;border-radius:12px;font-family:var(--font-body);font-size:0.95rem;font-weight:500;cursor:pointer;">
          Submit Updates
        </button>
      </div>
    </div>`;

  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

  // Wire submit via closure — avoids string interpolation issues
  setTimeout(() => {
    const submitBtn = document.getElementById('ep-submit-btn');
    if (submitBtn) {
      submitBtn.onclick = () => submitEditPetClosure(pet.id, pet.name, clientData.clientId, clientToken, WORKER_URL);
    }
  }, 0);
}

async function submitEditPetClosure(petId, petName, clientId, clientToken, WORKER_URL) {
  const btn   = document.getElementById('ep-submit-btn');
  const errEl = document.getElementById('ep-error');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = 'Submitting…';
  errEl.style.display = 'none';

  const fields = {
    'Breed':               document.getElementById('ep-breed')?.value.trim()        || '',
    'Date of Birth':       document.getElementById('ep-dob')?.value                 || '',
    'Gender':              document.getElementById('ep-gender')?.value              || '',
    'Spayed/Neutered':     document.getElementById('ep-spayed')?.checked ? 'Yes' : 'No',
    'Microchip Number':    document.getElementById('ep-microchip')?.value.trim()    || '',
    'Allergies':           document.getElementById('ep-allergies')?.value.trim()    || '',
    'Current Medications': document.getElementById('ep-medications')?.value.trim()  || '',
    'Feeding Schedule':    document.getElementById('ep-feeding')?.value.trim()      || '',
    'Fears & Triggers':    document.getElementById('ep-fears')?.value.trim()        || '',
    'Temperament':         document.getElementById('ep-temperament')?.value.trim()  || '',
    'Vet Clinic':          document.getElementById('ep-vet-clinic')?.value.trim()   || '',
    'Vet Phone':           document.getElementById('ep-vet-phone')?.value.trim()    || '',
    'Vet Email':           document.getElementById('ep-vet-email')?.value.trim()    || '',
    'Vet Address':         document.getElementById('ep-vet-address')?.value.trim()  || '',
  };

  try {
    const res = await fetch(WORKER_URL + '/pet-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: clientToken, clientId, petId, petName, fields }),
    });
    if (!res.ok) throw new Error('Server error');
    document.getElementById('edit-pet-modal').remove();
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:var(--brand-success);color:#fff;padding:0.75rem 1.5rem;border-radius:999px;font-size:0.875rem;font-weight:500;z-index:200;';
    toast.textContent = 'Updates submitted for review ✓';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  } catch {
    errEl.textContent = 'Something went wrong. Please try again.';
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Submit Updates';
  }
}

window.switchEditPetTab = function(tab) {
  ['basic','health','vet'].forEach(t => {
    const panel = document.getElementById('edit-tab-' + t);
    const btn   = document.querySelector(`.edit-pet-tab[data-tab="${t}"]`);
    if (panel) panel.style.display = t === tab ? 'block' : 'none';
    if (btn) {
      btn.style.borderBottomColor = t === tab ? 'var(--brand-primary)' : 'transparent';
      btn.style.color             = t === tab ? 'var(--brand-primary)' : 'var(--brand-stone)';
      btn.style.fontWeight        = t === tab ? '500' : '400';
    }
  });
};