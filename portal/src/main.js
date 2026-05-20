import { buildPetCards, buildNewPetView, wireNewPetForm, openEditPetForm } from './views/pets.js';

// ── CONFIG ──────────────────────────────────────────────────────────────────
const WORKER_URL = "";

// ── STATE ────────────────────────────────────────────────────────────────────
let clientToken = null;
let clientData  = null;
let selectedDocPetId   = null;
let selectedDocPetName = null;
let selectedDocFile    = null;

// ── HELPERS ──────────────────────────────────────────────────────────────────
function showView(id) {
  // Hide/show booking cards vs main card
  const mainCard = document.querySelector('.card');
  const bookingCard = document.getElementById('booking-card');
  const bookingSuccessCard = document.getElementById('booking-success-card');

  if (id === 'view-booking') {
    mainCard.style.display = 'none';
    bookingCard.style.display = 'block';
    bookingSuccessCard.style.display = 'none';
  } else if (id === 'view-booking-success') {
    mainCard.style.display = 'none';
    bookingCard.style.display = 'none';
    bookingSuccessCard.style.display = 'block';
  } else {
    mainCard.style.display = '';
    bookingCard.style.display = 'none';
    bookingSuccessCard.style.display = 'none';
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function getToken() {
  return new URLSearchParams(window.location.search).get('client');
}

// ── ONBOARDING STATUS ────────────────────────────────────────────────────────
function calcOnboardingSteps(data) {
  return {
    contact:   !!(data.emailConfirmed),
    emergency: !!(data.emergencyName && data.emergencyPhone),
    docs:      !!(data.docsComplete),
    agreement: !!(data.agreementSigned),
  };
}

function updateProgressUI(steps) {
  const keys = ['contact','emergency','docs','agreement'];
  const done  = keys.filter(k => steps[k]).length;
  const pct   = Math.round((done / keys.length) * 100);

  document.getElementById('ob-progress-fill').style.width = pct + '%';
  document.getElementById('ob-progress-text').textContent = done + ' of ' + keys.length + ' complete';

  keys.forEach((k, i) => {
    const item = document.getElementById('step-' + k + '-item');
    const icon = document.getElementById('step-' + k + '-icon');
    if (steps[k]) {
      item.classList.add('done');
      item.onclick = null;
      icon.textContent = '✓';
    } else {
      item.classList.remove('done');
      item.onclick = () => goToStep(k);
      icon.textContent = i + 1;
    }
  });

  // Update docs description to show what's missing per pet
  const docsDesc = document.getElementById('step-docs-desc');
  if (docsDesc && clientData?.pets?.length > 0) {
    if (steps.docs) {
      docsDesc.textContent = 'All documents on file ✓';
    } else {
      const missing = [];
      (clientData.pets || []).forEach(pet => {
        const docs = pet.docs || [];
        const hasRabies = docs.some(d => d.type === 'Rabies Certificate' && !d.expired);
        const hasTown   = docs.some(d => d.type === 'Town License'       && !d.expired);
        const hasVax    = docs.some(d => d.type === 'Vaccination Record' && !d.expired);
        const petMissing = [];
        if (!hasRabies) petMissing.push('rabies certificate');
        if (!hasTown)   petMissing.push('town license');
        if (!hasVax)    petMissing.push('vaccination record');
        if (petMissing.length > 0) {
          missing.push(pet.name + ': ' + petMissing.join(', '));
        }
      });
      docsDesc.textContent = missing.length > 0
        ? 'Missing — ' + missing.join(' · ')
        : 'Upload required documents for each pet';
    }
  }

  return done === keys.length;
}

// ── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  clientToken = getToken();
  if (!clientToken) { showView('view-invalid'); return; }

  try {
    const res = await fetch(WORKER_URL + '/client?token=' + encodeURIComponent(clientToken));
    if (!res.ok) throw new Error('not found');
    clientData = await res.json();
  } catch {
    showView('view-invalid');
    return;
  }

  const firstName = clientData.firstName || 'there';
  document.getElementById('ob-first-name').textContent = firstName;

  // Inject new pet form HTML
  const newPetCard = document.getElementById('new-pet-card');
  if (newPetCard) newPetCard.innerHTML = buildNewPetView();

  // Calc step completion
  const steps    = calcOnboardingSteps(clientData);
  const complete = updateProgressUI(steps);

  if (complete) {
    buildDashboard();
    showView('view-dashboard');
  } else {
    showView('view-onboarding');
  }

  // Pre-fill contact fields
  if (clientData.name)        document.getElementById('c-name').value    = clientData.name;
  if (clientData.phone)       document.getElementById('c-phone').value   = clientData.phone;
  if (clientData.email)       document.getElementById('c-email').value   = clientData.email;
  if (clientData.address)     document.getElementById('c-address').value = clientData.address;
  if (clientData.addName)     document.getElementById('c-add-name').value  = clientData.addName;
  if (clientData.addPhone)    document.getElementById('c-add-phone').value = clientData.addPhone;
  if (clientData.addEmail)    document.getElementById('c-add-email').value = clientData.addEmail;
  if (clientData.emergencyName)         document.getElementById('e-name').value         = clientData.emergencyName;
  if (clientData.emergencyPhone)        document.getElementById('e-phone').value        = clientData.emergencyPhone;
  if (clientData.emergencyRelationship) document.getElementById('e-relationship').value = clientData.emergencyRelationship;
}

// ── NAVIGATION ───────────────────────────────────────────────────────────────
async function goHome() {
  // Hide all secondary cards
  const newPetCard = document.getElementById('new-pet-card');
  if (newPetCard) newPetCard.style.display = 'none';

  // Always re-fetch client data so compliance status is fresh
  try {
    const res = await fetch(WORKER_URL + '/client?token=' + encodeURIComponent(clientToken));
    if (res.ok) clientData = await res.json();
  } catch {}

  const steps    = calcOnboardingSteps(clientData);
  const complete = updateProgressUI(steps);
  if (complete) {
    buildDashboard();
    showView('view-dashboard');
  } else {
    showView('view-onboarding');
  }
}

// Current upload context
let uploadContext = { petId: null, petName: null, docType: null };
// Last booking for success summary
let lastBooking = {};

function goToStep(step) {
  if (step === 'new-pet') {
    // New pet is in its own card
    const mainCard    = document.querySelector('.card');
    const bookingCard = document.getElementById('booking-card');
    const newPetCard  = document.getElementById('new-pet-card');
    const bsCard      = document.getElementById('booking-success-card');
    if (mainCard)    mainCard.style.display    = 'none';
    if (bookingCard) bookingCard.style.display = 'none';
    if (bsCard)      bsCard.style.display      = 'none';
    if (newPetCard) {
      newPetCard.style.display = 'block';
      document.getElementById('view-new-pet').style.display        = 'block';
      document.getElementById('view-new-pet-success').style.display = 'none';
      wireNewPetForm(clientData, goHome, WORKER_URL, clientToken);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  showView('view-' + step);
  if (step === 'docs')    buildDocCards();
  if (step === 'booking') buildBookingPetPills();
  if (step === 'contact') buildContactCurrentInfo();
}

function buildContactCurrentInfo() {
  const el = document.getElementById('contact-current-info');
  if (!el || !clientData) return;
  const d = clientData;
  const lines = [
    d.name  ? '<strong>' + d.name + '</strong>' : '',
    d.phone ? '📞 ' + d.phone : '',
    d.email ? '✉️ ' + d.email : '',
    d.address ? '📍 ' + d.address : '',
    (d.addName || d.addPhone) ? '<span style="color:var(--brand-stone);">Additional: ' + [d.addName, d.addPhone].filter(Boolean).join(' · ') + '</span>' : '',
  ].filter(Boolean).join('<br>');
  el.innerHTML = lines || '<span style="color:var(--brand-stone);">No information on file yet.</span>';
}

function buildDocCards() {
  const container = document.getElementById('docs-cards-container');
  if (!container || !clientData?.pets?.length) return;
  container.innerHTML = '';

  const DOC_TYPES = [
    { type: 'Rabies Certificate', icon: '💉', desc: 'Required by MA law' },
    { type: 'Town License',       icon: '🏛', desc: 'Current year registration' },
    { type: 'Vaccination Record', icon: '📋', desc: 'Up-to-date vaccine history' },
  ];

  const wrap = document.createElement('div');
  wrap.className = 'doc-cards';

  DOC_TYPES.forEach(({ type, icon, desc }) => {
    // Check status across all pets
    const allPetsOk = clientData.pets.every(pet => {
      const docs = pet.docs || [];
      return docs.some(d => d.type === type && !d.expired);
    });

    const card = document.createElement('div');
    card.className = 'doc-card';

    // Header
    const header = document.createElement('div');
    header.className = 'doc-card-header ' + (allPetsOk ? 'ok' : 'missing');
    header.innerHTML =
      '<div class="doc-card-title">' + icon + ' ' + type + '</div>' +
      '<span class="doc-card-status ' + (allPetsOk ? 'ok' : 'missing') + '">' +
      (allPetsOk ? '✓ Complete' : 'Needed') + '</span>';

    // Body — one row per pet
    const body = document.createElement('div');
    body.className = 'doc-card-body';
    const petRows = document.createElement('div');
    petRows.className = 'doc-card-pet-row';

    clientData.pets.forEach(pet => {
      const docs = pet.docs || [];
      const hasDoc = docs.some(d => d.type === type && !d.expired);

      const row = document.createElement('div');
      row.className = 'doc-card-pet';
      row.innerHTML =
        '<div class="doc-card-pet-name">🐾 ' + pet.name + '</div>';

      const btn = document.createElement('button');
      btn.className = 'btn-upload-small' + (hasDoc ? ' ok' : '');
      btn.textContent = hasDoc ? '✓ On file' : 'Upload';

      if (!hasDoc) {
        btn.onclick = () => openUploadModal(pet.id, pet.name, type);
      }

      row.appendChild(btn);
      petRows.appendChild(row);
    });

    body.appendChild(petRows);
    card.appendChild(header);
    card.appendChild(body);
    wrap.appendChild(card);
  });

  container.appendChild(wrap);

  // Show completion banner if all docs are on file
  const allComplete = (clientData.pets || []).every(pet => {
    const docs = pet.docs || [];
    return ['Rabies Certificate','Town License','Vaccination Record'].every(type =>
      docs.some(d => d.type === type && !d.expired)
    );
  });

  const existing = document.getElementById('docs-complete-banner');
  if (existing) existing.remove();

  if (allComplete) {
    const banner = document.createElement('div');
    banner.id = 'docs-complete-banner';
    banner.style.cssText = 'margin-top:1.25rem;background:var(--brand-success-light);border:1.5px solid rgba(46,125,50,0.25);border-radius:14px;padding:1.25rem;text-align:center;';
    banner.innerHTML =
      '<div style="font-size:1.75rem;margin-bottom:0.5rem;">🎉</div>' +
      '<div style="font-family:var(--font-display);font-size:1.2rem;font-weight:600;color:var(--brand-success);margin-bottom:0.35rem;">All documents on file!</div>' +
      '<p style="font-size:0.82rem;color:var(--brand-bark);margin-bottom:1rem;">You&#39;re all set on compliance. Head back to finish your account setup.</p>' +
      '<button class="btn-primary" style="margin-top:0;max-width:260px;margin:0 auto;display:block;" onclick="goHome()">Back to Portal</button>';
    container.appendChild(banner);
  }
}

function openUploadModal(petId, petName, docType) {
  uploadContext = { petId, petName, docType };

  // Reset upload form
  selectedDocFile = null;
  document.getElementById('docs-file-input').value = '';
  document.getElementById('docs-file-name').textContent = '';
  document.getElementById('docs-file-drop').classList.remove('has-file');
  document.getElementById('docs-expiry').value = '';
  document.getElementById('docs-file-error').classList.remove('visible');
  document.getElementById('docs-upload-form-error').classList.remove('visible');

  const btn = document.getElementById('docs-submit');
  btn.disabled = false;
  btn.classList.remove('loading');

  document.getElementById('upload-title').innerHTML = 'Upload <em>' + docType + '</em>';
  document.getElementById('upload-desc').textContent = 'For ' + petName + ' — attach the file below.';

  showView('view-doc-upload');
}

// ── DASHBOARD ────────────────────────────────────────────────────────────────
function getComplianceState() {
  const pets = clientData.pets || [];
  const REQUIRED = ['Rabies Certificate', 'Town License', 'Vaccination Record'];
  const missing = [];
  const expiring = [];

  pets.forEach(pet => {
    const docs = pet.docs || [];
    REQUIRED.forEach(type => {
      // Only count valid (non-expired) docs
      const validDoc = docs.find(d => d.type === type && !d.expired);
      if (!validDoc) {
        // Only flag as missing if the Worker also says docs are incomplete
        if (!clientData.docsComplete) {
          missing.push({ pet: pet.name, type });
        }
      } else if (validDoc.daysUntilExpiry !== undefined && validDoc.daysUntilExpiry <= 30) {
        expiring.push({ pet: pet.name, type, days: validDoc.daysUntilExpiry });
      }
    });
  });

  // Trust the Worker's docsComplete as the source of truth
  if (clientData.docsComplete) {
    if (expiring.length > 0) return { state: 'warning', missing: [], expiring };
    return { state: 'compliant', missing: [], expiring: [] };
  }

  return { state: 'blocked', missing, expiring };
}

function buildDashboard() {
  const { state, missing, expiring } = getComplianceState();
  const banner = document.getElementById('dash-status-banner');
  const firstName = clientData.firstName || 'there';

  // ── Status banner ──
  if (state === 'compliant') {
    banner.innerHTML =
      '<div class="compliance-banner compliant">' +
        '<div class="compliance-banner-icon">✅</div>' +
        '<div class="compliance-banner-body">' +
          '<div class="compliance-banner-title">All set, ' + firstName + '!</div>' +
          '<div class="compliance-banner-desc">Your account is fully up to date. Ready to book.</div>' +
        '</div>' +
      '</div>' +
      '<button class="btn-book" id="dash-book-btn">' +
        '🏡 Book a Boarding Stay' +
      '</button>';
  // Wire buttons after innerHTML is set
  setTimeout(() => {
    const bookBtn = document.getElementById('dash-book-btn');
    if (bookBtn && !bookBtn.disabled) bookBtn.onclick = () => goToStep('booking');
    const uploadBtn = document.getElementById('pet-docs-upload-btn');
    if (uploadBtn) uploadBtn.onclick = () => goToStep('docs');
  }, 0);

  } else if (state === 'warning') {
    const items = expiring.map(e => e.pet + "'s " + e.type + ' expires in ' + e.days + ' days').join(' · ');
    banner.innerHTML =
      '<div class="compliance-banner warning">' +
        '<div class="compliance-banner-icon">⚠️</div>' +
        '<div class="compliance-banner-body">' +
          '<div class="compliance-banner-title">Documents expiring soon</div>' +
          '<div class="compliance-banner-desc">' + items + '. Please renew before your next stay.</div>' +
        '</div>' +
      '</div>' +
      '<button class="btn-book" id="dash-book-btn">' +
        '🏡 Book a Boarding Stay' +
      '</button>';
  // Wire book button for warning state
  setTimeout(() => {
    const bookBtn2 = document.getElementById('dash-book-btn');
    if (bookBtn2 && !bookBtn2.disabled) bookBtn2.onclick = () => goToStep('booking');
  }, 0);

  } else {
    const items = missing.map(m => m.pet + ': ' + m.type).join(' · ');
    banner.innerHTML =
      '<div class="compliance-banner blocked">' +
        '<div class="compliance-banner-icon">🔒</div>' +
        '<div class="compliance-banner-body">' +
          '<div class="compliance-banner-title">Documents needed before booking</div>' +
          '<div class="compliance-banner-desc">' + items + '</div>' +
        '</div>' +
      '</div>' +
      '<button class="btn-book" disabled title="Please upload missing documents first">' +
        '🏡 Book a Boarding Stay' +
      '</button>';
  }

  // ── Upcoming appointments ──
  const appts = clientData.appointments || [];
  const apptSection = document.getElementById('dash-appointments');
  const apptCards   = document.getElementById('dash-appt-cards');
  if (appts.length > 0) {
    apptSection.style.display = 'block';
    apptCards.innerHTML = '';
    const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });

    appts.forEach(appt => {
      const isConfirmed = appt.status === 'Confirmed';
      const statusColor = isConfirmed ? 'var(--brand-success)' : 'var(--brand-warning)';
      const statusBg    = isConfirmed ? 'var(--brand-success-light)' : 'var(--brand-warning-light)';

      // Parse nights for estimate
      const nights = appt.startDate && appt.endDate
        ? Math.max(1, Math.round((new Date(appt.endDate) - new Date(appt.startDate)) / 86400000))
        : null;

      // Pricing line — show confirmed message or estimate
      let pricingLine = '';
      if (appt.clientMessage) {
        // Extract total from message e.g. "Total: $255.00"
        const totalMatch = appt.clientMessage.match(/Total:\s*(\$[\d,.]+)/);
        pricingLine = totalMatch
          ? '<div style="font-size:0.75rem;font-weight:500;color:var(--brand-success);margin-top:0.2rem;">' + totalMatch[1] + ' confirmed</div>'
          : '';
      } else if (nights) {
        pricingLine = '<div style="font-size:0.75rem;font-weight:300;color:var(--brand-stone);margin-top:0.2rem;">Pricing starts at $85/night — confirmation coming soon</div>';
      }

      apptCards.innerHTML +=
        '<div style="padding:0.85rem 1rem;border-radius:12px;border:1.5px solid var(--brand-stone-light);background:#fff;">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.3rem;">' +
            '<div style="font-size:0.7rem;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:var(--brand-stone);">🏡 Boarding</div>' +
            '<span style="font-size:0.72rem;font-weight:500;padding:0.2rem 0.6rem;border-radius:999px;background:' + statusBg + ';color:' + statusColor + ';">' + appt.status + '</span>' +
          '</div>' +
          '<div style="font-size:0.92rem;font-weight:500;color:var(--brand-bark);margin-bottom:0.2rem;">' + fmt(appt.startDate) + ' → ' + fmt(appt.endDate) + '</div>' +
          '<div style="font-size:0.78rem;font-weight:300;color:var(--brand-stone);">' +
            (appt.startTime ? appt.startTime + ' drop-off · ' : '') +
            (appt.endTime   ? appt.endTime   + ' pick-up'     : '') +
          '</div>' +
          pricingLine +
        '</div>';
    });
  } else {
    apptSection.style.display = 'none';
  }

  // ── Pet cards with doc detail ──
  buildPetCards(clientData, goToStep, WORKER_URL, clientToken);

  // Wire buttons after innerHTML is set
  setTimeout(() => {
    const bookBtn = document.getElementById('dash-book-btn');
    if (bookBtn && !bookBtn.disabled) bookBtn.onclick = () => goToStep('booking');
  }, 0);
}

// ── BOOKING ───────────────────────────────────────────────────────────────────
function buildBookingPetPills() {
  const container = document.getElementById('booking-pet-pills');
  if (!container) return;
  container.innerHTML = '';
  (clientData.pets || []).forEach((pet, i) => {
    const inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.name = 'booking-pet';
    inp.value = pet.id;
    inp.id = 'bp-' + i;
    inp.className = 'booking-pet-check';
    const lbl = document.createElement('label');
    lbl.htmlFor = 'bp-' + i;
    lbl.textContent = pet.name;
    container.appendChild(inp);
    container.appendChild(lbl);
    if (clientData.pets.length === 1) inp.checked = true;
  });
}

async function submitBooking() {
  let valid = true;
  const selectedPets = Array.from(document.querySelectorAll('input[name="booking-pet"]:checked')).map(el => el.value);
  const startDate  = document.getElementById('booking-start-date').value;
  const startTime  = document.getElementById('booking-start-time').value;
  const endDate    = document.getElementById('booking-end-date').value;
  const endTime    = document.getElementById('booking-end-time').value;
  const transport  = document.querySelector('input[name="booking-transport"]:checked')?.value;
  const notes      = document.getElementById('booking-notes').value.trim();

  const showErr = (id, msg) => { const el = document.getElementById(id); el.textContent = msg; el.classList.add('visible'); valid = false; };
  const hideErr = id => document.getElementById(id).classList.remove('visible');

  if (!selectedPets.length) showErr('booking-pet-error', 'Please select at least one pet.'); else hideErr('booking-pet-error');
  if (!startDate) showErr('booking-start-date-error', 'Please select a drop-off date.'); else hideErr('booking-start-date-error');
  if (!startTime) showErr('booking-start-time-error', 'Please select a drop-off time.'); else hideErr('booking-start-time-error');
  if (!endDate)   showErr('booking-end-date-error',   'Please select a pick-up date.');  else hideErr('booking-end-date-error');
  if (!endTime)   showErr('booking-end-time-error',   'Please select a pick-up time.');  else hideErr('booking-end-time-error');
  if (!transport) showErr('booking-transport-error',  'Please select a transport option.'); else hideErr('booking-transport-error');

  if (startDate && endDate && endDate < startDate) {
    showErr('booking-end-date-error', 'Pick-up date must be after drop-off date.');
  }
  if (!valid) return;

  const btn = document.getElementById('booking-submit');
  btn.disabled = true; btn.classList.add('loading');
  document.getElementById('booking-form-error').classList.remove('visible');

  try {
    const res = await fetch(WORKER_URL + '/booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: clientToken,
        clientId: clientData.clientId,
        petIds: selectedPets,
        startDate, startTime, endDate, endTime,
        transport, notes,
      }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || ('HTTP ' + res.status));
    }

    // Store booking details for summary
    const selectedPetNames = Array.from(document.querySelectorAll('input[name="booking-pet"]:checked'))
      .map(el => el.closest('.pet-pills')?.querySelector('label[for="' + el.id + '"]')?.textContent || el.value);
    lastBooking = { startDate, startTime, endDate, endTime, transport, pets: selectedPetNames };

    // Populate summary
    const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
    const summary = document.getElementById('booking-summary');
    if (summary) {
      summary.innerHTML =
        '<strong>🐾 ' + (lastBooking.pets.join(', ') || 'Your pet') + '</strong><br>' +
        '📅 Drop-off: ' + fmt(startDate) + ' · ' + startTime + '<br>' +
        '📅 Pick-up: '  + fmt(endDate)   + ' · ' + endTime   + '<br>' +
        '🚗 Transport: ' + transport + '<br>' +
        '💰 Pricing starts at $85/night — final total confirmed within 24 hrs';
    }

    // Refresh client data in background
    fetch(WORKER_URL + '/client?token=' + encodeURIComponent(clientToken))
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) clientData = d; })
      .catch(() => {});

    showView('view-booking-success');
  } catch (err) {
    document.getElementById('booking-form-error').textContent = 'Something went wrong: ' + err.message;
    document.getElementById('booking-form-error').classList.add('visible');
    btn.disabled = false; btn.classList.remove('loading');
  }
}

function bookAnother() {
  // Reset booking form
  document.querySelectorAll('input[name="booking-pet"]').forEach(el => {
    if (clientData.pets?.length === 1) el.checked = true;
    else el.checked = false;
  });
  document.getElementById('booking-start-date').value = '';
  document.getElementById('booking-start-time').value = '';
  document.getElementById('booking-end-date').value   = '';
  document.getElementById('booking-end-time').value   = '';
  document.querySelectorAll('input[name="booking-transport"]').forEach(el => el.checked = false);
  document.getElementById('booking-notes').value = '';
  document.getElementById('booking-form-error').classList.remove('visible');
  const btn = document.getElementById('booking-submit');
  btn.disabled = false; btn.classList.remove('loading');
  showView('view-booking');
}

init();