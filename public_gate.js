/* ============================================================
   SB Parcel Explorer — Public Gate
   Manages Tier 1 / Tier 2 access, email capture, and
   submission to Google Apps Script → Google Sheets.

   Tier 1 (no email): Units + Buildable Area visible.
                      Pro Forma locked with "Contact BAP."
                      State Law + everything below blurred/gated.
   Tier 2 (email entered): All sections unlocked except Pro Forma.
   ============================================================ */

(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────
  // Replace this URL after deploying the Google Apps Script web app.
  var APPS_SCRIPT_URL = 'YOUR_APPS_SCRIPT_URL_HERE';

  var STORAGE_KEY     = 'bap_public_unlocked';
  var EMAIL_KEY       = 'bap_public_email';

  // ── State ─────────────────────────────────────────────────
  var isUnlocked      = false;
  var capturedEmail   = '';
  var currentAPN      = '';

  // ── Init ──────────────────────────────────────────────────
  function init() {
    // Check localStorage for prior unlock
    var stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'true') {
      capturedEmail = localStorage.getItem(EMAIL_KEY) || '';
      unlock(false); // silent — no re-submission
      return;
    }

    // Wire email gate form
    var form   = document.getElementById('gateEmailForm');
    var submit = document.getElementById('gateEmailSubmit');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var input = document.getElementById('gateEmailInput');
        var email = (input ? input.value : '').trim();
        if (!email || !email.includes('@')) return;
        capturedEmail = email;
        submitEmail(email, currentAPN, 'unlock');
        unlock(true);
      });
    }

    // Wire PDF button override
    overridePDFButton();

    // Listen for parcel selection to capture current APN
    document.addEventListener('sb:parcel:selected', function (e) {
      currentAPN = (e.detail && e.detail.apn) ? e.detail.apn : '';
    });
  }

  // ── Unlock Tier 2 ─────────────────────────────────────────
  function unlock(persist) {
    isUnlocked = true;
    if (persist) {
      localStorage.setItem(STORAGE_KEY, 'true');
      localStorage.setItem(EMAIL_KEY, capturedEmail);
    }

    // Hide the email gate overlay
    var overlay = document.getElementById('gateEmailOverlay');
    if (overlay) {
      overlay.style.opacity = '0';
      overlay.style.pointerEvents = 'none';
      setTimeout(function () { overlay.style.display = 'none'; }, 400);
    }

    // Remove blur from gated section
    var section = document.getElementById('gateEmailSection');
    if (section) section.classList.add('gate-unlocked');
  }

  // ── PDF button override ───────────────────────────────────
  function overridePDFButton() {
    // Re-wire every time the parcel header is rebuilt (UIWiring re-renders)
    var observer = new MutationObserver(function () {
      var pdfBtn = document.getElementById('pdfExportBtn');
      if (pdfBtn && !pdfBtn.dataset.gated) {
        pdfBtn.dataset.gated = 'true';
        pdfBtn.addEventListener('click', handlePDFClick, true); // capture phase
      }
    });
    var actionsEl = document.querySelector('.detail-actions');
    if (actionsEl) observer.observe(actionsEl, { childList: true, subtree: true });
  }

  function handlePDFClick(e) {
    // If already have email, let native PDF export run
    if (capturedEmail) {
      submitEmail(capturedEmail, currentAPN, 'pdf');
      return; // allow propagation to pdfexport.js
    }

    // Otherwise intercept and show email modal
    e.stopImmediatePropagation();
    showPDFEmailModal();
  }

  function showPDFEmailModal() {
    var modal = document.getElementById('pdfEmailModal');
    if (modal) { modal.style.display = 'flex'; return; }

    // Build modal
    modal = document.createElement('div');
    modal.id = 'pdfEmailModal';
    modal.className = 'pdf-gate-modal-backdrop';
    modal.innerHTML = [
      '<div class="pdf-gate-modal">',
      '  <button class="pdf-gate-close" id="pdfGateClose">✕</button>',
      '  <div class="gate-icon">📄</div>',
      '  <div class="gate-title">Get Your PDF Report</div>',
      '  <div class="gate-body">Enter your email and BAP will send you a PDF analysis of this parcel.</div>',
      '  <form class="gate-form" id="pdfGateForm" onsubmit="return false">',
      '    <input type="email" class="gate-input" id="pdfGateEmail" placeholder="your@email.com" required />',
      '    <button type="submit" class="gate-btn" id="pdfGateSubmit">Send Me the PDF</button>',
      '  </form>',
      '  <div class="gate-fine">BAP will email your report within one business day.</div>',
      '</div>',
    ].join('');
    document.body.appendChild(modal);

    document.getElementById('pdfGateClose').addEventListener('click', function () {
      modal.style.display = 'none';
    });
    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.style.display = 'none';
    });

    document.getElementById('pdfGateForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var email = document.getElementById('pdfGateEmail').value.trim();
      if (!email) return;
      capturedEmail = email;
      localStorage.setItem(EMAIL_KEY, email);
      submitEmail(email, currentAPN, 'pdf_request');
      // Show confirmation
      modal.querySelector('.pdf-gate-modal').innerHTML = [
        '<div class="gate-icon">✅</div>',
        '<div class="gate-title">Request Received</div>',
        '<div class="gate-body">BAP will email your PDF report to <strong>' + escHtml(email) + '</strong> shortly.</div>',
        '<button class="gate-btn" onclick="document.getElementById(\'pdfEmailModal\').style.display=\'none\'">Close</button>',
      ].join('');
      // Also unlock Tier 2 since they gave us their email
      if (!isUnlocked) { unlock(true); }
    });
  }

  // ── Submit email to Apps Script ───────────────────────────
  function submitEmail(email, apn, source) {
    if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL === 'YOUR_APPS_SCRIPT_URL_HERE') {
      console.warn('[BAPGate] Apps Script URL not configured. Email not submitted.');
      return;
    }
    var payload = {
      email:     email,
      apn:       apn || '',
      source:    source || 'unlock',
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
    };
    // Use no-cors fetch — Apps Script handles CORS via GET params for simple submits
    var url = APPS_SCRIPT_URL
      + '?email='     + encodeURIComponent(email)
      + '&apn='       + encodeURIComponent(apn || '')
      + '&source='    + encodeURIComponent(source || 'unlock')
      + '&timestamp=' + encodeURIComponent(new Date().toISOString());
    fetch(url, { method: 'GET', mode: 'no-cors' }).catch(function (err) {
      console.warn('[BAPGate] Email submit failed:', err);
    });
  }

  // ── Dispatch APN event hook ───────────────────────────────
  // Patch selectParcel in app.js via event — app.js fires this after selection
  var _origSelectParcel = window.selectParcel;
  if (typeof _origSelectParcel === 'function') {
    window.selectParcel = function (feature, leafletLayer) {
      var apn = feature && feature.properties
        ? (feature.properties.apn || feature.properties.apn9Digit || '')
        : '';
      currentAPN = apn;
      return _origSelectParcel.apply(this, arguments);
    };
  }
  // Also listen for currentParcelData updates (set in app.js loadAdjacentData)
  Object.defineProperty(window, 'currentParcelData', {
    set: function (val) {
      this._currentParcelData = val;
      if (val && val.apn) currentAPN = val.apn;
    },
    get: function () { return this._currentParcelData; },
    configurable: true,
  });

  // ── Helpers ───────────────────────────────────────────────
  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Boot ─────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
