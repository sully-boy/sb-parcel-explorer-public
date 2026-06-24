/* ============================================================
   Santa Barbara Parcel Explorer — Tier 1 Data Features
   Provides enriched data modules for the parcel detail panel:
     1. Street View embed
     2. Permit history (Layer 264 — ADU Permits)
     3. Nearby schools (Layer 7)
     4. Water pressure zone (Layer 133)
     5. Nearby ADU comps (Layer 264)
     6. Ownership signal analysis
   ============================================================ */

'use strict';

// ── Shared constants ─────────────────────────────────────────
var DF_BASE = 'https://gisportal.santabarbaraca.gov/server1/rest/services/CitySantaBarbara/MapServer';

// Internal ArcGIS REST fetch helper — mirrors queryLayer in app.js
// but is self-contained so this module has no external dependencies.
function dfFetch(layerId, params) {
  var url = DF_BASE + '/' + layerId + '/query';
  var defaults = {
    f: 'json',
    returnGeometry: 'false',
    outSR: '2229',
    resultRecordCount: '100'
  };
  var merged = {};
  var key;
  for (key in defaults) {
    if (defaults.hasOwnProperty(key)) merged[key] = defaults[key];
  }
  for (key in params) {
    if (params.hasOwnProperty(key)) merged[key] = params[key];
  }
  var qs = new URLSearchParams(merged).toString();
  return fetch(url + '?' + qs).then(function (res) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }).then(function (data) {
    if (data && data.error) throw new Error((data.error.message || 'ArcGIS error'));
    return data;
  });
}

// ── Utility: epoch ms → readable date string ─────────────────
function epochToDate(ms) {
  if (!ms && ms !== 0) return '—';
  var n = parseInt(ms, 10);
  if (!n || n <= 0) return '—';
  try {
    var d = new Date(n);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (e) {
    return '—';
  }
}

// ── Utility: distance in feet between two projected EPSG:2229 points ──
function distanceFt(x1, y1, x2, y2) {
  var dx = x2 - x1;
  var dy = y2 - y1;
  // EPSG:2229 units are US survey feet — so direct Pythagorean distance is ft
  return Math.round(Math.sqrt(dx * dx + dy * dy));
}

// ── Utility: build an envelope string for ArcGIS geometry param ──
function buildEnvelope(cx, cy, halfSideFt) {
  return JSON.stringify({
    xmin: cx - halfSideFt,
    ymin: cy - halfSideFt,
    xmax: cx + halfSideFt,
    ymax: cy + halfSideFt,
    spatialReference: { wkid: 2229 }
  });
}

// ── Utility: build a point geometry string for intersect queries ──
function buildPoint(cx, cy) {
  return JSON.stringify({
    x: cx,
    y: cy,
    spatialReference: { wkid: 2229 }
  });
}

// ============================================================
// 1. STREET VIEW
// ============================================================

/**
 * getStreetViewHTML(lat, lng, address)
 * Returns an HTML string with an embedded Google Street View iframe
 * and a fallback link.
 */
function getStreetViewHTML(lat, lng, address) {
  var fallbackUrl = 'https://www.google.com/maps?q=' + encodeURIComponent(lat + ',' + lng) +
    '&layer=c&cbll=' + lat + ',' + lng + '&cbp=12,0,,0,0&z=18&output=svembed';
  var mapsUrl = 'https://www.google.com/maps?q=' + lat + ',' + lng + '&layer=c&cbll=' + lat + ',' + lng;
  var addrLabel = address ? address : lat + ', ' + lng;

  return '<div class="df-streetview-wrap">' +
    '<div class="df-section-label">Street View</div>' +
    '<div class="df-streetview-frame">' +
      '<iframe ' +
        'src="' + fallbackUrl + '" ' +
        'width="100%" ' +
        'height="200" ' +
        'frameborder="0" ' +
        'style="border:0;border-radius:8px;width:100%;height:200px;" ' +
        'allowfullscreen ' +
        'loading="lazy" ' +
        'referrerpolicy="no-referrer-when-downgrade" ' +
        'title="Street View of ' + addrLabel.replace(/"/g, '&quot;') + '">' +
      '</iframe>' +
    '</div>' +
    '<a class="df-link" href="' + mapsUrl + '" target="_blank" rel="noopener noreferrer">' +
      'Open in Google Maps Street View ↗' +
    '</a>' +
  '</div>';
}

// ============================================================
// 2. PERMIT HISTORY
// ============================================================

/**
 * fetchPermitHistory(apn, cx, cy) — async
 * Queries Layer 264 (ADU Permits) for this APN and nearby permits
 * within a 300ft spatial envelope.
 * Returns array of parsed permit objects.
 */
function fetchPermitHistory(apn, cx, cy) {
  var apnClean = apn ? String(apn).trim().replace(/'/g, "''") : '';
  var envelope300 = buildEnvelope(cx, cy, 300);

  // Query 1: by APN
  var q1 = dfFetch(264, {
    where: "APN='" + apnClean + "'",
    outFields: '*',
    returnGeometry: 'false'
  }).catch(function () { return { features: [] }; });

  // Query 2: spatial — 300ft envelope
  var q2 = dfFetch(264, {
    where: '1=1',
    geometry: envelope300,
    geometryType: 'esriGeometryEnvelope',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    returnGeometry: 'false'
  }).catch(function () { return { features: [] }; });

  return Promise.all([q1, q2]).then(function (results) {
    var seen = {};
    var permits = [];

    function parseFeature(f) {
      var a = f.attributes || {};
      var id = a.OBJECTID || a.objectid || a.GlobalID || a.globalid || JSON.stringify(a).slice(0, 40);
      if (seen[id]) return;
      seen[id] = true;
      permits.push({
        recordId:    a.dbo_V_RECORD_RECORD_ID || a.Record_ID  || a.RecordID   || '—',
        recordName:  a.RECORD_NAME  || a.Record_Name || a.RecordName  || '—',
        description: a.DESCRIPTION  || a.Description || a.description || '—',
        status:      a.STATUS       || a.Status      || a.status      || '—',
        statusGroup: a.Status_Group || a.StatusGroup || '—',
        type:        a.Type         || a.Record_Type || a.RecordType  || '—',
        openDate:    epochToDate(a.RECORD_OPEN_DATE || a.Open_Date || a.OpenDate),
        bpIssuedDate: epochToDate(a.BP_Issued_Date || a.BPIssuedDate || a.BP_ISSUED_DATE),
        cofDate:     epochToDate(a.CofO_Date || a.COF_Date || a.COFDate || a.CO_Date),
        aduUnits:    a.ADU_Units    || a.ADUUnits    || a.Num_ADU_Units || '—',
        address:     a.ADDR_FULL_LINE_ || a.Address  || a.address || a.SITE_ADDRESS || '—',
        apn:         a.APN          || a.apn         || '—'
      });
    }

    var r1 = (results[0] && results[0].features) ? results[0].features : [];
    var r2 = (results[1] && results[1].features) ? results[1].features : [];
    var i;
    for (i = 0; i < r1.length; i++) parseFeature(r1[i]);
    for (i = 0; i < r2.length; i++) parseFeature(r2[i]);

    // Sort newest first (by openDate field raw epoch if available — fallback alphabetical)
    return permits;
  }).catch(function (err) {
    console.warn('[DataFeatures] fetchPermitHistory failed:', err);
    return [];
  });
}

/**
 * renderPermitHistory(permits)
 * Returns HTML string showing permit cards.
 */
function renderPermitHistory(permits) {
  var html = '<div class="df-section">';
  html += '<div class="df-section-label">Permit History</div>';

  if (!permits || permits.length === 0) {
    html += '<div class="df-empty-note">No permit records found on this parcel via City GIS.</div>';
  } else {
    html += '<div class="df-permit-list">';
    for (var i = 0; i < permits.length; i++) {
      var p = permits[i];

      // Status badge color
      var sg = (p.statusGroup || p.status || '').toLowerCase();
      var badgeClass = 'df-badge-orange';
      if (sg.indexOf('complete') !== -1 || sg.indexOf('final') !== -1 || sg.indexOf('issued') !== -1 && sg.indexOf('c of o') !== -1) {
        badgeClass = 'df-badge-green';
      } else if (sg.indexOf('issued') !== -1 || sg.indexOf('approved') !== -1) {
        badgeClass = 'df-badge-blue';
      } else if (sg.indexOf('void') !== -1 || sg.indexOf('cancel') !== -1 || sg.indexOf('expired') !== -1) {
        badgeClass = 'df-badge-gray';
      }

      html += '<div class="df-permit-card">';
      html += '<div class="df-permit-header">';
      html += '<span class="df-permit-name">' + escHtml(p.recordName !== '—' ? p.recordName : p.recordId) + '</span>';
      html += '<span class="df-badge ' + badgeClass + '">' + escHtml(p.statusGroup !== '—' ? p.statusGroup : p.status) + '</span>';
      html += '</div>';

      if (p.address && p.address !== '—') {
        html += '<div class="df-permit-addr">' + escHtml(p.address) + '</div>';
      }
      if (p.type && p.type !== '—') {
        html += '<div class="df-permit-meta">Type: ' + escHtml(p.type) + '</div>';
      }
      if (p.description && p.description !== '—') {
        html += '<div class="df-permit-desc">' + escHtml(p.description) + '</div>';
      }

      var dates = [];
      if (p.openDate && p.openDate !== '—') dates.push('Opened: ' + p.openDate);
      if (p.bpIssuedDate && p.bpIssuedDate !== '—') dates.push('BP Issued: ' + p.bpIssuedDate);
      if (p.cofDate && p.cofDate !== '—') dates.push('C of O: ' + p.cofDate);
      if (dates.length) {
        html += '<div class="df-permit-dates">' + dates.join(' &nbsp;·&nbsp; ') + '</div>';
      }

      if (p.aduUnits && p.aduUnits !== '—' && p.aduUnits !== 0) {
        html += '<div class="df-permit-adu">ADU Units: <strong>' + escHtml(String(p.aduUnits)) + '</strong></div>';
      }

      html += '</div>';
    }
    html += '</div>';
  }

  html += '<div class="df-link-row">' +
    '<a class="df-link" href="https://aca-prod.accela.com/santabarbara/" target="_blank" rel="noopener noreferrer">' +
    'Search full permit history on Accela ↗</a>' +
    '</div>';

  html += '</div>';
  return html;
}

// ============================================================
// 3. NEARBY SCHOOLS
// ============================================================

/**
 * fetchNearbySchools(cx, cy) — async
 * Queries Layer 7 (Schools) using a 1-mile (5280ft) envelope.
 * Returns array of school objects.
 */
function fetchNearbySchools(cx, cy) {
  var envelope = buildEnvelope(cx, cy, 5280);

  return dfFetch(7, {
    where: '1=1',
    geometry: envelope,
    geometryType: 'esriGeometryEnvelope',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'Name,Grade,Address,Private,OBJECTID,Shape',
    returnGeometry: 'true',
    outSR: '2229'
  }).then(function (data) {
    var features = (data && data.features) ? data.features : [];
    var schools = [];
    for (var i = 0; i < features.length; i++) {
      var f = features[i];
      var a = f.attributes || {};
      // Estimate distance from envelope center to feature centroid if geometry available
      var distFt = null;
      if (f.geometry) {
        // Points
        if (typeof f.geometry.x === 'number') {
          distFt = distanceFt(cx, cy, f.geometry.x, f.geometry.y);
        } else if (f.geometry.rings) {
          // Polygon centroid approximation: avg of first ring
          var ring = f.geometry.rings[0] || [];
          if (ring.length) {
            var sx = 0, sy = 0;
            for (var j = 0; j < ring.length; j++) { sx += ring[j][0]; sy += ring[j][1]; }
            distFt = distanceFt(cx, cy, sx / ring.length, sy / ring.length);
          }
        }
      }
      schools.push({
        name:      a.Name    || a.NAME    || a.SCHOOL_NAME || '—',
        grade:     a.Grade   || a.GRADE   || a.GRADE_LEVEL || '—',
        address:   a.Address || a.ADDRESS || '—',
        isPrivate: !!(a.Private || a.PRIVATE),
        distanceFt: distFt !== null ? distFt : null
      });
    }
    // Sort by distance
    schools.sort(function (a, b) {
      if (a.distanceFt === null) return 1;
      if (b.distanceFt === null) return -1;
      return a.distanceFt - b.distanceFt;
    });
    return schools;
  }).catch(function (err) {
    console.warn('[DataFeatures] fetchNearbySchools failed:', err);
    return [];
  });
}

/**
 * renderSchools(schools)
 * Returns HTML string showing school chips.
 */
function renderSchools(schools) {
  var html = '<div class="df-section">';
  html += '<div class="df-section-label">Nearby Schools <span class="df-section-sub">(within 1 mile)</span></div>';

  if (!schools || schools.length === 0) {
    html += '<div class="df-empty-note">No schools found within 1 mile via City GIS.</div>';
  } else {
    html += '<div class="df-school-chips">';
    for (var i = 0; i < schools.length; i++) {
      var s = schools[i];

      // Grade badge label
      var gradeBadge = classifyGrade(s.grade);

      // Public/private tag
      var typeTag = s.isPrivate
        ? '<span class="df-tag df-tag-private">Private</span>'
        : '<span class="df-tag df-tag-public">Public</span>';

      var distStr = s.distanceFt !== null
        ? '<span class="df-school-dist">' + (s.distanceFt < 5280 ? s.distanceFt + ' ft' : (s.distanceFt / 5280).toFixed(2) + ' mi') + '</span>'
        : '';

      html += '<div class="df-school-chip">';
      html += '<div class="df-school-top">';
      html += '<span class="df-school-name">' + escHtml(s.name) + '</span>';
      html += distStr;
      html += '</div>';
      html += '<div class="df-school-tags">';
      if (gradeBadge) html += '<span class="df-badge df-badge-grade">' + escHtml(gradeBadge) + '</span>';
      html += typeTag;
      if (s.grade && s.grade !== '—') html += '<span class="df-school-grade-raw">' + escHtml(s.grade) + '</span>';
      html += '</div>';
      if (s.address && s.address !== '—') {
        html += '<div class="df-school-addr">' + escHtml(s.address) + '</div>';
      }
      html += '</div>';
    }
    html += '</div>';
  }

  html += '</div>';
  return html;
}

function classifyGrade(grade) {
  if (!grade || grade === '—') return '';
  var g = grade.toUpperCase();
  // Kindergarten & elementary
  if (g.indexOf('K') !== -1 && (g.indexOf('5') !== -1 || g.indexOf('6') !== -1)) return 'K–5/6';
  if (g.indexOf('ELEM') !== -1 || g.indexOf('PRIMARY') !== -1) return 'Elementary';
  // Middle
  if (g.indexOf('MIDDLE') !== -1 || g.indexOf('JR') !== -1 || g.indexOf('JUNIOR') !== -1) return '6–8';
  if (/6.*8/.test(g) || /7.*8/.test(g)) return '6–8';
  // High
  if (g.indexOf('HIGH') !== -1 || /9.*12/.test(g)) return '9–12';
  // K-12
  if (/K.*12/.test(g)) return 'K–12';
  // Pre-K
  if (g.indexOf('PRE') !== -1 || g.indexOf('EARLY') !== -1 || g.indexOf('TK') !== -1) return 'PreK/TK';
  return grade;
}

// ============================================================
// 4. WATER PRESSURE ZONE
// ============================================================

/**
 * fetchWaterPressureZone(cx, cy) — async
 * Queries Layer 133 (Pressure Zones) using a point intersect.
 * Returns first feature's attributes or null.
 */
function fetchWaterPressureZone(cx, cy) {
  var pt = buildPoint(cx, cy);

  return dfFetch(133, {
    where: '1=1',
    geometry: pt,
    geometryType: 'esriGeometryPoint',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    returnGeometry: 'false'
  }).then(function (data) {
    var features = (data && data.features) ? data.features : [];
    if (features.length === 0) return null;
    return features[0].attributes || null;
  }).catch(function (err) {
    console.warn('[DataFeatures] fetchWaterPressureZone failed:', err);
    return null;
  });
}

/**
 * renderWaterPressureZone(zone)
 * Returns HTML string for the water pressure zone widget.
 */
function renderWaterPressureZone(zone) {
  var html = '<div class="df-section">';
  html += '<div class="df-section-label">Water Pressure Zone</div>';

  if (!zone) {
    html += '<div class="df-empty-note">No water pressure zone data found for this location via City GIS.</div>';
  } else {
    html += '<div class="df-kv-grid">';
    var skip = ['OBJECTID', 'objectid', 'Shape', 'shape', 'Shape_Area', 'Shape_Length', 'GlobalID'];
    for (var key in zone) {
      if (!zone.hasOwnProperty(key)) continue;
      if (skip.indexOf(key) !== -1) continue;
      var val = zone[key];
      if (val === null || val === undefined || val === '') continue;
      html += '<div class="df-kv-row">';
      html += '<span class="df-kv-key">' + escHtml(friendlyKey(key)) + '</span>';
      html += '<span class="df-kv-val">' + escHtml(String(val)) + '</span>';
      html += '</div>';
    }
    html += '</div>';
  }

  html += '</div>';
  return html;
}

// ============================================================
// 5. NEARBY ADU COMPS
// ============================================================

/**
 * fetchNearbyADUComps(cx, cy, apn) — async
 * Queries Layer 264 (ADU Permits) within 2640ft (half mile).
 * Excludes current APN. Returns up to 8 completed comps.
 */
function fetchNearbyADUComps(cx, cy, apn) {
  var apnClean = apn ? String(apn).trim().replace(/'/g, "''") : '';
  var envelope = buildEnvelope(cx, cy, 2640);

  // Filter to completed permits (have a Certificate of Occupancy date)
  var whereClause = "CofO_Date IS NOT NULL";
  if (apnClean) {
    whereClause += " AND APN <> '" + apnClean + "'";
  }

  return dfFetch(264, {
    where: whereClause,
    geometry: envelope,
    geometryType: 'esriGeometryEnvelope',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    returnGeometry: 'false',
    resultRecordCount: '8',
    orderByFields: 'CofO_Date DESC'
  }).then(function (data) {
    var features = (data && data.features) ? data.features : [];
    var comps = [];
    for (var i = 0; i < features.length; i++) {
      var a = features[i].attributes || {};
      comps.push({
        address:  a.ADDR_FULL_LINE_ || a.Address || a.address || a.SITE_ADDRESS || '—',
        aduUnits: a.ADU_Units       || a.ADUUnits || a.Num_ADU_Units || '—',
        cofDate:  epochToDate(a.CofO_Date || a.COF_Date || a.COFDate || a.CO_Date),
        type:     a.Type            || a.Record_Type || a.RecordType || '—',
        description: a.DESCRIPTION  || a.Description || a.description || '—'
      });
    }
    return comps;
  }).catch(function (err) {
    console.warn('[DataFeatures] fetchNearbyADUComps failed:', err);
    return [];
  });
}

/**
 * renderADUComps(comps)
 * Returns HTML string as a compact table.
 */
function renderADUComps(comps) {
  var html = '<div class="df-section">';
  html += '<div class="df-section-label">Nearby ADU Comps <span class="df-section-sub">(½ mile · completed)</span></div>';

  if (!comps || comps.length === 0) {
    html += '<div class="df-empty-note">No completed ADU permits found within ½ mile via City GIS.</div>';
  } else {
    html += '<div class="df-table-wrap">';
    html += '<table class="df-table">';
    html += '<thead><tr><th>Address</th><th>Type</th><th>Units</th><th>Completed</th></tr></thead>';
    html += '<tbody>';
    for (var i = 0; i < comps.length; i++) {
      var c = comps[i];
      html += '<tr>';
      html += '<td>' + escHtml(c.address) + '</td>';
      html += '<td>' + escHtml(c.type) + '</td>';
      html += '<td class="df-table-center">' + escHtml(String(c.aduUnits)) + '</td>';
      html += '<td>' + escHtml(c.cofDate) + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
    html += '</div>';
  }

  html += '</div>';
  return html;
}

// ============================================================
// 6. OWNERSHIP SIGNAL ANALYSIS
// ============================================================

var CORP_KEYWORDS = ['LLC', 'INC', 'CORP', 'TRUST', 'LP', 'LTD', 'CO.', 'ASSOC',
  'PROPERTIES', 'HOLDINGS', 'REALTY', 'VENTURES', 'PARTNERS', 'GROUP',
  'FUND', 'CAPITAL', 'INVEST', 'DEVELOPMENT', 'ENTERPRISES', 'MANAGEMENT'];

/**
 * analyzeOwnership(parcelAttrs) — sync
 * Derives ownership signals from parcel attributes.
 */
function analyzeOwnership(parcelAttrs) {
  var p = parcelAttrs || {};

  var owner = String(p.ownerName || p.owner || '').toUpperCase().trim();
  var landValue = parseInt(p.landValue || 0, 10) || 0;
  var netAV = parseInt(p.netAssessedValue || 0, 10) || 0;
  var yearBuilt = parseInt(p.yearBuilt || 0, 10) || 0;
  var docDate = String(p.DocDate || p.DOC_DATE || p.doc_date || '');
  var tractName = String(p.TractName || p.TRACT_NAME || p.tract_name || '');

  // --- Owner type ---
  var ownerType = 'Individual';
  for (var k = 0; k < CORP_KEYWORDS.length; k++) {
    if (owner.indexOf(CORP_KEYWORDS[k]) !== -1) {
      ownerType = 'LLC/Corp';
      break;
    }
  }

  // --- Years owned ---
  var yearsOwned = null;
  if (docDate) {
    // DocDate may be a string like "2010-03-15", "3/15/2010", or an epoch number
    var yearMatch = docDate.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      yearsOwned = new Date().getFullYear() - parseInt(yearMatch[0], 10);
    } else {
      // Try epoch
      var ep = parseInt(docDate, 10);
      if (!isNaN(ep) && ep > 0) {
        yearsOwned = new Date().getFullYear() - new Date(ep).getFullYear();
      }
    }
  }

  // --- Land to value ratio ---
  var landToValueRatio = null;
  var isUnderimproved = false;
  if (landValue > 0 && netAV > 0) {
    landToValueRatio = landValue / netAV;
    isUnderimproved = landToValueRatio > 0.6;
  }

  // --- Build signals ---
  var signals = [];

  if (ownerType === 'LLC/Corp') {
    signals.push('Corporate/LLC owner — may be more motivated to transact or redevelop');
  } else {
    signals.push('Individual owner — personal connection to property likely');
  }

  if (yearsOwned !== null) {
    if (yearsOwned >= 20) {
      signals.push('Held ' + yearsOwned + '+ years — long-term owner, may have significant equity and low tax basis (Prop 13)');
    } else if (yearsOwned >= 12) {
      signals.push('Held ' + yearsOwned + ' years — established ownership, potential Prop 13 benefit');
    } else if (yearsOwned >= 5) {
      signals.push('Held ' + yearsOwned + ' years — medium-term ownership');
    } else if (yearsOwned >= 0) {
      signals.push('Acquired recently (' + yearsOwned + ' year' + (yearsOwned !== 1 ? 's' : '') + ' ago) — motivated to develop or resell');
    }
  }

  if (landToValueRatio !== null) {
    var pct = Math.round(landToValueRatio * 100);
    if (isUnderimproved) {
      signals.push('Land value is ' + pct + '% of total AV — likely underimproved; strong development opportunity');
    } else if (landToValueRatio > 0.4) {
      signals.push('Land value is ' + pct + '% of total AV — moderately improved; may have development upside');
    } else {
      signals.push('Land value is ' + pct + '% of total AV — well-improved lot');
    }
  }

  if (yearBuilt > 0 && yearBuilt < 1970) {
    signals.push('Structure built ' + yearBuilt + ' — aging building, potential for renovation or redevelopment');
  } else if (yearBuilt >= 1970 && yearBuilt < 1990) {
    signals.push('Structure built ' + yearBuilt + ' — may need deferred maintenance or upgrades');
  }

  if (tractName && tractName !== 'undefined' && tractName.length > 1) {
    signals.push('Tract: ' + tractName);
  }

  // --- Opportunity flag ---
  var opportunityScore = 0;
  if (ownerType === 'LLC/Corp') opportunityScore += 1;
  if (yearsOwned !== null && yearsOwned >= 12) opportunityScore += 1;
  if (isUnderimproved) opportunityScore += 2;
  if (yearBuilt > 0 && yearBuilt < 1980) opportunityScore += 1;

  var opportunityFlag;
  if (opportunityScore >= 3) {
    opportunityFlag = 'High';
  } else if (opportunityScore >= 1) {
    opportunityFlag = 'Moderate';
  } else {
    opportunityFlag = 'Low';
  }

  return {
    ownerType: ownerType,
    ownerName: owner || '—',
    yearsOwned: yearsOwned,
    landToValueRatio: landToValueRatio !== null ? parseFloat(landToValueRatio.toFixed(3)) : null,
    isUnderimproved: isUnderimproved,
    signals: signals,
    opportunityFlag: opportunityFlag,
    docDate: docDate || '—',
    yearBuilt: yearBuilt || '—'
  };
}

/**
 * renderOwnershipSignals(analysis)
 * Returns HTML string with owner type badge, signals, and opportunity flag.
 */
function renderOwnershipSignals(analysis) {
  var a = analysis || {};

  // Owner type badge
  var ownerBadgeClass = (a.ownerType === 'LLC/Corp') ? 'df-badge-blue' : 'df-badge-gray';

  // Opportunity flag badge
  var flagClass = 'df-badge-gray';
  if (a.opportunityFlag === 'High') flagClass = 'df-badge-green';
  else if (a.opportunityFlag === 'Moderate') flagClass = 'df-badge-orange';

  var html = '<div class="df-section">';
  html += '<div class="df-section-label">Ownership Signals</div>';

  // Header row
  html += '<div class="df-ownership-header">';
  html += '<span class="df-badge ' + ownerBadgeClass + '">' + escHtml(a.ownerType || '—') + '</span>';
  html += '<span class="df-badge ' + flagClass + '">' + escHtml(a.opportunityFlag || '—') + ' Opportunity</span>';
  html += '</div>';

  // Owner name
  if (a.ownerName && a.ownerName !== '—') {
    html += '<div class="df-ownership-owner">' + escHtml(a.ownerName) + '</div>';
  }

  // Key metrics row
  html += '<div class="df-kv-grid df-kv-compact">';
  if (a.yearsOwned !== null && a.yearsOwned !== undefined) {
    html += '<div class="df-kv-row"><span class="df-kv-key">Est. Years Held</span><span class="df-kv-val">' + a.yearsOwned + '</span></div>';
  }
  if (a.landToValueRatio !== null && a.landToValueRatio !== undefined) {
    html += '<div class="df-kv-row"><span class="df-kv-key">Land/AV Ratio</span><span class="df-kv-val' + (a.isUnderimproved ? ' df-val-highlight' : '') + '">' + Math.round(a.landToValueRatio * 100) + '%</span></div>';
  }
  if (a.yearBuilt && a.yearBuilt !== '—') {
    html += '<div class="df-kv-row"><span class="df-kv-key">Year Built</span><span class="df-kv-val">' + a.yearBuilt + '</span></div>';
  }
  if (a.docDate && a.docDate !== '—') {
    html += '<div class="df-kv-row"><span class="df-kv-key">Doc Date</span><span class="df-kv-val">' + escHtml(a.docDate) + '</span></div>';
  }
  html += '</div>';

  // Signals list
  if (a.signals && a.signals.length) {
    html += '<ul class="df-signal-list">';
    for (var i = 0; i < a.signals.length; i++) {
      html += '<li>' + escHtml(a.signals[i]) + '</li>';
    }
    html += '</ul>';
  }

  html += '</div>';
  return html;
}

// ============================================================
// SHARED CSS (inject once on first use)
// ============================================================

var _dfStylesInjected = false;

function injectDFStyles() {
  if (_dfStylesInjected) return;
  _dfStylesInjected = true;

  var css = [
    /* ---- Section wrapper ---- */
    '.df-section { margin-bottom: 16px; }',
    '.df-section-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--color-text-faint, #888); margin-bottom: 8px; }',
    '.df-section-sub { font-weight: 400; text-transform: none; letter-spacing: 0; }',
    '.df-empty-note { font-size: 12px; color: var(--color-text-faint, #999); font-style: italic; padding: 6px 0; }',
    '.df-link { font-size: 12px; color: var(--color-primary, #3b7dd8); text-decoration: none; }',
    '.df-link:hover { text-decoration: underline; }',
    '.df-link-row { margin-top: 8px; }',

    /* ---- Badges / tags ---- */
    '.df-badge { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 600; line-height: 1.5; }',
    '.df-badge-green  { background: #d1fae5; color: #065f46; }',
    '.df-badge-blue   { background: #dbeafe; color: #1e40af; }',
    '.df-badge-orange { background: #fef3c7; color: #92400e; }',
    '.df-badge-gray   { background: #f3f4f6; color: #374151; }',
    '.df-badge-grade  { background: #ede9fe; color: #4c1d95; }',
    '[data-theme="dark"] .df-badge-green  { background: #064e3b; color: #6ee7b7; }',
    '[data-theme="dark"] .df-badge-blue   { background: #1e3a8a; color: #93c5fd; }',
    '[data-theme="dark"] .df-badge-orange { background: #78350f; color: #fcd34d; }',
    '[data-theme="dark"] .df-badge-gray   { background: #374151; color: #d1d5db; }',
    '[data-theme="dark"] .df-badge-grade  { background: #3b0764; color: #c4b5fd; }',

    '.df-tag { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 500; }',
    '.df-tag-public  { background: #dcfce7; color: #166534; }',
    '.df-tag-private { background: #fce7f3; color: #9d174d; }',
    '[data-theme="dark"] .df-tag-public  { background: #14532d; color: #86efac; }',
    '[data-theme="dark"] .df-tag-private { background: #500724; color: #fbcfe8; }',

    /* ---- Street view ---- */
    '.df-streetview-wrap { margin-bottom: 4px; }',
    '.df-streetview-frame { border-radius: 8px; overflow: hidden; background: var(--color-surface-2, #f0f0f0); margin-bottom: 6px; }',

    /* ---- Permit cards ---- */
    '.df-permit-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }',
    '.df-permit-card { border: 1px solid var(--color-border, #e5e7eb); border-radius: 6px; padding: 8px 10px; font-size: 12px; }',
    '.df-permit-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 4px; }',
    '.df-permit-name { font-weight: 600; color: var(--color-text, #111); flex: 1; }',
    '.df-permit-addr { color: var(--color-text-secondary, #555); margin-bottom: 2px; }',
    '.df-permit-meta { color: var(--color-text-faint, #888); font-size: 11px; margin-bottom: 2px; }',
    '.df-permit-desc { color: var(--color-text, #333); font-size: 11px; margin-bottom: 2px; }',
    '.df-permit-dates { color: var(--color-text-faint, #888); font-size: 11px; margin-top: 3px; }',
    '.df-permit-adu { font-size: 11px; color: var(--color-text, #333); margin-top: 3px; }',

    /* ---- School chips ---- */
    '.df-school-chips { display: flex; flex-direction: column; gap: 8px; }',
    '.df-school-chip { border: 1px solid var(--color-border, #e5e7eb); border-radius: 6px; padding: 8px 10px; font-size: 12px; }',
    '.df-school-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }',
    '.df-school-name { font-weight: 600; color: var(--color-text, #111); }',
    '.df-school-dist { font-size: 11px; color: var(--color-text-faint, #999); }',
    '.df-school-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 3px; }',
    '.df-school-grade-raw { font-size: 10px; color: var(--color-text-faint, #999); align-self: center; }',
    '.df-school-addr { font-size: 11px; color: var(--color-text-faint, #888); }',

    /* ---- KV grid ---- */
    '.df-kv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 8px; margin: 6px 0; }',
    '.df-kv-compact { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }',
    '.df-kv-row { display: contents; }',
    '.df-kv-key { font-size: 11px; color: var(--color-text-faint, #888); align-self: center; }',
    '.df-kv-val { font-size: 12px; font-weight: 500; color: var(--color-text, #111); }',
    '.df-val-highlight { color: #b45309; font-weight: 700; }',
    '[data-theme="dark"] .df-val-highlight { color: #fbbf24; }',

    /* ---- ADU comps table ---- */
    '.df-table-wrap { overflow-x: auto; margin-bottom: 4px; }',
    '.df-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }',
    '.df-table th { text-align: left; font-weight: 600; color: var(--color-text-faint, #888); font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; padding: 4px 6px; border-bottom: 1px solid var(--color-border, #e5e7eb); }',
    '.df-table td { padding: 5px 6px; border-bottom: 1px solid var(--color-border-faint, #f3f4f6); color: var(--color-text, #222); vertical-align: top; }',
    '.df-table tr:last-child td { border-bottom: none; }',
    '.df-table-center { text-align: center; }',

    /* ---- Ownership signals ---- */
    '.df-ownership-header { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }',
    '.df-ownership-owner { font-size: 12px; font-weight: 500; color: var(--color-text, #111); margin-bottom: 6px; }',
    '.df-signal-list { margin: 6px 0 0 0; padding-left: 18px; font-size: 12px; color: var(--color-text, #333); line-height: 1.7; }',
    '.df-signal-list li { margin-bottom: 1px; }',
  ].join('\n');

  var style = document.createElement('style');
  style.id = 'df-styles';
  style.textContent = css;
  document.head.appendChild(style);
}

// ============================================================
// INTERNAL UTILITIES
// ============================================================

function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function friendlyKey(key) {
  // Convert camelCase / SNAKE_CASE to Title Case with spaces
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

// ============================================================
// EXPORT
// ============================================================

window.DataFeatures = {
  // Street View
  getStreetViewHTML: getStreetViewHTML,

  // Permit history
  fetchPermitHistory: fetchPermitHistory,
  renderPermitHistory: renderPermitHistory,

  // Nearby schools
  fetchNearbySchools: fetchNearbySchools,
  renderSchools: renderSchools,

  // Water pressure zone
  fetchWaterPressureZone: fetchWaterPressureZone,
  renderWaterPressureZone: renderWaterPressureZone,

  // Nearby ADU comps
  fetchNearbyADUComps: fetchNearbyADUComps,
  renderADUComps: renderADUComps,

  // Ownership analysis
  analyzeOwnership: analyzeOwnership,
  renderOwnershipSignals: renderOwnershipSignals,

  // Style injection (call once from app to inject CSS)
  injectStyles: injectDFStyles,

  // Exposed utilities (useful for calling code)
  epochToDate: epochToDate,
  distanceFt: distanceFt
};
