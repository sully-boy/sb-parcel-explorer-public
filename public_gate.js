/* ============================================================
   SB Parcel Explorer — Public Gate v2
   Tier 1: Units + Buildable Area visible.
   Tier 2 (email): State Law unlocked.
   PDF button: always shows "Contact BAP" modal.
   Email capture → Google Apps Script → Google Sheets.
   BAP gets email notification on every unlock.
   ============================================================ */

(function () {
  'use strict';

  var APPS_SCRIPT_URL = 'YOUR_APPS_SCRIPT_URL_HERE';
  var STORAGE_KEY     = 'bap_public_unlocked';
  var EMAIL_KEY       = 'bap_public_email';

  var isUnlocked  = false;
  var userEmail   = '';
  var currentAPN  = '';

  // ── Init ──────────────────────────────────────────────────
  function init() {
    // Restore prior unlock
    if (localStorage.getItem(STORAGE_KEY) === 'true') {
      userEmail  = localStorage.getItem(EMAIL_KEY) || '';
      isUnlocked = true;
      unlock(false);
    }

    // Wire email gate form
    var form = document.getElementById('gateEmailForm');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var input = document.getElementById('gateEmailInput');
        var email = (input ? input.value : '').trim();
        if (!email || !email.includes('@')) return;
        userEmail = email;
        submitEmail(email, currentAPN, 'state_law_unlock');
        notifyBAP(email, currentAPN, 'State Law unlock');
        unlock(true);
      });
    }

    // Wire PDF button via MutationObserver (button is rebuilt on each parcel click)
    observePDFButton();

    // Wire PDF gate modal close
    document.addEventListener('click', function (e) {
      if (e.target.id === 'pdfGateClose' || e.target.id === 'pdfGateModal') {
        document.getElementById('pdfGateModal').style.display = 'none';
      }
    });

    // Track current APN via currentParcelData setter
    try {
      Object.defineProperty(window, 'currentParcelData', {
        set: function (val) { this._cpd = val; if (val?.apn) currentAPN = val.apn; },
        get: function () { return this._cpd; },
        configurable: true,
      });
    } catch(e) {}
  }

  // ── Observe PDF button ────────────────────────────────────
  function observePDFButton() {
    function wirePDF() {
      var btn = document.getElementById('pdfExportBtn');
      if (btn && !btn.dataset.gated) {
        btn.dataset.gated = 'true';
        // Use capture phase so we fire before uiwiring.js bubbling handler
        btn.addEventListener('click', function (e) {
          e.stopImmediatePropagation();
          e.preventDefault();
          showPDFModal();
        }, true);
      }
    }
    wirePDF();
    // Watch the whole document for the button being re-created on each parcel click
    new MutationObserver(function(mutations) {
      mutations.forEach(function(m) {
        m.addedNodes.forEach(function(n) {
          if (n.nodeType === 1) {
            // Check if the added node IS the button or contains it
            if (n.id === 'pdfExportBtn') { n.dataset.gated = ''; wirePDF(); }
            var inner = n.querySelector && n.querySelector('#pdfExportBtn');
            if (inner) { inner.dataset.gated = ''; wirePDF(); }
          }
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  function showPDFModal() {
    var modal = document.getElementById('pdfGateModal');
    if (modal) modal.style.display = 'flex';
  }

  // ── Unlock Tier 2 ─────────────────────────────────────────
  function unlock(persist) {
    isUnlocked = true;
    if (persist) {
      localStorage.setItem(STORAGE_KEY, 'true');
      localStorage.setItem(EMAIL_KEY, userEmail);
    }
    var overlay = document.getElementById('gateEmailOverlay');
    if (overlay) {
      overlay.style.transition = 'opacity 0.4s';
      overlay.style.opacity = '0';
      overlay.style.pointerEvents = 'none';
      setTimeout(function () { overlay.style.display = 'none'; }, 400);
    }
    var section = document.getElementById('gateEmailSection');
    if (section) section.classList.add('gate-unlocked');
  }

  // ── Submit email to Apps Script (GET, no-cors) ────────────
  function submitEmail(email, apn, source) {
    if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL === 'YOUR_APPS_SCRIPT_URL_HERE') {
      console.warn('[BAPGate] Apps Script URL not set.');
      return;
    }
    var url = APPS_SCRIPT_URL
      + '?email='     + encodeURIComponent(email)
      + '&apn='       + encodeURIComponent(apn || '')
      + '&source='    + encodeURIComponent(source || 'unlock')
      + '&timestamp=' + encodeURIComponent(new Date().toISOString());
    fetch(url, { method: 'GET', mode: 'no-cors' }).catch(function (e) {
      console.warn('[BAPGate] submit failed:', e);
    });
  }

  // ── Notify BAP via EmailJS ───────────────────────────────
  // EmailJS config — fill these in after creating your EmailJS account:
  //   1. Sign up at https://www.emailjs.com (free tier: 200 emails/month)
  //   2. Add email service (Gmail recommended) → copy Service ID
  //   3. Create a template with variables {{user_email}}, {{apn}}, {{source}}, {{timestamp}}
  //      → copy Template ID
  //   4. Copy your Public Key from Account → API Keys
  var EMAILJS_SERVICE_ID  = 'YOUR_SERVICE_ID';
  var EMAILJS_TEMPLATE_ID = 'YOUR_TEMPLATE_ID';
  var EMAILJS_PUBLIC_KEY  = 'YOUR_PUBLIC_KEY';

  function notifyBAP(email, apn, source) {
    // Skip if not configured
    if (EMAILJS_PUBLIC_KEY === 'YOUR_PUBLIC_KEY') {
      console.log('[BAPGate] EmailJS not configured. Would have sent:', { email, apn, source });
      return;
    }
    // Load EmailJS SDK if not already loaded
    function sendEmail() {
      emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        to_email:   'bap@sb-designgroup.com',
        user_email: email,
        apn:        apn || 'unknown',
        source:     source || 'unlock',
        timestamp:  new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }),
      }, EMAILJS_PUBLIC_KEY).catch(function(e) {
        console.warn('[BAPGate] EmailJS send failed:', e);
      });
    }
    if (window.emailjs) {
      sendEmail();
    } else {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
      s.onload = function() {
        emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
        sendEmail();
      };
      document.head.appendChild(s);
    }
  }

  // ── Boot ──────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
