import { buildPetCards, buildNewPetView, wireNewPetForm, openEditPetForm } from './views/pets.js';

// ── CONFIG ───────────────────────────────────────────────────────────────────
const WORKER_URL = "";

// ── STATE ────────────────────────────────────────────────────────────────────
let clientToken     = null;
let clientData      = null;
let selectedDocFile = null;
let uploadContext   = { petId: null, petName: null, docType: null };
let lastBooking     = {};

// ── HELPERS ──────────────────────────────────────────────────────────────────
function showView(id) {
  const mainCard           = document.querySelector('.card');
  const bookingCard        = document.getElementById('booking-card');
  const bookingSuccessCard = document.getElementById('booking-success-card');
  const newPetCard         = document.getElementById('new-pet-card');
  const messageCard        = document.getElementById('message-card');
  const messageSuccessCard = document.getElementById('message-success-card');

  if (bookingCard)        bookingCard.style.display        = 'none';
  if (bookingSuccessCard) bookingSuccessCard.style.display = 'none';
  if (newPetCard)         newPetCard.style.display         = 'none';
  if (messageCard)        messageCard.style.display        = 'none';
  if (messageSuccessCard) messageSuccessCard.style.display = 'none';

  if (id === 'view-booking') {
    if (mainCard)    mainCard.style.display    = 'none';
    if (bookingCard) bookingCard.style.display = 'block';
  } else if (id === 'view-booking-success') {
    if (mainCard)            mainCard.style.display           = 'none';
    if (bookingSuccessCard)  bookingSuccessCard.style.display = 'block';
  } else if (id === 'view-message') {
    if (mainCard)     mainCard.style.display     = 'none';
    if (messageCard)  messageCard.style.display  = 'block';
  } else if (id === 'view-message-success') {
    if (mainCard)            mainCard.style.display           = 'none';
    if (messageSuccessCard)  messageSuccessCard.style.display = 'block';
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

// Returns inline SVG markup for a service category/name. Accepts either a
// category code (DC/HD/B) or a service name (Daycare/Half-Daycare/Boarding).
function svcIcon(key, size) {
  const px = size || 15;
  const id =
    (key === 'DC' || key === 'Daycare')                ? 'i-sun'  :
    (key === 'HD' || key === 'Half-Daycare')           ? 'i-half' :
    (key === 'B'  || key === 'Boarding')               ? 'i-home' :
    (key === 'Recurring' || key === 'recurring')       ? 'i-repeat' :
    'i-paw';
  return '<svg class="ic" style="width:' + px + 'px;height:' + px + 'px;vertical-align:-0.12em;"><use href="#' + id + '"/></svg>';
}

function formatRecurringDays(svc) {
  const pluralDay = d => d + 's';
  const days = (svc.days || []).map(pluralDay).join(' · ');
  if (!days) return '';

  if (svc.service === 'Half-Daycare') {
    // Determine AM/PM from start time
    const pref = (svc.startTime || '').toLowerCase().includes('noon') ||
                 (svc.startTime || '').toLowerCase().includes('afternoon')
      ? 'PM' : 'AM';
    return days + ' (' + pref + ')';
  }

  return days;
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

  const fillEl = document.getElementById('ob-progress-fill');
  fillEl.style.width = pct + '%';
  fillEl.style.opacity = pct === 0 ? '0' : '1';
  document.getElementById('ob-progress-text').textContent = done + ' of ' + keys.length + ' complete';

  keys.forEach((k, i) => {
    const item = document.getElementById('step-' + k + '-item');
    const icon = document.getElementById('step-' + k + '-icon');
    if (steps[k]) {
      item.classList.add('done');
      item.onclick = null;
      icon.innerHTML = '<svg class="ic" style="width:15px;height:15px;"><use href="#i-check"/></svg>';
    } else {
      item.classList.remove('done');
      item.onclick = () => goToStep(k);
      icon.textContent = i + 1;
    }
  });

  const docsDesc = document.getElementById('step-docs-desc');
  if (docsDesc && clientData?.pets?.length > 0) {
    if (steps.docs) {
      docsDesc.textContent = 'All documents on file';
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

  const newPetCard = document.getElementById('new-pet-card');
  if (newPetCard) newPetCard.innerHTML = buildNewPetView();

  // ── Service toggle ──
  document.querySelectorAll('input[name="booking-service"]').forEach(radio => {
    radio.addEventListener('change', function () {
      updateBookingFormLayout();
    });
  });

  // ── Frequency toggle ──
  document.querySelectorAll('input[name="booking-frequency"]').forEach(radio => {
    radio.addEventListener('change', function () {
      updateBookingFormLayout();
    });
  });

  // ── Recurring service sub-type (daycare vs half-daycare) ──
  // handled by updateBookingFormLayout based on main service selection

  // Wire agreement
  document.getElementById('agree-name')?.addEventListener('input', toggleAgreeBtn);

  // Wire file handling
  document.getElementById('docs-file-input')?.addEventListener('change', function () { handleFile(this.files[0]); });
  document.getElementById('docs-file-drop')?.addEventListener('dragover',  e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); });
  document.getElementById('docs-file-drop')?.addEventListener('dragleave', e => e.currentTarget.classList.remove('drag-over'));
  document.getElementById('docs-file-drop')?.addEventListener('drop', e => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    handleFile(e.dataTransfer.files[0]);
  });

  // Pre-fill contact fields
  const fill = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
  fill('c-name',         clientData.name);
  fill('c-phone',        clientData.phone);
  fill('c-email',        clientData.email);
  fill('c-address',      clientData.address);
  fill('c-add-name',     clientData.addName);
  fill('c-add-phone',    clientData.addPhone);
  fill('c-add-email',    clientData.addEmail);
  fill('e-name',         clientData.emergencyName);
  fill('e-phone',        clientData.emergencyPhone);
  fill('e-relationship', clientData.emergencyRelationship);

  const steps    = calcOnboardingSteps(clientData);
  const complete = updateProgressUI(steps);

  if (complete) {
    buildDashboard();
    showView('view-dashboard');
  } else {
    showView('view-onboarding');
  }
}

// ── BOOKING FORM LAYOUT ───────────────────────────────────────────────────────
function updateBookingFormLayout() {
  const service   = document.querySelector('input[name="booking-service"]:checked')?.value || 'boarding';
  const frequency = document.querySelector('input[name="booking-frequency"]:checked')?.value || 'one-time';

  const isBoarding    = service === 'boarding';
  const isDaycare     = service === 'daycare';
  const isHalfDaycare = service === 'half-daycare';
  const isSingleDay   = isDaycare || isHalfDaycare;
  const isRecurring   = isSingleDay && frequency === 'recurring';
  const isOneTime     = isSingleDay && frequency === 'one-time';

  // Title + button
  document.getElementById('booking-title').innerHTML =
    isHalfDaycare && isRecurring ? 'Request Recurring <em>Half-Daycare</em>' :
    isHalfDaycare                ? 'Request <em>Half-Daycare</em>'           :
    isDaycare && isRecurring     ? 'Request Recurring <em>Daycare</em>'      :
    isDaycare                    ? 'Request <em>Daycare</em>'                :
                                   'Book a <em>Boarding Stay</em>';

  document.getElementById('booking-btn-text').textContent =
    isRecurring   ? 'Request Recurring Service' :
    isHalfDaycare ? 'Request Half-Daycare'      :
    isDaycare     ? 'Request Daycare'            :
                    'Request Boarding Stay';

  // Frequency row — only for daycare / half-daycare
  document.getElementById('booking-frequency-row').style.display  = isSingleDay   ? 'block' : 'none';

  // Date rows
  document.getElementById('booking-start-row').style.display      = isBoarding    ? 'block' : 'none';
  document.getElementById('booking-pickup-row').style.display     = isBoarding    ? 'block' : 'none';
  document.getElementById('booking-date-only-row').style.display  = isOneTime     ? 'block' : 'none';

  // Half-day preference — show for half-daycare regardless of one-time or recurring
  document.getElementById('booking-halfday-pref').style.display   = isHalfDaycare ? 'block' : 'none';

  // Recurring day picker
  document.getElementById('booking-recurring-days').style.display = isRecurring   ? 'block' : 'none';

  // Price info
  const priceInfo = document.getElementById('booking-price-info');
  if (priceInfo) {
    priceInfo.textContent = isHalfDaycare
      ? `Half-Daycare is $${clientData.halfDaycarePrice || 40}/session. Pricing confirmed when we review your request.`
      : isDaycare
        ? `Daycare is $${clientData.daycarePrice || 65}/session. Pricing confirmed when we review your request.`
        : `Boarding is $${clientData.boardingPrice || 85}/night. Pricing confirmed when we review your request.`;
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
  if (step === 'booking') { buildBookingPetPills(); updateBookingFormLayout(); }
  if (step === 'contact') buildContactCurrentInfo();
}

window.goHome   = goHome;
window.goToStep = goToStep;
window.showView = showView;

// ── CONTACT INFO ──────────────────────────────────────────────────────────────
function buildContactCurrentInfo() {
  const el = document.getElementById('contact-current-info');
  if (!el || !clientData) return;
  const d = clientData;
  const lines = [
    d.name    ? '<strong>' + d.name + '</strong>' : '',
    d.phone   ? '<svg class="ic" style="width:13px;height:13px;color:var(--brand-primary);"><use href="#i-phone"/></svg> ' + d.phone    : '',
    d.email   ? '<svg class="ic" style="width:13px;height:13px;color:var(--brand-primary);"><use href="#i-mail"/></svg> ' + d.email : '',
    d.address ? '<svg class="ic" style="width:13px;height:13px;color:var(--brand-primary);"><use href="#i-pin"/></svg> ' + d.address : '',
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
    { type: 'Rabies Certificate', icon: 'i-syringe' },
    { type: 'Town License',       icon: 'i-building' },
    { type: 'Vaccination Record', icon: 'i-doc' },
  ];

  const wrap = document.createElement('div');
  wrap.className = 'doc-cards';

  DOC_TYPES.forEach(({ type, icon }) => {
    const allPetsOk = clientData.pets.every(pet =>
      (pet.docs || []).some(d => d.type === type && !d.expired)
    );

    const card = document.createElement('div');
    card.className = 'doc-card';

    const header = document.createElement('div');
    header.className = 'doc-card-header ' + (allPetsOk ? 'ok' : 'missing');
    header.innerHTML =
      '<div class="doc-card-title"><svg class="ic"><use href="#' + icon + '"/></svg> ' + type + '</div>' +
      '<span class="doc-card-status ' + (allPetsOk ? 'ok' : 'missing') + '">' + (allPetsOk ? 'Complete' : 'Needed') + '</span>';

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
      row.innerHTML = '<div class="doc-card-pet-name"><svg class="ic" style="width:14px;height:14px;color:var(--brand-primary);"><use href="#i-paw"/></svg> ' + pet.name + '</div>';

      const btn = document.createElement('button');
      if (hasValid) {
        btn.className   = 'btn-upload-small ok';
        btn.innerHTML = '<svg class="ic" style="width:12px;height:12px;"><use href="#i-check"/></svg> On file';
      } else if (expiredDoc) {
        btn.style.cssText = 'color:var(--brand-warning);border:1.5px solid var(--brand-warning);border-radius:999px;padding:0.35rem 0.75rem;background:transparent;font-family:var(--font-body);font-size:0.75rem;font-weight:500;cursor:pointer;';
        btn.innerHTML     = '<svg class="ic" style="width:12px;height:12px;"><use href="#i-alert"/></svg> Expired' + (expiredDoc.expiryDate ? ' · ' + fmtD(expiredDoc.expiryDate) : '');
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
      '<div style="color:var(--brand-success);margin-bottom:0.5rem;display:flex;justify-content:center;"><svg class="ic" style="width:1.75rem;height:1.75rem;"><use href="#i-party"/></svg></div>' +
      '<div style="font-family:var(--font-display);font-size:1.2rem;font-weight:600;color:var(--brand-success);margin-bottom:0.35rem;">All documents on file!</div>' +
      '<p style="font-size:0.82rem;color:var(--brand-bark);margin-bottom:1rem;">You\'re all set on compliance. Head back to finish your account setup.</p>' +
      '<button class="btn-primary" style="margin-top:0;max-width:260px;margin:0 auto;display:block;" onclick="goHome()">Back to Portal</button>';
    container.appendChild(banner);
  }
}

// Soft-warning modal for booking protection: a doc is valid through the stay but
// expiring soon after. Returns a promise: true = request anyway, false = go upload.
function showCoverageWarning(warnItems) {
  return new Promise(resolve => {
    const existing = document.getElementById('coverage-modal');
    if (existing) existing.remove();

    const lines = warnItems.map(w =>
      w.pet + "'s " + w.type.toLowerCase() + ' expires in ' + w.days + ' day' + (w.days === 1 ? '' : 's')
    ).join('<br>');

    const modal = document.createElement('div');
    modal.id = 'coverage-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(35,32,27,0.5);z-index:1000;display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(2px);';
    modal.innerHTML =
      '<div style="background:#fff;border-radius:20px 20px 0 0;width:100%;max-width:560px;padding:1.9rem 1.5rem 2.5rem;">' +
        '<div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.9rem;">' +
          '<svg class="ic" style="width:22px;height:22px;color:var(--warn);"><use href="#i-alert"/></svg>' +
          '<div style="font-family:var(--font-display);font-size:1.3rem;font-weight:600;">A document expires soon</div>' +
        '</div>' +
        '<div style="font-size:0.9rem;color:var(--ink);line-height:1.6;margin-bottom:0.5rem;">' + lines + '</div>' +
        '<div style="font-size:0.85rem;color:var(--muted);line-height:1.6;margin-bottom:1.5rem;">This stay is covered, but the document expires shortly after. We recommend uploading a current copy now so future bookings stay easy.</div>' +
        '<button id="coverage-upload" class="btn-primary" style="margin-bottom:0.6rem;">Upload documents now</button>' +
        '<button id="coverage-proceed" class="btn-primary" style="background:transparent;color:var(--green);box-shadow:none;border:1.5px solid var(--green);">Request anyway</button>' +
      '</div>';

    document.body.appendChild(modal);
    const close = (val) => { modal.remove(); resolve(val); };
    modal.querySelector('#coverage-upload').onclick  = () => close(false);
    modal.querySelector('#coverage-proceed').onclick = () => close(true);
    modal.addEventListener('click', e => { if (e.target === modal) close(false); });
  });
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

// Compute derived fields the dashboard logic needs.
// daysUntilExpiry now comes authoritatively from Airtable's "Days Until Expiration"
// formula via /client; we only fall back to a local calendar-day calc if it's absent.
function enrichClientData() {
  if (!clientData) return;
  const today = new Date(); today.setHours(0, 0, 0, 0);

  (clientData.pets || []).forEach(pet => {
    (pet.docs || []).forEach(doc => {
      if (typeof doc.daysUntilExpiry === 'number') {
        // already authoritative from Airtable — leave as-is
      } else if (doc.expiryDate) {
        const exp = new Date(doc.expiryDate + 'T12:00:00');
        doc.daysUntilExpiry = Math.round((exp - today) / 86400000);
      } else {
        doc.daysUntilExpiry = undefined;
      }
    });
  });

  (clientData.appointments || []).forEach(appt => {
    if (appt.startDate) {
      const start = new Date(appt.startDate + 'T12:00:00');
      appt.daysUntilStart = Math.round((start - today) / 86400000);
    } else {
      appt.daysUntilStart = undefined;
    }
  });
}

// Returns the soonest upcoming, active appointment (or null).
function getNextAppointment() {
  const upcoming = (clientData.appointments || [])
    .filter(a => ['Requested', 'Confirmed', 'Waitlisted'].includes(a.status))
    .filter(a => a.daysUntilStart !== undefined && a.daysUntilStart >= 0)
    .sort((a, b) => a.daysUntilStart - b.daysUntilStart);
  return upcoming[0] || null;
}

// Returns docs expiring within `within` days (default 30), soonest first.
// Only considers docs with a real numeric daysUntilExpiry. Treats already-expired
// (days < 0) separately via the `expired` flag so callers can word it correctly.
function getExpiringDocs(within = 30) {
  const out = [];
  (clientData.pets || []).forEach(pet => {
    (pet.docs || []).forEach(doc => {
      const days = doc.daysUntilExpiry;
      if (typeof days === 'number' && days <= within) {
        out.push({ pet: pet.name, type: doc.type, days, expired: days < 0 });
      }
    });
  });
  return out.sort((a, b) => a.days - b.days);
}

// Builds the dynamic greeting { title, sub } using the locked priority order:
// 1) expiring/expired doc that blocks an imminent stay  2) imminent stay
// 3) expiring doc, no imminent stay  4) incomplete onboarding  5) plain greeting
function getDynamicGreeting() {
  const first = clientData.firstName || 'there';
  const hour  = new Date().getHours();
  const tod   = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const nextAppt = getNextAppointment();
  const expiring = getExpiringDocs(30);
  const steps    = calcOnboardingSteps(clientData);
  const onboardingComplete = ['contact', 'emergency', 'docs', 'agreement'].every(k => steps[k]);

  const apptSoon = nextAppt && nextAppt.daysUntilStart <= 14;

  // 1) blocker affecting an imminent stay
  if (apptSoon && expiring.length > 0) {
    const d = expiring[0];
    const word = d.expired ? 'expired' : 'expires soon';
    return {
      title: `Hi ${first},`,
      sub: `${d.pet}'s ${d.type.toLowerCase()} ${word}, and there's a stay coming up ${whenPhrase(nextAppt.daysUntilStart)}. Let's get it renewed so check-in goes smoothly.`,
      tone: 'alert',
    };
  }

  // 2) imminent stay
  if (apptSoon) {
    return {
      title: `${tod}, ${first}`,
      sub: `${petLabel(nextAppt)} ${whenPhrase(nextAppt.daysUntilStart)}. We're looking forward to it.`,
      tone: 'normal',
    };
  }

  // 3) expiring doc, no imminent stay
  if (expiring.length > 0) {
    const d = expiring[0];
    const word = d.expired ? 'has expired' : `expires in ${d.days} day${d.days === 1 ? '' : 's'}`;
    return {
      title: `Hi ${first},`,
      sub: `A quick heads-up: ${d.pet}'s ${d.type.toLowerCase()} ${word}. Uploading a new one now keeps booking easy later.`,
      tone: 'alert',
    };
  }

  // 4) incomplete onboarding
  if (!onboardingComplete) {
    return {
      title: `Welcome, ${first}`,
      sub: `You're almost set up. Finishing your account takes just a minute.`,
      tone: 'normal',
    };
  }

  // 5) plain time-of-day greeting
  const petNames = (clientData.pets || []).filter(p => p.active).map(p => p.name);
  const petBit = petNames.length === 1 ? ` Hope you and ${petNames[0]} are doing well.`
               : petNames.length > 1  ? ` Hope you and the pups are doing well.` : '';
  return {
    title: `${tod}, ${first}`,
    sub: `What can we do for you today?${petBit}`,
    tone: 'normal',
  };
}

function whenPhrase(days) {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days <= 7)  return `in ${days} days`;
  return `in ${days} days`;
}

function petLabel(appt) {
  const cat = appt.category === 'DC' ? 'Daycare' : appt.category === 'HD' ? 'Half-day' : 'A boarding stay';
  const verb = appt.status === 'Confirmed' ? 'is confirmed' : 'is requested';
  return `${cat} ${verb}`;
}

// Booking protection (Option B): for a requested stay, check whether each selected
// pet's required documents stay valid through the stay. Returns:
//   { block: [...], warn: [...] }
// block = docs that expire BEFORE OR DURING the stay (dog would be uncovered) — hard stop.
// warn  = docs valid through the stay but expiring soon after (<=30 days) — soft heads-up.
// `coverageEndDate` is the last day coverage is needed (stay end, or single day).
// For ongoing recurring services with no end date, pass null — then any required doc
// expiring within 30 days is a warning (it will lapse mid-service), never a hard block.
function checkDocCoverage(petIds, coverageEndDate) {
  const REQUIRED_DOCS = ['Rabies Certificate', 'Town License', 'Vaccination Record'];
  const block = [];
  const warn  = [];
  const pets  = (clientData.pets || []).filter(p => petIds.includes(p.id) && p.active);

  pets.forEach(pet => {
    REQUIRED_DOCS.forEach(type => {
      // The currently-valid doc of this type (already-expired/missing is caught elsewhere)
      const doc = (pet.docs || []).find(d => d.type === type && !d.expired);
      if (!doc || !doc.expiryDate) return;

      if (coverageEndDate) {
        // Dated stay: does the doc expire on or before the last day of the stay?
        if (doc.expiryDate <= coverageEndDate) {
          block.push({ pet: pet.name, type, expiry: doc.expiryDate });
        } else if (typeof doc.daysUntilExpiry === 'number' && doc.daysUntilExpiry <= 30) {
          warn.push({ pet: pet.name, type, days: doc.daysUntilExpiry });
        }
      } else {
        // Ongoing recurring: warn if expiring within 30 days (will lapse mid-service)
        if (typeof doc.daysUntilExpiry === 'number' && doc.daysUntilExpiry <= 30) {
          warn.push({ pet: pet.name, type, days: doc.daysUntilExpiry });
        }
      }
    });
  });

  return { block, warn };
}

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
      } else if (typeof validDoc.daysUntilExpiry === 'number' && validDoc.daysUntilExpiry <= 30) {
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

// Permanent "Your Account" section at the bottom of the dashboard. Always visible.
// Each item (contact, emergency, documents, agreement) is tappable to view or edit,
// whether complete or not — so clients can always reach these, not just during setup.
// Title shifts: "Finish setting up" while incomplete, "Your Account" once done.
function renderAccountSetup() {
  const host = document.getElementById('dash-setup');
  if (!host) return;
  const steps = calcOnboardingSteps(clientData);
  const keys  = ['contact', 'emergency', 'docs', 'agreement'];
  const allDone = keys.every(k => steps[k]);

  const META = {
    contact:   { title: 'Contact Information',  doneDesc: 'Name, phone, email & address',          todoDesc: 'Add your name, phone, email & address',   icon: 'i-user' },
    emergency: { title: 'Emergency Contact',    doneDesc: 'On file',                               todoDesc: 'Someone to reach if you\'re both away',    icon: 'i-phone' },
    docs:      { title: 'Compliance Documents', doneDesc: 'All documents on file',                 todoDesc: 'Rabies, town license & vaccination per pet', icon: 'i-doc' },
    agreement: { title: 'Client Agreement',     doneDesc: 'Signed',                                todoDesc: 'Review and sign the service agreement',    icon: 'i-shield' },
  };

  const rows = keys.map(k => {
    const done = steps[k];
    const m = META[k];
    // Every row is tappable — done rows route to the same step to view/update.
    return '<a class="check-item' + (done ? ' done' : '') + '" onclick="goToStep(\'' + k + '\')">' +
      '<div class="check-icon"><svg class="ic"><use href="#' + (done ? 'i-check' : m.icon) + '"/></svg></div>' +
      '<div class="check-text"><div class="check-title">' + m.title + '</div>' +
      '<div class="check-desc">' + (done ? m.doneDesc : m.todoDesc) + '</div></div>' +
      '<svg class="ic check-arrow"><use href="#i-arrow"/></svg>' +
    '</a>';
  }).join('');

  const title = allDone ? 'Your Account' : 'Finish setting up';

  host.style.display = 'block';
  host.innerHTML =
    '<div class="section-header"><div class="section-title">' + title + '</div></div>' +
    '<div class="checklist">' + rows + '</div>';
}

function buildDashboard() {
  enrichClientData();

  const { state, missing, expiring } = getComplianceState();
  const firstName = clientData.firstName || 'there';

  // ── 1 · Dynamic greeting ──
  const greeting = getDynamicGreeting();
  const greetEl  = document.getElementById('dash-greeting');
  if (greetEl) {
    greetEl.innerHTML =
      '<div class="greeting-name">' + greeting.title.replace(firstName, '<em>' + firstName + '</em>') + '</div>' +
      '<div class="greeting-sub">' + greeting.sub + '</div>';
  }

  // ── 1b · Conditional alert strip (missing docs block booking; expiring docs warn) ──
  const alertEl = document.getElementById('dash-alert');
  if (alertEl) {
    if (state === 'blocked') {
      const items = missing.map(m => m.pet + ': ' + m.type).join(' · ');
      alertEl.innerHTML =
        '<div class="alert-strip err">' +
          '<svg class="ic"><use href="#i-lock"/></svg>' +
          '<div class="body"><b>Documents needed before booking.</b> ' + items + '</div>' +
        '</div>';
    } else if (state === 'warning') {
      const items = expiring.map(e =>
        e.days < 0 ? (e.pet + "'s " + e.type + ' has expired')
                   : (e.pet + "'s " + e.type + ' expires in ' + e.days + ' day' + (e.days === 1 ? '' : 's'))
      ).join(' · ');
      alertEl.innerHTML =
        '<div class="alert-strip warn">' +
          '<svg class="ic"><use href="#i-alert"/></svg>' +
          '<div class="body"><b>Renew before your next stay.</b> ' + items + '</div>' +
        '</div>';
    } else {
      alertEl.innerHTML = '';
    }
  }

  // ── 2 · Hero "Request a Service" — disabled when blocked ──
  const requestBtn = document.getElementById('dash-request-btn');
  if (requestBtn) {
    if (state === 'blocked') {
      requestBtn.disabled = true;
      requestBtn.innerHTML = '<svg class="ic"><use href="#i-lock"/></svg> Complete Documents to Request';
      requestBtn.onclick = () => goToStep('docs');
      requestBtn.disabled = false; // keep tappable so it routes to docs
    } else {
      requestBtn.disabled = false;
      requestBtn.innerHTML = '<svg class="ic"><use href="#i-cal"/></svg> Request a Service';
      requestBtn.onclick = () => goToStep('booking');
    }
  }

  // Message Us → in-portal message form
  const msgBtn = document.getElementById('dash-message-btn');
  if (msgBtn) msgBtn.onclick = () => openMessage();

  // ── 5 · Account setup (demoted) — show only if onboarding incomplete ──
  renderAccountSetup();

  // ── Upcoming appointments ──
  const appts       = clientData.appointments || [];
  const apptSection = document.getElementById('dash-appointments');
  const apptCards   = document.getElementById('dash-appt-cards');

  const APPT_VISIBLE_DEFAULT = 4;
  const showAllAppts = window._showAllAppts === true;

  if (appts.length > 0) {
    apptSection.style.display = 'block';

    const openIds = new Set();
    appts.forEach(a => {
      const el = document.getElementById('appt-summary-' + a.id);
      if (el && el.style.display !== 'none') openIds.add(a.id);
    });

    apptCards.innerHTML = '';

    const visibleAppts = showAllAppts ? appts : appts.slice(0, APPT_VISIBLE_DEFAULT);

    visibleAppts.forEach(appt => {
      const statusStyles = {
        'Confirmed':              { color: 'var(--brand-success)',  bg: 'var(--brand-success-light)' },
        'Requested':              { color: 'var(--brand-warning)',  bg: 'var(--brand-warning-light)' },
        'Waitlisted':             { color: '#c07a2a',               bg: '#fff8f0' },
        'Cancellation Requested': { color: '#c0392b',               bg: '#fff3f3' },
        'Cancelled':              { color: 'var(--brand-stone)',    bg: 'var(--brand-stone-light)' },
        'In Progress':            { color: 'var(--brand-success)',  bg: 'var(--brand-success-light)' },
      };
      const { color: statusColor, bg: statusBg } = statusStyles[appt.status] || { color: 'var(--brand-stone)', bg: 'var(--brand-stone-light)' };

      const nights = appt.startDate && appt.endDate
        ? Math.max(1, Math.round((new Date(appt.endDate) - new Date(appt.startDate)) / 86400000))
        : null;

      const serviceLabel =
        svcIcon(appt.category) + ' ' + (
          appt.category === 'DC' ? 'Daycare'      :
          appt.category === 'HD' ? 'Half-Daycare' :
          'Boarding');

      let pricingLine = '';
      if (appt.clientMessage) {
        const totalMatch = appt.clientMessage.match(/Total:\s*(\$[\d,.]+)/);
        pricingLine = totalMatch
          ? '<div style="font-size:0.75rem;font-weight:500;color:var(--brand-success);margin-top:0.2rem;">' + totalMatch[1] + ' confirmed</div>'
          : '';
      } else if (nights && appt.category === 'B') {
        pricingLine = '<div style="font-size:0.75rem;font-weight:300;color:var(--brand-stone);margin-top:0.2rem;">Pricing starts at $' + (clientData.boardingPrice || 85) + '/night — confirmation coming soon</div>';
      }

      const feeLine = (appt.status === 'Cancelled' || appt.status === 'Cancellation Requested') && appt.cancellationFee !== null
        ? (appt.cancellationFee > 0
            ? '<div style="font-size:0.82rem;color:#c0392b;font-weight:500;margin-bottom:0.5rem;">Cancellation fee: $' + appt.cancellationFee.toFixed(2) + '</div>'
            : '<div style="font-size:0.82rem;color:var(--brand-success);font-weight:500;margin-bottom:0.5rem;">Cancellation fee: None' + (appt.cancellationFeeReason === 'Grace Period' ? ' — cancelled within 4 hours of booking' : ' — cancelled with sufficient notice') + '</div>')
        : '';

      const statusMessage =
        appt.status === 'Waitlisted'
          ? '<div style="font-size:0.82rem;color:#c07a2a;font-weight:500;margin-bottom:0.5rem;"><svg class="ic" style="width:13px;height:13px;vertical-align:-0.1em;"><use href="#i-doc"/></svg> ' +
            (appt.category === 'HD'
              ? 'Your half-daycare request is pending — we\'ll confirm once we pair your session with the other half of the day.'
              : 'You\'re on the waitlist for these dates. We\'ll reach out as soon as a spot opens up.') +
            '</div>'
          : appt.status === 'Cancelled'
            ? '<div style="font-size:0.82rem;color:var(--brand-stone);margin-bottom:0.5rem;">This appointment has been cancelled.' + (appt.clientMessage ? ' See pricing details below.' : '') + '</div>' + feeLine
            : appt.status === 'Cancellation Requested'
              ? '<div style="font-size:0.82rem;color:#c0392b;margin-bottom:0.5rem;">Your cancellation request is being reviewed. We\'ll follow up shortly.</div>' + feeLine
              : '';

      const canCancel = ['Requested', 'Confirmed', 'Waitlisted'].includes(appt.status);

      const card = document.createElement('div');
      card.style.cssText = 'padding:1.05rem 1.1rem;border-radius:14px;border:1px solid var(--line);background:#fff;cursor:pointer;box-shadow:0 1px 2px rgba(35,32,27,0.04),0 4px 14px rgba(35,32,27,0.05);';
      card.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.3rem;">' +
          '<div style="font-size:0.7rem;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:var(--brand-stone);">' + serviceLabel + '</div>' +
          '<div style="display:flex;align-items:center;gap:0.5rem;">' +
            '<span style="font-size:0.72rem;font-weight:500;padding:0.2rem 0.6rem;border-radius:999px;background:' + statusBg + ';color:' + statusColor + ';">' + appt.status + '</span>' +
            '<span id="appt-toggle-' + appt.id + '" style="color:var(--brand-stone);display:inline-flex;"><svg class="ic" style="width:15px;height:15px;transform:rotate(90deg);"><use href="#i-arrow"/></svg></span>' +
          '</div>' +
        '</div>' +
        '<div style="font-size:0.92rem;font-weight:500;color:var(--brand-bark);margin-bottom:0.2rem;">' +
          fmtDate(appt.startDate) + (appt.endDate && appt.endDate !== appt.startDate ? ' → ' + fmtDate(appt.endDate) : '') +
        '</div>' +
        '<div style="font-size:0.78rem;font-weight:300;color:var(--brand-stone);">' +
          (appt.startTime ? appt.startTime : '') +
          (appt.endTime   ? ' → ' + appt.endTime : '') +
        '</div>' +
        pricingLine +
        '<div id="appt-summary-' + appt.id + '" style="display:none;margin-top:0.75rem;padding:0.85rem 0.95rem;background:var(--surface);border:1px solid var(--line-soft);border-left:3px solid var(--green);border-radius:10px;">' +
          statusMessage +
          (appt.clientMessage
            ? '<pre style="font-family:var(--font-body);font-size:0.78rem;color:var(--brand-bark);white-space:pre-wrap;margin:0;line-height:1.6;">' + appt.clientMessage + '</pre>'
            : (!statusMessage ? '<div style="font-size:0.78rem;color:var(--brand-stone);font-style:italic;">Pricing summary will appear here once confirmed.</div>' : '')) +
          (canCancel
            ? '<div style="margin-top:0.75rem;padding-top:0.75rem;border-top:1px solid var(--line-soft);">' +
                '<button class="btn-danger" onclick="openCancellationModal(\'' + appt.id + '\', \'' + (appt.category || 'B') + '\', \'' + appt.startDate + '\', \'' + (appt.endDate || '') + '\')">' +
                '<svg class="ic"><use href="#i-alert"/></svg>Request Cancellation</button>' +
              '</div>'
            : '') +
        '</div>';

      if (openIds.has(appt.id)) {
        const summary = card.querySelector('#appt-summary-' + appt.id);
        const toggle  = card.querySelector('#appt-toggle-'  + appt.id);
        if (summary) summary.style.display = 'block';
        if (toggle)  { const c = toggle.querySelector('svg'); if (c) c.style.transform = 'rotate(-90deg)'; }
      }

      card.addEventListener('click', () => toggleApptSummary(appt.id));
      apptCards.appendChild(card);
    });

    if (appts.length > APPT_VISIBLE_DEFAULT) {
      const toggleBtn = document.createElement('button');
      toggleBtn.style.cssText = 'width:100%;padding:0.6rem;background:transparent;color:var(--brand-primary);border:1.5px dashed var(--brand-stone-light);border-radius:10px;font-family:var(--font-body);font-size:0.8rem;font-weight:500;cursor:pointer;margin-top:0.25rem;';
      toggleBtn.textContent = showAllAppts
        ? 'Show fewer'
        : `Show all (${appts.length})`;
      toggleBtn.onclick = () => {
        window._showAllAppts = !showAllAppts;
        buildDashboard();
      };
      apptCards.appendChild(toggleBtn);
    }
  } else {
    // Empty state — invite action instead of hiding
    apptSection.style.display = 'block';
    const activePetName = (clientData.pets || []).find(p => p.active)?.name;
    const onCal = activePetName ? activePetName + ' on the calendar' : 'a visit on the calendar';
    apptCards.innerHTML =
      '<div class="upcoming-empty">' +
        '<svg class="ic"><use href="#i-cal"/></svg>' +
        '<p>No visits planned. Request a service to get ' + onCal + '.</p>' +
        '<button class="btn-sm" id="dash-empty-request"><svg class="ic"><use href="#i-cal"/></svg>Request a Service</button>' +
      '</div>';
    setTimeout(() => {
      const eb = document.getElementById('dash-empty-request');
      if (eb) eb.onclick = () => goToStep('booking');
    }, 0);
  }

  // ── Recurring services ──
  buildRecurringServices();

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
  if (toggle) { const c = toggle.querySelector('svg'); if (c) c.style.transform = isOpen ? 'rotate(90deg)' : 'rotate(-90deg)'; }
}
window.toggleApptSummary = toggleApptSummary;

// ── RECURRING SERVICES ────────────────────────────────────────────────────────
function buildRecurringServices() {
  const services  = clientData.recurringServices || [];
  const section   = document.getElementById('dash-recurring');
  if (!section) return;

  if (services.length === 0) { section.style.display = 'none'; return; }
  section.style.display = 'block';

  const container = document.getElementById('dash-recurring-cards');
  if (!container) return;
  container.innerHTML = '';

  const serviceEmoji = s => svcIcon(s);

  const statusStyles = {
    'Active':                 { color: 'var(--brand-success)', bg: 'var(--brand-success-light)' },
    'Requested':              { color: 'var(--brand-warning)', bg: 'var(--brand-warning-light)' },
    'Paused':                 { color: '#c07a2a',              bg: '#fff8f0' },
    'Cancellation Requested': { color: '#c0392b',              bg: '#fff3f3' },
  };

  services.forEach(svc => {
    const { color: statusColor, bg: statusBg } = statusStyles[svc.status] || { color: 'var(--brand-stone)', bg: 'var(--brand-stone-light)' };
    const canPause  = svc.status === 'Active';
    const canCancel = svc.status === 'Active' || svc.status === 'Paused' || svc.status === 'Requested';

    const card = document.createElement('div');
    card.style.cssText = 'padding:1.05rem 1.1rem;border-radius:14px;border:1px solid var(--line);background:#fff;cursor:pointer;box-shadow:0 1px 2px rgba(35,32,27,0.04),0 4px 14px rgba(35,32,27,0.05);';

    const pauseInfo = svc.status === 'Paused' && svc.pauseUntil
      ? '<div style="font-size:0.75rem;color:#c07a2a;margin-top:0.2rem;">Paused until ' + fmtDate(svc.pauseUntil) + '</div>'
      : '';

    const statusNote =
      svc.status === 'Requested'
        ? '<div style="font-size:0.82rem;color:var(--brand-warning);margin-bottom:0.75rem;">Your recurring service request is pending. We\'ll confirm shortly.</div>'
        : svc.status === 'Cancellation Requested'
          ? '<div style="font-size:0.82rem;color:#c0392b;margin-bottom:0.75rem;">Your cancellation request is being reviewed.</div>'
          : svc.status === 'Paused'
            ? '<div style="font-size:0.82rem;color:#c07a2a;margin-bottom:0.75rem;">Service is paused until ' + fmtDate(svc.pauseUntil) + '. It will resume automatically.</div>'
            : '';

    card.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.3rem;">' +
        '<div style="font-size:0.7rem;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:var(--brand-stone);">' +
          serviceEmoji(svc.service) + ' ' + svc.service + ' · Weekly' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:0.5rem;">' +
          '<span style="font-size:0.72rem;font-weight:500;padding:0.2rem 0.6rem;border-radius:999px;background:' + statusBg + ';color:' + statusColor + ';">' + svc.status + '</span>' +
          '<span id="rec-toggle-' + svc.id + '" style="color:var(--brand-stone);display:inline-flex;"><svg class="ic" style="width:15px;height:15px;transform:rotate(90deg);"><use href="#i-arrow"/></svg></span>' +
        '</div>' +
      '</div>' +
      '<div style="font-size:0.92rem;font-weight:500;color:var(--brand-bark);margin-bottom:0.2rem;">' + svc.pets.join(' & ') + '</div>' +
      '<div style="font-size:0.78rem;font-weight:300;color:var(--brand-stone);">' + formatRecurringDays(svc) + '</div>' +
      pauseInfo +
      '<div id="rec-summary-' + svc.id + '" style="display:none;margin-top:0.75rem;padding:0.85rem 0.95rem;background:var(--surface);border:1px solid var(--line-soft);border-left:3px solid var(--green);border-radius:10px;">' +
        statusNote +
        (canPause || canCancel
          ? '<div style="display:flex;gap:0.5rem;flex-wrap:wrap;">' +
              (canPause
                ? '<button class="btn-warn" onclick="openRecurringPauseModal(\'' + svc.id + '\', \'' + svc.service + '\')">' +
                  '<svg class="ic"><use href="#i-clock"/></svg>Pause Service</button>'
                : '') +
              (canCancel
                ? '<button class="btn-danger" onclick="openRecurringCancelModal(\'' + svc.id + '\', \'' + svc.service + '\', \'' + svc.pets.join(', ') + '\')">' +
                  '<svg class="ic"><use href="#i-alert"/></svg>Cancel Service</button>'
                : '') +
            '</div>'
          : '') +
      '</div>';

    card.addEventListener('click', () => {
      const el     = document.getElementById('rec-summary-' + svc.id);
      const toggle = document.getElementById('rec-toggle-'  + svc.id);
      if (!el) return;
      const isOpen = el.style.display !== 'none';
      el.style.display = isOpen ? 'none' : 'block';
      if (toggle) { const c = toggle.querySelector('svg'); if (c) c.style.transform = isOpen ? 'rotate(90deg)' : 'rotate(-90deg)'; }
    });

    container.appendChild(card);
  });
}

// ── RECURRING MODALS ──────────────────────────────────────────────────────────
window.openRecurringPauseModal = function(recurringId, serviceName) {
  const existing = document.getElementById('recurring-modal');
  if (existing) existing.remove();

  const today   = new Date();
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 14);
  const fmt = d => d.toISOString().split('T')[0];

  const modal = document.createElement('div');
  modal.id = 'recurring-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(44,31,20,0.5);z-index:1000;display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(2px);';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:20px 20px 0 0;width:100%;max-width:560px;padding:1.75rem 1.5rem 2.5rem;max-height:85vh;overflow-y:auto;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
        <div style="font-family:var(--font-display);font-size:1.3rem;font-weight:600;">Pause ${serviceName}</div>
        <button onclick="document.getElementById('recurring-modal').remove()" style="background:none;border:none;font-size:1.25rem;cursor:pointer;color:var(--brand-stone);">✕</button>
      </div>
      <div style="font-size:0.85rem;color:var(--brand-stone);margin-bottom:1.25rem;line-height:1.6;">
        We'll hold your spot for up to 2 weeks. After that, the spot may be offered to another client.
      </div>
      <div style="margin-bottom:1.25rem;">
        <label style="display:block;font-size:0.72rem;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:var(--brand-stone);margin-bottom:0.4rem;">Resume After <span style="color:var(--brand-warning);">*</span></label>
        <input type="date" id="pause-until-date" min="${fmt(today)}" max="${fmt(maxDate)}"
          style="width:100%;padding:0.65rem 0.85rem;border:1.5px solid var(--brand-stone-light);border-radius:10px;font-family:var(--font-body);font-size:0.9rem;outline:none;box-sizing:border-box;"/>
        <div style="font-size:0.72rem;color:var(--brand-stone);margin-top:0.35rem;">Maximum 2 weeks from today (${fmtDate(fmt(maxDate))}).</div>
      </div>
      <div id="recurring-modal-error" style="color:#c0392b;font-size:0.8rem;margin-bottom:0.75rem;display:none;"></div>
      <button id="recurring-modal-btn" onclick="submitRecurringPause('${recurringId}')"
        style="width:100%;padding:0.85rem;background:#c07a2a;color:#fff;border:none;border-radius:12px;font-family:var(--font-body);font-size:0.95rem;font-weight:500;cursor:pointer;margin-bottom:0.6rem;">
        Confirm Pause
      </button>
      <button onclick="document.getElementById('recurring-modal').remove()"
        style="width:100%;padding:0.85rem;background:transparent;color:var(--brand-primary);border:1.5px solid var(--brand-primary);border-radius:12px;font-family:var(--font-body);font-size:0.95rem;font-weight:500;cursor:pointer;">
        Keep Active
      </button>
    </div>`;

  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
};

window.submitRecurringPause = async function(recurringId) {
  const btn        = document.getElementById('recurring-modal-btn');
  const errEl      = document.getElementById('recurring-modal-error');
  const pauseUntil = document.getElementById('pause-until-date')?.value;

  if (!pauseUntil) { errEl.textContent = 'Please select a resume date.'; errEl.style.display = 'block'; return; }

  btn.disabled = true; btn.textContent = 'Submitting…';
  errEl.style.display = 'none';

  try {
    const res = await fetch(WORKER_URL + '/recurring-pause', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: clientToken, clientId: clientData.clientId, recurringId, pauseUntil }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Server error'); }

    document.getElementById('recurring-modal').remove();
    const svc = (clientData.recurringServices || []).find(s => s.id === recurringId);
    if (svc) { svc.status = 'Paused'; svc.pauseUntil = pauseUntil; }
    buildDashboard();

    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:var(--brand-success);color:#fff;padding:0.75rem 1.5rem;border-radius:999px;font-size:0.875rem;font-weight:500;z-index:200;';
    toast.textContent = 'Service paused ✓';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  } catch (err) {
    errEl.textContent = err.message || 'Something went wrong.';
    errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Confirm Pause';
  }
};

window.openRecurringCancelModal = function(recurringId, serviceName, petNames) {
  const existing = document.getElementById('recurring-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'recurring-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(44,31,20,0.5);z-index:1000;display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(2px);';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:20px 20px 0 0;width:100%;max-width:560px;padding:1.75rem 1.5rem 2.5rem;max-height:85vh;overflow-y:auto;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
        <div style="font-family:var(--font-display);font-size:1.3rem;font-weight:600;">Cancel ${serviceName}</div>
        <button onclick="document.getElementById('recurring-modal').remove()" style="background:none;border:none;font-size:1.25rem;cursor:pointer;color:var(--brand-stone);">✕</button>
      </div>
      <div style="background:var(--surface);border:1px solid var(--line-soft);border-left:3px solid var(--green);border-radius:10px;padding:0.85rem 1rem;margin-bottom:1rem;font-size:0.85rem;">
        <div style="font-weight:500;color:var(--brand-bark);">${serviceName} · ${petNames}</div>
      </div>
      <div style="background:#fff3f3;border:1.5px solid #f5c6c6;border-radius:10px;padding:0.75rem 1rem;margin-bottom:1.25rem;font-size:0.78rem;color:#c0392b;line-height:1.6;">
        Cancelling stops all future sessions. Individual upcoming appointments already created will remain unless cancelled separately. If you only need a short break, consider pausing instead.
      </div>
      <div style="margin-bottom:1.25rem;">
        <label style="display:block;font-size:0.72rem;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:var(--brand-stone);margin-bottom:0.4rem;">Reason <span style="font-weight:300;text-transform:none;">(optional)</span></label>
        <textarea id="recurring-cancel-reason" placeholder="Let us know why you're cancelling..."
          style="width:100%;padding:0.65rem 0.85rem;border:1.5px solid var(--brand-stone-light);border-radius:10px;font-family:var(--font-body);font-size:0.9rem;outline:none;box-sizing:border-box;min-height:80px;resize:vertical;"></textarea>
      </div>
      <div id="recurring-modal-error" style="color:#c0392b;font-size:0.8rem;margin-bottom:0.75rem;display:none;"></div>
      <button id="recurring-modal-btn" onclick="submitRecurringCancel('${recurringId}')"
        style="width:100%;padding:0.85rem;background:#c0392b;color:#fff;border:none;border-radius:12px;font-family:var(--font-body);font-size:0.95rem;font-weight:500;cursor:pointer;margin-bottom:0.6rem;">
        Request Cancellation
      </button>
      <button onclick="document.getElementById('recurring-modal').remove()"
        style="width:100%;padding:0.85rem;background:transparent;color:var(--brand-primary);border:1.5px solid var(--brand-primary);border-radius:12px;font-family:var(--font-body);font-size:0.95rem;font-weight:500;cursor:pointer;">
        Keep Service
      </button>
    </div>`;

  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
};

window.submitRecurringCancel = async function(recurringId) {
  const btn    = document.getElementById('recurring-modal-btn');
  const errEl  = document.getElementById('recurring-modal-error');
  const reason = document.getElementById('recurring-cancel-reason')?.value.trim();

  btn.disabled = true; btn.textContent = 'Submitting…';
  errEl.style.display = 'none';

  try {
    const res = await fetch(WORKER_URL + '/recurring-cancel', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: clientToken, clientId: clientData.clientId, recurringId, reason }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Server error'); }

    document.getElementById('recurring-modal').remove();
    const svc = (clientData.recurringServices || []).find(s => s.id === recurringId);
    if (svc) svc.status = 'Cancellation Requested';
    buildDashboard();

    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:var(--brand-success);color:#fff;padding:0.75rem 1.5rem;border-radius:999px;font-size:0.875rem;font-weight:500;z-index:200;';
    toast.textContent = 'Cancellation request sent ✓';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  } catch (err) {
    errEl.textContent = err.message || 'Something went wrong.';
    errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Request Cancellation';
  }
};

// ── CANCELLATION ──────────────────────────────────────────────────────────────
window.openCancellationModal = function(apptId, category, startDate, endDate) {
  const existing = document.getElementById('cancellation-modal');
  if (existing) existing.remove();

  const serviceLabel = svcIcon(category) + ' ' + (category === 'DC' ? 'Daycare' : category === 'HD' ? 'Half-Daycare' : 'Boarding');
  const dateLabel    = fmtDate(startDate) + (endDate && endDate !== startDate ? ' → ' + fmtDate(endDate) : '');
  const policy       = category === 'DC' || category === 'HD'
    ? 'Cancellations must be received at least 24 hours in advance. Under 24 hours: 50% charge applies. No-show: full charge.'
    : 'Cancellations more than 48 hours before the start date: no charge. Under 48 hours: one night\'s boarding rate applies. No-show: full reservation amount.';

  const modal = document.createElement('div');
  modal.id = 'cancellation-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(44,31,20,0.5);z-index:1000;display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(2px);';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:20px 20px 0 0;width:100%;max-width:560px;padding:1.75rem 1.5rem 2.5rem;max-height:85vh;overflow-y:auto;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
        <div style="font-family:var(--font-display);font-size:1.3rem;font-weight:600;">Request Cancellation</div>
        <button onclick="document.getElementById('cancellation-modal').remove()" style="background:none;border:none;font-size:1.25rem;cursor:pointer;color:var(--brand-stone);">✕</button>
      </div>
      <div style="background:var(--surface);border:1px solid var(--line-soft);border-left:3px solid var(--green);border-radius:10px;padding:0.85rem 1rem;margin-bottom:1rem;font-size:0.85rem;">
        <div style="font-weight:500;color:var(--brand-bark);">${serviceLabel} · ${dateLabel}</div>
      </div>
      <div style="background:#fff3f3;border:1.5px solid #f5c6c6;border-radius:10px;padding:0.75rem 1rem;margin-bottom:1.25rem;font-size:0.78rem;color:#c0392b;line-height:1.6;">
        <strong>Cancellation Policy:</strong> ${policy}
      </div>
      <div style="margin-bottom:1.25rem;">
        <label style="display:block;font-size:0.72rem;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:var(--brand-stone);margin-bottom:0.4rem;">Reason <span style="font-weight:300;text-transform:none;">(optional)</span></label>
        <textarea id="cancellation-reason" placeholder="Let us know why you're cancelling — this helps us plan..."
          style="width:100%;padding:0.65rem 0.85rem;border:1.5px solid var(--brand-stone-light);border-radius:10px;font-family:var(--font-body);font-size:0.9rem;outline:none;box-sizing:border-box;min-height:80px;resize:vertical;"></textarea>
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

window.submitCancellation = async function(apptId, category) {
  const btn    = document.getElementById('cancellation-confirm-btn');
  const errEl  = document.getElementById('cancellation-error');
  const reason = document.getElementById('cancellation-reason')?.value.trim();
  btn.disabled = true; btn.textContent = 'Submitting…';
  errEl.style.display = 'none';

  try {
    const res = await fetch(WORKER_URL + '/cancellation', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: clientToken, clientId: clientData.clientId, appointmentId: apptId, serviceType: category, reason }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Server error'); }
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
    btn.disabled = false; btn.textContent = 'Confirm Cancellation Request';
  }
};

// ── AGREEMENT ─────────────────────────────────────────────────────────────────
function toggleAgreeBtn() {
  const name    = document.getElementById('agree-name')?.value.trim();
  const checkEl = document.getElementById('agree-check');
  const checked = checkEl?.checked;
  const btn     = document.getElementById('ag-submit');
  if (btn) btn.disabled = !(name?.length >= 3 && checked);
  const row = checkEl?.closest('.checkbox-row');
  if (row) row.classList.toggle('checked', !!checked);
}
window.toggleAgreeBtn = toggleAgreeBtn;

window.submitAgreement = async function() {
  const btn = document.getElementById('ag-submit');
  btn.disabled = true; btn.classList.add('loading');
  document.getElementById('ag-form-error').classList.remove('visible');
  try {
    const res = await fetch(WORKER_URL + '/agreement', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
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
window.submitContact = async function() {
  let valid = true;
  const name  = document.getElementById('c-name').value.trim();
  const phone = document.getElementById('c-phone').value.trim();
  const email = document.getElementById('c-email').value.trim();

  const show = (id, msg) => { const el = document.getElementById(id); el.textContent = msg; el.classList.add('visible'); valid = false; };
  const hide = id => document.getElementById(id).classList.remove('visible');

  if (!name)  show('c-name-error',  'Please enter your name.');      else hide('c-name-error');
  if (!phone) show('c-phone-error', 'Please enter a phone number.'); else hide('c-phone-error');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) show('c-email-error', 'Please enter a valid email.'); else hide('c-email-error');
  if (!valid) return;

  const btn = document.getElementById('c-submit');
  btn.disabled = true; btn.classList.add('loading');
  document.getElementById('c-form-error').classList.remove('visible');

  const payload = {
    token: clientToken, clientId: clientData.clientId,
    updates: [
      { field: 'Client Name',            current: clientData.name     || '', proposed: name },
      { field: 'Phone Number',           current: clientData.phone    || '', proposed: phone },
      { field: 'Email Address',          current: clientData.email    || '', proposed: email },
      { field: 'Address',                current: clientData.address  || '', proposed: document.getElementById('c-address').value.trim() },
      { field: 'Additional Owner Name',  current: clientData.addName  || '', proposed: document.getElementById('c-add-name').value.trim() },
      { field: 'Additional Owner Phone', current: clientData.addPhone || '', proposed: document.getElementById('c-add-phone').value.trim() },
      { field: 'Additional Owner Email', current: clientData.addEmail || '', proposed: document.getElementById('c-add-email').value.trim() },
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
window.submitEmergency = async function() {
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
window.submitDoc = async function() {
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
    lbl.htmlFor = 'bp-' + i; lbl.textContent = pet.name + (pet.active ? '' : ' (inactive)');
    container.appendChild(inp); container.appendChild(lbl);
    // Auto-select only when there's a single ACTIVE pet
    if (clientData.pets.length === 1 && pet.active) inp.checked = true;
  });
}

window.submitBooking = async function() {
  let valid = true;
  const service     = document.querySelector('input[name="booking-service"]:checked')?.value || 'boarding';
  const frequency   = document.querySelector('input[name="booking-frequency"]:checked')?.value || 'one-time';
  const isDaycare     = service === 'daycare';
  const isHalfDaycare = service === 'half-daycare';
  const isSingleDay   = isDaycare || isHalfDaycare;
  const isRecurring   = isSingleDay && frequency === 'recurring';
  const halfDayPref   = document.querySelector('input[name="halfday-pref"]:checked')?.value || 'AM';
  const selectedPets  = Array.from(document.querySelectorAll('input[name="booking-pet"]:checked')).map(el => el.value);
  const transport     = document.querySelector('input[name="booking-transport"]:checked')?.value;
  const notes         = document.getElementById('booking-notes').value.trim();

  const REQUIRED_DOCS = ['Rabies Certificate', 'Town License', 'Vaccination Record'];

  // Inactive pet → can't request a normal stay; route to a trial conversation instead.
  const inactiveSelected = (clientData.pets || []).filter(p => selectedPets.includes(p.id) && !p.active);
  if (inactiveSelected.length > 0) {
    const names = inactiveSelected.map(p => p.name).join(', ');
    document.getElementById('booking-form-error').innerHTML =
      names + (inactiveSelected.length === 1 ? ' hasn\'t' : ' haven\'t') + ' stayed with us in a while, so we\'d love to set up a quick trial daycare before booking again. ' +
      '<a href="#" onclick="openMessage({ topic: \'pet\', petId: \'' + inactiveSelected[0].id + '\', prefillBody: \'I would like to set up a trial daycare for ' + names.replace(/'/g, "\\'") + ' — it has been a while since their last stay.\' }); return false;" style="color:var(--green);font-weight:600;">Set up a trial</a>';
    document.getElementById('booking-form-error').classList.add('visible');
    return;
  }

  const blockedPets   = (clientData.pets || []).filter(pet => {
    if (!pet.active) return false;
    return REQUIRED_DOCS.some(type => !(pet.docs || []).some(d => d.type === type && !d.expired));
  });
  if (blockedPets.length > 0) {
    document.getElementById('booking-form-error').textContent = 'Please update expired or missing documents for ' + blockedPets.map(p => p.name).join(', ') + ' before requesting a stay.';
    document.getElementById('booking-form-error').classList.add('visible');
    return;
  }

  const showErr = (id, msg) => { const el = document.getElementById(id); if (el) { el.textContent = msg; el.classList.add('visible'); } valid = false; };
  const hideErr = id => document.getElementById(id)?.classList.remove('visible');

  const btn = document.getElementById('booking-submit');

  // ── Recurring path ────────────────────────────────────────────────────────
  if (isRecurring) {
    const recurringDays = Array.from(document.querySelectorAll('input[name="recurring-day"]:checked')).map(el => el.value);

    if (!selectedPets.length) { showErr('booking-pet-error', 'Please select at least one pet.'); valid = false; } else hideErr('booking-pet-error');
    if (!recurringDays.length) { showErr('booking-days-error', 'Please select at least one day.'); valid = false; } else hideErr('booking-days-error');
    if (!transport) { showErr('booking-transport-error', 'Please select a transport option.'); valid = false; } else hideErr('booking-transport-error');
    if (!valid) return;

    // Booking protection — ongoing service, so warn (never hard-block) on docs expiring soon
    const recCoverage = checkDocCoverage(selectedPets, null);
    if (recCoverage.warn.length > 0) {
      const proceed = await showCoverageWarning(recCoverage.warn);
      if (!proceed) { goToStep('docs'); return; }
    }

    btn.disabled = true; btn.classList.add('loading');
    document.getElementById('booking-form-error').classList.remove('visible');

    try {
      const res = await fetch(WORKER_URL + '/recurring-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: clientToken, clientId: clientData.clientId,
          petIds: selectedPets,
          serviceType: service,
          halfDayPreference: isHalfDaycare ? halfDayPref : undefined,
          days: recurringDays,
          transport, notes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Server error');

      const petNames = selectedPets.map(id => clientData.pets.find(p => p.id === id)?.name || id);
      const svcLabel = isHalfDaycare ? 'Half-Daycare' : 'Daycare';

      document.getElementById('booking-success-msg').textContent =
        'Your recurring ' + svcLabel.toLowerCase() + ' request has been received. We\'ll confirm your schedule within 24 hours.';
      document.getElementById('booking-summary').innerHTML =
        '<strong>' + svcIcon('recurring') + ' Recurring ' + svcLabel + '</strong><br>' +
        '<strong>' + petNames.join(', ') + '</strong><br>' +
        '<svg class="ic" style="width:13px;height:13px;vertical-align:-0.1em;"><use href="#i-cal"/></svg> Every ' + recurringDays.join(', ') + '<br>' +
        (isHalfDaycare ? svcIcon('HD') + ' ' + (halfDayPref === 'PM' ? 'Afternoon' : 'Morning') + ' preference<br>' : '') +
        '<svg class="ic" style="width:13px;height:13px;vertical-align:-0.1em;"><use href="#i-car"/></svg> Transport: ' + transport + '<br><br>' +
        '<span style="font-size:0.78rem;color:var(--brand-stone);">Weekly · We\'ll activate your schedule once confirmed.</span>';

      fetch(WORKER_URL + '/client?token=' + encodeURIComponent(clientToken)).then(r => r.ok ? r.json() : null).then(d => { if (d) clientData = d; }).catch(() => {});
      showView('view-booking-success');
    } catch (err) {
      document.getElementById('booking-form-error').textContent = 'Something went wrong: ' + err.message;
      document.getElementById('booking-form-error').classList.add('visible');
      btn.disabled = false; btn.classList.remove('loading');
    }
    return;
  }

  // ── One-time path ─────────────────────────────────────────────────────────
  const startDate = isSingleDay
    ? document.getElementById('booking-single-date').value
    : document.getElementById('booking-start-date').value;
  const startTime = document.getElementById('booking-start-time').value;
  const endDate   = document.getElementById('booking-end-date').value;
  const endTime   = document.getElementById('booking-end-time').value;

  if (!selectedPets.length) showErr('booking-pet-error', 'Please select at least one pet.'); else hideErr('booking-pet-error');
  if (!startDate) showErr(isSingleDay ? 'booking-single-date-error' : 'booking-start-date-error', 'Please select a date.'); else { hideErr('booking-start-date-error'); hideErr('booking-single-date-error'); }
  if (!isSingleDay && !startTime) showErr('booking-start-time-error', 'Please select a start time.'); else hideErr('booking-start-time-error');
  if (!isSingleDay && !endDate)   showErr('booking-end-date-error',   'Please select an end date.');  else hideErr('booking-end-date-error');
  if (!isSingleDay && !endTime)   showErr('booking-end-time-error',   'Please select an end time.');  else hideErr('booking-end-time-error');
  if (!transport) showErr('booking-transport-error', 'Please select a transport option.'); else hideErr('booking-transport-error');
  if (!isSingleDay && startDate && endDate && endDate < startDate) showErr('booking-end-date-error', 'End date must be after start date.');
  if (!valid) return;

  // ── Booking protection (Option B) — doc coverage through the stay ──
  const coverageEndDate = isSingleDay ? startDate : endDate;
  const coverage = checkDocCoverage(selectedPets, coverageEndDate);
  if (coverage.block.length > 0) {
    const items = coverage.block.map(b => b.pet + "'s " + b.type.toLowerCase() + ' (expires ' + fmtDate(b.expiry) + ')').join('; ');
    document.getElementById('booking-form-error').innerHTML =
      'A required document expires on or before this stay ends, so the dog would be uncovered: ' + items +
      '. Please upload a current copy before requesting these dates.';
    document.getElementById('booking-form-error').classList.add('visible');
    return;
  }
  if (coverage.warn.length > 0) {
    const proceed = await showCoverageWarning(coverage.warn);
    if (!proceed) { goToStep('docs'); return; }
  }

  btn.disabled = true; btn.classList.add('loading');
  document.getElementById('booking-form-error').classList.remove('visible');

  try {
    const res = await fetch(WORKER_URL + '/booking', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: clientToken, clientId: clientData.clientId,
        petIds: selectedPets, serviceType: service,
        halfDayPreference: isHalfDaycare ? halfDayPref : undefined,
        startDate, startTime, endDate, endTime, transport, notes,
      }),
    });

    const bookingData = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(bookingData.error || ('HTTP ' + res.status));

    const petNames = selectedPets.map(id => clientData.pets.find(p => p.id === id)?.name || id);
    lastBooking    = { startDate, startTime, endDate, endTime, transport, pets: petNames };

    const summary = document.getElementById('booking-summary');
    if (summary) {
      const numPets = selectedPets.length;
      let estimateLines = [], estimateTotal = 0;

      if (isSingleDay) {
        const rate    = isHalfDaycare ? (clientData.halfDaycarePrice || 40) : (clientData.daycarePrice || 65);
        const session = rate * numPets;
        estimateTotal += session;
        estimateLines.push(
          isHalfDaycare
            ? `Half-Daycare (${halfDayPref === 'PM' ? 'Afternoon' : 'Morning'}): $${rate}/session`
            : numPets > 1 ? `Daycare: $${rate} x ${numPets} dogs = $${session}` : `Daycare: $${rate}/session`
        );
      } else {
        const rate   = clientData.boardingPrice || 85;
        const nights = Math.max(1, Math.round((new Date(endDate) - new Date(startDate)) / 86400000));
        const dog1   = rate * nights;
        estimateTotal += dog1;
        estimateLines.push(`Dog 1: $${rate} x ${nights} night${nights > 1 ? 's' : ''} = $${dog1}`);
        if (numPets > 1) {
          const dog2Rate  = Math.max(0, rate - 15);
          const dog2Total = dog2Rate * nights * (numPets - 1);
          estimateTotal  += dog2Total;
          estimateLines.push(`Dog 2: $${dog2Rate} x ${nights} night${nights > 1 ? 's' : ''} = $${dog2Total}`);
        }
      }

      if (transport && transport !== 'None') {
        const tripMulti = transport === 'Round Trip' ? 2 : 1;
        const dog1Fee   = 5 * tripMulti;
        const dog2Fee   = numPets > 1 ? (5 * 0.5) * tripMulti * (numPets - 1) : 0;
        estimateTotal  += dog1Fee + dog2Fee;
        let tLine = `Transport (${transport}): $${dog1Fee}`;
        if (dog2Fee > 0) tLine += ` + $${dog2Fee} (2nd dog)`;
        estimateLines.push(tLine);
      }

      const pricingNote = [...estimateLines, '', `Est. Total: ~$${estimateTotal}`, '*Peak season or multi-week discounts may apply. Final price confirmed within 24hrs.'].join('\n');
      const serviceIconHtml = isHalfDaycare ? svcIcon('HD') : isDaycare ? svcIcon('DC') : svcIcon('B');
      const serviceLabel = isHalfDaycare ? 'Half-Daycare' : isDaycare ? 'Daycare' : 'Boarding';
      const dateLines    = isSingleDay
        ? '<svg class="ic" style="width:13px;height:13px;vertical-align:-0.1em;"><use href="#i-cal"/></svg> Date: ' + fmtDate(startDate) + '<br>'
        : '<svg class="ic" style="width:13px;height:13px;vertical-align:-0.1em;"><use href="#i-cal"/></svg> Start: ' + fmtDate(startDate) + (startTime ? ' · ' + startTime : '') + '<br>' +
          '<svg class="ic" style="width:13px;height:13px;vertical-align:-0.1em;"><use href="#i-cal"/></svg> End: '   + fmtDate(endDate)   + (endTime   ? ' · ' + endTime   : '') + '<br>';

      summary.innerHTML =
        '<strong>' + serviceIconHtml + ' ' + petNames.join(', ') + '</strong><br>' +
        '<strong>' + serviceLabel + '</strong><br>' +
        dateLines + '<svg class="ic" style="width:13px;height:13px;vertical-align:-0.1em;"><use href="#i-car"/></svg> Transport: ' + transport + '<br><br>' +
        '<pre style="font-family:var(--font-body);font-size:0.78rem;color:var(--brand-bark);white-space:pre-wrap;margin:0;">' + pricingNote + '</pre>';
    }

    fetch(WORKER_URL + '/client?token=' + encodeURIComponent(clientToken)).then(r => r.ok ? r.json() : null).then(d => { if (d) clientData = d; }).catch(() => {});

    document.getElementById('booking-success-msg').textContent =
      isHalfDaycare
        ? 'Your half-daycare request is on the waitlist. We\'ll confirm once we pair your session with the other half of the day.'
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

window.bookAnother = function() {
  // Reset service to boarding
  document.querySelectorAll('input[name="booking-service"]').forEach(el => { el.checked = el.value === 'boarding'; });
  // Reset frequency to one-time
  document.querySelectorAll('input[name="booking-frequency"]').forEach(el => { el.checked = el.value === 'one-time'; });
  // Reset pets
  document.querySelectorAll('input[name="booking-pet"]').forEach(el => { el.checked = clientData.pets?.length === 1; });
  // Reset dates/times
  ['booking-start-date', 'booking-start-time', 'booking-end-date', 'booking-end-time', 'booking-single-date'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  // Reset half-day pref
  document.querySelectorAll('input[name="halfday-pref"]').forEach(el => { el.checked = el.value === 'AM'; });
  // Reset recurring days
  document.querySelectorAll('input[name="recurring-day"]').forEach(el => el.checked = false);
  // Reset transport
  document.querySelectorAll('input[name="booking-transport"]').forEach(el => el.checked = false);
  // Reset notes
  document.getElementById('booking-notes').value = '';
  // Reset errors
  document.getElementById('booking-form-error').classList.remove('visible');
  // Reset button
  const btn = document.getElementById('booking-submit');
  btn.disabled = false; btn.classList.remove('loading');
  // Reset layout
  updateBookingFormLayout();
  showView('view-booking');
};

// ── Booking helper ────────────────────────────────────────────────────────────
// Opens the booking flow with an optional service pre-selected.
function openBooking(service) {
  if (service) {
    document.querySelectorAll('input[name="booking-service"]').forEach(el => {
      el.checked = el.value === service;
    });
  }
  goToStep('booking');
}
window.openBooking = openBooking;

// ── Message Us ──────────────────────────────────────────────────────────────
// Topics split into two kinds:
//   - REDIRECT topics (trial, availability) funnel into the booking flow — no
//     free-text, because these belong in the structured request flow.
//   - FREE-TEXT topics (pet, stay, billing, other) open the message box, since
//     they have no structured home and genuinely need a written note.
const MSG_REDIRECTS = {
  trial: {
    service: 'daycare',
    text: 'New dogs start with a trial daycare so we can make sure everyone is a good fit. Request a daycare visit below and we will confirm within 24 hours. If a date does not work, we will suggest one that does.',
    btnLabel: 'Request a daycare visit',
  },
  availability: {
    service: 'daycare',
    text: 'The fastest way to check availability is to send a request for the dates you want. We confirm or suggest an alternative within 24 hours. Pick your service and dates below.',
    btnLabel: 'Request a service',
  },
};

// Topic-aware quick-fill chips. Each pre-fills the message box (it does NOT send).
const MSG_CHIPS = {
  pet: [
    { label: 'New medication', text: 'I want to update you on a new medication: ' },
    { label: 'Vet / contact change', text: 'My vet or emergency contact info has changed: ' },
    { label: 'Behavior or diet update', text: 'A quick update on behavior/diet: ' },
  ],
  stay: [
    { label: 'Question about my dates', text: 'I have a question about my upcoming stay: ' },
    { label: 'Feeding / meds during stay', text: 'For my upcoming stay, here are the feeding/medication instructions: ' },
    { label: 'Pickup / drop-off timing', text: 'A note about pickup/drop-off timing for my stay: ' },
  ],
  billing: [
    { label: 'Invoice question', text: 'I have a question about an invoice: ' },
    { label: 'Document question', text: 'I have a question about my documents: ' },
  ],
  other: [],
};

const MSG_PET_TOPICS = ['pet', 'stay']; // topics where the pet selector is useful

// Opens the in-portal message form. Optional opts: { topic, petId, prefillBody }
function openMessage(opts = {}) {
  const topicSel = document.getElementById('msg-topic');
  const petSel   = document.getElementById('msg-pet');
  const bodyEl   = document.getElementById('msg-body');
  const errEl    = document.getElementById('msg-body-error');
  const btn      = document.getElementById('msg-submit');

  if (bodyEl) bodyEl.value = opts.prefillBody || '';
  if (errEl)  errEl.classList.remove('visible');
  if (btn)  { btn.disabled = false; btn.classList.remove('loading'); }

  // Populate pet dropdown from the client's pets
  if (petSel) {
    petSel.innerHTML = '<option value="">— No specific pet —</option>';
    (clientData?.pets || []).forEach(pet => {
      const o = document.createElement('option');
      o.value = pet.id;
      o.textContent = pet.name + (pet.active ? '' : ' (inactive)');
      petSel.appendChild(o);
    });
    petSel.value = opts.petId || '';
  }

  if (topicSel) {
    topicSel.value = opts.topic || 'trial';
    topicSel.onchange = () => renderMessageTopic(topicSel.value);
  }
  renderMessageTopic(opts.topic || 'trial', opts);

  showView('view-message');
}
window.openMessage = openMessage;

// Switches the form between redirect mode and free-text mode based on topic.
function renderMessageTopic(topic, opts = {}) {
  const redirectPanel = document.getElementById('msg-redirect');
  const freetextPanel = document.getElementById('msg-freetext');
  const petRow        = document.getElementById('msg-pet-row');
  const chipsWrap     = document.getElementById('msg-chips');
  const redirect      = MSG_REDIRECTS[topic];

  if (redirect) {
    // Redirect mode: explain + button into booking flow. No message box.
    if (redirectPanel) redirectPanel.style.display = 'block';
    if (freetextPanel) freetextPanel.style.display = 'none';
    document.getElementById('msg-redirect-text').textContent = redirect.text;
    document.getElementById('msg-redirect-btn-label').textContent = redirect.btnLabel;
    document.getElementById('msg-redirect-btn').onclick = () => openBooking(redirect.service);
    return;
  }

  // Free-text mode
  if (redirectPanel) redirectPanel.style.display = 'none';
  if (freetextPanel) freetextPanel.style.display = 'block';
  if (petRow) petRow.style.display = MSG_PET_TOPICS.includes(topic) ? '' : 'none';

  // Build quick-fill chips for this topic
  if (chipsWrap) {
    const chips = MSG_CHIPS[topic] || [];
    chipsWrap.innerHTML = '';
    chipsWrap.style.display = chips.length ? 'flex' : 'none';
    chips.forEach(chip => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'msg-chip';
      el.textContent = chip.label;
      el.onclick = () => {
        const bodyEl = document.getElementById('msg-body');
        if (bodyEl) { bodyEl.value = chip.text; bodyEl.focus(); }
        chipsWrap.querySelectorAll('.msg-chip').forEach(c => c.classList.remove('active'));
        el.classList.add('active');
      };
      chipsWrap.appendChild(el);
    });
  }
}

window.submitMessage = async function() {
  const topic   = document.getElementById('msg-topic')?.value || 'other';
  const petId   = document.getElementById('msg-pet')?.value || '';
  const bodyEl  = document.getElementById('msg-body');
  const errEl   = document.getElementById('msg-body-error');
  const btn     = document.getElementById('msg-submit');
  const message = (bodyEl?.value || '').trim();

  if (!message) {
    if (errEl) { errEl.textContent = 'Please enter a message.'; errEl.classList.add('visible'); }
    bodyEl?.focus();
    return;
  }
  if (errEl) errEl.classList.remove('visible');

  if (btn) { btn.disabled = true; btn.classList.add('loading'); }
  try {
    const res = await fetch(WORKER_URL + '/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: clientToken,
        clientId: clientData?.clientId,
        topic,
        petId: petId || undefined,
        message,
      }),
    });
    if (!res.ok) throw new Error('Request failed');
    showView('view-message-success');
  } catch (e) {
    if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
    if (errEl) { errEl.textContent = 'Something went wrong sending your message. Please try again, or text us.'; errEl.classList.add('visible'); }
  }
};

init();