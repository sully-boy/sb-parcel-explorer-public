/* ============================================================
   Santa Barbara Parcel Explorer — PDF / Print Export
   Generates a professional planning brief via browser print.
   No external dependencies — all inline CSS.
   ============================================================ */

'use strict';

// ── Utility helpers ───────────────────────────────────────────

function _fmt$(n) {
  if (n === null || n === undefined || n === '') return '—';
  if (isNaN(n)) return String(n);
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(2) + 'M';
  if (n >= 1000)    return '$' + Math.round(n / 1000) + 'K';
  return '$' + Math.round(n).toLocaleString();
}

function _fmtRange(r) {
  if (!r) return '—';
  if (typeof r === 'number') return _fmt$(r);
  return _fmt$(r.low) + ' – ' + _fmt$(r.high) + ' <span class="mid">(' + _fmt$(r.mid) + ' mid)</span>';
}

function _fmtRangeMid(r) {
  if (!r) return '—';
  if (typeof r === 'number') return _fmt$(r);
  return _fmt$(r.mid);
}

function _today() {
  var d = new Date();
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function _val(obj, key, fallback) {
  if (!obj) return fallback || '—';
  var v = obj[key];
  if (v === null || v === undefined || v === '') return fallback || '—';
  return v;
}

function _scoreColor(score) {
  if (!score && score !== 0) return '#888';
  if (score >= 80) return '#2e7041';
  if (score >= 60) return '#1a5f7a';
  if (score >= 40) return '#c4611a';
  return '#b22';
}

// ── Inline CSS ────────────────────────────────────────────────

function _buildCSS() {
  return [
    '*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }',
    'body {',
    '  font-family: "Segoe UI", Arial, Helvetica, sans-serif;',
    '  font-size: 10pt;',
    '  line-height: 1.5;',
    '  color: #222;',
    '  background: #fff;',
    '}',
    '.page {',
    '  width: 100%;',
    '  padding: 0.75in 0.75in 0.9in 0.75in;',
    '  page-break-after: always;',
    '  position: relative;',
    '  min-height: 10.5in;',
    '}',
    '.page:last-child { page-break-after: avoid; }',

    /* Header bar */
    '.doc-header {',
    '  display: flex;',
    '  justify-content: space-between;',
    '  align-items: flex-start;',
    '  border-bottom: 3px solid #1a3a5c;',
    '  padding-bottom: 10px;',
    '  margin-bottom: 18px;',
    '}',
    '.doc-header-left .brand {',
    '  font-size: 15pt;',
    '  font-weight: 700;',
    '  color: #1a3a5c;',
    '  letter-spacing: -0.3px;',
    '}',
    '.doc-header-left .sub {',
    '  font-size: 8pt;',
    '  color: #666;',
    '  margin-top: 2px;',
    '}',
    '.doc-header-right {',
    '  text-align: right;',
    '  font-size: 8pt;',
    '  color: #666;',
    '}',
    '.doc-header-right .date { font-weight: 600; color: #1a3a5c; }',

    /* Property title block */
    '.prop-block {',
    '  display: flex;',
    '  justify-content: space-between;',
    '  align-items: center;',
    '  margin-bottom: 16px;',
    '}',
    '.prop-address {',
    '  font-size: 16pt;',
    '  font-weight: 700;',
    '  color: #1a3a5c;',
    '  line-height: 1.2;',
    '}',
    '.prop-apn {',
    '  font-size: 9pt;',
    '  color: #555;',
    '  margin-top: 3px;',
    '  font-family: "Courier New", monospace;',
    '}',
    '.prop-coords {',
    '  font-size: 7.5pt;',
    '  color: #888;',
    '  margin-top: 2px;',
    '}',

    /* Score badge */
    '.score-badge {',
    '  text-align: center;',
    '  border-radius: 50%;',
    '  width: 72px;',
    '  height: 72px;',
    '  display: flex;',
    '  flex-direction: column;',
    '  align-items: center;',
    '  justify-content: center;',
    '  flex-shrink: 0;',
    '  color: #fff;',
    '  font-weight: 700;',
    '}',
    '.score-badge .num { font-size: 22pt; line-height: 1; }',
    '.score-badge .lbl { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }',

    /* Summary 3-col grid */
    '.summary-grid {',
    '  display: grid;',
    '  grid-template-columns: repeat(6, 1fr);',
    '  gap: 0;',
    '  border: 1px solid #d0d8e0;',
    '  border-radius: 4px;',
    '  overflow: hidden;',
    '  margin-bottom: 14px;',
    '}',
    '.sg-cell {',
    '  padding: 8px 10px;',
    '  border-right: 1px solid #d0d8e0;',
    '  border-bottom: 1px solid #d0d8e0;',
    '}',
    '.sg-cell:nth-child(6n) { border-right: none; }',
    '.sg-cell:nth-last-child(-n+6) { border-bottom: none; }',
    '.sg-label {',
    '  font-size: 7pt;',
    '  text-transform: uppercase;',
    '  letter-spacing: 0.5px;',
    '  color: #888;',
    '  font-weight: 600;',
    '  margin-bottom: 2px;',
    '}',
    '.sg-value {',
    '  font-size: 10pt;',
    '  font-weight: 600;',
    '  color: #1a3a5c;',
    '  font-family: "Courier New", monospace;',
    '}',

    /* Alerts */
    '.alert-row {',
    '  display: flex;',
    '  gap: 8px;',
    '  flex-wrap: wrap;',
    '  margin-bottom: 14px;',
    '}',
    '.alert-chip {',
    '  display: inline-flex;',
    '  align-items: center;',
    '  gap: 5px;',
    '  padding: 5px 10px;',
    '  border-radius: 4px;',
    '  font-size: 8.5pt;',
    '  font-weight: 600;',
    '}',
    '.alert-chip.danger { background: #fde8e8; color: #8b0000; border: 1px solid #f0a0a0; }',
    '.alert-chip.warning { background: #fff4e0; color: #7a3e00; border: 1px solid #f0c060; }',
    '.alert-chip.ok { background: #e8f5ea; color: #1a4c27; border: 1px solid #a0d4a8; }',
    '.alert-chip.info { background: #e8f0f8; color: #1a3a5c; border: 1px solid #a0b8d8; }',

    /* Section headings */
    '.section-heading {',
    '  font-size: 11pt;',
    '  font-weight: 700;',
    '  color: #1a3a5c;',
    '  border-bottom: 2px solid #c4611a;',
    '  padding-bottom: 4px;',
    '  margin: 18px 0 10px 0;',
    '}',
    '.section-heading:first-child { margin-top: 0; }',

    /* Generic tables */
    'table {',
    '  width: 100%;',
    '  border-collapse: collapse;',
    '  font-size: 9pt;',
    '  margin-bottom: 12px;',
    '}',
    'th {',
    '  background: #1a3a5c;',
    '  color: #fff;',
    '  padding: 6px 8px;',
    '  text-align: left;',
    '  font-size: 8pt;',
    '  font-weight: 600;',
    '  letter-spacing: 0.3px;',
    '}',
    'td {',
    '  padding: 5px 8px;',
    '  border-bottom: 1px solid #e4eaf0;',
    '  vertical-align: top;',
    '}',
    'tr:last-child td { border-bottom: none; }',
    'tr:nth-child(even) td { background: #f5f8fb; }',
    '.td-num {',
    '  font-family: "Courier New", monospace;',
    '  text-align: right;',
    '}',
    '.td-center { text-align: center; }',

    /* Unit count boxes */
    '.unit-box-row {',
    '  display: flex;',
    '  gap: 12px;',
    '  margin-bottom: 14px;',
    '}',
    '.unit-box {',
    '  flex: 1;',
    '  border-radius: 6px;',
    '  padding: 10px 12px;',
    '  text-align: center;',
    '}',
    '.unit-box.by-right { background: #e8f0f8; border: 1px solid #a0b8d8; }',
    '.unit-box.state-law { background: #fff4e0; border: 1px solid #f0c060; }',
    '.unit-box.max-possible { background: #e8f5ea; border: 1px solid #a0d4a8; }',
    '.unit-box .ub-num { font-size: 22pt; font-weight: 700; color: #1a3a5c; line-height: 1; }',
    '.unit-box.state-law .ub-num { color: #7a3e00; }',
    '.unit-box.max-possible .ub-num { color: #1a4c27; }',
    '.unit-box .ub-label { font-size: 8pt; color: #555; margin-top: 4px; font-weight: 600; }',

    /* Law cards */
    '.law-card {',
    '  border: 1px solid #d0d8e0;',
    '  border-radius: 4px;',
    '  padding: 8px 10px;',
    '  margin-bottom: 8px;',
    '  display: grid;',
    '  grid-template-columns: 90px 1fr 180px;',
    '  gap: 8px;',
    '  align-items: start;',
    '}',
    '.law-card .law-name { font-weight: 700; font-size: 9pt; color: #1a3a5c; }',
    '.law-card .law-status {',
    '  font-size: 8pt;',
    '  padding: 2px 7px;',
    '  border-radius: 3px;',
    '  font-weight: 700;',
    '  display: inline-block;',
    '  margin-top: 2px;',
    '}',
    '.law-card .law-status.eligible { background: #e8f5ea; color: #1a4c27; }',
    '.law-card .law-status.ineligible { background: #fde8e8; color: #8b0000; }',
    '.law-card .law-status.conditional { background: #fff4e0; color: #7a3e00; }',
    '.law-card .law-desc { font-size: 8pt; color: #444; line-height: 1.4; }',
    '.law-card .law-cite { font-size: 7.5pt; color: #888; font-style: italic; margin-top: 2px; }',

    /* Restriction cards */
    '.restrict-grid {',
    '  display: grid;',
    '  grid-template-columns: 1fr 1fr;',
    '  gap: 10px;',
    '  margin-bottom: 12px;',
    '}',
    '.restrict-card {',
    '  border-radius: 4px;',
    '  padding: 10px;',
    '  border: 1px solid;',
    '}',
    '.restrict-card.active { border-color: #f0a0a0; background: #fff5f5; }',
    '.restrict-card.inactive { border-color: #d0d8e0; background: #f8fafb; }',
    '.restrict-card .rc-title {',
    '  font-size: 9pt;',
    '  font-weight: 700;',
    '  margin-bottom: 6px;',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 6px;',
    '}',
    '.restrict-card.active .rc-title { color: #8b0000; }',
    '.restrict-card.inactive .rc-title { color: #555; }',
    '.restrict-card ul { padding-left: 14px; }',
    '.restrict-card li { font-size: 8pt; color: #444; line-height: 1.5; }',
    '.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }',
    '.dot.active { background: #c00; }',
    '.dot.inactive { background: #aaa; }',

    /* KPI summary row */
    '.kpi-row {',
    '  display: flex;',
    '  gap: 10px;',
    '  margin-bottom: 14px;',
    '}',
    '.kpi-card {',
    '  flex: 1;',
    '  border: 1px solid #d0d8e0;',
    '  border-radius: 4px;',
    '  padding: 8px 10px;',
    '  text-align: center;',
    '}',
    '.kpi-card .kpi-val {',
    '  font-size: 13pt;',
    '  font-weight: 700;',
    '  color: #1a3a5c;',
    '  font-family: "Courier New", monospace;',
    '}',
    '.kpi-card .kpi-lbl { font-size: 7.5pt; color: #666; margin-top: 2px; }',
    '.kpi-card.positive .kpi-val { color: #2e7041; }',
    '.kpi-card.negative .kpi-val { color: #b22; }',

    /* ROI table alt bg */
    '.roi-positive { color: #2e7041; font-weight: 700; }',
    '.roi-negative { color: #b22; font-weight: 700; }',

    /* Assumptions list */
    '.assume-list {',
    '  padding-left: 16px;',
    '}',
    '.assume-list li {',
    '  font-size: 8pt;',
    '  color: #444;',
    '  line-height: 1.6;',
    '}',

    /* Footer */
    '.doc-footer {',
    '  position: absolute;',
    '  bottom: 0.4in;',
    '  left: 0.75in;',
    '  right: 0.75in;',
    '  border-top: 1px solid #d0d8e0;',
    '  padding-top: 5px;',
    '  font-size: 7pt;',
    '  color: #888;',
    '  display: flex;',
    '  justify-content: space-between;',
    '}',

    /* Print media */
    '@media print {',
    '  @page { size: letter; margin: 0; }',
    '  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
    '  .page { padding: 0.75in 0.75in 0.9in 0.75in; page-break-after: always; }',
    '  .page:last-child { page-break-after: avoid; }',
    '  .no-break { page-break-inside: avoid; }',
    '}',
    '.mid { color: #1a3a5c; font-weight: 600; }',
  ].join('\n');
}

// ── Page header component ─────────────────────────────────────

function _pageHeader(address, apn, date) {
  return '<div class="doc-header">' +
    '<div class="doc-header-left">' +
    '<div class="brand">SB Parcel Explorer &nbsp;|&nbsp; Developer Planning Brief</div>' +
    '<div class="sub">City of Santa Barbara · GIS Data from gisportal.santabarbaraca.gov · Planning Analysis Tool</div>' +
    '</div>' +
    '<div class="doc-header-right">' +
    '<div class="date">' + date + '</div>' +
    '<div>' + (apn || '') + '</div>' +
    '</div>' +
    '</div>';
}

// ── Page footer component ─────────────────────────────────────

function _pageFooter(date) {
  return '<div class="doc-footer">' +
    '<span>Generated by SB Parcel Explorer &nbsp;|&nbsp; santabarbaraca.gov GIS Data &nbsp;|&nbsp; Not legal advice — verify with SB Planning Division</span>' +
    '<span>' + date + '</span>' +
    '</div>';
}

// ── Page 1: Header + Summary ──────────────────────────────────

function _buildPage1(d) {
  var date      = _today();
  var address   = d.address || 'Address Unknown';
  var apn       = d.apn     || '—';
  var lat       = d.lat     ? d.lat.toFixed(6) : '—';
  var lng       = d.lng     ? d.lng.toFixed(6) : '—';
  var report    = d.report  || {};
  var parcel    = d.parcelAttrs || {};
  var zoning    = d.zoningAttrs || {};

  // report.score is an object {score, label, color} from analyzeParcel()
  var scoreObj   = (report.score && typeof report.score === 'object') ? report.score : {};
  var score      = scoreObj.score  || (typeof report.score === 'number' ? report.score : 0);
  var scoreLabel = scoreObj.label  || report.scoreLabel || 'Not Scored';
  var scoreColor = scoreObj.color  || _scoreColor(score);

  // Zone from zoning layer or report summary
  var rptSummary = report.summary || {};
  var zone    = _val(zoning, 'ZONE_NAME', _val(zoning, 'ZONE', rptSummary.zone || '—'));
  var acres   = _val(parcel, 'GIS_ACRES', _val(parcel, 'ACRES', rptSummary.acreage || '—'));
  if (typeof acres === 'number') acres = acres.toFixed(3);
  var yrBlt   = _val(parcel, 'YEAR_BUILT', _val(parcel, 'YR_BLT', _val(parcel, 'YearBuilt', '—')));
  var netAV   = _val(parcel, 'NET_AV', _val(parcel, 'NETAV', _val(parcel, 'NetSecVal', null)));
  var landVal = _val(parcel, 'LAND_VALUE', _val(parcel, 'LAND_VAL', _val(parcel, 'LandValue', null)));
  var lotSqft = _val(parcel, 'LOT_SQFT', _val(parcel, 'LOTSQFT', null));
  // Derive lot sqft from acreage if not available
  if (!lotSqft && rptSummary.acreage) lotSqft = Math.round(parseFloat(rptSummary.acreage) * 43560);

  var netAVFmt   = netAV  ? _fmt$(netAV)  : '—';
  var landValFmt = landVal ? _fmt$(landVal) : '—';
  var lotSqftFmt = lotSqft ? Number(lotSqft).toLocaleString() + ' sf' : '—';

  // Alerts — use analyzer sub-objects for correct flag lookup
  var alerts = '';
  var ctx = d.context || {};
  var coastal  = (ctx.isCoastal  || (report.coastalAnalysis  && report.coastalAnalysis.inCoastalZone)  || report.isCoastal);
  var highFire = (ctx.isHighFire || (report.fireAnalysis     && report.fireAnalysis.inHighFireZone)     || report.isHighFire);
  var historic = (ctx.isHistoric || (report.historicAnalysis && report.historicAnalysis.isHistoric)     || report.isHistoric);
  var flood    = (ctx.isFlood    || (report.floodAnalysis    && report.floodAnalysis.inFloodZone)       || report.isFlood);
  if (coastal)  alerts += '<span class="alert-chip danger">COASTAL ZONE — CDP Required</span>';
  if (highFire) alerts += '<span class="alert-chip danger">HIGH FIRE HAZARD AREA</span>';
  if (historic) alerts += '<span class="alert-chip warning">HISTORIC OVERLAY — HLC Review</span>';
  if (flood)    alerts += '<span class="alert-chip warning">FEMA FLOOD ZONE</span>';
  if (!alerts)  alerts  = '<span class="alert-chip ok">No Active Hazard Overlays</span>';

  return '<div class="page">' +
    _pageHeader(address, apn, date) +

    '<div class="prop-block">' +
    '<div>' +
    '<div class="prop-address">' + address + '</div>' +
    '<div class="prop-apn">APN: ' + apn + '</div>' +
    '<div class="prop-coords">Lat: ' + lat + ' &nbsp; Lng: ' + lng + '</div>' +
    '</div>' +
    '<div class="score-badge" style="background:' + scoreColor + '">' +
    '<div class="num">' + score + '</div>' +
    '<div class="lbl">' + scoreLabel + '</div>' +
    '</div>' +
    '</div>' +

    '<div class="summary-grid">' +
    '<div class="sg-cell"><div class="sg-label">Zone</div><div class="sg-value">' + zone + '</div></div>' +
    '<div class="sg-cell"><div class="sg-label">Acreage</div><div class="sg-value">' + acres + '</div></div>' +
    '<div class="sg-cell"><div class="sg-label">Year Built</div><div class="sg-value">' + yrBlt + '</div></div>' +
    '<div class="sg-cell"><div class="sg-label">Net AV</div><div class="sg-value">' + netAVFmt + '</div></div>' +
    '<div class="sg-cell"><div class="sg-label">Land Value</div><div class="sg-value">' + landValFmt + '</div></div>' +
    '<div class="sg-cell"><div class="sg-label">Lot Sq Ft</div><div class="sg-value">' + lotSqftFmt + '</div></div>' +
    '</div>' +

    '<div class="alert-row">' + alerts + '</div>' +

    '<div class="section-heading">Executive Summary</div>' +
    _buildContextSummary(d) +

    _pageFooter(date) +
    '</div>';
}

function _buildContextSummary(d) {
  var report = d.report || {};
  var factors = report.factors || report.scoreFactors || [];
  var summary = report.summary || '';

  var html = '';
  if (summary) {
    html += '<p style="font-size:9pt;color:#333;margin-bottom:10px;line-height:1.6;">' + summary + '</p>';
  }

  if (factors && factors.length) {
    html += '<table><thead><tr><th>Score Factor</th><th style="text-align:right">Impact</th></tr></thead><tbody>';
    for (var i = 0; i < factors.length; i++) {
      var f = factors[i];
      var pts = f.points !== undefined ? f.points : (f.impact || '—');
      var color = (typeof pts === 'number' && pts < 0) ? 'color:#b22' : (typeof pts === 'number' && pts > 0 ? 'color:#2e7041' : '');
      var sign = (typeof pts === 'number' && pts > 0) ? '+' : '';
      html += '<tr><td>' + (f.label || f.name || '—') + '</td>' +
              '<td class="td-num" style="' + color + '">' + sign + pts + '</td></tr>';
    }
    html += '</tbody></table>';
  }

  return html || '<p style="font-size:9pt;color:#888;">Run the Dev Report analysis in the app to populate score factors.</p>';
}

// ── Page 2: What Can I Build ──────────────────────────────────

function _buildPage2(d) {
  var date   = _today();
  var report = d.report  || {};
  var zoning = d.zoningAttrs || {};
  var parcel = d.parcelAttrs || {};

  // Unit counts — report.maxUnits is an object {byRight, withStateLaw, absolute}
  var muObj   = (report.maxUnits && typeof report.maxUnits === 'object') ? report.maxUnits : {};
  var byRight  = muObj.byRight      || _val(report, 'byRightUnits',  0);
  var stateLaw = muObj.withStateLaw || _val(report, 'stateLawUnits', 0);
  var maxPoss  = muObj.absolute     || _val(report, 'maxUnits',      0);

  // Buildable area from report.buildableCalc or zoning
  var bc      = report.buildableCalc || {};
  var far     = bc.maxFAR     || _val(zoning, 'FAR', '—');
  var maxSqft = bc.maxBuildableSqft || null;
  var height  = bc.maxHeight  || _val(zoning, 'MAX_HEIGHT', '—');
  var setback = bc.setbacks   || _val(zoning, 'FRONT_SETBACK', '—');
  var coverage= bc.maxLotCoverage || _val(zoning, 'LOT_COVERAGE', '—');

  if (typeof far === 'number') far = far.toFixed(2);
  if (typeof maxSqft === 'number') maxSqft = maxSqft.toLocaleString() + ' sf';
  if (typeof height === 'number') height = height + ' ft';
  if (typeof coverage === 'number') coverage = (coverage * 100).toFixed(0) + '%';

  // State law rows from report
  var lawRows = report.lawAnalysis || report.stateLaws || [];

  return '<div class="page">' +
    _pageHeader(d.address, d.apn, date) +

    '<div class="section-heading">What Can I Build?</div>' +

    '<div class="unit-box-row">' +
    '<div class="unit-box by-right"><div class="ub-num">' + byRight + '</div><div class="ub-label">By-Right Units</div></div>' +
    '<div class="unit-box state-law"><div class="ub-num">' + stateLaw + '</div><div class="ub-label">With State Law</div></div>' +
    '<div class="unit-box max-possible"><div class="ub-num">' + maxPoss + '</div><div class="ub-label">Max Possible</div></div>' +
    '</div>' +

    '<div class="section-heading">CA State Law Analysis</div>' +
    _buildLawTable(lawRows, report, d) +

    '<div class="section-heading">Buildable Area &amp; Zoning Standards</div>' +
    '<table><thead><tr><th>Standard</th><th>Value</th><th>Source</th></tr></thead><tbody>' +
    '<tr><td>Floor Area Ratio (FAR)</td><td class="td-num">' + far + '</td><td>Zoning Code</td></tr>' +
    '<tr><td>Max Building Size</td><td class="td-num">' + maxSqft + '</td><td>FAR × Lot Area</td></tr>' +
    '<tr><td>Height Limit</td><td class="td-num">' + height + '</td><td>Zoning Code</td></tr>' +
    '<tr><td>Front Setback / Setbacks</td><td class="td-num">' + setback + '</td><td>Zoning Code</td></tr>' +
    '<tr><td>Lot Coverage</td><td class="td-num">' + coverage + '</td><td>Zoning Code</td></tr>' +
    '</tbody></table>' +

    _pageFooter(date) +
    '</div>';
}

function _buildLawTable(lawRows, report, d) {
  // Build from report.lawAnalysis if available
  var rows = '';

  // Read from real analyzer output objects
  var ctx   = d.context || {};
  var sb9   = report.sb9Analysis   || {};
  var adu   = report.aduAnalysis   || {};
  var shra  = report.shraAnalysis  || {};

  function _lawStatus(analysis) {
    if (!analysis || Object.keys(analysis).length === 0) return 'conditional';
    if (analysis.eligible === true  || analysis.eligible === 'yes') return 'eligible';
    if (analysis.eligible === false || analysis.eligible === 'no')  return 'ineligible';
    return 'conditional';
  }
  function _lawLabel(analysis) {
    var st = _lawStatus(analysis);
    return st === 'eligible' ? 'Eligible' : (st === 'ineligible' ? 'Not Eligible' : 'Review Needed');
  }
  function _lawNote(analysis) {
    return analysis.note || analysis.reason || analysis.detail || analysis.summary || '—';
  }
  function _lawCite(analysis) {
    return analysis.citation || analysis.cite || '—';
  }

  if (lawRows && lawRows.length > 0) {
    for (var i = 0; i < lawRows.length; i++) {
      var lr = lawRows[i];
      var st = lr.eligible ? 'eligible' : (lr.eligible === false ? 'ineligible' : 'conditional');
      var sl = lr.eligible ? 'Eligible' : (lr.eligible === false ? 'Not Eligible' : 'Conditional');
      rows += '<tr>' +
        '<td><strong>' + (lr.law || lr.name || '—') + '</strong></td>' +
        '<td><span class="law-status ' + st + '">' + sl + '</span></td>' +
        '<td>' + (lr.specs || lr.detail || '—') + '</td>' +
        '<td style="font-size:7.5pt;color:#888;font-style:italic">' + (lr.citation || lr.cite || '—') + '</td>' +
        '</tr>';
    }
  } else {
    // Build rows from actual analyzer objects
    rows =
      '<tr><td><strong>AB 2221 / SB 897 — ADU</strong></td>' +
      '<td><span class="law-status ' + _lawStatus(adu) + '">' + _lawLabel(adu) + '</span></td>' +
      '<td>' + _lawNote(adu) + '</td>' +
      '<td style="font-size:7.5pt;color:#888;font-style:italic">' + _lawCite(adu) + '</td></tr>' +

      '<tr><td><strong>SB 9 — Two-Unit / Lot Split</strong></td>' +
      '<td><span class="law-status ' + _lawStatus(sb9) + '">' + _lawLabel(sb9) + '</span></td>' +
      '<td>' + _lawNote(sb9) + '</td>' +
      '<td style="font-size:7.5pt;color:#888;font-style:italic">' + _lawCite(sb9) + '</td></tr>' +

      '<tr><td><strong>SB 684 / SB 1123 — SHRA</strong></td>' +
      '<td><span class="law-status ' + _lawStatus(shra) + '">' + _lawLabel(shra) + '</span></td>' +
      '<td>' + _lawNote(shra) + '</td>' +
      '<td style="font-size:7.5pt;color:#888;font-style:italic">' + _lawCite(shra) + '</td></tr>';
  }

  return '<table><thead><tr><th>Law / Program</th><th>Status</th><th>Key Specs</th><th>Citation</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

// ── Page 3: Pro Forma Estimate ────────────────────────────────

function _buildPage3(d) {
  var date    = _today();
  var pf      = d.proforma || d.pfResult;  // pfResult is how app.js stores it

  if (!pf) {
    return '<div class="page">' +
      _pageHeader(d.address, d.apn, date) +
      '<div class="section-heading">Pro Forma Estimate</div>' +
      '<p style="font-size:9pt;color:#888;padding:20px 0;">No pro forma data available. Run the Pro Forma Estimator in the app and export again.</p>' +
      _pageFooter(date) +
      '</div>';
  }

  var mode = d.mode || 'sale';

  // Cost breakdown table
  var cbRows = '';
  var cb = pf.costBreakdown || [];
  for (var i = 0; i < cb.length; i++) {
    var item = cb[i];
    var pct  = item.pct ? (item.pct * 100).toFixed(1) + '%' : '—';
    cbRows += '<tr>' +
      '<td>' + (item.label || '—') + '</td>' +
      '<td class="td-num">' + _fmt$(item.range ? item.range.low : null) + '</td>' +
      '<td class="td-num mid">' + _fmt$(item.range ? item.range.mid : null) + '</td>' +
      '<td class="td-num">' + _fmt$(item.range ? item.range.high : null) + '</td>' +
      '<td class="td-num">' + pct + '</td>' +
      '</tr>';
  }
  var tdc = pf.totalDevCost || {};
  cbRows += '<tr style="background:#1a3a5c !important">' +
    '<td style="color:#fff;font-weight:700">TOTAL DEV COST</td>' +
    '<td class="td-num" style="color:#fff">' + _fmt$(tdc.low) + '</td>' +
    '<td class="td-num" style="color:#c4d8f0;font-weight:700">' + _fmt$(tdc.mid) + '</td>' +
    '<td class="td-num" style="color:#fff">' + _fmt$(tdc.high) + '</td>' +
    '<td class="td-num" style="color:#fff">100%</td>' +
    '</tr>';

  // Revenue / ROI section
  var revenueHtml = '';
  if (mode === 'rent') {
    var gmr  = pf.grossMonthlyRent  || {};
    var gare = pf.grossAnnualRent   || {};
    var noi  = pf.noi               || {};
    var iv   = pf.incomeValue       || {};
    revenueHtml =
      '<div class="section-heading">Revenue &amp; ROI — Hold &amp; Rent</div>' +
      '<table><thead><tr><th>Metric</th><th>Low</th><th>Mid</th><th>High</th></tr></thead><tbody>' +
      '<tr><td>Gross Monthly Rent</td><td class="td-num">' + _fmt$(gmr.low) + '</td><td class="td-num mid">' + _fmt$(gmr.mid) + '</td><td class="td-num">' + _fmt$(gmr.high) + '</td></tr>' +
      '<tr><td>Gross Annual Rent</td><td class="td-num">' + _fmt$(gare.low) + '</td><td class="td-num mid">' + _fmt$(gare.mid) + '</td><td class="td-num">' + _fmt$(gare.high) + '</td></tr>' +
      '<tr><td>Net Operating Income (NOI)</td><td class="td-num">' + _fmt$(noi.low) + '</td><td class="td-num mid">' + _fmt$(noi.mid) + '</td><td class="td-num">' + _fmt$(noi.high) + '</td></tr>' +
      '<tr><td>Income Capitalized Value</td><td class="td-num">' + _fmt$(iv.low) + '</td><td class="td-num mid">' + _fmt$(iv.mid) + '</td><td class="td-num">' + _fmt$(iv.high) + '</td></tr>' +
      '</tbody></table>';
  } else {
    var sr  = pf.saleRevenue || {};
    var np  = pf.netProfit   || {};
    var roi = pf.roi         || {};
    var npMidClass = (np.mid && np.mid >= 0) ? 'roi-positive' : 'roi-negative';
    revenueHtml =
      '<div class="section-heading">Revenue &amp; ROI — For Sale</div>' +
      '<table><thead><tr><th>Metric</th><th>Low</th><th>Mid</th><th>High</th></tr></thead><tbody>' +
      '<tr><td>Sale Revenue</td><td class="td-num">' + _fmt$(sr.low) + '</td><td class="td-num mid">' + _fmt$(sr.mid) + '</td><td class="td-num">' + _fmt$(sr.high) + '</td></tr>' +
      '<tr><td>Net Profit</td>' +
      '<td class="td-num ' + ((np.low >= 0) ? 'roi-positive' : 'roi-negative') + '">' + _fmt$(np.low) + '</td>' +
      '<td class="td-num ' + npMidClass + '">' + _fmt$(np.mid) + '</td>' +
      '<td class="td-num ' + ((np.high >= 0) ? 'roi-positive' : 'roi-negative') + '">' + _fmt$(np.high) + '</td>' +
      '</tr>' +
      '<tr><td>ROI %</td><td class="td-num">' + roi.low + '%</td><td class="td-num mid">' + roi.mid + '%</td><td class="td-num">' + roi.high + '%</td></tr>' +
      '</tbody></table>';
  }

  // Assumptions
  var assumptionHtml = '';
  var assumptions = pf.assumptions || [];
  if (assumptions.length) {
    assumptionHtml = '<div class="section-heading">Key Assumptions</div><ul class="assume-list">';
    for (var j = 0; j < assumptions.length; j++) {
      assumptionHtml += '<li>' + assumptions[j] + '</li>';
    }
    assumptionHtml += '</ul>';
  }

  return '<div class="page">' +
    _pageHeader(d.address, d.apn, date) +
    '<div class="section-heading">Pro Forma Cost Breakdown — ' + (pf.scenarioLabel || pf.scenario || 'Development') + '</div>' +
    '<table><thead><tr><th>Cost Category</th><th>Low</th><th>Mid</th><th>High</th><th>% of TDC</th></tr></thead><tbody>' + cbRows + '</tbody></table>' +
    revenueHtml +
    assumptionHtml +
    _pageFooter(date) +
    '</div>';
}

// ── Page 4: Restrictions & Permits ────────────────────────────

function _buildPage4(d) {
  var date   = _today();
  var report = d.report  || {};
  var ctx    = d.context || {};

  var isCoastal  = !!(ctx.isCoastal  || (report.coastalAnalysis  && report.coastalAnalysis.inCoastalZone)  || report.isCoastal);
  var isHighFire = !!(ctx.isHighFire || (report.fireAnalysis     && report.fireAnalysis.inHighFireZone)     || report.isHighFire);
  var isHistoric = !!(ctx.isHistoric || (report.historicAnalysis && report.historicAnalysis.isHistoric)     || report.isHistoric);
  var isFlood    = !!(ctx.isFlood    || (report.floodAnalysis    && report.floodAnalysis.inFloodZone)       || report.isFlood);

  // Restriction cards
  var restrictCards = _buildRestrictCards(isCoastal, isHighFire, isHistoric, isFlood, report);

  // Permits table
  var permitsHtml = _buildPermitsTable(isCoastal, isHighFire, isHistoric, report);

  return '<div class="page">' +
    _pageHeader(d.address, d.apn, date) +
    '<div class="section-heading">Restrictions &amp; Overlays</div>' +
    restrictCards +
    '<div class="section-heading">Permits Required</div>' +
    permitsHtml +
    _pageFooter(date) +
    '</div>';
}

function _buildRestrictCards(isCoastal, isHighFire, isHistoric, isFlood, report) {
  function card(active, title, bullets) {
    var cls = active ? 'active' : 'inactive';
    var dotCls = active ? 'active' : 'inactive';
    var li = '';
    for (var i = 0; i < bullets.length; i++) li += '<li>' + bullets[i] + '</li>';
    return '<div class="restrict-card ' + cls + '">' +
      '<div class="rc-title"><span class="dot ' + dotCls + '"></span>' + title + '</div>' +
      '<ul>' + li + '</ul>' +
      '</div>';
  }

  var coastal = card(isCoastal, 'Coastal Zone', isCoastal ? [
    'Coastal Development Permit (CDP) required for most projects',
    'California Coastal Commission or City may have jurisdiction',
    'Appeal jurisdiction may apply — check SB Planning',
    'Public access and visual corridor requirements apply',
    'Additional environmental review likely required',
  ] : [
    'Parcel is NOT within the Coastal Zone boundary',
    'Standard building permit process applies',
    'No CDP required for this location',
  ]);

  var fire = card(isHighFire, 'High Fire Hazard', isHighFire ? [
    'State Responsibility Area (SRA) or Very High Fire Hazard Severity Zone (VHFHSZ)',
    'Chapter 7A construction standards required (fire-resistant materials)',
    'Defensible space clearance: 100 ft or to property line',
    'Fire clearance and Fire Department inspection required',
    'Construction cost premium: est. 5–15% over standard',
  ] : [
    'Parcel is NOT within a designated High Fire Hazard Area',
    'Standard fire code requirements apply',
    'No Chapter 7A premium required',
  ]);

  var historic = card(isHistoric, 'Historic Resources', isHistoric ? [
    'Historic Landmarks Commission (HLC) review required',
    'Secretary of the Interior Standards for Rehabilitation apply',
    'Demolition or significant alteration requires HLC approval',
    'Historic tax credits may be available (Federal 20%, CA 25%)',
    'Review timeline: 60–120 days for full HLC hearing',
  ] : [
    'No historic overlay identified for this parcel',
    'Verify with SB Historic Resources Survey before demolition',
    'Check for Mills Act contracts if applicable',
  ]);

  var flood = card(isFlood, 'FEMA Flood Zone', isFlood ? [
    'Property is within a FEMA Special Flood Hazard Area (SFHA)',
    'Flood insurance required for federally backed mortgages',
    'Finished floor elevation must meet Base Flood Elevation (BFE)',
    'Floodplain development permit required',
    'Substantial improvement rule: >50% repair triggers full upgrade',
  ] : [
    'Parcel is NOT within a mapped FEMA flood hazard area',
    'Verify with current FEMA FIRM maps at msc.fema.gov',
    'No floodplain development permit required',
  ]);

  return '<div class="restrict-grid">' + coastal + fire + historic + flood + '</div>';
}

function _buildPermitsTable(isCoastal, isHighFire, isHistoric, report) {
  var permits = [
    { name: 'Building Permit',            authority: 'SB Building & Safety',     req: 'Required',          timeline: '3–6 months' },
    { name: 'Architectural / Design Review', authority: 'SB Planning Division',  req: 'Required (most)',   timeline: '4–8 weeks' },
    { name: 'Grading Permit',             authority: 'SB Building & Safety',     req: 'If > 50 cu yd',     timeline: '2–4 weeks' },
    { name: 'Electrical / Plumbing / Mech', authority: 'SB Building & Safety',   req: 'Required',          timeline: 'With building permit' },
    { name: 'School Impact Fee',          authority: 'SB Unified / SBCC',        req: 'Required (new res)', timeline: 'At permit issuance' },
    { name: 'Water / Sewer Connection',   authority: 'SB Public Works',          req: 'Required',          timeline: '4–8 weeks' },
  ];

  if (isCoastal) {
    permits.splice(1, 0, {
      name: 'Coastal Development Permit (CDP)',
      authority: 'SB Planning / CCC',
      req: 'Required',
      timeline: '3–12 months'
    });
  }

  if (isHighFire) {
    permits.push({
      name: 'Fire Department Clearance',
      authority: 'SB Fire Department',
      req: 'Required (Fire Zone)',
      timeline: '2–4 weeks'
    });
  }

  if (isHistoric) {
    permits.splice(1, 0, {
      name: 'Certificate of Appropriateness',
      authority: 'Historic Landmarks Commission',
      req: 'Required',
      timeline: '60–120 days'
    });
  }

  // Add from report if available
  var reportPermits = report.permits || report.permitsRequired || [];
  for (var i = 0; i < reportPermits.length; i++) {
    var rp = reportPermits[i];
    permits.push({
      name:      rp.name || rp.permit || '—',
      authority: rp.authority || rp.agency || '—',
      req:       rp.required || rp.type || 'See Planning',
      timeline:  rp.timeline || rp.time || '—',
    });
  }

  var rows = '';
  for (var j = 0; j < permits.length; j++) {
    var p = permits[j];
    var reqClass = (p.req === 'Required') ? 'style="color:#8b0000;font-weight:700"' : '';
    rows += '<tr><td>' + p.name + '</td><td>' + p.authority + '</td>' +
            '<td ' + reqClass + '>' + p.req + '</td><td>' + p.timeline + '</td></tr>';
  }

  return '<table><thead><tr>' +
    '<th>Permit / Approval</th><th>Authority</th><th>Required / Conditional</th><th>Est. Timeline</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>' +
    '<p style="font-size:7.5pt;color:#888;margin-top:6px;">Timeline estimates are from application submission to approval. Complex projects, appeals, or environmental review will extend these. Always confirm with SB Planning Division at (805) 564-5470.</p>';
}

// ── Main generator function ───────────────────────────────────

/**
 * generateReport(parcelData)
 * @param {Object} parcelData - { parcelAttrs, zoningAttrs, report, proforma, address, apn, lat, lng, context, mode }
 */
function generateReport(parcelData) {
  var d = parcelData || {};

  var w = window.open('', '_blank', 'width=900,height=700');
  if (!w) {
    alert('Pop-up blocked. Please allow pop-ups for this site to export the PDF report.');
    return;
  }

  var css  = _buildCSS();
  var pg1  = _buildPage1(d);
  var pg2  = _buildPage2(d);
  var pg3  = _buildPage3(d);
  var pg4  = _buildPage4(d);

  var html = '<!DOCTYPE html>\n' +
    '<html lang="en">\n' +
    '<head>\n' +
    '<meta charset="UTF-8" />\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n' +
    '<title>SB Parcel Report — ' + (d.address || d.apn || 'Parcel') + '</title>\n' +
    '<style>\n' + css + '\n</style>\n' +
    '</head>\n' +
    '<body>\n' +
    pg1 + '\n' +
    pg2 + '\n' +
    pg3 + '\n' +
    pg4 + '\n' +
    '</body>\n' +
    '</html>';

  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(function() { w.print(); }, 800);
}

// ── Export ────────────────────────────────────────────────────

window.PDFExport = {
  generateReport: generateReport,
};
