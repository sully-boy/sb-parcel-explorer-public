/* ============================================================
   Santa Barbara Parcel Explorer — Parcel Comparison Module
   Stores up to 5 parcels in localStorage for side-by-side
   comparison. No external dependencies.
   ============================================================ */

'use strict';

var COMPARISON_KEY = 'sb_comparison_list';
var MAX_PARCELS    = 5;

// ── In-memory storage (no localStorage for iframe compatibility) ──

var _comparisonMemStore = [];

function _getList() {
  return _comparisonMemStore.slice();
}

function _saveList(list) {
  _comparisonMemStore = Array.isArray(list) ? list.slice() : [];
}

// ── Parcel data extractor ─────────────────────────────────────

/**
 * _extractParcelEntry(parcelData)
 * Extracts a normalized comparison entry from the full parcel data object
 * (same shape as what app.js / analyzer.js produces).
 */
function _extractParcelEntry(parcelData) {
  var pd = parcelData || {};
  var pa = pd.parcelAttrs  || {};
  var za = pd.zoningAttrs  || {};
  var rp = pd.report       || {};
  var pf = pd.proforma || pd.pfResult || {};
  var ctx = pd.context     || {};

  // APN — try multiple field names
  var apn = pd.apn || pa.APN_CLEAN || pa.APN || pa.apn || '';

  // Address
  var address = pd.address ||
    (pa.SITE_ADDR ? (pa.SITE_ADDR + (pa.SITE_CITY ? ', ' + pa.SITE_CITY : '')) : null) ||
    pa.ADDRESS || pa.SITUS || '—';

  // Zone
  var zone = pd.zone ||
    za.ZONE_NAME || za.ZONE || za.ZONE_CODE || pa.ZONE || '—';

  // Opportunity score — rp.score is an object {score, label, color} from analyzeParcel()
  var scoreObj   = (rp.score && typeof rp.score === 'object') ? rp.score : {};
  var score      = scoreObj.score  || rp.score      || pd.score      || 0;
  var scoreLabel = scoreObj.label  || rp.scoreLabel || pd.scoreLabel || '—';
  var scoreColor = scoreObj.color  || rp.scoreColor || pd.scoreColor || _scoreColorHex(score);

  // Unit counts — rp.maxUnits is an object {byRight, withStateLaw, absolute}
  var muObj         = (rp.maxUnits && typeof rp.maxUnits === 'object') ? rp.maxUnits : {};
  var byRightUnits  = muObj.byRight    || rp.byRightUnits  || rp.byRight    || 0;
  var stateLawUnits = muObj.withStateLaw || rp.stateLawUnits || rp.withStateLaw || 0;
  var maxUnits      = muObj.absolute   || rp.maxUnits      || rp.maxPossible || 0;

  // Pro forma numbers (mid-point)
  var totalDevCost = 0;
  var netProfit    = 0;
  var roi          = 0;
  if (pf.totalDevCost) totalDevCost = pf.totalDevCost.mid || 0;
  if (pf.netProfit)    netProfit    = pf.netProfit.mid    || 0;
  if (pf.roi)          roi          = parseFloat(pf.roi.mid) || 0;

  // Acreage
  var acreage = parseFloat(pa.GIS_ACRES || pa.ACRES || pa.acreage || pd.acreage || 0);

  // Flags — from analyzer sub-objects (e.g. rp.coastalAnalysis.inCoastalZone)
  var isCoastal  = !!(ctx.isCoastal  || (rp.coastalAnalysis && rp.coastalAnalysis.inCoastalZone)  || rp.isCoastal  || pd.isCoastal);
  var isHighFire = !!(ctx.isHighFire || (rp.fireAnalysis    && rp.fireAnalysis.inHighFireZone)     || rp.isHighFire || pd.isHighFire);
  var isHistoric = !!(ctx.isHistoric || (rp.historicAnalysis && rp.historicAnalysis.isHistoric)    || rp.isHistoric || pd.isHistoric);
  // Zone from zoningAttrs or report summary
  zone = zone === '—' ? (rp.summary && rp.summary.zone ? rp.summary.zone : zone) : zone;

  // Coords
  var lat = pd.lat || 0;
  var lng = pd.lng || 0;

  return {
    apn:           apn,
    address:       address,
    zone:          zone,
    score:         score,
    scoreLabel:    scoreLabel,
    scoreColor:    scoreColor,
    byRightUnits:  byRightUnits,
    stateLawUnits: stateLawUnits,
    maxUnits:      maxUnits,
    totalDevCost:  totalDevCost,
    netProfit:     netProfit,
    roi:           roi,
    acreage:       acreage,
    isCoastal:     isCoastal,
    isHighFire:    isHighFire,
    isHistoric:    isHistoric,
    lat:           lat,
    lng:           lng,
    addedAt:       new Date().toISOString(),
  };
}

function _scoreColorHex(score) {
  if (score >= 80) return '#2e7041';
  if (score >= 60) return '#1a5f7a';
  if (score >= 40) return '#c4611a';
  return '#b22222';
}

// ── Format helper ─────────────────────────────────────────────

function _fmt$(n) {
  if (n === null || n === undefined || isNaN(n) || n === 0) return '—';
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(2) + 'M';
  if (n >= 1000)    return '$' + Math.round(n / 1000) + 'K';
  return '$' + Math.round(n).toLocaleString();
}

// ── Public API ────────────────────────────────────────────────

/**
 * addParcel(parcelData)
 * Add a parcel to the comparison list. Max 5.
 * If APN already exists, replace it (update).
 * @param {Object} parcelData - Full parcel data from app.js / analyzer
 * @returns {Object} result { ok, message, list }
 */
function addParcel(parcelData) {
  var entry = _extractParcelEntry(parcelData);

  if (!entry.apn) {
    return { ok: false, message: 'No APN found — cannot add to comparison.', list: _getList() };
  }

  var list = _getList();

  // Replace if exists
  var existIdx = -1;
  for (var i = 0; i < list.length; i++) {
    if (list[i].apn === entry.apn) { existIdx = i; break; }
  }

  if (existIdx >= 0) {
    list[existIdx] = entry;
    _saveList(list);
    return { ok: true, message: 'Parcel updated in comparison.', list: list };
  }

  if (list.length >= MAX_PARCELS) {
    return {
      ok: false,
      message: 'Comparison list is full (max ' + MAX_PARCELS + '). Remove a parcel first.',
      list: list
    };
  }

  list.push(entry);
  _saveList(list);
  return { ok: true, message: 'Parcel added to comparison.', list: list };
}

/**
 * removeParcel(apn)
 * Remove a parcel from the list by APN.
 */
function removeParcel(apn) {
  var list = _getList();
  var filtered = [];
  for (var i = 0; i < list.length; i++) {
    if (list[i].apn !== apn) filtered.push(list[i]);
  }
  _saveList(filtered);
  return filtered;
}

/**
 * getAll()
 * Return all parcels in the comparison list.
 */
function getAll() {
  return _getList();
}

/**
 * clear()
 * Empty the comparison list.
 */
function clear() {
  _saveList([]);
}

// ── renderButton ──────────────────────────────────────────────

/**
 * renderButton(apn, isInList)
 * Returns an HTML string for a toggle button.
 * The button dispatches a custom event 'sb:comparison:toggle' on click.
 */
function renderButton(apn, isInList) {
  var safeApn = String(apn).replace(/'/g, "\\'");

  if (isInList) {
    return '<button class="btn-comparison btn-comparison--active" ' +
      'title="Remove from comparison" ' +
      'onclick="(function(){' +
        'window.Comparison.removeParcel(\'' + safeApn + '\');' +
        'document.dispatchEvent(new CustomEvent(\'sb:comparison:changed\',{detail:{apn:\'' + safeApn + '\',action:\'remove\'}}));' +
      '})()" >' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
        '<polyline points="20 6 9 17 4 12"/>' +
      '</svg>' +
      ' In Compare' +
    '</button>';
  }

  return '<button class="btn-comparison" ' +
    'title="Add to comparison" ' +
    'onclick="(function(){' +
      'var result = window.Comparison._addByApn(\'' + safeApn + '\');' +
      'document.dispatchEvent(new CustomEvent(\'sb:comparison:changed\',{detail:{apn:\'' + safeApn + '\',action:\'add\',result:result}}));' +
    '})()" >' +
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>' +
    '</svg>' +
    ' Compare' +
  '</button>';
}

// ── renderTable ───────────────────────────────────────────────

/**
 * renderTable()
 * Returns a full HTML comparison table for all pinned parcels.
 * Best value in each numeric row is highlighted in green.
 */
function renderTable() {
  var list = _getList();

  if (!list || list.length === 0) {
    return '<div class="comparison-empty">' +
      '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.3">' +
        '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>' +
        '<rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>' +
      '</svg>' +
      '<p style="font-size:0.85rem;color:var(--color-text-faint);margin-top:8px;">No parcels added to comparison yet.<br>Click <strong>Compare</strong> on any parcel to add it.</p>' +
    '</div>';
  }

  // Identify best values in each numeric row
  // Higher is better: score, byRightUnits, stateLawUnits, maxUnits, netProfit, roi, acreage
  // Lower is better: totalDevCost
  function bestIdx(arr, higherIsBetter) {
    var best = null;
    var bestVal = higherIsBetter ? -Infinity : Infinity;
    for (var i = 0; i < arr.length; i++) {
      var v = parseFloat(arr[i]);
      if (isNaN(v)) continue;
      if (higherIsBetter ? (v > bestVal) : (v < bestVal)) {
        bestVal = v;
        best = i;
      }
    }
    return best;
  }

  var scores      = list.map(function(p){ return p.score; });
  var byRights    = list.map(function(p){ return p.byRightUnits; });
  var stateUnits  = list.map(function(p){ return p.stateLawUnits; });
  var maxUnitsArr = list.map(function(p){ return p.maxUnits; });
  var tdcArr      = list.map(function(p){ return p.totalDevCost; });
  var profitArr   = list.map(function(p){ return p.netProfit; });
  var roiArr      = list.map(function(p){ return p.roi; });
  var acrArr      = list.map(function(p){ return p.acreage; });

  var bestScore   = bestIdx(scores,      true);
  var bestByRight = bestIdx(byRights,    true);
  var bestState   = bestIdx(stateUnits,  true);
  var bestMax     = bestIdx(maxUnitsArr, true);
  var bestTdc     = bestIdx(tdcArr,      false);
  var bestProfit  = bestIdx(profitArr,   true);
  var bestRoi     = bestIdx(roiArr,      true);
  var bestAcr     = bestIdx(acrArr,      true);

  var WIN_STYLE  = 'background:rgba(46,112,65,0.1);';
  var colW       = Math.round(100 / (list.length + 1));

  // Build column headers
  var colHeaders = '<th style="width:' + colW + '%;background:#1a3a5c;color:#fff;padding:8px 10px;font-size:0.75rem;font-weight:600;">Attribute</th>';
  for (var ci = 0; ci < list.length; ci++) {
    var p = list[ci];
    var safeApn = String(p.apn).replace(/'/g, "\\'");
    colHeaders += '<th style="width:' + colW + '%;background:#1a3a5c;color:#fff;padding:8px 10px;font-size:0.75rem;font-weight:600;text-align:center;">' +
      '<div style="font-size:0.7rem;opacity:0.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;" title="' + p.address + '">' + p.address + '</div>' +
      '<div style="font-family:var(--font-mono,monospace);font-size:0.65rem;opacity:0.6;margin-top:2px;">' + p.apn + '</div>' +
      '<button onclick="window.Comparison.removeParcel(\'' + safeApn + '\');document.dispatchEvent(new CustomEvent(\'sb:comparison:changed\',{detail:{action:\'remove\',apn:\'' + safeApn + '\'}}))" ' +
        'style="margin-top:6px;font-size:0.65rem;padding:2px 8px;border:1px solid rgba(255,255,255,0.4);background:transparent;color:#fff;border-radius:3px;cursor:pointer;">Remove</button>' +
      '</th>';
  }

  // Helper to build a data row
  function row(label, values, highlight, formatter, isFlag) {
    var cells = '<td style="padding:6px 10px;font-size:0.8rem;color:var(--color-text-faint,#666);font-weight:500;border-bottom:1px solid var(--color-border,#e0e0e0);white-space:nowrap;">' + label + '</td>';
    for (var i = 0; i < values.length; i++) {
      var val = values[i];
      var style = 'padding:6px 10px;font-size:0.85rem;text-align:center;border-bottom:1px solid var(--color-border,#e0e0e0);font-family:var(--font-mono,monospace);';
      if (highlight === i) style += WIN_STYLE + 'font-weight:700;';
      if (isFlag) {
        var flagVal = !!val;
        cells += '<td style="' + style + '">' +
          (flagVal
            ? '<span style="color:#c00;font-size:0.75rem;font-weight:700;">YES</span>'
            : '<span style="color:#2e7041;font-size:0.75rem;font-weight:600;">No</span>') +
          '</td>';
      } else {
        var displayVal = formatter ? formatter(val) : (val !== undefined && val !== null ? String(val) : '—');
        cells += '<td style="' + style + '">' + displayVal + '</td>';
      }
    }
    return '<tr>' + cells + '</tr>';
  }

  function fmtScore(v) {
    var c = _scoreColorHex(v || 0);
    var p = list[0]; // hack — we iterate per-cell
    // NOTE: scoreColor is per-parcel; use the generic one here
    return '<span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:' + c + ';color:#fff;font-weight:700;font-size:0.85rem;">' + (v || 0) + '</span>';
  }

  // Build score cells manually to use per-parcel color
  var scoreRow = '<td style="padding:6px 10px;font-size:0.8rem;color:var(--color-text-faint,#666);font-weight:500;border-bottom:1px solid var(--color-border,#e0e0e0);">Opportunity Score</td>';
  for (var si = 0; si < list.length; si++) {
    var sp = list[si];
    var sStyle = 'padding:6px 10px;text-align:center;border-bottom:1px solid var(--color-border,#e0e0e0);';
    if (bestScore === si) sStyle += WIN_STYLE;
    scoreRow += '<td style="' + sStyle + '">' +
      '<span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:' + sp.scoreColor + ';color:#fff;font-weight:700;font-size:0.85rem;">' + sp.score + '</span>' +
      '<div style="font-size:0.68rem;color:#888;margin-top:2px;">' + sp.scoreLabel + '</div>' +
      '</td>';
  }
  scoreRow = '<tr>' + scoreRow + '</tr>';

  // Zone row
  var zoneRow = '<td style="padding:6px 10px;font-size:0.8rem;color:var(--color-text-faint,#666);font-weight:500;border-bottom:1px solid var(--color-border,#e0e0e0);">Zone</td>';
  for (var zi = 0; zi < list.length; zi++) {
    var zStyle = 'padding:6px 10px;text-align:center;border-bottom:1px solid var(--color-border,#e0e0e0);font-size:0.85rem;font-family:var(--font-mono,monospace);';
    zoneRow += '<td style="' + zStyle + '">' + (list[zi].zone || '—') + '</td>';
  }
  zoneRow = '<tr>' + zoneRow + '</tr>';

  var tbody =
    scoreRow +
    zoneRow +
    row('By-Right Units',     byRights,    bestByRight, String) +
    row('With State Law',     stateUnits,  bestState,   String) +
    row('Max Possible Units', maxUnitsArr, bestMax,     String) +
    row('Total Dev Cost',     tdcArr,      bestTdc,     _fmt$) +
    row('Est. Net Profit',    profitArr,   bestProfit,  _fmt$) +
    row('ROI %',              roiArr,      bestRoi,     function(v){ return v ? v + '%' : '—'; }) +
    row('Acreage',            acrArr,      bestAcr,     function(v){ return v ? parseFloat(v).toFixed(3) + ' ac' : '—'; }) +
    row('Coastal Zone',  list.map(function(p){ return p.isCoastal; }),  -1, null, true) +
    row('High Fire',     list.map(function(p){ return p.isHighFire; }), -1, null, true) +
    row('Historic',      list.map(function(p){ return p.isHistoric; }), -1, null, true);

  var clearBtn = '<button onclick="window.Comparison.clear();document.dispatchEvent(new CustomEvent(\'sb:comparison:changed\',{detail:{action:\'clear\'}}))" ' +
    'style="font-size:0.75rem;padding:4px 12px;border:1px solid var(--color-border,#e0e0e0);background:transparent;color:var(--color-text-faint,#666);border-radius:4px;cursor:pointer;margin-bottom:8px;">' +
    'Clear All</button>';

  var note = '<div style="font-size:0.7rem;color:var(--color-text-faint,#888);margin-top:6px;">' +
    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
    ' Green highlight = best value in row. Pro forma numbers are mid-point estimates. Max 5 parcels.' +
    '</div>';

  return '<div class="comparison-table-wrap">' +
    clearBtn +
    '<div style="overflow-x:auto;">' +
    '<table style="width:100%;border-collapse:collapse;font-size:0.85rem;">' +
    '<thead><tr>' + colHeaders + '</tr></thead>' +
    '<tbody>' + tbody + '</tbody>' +
    '</table>' +
    '</div>' +
    note +
    '</div>';
}

// ── Internal helper exposed for button onclick ─────────────────
// (Buttons in renderButton need to look up parcel data from app state)
// The onclick handler dispatches the event; the app listens and calls addParcel
// with full data. This _addByApn is for completeness — real apps pass full data.
function _addByApn(apn) {
  // Attempt to pull from window.currentParcelData if app sets it
  if (window.currentParcelData && window.currentParcelData.apn === apn) {
    return addParcel(window.currentParcelData);
  }
  // Otherwise dispatch event for app to handle
  return { ok: false, message: 'Call window.Comparison.addParcel(fullData) with complete parcel data.' };
}

// ── Export ────────────────────────────────────────────────────

window.Comparison = {
  addParcel:    addParcel,
  removeParcel: removeParcel,
  getAll:       getAll,
  clear:        clear,
  clearAll:     clear,   // alias used by compare mode
  getParcel:    function(apn) {
    return _getList().find(function(e) { return e.apn === apn; }) || null;
  },
  renderButton: renderButton,
  renderTable:  renderTable,
  // internal (exposed for button inline onclick handlers)
  _addByApn:    _addByApn,
  _extractParcelEntry: _extractParcelEntry,
  MAX_PARCELS:  MAX_PARCELS,
};
