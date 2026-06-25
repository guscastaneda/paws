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
    container.innerHTML = '<p style="font-size:0.85rem;color:var(--muted);">No pets on file yet. <a href="#" id="add-first-pet" style="color:var(--green);font-weight:600;">Register your pet</a></p>';
    setTimeout(() => {
      const link = document.getElementById('add-first-pet');
      if (link) link.onclick = (e) => { e.preventDefault(); goToStep('new-pet'); };
    }, 0);
    return;
  }

  const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  pets.forEach(pet => {
    const card = document.createElement('div');
    card.className = 'resident ' + (pet.active ? 'is-active' : 'is-inactive');
    card.id = 'pet-card-' + pet.id;

    // ── Photo tile: real image (Polly) or paw fallback ──
    const photoHtml = pet.photoUrl
      ? `<div class="resident-photo"><img src="${pet.photoUrl}" alt="${pet.name}"></div>`
      : `<div class="resident-photo"${pet.active ? '' : ' style="filter:grayscale(0.4);opacity:0.85;"'}><svg class="ic"><use href="#i-paw"/></svg></div>`;

    // ── In memoriam: a pet that has passed. Quiet, dignified, no actions, no
    //    nudges, no document asks — it simply rests here. This must come before
    //    every other state so a grieving owner is never shown an Edit button,
    //    a booking prompt, or a compliance request for their dog.
    if (pet.deceased) {
      const fmtMemorial = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric' }) : '';
      const passedYear = fmtMemorial(pet.dateOfDeath);
      card.className = 'resident is-memorial';
      card.innerHTML = `
        <div class="resident-top" style="cursor:default;">
          <div class="resident-photo memorial-photo">${pet.photoUrl ? `<img src="${pet.photoUrl}" alt="${pet.name}">` : `<svg class="ic"><use href="#i-paw"/></svg>`}</div>
          <div class="resident-body">
            <div class="resident-name">${pet.name}</div>
            <div class="memorial-line">In loving memory${passedYear ? ' · ' + passedYear : ''}</div>
          </div>
        </div>`;
      container.appendChild(card);
      return;
    }

    // Gender with spay/neuter shown in parens, e.g. "Male (neutered)".
    let genderTerm = '';
    if (pet.gender) {
      genderTerm = pet.gender + (pet.spayedNeutered ? ' (' + (pet.gender.toLowerCase() === 'female' ? 'spayed' : 'neutered') + ')' : '');
    } else if (pet.spayedNeutered) {
      genderTerm = 'Spayed/neutered';
    }
    // Age shown as-is (e.g. "9.2 yrs").
    const ageText = pet.age || '';
    // Line 1 under the name: age + gender. Line 2: breed(s).
    const ageGenderLine = [ageText, genderTerm].filter(Boolean).join(', ');
    const breedLine = pet.breed || 'Mixed Breed';
    const statusChip = pet.active
      ? '<span class="chip active"><span class="dot"></span>Active</span>'
      : '<span class="chip inactive"><span class="dot"></span>Inactive</span>';

    // ── Inactive: header, no expand ──
    if (!pet.active) {
      // A brand-new pet (never stayed) still gets a gentle welcome with a way to
      // arrange the first visit. The "it's been a while" lapsed-reactivation nudge
      // has been removed from the card per design.
      const nudgeHtml = pet.hasStayed
        ? ''
        : `<div class="nudge nudge-welcome">
          <p>${pet.name} is all set up. The first visit is a quick trial daycare we arrange together. Reach out and we'll find a day that works.</p>
          <button class="btn-green" onclick="openMessage({ topic: 'pet', petId: '${pet.id}', prefillBody: 'We just finished setting up ${pet.name.replace(/'/g, "\\'")} and would like to arrange a first trial daycare visit.' })"><svg class="ic"><use href="#i-msg"/></svg>Arrange a first visit</button>
        </div>`;
      card.innerHTML = `
        <div class="resident-top" style="cursor:default;">
          ${photoHtml}
          <div class="resident-body">
            <div class="resident-nameline">
              <span class="resident-name">${pet.name}</span>
              ${statusChip}
            </div>
            ${ageGenderLine ? `<div class="resident-meta">${ageGenderLine}</div>` : ''}
            <div class="resident-breed">${breedLine}</div>
          </div>
          <div class="resident-actions">
            <button class="btn-ghost quiet" id="edit-pet-btn-${pet.id}"><svg class="ic"><use href="#i-edit"/></svg>Update</button>
          </div>
        </div>
        ${nudgeHtml}`;
      container.appendChild(card);
      setTimeout(() => {
        const editBtn = document.getElementById('edit-pet-btn-' + pet.id);
        if (editBtn) editBtn.onclick = () => openEditPetForm(pet, clientData, WORKER_URL, clientToken);
      }, 0);
      return;
    }

    // ── Active: full resident card with animated expand ──
    // ── Doc rows ──
    const REQUIRED_DOCS = ['Rabies Certificate', 'Town License', 'Vaccination Record'];
    const docRows = REQUIRED_DOCS.map(type => {
      const validDoc   = (pet.docs || []).find(d => d.type === type && !d.expired);
      const expiredDoc = (pet.docs || []).find(d => d.type === type && d.expired);
      const doc = validDoc || expiredDoc;
      const ok  = !!validDoc;
      const cls = ok ? 'ok' : (expiredDoc ? 'expired' : 'miss');
      const icon = ok ? 'i-check' : 'i-alert';
      const when = doc?.expiryDate
        ? (ok ? 'Expires ' : 'Expired ') + fmtDate(doc.expiryDate)
        : (ok ? 'On file' : 'Missing');
      return `<div class="doc-line ${cls}"><span class="name"><svg class="ic"><use href="#${icon}"/></svg>${type}</span><span class="when">${when}</span></div>`;
    }).join('');

    // ── Vet rows ──
    const primaryVet  = pet.vets?.[0];
    const specialists = pet.vets?.slice(1) || [];
    const vetHtml = primaryVet
      ? `<div class="detail-row"><svg class="ic"><use href="#i-vet"/></svg><span>${primaryVet.clinic}${primaryVet.phone ? `<br><span class="k">${primaryVet.phone}</span>` : ''}${primaryVet.address ? `<br><span class="k">${primaryVet.address}</span>` : ''}</span></div>
         ${specialists.map(v => `<div class="detail-row" style="padding-left:0.5rem;border-left:2px solid var(--green-wash);"><svg class="ic"><use href="#i-vet"/></svg><span>${v.clinic}${v.phone ? `<br><span class="k">${v.phone}</span>` : ''}</span></div>`).join('')}`
      : `<div class="detail-row" style="color:var(--muted);font-style:italic;">No vet on file</div>`;

    card.innerHTML = `
      <div class="resident-top" onclick="togglePetCard('${pet.id}')">
        ${photoHtml}
        <div class="resident-body">
          <div class="resident-nameline">
            <span class="resident-name">${pet.name}</span>
            ${statusChip}
          </div>
          ${ageGenderLine ? `<div class="resident-meta">${ageGenderLine}</div>` : ''}
          <div class="resident-breed">${breedLine}</div>
        </div>
        <div class="resident-actions">
          <button class="btn-ghost quiet" id="edit-pet-btn-${pet.id}" onclick="event.stopPropagation()"><svg class="ic"><use href="#i-edit"/></svg>Update</button>
          <svg class="ic chev"><use href="#i-arrow"/></svg>
        </div>
      </div>

      <div class="resident-detail"><div class="inner"><div class="detail-pad">
        ${pet.dob ? `<div class="detail-row"><svg class="ic"><use href="#i-cake"/></svg><span><span class="k">Born</span> ${fmtDate(pet.dob)}</span></div>` : ''}

        ${pet.notes ? `<div class="info-box" style="margin:0.5rem 0;"><div class="doc-label" style="margin:0 0 0.2rem;">Health Notes</div>${pet.notes}</div>` : ''}
        ${pet.allergies ? `<div class="detail-row"><span><span class="k">Allergies:</span> ${pet.allergies}</span></div>` : ''}
        ${pet.medications ? `<div class="detail-row"><span><span class="k">Medications:</span> ${pet.medications}</span></div>` : ''}
        ${pet.feeding ? `<div class="detail-row"><span><span class="k">Feeding:</span> ${pet.feeding}</span></div>` : ''}
        ${pet.insurance ? `<div class="detail-row"><span><span class="k">Insurance:</span> ${pet.insurance}</span></div>` : ''}

        <div class="doc-label">Documents</div>
        ${docRows}
        <button class="btn-ghost" id="pet-docs-btn-${pet.id}" style="margin-top:0.6rem;"><svg class="ic"><use href="#i-upload"/></svg>Upload / Update Docs</button>

        <div style="display:flex;align-items:center;justify-content:space-between;margin:0.85rem 0 0.3rem;">
          <div class="doc-label" style="margin:0;">Veterinarian</div>
          <button class="btn-ghost" id="add-vet-btn-${pet.id}" style="padding:0.22rem 0.55rem;"><svg class="ic"><use href="#i-plus"/></svg>Specialist</button>
        </div>
        ${vetHtml}
        <button class="btn-ghost" id="update-vet-btn-${pet.id}" style="margin-top:0.5rem;">${primaryVet ? 'Update Primary Vet' : 'Add Vet'}</button>
      </div></div></div>`;

    container.appendChild(card);

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

  const addBtn = document.createElement('button');
  addBtn.className = 'add-resident';
  addBtn.innerHTML = '<svg class="ic"><use href="#i-plus"/></svg>Register a new pet';
  addBtn.onclick = () => goToStep('new-pet');
  container.appendChild(addBtn);
}

// ── Toggle pet detail ─────────────────────────────────────────────────────────
window.togglePetCard = function (petId) {
  const card = document.getElementById('pet-card-' + petId);
  if (!card) return;
  card.classList.toggle('open');
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
    <div style="background:#fff;border-radius:20px 20px 0 0;width:100%;max-width:560px;max-height:85vh;overflow:hidden;display:flex;flex-direction:column;">
      <div class="modal-scroll" style="overflow-y:auto;flex:1;min-height:0;padding:1.75rem 1.5rem 2.5rem;">
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
      </div>
    </div>`;

  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

window.submitVetForm = async function (petId, petName, vetType, clientId, clientToken, WORKER_URL) {
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

// ── Breed picker ──────────────────────────────────────────────────────────────
function initBreedPicker(pet, WORKER_URL) {
  const selected = [];

  // Pre-populate from current pet breeds if breedIds are available
  if (pet.breedIds && pet.breedIds.length > 0 && pet.breed) {
    const breedNames = pet.breed.startsWith('Mixed Breed (')
      ? pet.breed.replace('Mixed Breed (', '').replace(')', '').split(' · ')
      : [pet.breed];
    pet.breedIds.forEach((id, i) => {
      if (id && breedNames[i]) selected.push({ id, name: breedNames[i] });
    });
  }

  const pillsEl   = document.getElementById('ep-breed-pills');
  const searchEl  = document.getElementById('ep-breed-search');
  const listEl    = document.getElementById('ep-breed-list');
  const unknownEl = document.getElementById('ep-breed-unknown');

  if (!pillsEl || !searchEl || !listEl || !unknownEl) return;

  // Collapsed by default — list only appears when the user engages the search box
  listEl.style.display = 'none';

  let allBreeds = [];

  fetch((WORKER_URL || '') + '/breeds')
    .then(r => r.json())
    .then(breeds => {
      allBreeds = breeds.filter(b => b.species === 'Dog');
      renderList('');
    })
    .catch(() => {
      listEl.innerHTML = '<div style="padding:0.75rem;font-size:0.8rem;color:var(--brand-stone);">Could not load breeds.</div>';
    });

  function renderPills() {
    pillsEl.innerHTML = '';
    selected.forEach(b => {
      const pill = document.createElement('div');
      pill.style.cssText = 'display:flex;align-items:center;gap:0.3rem;background:var(--brand-sage-light);border:1.5px solid var(--brand-sage);border-radius:999px;padding:0.2rem 0.6rem;font-size:0.75rem;font-weight:500;color:var(--brand-primary);';
      const removeBtn = document.createElement('button');
      removeBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:var(--brand-stone);font-size:0.85rem;line-height:1;padding:0;';
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => {
        const idx = selected.findIndex(s => s.id === b.id);
        if (idx > -1) selected.splice(idx, 1);
        renderPills();
        renderList(searchEl.value);
      });
      pill.textContent = b.name + ' ';
      pill.appendChild(removeBtn);
      pillsEl.appendChild(pill);
    });
  }

  function renderList(query) {
    const q = query.toLowerCase();
    const filtered = allBreeds
      .filter(b => b.name.toLowerCase().includes(q) && !selected.find(s => s.id === b.id))
      .slice(0, 30);

    if (filtered.length === 0) {
      listEl.innerHTML = '<div style="padding:0.75rem;font-size:0.8rem;color:var(--brand-stone);">No breeds found.</div>';
      return;
    }

    listEl.innerHTML = '';
    filtered.forEach(b => {
      const item = document.createElement('div');
      item.style.cssText = 'padding:0.6rem 0.85rem;font-size:0.85rem;cursor:pointer;border-bottom:1px solid var(--brand-stone-light);color:var(--brand-bark);';
      item.textContent = b.name;
      item.addEventListener('mouseenter', () => item.style.background = 'var(--brand-sage-light)');
      item.addEventListener('mouseleave', () => item.style.background = '');
      item.addEventListener('click', () => {
        if (selected.length >= 3) return;
        selected.push({ id: b.id, name: b.name });
        searchEl.value = '';
        renderPills();
        renderList('');
      });
      listEl.appendChild(item);
    });
  }

  unknownEl.addEventListener('click', e => {
    e.preventDefault();
    selected.length = 0;
    renderPills();
    renderList('');
  });

  searchEl.addEventListener('focus', () => { listEl.style.display = 'block'; renderList(searchEl.value); });
  searchEl.addEventListener('input', () => { listEl.style.display = 'block'; renderList(searchEl.value); });
  searchEl.addEventListener('blur', () => { setTimeout(() => { listEl.style.display = 'none'; }, 150); });
  renderPills();

  window._getSelectedBreedIds = () => selected.map(b => b.id);
}

// ── Insurance provider <option> list ─────────────────────────────────────────
// Built with string concatenation (NOT template literals) so it can be safely
// interpolated inside the larger modal template literal without nested backticks
// breaking the outer string.
const INSURANCE_PROVIDERS = ['Healthy Paws','ASPCA','AKC','Embrace','Fetch','Figo','Lemonade','Liberty Mutual','MetLife','Nationwide','Pets Best','Progressive','Pumpkin','Spot','State Farm','Trupanion','USAA','Other','None / Self-pay'];

function buildProviderOptions(current) {
  const list = INSURANCE_PROVIDERS.slice();
  // Preserve any stored value not in our canonical list (e.g. legacy free text).
  if (current && list.indexOf(current) === -1) list.unshift(current);
  let html = '<option value=""' + (!current ? ' selected' : '') + '>Select a provider...</option>';
  for (const name of list) {
    html += '<option value="' + name + '"' + (current === name ? ' selected' : '') + '>' + name + '</option>';
  }
  return html;
}

// ── Edit pet bottom sheet ─────────────────────────────────────────────────────
export function openEditPetForm(pet, clientData, WORKER_URL, clientToken) {
  const existing = document.getElementById('edit-pet-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'edit-pet-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(44,31,20,0.5);z-index:1000;display:flex;align-items:flex-end;justify-content:center;padding:0;backdrop-filter:blur(2px);';

  modal.innerHTML = `
    <div style="background:#fff;border-radius:20px 20px 0 0;width:100%;max-width:560px;max-height:85vh;overflow:hidden;box-shadow:0 -4px 24px rgba(44,31,20,0.15);display:flex;flex-direction:column;">
      <div class="modal-scroll" style="overflow-y:auto;flex:1;min-height:0;">
      <div style="position:sticky;top:0;background:#fff;padding:1.25rem 1.5rem 0.75rem;border-bottom:1px solid var(--brand-stone-light);z-index:1;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
          <div style="font-family:var(--font-display);font-size:1.3rem;font-weight:600;">Update ${pet.name}</div>
          <button onclick="document.getElementById('edit-pet-modal').remove()" style="background:none;border:none;font-size:1.25rem;cursor:pointer;color:var(--brand-stone);">✕</button>
        </div>
        <div style="display:flex;gap:0;">
          <button class="edit-pet-tab active" data-tab="basic" onclick="switchEditPetTab('basic')" style="flex:1;padding:0.6rem 0.35rem;background:none;border:none;border-bottom:2px solid var(--brand-primary);font-family:var(--font-body);font-size:0.78rem;font-weight:500;color:var(--brand-primary);cursor:pointer;">Basic</button>
          <button class="edit-pet-tab" data-tab="health" onclick="switchEditPetTab('health')" style="flex:1;padding:0.6rem 0.35rem;background:none;border:none;border-bottom:2px solid transparent;font-family:var(--font-body);font-size:0.78rem;font-weight:400;color:var(--brand-stone);cursor:pointer;">Health</button>
          <button class="edit-pet-tab" data-tab="vet" onclick="switchEditPetTab('vet')" style="flex:1;padding:0.6rem 0.35rem;background:none;border:none;border-bottom:2px solid transparent;font-family:var(--font-body);font-size:0.78rem;font-weight:400;color:var(--brand-stone);cursor:pointer;">Vet</button>
          <button class="edit-pet-tab" data-tab="insurance" onclick="switchEditPetTab('insurance')" style="flex:1;padding:0.6rem 0.35rem;background:none;border:none;border-bottom:2px solid transparent;font-family:var(--font-body);font-size:0.78rem;font-weight:400;color:var(--brand-stone);cursor:pointer;">Insurance</button>
        </div>
      </div>

      <div style="padding:1.25rem 1.5rem 2rem;">

        <!-- Tab: Basic Info -->
        <div id="edit-tab-basic">
          <p style="font-size:0.8rem;color:var(--brand-stone);font-weight:300;margin-bottom:1rem;">Updates go to review before being applied.</p>

          <div style="margin-bottom:1rem;">
            <label style="display:block;font-size:0.72rem;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:var(--brand-stone);margin-bottom:0.4rem;">Breed <span style="font-weight:300;text-transform:none;letter-spacing:0;">(up to 3)</span></label>
            <div id="ep-breed-pills" style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:0.5rem;min-height:1rem;"></div>
            <input id="ep-breed-search" type="text" placeholder="Search breeds…" style="width:100%;padding:0.65rem 0.85rem;border:1.5px solid var(--brand-stone-light);border-radius:10px;font-family:var(--font-body);font-size:0.9rem;outline:none;box-sizing:border-box;margin-bottom:0.4rem;" autocomplete="off"/>
            <div id="ep-breed-list" style="max-height:180px;overflow-y:auto;border:1.5px solid var(--brand-stone-light);border-radius:10px;background:#fff;"></div>
            <div style="font-size:0.72rem;color:var(--brand-stone);margin-top:0.35rem;font-weight:300;">Can't find the breed? <a href="#" id="ep-breed-unknown" style="color:var(--brand-primary);">Select Mixed / Unknown</a></div>
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

        <!-- Tab: Insurance -->
        <div id="edit-tab-insurance" style="display:none;">
          <p style="font-size:0.8rem;color:var(--brand-stone);font-weight:300;margin-bottom:1rem;">Pet insurance is optional but strongly recommended. Changes go to review before being applied.</p>

          <div style="margin-bottom:1rem;">
            <label style="display:block;font-size:0.72rem;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:var(--brand-stone);margin-bottom:0.4rem;">Insurance Provider</label>
            <select id="ep-insurance" style="width:100%;padding:0.65rem 0.85rem;border:1.5px solid var(--brand-stone-light);border-radius:10px;font-family:var(--font-body);font-size:0.9rem;outline:none;box-sizing:border-box;background:#fff;">
              ${buildProviderOptions(pet.insurance)}
            </select>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1rem;">
            <div>
              <label style="display:block;font-size:0.72rem;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:var(--brand-stone);margin-bottom:0.4rem;">Policy Number</label>
              <input id="ep-insurance-policy" type="text" value="${pet.insurancePolicy || ''}" placeholder="Policy / member ID" style="width:100%;padding:0.65rem 0.85rem;border:1.5px solid var(--brand-stone-light);border-radius:10px;font-family:var(--font-body);font-size:0.9rem;outline:none;box-sizing:border-box;">
            </div>
            <div>
              <label style="display:block;font-size:0.72rem;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:var(--brand-stone);margin-bottom:0.4rem;">Renewal Date</label>
              <input id="ep-insurance-renewal" type="date" value="${pet.insuranceRenewal || ''}" style="width:100%;padding:0.65rem 0.85rem;border:1.5px solid var(--brand-stone-light);border-radius:10px;font-family:var(--font-body);font-size:0.9rem;outline:none;box-sizing:border-box;">
            </div>
          </div>

          <div style="margin-bottom:1.25rem;">
            <label style="display:block;font-size:0.72rem;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:var(--brand-stone);margin-bottom:0.4rem;">Coverage <span style="font-weight:300;text-transform:none;letter-spacing:0;">(plan, reimbursement, deductible)</span></label>
            <textarea id="ep-insurance-coverage" placeholder="e.g. 90% reimbursement, $250 annual deductible, unlimited annual max" style="width:100%;padding:0.65rem 0.85rem;border:1.5px solid var(--brand-stone-light);border-radius:10px;font-family:var(--font-body);font-size:0.9rem;outline:none;box-sizing:border-box;min-height:60px;resize:vertical;">${pet.insuranceCoverage || ''}</textarea>
          </div>

          <div style="background:var(--surface,#FBF9F5);border:1px solid var(--line-soft,#EFEAE0);border-left:3px solid var(--green,#2F7D52);border-radius:10px;padding:0.85rem 1rem;margin-bottom:0.5rem;">
            <div style="font-family:var(--font-body);font-size:0.82rem;font-weight:600;color:var(--ink,#23201B);margin-bottom:0.3rem;">No insurance yet? We strongly recommend it.</div>
            <p style="font-size:0.8rem;line-height:1.5;color:var(--muted,#857C6E);margin:0 0 0.6rem;">Gus has used Healthy Paws since 2018. When his own dog Ollie needed IVDD spinal surgery, an eye ulcer treated, and bladder stones removed, insurance covered the bulk of the cost. A single emergency can run into the thousands; coverage turns that into a manageable monthly premium. We recommend it whether or not you use our link below.</p>
            <div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.6rem;">
              <a href="https://healthypaws.live/4erx4ssr" target="_blank" rel="noopener noreferrer sponsored" style="display:inline-flex;align-items:center;gap:0.3rem;font-size:0.78rem;font-weight:600;color:var(--green,#2F7D52);text-decoration:none;border:1.5px solid var(--green,#2F7D52);border-radius:999px;padding:0.4rem 0.85rem;">Get a Healthy Paws quote</a>
            </div>
            <p style="font-size:0.68rem;line-height:1.4;color:var(--muted,#857C6E);margin:0;font-style:italic;">We may earn a referral fee if you sign up through this link, at no extra cost to you. We'd recommend pet insurance regardless.</p>
          </div>
        </div>

        <div id="ep-error" style="color:var(--brand-error);font-size:0.8rem;margin-bottom:0.75rem;display:none;"></div>
        <button id="ep-submit-btn" style="width:100%;padding:0.85rem;background:var(--brand-primary);color:#fff;border:none;border-radius:12px;font-family:var(--font-body);font-size:0.95rem;font-weight:500;cursor:pointer;">
          Submit Updates
        </button>
      </div>
      </div>
    </div>`;

  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

  setTimeout(() => {
    const submitBtn = document.getElementById('ep-submit-btn');
    if (submitBtn) {
      submitBtn.onclick = () => submitEditPetClosure(pet.id, pet.name, clientData.clientId, clientToken, WORKER_URL);
    }
    initBreedPicker(pet, WORKER_URL);
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
    'Date of Birth':       document.getElementById('ep-dob')?.value || '',
    'Gender':              document.getElementById('ep-gender')?.value || '',
    'Spayed/Neutered':     document.getElementById('ep-spayed')?.checked ? 'Yes' : 'No',
    'Microchip Number':    document.getElementById('ep-microchip')?.value.trim() || '',
    'Allergies':           document.getElementById('ep-allergies')?.value.trim() || '',
    'Current Medications': document.getElementById('ep-medications')?.value.trim() || '',
    'Feeding Schedule':    document.getElementById('ep-feeding')?.value.trim() || '',
    'Fears & Triggers':    document.getElementById('ep-fears')?.value.trim() || '',
    'Temperament':         document.getElementById('ep-temperament')?.value.trim() || '',
    'Insurance Provider':       document.getElementById('ep-insurance')?.value.trim() || '',
    'Insurance Policy Number':  document.getElementById('ep-insurance-policy')?.value.trim() || '',
    'Insurance Coverage':       document.getElementById('ep-insurance-coverage')?.value.trim() || '',
    'Insurance Renewal Date':   document.getElementById('ep-insurance-renewal')?.value || '',
    'Vet Clinic':          document.getElementById('ep-vet-clinic')?.value.trim() || '',
    'Vet Phone':           document.getElementById('ep-vet-phone')?.value.trim() || '',
    'Vet Email':           document.getElementById('ep-vet-email')?.value.trim() || '',
    'Vet Address':         document.getElementById('ep-vet-address')?.value.trim() || '',
  };

  try {
    const res = await fetch(WORKER_URL + '/pet-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: clientToken, clientId, petId, petName, fields }),
    });
    const text = await res.text();
    const data = JSON.parse(text || '{}');
    if (!res.ok || data.error) throw new Error(data.error || 'Server error ' + res.status);

    // Update breeds directly via /pet-breed — only if the picker actually loaded
    // and produced a selection. Guard against wiping breeds when the picker never
    // initialized (empty array would otherwise clear all breeds).
    const breedIds = window._getSelectedBreedIds ? window._getSelectedBreedIds() : null;
    if (Array.isArray(breedIds) && (breedIds.length > 0 || window._breedPickerReady)) {
      await fetch(WORKER_URL + '/pet-breed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: clientToken, clientId, petId, breedIds }),
      });
    }

    const modal = document.getElementById('edit-pet-modal');
    if (modal) modal.remove();
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:var(--brand-success);color:#fff;padding:0.75rem 1.5rem;border-radius:999px;font-size:0.875rem;font-weight:500;z-index:200;';
    toast.textContent = 'Updates submitted ✓';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  } catch (err) {
    errEl.textContent = 'Error: ' + (err.message || 'Something went wrong.');
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Submit Updates';
  }
}

window.switchEditPetTab = function (tab) {
  ['basic', 'health', 'vet', 'insurance'].forEach(t => {
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
        <div style="font-size:0.72rem;color:var(--muted);margin-top:0.35rem;">Can't find the breed? <a href="#" id="np-breed-unknown" style="color:var(--green);font-weight:500;">Select Mixed / Unknown</a></div>
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
      <div class="success-circle"><svg class="ic"><use href="#i-paw"/></svg></div>
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

  const breedUnknown = document.getElementById('np-breed-unknown');
  if (breedUnknown) breedUnknown.onclick = (e) => {
    e.preventDefault();
    const breedInput = document.getElementById('np-breed');
    if (breedInput) { breedInput.value = 'Mixed / Unknown'; breedInput.focus(); }
  };

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