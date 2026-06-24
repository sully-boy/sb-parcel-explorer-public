/* ============================================================
   Santa Barbara Parcel Explorer — UI Wiring Module
   Connects: Watchlist, Comparison Bar, Parcel Header Buttons,
             Modal System, Transit Badge
   ============================================================ */

'use strict';

(function () {

  /* ── Constants ──────────────────────────────────────────────── */
  const WATCHLIST_KEY  = 'sb_watchlist';
  const WATCHLIST_MAX  = 20;

  /* Inject modal + misc styles that live in JS to keep them
     co-located with the logic they support.                    */
  const MODAL_STYLES = `
    /* ── Modal Overlay ───────────────────────────────────────── */
    .uw-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.50);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.18s ease;
    }
    .uw-modal-overlay.open {
      opacity: 1;
      pointer-events: all;
    }
    .uw-modal-panel {
      background: var(--color-surface-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      width: 100%;
      max-width: 900px;
      max-height: 85vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      transform: translateY(8px) scale(0.98);
      transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .uw-modal-overlay.open .uw-modal-panel {
      transform: translateY(0) scale(1);
    }
    .uw-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px 12px;
      border-bottom: 1px solid var(--color-border);
      position: sticky;
      top: 0;
      background: var(--color-surface-2);
      z-index: 1;
      flex-shrink: 0;
    }
    .uw-modal-title {
      font-size: var(--text-sm);
      font-weight: 700;
      color: var(--color-text);
    }
    .uw-modal-close {
      width: 30px;
      height: 30px;
      border-radius: var(--radius-md);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-muted);
      cursor: pointer;
      background: none;
      border: none;
      font-size: 18px;
      line-height: 1;
      transition: color var(--tr), background var(--tr);
    }
    .uw-modal-close:hover {
      color: var(--color-text);
      background: var(--color-surface-offset);
    }
    .uw-modal-body {
      padding: 16px 20px 20px;
      overflow-y: auto;
    }

    /* ── Watchlist panel section ─────────────────────────────── */
    .watchlist-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
  `;

  /* ── localStorage helpers ────────────────────────────────────── */

  /**
   * Safe read from localStorage — returns parsed value or fallback.
   */
  // In-memory store (replaces localStorage for iframe compatibility)
  const _memStore = {};
  function lsGet(key, fallback) {
    return key in _memStore ? _memStore[key] : fallback;
  }
  function lsSet(key, value) {
    _memStore[key] = value;
    return true;
  }


  /* ══════════════════════════════════════════════════════════════
     WATCHLIST
     ══════════════════════════════════════════════════════════════ */

  const Watchlist = {

    /**
     * Return the full watchlist array.
     */
    getWatchlist() {
      return lsGet(WATCHLIST_KEY, []);
    },

    /**
     * Check whether an APN is currently saved.
     * @param {string} apn
     * @returns {boolean}
     */
    isWatched(apn) {
      return this.getWatchlist().some(p => p.apn === apn);
    },

    /**
     * Add or remove a parcel from the watchlist.
     * Accepts a parcelData object with at minimum: apn, address, score (optional).
     * Capped at WATCHLIST_MAX items — oldest entry dropped on overflow.
     * @param {object} parcelData  { apn, address, score, lat, lng }
     * @returns {boolean}  true = added, false = removed
     */
    toggleWatchlist(parcelData) {
      if (!parcelData || !parcelData.apn) return false;

      let list = this.getWatchlist();
      const idx = list.findIndex(p => p.apn === parcelData.apn);

      if (idx !== -1) {
        // Remove
        list.splice(idx, 1);
        lsSet(WATCHLIST_KEY, list);
        return false;
      } else {
        // Add — enforce cap by removing oldest first
        if (list.length >= WATCHLIST_MAX) {
          list = list.slice(list.length - WATCHLIST_MAX + 1);
        }
        list.push({
          apn:     parcelData.apn,
          address: parcelData.address || '',
          score:   parcelData.score   ?? null,
          lat:     parcelData.lat     ?? null,
          lng:     parcelData.lng     ?? null,
          savedAt: Date.now(),
        });
        lsSet(WATCHLIST_KEY, list);
        return true;
      }
    },

    /**
     * Build and return the HTML string for the watchlist panel body.
     * Includes click-to-select and remove button for each item.
     */
    renderWatchlistPanel() {
      const list = this.getWatchlist();

      if (list.length === 0) {
        return `<div class="watchlist-empty">No saved parcels yet.</div>`;
      }

      const items = list.slice().reverse().map(item => {
        const score = item.score !== null && item.score !== undefined
          ? Number(item.score)
          : null;
        const scoreClass = score === null
          ? ''
          : score >= 70 ? 'score-high'
          : score >= 40 ? 'score-mid'
          : 'score-low';
        const scorePill = score !== null
          ? `<span class="watchlist-item-score ${scoreClass}">${score}</span>`
          : '';
        const safeAddr = _escHtml(item.address || item.apn);
        const safeApn  = _escHtml(item.apn);

        return `
          <div class="watchlist-item" data-apn="${safeApn}" role="button" tabindex="0"
               aria-label="Select parcel ${safeAddr}">
            <div class="watchlist-item-addr">${safeAddr}</div>
            <span class="watchlist-item-meta">${safeApn}</span>
            ${scorePill}
            <button class="watchlist-item-remove" data-remove-apn="${safeApn}"
                    title="Remove from watchlist" aria-label="Remove ${safeAddr}"
                    onclick="event.stopPropagation()">×</button>
          </div>`;
      }).join('');

      return items;
    },

    /**
     * Mount the watchlist DOM section into #sidebarRight.
     * Creates the section if it doesn't already exist.
     */
    mountPanel() {
      const sidebar = document.getElementById('sidebarRight');
      if (!sidebar) return;

      let panel = document.getElementById('watchlistSection');
      if (!panel) {
        panel = document.createElement('div');
        panel.id = 'watchlistSection';
        panel.className = 'watchlist-panel';
        sidebar.appendChild(panel);
      }
      panel.innerHTML = `
        <div class="watchlist-resize-handle" id="watchlistResizeHandle"
             role="separator" aria-orientation="horizontal"
             aria-label="Resize saved parcels panel" title="Drag to resize"></div>
        <div class="watchlist-panel-header">
          <span class="sidebar-title">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2.5" style="vertical-align:-1px;margin-right:4px">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
            Saved Parcels
          </span>
          <span class="watchlist-panel-count" style="font-size:10px;color:var(--color-text-faint)">
            ${this.getWatchlist().length} / ${WATCHLIST_MAX}
          </span>
        </div>
        ${this.renderWatchlistPanel()}
      `;

      // Wire up the resize handle (idempotent — re-bound on every mountPanel call,
      // but handler is shared via a single listener on document)
      this._wireResizeHandle(panel);

      // Wire up remove buttons and row clicks
      panel.querySelectorAll('[data-remove-apn]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const apn = btn.getAttribute('data-remove-apn');
          const entry = this.getWatchlist().find(p => p.apn === apn);
          if (entry) this.toggleWatchlist(entry);
          this.mountPanel(); // re-render
        });
      });

      panel.querySelectorAll('.watchlist-item').forEach(row => {
        row.addEventListener('click', () => {
          const apn = row.getAttribute('data-apn');
          // Fire a custom event that app.js can listen for
          document.dispatchEvent(new CustomEvent('sb:selectParcel', { detail: { apn } }));
        });
        row.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            row.click();
          }
        });
      });
    },

    /**
     * Wire the top-edge drag handle so the user can resize the Saved Parcels panel.
     * Height persists in localStorage and is restored on next page load.
     * Called from mountPanel after innerHTML rebuild — handlers are scoped to
     * the new handle element so re-mounting cleans up naturally.
     */
    _wireResizeHandle(panel) {
      const handle = panel.querySelector('.watchlist-resize-handle');
      if (!handle) return;
      const root = document.documentElement;
      const STORAGE_KEY = 'bap.watchlistHeight';
      const MIN_H = 38;         // header height only (so "Saved Parcels" stays visible)

      // Restore saved height on first mount (idempotent: only sets once per page load)
      if (!this._watchlistHeightRestored) {
        const saved = parseInt(lsGet(STORAGE_KEY, '') || '', 10);
        if (saved) root.style.setProperty('--watchlist-h', saved + 'px');
        this._watchlistHeightRestored = true;
      }

      let dragging = false;
      let startY = 0;
      let startH = 0;

      const onPointerDown = (e) => {
        if (window.innerWidth <= 900) return;
        dragging = true;
        startY = e.clientY;
        startH = panel.offsetHeight;
        handle.classList.add('is-dragging');
        document.body.classList.add('is-resizing-watchlist');
        handle.setPointerCapture && handle.setPointerCapture(e.pointerId);
        e.preventDefault();
      };
      const onPointerMove = (e) => {
        if (!dragging) return;
        // Drag up = panel grows; drag down = panel shrinks
        const delta = startY - e.clientY;
        let next = startH + delta;
        // Clamp against viewport: panel can't grow beyond ~80% of sidebar height
        const sidebar = document.querySelector('.sidebar-right');
        const maxH = sidebar ? sidebar.offsetHeight * 0.8 : window.innerHeight * 0.8;
        next = Math.max(MIN_H, Math.min(next, maxH));
        root.style.setProperty('--watchlist-h', next + 'px');
      };
      const onPointerUp = () => {
        if (!dragging) return;
        dragging = false;
        handle.classList.remove('is-dragging');
        document.body.classList.remove('is-resizing-watchlist');
        lsSet(STORAGE_KEY, panel.offsetHeight);
      };
      const onDoubleClick = () => {
        if (window.innerWidth <= 900) return;
        root.style.removeProperty('--watchlist-h');
        lsSet(STORAGE_KEY, '');
      };

      handle.addEventListener('pointerdown', onPointerDown);
      // Use document-level listeners so dragging continues even if the cursor
      // slips off the (very thin) handle element mid-drag.
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
      handle.addEventListener('dblclick', onDoubleClick);
    },
  };


  /* ══════════════════════════════════════════════════════════════
     COMPARISON BAR
     ══════════════════════════════════════════════════════════════ */

  /** In-memory comparison list: array of { apn, address } */
  let comparisonSlots = [];

  const CompareBar = {

    /**
     * Ensure the bar element exists in the DOM.
     */
    ensureBar() {
      let bar = document.getElementById('comparisonBar');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'comparisonBar';
        bar.className = 'comparison-bar';
        bar.setAttribute('role', 'status');
        bar.setAttribute('aria-live', 'polite');
        document.body.appendChild(bar);
      }
      return bar;
    },

    /**
     * Render the bar with current slots.
     * @param {Array<{apn:string, address:string}>} slots
     */
    showCompareBanner(slots) {
      comparisonSlots = slots || comparisonSlots;
      const bar = this.ensureBar();

      if (comparisonSlots.length === 0) {
        this.hideCompareBanner();
        return;
      }

      const slotHTML = comparisonSlots.map(slot => `
        <div class="comparison-slot">
          <span>${_escHtml(slot.address || slot.apn)}</span>
          <button class="comparison-slot-remove"
                  data-remove-apn="${_escHtml(slot.apn)}"
                  title="Remove from comparison"
                  aria-label="Remove ${_escHtml(slot.address || slot.apn)}">×</button>
        </div>`).join('');

      bar.innerHTML = `
        <span class="comparison-bar-title">Compare (${comparisonSlots.length})</span>
        ${slotHTML}
        <button class="comparison-view-btn" id="compareViewBtn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.5">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
          </svg>
          View Comparison
        </button>`;

      bar.classList.add('visible');

      // Remove slot listeners
      bar.querySelectorAll('[data-remove-apn]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const apn = btn.getAttribute('data-remove-apn');
          comparisonSlots = comparisonSlots.filter(s => s.apn !== apn);
          // Sync removal into Comparison data store
          if (window.Comparison) window.Comparison.removeParcel(apn);
          // Update compare-btn state in detail header if the removed parcel is open
          UIWiring.updateCompareButtonState(apn, false);
          this.showCompareBanner(comparisonSlots);
        });
      });

      const viewBtn = bar.querySelector('#compareViewBtn');
      if (viewBtn) {
        viewBtn.addEventListener('click', () => this.openComparisonView());
      }
    },

    /**
     * Hide the bar (when no items).
     */
    hideCompareBanner() {
      const bar = document.getElementById('comparisonBar');
      if (bar) bar.classList.remove('visible');
    },

    /**
     * Open the full comparison modal.
     * Calls window.Comparison.renderTable() if available,
     * otherwise shows a placeholder.
     */
    openComparisonView() {
      let html;
      if (window.Comparison && typeof window.Comparison.renderTable === 'function') {
        html = window.Comparison.renderTable(comparisonSlots);
      } else {
        // Fallback skeleton
        const headers = comparisonSlots.map(s =>
          `<th>${_escHtml(s.address || s.apn)}</th>`).join('');
        html = `
          <div class="comparison-table-wrap">
            <table class="comparison-table">
              <thead>
                <tr>
                  <th class="row-label">Field</th>
                  ${headers}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="row-label">APN</td>
                  ${comparisonSlots.map(s => `<td>${_escHtml(s.apn)}</td>`).join('')}
                </tr>
              </tbody>
            </table>
          </div>
          <p style="font-size:var(--text-xs);color:var(--color-text-muted);margin-top:12px">
            Full comparison requires <code>window.Comparison.renderTable</code>.
          </p>`;
      }
      UIWiring.showModal('Parcel Comparison', html);
    },

    /**
     * Open comparison view seeded with a specific list of APNs.
     * Used by compare mode in app.js after second parcel click.
     */
    openComparisonViewForAPNs(apns) {
      let html;
      if (window.Comparison && typeof window.Comparison.renderTable === 'function') {
        // Build slot list from Comparison store filtered to these APNs
        const slots = (apns || []).map(apn => {
          const entry = window.Comparison.getParcel ? window.Comparison.getParcel(apn) : null;
          return entry || { apn, address: apn };
        });
        html = window.Comparison.renderTable(slots);
      } else {
        html = `<p style="color:var(--color-text-muted)">Comparison data not yet loaded for all parcels.</p>`;
      }
      UIWiring.showModal('Parcel Comparison', html);
    },

    /**
     * Toggle a parcel in the comparison list.
     * Returns new "in-list" state (boolean).
     * @param {{apn:string, address:string}} slot
     * @returns {boolean}
     */
    toggleSlot(slot) {
      const idx = comparisonSlots.findIndex(s => s.apn === slot.apn);
      if (idx !== -1) {
        comparisonSlots.splice(idx, 1);
        if (comparisonSlots.length === 0) {
          this.hideCompareBanner();
        } else {
          this.showCompareBanner(comparisonSlots);
        }
        return false;
      } else {
        comparisonSlots.push(slot);
        this.showCompareBanner(comparisonSlots);
        return true;
      }
    },

    isInList(apn) {
      return comparisonSlots.some(s => s.apn === apn);
    },

    getSlots() {
      return comparisonSlots.slice();
    },
  };


  /* ══════════════════════════════════════════════════════════════
     MODAL SYSTEM
     ══════════════════════════════════════════════════════════════ */

  const Modal = {

    ensureModal() {
      let overlay = document.getElementById('uwModalOverlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'uwModalOverlay';
        overlay.className = 'uw-modal-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.innerHTML = `
          <div class="uw-modal-panel" id="uwModalPanel">
            <div class="uw-modal-header">
              <span class="uw-modal-title" id="uwModalTitle"></span>
              <button class="uw-modal-close" id="uwModalClose" aria-label="Close dialog">✕</button>
            </div>
            <div class="uw-modal-body" id="uwModalBody"></div>
          </div>`;
        document.body.appendChild(overlay);

        // Close on overlay backdrop click
        overlay.addEventListener('click', e => {
          if (e.target === overlay) Modal.hideModal();
        });

        document.getElementById('uwModalClose').addEventListener('click', () => {
          Modal.hideModal();
        });

        // Close on Escape
        document.addEventListener('keydown', e => {
          if (e.key === 'Escape' && overlay.classList.contains('open')) {
            Modal.hideModal();
          }
        });
      }
      return overlay;
    },

    /**
     * Open modal with a title and HTML body content.
     * @param {string} title
     * @param {string} contentHTML
     */
    showModal(title, contentHTML) {
      const overlay = this.ensureModal();
      document.getElementById('uwModalTitle').textContent = title;
      document.getElementById('uwModalBody').innerHTML   = contentHTML;
      // Force reflow before adding open class for transition
      overlay.offsetHeight; // eslint-disable-line no-unused-expressions
      overlay.classList.add('open');
      document.getElementById('uwModalClose').focus();
    },

    /** Hide the modal. */
    hideModal() {
      const overlay = document.getElementById('uwModalOverlay');
      if (overlay) overlay.classList.remove('open');
    },
  };


  /* ══════════════════════════════════════════════════════════════
     TRANSIT BADGE
     ══════════════════════════════════════════════════════════════ */

  const Transit = {
    /**
     * Return HTML badge string for transit proximity.
     * @param {boolean} nearTransit  — within half-mile of transit
     * @param {boolean} inTPA        — within Transit Priority Area
     * @returns {string}
     */
    renderTransitBadge(nearTransit, inTPA) {
      if (!nearTransit && !inTPA) return '';

      const cls    = inTPA ? 'transit-badge tpa' : 'transit-badge';
      const label  = inTPA  ? 'TPA' : '½mi Transit';
      const title  = inTPA
        ? 'Transit Priority Area — parking minimums waived (AB 2097)'
        : 'Within ½ mile of transit stop';

      return `
        <span class="${cls}" title="${title}" aria-label="${title}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.5">
            <rect x="4" y="3" width="16" height="14" rx="2"/>
            <path d="M8 21l4-4 4 4"/>
            <path d="M4 11h16"/>
          </svg>
          ${label}
        </span>`;
    },
  };


  /* ══════════════════════════════════════════════════════════════
     PARCEL HEADER BUTTONS
     ══════════════════════════════════════════════════════════════ */

  /**
   * Rebuild the .detail-actions area in the right panel
   * with the full button set for the currently selected parcel.
   *
   * @param {string}  apn
   * @param {string}  address
   * @param {number}  lat
   * @param {number}  lng
   * @param {object}  report    — result from window.Analyzer (optional)
   * @param {object}  pfResult  — result from window.ProForma (optional)
   */
  function updateParcelHeader(apn, address, lat, lng, report, pfResult) {
    const actionsEl = document.querySelector('.detail-actions');
    if (!actionsEl) return;

    const watched   = Watchlist.isWatched(apn);
    const inCompare = CompareBar.isInList(apn);
    const score     = report ? (report.score?.score ?? report.score ?? null) : null;

    // Preserve original GeoJSON export + close buttons HTML so we
    // can re-inject them alongside the new controls.
    const exportBtn = `
      <button class="btn-icon btn-sm" id="exportParcel" title="Export this parcel as GeoJSON">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </button>`;

    const closeBtn = `
      <button class="btn-icon btn-sm" id="closeDetail" title="Close panel">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2">
          <path d="M18 6 6 18M6 6l12 12"/>
        </svg>
      </button>`;

    const watchClass = watched ? 'watchlist-btn saved' : 'watchlist-btn';
    const watchFill  = watched ? 'var(--color-accent)' : 'none';
    const watchBtn   = `
      <button class="${watchClass}" id="watchlistToggleBtn"
              title="${watched ? 'Remove from watchlist' : 'Save to watchlist'}"
              aria-label="${watched ? 'Remove from watchlist' : 'Save to watchlist'}">
        <svg width="14" height="14" viewBox="0 0 24 24"
             fill="${watchFill}" stroke="currentColor" stroke-width="2">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
        </svg>
      </button>`;

    const appState     = window._appState;
    const inCompareMode = !!(appState && appState.compareMode && appState.compareAPNs && appState.compareAPNs.includes(apn));
    const compareClass = inCompareMode ? 'compare-btn in-list' : 'compare-btn';
    const compareLabel = inCompareMode ? '✕ Exit Compare' : '+ Compare';
    const compareBtn   = `
      <button class="${compareClass}" id="compareToggleBtn"
              aria-label="${inCompareMode ? 'Exit compare mode' : 'Enter compare mode — then click another parcel'}">
        ${compareLabel}
      </button>`;

    const pdfBtn = `
      <button class="pdf-export-btn" id="pdfExportBtn" title="Export PDF report">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
             stroke="var(--color-accent)" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="9" y1="13" x2="15" y2="13"/>
          <line x1="9" y1="17" x2="15" y2="17"/>
          <line x1="9" y1="9" x2="11" y2="9"/>
        </svg>
        PDF
      </button>`;

    actionsEl.innerHTML = watchBtn + compareBtn + pdfBtn + exportBtn + closeBtn;

    /* ── Re-attach event listeners ───────────────────────────── */

    // Watchlist toggle
    document.getElementById('watchlistToggleBtn').addEventListener('click', () => {
      const added = Watchlist.toggleWatchlist({ apn, address, score, lat, lng });
      updateParcelHeader(apn, address, lat, lng, report, pfResult); // re-render
      Watchlist.mountPanel();
      _showToast(added
        ? `Saved ${address || apn} to watchlist`
        : `Removed ${address || apn} from watchlist`);
    });

    // Compare toggle
    document.getElementById('compareToggleBtn').addEventListener('click', () => {
      const appState = window._appState;  // exposed by app.js
      if (!appState) return;

      if (appState.compareMode) {
        // Already in compare mode — clicking again exits compare mode
        appState.compareMode = false;
        appState.compareAPNs   = [];
        appState.compareLayers = {};
        appState.selectedAPN   = null;
        // Reset all highlight styles
        if (appState.activeFeatureLayers && appState.activeFeatureLayers['parcels']) {
          appState.activeFeatureLayers['parcels'].eachLayer(l => {
            try { l.setStyle({ fillOpacity: appState.layerOpacity.parcels * 0.35, weight: 1, color: '#1a5f7a' }); } catch(e) {}
          });
        }
        const mapEl = document.getElementById('map');
        if (mapEl) mapEl.classList.remove('compare-pick-mode');
        // Seed this parcel into compare data store for the current open panel
        if (window.Comparison) {
          var fullData = (window.currentParcelData && window.currentParcelData.apn === apn)
            ? window.currentParcelData
            : { apn, address, lat, lng, report, pfResult };
          window.Comparison.clearAll ? window.Comparison.clearAll() : null;
        }
        updateParcelHeader(apn, address, lat, lng, report, pfResult);
        return;
      }

      // Enter compare mode — seed with current parcel
      appState.compareMode = true;
      appState.compareAPNs = [apn];
      appState.compareLayers = {};
      appState.selectedAPN = apn;

      // Store this parcel's data so comparison table can use it
      if (window.Comparison) {
        if (window.Comparison.clearAll) window.Comparison.clearAll();
        var fullData = (window.currentParcelData && window.currentParcelData.apn === apn)
          ? window.currentParcelData
          : { apn, address, lat, lng, report, pfResult };
        window.Comparison.addParcel(fullData);
      }

      // Visual cursor hint on map
      const mapEl = document.getElementById('map');
      if (mapEl) mapEl.classList.add('compare-pick-mode');

      // Show banner hint
      _showToast('Compare mode: click a second parcel on the map', 'info');

      updateParcelHeader(apn, address, lat, lng, report, pfResult);
    });

    // PDF export
    document.getElementById('pdfExportBtn').addEventListener('click', () => {
      if (window.PDFExport && typeof window.PDFExport.generateReport === 'function') {
        window.PDFExport.generateReport({ apn, address, lat, lng, report, pfResult });
      } else {
        _showToast('PDF export module not loaded.', 'error');
      }
    });

    // GeoJSON export — re-wire since we replaced the DOM node
    const exportParcelBtn = document.getElementById('exportParcel');
    if (exportParcelBtn && window._handleExportParcel) {
      exportParcelBtn.addEventListener('click', window._handleExportParcel);
    }

    // Close — re-wire
    const closeDetailBtn = document.getElementById('closeDetail');
    if (closeDetailBtn && window._handleCloseDetail) {
      closeDetailBtn.addEventListener('click', window._handleCloseDetail);
    } else if (closeDetailBtn) {
      // Fallback: hide panel
      closeDetailBtn.addEventListener('click', () => {
        const panel = document.getElementById('detailPanel');
        const empty = document.getElementById('detailEmpty');
        if (panel) panel.style.display = 'none';
        if (empty) empty.style.display = '';
      });
    }
  }

  /**
   * Update just the compare-btn state without rebuilding the whole header.
   * Called when a slot is removed from the bar.
   */
  function updateCompareButtonState(apn, inList) {
    const btn = document.getElementById('compareToggleBtn');
    if (!btn) return;
    // Only update if the currently open parcel matches
    const currentApn = document.getElementById('detailApn');
    if (currentApn && currentApn.textContent.trim() === apn) {
      if (inList) {
        btn.classList.add('in-list');
        btn.textContent = '− Compare';
      } else {
        btn.classList.remove('in-list');
        btn.textContent = '+ Compare';
      }
    }
  }


  /* ── Toast helper (internal, lightweight) ─────────────────────── */
  function _showToast(msg, type) {
    // Use app.js toast if available
    if (window.showToast && typeof window.showToast === 'function') {
      window.showToast(msg, type || 'info');
      return;
    }
    // Minimal fallback
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type || 'info'}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  /* ── HTML escape helper ───────────────────────────────────────── */
  function _escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }


  /* ══════════════════════════════════════════════════════════════
     INIT
     ══════════════════════════════════════════════════════════════ */

  function init() {
    // 1. Inject modal styles into <head>
    const styleEl = document.createElement('style');
    styleEl.id = 'uw-injected-styles';
    styleEl.textContent = MODAL_STYLES;
    document.head.appendChild(styleEl);

    // 2. Pre-create the comparison bar DOM node (starts hidden)
    CompareBar.ensureBar();

    // 3. Pre-create the modal container DOM node
    Modal.ensureModal();

    // 4. Mount the watchlist panel in the right sidebar
    Watchlist.mountPanel();

    // 5. Listen for app.js parcel-select events to update the
    //    header buttons when a new parcel is shown.
    //    app.js can call UIWiring.updateParcelHeader() directly, or
    //    dispatch this custom event.
    document.addEventListener('sb:parcelLoaded', e => {
      const d = e.detail || {};
      updateParcelHeader(
        d.apn     || '',
        d.address || '',
        d.lat     ?? null,
        d.lng     ?? null,
        d.report  ?? null,
        d.pfResult ?? null,
      );
    });
  }


  /* ══════════════════════════════════════════════════════════════
     PUBLIC API
     ══════════════════════════════════════════════════════════════ */

  window.UIWiring = {
    init,
    updateParcelHeader,
    updateCompareButtonState,
    showCompareBanner: (slots)       => CompareBar.showCompareBanner(slots),
    hideCompareBanner: ()            => CompareBar.hideCompareBanner(),
    toggleCompareSlot: (slot)        => CompareBar.toggleSlot(slot),
    isInCompare:       (apn)         => CompareBar.isInList(apn),
    getCompareSlots:   ()            => CompareBar.getSlots(),
    openComparisonView:()            => CompareBar.openComparisonView(),
    openComparePanelFor: (apns)      => CompareBar.openComparisonViewForAPNs(apns),

    showModal:   (title, html)       => Modal.showModal(title, html),
    hideModal:   ()                  => Modal.hideModal(),

    toggleWatchlist: (parcelData)    => Watchlist.toggleWatchlist(parcelData),
    isWatched:       (apn)           => Watchlist.isWatched(apn),
    getWatchlist:    ()              => Watchlist.getWatchlist(),
    renderWatchlistPanel: ()         => Watchlist.renderWatchlistPanel(),
    refreshWatchlistPanel: ()        => Watchlist.mountPanel(),

    renderTransitBadge: (n, t)       => Transit.renderTransitBadge(n, t),
  };

  // Auto-init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM already parsed (e.g., script loaded with defer)
    init();
  }

})();
