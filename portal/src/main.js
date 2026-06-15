import { buildPetCards, buildNewPetView, wireNewPetForm, openEditPetForm } from './views/pets.js';

// ── CONFIG ───────────────────────────────────────────────────────────────────
const WORKER_URL = "";

// ── STATE ────────────────────────────────────────────────────────────────────
let clientToken    = null;
let clientData     = null;
let selectedDocFile = null;
let uploadContext  = { petId: null, petName: null, docType: null };
let lastBooking    = {};

// ── HELPERS ──────────────────────────────────────────────────────────────────
function showView(id) {
  const mainCard           = document.querySelector('.card');
  const bookingCard        = document.getElementById('booking-card');
  const bookingSuccessCard = document.getElementById('booking-success-card');
  const newPetCard         = document.getElementById('new-pet-card');

  // Hide all secondary cards first
  if (bookingCard)        bookingCard.style.display        = 'none';
  if (bookingSuccessCard) bookingSuccessCard.style.display = 'none';
  if (newPetCard)         newPetCard.style.display         = 'none';

  if (id === 'view-booking') {
    if (mainCard) mainCard.style.display = 'none';
    if (bookingCard) bookingCard.style.display = 'block';
  } else if (id === 'view-booking-success') {
    if (mainCard) mainCard.style.display = 'none';
    if (bookingSuccessCard) bookingSuccessCard.style.display = 'block';
  } else {
    if (mainCard) mainCard.style.display = '';
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function getToken() {
  return new URLSearchParams(window.location.search).get('client');
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── ONBOARDING STATUS ─────────────────────────────────────────────────────────
function calcOnboardingSteps(data) {
  return {
    contact:   !!(data.emailConfirmed),
    emergency: !!(data.emergencyName && data.emergencyPhone),
    docs:      !!(data.docsComplete),
    agreement: !!(data.agreementSigned),
  };
}

function updateProgressUI(steps) {
  const keys = ['contact', 'emergency', 'docs', 'agreement'];
  const done = keys.filter(k => steps[k]).length;
  const pct  = Math.round((done / keys.length) * 100);

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

  const docsDesc = document.getElementById('step-docs-desc');
  if (docsDesc && clientData?.pets?.length > 0) {
    if (steps.docs) {
      docsDesc.textContent = 'All documents on file ✓';
    } else {
      const missing = [];
      (clientData.pets || []).forEach(pet => {
        const docs = pet.docs || [];
        const petMissing = [];
        if (!docs.some(d => d.type === 'Rabies Certificate' && !d.expired)) petMissing.push('rabies certificate');
        if (!docs.some(d => d.type === 'Town License'       && !d.expired)) petMissing.push('town license');
        if (!docs.some(d => d.type === 'Vaccination Record' && !d.expired)) petMissing.push('vaccination record');
        if (petMissing.length > 0) missing.push(pet.name + ': ' + petMissing.join(', '));
      });
      docsDesc.textContent = missing.length > 0
        ? 'Missing — ' + missing.join(' · ')
        : 'Upload required documents for each pet';
    }
  }

  return done === keys.length;
}

// ── INIT ──────────────────────────────────────────────────────────────────────
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

  document.getElementById('ob-first-name').textContent = clientData.firstName || 'there';

  // Inject new pet form
  const newPetCard = document.getElementById('new-pet-card');
  if (newPetCard) newPetCard.innerHTML = buildNewPetView();

  // Wire booking service toggle
  document.querySelectorAll('input[name="booking-service"]').forEach(radio => {
    radio.addEventListener('change', function () {
      const isDaycare = this.value === 'daycare';
      document.getElementById('booking-pickup-row').style.display         = isDaycare ? 'none' : '';
      document.getElementById('booking-title').innerHTML                  = isDaycare ? 'Request <em>Daycare</em>' : 'Book a <em>Boarding Stay</em>';
      document.getElementById('booking-btn-text').textContent             = isDaycare ? 'Request Daycare' : 'Request Boarding Stay';
      document.getElementById('booking-start-date-label').innerHTML       = isDaycare ? 'Date <span class="req">*</span>' : 'Drop-off Date <span class="req">*</span>';
      document.getElementById('booking-start-time-label').innerHTML       = isDaycare ? 'Arrival Time <span class="req">*</span>' : 'Drop-off Time <span class="req">*</span>';
      document.getElementById('booking-daycare-hint').style.display       = isDaycare ? 'block' : 'none';
      document.getElementById('booking-price-info').textContent           = isDaycare
        ? `Daycare is $${clientData.daycarePrice || 65}/session. Pricing is confirmed when we review your request.`
        : `Boarding is $${clientData.boardingPrice || 85}/night. Pricing is confirmed when we review your request.`;
    });
  });

  // Pre-fill contact fields
  const fill = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
  fill('c-name',          clientData.name);
  fill('c-phone',         clientData.phone);
  fill('c-email',         clientData.email);
  fill('c-address',       clientData.address);
  fill('c-add-name',      clientData.addName);
  fill('c-add-phone',     clientData.addPhone);
  fill('c-add-email',     clientData.addEmail);
  fill('e-name',          clientData.emergencyName);
  fill('e-phone',         clientData.emergencyPhone);
  fill('e-relationship',  clientData.emergencyRelationship);

  // Wire agreement name input
  const agreeName = document.getElementById('agree-name');
  if (agreeName) agreeName.addEventListener('input', toggleAgreeBtn);

  // Wire file handling
  document.getElementById('docs-file-input')?.addEventListener('change', function () { handleFile(this.files[0]); });
  document.getElementById('docs-file-drop')?.addEventListener('dragover',  e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); });
  document.getElementById('docs-file-drop')?.addEventListener('dragleave', e => e.currentTarget.classList.remove('drag-over'));
  document.getElementById('docs-file-drop')?.addEventListener('drop', e => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    handleFile(e.dataTransfer.files[0]);
  });

  const steps    = calcOnboardingSteps(clientData);
  const complete = updateProgressUI(steps);

  if (complete) {
    buildDashboard();
    showView('view-dashboard');
  } else {
    showView('view-onboarding');
  }
}

// ── NAVIGATION ────────────────────────────────────────────────────────────────
async function goHome() {
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

function goToStep(step) {
  if (step === 'new-pet') {
    const mainCard    = document.querySelector('.card');
    const bookingCard = document.getElementById('booking-card');
    const bsCard      = document.getElementById('booking-success-card');
    const newPetCard  = document.getElementById('new-pet-card');
    if (mainCard)    mainCard.style.display    = 'none';
    if (bookingCard) bookingCard.style.display = 'none';
    if (bsCard)      bsCard.style.display      = 'none';
    if (newPetCard) {
      newPetCard.style.display = 'block';
      document.getElementById('view-new-pet').style.display         = 'block';
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

// Expose globally for inline onclick attributes
window.goHome   = goHome;
window.goToStep = goToStep;
window.showView = showView;

// ── CONTACT INFO ──────────────────────────────────────────────────────────────
function buildContactCurrentInfo() {
  const el = document.getElementById('contact-current-info');
  if (!el || !clientData) return;
  const d = clientData;
  const lines = [
    d.name    ? '<strong>' + d.name + '</strong>'                                                                           : '',
    d.phone   ? '📞 ' + d.phone                                                                                             : '',
    d.email   ? '✉️ '  + d.email                                                                                            : '',
    d.address ? '📍 '  + d.address                                                                                          : '',
    (d.addName || d.addPhone) ? '<span style="color:var(--brand-stone);">Additional: ' + [d.addName, d.addPhone].filter(Boolean).join(' · ') + '</span>' : '',
  ].filter(Boolean).join('<br>');
  el.innerHTML = lines || '<span style="color:var(--brand-stone);">No information on file yet.</span>';
}

// ── COMPLIANCE DOCS ───────────────────────────────────────────────────────────
function buildDocCards() {
  const container = document.getElementById('docs-cards-container');
  if (!container || !clientData?.pets?.length) return;
  container.innerHTML = '';

  const DOC_TYPES = [
    { type: 'Rabies Certificate', icon: '💉' },
    { type: 'Town License',       icon: '🏛' },
    { type: 'Vaccination Record', icon: '📋' },
  ];

  const wrap = document.createElement('div');
  wrap.className = 'doc-cards';

  DOC_TYPES.forEach(({ type, icon }) => {
    const allPetsOk = clientData.pets.every(pet =>
      (pet.docs || []).some(d => d.type === type && !d.expired)
    );

    const card   = document.createElement('div');
    card.className = 'doc-card';

    const header = document.createElement('div');
    header.className = 'doc-card-header ' + (allPetsOk ? 'ok' : 'missing');
    header.innerHTML =
      '<div class="doc-card-title">' + icon + ' ' + type + '</div>' +
      '<span class="doc-card-status ' + (allPetsOk ? 'ok' : 'missing') + '">' + (allPetsOk ? '✓ Complete' : 'Needed') + '</span>';

    const body    = document.createElement('div');
    body.className = 'doc-card-body';
    const petRows = document.createElement('div');
    petRows.className = 'doc-card-pet-row';

    clientData.pets.forEach(pet => {
      const docs       = pet.docs || [];
      const hasValid   = docs.some(d => d.type === type && !d.expired);
      const expiredDoc = docs.find(d => d.type === type && d.expired);
      const fmtD       = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      const row = document.createElement('div');
      row.className = 'doc-card-pet';
      row.innerHTML = '<div class="doc-card-pet-name">🐾 ' + pet.name + '</div>';

      const btn = document.createElement('button');
      if (hasValid) {
        btn.className   = 'btn-upload-small ok';
        btn.textContent = '✓ On file';
      } else if (expiredDoc) {
        btn.style.cssText = 'color:var(--brand-warning);border:1.5px solid var(--brand-warning);border-radius:999px;padding:0.35rem 0.75rem;background:transparent;font-family:var(--font-body);font-size:0.75rem;font-weight:500;cursor:pointer;';
        btn.textContent   = '⚠️ Expired' + (expiredDoc.expiryDate ? ' · ' + fmtD(expiredDoc.expiryDate) : '');
        btn.onclick       = () => openUploadModal(pet.id, pet.name, type);
      } else {
        btn.className   = 'btn-upload-small';
        btn.textContent = 'Upload';
        btn.onclick     = () => openUploadModal(pet.id, pet.name, type);
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

  const allComplete = (clientData.pets || []).every(pet =>
    ['Rabies Certificate', 'Town License', 'Vaccination Record'].every(type =>
      (pet.docs || []).some(d => d.type === type && !d.expired)
    )
  );

  const existing = document.getElementById('docs-complete-banner');
  if (existing) existing.remove();

  if (allComplete) {
    const banner = document.createElement('div');
    banner.id = 'docs-complete-banner';
    banner.style.cssText = 'margin-top:1.25rem;background:var(--brand-success-light);border:1.5px solid rgba(46,125,50,0.25);border-radius:14px;padding:1.25rem;text-align:center;';
    banner.innerHTML =
      '<div style="font-size:1.75rem;margin-bottom:0.5rem;">🎉</div>' +
      '<div style="font-family:var(--font-display);font-size:1.2rem;font-weight:600;color:var(--brand-success);margin-bottom:0.35rem;">All documents on file!</div>' +
      '<p style="font-size:0.82rem;color:var(--brand-bark);margin-bottom:1rem;">You\'re all set on compliance. Head back to finish your account setup.</p>' +
      '<button class="btn-primary" style="margin-top:0;max-width:260px;margin:0 auto;display:block;" onclick="goHome()">Back to Portal</button>';
    container.appendChild(banner);
  }
}

function openUploadModal(petId, petName, docType) {
  uploadContext = { petId, petName, docType };
  selectedDocFile = null;
  document.getElementById('docs-file-input').value         = '';
  document.getElementById('docs-file-name').textContent    = '';
  document.getElementById('docs-file-drop').classList.remove('has-file');
  document.getElementById('docs-expiry').value             = '';
  document.getElementById('docs-file-error').classList.remove('visible');
  document.getElementById('docs-upload-form-error').classList.remove('visible');
  const btn = document.getElementById('docs-submit');
  btn.disabled = false;
  btn.classList.remove('loading');
  document.getElementById('upload-title').innerHTML  = 'Upload <em>' + docType + '</em>';
  document.getElementById('upload-desc').textContent = 'For ' + petName + ' — attach the file below.';
  showView('view-doc-upload');
}

// ── FILE HANDLING ─────────────────────────────────────────────────────────────
function handleFile(file) {
  if (!file) return;
  selectedDocFile = file;
  document.getElementById('docs-file-name').textContent = file.name;
  document.getElementById('docs-file-drop').classList.add('has-file');
  document.getElementById('docs-file-error').classList.remove('visible');
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function getComplianceState() {
  const pets     = clientData.pets || [];
  const REQUIRED = ['Rabies Certificate', 'Town License', 'Vaccination Record'];
  const missing  = [];
  const expiring = [];

  pets.forEach(pet => {
    const docs = pet.docs || [];
    REQUIRED.forEach(type => {
      const validDoc = docs.find(d => d.type === type && !d.expired);
      if (!validDoc) {
        if (!clientData.docsComplete) missing.push({ pet: pet.name, type });
      } else if (validDoc.daysUntilExpiry !== undefined && validDoc.daysUntilExpiry <= 30) {
        expiring.push({ pet: pet.name, type, days: validDoc.daysUntilExpiry });
      }
    });
  });

  if (clientData.docsComplete) {
    if (expiring.length > 0) return { state: 'warning', missing: [], expiring };
    return { state: 'compliant', missing: [], expiring: [] };
  }
  return { state: 'blocked', missing, expiring };
}

function buildDashboard() {
  const { state, missing, expiring } = getComplianceState();
  const banner    = document.getElementById('dash-status-banner');
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
      '<button class="btn-book" id="dash-book-btn">🐾 Book a Service</button>';
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
      '<button class="btn-book" id="dash-book-btn">🐾 Book a Service</button>';
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
      '<button class="btn-book" disabled title="Please upload missing documents first">🔒 Booking Unavailable</button>';
  }

  setTimeout(() => {
    const bookBtn = document.getElementById('dash-book-btn');
    if (bookBtn && !bookBtn.disabled) bookBtn.onclick = () => goToStep('booking');
  }, 0);

  // ── Upcoming appointments ──
  const appts       = clientData.appointments || [];
  const apptSection = document.getElementById('dash-appointments');
  const apptCards   = document.getElementById('dash-appt-cards');

  if (appts.length > 0) {
    apptSection.style.display = 'block';

    // Save open state before rebuild
    const openIds = new Set();
    appts.forEach(a => {
      const el = document.getElementById('appt-summary-' + a.id);
      if (el && el.style.display !== 'none') openIds.add(a.id);
    });

    apptCards.innerHTML = '';

    appts.forEach(appt => {
      const isConfirmed = appt.status === 'Confirmed';
      const statusColor = isConfirmed ? 'var(--brand-success)' : 'var(--brand-warning)';
      const statusBg    = isConfirmed ? 'var(--brand-success-light)' : 'var(--brand-warning-light)';

      const nights = appt.startDate && appt.endDate
        ? Math.max(1, Math.round((new Date(appt.endDate) - new Date(appt.startDate)) / 86400000))
        : null;

      let pricingLine = '';
      if (appt.clientMessage) {
        const totalMatch = appt.clientMessage.match(/Total:\s*(\$[\d,.]+)/);
        pricingLine = totalMatch
          ? '<div style="font-size:0.75rem;font-weight:500;color:var(--brand-success);margin-top:0.2rem;">' + totalMatch[1] + ' confirmed</div>'
          : '';
      } else if (nights) {
        pricingLine = '<div style="font-size:0.75rem;font-weight:300;color:var(--brand-stone);margin-top:0.2rem;">Pricing starts at $' + (clientData.boardingPrice || 85) + '/night — confirmation coming soon</div>';
      }

      const card = document.createElement('div');
      card.style.cssText = 'padding:0.85rem 1rem;border-radius:12px;border:1.5px solid var(--brand-stone-light);background:#fff;cursor:pointer;';
      card.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.3rem;">' +
          '<div style="font-size:0.7rem;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:var(--brand-stone);">' + (appt.category === 'DC' ? '☀️ Daycare' : '🏡 Boarding') + '</div>' +
          '<div style="display:flex;align-items:center;gap:0.5rem;">' +
            '<span style="font-size:0.72rem;font-weight:500;padding:0.2rem 0.6rem;border-radius:999px;background:' + statusBg + ';color:' + statusColor + ';">' + appt.status + '</span>' +
            '<span id="appt-toggle-' + appt.id + '" style="font-size:0.75rem;color:var(--brand-stone);">▼</span>' +
          '</div>' +
        '</div>' +
        '<div style="font-size:0.92rem;font-weight:500;color:var(--brand-bark);margin-bottom:0.2rem;">' +
          fmtDate(appt.startDate) + (appt.endDate && appt.endDate !== appt.startDate ? ' → ' + fmtDate(appt.endDate) : '') +
        '</div>' +
        '<div style="font-size:0.78rem;font-weight:300;color:var(--brand-stone);">' +
          (appt.startTime ? appt.startTime + ' drop-off' : '') +
          (appt.endTime   ? ' · ' + appt.endTime + ' pick-up' : '') +
        '</div>' +
        pricingLine +
        '<div id="appt-summary-' + appt.id + '" style="display:none;margin-top:0.75rem;padding:0.75rem;background:var(--brand-sage-light);border-radius:10px;">' +
          (appt.clientMessage
            ? '<pre style="font-family:var(--font-body);font-size:0.78rem;color:var(--brand-bark);white-space:pre-wrap;margin:0;line-height:1.6;">' + appt.clientMessage + '</pre>'
            : '<div style="font-size:0.78rem;color:var(--brand-stone);font-style:italic;">Pricing summary will appear here once confirmed.</div>') +
          '<div style="margin-top:0.75rem;padding-top:0.75rem;border-top:1px solid var(--brand-stone-light);">' +
            '<div style="font-size:0.72rem;color:var(--brand-stone);margin-bottom:0.5rem;">' +
              (appt.category === 'DC'
                ? '⚠️ Cancellations must be received 24+ hours in advance. Under 24 hours: 50% charge. No-show: full charge.'
                : '⚠️ Cancellations 48+ hours before start date: no charge. Under 48 hours: one night\'s rate. No-show: full amount.') +
            '</div>' +
            '<button onclick="openCancellationModal(\'' + appt.id + '\', \'' + (appt.category || 'B') + '\', \'' + appt.startDate + '\', \'' + (appt.endDate || '') + '\')" ' +
              'style="padding:0.35rem 0.75rem;background:transparent;color:#c0392b;border:1.5px solid #c0392b;border-radius:999px;font-family:var(--font-body);font-size:0.75rem;font-weight:500;cursor:pointer;">' +
              'Request Cancellation' +
            '</button>' +
          '</div>' +
        '</div>';

      // Restore open state
      if (openIds.has(appt.id)) {
        const summary = card.querySelector('#appt-summary-' + appt.id);
        const toggle  = card.querySelector('#appt-toggle-'  + appt.id);
        if (summary) summary.style.display = 'block';
        if (toggle)  toggle.textContent    = '▲';
      }

      card.addEventListener('click', () => toggleApptSummary(appt.id));
      apptCards.appendChild(card);
    });
  } else {
    apptSection.style.display = 'none';
  }

  // ── Pet cards ──
  buildPetCards(clientData, goToStep, WORKER_URL, clientToken);
}

// ── APPOINTMENT TOGGLE ────────────────────────────────────────────────────────
function toggleApptSummary(apptId) {
  const el     = document.getElementById('appt-summary-' + apptId);
  const toggle = document.getElementById('appt-toggle-'  + apptId);
  if (!el) return;
  const isOpen = el.style.display !== 'none';
  el.style.display = isOpen ? 'none' : 'block';
  if (toggle) toggle.textContent = isOpen ? '▼' : '▲';
}
window.toggleApptSummary = toggleApptSummary;

// ── CANCELLATION ──────────────────────────────────────────────────────────────
window.openCancellationModal = function (apptId, category, startDate, endDate) {
  const existing = document.getElementById('cancellation-modal');
  if (existing) existing.remove();

  const serviceLabel = category === 'DC' ? '☀️ Daycare' : '🏡 Boarding';
  const dateLabel    = fmtDate(startDate) + (endDate && endDate !== startDate ? ' → ' + fmtDate(endDate) : '');
  const policy       = category === 'DC'
    ? 'Cancellations must be received at least 24 hours in advance. Under 24 hours: 50% charge applies. No-show: full charge.'
    : 'Cancellations more than 48 hours before the start date: no charge. Under 48 hours: one night\'s boarding rate applies. No-show: full reservation amount.';

  const modal = document.createElement('div');
  modal.id = 'cancellation-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(44,31,20,0.5);z-index:1000;display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(2px);';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:20px 20px 0 0;width:100%;max-width:560px;padding:1.75rem 1.5rem 2.5rem;max-height:85vh;overflow-y:auto;box-shadow:0 -4px 24px rgba(44,31,20,0.15);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
        <div style="font-family:var(--font-display);font-size:1.3rem;font-weight:600;">Request Cancellation</div>
        <button onclick="document.getElementById('cancellation-modal').remove()" style="background:none;border:none;font-size:1.25rem;cursor:pointer;color:var(--brand-stone);">✕</button>
      </div>
      <div style="background:var(--brand-sage-light);border-radius:10px;padding:0.75rem 1rem;margin-bottom:1rem;font-size:0.85rem;">
        <div style="font-weight:500;color:var(--brand-bark);">${serviceLabel} · ${dateLabel}</div>
      </div>
      <div style="background:#fff3f3;border:1.5px solid #f5c6c6;border-radius:10px;padding:0.75rem 1rem;margin-bottom:1.25rem;font-size:0.78rem;color:#c0392b;line-height:1.6;">
        <strong>Cancellation Policy:</strong> ${policy}
      </div>
      <div style="margin-bottom:1.25rem;">
        <label style="display:block;font-size:0.72rem;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:var(--brand-stone);margin-bottom:0.4rem;">Reason <span style="font-weight:300;text-transform:none;">(optional)</span></label>
        <textarea id="cancellation-reason" placeholder="Let us know why you're cancelling — this helps us plan..." style="width:100%;padding:0.65rem 0.85rem;border:1.5px solid var(--brand-stone-light);border-radius:10px;font-family:var(--font-body);font-size:0.9rem;outline:none;box-sizing:border-box;min-height:80px;resize:vertical;"></textarea>
      </div>
      <div id="cancellation-error" style="color:#c0392b;font-size:0.8rem;margin-bottom:0.75rem;display:none;"></div>
      <button id="cancellation-confirm-btn" onclick="submitCancellation('${apptId}', '${category}')"
        style="width:100%;padding:0.85rem;background:#c0392b;color:#fff;border:none;border-radius:12px;font-family:var(--font-body);font-size:0.95rem;font-weight:500;cursor:pointer;margin-bottom:0.6rem;">
        Confirm Cancellation Request
      </button>
      <button onclick="document.getElementById('cancellation-modal').remove()"
        style="width:100%;padding:0.85rem;background:transparent;color:var(--brand-primary);border:1.5px solid var(--brand-primary);border-radius:12px;font-family:var(--font-body);font-size:0.95rem;font-weight:500;cursor:pointer;">
        Keep My Booking
      </button>
    </div>`;

  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
};

window.submitCancellation = async function (apptId, category) {
  const btn    = document.getElementById('cancellation-confirm-btn');
  const errEl  = document.getElementById('cancellation-error');
  const reason = document.getElementById('cancellation-reason')?.value.trim();
  btn.disabled = true;
  btn.textContent = 'Submitting…';
  errEl.style.display = 'none';

  try {
    const res = await fetch(WORKER_URL + '/cancellation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: clientToken, clientId: clientData.clientId, appointmentId: apptId, serviceType: category, reason }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Server error');
    }
    document.getElementById('cancellation-modal').remove();
    const appt = (clientData.appointments || []).find(a => a.id === apptId);
    if (appt) appt.status = 'Cancellation Requested';
    buildDashboard();
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:var(--brand-success);color:#fff;padding:0.75rem 1.5rem;border-radius:999px;font-size:0.875rem;font-weight:500;z-index:200;';
    toast.textContent = 'Cancellation request sent ✓';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  } catch (err) {
    errEl.textContent = 'Something went wrong: ' + (err.message || 'Please try again.');
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Confirm Cancellation Request';
  }
};

// ── AGREEMENT ─────────────────────────────────────────────────────────────────
function toggleAgreeBtn() {
  const name    = document.getElementById('agree-name')?.value.trim();
  const checked = document.getElementById('agree-check')?.checked;
  const btn     = document.getElementById('ag-submit');
  if (btn) btn.disabled = !(name?.length >= 3 && checked);
}
window.toggleAgreeBtn = toggleAgreeBtn;

window.submitAgreement = async function () {
  const btn = document.getElementById('ag-submit');
  btn.disabled = true; btn.classList.add('loading');
  document.getElementById('ag-form-error').classList.remove('visible');
  try {
    const res = await fetch(WORKER_URL + '/agreement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: clientToken, clientId: clientData.clientId, signedName: document.getElementById('agree-name').value.trim() }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    clientData.agreementSigned = true;
    showView('view-contact-success');
  } catch {
    document.getElementById('ag-form-error').textContent = 'Something went wrong. Please try again.';
    document.getElementById('ag-form-error').classList.add('visible');
    btn.disabled = false; btn.classList.remove('loading');
  }
};

// ── CONTACT SUBMIT ────────────────────────────────────────────────────────────
window.submitContact = async function () {
  let valid = true;
  const name  = document.getElementById('c-name').value.trim();
  const phone = document.getElementById('c-phone').value.trim();
  const email = document.getElementById('c-email').value.trim();

  const show = (id, msg) => { const el = document.getElementById(id); el.textContent = msg; el.classList.add('visible'); valid = false; };
  const hide = id => document.getElementById(id).classList.remove('visible');

  if (!name)  show('c-name-error',  'Please enter your name.');         else hide('c-name-error');
  if (!phone) show('c-phone-error', 'Please enter a phone number.');    else hide('c-phone-error');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) show('c-email-error', 'Please enter a valid email.'); else hide('c-email-error');
  if (!valid) return;

  const btn = document.getElementById('c-submit');
  btn.disabled = true; btn.classList.add('loading');
  document.getElementById('c-form-error').classList.remove('visible');

  const payload = {
    token: clientToken, clientId: clientData.clientId,
    updates: [
      { field: 'Client Name',           current: clientData.name     || '', proposed: name },
      { field: 'Phone Number',          current: clientData.phone    || '', proposed: phone },
      { field: 'Email Address',         current: clientData.email    || '', proposed: email },
      { field: 'Address',               current: clientData.address  || '', proposed: document.getElementById('c-address').value.trim() },
      { field: 'Additional Owner Name', current: clientData.addName  || '', proposed: document.getElementById('c-add-name').value.trim() },
      { field: 'Additional Owner Phone',current: clientData.addPhone || '', proposed: document.getElementById('c-add-phone').value.trim() },
      { field: 'Additional Owner Email',current: clientData.addEmail || '', proposed: document.getElementById('c-add-email').value.trim() },
    ].filter(u => u.proposed !== u.current && (u.proposed || u.current)),
    markEmailConfirmed: true,
  };

  try {
    const res = await fetch(WORKER_URL + '/profile', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Server error'); }
    clientData.emailConfirmed = true;
    clientData.email = email; clientData.name = name; clientData.phone = phone;
    showView('view-contact-success');
  } catch (err) {
    document.getElementById('c-form-error').textContent = 'Error: ' + err.message;
    document.getElementById('c-form-error').classList.add('visible');
    btn.disabled = false; btn.classList.remove('loading');
  }
};

// ── EMERGENCY SUBMIT ──────────────────────────────────────────────────────────
window.submitEmergency = async function () {
  let valid = true;
  const name  = document.getElementById('e-name').value.trim();
  const phone = document.getElementById('e-phone').value.trim();
  const rel   = document.getElementById('e-relationship').value.trim();

  if (!name)  { document.getElementById('e-name-error').classList.add('visible');  valid = false; } else document.getElementById('e-name-error').classList.remove('visible');
  if (!phone) { document.getElementById('e-phone-error').classList.add('visible'); valid = false; } else document.getElementById('e-phone-error').classList.remove('visible');
  if (!rel)   { document.getElementById('e-rel-error').classList.add('visible');   valid = false; } else document.getElementById('e-rel-error').classList.remove('visible');
  if (!valid) return;

  const btn = document.getElementById('e-submit');
  btn.disabled = true; btn.classList.add('loading');
  document.getElementById('e-form-error').classList.remove('visible');

  try {
    const res = await fetch(WORKER_URL + '/profile', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: clientToken, clientId: clientData.clientId,
        directFields: { "Emergency Contact Name": name, "Emergency Contact Phone": phone, "Emergency Contact Relationship": rel },
      }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Server error'); }
    clientData.emergencyName = name; clientData.emergencyPhone = phone; clientData.emergencyRelationship = rel;
    showView('view-contact-success');
  } catch (err) {
    document.getElementById('e-form-error').textContent = 'Error: ' + err.message;
    document.getElementById('e-form-error').classList.add('visible');
    btn.disabled = false; btn.classList.remove('loading');
  }
};

// ── DOC SUBMIT ────────────────────────────────────────────────────────────────
window.submitDoc = async function () {
  if (!selectedDocFile) { document.getElementById('docs-file-error').classList.add('visible'); return; }
  document.getElementById('docs-file-error').classList.remove('visible');

  const expiry = document.getElementById('docs-expiry').value;
  if (expiry && expiry < new Date().toISOString().split('T')[0]) {
    document.getElementById('docs-upload-form-error').textContent = 'The expiration date cannot be in the past.';
    document.getElementById('docs-upload-form-error').classList.add('visible');
    return;
  }

  const btn = document.getElementById('docs-submit');
  btn.disabled = true; btn.classList.add('loading');
  document.getElementById('docs-upload-form-error').classList.remove('visible');

  let fileBase64, fileType;
  try {
    fileBase64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(selectedDocFile);
    });
    fileType = selectedDocFile.type || 'application/octet-stream';
  } catch {
    document.getElementById('docs-upload-form-error').textContent = 'Could not read the file. Please try again.';
    document.getElementById('docs-upload-form-error').classList.add('visible');
    btn.disabled = false; btn.classList.remove('loading');
    return;
  }

  try {
    const res = await fetch(WORKER_URL + '/compliance', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: clientToken, clientId: clientData.clientId,
        petId: uploadContext.petId, documentType: uploadContext.docType,
        expirationDate: expiry || null, fileName: selectedDocFile.name, fileBase64, fileType,
      }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const pet = clientData.pets.find(p => p.id === uploadContext.petId);
    if (pet) { pet.docs = pet.docs || []; pet.docs.push({ type: uploadContext.docType, expired: false }); }

    showView('view-docs');
    buildDocCards();
    updateProgressUI(calcOnboardingSteps(clientData));

    fetch(WORKER_URL + '/client?token=' + encodeURIComponent(clientToken))
      .then(r => r.ok ? r.json() : null)
      .then(fresh => {
        if (!fresh) return;
        if (fresh.pets && clientData.pets) {
          fresh.pets.forEach(freshPet => {
            const localPet = clientData.pets.find(p => p.id === freshPet.id);
            if (localPet) {
              const freshTypes = (freshPet.docs || []).map(d => d.type);
              (localPet.docs || []).forEach(localDoc => {
                if (!freshTypes.includes(localDoc.type)) { freshPet.docs = freshPet.docs || []; freshPet.docs.push(localDoc); }
              });
            }
          });
        }
        clientData = fresh;
        buildDocCards();
        updateProgressUI(calcOnboardingSteps(clientData));
      }).catch(() => {});
  } catch (err) {
    document.getElementById('docs-upload-form-error').textContent = 'Upload failed: ' + err.message + '. Please try again.';
    document.getElementById('docs-upload-form-error').classList.add('visible');
    btn.disabled = false; btn.classList.remove('loading');
  }
};

// ── BOOKING ───────────────────────────────────────────────────────────────────
function buildBookingPetPills() {
  const container = document.getElementById('booking-pet-pills');
  if (!container) return;
  container.innerHTML = '';
  (clientData.pets || []).forEach((pet, i) => {
    const inp = document.createElement('input');
    inp.type = 'checkbox'; inp.name = 'booking-pet'; inp.value = pet.id; inp.id = 'bp-' + i; inp.className = 'booking-pet-check';
    const lbl = document.createElement('label');
    lbl.htmlFor = 'bp-' + i; lbl.textContent = pet.name;
    container.appendChild(inp); container.appendChild(lbl);
    if (clientData.pets.length === 1) inp.checked = true;
  });

  // Update price info box with live prices
  const priceInfo = document.getElementById('booking-price-info');
  if (priceInfo) {
    const isDaycare = document.querySelector('input[name="booking-service"]:checked')?.value === 'daycare';
    priceInfo.textContent = isDaycare
      ? `Daycare is $${clientData.daycarePrice || 65}/session. Pricing is confirmed when we review your request.`
      : `Boarding is $${clientData.boardingPrice || 85}/night. Pricing is confirmed when we review your request.`;
  }
}

window.submitBooking = async function () {
  let valid = true;
  const serviceType  = document.querySelector('input[name="booking-service"]:checked')?.value || 'boarding';
  const isDaycare    = serviceType === 'daycare';
  const selectedPets = Array.from(document.querySelectorAll('input[name="booking-pet"]:checked')).map(el => el.value);
  const startDate    = document.getElementById('booking-start-date').value;
  const startTime    = document.getElementById('booking-start-time').value;
  const endDate      = document.getElementById('booking-end-date').value;
  const endTime      = document.getElementById('booking-end-time').value;
  const transport    = document.querySelector('input[name="booking-transport"]:checked')?.value;
  const notes        = document.getElementById('booking-notes').value.trim();
  const isWaitlist   = document.getElementById('booking-waitlist')?.checked || false;

  const REQUIRED_DOCS = ['Rabies Certificate', 'Town License', 'Vaccination Record'];
  const blockedPets   = (clientData.pets || []).filter(pet => {
    if (!pet.active) return false;
    return REQUIRED_DOCS.some(type => !(pet.docs || []).some(d => d.type === type && !d.expired));
  });
  if (blockedPets.length > 0) {
    document.getElementById('booking-form-error').textContent = 'Please update expired or missing documents for ' + blockedPets.map(p => p.name).join(', ') + ' before requesting a stay.';
    document.getElementById('booking-form-error').classList.add('visible');
    return;
  }

  const showErr = (id, msg) => { const el = document.getElementById(id); el.textContent = msg; el.classList.add('visible'); valid = false; };
  const hideErr = id => document.getElementById(id).classList.remove('visible');

  if (!selectedPets.length) showErr('booking-pet-error',        'Please select at least one pet.');    else hideErr('booking-pet-error');
  if (!startDate)           showErr('booking-start-date-error', 'Please select a drop-off date.');     else hideErr('booking-start-date-error');
  if (!startTime)           showErr('booking-start-time-error', 'Please select a drop-off time.');     else hideErr('booking-start-time-error');
  if (!isDaycare && !endDate) showErr('booking-end-date-error', 'Please select a pick-up date.');      else hideErr('booking-end-date-error');
  if (!isDaycare && !endTime) showErr('booking-end-time-error', 'Please select a pick-up time.');      else hideErr('booking-end-time-error');
  if (!transport)           showErr('booking-transport-error',  'Please select a transport option.');  else hideErr('booking-transport-error');
  if (startDate && endDate && endDate < startDate) showErr('booking-end-date-error', 'Pick-up date must be after drop-off date.');
  if (!valid) return;

  const btn = document.getElementById('booking-submit');
  btn.disabled = true; btn.classList.add('loading');
  document.getElementById('booking-form-error').classList.remove('visible');

  try {
    const res = await fetch(WORKER_URL + '/booking', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: clientToken, clientId: clientData.clientId, petIds: selectedPets, serviceType, startDate, startTime, endDate, endTime, transport, notes, waitlist: isWaitlist }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || ('HTTP ' + res.status)); }

    const selectedPetNames = Array.from(document.querySelectorAll('input[name="booking-pet"]:checked'))
      .map(el => { const pet = clientData.pets.find(p => p.id === el.value); return pet ? pet.name : el.value; });
    lastBooking = { startDate, startTime, endDate, endTime, transport, pets: selectedPetNames };

    const summary = document.getElementById('booking-summary');
    if (summary) {
      const numPets = selectedPets.length;
      let estimateLines = [], estimateTotal = 0;

      if (isDaycare) {
        const rate = clientData.daycarePrice || 65;
        const session = rate * numPets;
        estimateTotal += session;
        estimateLines.push(numPets > 1 ? `☀️ Daycare: $${rate} x ${numPets} dogs = $${session}` : `☀️ Daycare: $${rate}/session`);
      } else {
        const rate   = clientData.boardingPrice || 85;
        const nights = Math.max(1, Math.round((new Date(endDate) - new Date(startDate)) / 86400000));
        const dog1   = rate * nights;
        estimateTotal += dog1;
        estimateLines.push(`🏡 Dog 1: $${rate} x ${nights} night${nights > 1 ? 's' : ''} = $${dog1}`);
        if (numPets > 1) {
          const dog2Rate  = Math.max(0, rate - 15);
          const dog2Total = dog2Rate * nights * (numPets - 1);
          estimateTotal  += dog2Total;
          estimateLines.push(`🏡 Dog 2: $${dog2Rate} x ${nights} night${nights > 1 ? 's' : ''} = $${dog2Total}`);
        }
      }
      if (transport && transport !== 'None') {
        const tripMulti = transport === 'Round Trip' ? 2 : 1;
        const dog1Fee   = 5 * tripMulti;
        const dog2Fee   = numPets > 1 ? (5 * 0.5) * tripMulti * (numPets - 1) : 0;
        estimateTotal  += dog1Fee + dog2Fee;
        let tLine = `🚙 Transport (${transport}): $${dog1Fee}`;
        if (dog2Fee > 0) tLine += ` + $${dog2Fee} (2nd dog)`;
        estimateLines.push(tLine);
      }

      const pricingNote = isWaitlist
        ? 'You\'re on the waitlist. We\'ll confirm pricing when a spot opens up.'
        : [...estimateLines, '', `Est. Total: ~$${estimateTotal}`, '*Peak season or multi-week discounts may apply. Final price confirmed within 24hrs.'].join('\n');

      const dateLines = isDaycare
        ? '📅 Date: ' + fmtDate(startDate) + ' · ' + startTime + '<br>'
        : '📅 Drop-off: ' + fmtDate(startDate) + ' · ' + startTime + '<br>' + '📅 Pick-up: ' + fmtDate(endDate) + ' · ' + endTime + '<br>';

      summary.innerHTML =
        '<strong>' + (isDaycare ? '☀️' : '🐾') + ' ' + (lastBooking.pets.join(', ') || 'Your pet') + '</strong><br>' +
        '<strong>' + (isWaitlist ? 'Waitlist Request' : isDaycare ? 'Daycare' : 'Boarding') + '</strong><br>' +
        dateLines + '🚗 Transport: ' + transport + '<br><br>' +
        '<pre style="font-family:var(--font-body);font-size:0.78rem;color:var(--brand-bark);white-space:pre-wrap;margin:0;">' + pricingNote + '</pre>';
    }

    fetch(WORKER_URL + '/client?token=' + encodeURIComponent(clientToken)).then(r => r.ok ? r.json() : null).then(d => { if (d) clientData = d; }).catch(() => {});

    document.getElementById('booking-success-msg').textContent = isWaitlist
      ? "You're on the waitlist! We'll reach out as soon as a spot opens up."
      : isDaycare
        ? 'Your daycare request has been received. We will confirm within 24 hours via text or email.'
        : 'Your boarding request has been received. We will confirm your dates within 24 hours via text or email.';

    showView('view-booking-success');
  } catch (err) {
    document.getElementById('booking-form-error').textContent = 'Something went wrong: ' + err.message;
    document.getElementById('booking-form-error').classList.add('visible');
    btn.disabled = false; btn.classList.remove('loading');
  }
};

window.bookAnother = function () {
  document.querySelectorAll('input[name="booking-pet"]').forEach(el => { el.checked = clientData.pets?.length === 1; });
  document.getElementById('booking-start-date').value = '';
  document.getElementById('booking-start-time').value = '';
  document.getElementById('booking-end-date').value   = '';
  document.getElementById('booking-end-time').value   = '';
  document.querySelectorAll('input[name="booking-transport"]').forEach(el => el.checked = false);
  document.getElementById('booking-notes').value = '';
  const waitlistCb = document.getElementById('booking-waitlist');
  if (waitlistCb) waitlistCb.checked = false;
  document.getElementById('booking-form-error').classList.remove('visible');
  const btn = document.getElementById('booking-submit');
  btn.disabled = false; btn.classList.remove('loading');
  showView('view-booking');
};

init();