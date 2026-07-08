/* ============================================================
   Santa Barbara Parcel Explorer — Main Application
   Live data from: gisportal.santabarbaraca.gov ArcGIS REST
   ============================================================ */

'use strict';

// ── Configuration ────────────────────────────────────────────
const CONFIG = {
  // City ArcGIS REST base
  CITY_BASE: 'https://gisportal.santabarbaraca.gov/server1/rest/services/CitySantaBarbara/MapServer',
  // County hosted parcels (RHNA inventory from same portal)
  COUNTY_BASE: 'https://gisportal.santabarbaraca.gov/hosting/rest/services/RHNA_2023_Site_Inventory_Parcels/FeatureServer',

  // Layer IDs from the MapServer
  LAYERS: {
    parcels:          8,   // Assessors Parcels City
    zoning:           401, // Zoning
    cityLimits:       2,   // City Limits
    assessmentChips:  38,  // Assessment Chip Areas
    neighborhoods:    1,   // Neighborhoods
    highFire:         37,  // High Fire Hazard Areas
    femaFlood:        266, // FEMA Flood 2023
    coastalZone:      93,  // Coastal Zone Boundary
    historicSites:    213, // Historic Sites Structures
    transitPriorityArea: 284,  // Transit Priority Area
    transitHalfMile:     294,  // Half Mile Walking Distance from Transit
    generalPlan:      293, // General Plan & LCP Land Use Designations (drives AUD tier)
    priorityHousing:  87,  // Priority Housing Overlay (AUD Priority tier 37-63 du/ac)
  },

  // Santa Barbara city center
  SB_CENTER: [34.4208, -119.6982],
  SB_ZOOM: 13,

  // Coordinate system: NAD83 / California zone 5 (EPSG:2229)
  // ArcGIS returns in this CRS; we convert to WGS84 for Leaflet
  CRS_CITY: '+proj=lcc +lat_1=35.46666666666667 +lat_2=34.03333333333333 +lat_0=33.5 +lon_0=-118 +x_0=2000000.0001016 +y_0=500000.0001016001 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=us-ft +no_defs',

  // How many features to fetch per query
  MAX_RESULTS: 100,
};

// ── Projections ──────────────────────────────────────────────
proj4.defs('EPSG:2229', CONFIG.CRS_CITY);

function toLatLng(x, y) {
  const [lng, lat] = proj4('EPSG:2229', 'WGS84', [x, y]);
  return [lat, lng];
}

function ringsToLatLng(rings) {
  return rings.map(ring => ring.map(([x, y]) => toLatLng(x, y)));
}

// ── Basemap tile layers ──────────────────────────────────────
const BASEMAPS = {
  osm: L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }),
  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: '© Esri, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, swisstopo, and the GIS User Community',
    maxZoom: 20
  }),
  topo: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: '© Esri, HERE, Garmin, Intermap, © OpenStreetMap contributors, USGS, NGA, EPA, USDA, NPS',
    maxZoom: 20
  }),
  light: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }),
};

// ── Application state ────────────────────────────────────────
const state = {
  map: null,
  currentBasemap: 'osm',
  activeFeatureLayers: {},   // layerKey -> L.GeoJSON layer
  selectedParcel: null,
  selectedAPN: null,
  lastSearchResults: [],
  layerOpacity: { parcels: 0.8, zoning: 0.5 },
  compareMode: false,
  compareAPNs: [],
  compareLayers: {},
  cityLimitsGeoJSON: null,  // stored for outside-city click blocking (public version)
  // Pending header context (for UIWiring)
  _pendingHeaderApn:  null,
  _pendingHeaderAddr: null,
  _pendingHeaderLat:  null,
  _pendingHeaderLng:  null,
};

// Zoning color map (from layer 401 renderer)
const ZONE_COLORS = {
  'RS-1A':'#ebffca','A-1':'#ebffca','RS-25':'#fdfac1','A-2':'#fdfac1',
  'RS-15':'#fef8a4','E-1':'#fef8a4','RS-10':'#fef874','RS-7.5':'#ffff00',
  'E-3':'#ffff00','RS-6':'#feedad','R-1':'#feedad','R-2':'#fed370',
  'R-M':'#feac00','R-3':'#feac00','R-MH':'#fe7100','R-4':'#fe7100',
  'O-R':'#fea4a4','O-M':'#f6a4fe','C-R':'#810000','C-1':'#810000',
  'C-P':'#810000','C-G':'#ff0000','C-2':'#ff0000','M-C':'#cccccc',
  'M-I':'#686868','M-1':'#686868','P-R':'#4ce600','ACS':'#d7b09e',
  'PUD':'#dbcd00','RD':'#f0b0cf','HRC-1':'#beE8FF','HRC-2':'#befffe',
  'OC':'#00d0d0','OM-1':'#005ce6','HC':'#00ffff','A-A-O':'#e1e1e1',
  'G-S-R':'#a3ff73','A-C':'#f258f5','A-F':'#005ce6',
};

const ZONE_LABELS = {
  'RS-6':'RS-6 Single Family','RS-10':'RS-10 Single Family','RS-15':'RS-15 Single Family',
  'R-2':'Two-Unit Residential','R-M':'Multi-Unit Residential','R-MH':'Multi-Unit & Hotel',
  'C-R':'Commercial Restricted','C-G':'Commercial General','O-R':'Office Restricted',
  'O-M':'Office Medical','M-I':'Light Manufacturing','M-C':'Manufacturing Commercial',
  'P-R':'Park & Recreation','ACS':'Auto/Commercial/Services','PUD':'Planned Unit Development',
  'HRC-1':'Hotel/Related Commerce I','HRC-2':'Hotel/Related Commerce II',
  'OC':'Ocean Related Commerce','HC':'Harbor Commercial',
};

// Chip area colors
const CHIP_COLORS = {
  'Eucalyptus Hill':'#f2a2ee','Las Canoas':'#e06963','Las Tunas':'#edc766',
  'Lower Riviera':'#90f5f3','San Roque/Ontare':'#469148','Sheffield/Parma':'#5cf75e',
  'Sycamore Canyon/Las Alturas':'#507cab','West Mountain/Coyote':'#323687',
  'Westmont/Circle':'#9359f7',
};

// ── Utilities ────────────────────────────────────────────────
function fmtCurrency(val) {
  if (val == null || val === '' || val === 0) return '—';
  return '$' + Number(val).toLocaleString();
}
function fmtAcre(val) {
  if (val == null || val === '') return '—';
  return Number(val).toFixed(3) + ' ac';
}
function fmtSqft(val) {
  if (val == null || val === '' || val === 0) return '—';
  return Number(val).toLocaleString() + ' sq ft';
}
function fmtVal(v) {
  if (v == null || v === '' || v === 0) return '—';
  return v;
}

function showToast(msg, type = 'info', duration = 3500) {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 300ms'; setTimeout(() => t.remove(), 300); }, duration);
}

function setStatus(msg, state = 'ok') {
  const dot = document.querySelector('.status-dot');
  const text = document.getElementById('statusText');
  dot.className = 'status-dot' + (state === 'loading' ? ' loading' : state === 'error' ? ' error' : '');
  text.textContent = msg;
}

function setLoading(show) {
  const ol = document.getElementById('loadingOverlay');
  ol.classList.toggle('visible', show);
}

// ── ArcGIS REST Query ────────────────────────────────────────
async function queryLayer(layerId, params = {}) {
  const base = `${CONFIG.CITY_BASE}/${layerId}/query`;
  const defaults = {
    f: 'json',
    outFields: '*',
    returnGeometry: 'true',
    outSR: 2229,
    resultRecordCount: CONFIG.MAX_RESULTS,
  };
  const query = { ...defaults, ...params };
  const url = base + '?' + new URLSearchParams(query).toString();

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || 'ArcGIS error');
    return data;
  } catch (err) {
    console.error(`Layer ${layerId} query failed:`, err);
    throw err;
  }
}

async function queryCountyParcels(params = {}) {
  const base = `${CONFIG.COUNTY_BASE}/0/query`;
  const defaults = {
    f: 'json',
    outFields: '*',
    returnGeometry: 'true',
    outSR: 2229,
    resultRecordCount: 50,
  };
  const query = { ...defaults, ...params };
  const url = base + '?' + new URLSearchParams(query).toString();
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || 'ArcGIS error');
    return data;
  } catch (err) {
    console.error('County parcel query failed:', err);
    throw err;
  }
}

// ── Convert ArcGIS JSON geometry to GeoJSON ──────────────────
function arcgisPolygonToGeoJSON(feature) {
  if (!feature.geometry || !feature.geometry.rings) return null;

  // Compute true planimetric area in square feet from the source rings
  // BEFORE reprojection. The City's ArcGIS server returns geometry in EPSG:2229
  // (NAD83 / California zone 5, units = US Survey Feet), so Shoelace area on
  // the source coordinates is already in sq ft — no geodesic correction needed.
  // We use abs(outer ring) minus inner rings (holes) for multi-ring polygons.
  const rings = feature.geometry.rings;
  let polygonSqft = 0;
  if (rings && rings.length) {
    // Shoelace formula on each ring; signed area indicates winding (CW = outer, CCW = hole).
    const shoelace = (ring) => {
      let area = 0;
      for (let i = 0, n = ring.length; i < n - 1; i++) {
        area += (ring[i][0] * ring[i + 1][1]) - (ring[i + 1][0] * ring[i][1]);
      }
      return area / 2;
    };
    // First ring is the outer; subsequent rings of opposite winding are holes.
    const firstSigned = shoelace(rings[0]);
    polygonSqft = Math.abs(firstSigned);
    for (let r = 1; r < rings.length; r++) {
      const signed = shoelace(rings[r]);
      // Hole = opposite winding sign to outer
      if (Math.sign(signed) !== Math.sign(firstSigned)) {
        polygonSqft -= Math.abs(signed);
      } else {
        polygonSqft += Math.abs(signed);
      }
    }
  }

  const coords = feature.geometry.rings.map(ring =>
    ring.map(([x, y]) => {
      const [lng, lat] = proj4('EPSG:2229', 'WGS84', [x, y]);
      return [lng, lat];
    })
  );
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: coords },
    properties: {
      ...feature.attributes,
      _polygonSqft: polygonSqft > 0 ? Math.round(polygonSqft) : null,
    },
  };
}

function arcgisPolylineToGeoJSON(feature) {
  if (!feature.geometry || !feature.geometry.paths) return null;
  const coords = feature.geometry.paths.map(path =>
    path.map(([x, y]) => {
      const [lng, lat] = proj4('EPSG:2229', 'WGS84', [x, y]);
      return [lng, lat];
    })
  );
  return {
    type: 'Feature',
    geometry: { type: 'MultiLineString', coordinates: coords },
    properties: feature.attributes,
  };
}

function featuresToGeoJSON(features) {
  const geojsonFeatures = features
    .map(f => {
      if (f.geometry?.rings) return arcgisPolygonToGeoJSON(f);
      if (f.geometry?.paths) return arcgisPolylineToGeoJSON(f);
      return null;
    })
    .filter(Boolean);
  return {
    type: 'FeatureCollection',
    features: geojsonFeatures,
    metadata: { source: CONFIG.CITY_BASE, timestamp: new Date().toISOString() }
  };
}

// ── Map Initialization ───────────────────────────────────────
function initMap() {
  const map = L.map('map', {
    center: CONFIG.SB_CENTER,
    zoom: CONFIG.SB_ZOOM,
    zoomControl: false,
    preferCanvas: true,  // DO NOT REMOVE — required for GIS server CORS compatibility
  });

  BASEMAPS.osm.addTo(map);
  state.map = map;

  // Custom zoom controls
  document.getElementById('zoomIn').addEventListener('click', () => map.zoomIn());
  document.getElementById('zoomOut').addEventListener('click', () => map.zoomOut());
  document.getElementById('zoomHome').addEventListener('click', () => {
    map.setView(CONFIG.SB_CENTER, CONFIG.SB_ZOOM);
  });

  // Show coordinates on move
  map.on('mousemove', e => {
    document.getElementById('mapCoords').textContent =
      `${e.latlng.lat.toFixed(5)}°N, ${e.latlng.lng.toFixed(5)}°W`;
  });

  // On zoom change, conditionally load parcel layer (only at zoom >= 14 due to scale limit)
  map.on('zoomend', () => {
    const z = map.getZoom();
    if (document.querySelector('input[data-layer="parcels"]').checked) {
      if (z >= 14 && !state.activeFeatureLayers.parcels) {
        loadParcelsInView();
      } else if (z < 14 && state.activeFeatureLayers.parcels) {
        // keep layer but show warning
        setStatus('Zoom in further to see parcel boundaries', 'ok');
      }
    }
  });

  map.on('moveend', () => {
    if (document.querySelector('input[data-layer="parcels"]').checked && map.getZoom() >= 14) {
      loadParcelsInView();
    }
    if (document.querySelector('input[data-layer="zoning"]').checked) {
      loadZoningInView();
    }
    if (document.querySelector('input[data-layer="county-parcels"]').checked) {
      loadCountyParcelsInView();
    }
  });

  // Load initial always-visible layers
  loadCityLimits();
  setStatus('Ready — click a parcel or search to explore');
}

// ── Point-in-polygon (ray casting) ───────────────────────────
function pointInPolygon(pt, ring) {
  let inside = false;
  const x = pt[0], y = pt[1];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

// ── Leaflet GeoJSON layer helpers ────────────────────────────
function addOrReplaceLayer(key, geojsonData, style, onEachFn) {
  if (state.activeFeatureLayers[key]) {
    state.map.removeLayer(state.activeFeatureLayers[key]);
  }
  const layer = L.geoJSON(geojsonData, {
    style: typeof style === 'function' ? style : () => style,
    onEachFeature: onEachFn || null,
  });
  layer.addTo(state.map);
  state.activeFeatureLayers[key] = layer;
  return layer;
}

function removeLayer(key) {
  if (state.activeFeatureLayers[key]) {
    state.map.removeLayer(state.activeFeatureLayers[key]);
    delete state.activeFeatureLayers[key];
  }
}

// ── Get map extent as ArcGIS envelope ────────────────────────
function getMapEnvelope() {
  const b = state.map.getBounds();
  const sw = proj4('WGS84', 'EPSG:2229', [b.getWest(), b.getSouth()]);
  const ne = proj4('WGS84', 'EPSG:2229', [b.getEast(), b.getNorth()]);
  return {
    xmin: sw[0], ymin: sw[1], xmax: ne[0], ymax: ne[1],
    spatialReference: { wkid: 2229 },
  };
}

// ── Layer loaders ────────────────────────────────────────────

// City Limits (always loaded)
// ── Outside-city mask (public version) ───────────────────────
function addOutsideCityMask(cityGeoJSON) {
  if (!cityGeoJSON || !cityGeoJSON.features?.length) return;

  // Build an inverted polygon: world bbox with city boundary as a hole
  const worldRing = [[-180,-90],[180,-90],[180,90],[-180,90],[-180,-90]];

  // Collect all city polygon rings
  const cityRings = [];
  cityGeoJSON.features.forEach(f => {
    const geom = f.geometry;
    if (!geom) return;
    const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
    polys.forEach(poly => poly.forEach(ring => cityRings.push(ring)));
  });

  // GeoJSON polygon: outer ring = world, holes = city polygons
  const maskGeoJSON = {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [worldRing, ...cityRings],
    },
    properties: {},
  };

  // Remove existing mask then add fresh
  if (state.activeFeatureLayers['city-mask']) {
    state.map.removeLayer(state.activeFeatureLayers['city-mask']);
    delete state.activeFeatureLayers['city-mask'];
  }

  const maskLayer = L.geoJSON(maskGeoJSON, {
    style: {
      fillColor: '#111111',
      fillOpacity: 0.42,
      color: 'transparent',
      weight: 0,
      interactive: false,
    },
  }).addTo(state.map);
  maskLayer.bringToBack();
  state.activeFeatureLayers['city-mask'] = maskLayer;
}

async function loadCityLimits() {
  try {
    setStatus('Loading City Limits…', 'loading');
    const data = await queryLayer(CONFIG.LAYERS.cityLimits, {
      where: '1=1',
      returnGeometry: 'true',
    });
    if (!data.features?.length) return;
    const geojson = featuresToGeoJSON(data.features);
    // Store for click-blocking in public version
    state.cityLimitsGeoJSON = geojson;

    addOrReplaceLayer('city-limits', geojson, {
      color: '#1a5f7a',
      weight: 2.5,
      fillColor: 'transparent',
      fillOpacity: 0,
      dashArray: '6 4',
    });

    // Add grey mask outside city limits (public version: always add)
    addOutsideCityMask(geojson);

    setStatus('City Limits loaded');
    if (document.querySelector('input[data-layer="city-limits"]').checked) {
      // already visible
    } else {
      removeLayer('city-limits');
    }
  } catch (e) {
    setStatus('Error loading City Limits', 'error');
    showToast('Could not load City Limits: ' + e.message, 'error');
  }
}

// Assessors Parcels — loaded by current map view
async function loadParcelsInView() {
  const env = getMapEnvelope();
  try {
    setStatus('Querying parcels…', 'loading');
    setLoading(true);
    const data = await queryLayer(CONFIG.LAYERS.parcels, {
      geometry: JSON.stringify(env),
      geometryType: 'esriGeometryEnvelope',
      spatialRel: 'esriSpatialRelIntersects',
      where: '1=1',
    });
    setLoading(false);

    if (!data.features?.length) {
      setStatus('No parcels in current view');
      removeLayer('parcels');
      return;
    }

    const geojson = featuresToGeoJSON(data.features);
    const opacity = state.layerOpacity.parcels;

    addOrReplaceLayer('parcels', geojson,
      () => ({
        color: '#1a5f7a',
        weight: 1,
        fillColor: '#a2c5d8',
        fillOpacity: opacity * 0.35,
        opacity: opacity,
      }),
      (feature, layer) => {
        const p = feature.properties;
        layer.on('click', () => selectParcel(feature, layer));
        layer.on('mouseover', (e) => {
          layer.setStyle({ fillOpacity: 0.6, weight: 2 });
          layer.bringToFront();
          const zoningLayer = state.activeFeatureLayers['zoning'];
          if (zoningLayer) {
            let zoneLabel = null;
            zoningLayer.eachLayer(function(zl) {
              if (zoneLabel || !zl.feature) return;
              if (zl.getBounds && !zl.getBounds().contains(e.latlng)) return;
              const coords = zl.feature.geometry && zl.feature.geometry.coordinates;
              const type = zl.feature.geometry && zl.feature.geometry.type;
              if (!coords) return;
              const rings = type === 'Polygon' ? [coords] : type === 'MultiPolygon' ? coords : null;
              if (!rings) return;
              const pt = [e.latlng.lng, e.latlng.lat];
              for (const polygon of rings) {
                if (pointInPolygon(pt, polygon[0])) {
                  const zp = zl.feature.properties;
                  const zRaw = zp.zoneOther || zp.zone1 || zp.zone || '';
                  const z = zRaw.split('/')[0].trim();
                  if (z) zoneLabel = `<b>${z}</b>${ZONE_LABELS[z] ? '<br>' + ZONE_LABELS[z] : ''}`;
                  break;
                }
              }
            });
            if (zoneLabel) layer.bindTooltip(zoneLabel, { sticky: true, className: 'zone-tooltip' }).openTooltip(e.latlng);
          }
        });
        layer.on('mouseout', () => {
          if (state.selectedParcel !== layer) layer.setStyle({ fillOpacity: opacity * 0.35, weight: 1 });
          layer.unbindTooltip();
        });
      }
    );

    setStatus(`${data.features.length} parcels loaded`);
    populateResultsTable(data.features);
    if (state.activeFeatureLayers['parcels']) state.activeFeatureLayers['parcels'].bringToFront();
    if (state.compareAPNs.length > 0 || state.selectedAPN) {
      const toHighlight = state.compareAPNs.length > 0 ? state.compareAPNs : (state.selectedAPN ? [state.selectedAPN] : []);
      state.activeFeatureLayers['parcels'].eachLayer(layer => {
        const p = layer.feature?.properties;
        const la = p?.apn || p?.apn9Digit;
        if (la && toHighlight.includes(la)) {
          layer.setStyle({ fillOpacity: 0.7, weight: 2.5, color: '#c4611a' });
          layer.bringToFront();
          state.compareLayers[la] = layer;
          if (la === state.selectedAPN) state.selectedParcel = layer;
        }
      });
    }
  } catch (e) {
    setLoading(false);
    setStatus('Parcel query failed', 'error');
    showToast('Could not load parcels: ' + e.message, 'error');
  }
}

// Zoning layer
async function loadZoningInView() {
  const env = getMapEnvelope();
  try {
    setStatus('Loading zoning…', 'loading');
    const data = await queryLayer(CONFIG.LAYERS.zoning, {
      geometry: JSON.stringify(env),
      geometryType: 'esriGeometryEnvelope',
      spatialRel: 'esriSpatialRelIntersects',
      where: '1=1',
    });
    if (!data.features?.length) return;
    const geojson = featuresToGeoJSON(data.features);
    const opacity = state.layerOpacity.zoning;
    addOrReplaceLayer('zoning', geojson, (feature) => {
      const zoneRaw = feature.properties.zoneOther || feature.properties.zone1 || feature.properties.zone || '';
      const zone = zoneRaw.split('/')[0].trim();
      const color = ZONE_COLORS[zone] || '#cccccc';
      return {
        color: '#000',
        weight: 1,
        fillColor: color,
        fillOpacity: opacity,
        opacity: 0.6,
      };
    }, (feature, layer) => {
      const p = feature.properties;
      const zoneRaw = p.zoneOther || p.zone1 || p.zone || '—';
      const zone = zoneRaw.split('/')[0].trim() || '—';
      const label = ZONE_LABELS[zone] || zone;
      layer.bindTooltip(`<b>${zone}</b><br/>${label}`, { sticky: true, className: 'zone-tooltip' });
    });
    if (state.activeFeatureLayers['zoning']) state.activeFeatureLayers['zoning'].bringToBack();
    setStatus(`Zoning loaded`);
  } catch (e) {
    setStatus('Zoning query failed', 'error');
  }
}

// Assessment Chip Areas
async function loadAssessmentChips() {
  try {
    setStatus('Loading Assessment Chip Areas…', 'loading');
    const data = await queryLayer(CONFIG.LAYERS.assessmentChips, {
      where: '1=1',
      returnGeometry: 'true',
    });
    if (!data.features?.length) return;
    const geojson = featuresToGeoJSON(data.features);
    addOrReplaceLayer('assessment-chips', geojson, (feature) => {
      const zone = feature.properties.haz_zone || '';
      const color = CHIP_COLORS[zone] || '#ffaa00';
      return { color: '#555', weight: 1, fillColor: color, fillOpacity: 0.5 };
    }, (feature, layer) => {
      const p = feature.properties;
      layer.bindTooltip(`<b>${p.haz_zone || '—'}</b><br/>Assessment: ${p.assessment || '—'}`, { sticky: true });
    });
    setStatus('Assessment Chip Areas loaded');
  } catch (e) {
    setStatus('Failed to load chip areas', 'error');
    showToast('Could not load Assessment Chip Areas: ' + e.message, 'error');
  }
}

// Neighborhoods
async function loadNeighborhoods() {
  try {
    const data = await queryLayer(CONFIG.LAYERS.neighborhoods, { where: '1=1', returnGeometry: 'true' });
    if (!data.features?.length) return;
    const geojson = featuresToGeoJSON(data.features);
    addOrReplaceLayer('neighborhoods', geojson, {
      color: '#7a39bb',
      weight: 1.5,
      fillColor: '#7a39bb',
      fillOpacity: 0.08,
      dashArray: '4 3',
    }, (feature, layer) => {
      const n = feature.properties.NAME || feature.properties.NEIGHNAME || feature.properties.OBJECTID;
      if (n) layer.bindTooltip(`${n}`, { sticky: true });
    });
  } catch (e) { showToast('Could not load Neighborhoods', 'error'); }
}

// High Fire Hazard Areas
async function loadHighFire() {
  try {
    const data = await queryLayer(CONFIG.LAYERS.highFire, { where: '1=1', returnGeometry: 'true', resultRecordCount: 2000 });
    if (!data.features?.length) return;
    const geojson = featuresToGeoJSON(data.features);
    addOrReplaceLayer('high-fire', geojson, {
      color: '#b92d2d',
      weight: 1.5,
      fillColor: '#ff6b35',
      fillOpacity: 0.35,
    }, (feature, layer) => {
      layer.bindTooltip('High Fire Hazard Area', { sticky: true });
    });
  } catch (e) { showToast('Could not load Fire Hazard data', 'error'); }
}

// FEMA Flood 2023
async function loadFemaFlood() {
  try {
    // Filter out Zone X (minimal flood hazard — no construction/insurance constraints,
    // no impact on housing production). Render only Special Flood Hazard Areas (SFHA):
    // - A, AE, AH, AO, AR, A99 = riverine SFHA (1% annual chance flood)
    // - V, VE              = coastal high-velocity SFHA
    // - D                  = undetermined hazard
    // Zone X and "X PROTECTED BY LEVEE" are excluded.
    const sfhaFilter = "fldZone NOT IN ('X', 'X PROTECTED BY LEVEE', 'AREA NOT INCLUDED', 'OPEN WATER')";
    const data = await queryLayer(CONFIG.LAYERS.femaFlood, { where: sfhaFilter, returnGeometry: 'true', resultRecordCount: 2000 });
    if (!data.features?.length) return;
    const geojson = featuresToGeoJSON(data.features);
    addOrReplaceLayer('fema-flood', geojson, {
      color: '#006494',
      weight: 1,
      fillColor: '#0099cc',
      fillOpacity: 0.3,
    }, (feature, layer) => {
      const p = feature.properties;
      layer.bindTooltip(`FEMA Flood Zone: ${p.fldZone || p.zoneSubty || '—'}`, { sticky: true });
    });
  } catch (e) { showToast('Could not load FEMA Flood data', 'error'); }
}

// Coastal Zone
async function loadCoastalZone() {
  try {
    const data = await queryLayer(CONFIG.LAYERS.coastalZone, { where: '1=1', returnGeometry: 'true', resultRecordCount: 2000 });
    if (!data.features?.length) return;
    const geojson = featuresToGeoJSON(data.features);
    addOrReplaceLayer('coastal-zone', geojson, {
      color: '#00a8cc',
      weight: 2,
      fillColor: '#00d0ff',
      fillOpacity: 0.15,
      dashArray: '8 4',
    });
  } catch (e) { showToast('Could not load Coastal Zone', 'error'); }
}

// Historic Sites
async function loadHistoricSites() {
  try {
    const data = await queryLayer(CONFIG.LAYERS.historicSites, { where: '1=1', returnGeometry: 'true', resultRecordCount: 2000 });
    if (!data.features?.length) return;
    const geojson = featuresToGeoJSON(data.features);
    addOrReplaceLayer('historic', geojson, {
      color: '#a13544',
      weight: 1.5,
      fillColor: '#e57',
      fillOpacity: 0.25,
    }, (feature, layer) => {
      const p = feature.properties;
      const name = p.NAME || p.SITENAME || p.SITE_NAME || '';
      if (name) layer.bindTooltip(name, { sticky: true });
    });
  } catch (e) { showToast('Could not load Historic Sites', 'error'); }
}

// County Parcels (RHNA layer)
async function loadCountyParcelsInView() {
  const env = getMapEnvelope();
  try {
    setStatus('Loading county parcels…', 'loading');
    const data = await queryCountyParcels({
      geometry: JSON.stringify(env),
      geometryType: 'esriGeometryEnvelope',
      spatialRel: 'esriSpatialRelIntersects',
      where: '1=1',
      outFields: 'Assessor_Parcel_Number,Site_Address__Intersection,Zone,Parcel_Size__Acres_,General_Plan_Designation__Curre',
    });
    if (!data.features?.length) { setStatus('No county parcels in view'); return; }
    const geojson = featuresToGeoJSON(data.features);
    addOrReplaceLayer('county-parcels', geojson, {
      color: '#6b4f3a',
      weight: 1.5,
      fillColor: '#c8a882',
      fillOpacity: 0.3,
      dashArray: '3 3',
    }, (feature, layer) => {
      const p = feature.properties;
      layer.bindTooltip(`<b>County APN: ${p.Assessor_Parcel_Number || '—'}</b><br/>${p.Site_Address__Intersection || ''}`, { sticky: true });
    });
    setStatus(`${data.features.length} county parcels loaded`);
  } catch (e) {
    setStatus('County parcel query failed', 'error');
    showToast('County parcels unavailable: ' + e.message, 'error');
  }
}

// ── Parcel selection ─────────────────────────────────────────
function selectParcel(feature, leafletLayer) {
  const apn = feature.properties?.apn || feature.properties?.apn9Digit || null;

  // Block clicks outside city limits (public version)
  if (state.cityLimitsGeoJSON) {
    const coords = feature.geometry?.coordinates;
    if (coords) {
      // Get parcel centroid from first ring
      const ring = (feature.geometry.type === 'MultiPolygon')
        ? coords[0][0] : coords[0];
      const lngs = ring.map(p => p[0]);
      const lats = ring.map(p => p[1]);
      const clng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
      const clat = (Math.min(...lats) + Math.max(...lats)) / 2;
      const pt = [clng, clat];

      let insideCity = false;
      state.cityLimitsGeoJSON.features.forEach(f => {
        const geom = f.geometry;
        if (!geom) return;
        const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
        polys.forEach(poly => {
          if (pointInPolygon(pt, poly[0])) insideCity = true;
        });
      });

      if (!insideCity) {
        showToast('This parcel is outside Santa Barbara city limits. This tool covers City of Santa Barbara parcels only.', 'warning');
        return;
      }
    }
  }

  if (state.compareMode) {
    if (apn && !state.compareAPNs.includes(apn)) state.compareAPNs.push(apn);
    if (leafletLayer) {
      state.compareLayers[apn] = leafletLayer;
      try { leafletLayer.setStyle({ fillOpacity: 0.7, weight: 2.5, color: '#c4611a' }); leafletLayer.bringToFront(); } catch(e) {}
    }
    state.selectedParcel = leafletLayer;
    state.selectedAPN = apn;
    showParcelDetail(feature);
    highlightTableRow(feature.properties?.OBJECTID || apn);
    loadAdjacentData(feature);
    if (state.compareAPNs.length >= 2 && window.UIWiring?.openComparePanelFor) {
      window.UIWiring.openComparePanelFor(state.compareAPNs);
    }
    return;
  }

  if (state.selectedParcel && state.selectedParcel !== leafletLayer) {
    try { state.selectedParcel.setStyle({ fillOpacity: state.layerOpacity.parcels * 0.35, weight: 1, color: '#1a5f7a' }); } catch(e) {}
  }
  state.selectedParcel = leafletLayer;
  state.selectedAPN = apn;
  if (leafletLayer) {
    try { leafletLayer.setStyle({ fillOpacity: 0.7, weight: 2.5, color: '#c4611a' }); leafletLayer.bringToFront(); } catch(e) {}
  }
  showParcelDetail(feature);
  highlightTableRow(feature.properties?.OBJECTID || apn);
  loadAdjacentData(feature);
}

// ── Adjacent data queries for clicked parcel ─────────────────
async function loadAdjacentData(parcelFeature) {
  const env = parcelFeature.geometry?.coordinates?.[0];
  if (!env) return;

  // Get centroid in projected coords (EPSG:2229)
  const lngs = env.map(c => c[0]);
  const lats = env.map(c => c[1]);
  const clng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const clat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const [cx, cy] = proj4('WGS84', 'EPSG:2229', [clng, clat]);

  const point = { x: cx, y: cy, spatialReference: { wkid: 2229 } };
  const pointStr = JSON.stringify(point);
  const pointParams = {
    geometry: pointStr,
    geometryType: 'esriGeometryPoint',
    spatialRel: 'esriSpatialRelIntersects',
    where: '1=1',
  };

  // ── Show report loading state ──────────────────────────────
  document.getElementById('reportLoading').style.display = 'flex';
  document.getElementById('reportBody').style.display = 'none';

  // Per-parcel FEMA query: exclude Zone X (minimal hazard) so isFlood only flags
  // meaningful Special Flood Hazard Areas. Same filter as loadFemaFlood().
  const sfhaFilter = "fldZone NOT IN ('X', 'X PROTECTED BY LEVEE', 'AREA NOT INCLUDED', 'OPEN WATER')";

  // ── Fire all spatial queries in parallel ──────────────────
  const zoningRes = await queryLayer(CONFIG.LAYERS.zoning,
    { ...pointParams, outFields: 'zoneOther,zone1,zoneDescr,zonedesg,overlayZone,sD3' }
  ).then(r=>({status:'fulfilled',value:r})).catch(e=>({status:'rejected',reason:e}));

  const [chipsRes, hfRes, ffRes, coastRes, histRes, tpaRes, transitHMRes, gpRes, priorityHsgRes] = await Promise.allSettled([
    queryLayer(CONFIG.LAYERS.assessmentChips, pointParams),
    queryLayer(CONFIG.LAYERS.highFire, pointParams),
    queryLayer(CONFIG.LAYERS.femaFlood, { ...pointParams, where: sfhaFilter }).catch(() => ({ features: [] })),
    queryLayer(CONFIG.LAYERS.coastalZone, pointParams).catch(() => ({ features: [] })),
    queryLayer(CONFIG.LAYERS.historicSites, pointParams).catch(() => ({ features: [] })),
    queryLayer(CONFIG.LAYERS.transitPriorityArea, pointParams).catch(() => ({ features: [] })),
    Promise.resolve({ features: [] }), // layer 294 excluded — half-mile bus buffer too broad for AB 2097
    queryLayer(CONFIG.LAYERS.generalPlan, { ...pointParams, outFields: 'luCode,landUseDesignations,gPorLcp' }).catch(() => ({ features: [] })),
    queryLayer(CONFIG.LAYERS.priorityHousing, pointParams).catch(() => ({ features: [] })),
  ]);

  // ── Extract results ────────────────────────────────────────
  const zoningAttrs  = zoningRes.status === 'fulfilled' ? zoningRes.value?.features?.[0]?.attributes : null;
  const chipAttrs    = chipsRes.status === 'fulfilled'  ? chipsRes.value?.features?.[0]?.attributes  : null;
  const isHighFire   = hfRes.status === 'fulfilled'     ? (hfRes.value?.features?.length > 0)         : false;
  const floodAttrs   = ffRes.status === 'fulfilled'     ? ffRes.value?.features?.[0]?.attributes      : null;
  const isCoastal    = coastRes.status === 'fulfilled'  ? (coastRes.value?.features?.length > 0)      : false;
  const isHistoric   = histRes.status === 'fulfilled'   ? (histRes.value?.features?.length > 0)       : false;
  const inAB2097Zone = tpaRes.status === 'fulfilled' ? (tpaRes.value?.features?.length > 0) : false;
  const inTPA        = inAB2097Zone;
  const nearTransit  = inAB2097Zone;
  const gpAttrs      = gpRes.status === 'fulfilled'     ? gpRes.value?.features?.[0]?.attributes      : null;
  const inPriorityHousing = priorityHsgRes.status === 'fulfilled' ? (priorityHsgRes.value?.features?.length > 0) : false;

  // ── Derive AUD tier from General Plan designation ─────────────────
  // Per § 28.20.060, AUD tier eligibility is determined by GP land use designation:
  //   - "Medium High Density Residential" → Medium-High tier (15–27 du/ac)
  //   - "High Density Residential" → High Density tier (28–36 du/ac)
  //   - High Density Residential + Priority Housing Overlay (or C-M zone) → Priority tier (37–63 du/ac)
  // We surface the highest applicable tier; eligibility-by-zone is enforced downstream
  // in calcBaseDensity() (only R-3/R-4/HRC-2/R-O/C-P/C-L/C-1/C-2/C-M/OC qualify).
  const gpDesignation = gpAttrs?.landUseDesignations || gpAttrs?.luCode || null;
  let audTier = null;
  if (gpDesignation) {
    const d = String(gpDesignation).toLowerCase();
    if (inPriorityHousing && /high.density.residential/.test(d)) audTier = 'priority';
    else if (/high.density.residential/.test(d) && !/medium/.test(d)) audTier = 'high';
    else if (/medium.high.density/.test(d)) audTier = 'medium-high';
  }
  // C-M zone qualifies for Priority tier per § 28.20.060.C regardless of GP designation
  const zoneStrRaw = zoningAttrs?.zoneOther || zoningAttrs?.zone1 || zoningAttrs?.zonedesg || '';
  const zoneStr = zoneStrRaw.split('/')[0].trim();
  if (zoneStr === 'C-M' && audTier !== 'priority') audTier = 'priority';

  // ── Populate existing tabs ─────────────────────────────────
  if (zoningAttrs) populateZoningTab(zoningAttrs);
  populateFireTab(chipAttrs, isHighFire, floodAttrs);

  // ── Build context for analyzer ────────────────────────────
  const context = {
    inCoastalZone:        isCoastal,
    inHighFire:           isHighFire,
    chipZone:             chipAttrs?.haz_zone || null,
    inFEMAFlood:          !!floodAttrs,
    floodZoneType:        floodAttrs?.fldZone || floodAttrs?.zoneSubty || null,
    inHistoric:           isHistoric,
    nearTransit:          nearTransit,
    inTransitPriorityArea: inTPA,
    inAppealJurisdiction: isCoastal, // conservative: treat all coastal as appeal jurisdiction
    nearBluff:            false,     // no bluff layer queried — stays false
    gpDesignation:        gpDesignation,
    inPriorityHousing:    inPriorityHousing,
    audTier:              audTier, // 'medium-high' | 'high' | 'priority' | null
  };

  // Run analyzer
  const parcelAttrs = parcelFeature.properties;
  const _apn  = parcelAttrs.apn || parcelAttrs.apn9Digit || '';
  const _addr = [parcelAttrs.situs1, parcelAttrs.situs2].filter(Boolean).join(' ') || '';
  let report = null;
  try {
    report = window.DevelopmentAnalyzer.analyzeParcel(parcelAttrs, zoningAttrs || {}, context);
  } catch (err) {
    console.warn('Analyzer error:', err);
  }

  // Render report
  if (report) {
    renderDeveloperReport(report);
  } else {
    document.getElementById('reportLoading').style.display = 'none';
    document.getElementById('reportBody').innerHTML = '<div class="report-error">Could not analyze this parcel. Try a parcel with full zoning data.</div>';
    document.getElementById('reportBody').style.display = 'block';
  }

  // DataFeatures: background async fetches
  if (window.DataFeatures) {
    if (!window.currentParcelData) window.currentParcelData = {};
    window.currentParcelData = {
      apn: _apn, address: _addr, lat: clat, lng: clng,
      report: report, pfResult: null, parcelAttrs: parcelAttrs,
      zoningAttrs: zoningAttrs, context: context
    };
    if (state.compareMode && window.Comparison && _apn) {
      if (window.Comparison.getParcel && window.Comparison.getParcel(_apn)) window.Comparison.removeParcel(_apn);
      window.Comparison.addParcel(window.currentParcelData);
      if (state.compareAPNs.length >= 2 && window.UIWiring?.openComparePanelFor) {
        window.UIWiring.openComparePanelFor(state.compareAPNs);
      }
    }

    window.DataFeatures.fetchPermitHistory(_apn, cx, cy).then(function(permits) {
      if (window.currentParcelData) window.currentParcelData.permits = permits;
      var el = document.getElementById('permitHistoryContainer');
      if (el) el.innerHTML = window.DataFeatures.renderPermitHistory(permits);
    }).catch(function() {
      var el = document.getElementById('permitHistoryContainer');
      if (el) el.innerHTML = '<div class="detail-row"><span class="detail-val" style="color:var(--color-text-muted)">No permit data available</span></div>';
    });

    window.DataFeatures.fetchNearbySchools(cx, cy).then(function(schools) {
      if (window.currentParcelData) window.currentParcelData.schools = schools;
      var el = document.getElementById('schoolsContainer');
      if (el) el.innerHTML = window.DataFeatures.renderSchools(schools);
    }).catch(function() {
      var el = document.getElementById('schoolsContainer');
      if (el) el.innerHTML = '<div class="detail-row"><span class="detail-val" style="color:var(--color-text-muted)">No school data available</span></div>';
    });

    window.DataFeatures.fetchWaterPressureZone(cx, cy).then(function(zone) {
      if (window.currentParcelData) window.currentParcelData.waterZone = zone;
      var el = document.getElementById('waterZoneContainer');
      if (el) {
        if (zone && window.DataFeatures.renderWaterPressureZone) {
          el.innerHTML = window.DataFeatures.renderWaterPressureZone(zone);
        } else if (zone) {
          var zName = zone.ZONE_NAME || zone.PRESSURE_ZONE || zone.Zone_Name || JSON.stringify(zone);
          el.innerHTML = '<div class="detail-row"><span class="detail-key">Zone</span><span class="detail-val">' + zName + '</span></div>';
        } else {
          el.innerHTML = '<div class="detail-row"><span class="detail-val" style="color:var(--color-text-muted)">No water zone data</span></div>';
        }
      }
    }).catch(function() {
      var el = document.getElementById('waterZoneContainer');
      if (el) el.innerHTML = '<div class="detail-row"><span class="detail-val" style="color:var(--color-text-muted)">No water zone data available</span></div>';
    });

    window.DataFeatures.fetchNearbyADUComps(cx, cy, _apn).then(function(comps) {
      if (window.currentParcelData) window.currentParcelData.aduComps = comps;
      var el = document.getElementById('aduCompsContainer');
      if (el) el.innerHTML = window.DataFeatures.renderADUComps(comps);
    }).catch(function() {
      var el = document.getElementById('aduCompsContainer');
      if (el) el.innerHTML = '<div class="detail-row"><span class="detail-val" style="color:var(--color-text-muted)">No ADU comp data available</span></div>';
    });
  }
}

// ── Developer Report Renderer ────────────────────────────────
function renderDeveloperReport(r) {
  // Hide loading, show body
  document.getElementById('reportLoading').style.display = 'none';
  const body = document.getElementById('reportBody');
  body.style.display = 'block';

  // ── Score Banner (absent in public version) ─────────────
  const banner = document.getElementById('reportScoreBanner');
  if (banner) {
    banner.style.borderLeftColor = r.score.color;
    banner.style.background = r.score.color + '12';
    const sn = document.getElementById('reportScoreNum');
    const sl = document.getElementById('reportScoreLabel');
    const sz = document.getElementById('reportScoreZone');
    if (sn) { sn.textContent = r.score.score; sn.style.color = r.score.color; }
    if (sl) { sl.textContent = r.score.label; sl.style.color = r.score.color; }
    if (sz) sz.textContent = r.summary.zone ? ('Zone ' + r.summary.zone) : r.summary.category;
  }

  // ── Alert bar ────────────────────────────────────────────
  const alertsEl = document.getElementById('reportAlerts');
  const alerts = [];
  if (r.coastalAnalysis.inCoastalZone) alerts.push({ type: 'coastal', icon: '🌊', text: 'Coastal Zone — CDP required for most development' });
  if (r.fireAnalysis.inHighFireZone)   alerts.push({ type: 'fire',    icon: '🔥', text: 'High Fire Hazard Zone — Chapter 7A construction required' });
  if (r.historicAnalysis.isHistoric)   alerts.push({ type: 'historic',icon: '🏛', text: 'Historic designation — SB 9 lot split blocked' });
  if (r.floodAnalysis.inFloodZone)     alerts.push({ type: 'flood',   icon: '💧', text: 'FEMA Flood Zone — elevation certificate required' });
  alertsEl.innerHTML = alerts.map(a =>
    '<div class="report-alert report-alert-' + a.type + '">' + a.icon + ' ' + a.text + '</div>'
  ).join('');
  alertsEl.style.display = alerts.length ? 'block' : 'none';

  // ── Unit Count Grid ───────────────────────────────────────
  // Each card shows the TOTAL achievable units under that development pathway,
  // not the law's marginal contribution. This matches how property owners think
  // about their options ("how many can I end up with under each scenario?").
  //
  //   By-Right  = existing zoning entitlement
  //   ADU       = By-Right + 3 ADUs + 1 JADU (purely additive — stacks on primary)
  //   SB 9      = 2 primary units OR lot split to 4 (alternative to By-Right; ADUs can stack further)
  //   SHRA      = up to 10 small-lot subdivision (alternative — replaces base entirely)
  //   DBL       = base density + density bonus % (alternative path; MF zones)
  //   AB 2011   = mixed-use/commercial corridor conversion (alternative path)
  //
  const unitGrid = document.getElementById('reportUnitGrid');
  const mu = r.maxUnits;
  const lawColors = {
    'Local Zoning': '#1a5f7a', // teal — base zoning (formerly "By-Right")
    'ADU':          '#2e7041', // green — ADU/JADU stack
    'SB 9':         '#8a5a0c', // amber — SB 9
    'SHRA':         '#6b21a8', // purple — Starter Home Revitalization Act
    'DBL':          '#0e6ba8', // blue — Density Bonus Law
    'AR':           '#0f766e', // teal — Adaptive Reuse
    'AB2011':       '#b45309', // amber — AB 2011
    'SB35':         '#6b7280', // grey — SB 35 (not applicable)
    'AB 2011':      '#a83246', // red — Affordable Housing & High Road Jobs Act
    'default':      '#4b5563',
  };
  function shortLawLabel(fullLaw) {
    if (/SB ?9/i.test(fullLaw)) return 'SB 9';
    if (/SHRA|SB ?684|SB ?1123/i.test(fullLaw)) return 'SHRA';
    if (/Density Bonus|DBL/i.test(fullLaw)) return 'DBL';
    if (/Adaptive Reuse|^AR$/i.test(fullLaw)) return 'AR';
    if (/AB.?2011|Mixed.Income/i.test(fullLaw)) return 'AB2011';
    if (/SB.?35|SB.?423/i.test(fullLaw)) return 'SB35';
    if (/AB ?2011/i.test(fullLaw)) return 'AB 2011';
    if (/ADU|JADU/i.test(fullLaw)) return 'ADU';
    return fullLaw;
  }

  // Build TOTAL-achievable card for each law (base + its contribution, or the alternative)
  // Use ?? not || here so commercial zones (byRight = 0) display correctly instead of falling to 1.
  const base = mu.byRight ?? 1;
  // Build "Local Zoning" subtitle from baseInfo when available — includes citation
  let baseSubtitle;
  if (mu.baseInfo) {
    const bi = mu.baseInfo;
    if (bi.units === 0) {
      baseSubtitle = bi.note || 'No by-right residential';
    } else if (bi.note) {
      baseSubtitle = bi.note;
    } else {
      baseSubtitle = base + (base === 1 ? ' unit' : ' units') + ' — ' + bi.citation;
    }
  } else {
    baseSubtitle = 'Base zoning — ' + base + ' primary';
  }
  const cards = [unitCard('Local Zoning', base, lawColors['Local Zoning'], baseSubtitle)];

  (mu.breakdown || []).forEach(function(b) {
    const shortLabel = shortLawLabel(b.law);
    const color = lawColors[shortLabel] || lawColors.default;
    let total, subtitle;
    if (shortLabel === 'ADU') {
      // ADU is purely additive: base + (ADU pathway count)
      total = base + b.units;
      subtitle = base + ' primary + ' + b.units + ' ADUs';
    } else if (shortLabel === 'SB 9') {
      // SB 9 is alternative: b.units already represents SB 9 total (2 or 4)
      total = b.units;
      subtitle = b.note || 'Alternative pathway';
    } else if (shortLabel === 'SHRA') {
      // SHRA replaces base: b.units is the small-lot total
      total = b.units;
      subtitle = b.note || 'Alternative pathway';
    } else if (shortLabel === 'DBL') {
      total = b.units;
      subtitle = 'maximum — with 24% VLI';
      cards.push(unitCard('DBL', total, color, subtitle));
      return;
    } else if (shortLabel === 'AR') {
      cards.push(
        '<div class="unit-card" style="border-top-color:' + color + '">' +
        '<div class="unit-card-num" style="color:' + color + '; font-size:1.4rem">🏢</div>' +
        '<div class="unit-card-label">ADAPTIVE REUSE</div>' +
        '<div class="unit-card-sub">Eligible — see report</div>' +
        '</div>'
      );
      return;
    } else if (shortLabel === 'AB2011') {
      total = b.units;
      subtitle = 'mixed-income corridor';
      cards.push(unitCard('AB 2011', total, color, subtitle));
      return;
    } else {
      total = b.units;
      subtitle = b.note || '';
    }
    cards.push(unitCard(shortLabel, total, color, subtitle));
  });
  unitGrid.innerHTML = cards.join('');

  const disclaimerEl = document.getElementById('reportUnitDisclaimer');
  if (mu.breakdown && mu.breakdown.length) {
    // Breakdown table: show each law's MARGINAL contribution ("Adds X" for additive laws,
    // "X total" for alternative-pathway laws), to complement the totals shown on the cards above.
    disclaimerEl.innerHTML = '<div class="unit-breakdown">' +
      mu.breakdown.map(function(b) {
        const shortLabel = shortLawLabel(b.law);
        const isAdditive = (shortLabel === 'ADU');
        const isAR       = (shortLabel === 'AR');
        const unitLabel  = isAR
          ? 'Eligible'
          : isAdditive
            ? ('Adds ' + b.units)
            : (b.units + ' total');
        // Highlight just the affordability phrase in red; rest of note stays muted grey.
        const rawNote = b.note || '';
        const affordRe = /(\d+\s+must\s+be\s+deed[‑\-]restricted\s+affordable|affordable)/i;
        const aMatch = affordRe.exec(rawNote);
        let renderedNote;
        if (aMatch) {
          renderedNote =
            escHtml(rawNote.slice(0, aMatch.index)) +
            '<span class="ub-note-affordable">' + escHtml(aMatch[0]) + '</span>' +
            escHtml(rawNote.slice(aMatch.index + aMatch[0].length));
        } else {
          renderedNote = escHtml(rawNote);
        }
        return '<div class="unit-breakdown-row"><span class="ub-law">' + escHtml(b.law) +
          '</span><span class="ub-units">' + escHtml(unitLabel) + '</span><span class="ub-note">' +
          renderedNote +
          (b.processNote ? '<br><span class="ub-process-note">' + escHtml(b.processNote) + '</span>' : '') +
          '</span></div>';
      }).join('') + '</div>' +
      '<p class="report-disclaimer-text">' + escHtml(mu.disclaimer || '') + '</p>';
  }

  // ── Buildable Area ────────────────────────────────────────
  const bc = r.buildableCalc;
  const buildGrid = document.getElementById('reportBuildableGrid');
  if (bc.available) {
    buildGrid.innerHTML = [
      makeRow('Lot Size', fmtNum(bc.lotSqft) + ' sq ft (' + r.summary.acreage + ' ac)'),
      makeRow('Max FAR', bc.maxFAR || '—'),
      makeRow('Max Buildable', bc.maxBuildableSqft ? fmtNum(bc.maxBuildableSqft) + ' sq ft' : '—'),
      makeRow('Max Lot Coverage', bc.maxLotCoverage || '—'),
      makeRow('Max Height', bc.maxHeight || '—'),
      makeRow('Existing Bldg', bc.existingImprovSqft !== '—' ? fmtNum(bc.existingImprovSqft) + ' sq ft' : '—'),
      makeRow('Remaining FAR', bc.remainingFARCapacity !== '—' ? fmtNum(bc.remainingFARCapacity) + ' sq ft avail.' : '—'),
      makeRow('Setbacks', bc.setbacks || '—'),
    ].join('');
  } else {
    buildGrid.innerHTML = '<div class="detail-row"><span class="detail-val" style="color:var(--color-text-muted)">' + (bc.note || '') + '</span></div>';
  }

  // ── State Law Cards ───────────────────────────────────────
  document.getElementById('reportLawCards').innerHTML = [
    makeLawCard('SB 9', 'Urban Lot Split & 2-Unit Duplex', r.sb9Analysis, 'sb9'),
    makeLawCard('ADU Law', 'Accessory Dwelling Units', r.aduAnalysis, 'adu'),
    makeLawCard('SB 684 / SB 1123', 'Starter Home Revitalization Act', r.shraAnalysis, 'shra'),
    (r.dblAnalysis    && r.dblAnalysis.eligible    ? makeLawCard('Density Bonus Law',  'Gov. Code § 65915',       r.dblAnalysis,    'dbl')    : ''),
    (r.arAnalysis     && r.arAnalysis.eligible     ? makeLawCard('Adaptive Reuse',      'SBMC § 30.185.045',       r.arAnalysis,     'ar')     : ''),
    (r.ab2011Analysis                              ? makeLawCard('AB 2011',             'High Road Jobs Act',      r.ab2011Analysis, 'ab2011') : ''),
    makeLawCard('SB 35 / SB 423', 'Streamlined Ministerial Approval', r.sb35Analysis, 'sb35'),
  ].join('');

  // ── Parking AB 2097 ───────────────────────────────────────
  const pk = r.parkingAnalysis;
  const pkGrid = document.getElementById('reportParkingGrid');
  pkGrid.innerHTML = pk.eligible ? [
    makeRow('AB 2097 Applies', '<span style="color:var(--color-success);font-weight:700">✔ Yes</span>'),
    makeRow('Rule', escHtml(pk.rule || '')),
    makeRow('Scope', escHtml(pk.scope || '')),
    makeRow('Practical Impact', escHtml(pk.practicalImpact || '')),
    makeRow('ADU Height Boost', escHtml(pk.adusNote || '')),
    makeRow('Citation', escHtml(pk.citation || '')),
  ].join('') : [
    makeRow('AB 2097 Applies', '<span style="color:var(--color-text-muted)">No</span>'),
    makeRow('Reason', escHtml(pk.reason || '')),
    makeRow('Tip', escHtml(pk.note || '')),
  ].join('');

  // ── Restrictions ──────────────────────────────────────────
  document.getElementById('reportRestrictions').innerHTML = [
    makeRestrictionCard('Coastal Zone', r.coastalAnalysis.inCoastalZone, r.coastalAnalysis, 'coastal'),
    makeRestrictionCard('High Fire',    r.fireAnalysis.inHighFireZone,    r.fireAnalysis,    'fire'),
    makeRestrictionCard('Historic',     r.historicAnalysis.isHistoric,    r.historicAnalysis,'historic'),
    makeRestrictionCard('FEMA Flood',   r.floodAnalysis.inFloodZone,      r.floodAnalysis,   'flood'),
  ].join('');

  // ── Permits ───────────────────────────────────────────────
  document.getElementById('reportPermits').innerHTML = (r.permitsRequired || []).map(function(pm) {
    return '<div class="permit-item ' + (pm.required ? 'permit-required' : 'permit-conditional') + '">' +
      '<div class="permit-name">' + escHtml(pm.name) + '</div>' +
      '<div class="permit-meta">' +
        '<span class="permit-badge ' + (pm.required ? 'badge-required' : 'badge-conditional') + '">' + (pm.required ? 'Required' : (pm.conditional || 'Conditional')) + '</span>' +
        '<span class="permit-timeline">⏱ ' + escHtml(pm.timeline || '') + '</span>' +
      '</div>' +
      '<div class="permit-authority">' + escHtml(pm.authority || '') + '</div>' +
      (pm.notes ? '<div class="permit-notes">' + escHtml(pm.notes) + '</div>' : '') +
      '</div>';
  }).join('');

  // ── Score Factors ─────────────────────────────────────────
  document.getElementById('reportScoreFactors').innerHTML = (r.score.factors || []).map(function(f) {
    var isPos = f.impact && f.impact.startsWith('+');
    return '<div class="score-factor">' +
      '<span class="factor-label">' + escHtml(f.label) + '</span>' +
      '<span class="factor-impact ' + (isPos ? 'factor-pos' : 'factor-neg') + '">' + escHtml(f.impact) + '</span>' +
      '<span class="factor-note">' + escHtml(f.note || '') + '</span>' +
      '</div>';
  }).join('');

  // ── Regulatory Flags ──────────────────────────────────────
  (function renderRegulatoryFlags() {
    var cards = [];

    // Helper: build a flag card
    function flagCard(title, iconSvg, colorClass, bodyHtml) {
      return '<div class="reg-flag-card reg-flag-' + colorClass + '">' +
        '<div class="reg-flag-header">' + iconSvg + '<strong>' + escHtml(title) + '</strong></div>' +
        '<div class="reg-flag-body">' + bodyHtml + '</div>' +
        '</div>';
    }

    var iconInfo    = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    var iconWarn    = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="flex-shrink:0"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    var iconCheck   = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>';
    var iconCoastal = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0"><path d="M2 20c2-2 4-3 6-3s4 1 6 3 4 3 6 3"/><path d="M2 14c2-2 4-3 6-3s4 1 6 3 4 3 6 3"/><path d="M2 8c2-2 4-3 6-3s4 1 6 3 4 3 6 3"/></svg>';

    // ── 1. ODDS ───────────────────────────────────────────────
    var odds = r.oddsFlag;
    if (odds) {
      var oddsBody = '';
      if (odds.qualifies) {
        oddsBody += '<p style="margin:0 0 6px">' + escHtml(odds.benefit) + '</p>';
        if (odds.requirements && odds.requirements.length) {
          oddsBody += '<ul style="margin:0 0 5px;padding-left:16px">' +
            odds.requirements.map(function(req) { return '<li>' + escHtml(req) + '</li>'; }).join('') +
            '</ul>';
        }
        if (odds.coastalNote) oddsBody += '<p style="margin:4px 0 0;color:var(--color-text-muted);font-size:0.82em">' + escHtml(odds.coastalNote) + '</p>';
      } else {
        oddsBody += '<p style="margin:0">' + escHtml(odds.benefit) + '</p>';
      }
      oddsBody += '<p style="margin:5px 0 0;font-size:0.78em;color:var(--color-text-muted)">' + escHtml(odds.citation) + '</p>';
      cards.push(flagCard(
        odds.description,
        iconCheck,
        odds.qualifies ? 'green' : 'neutral',
        oddsBody
      ));
    }

    // ── 2. Inclusionary Zoning ────────────────────────────────
    var inc = r.inclusionaryFlag;
    if (inc) {
      var incBody = '<p style="margin:0 0 5px">' + escHtml(inc.note) + '</p>';
      if (inc.triggers) {
        incBody += makeRow('BMR Units Required', inc.bmrUnits + ' units (' + inc.bmrPct + ')');
        incBody += makeRow('Affordability Level', inc.affordabilityLevel);
        incBody += makeRow('In-Lieu Fee', inc.inLieuOption);
      }
      if (inc.exemptions && inc.exemptions.length) {
        incBody += '<div style="margin-top:6px;font-size:0.82em;color:var(--color-text-muted)">Exemptions: ' +
          inc.exemptions.join(' · ') + '</div>';
      }
      incBody += '<p style="margin:5px 0 0;font-size:0.78em;color:var(--color-text-muted)">' + escHtml(inc.citation) + '</p>';
      cards.push(flagCard(
        'Inclusionary Housing',
        iconInfo,
        inc.triggers ? 'orange' : 'neutral',
        incBody
      ));
    }

    // ── 3. Prevailing Wage ────────────────────────────────────
    var pw = r.prevailingWageFlag;
    if (pw) {
      var pwBody = '<p style="margin:0 0 5px">' + escHtml(pw.costImpact) + '</p>';
      if (pw.prevailingWageRequired && pw.paths && pw.paths.length) {
        pwBody += '<ul style="margin:0 0 5px;padding-left:16px">' +
          pw.paths.map(function(p) { return '<li>' + escHtml(p) + '</li>'; }).join('') +
          '</ul>';
      }
      pwBody += '<p style="margin:5px 0 0;font-size:0.78em;color:var(--color-text-muted)">' + escHtml(pw.citation) + '</p>';
      cards.push(flagCard(
        'Prevailing Wage',
        iconWarn,
        pw.prevailingWageRequired ? 'orange' : 'neutral',
        pwBody
      ));
    }

    // ── 4. Coastal Tier ───────────────────────────────────────
    var ct = r.coastalTierFlag;
    if (ct && ct.isCoastal) {
      var ctBody = '';
      ctBody += makeRow('Jurisdiction Tier', ct.tierLabel);
      ctBody += makeRow('CDP Authority', ct.authority);
      ctBody += makeRow('CCC Role', ct.cccRole);
      ctBody += makeRow('Timeline', ct.timeline);
      if (ct.appealWindow) ctBody += makeRow('Appeal Window', ct.appealWindow);
      ctBody += makeRow('Fee Range', ct.feeRange);
      if (ct.warning) ctBody += '<p style="margin:6px 0 0;color:#b45309;font-weight:600;font-size:0.85em">' + escHtml(ct.warning) + '</p>';
      ctBody += '<p style="margin:5px 0 0;font-size:0.78em;color:var(--color-text-muted)">' + escHtml(ct.citation) + '</p>';
      cards.push(flagCard(
        'Coastal Development Permit — ' + ct.tierLabel,
        iconCoastal,
        ct.tier === 'appeal' ? 'red' : 'orange',
        ctBody
      ));
    }

    // ── 5. Rent Freeze / AB 1482 ──────────────────────────────
    var rf = r.rentFreezeFlag;
    if (rf) {
      var rfBody = '';
      if (!rf.applicable) {
        rfBody += '<p style="margin:0;color:var(--color-text-muted)">' + escHtml(rf.note) + '</p>';
      } else {
        if (rf.localRentFreeze && rf.localRentFreeze.applies) {
          rfBody += '<p style="margin:0 0 5px;color:#b91c1c;font-weight:600">' + escHtml(rf.localRentFreeze.note) + '</p>';
          rfBody += makeRow('Ordinance', rf.localRentFreeze.ordinance);
          rfBody += makeRow('Expires', rf.localRentFreeze.expires);
        }
        if (rf.ab1482 && rf.ab1482.applies) {
          rfBody += '<p style="margin:6px 0 4px;font-weight:600">' + escHtml(rf.ab1482.note) + '</p>';
          rfBody += makeRow('Current Rent Cap', rf.ab1482.currentCap);
        }
        if (rf.renovation) {
          rfBody += '<p style="margin:6px 0 0;font-size:0.85em;color:var(--color-text-muted)">' + escHtml(rf.renovation) + '</p>';
        }
        if (rf.yearBuilt) rfBody += makeRow('Year Built (on file)', rf.yearBuilt);
      }
      rfBody += '<p style="margin:5px 0 0;font-size:0.78em;color:var(--color-text-muted)">' + escHtml(rf.citation || '') + '</p>';
      cards.push(flagCard(
        'Rent Control / AB 1482',
        iconWarn,
        (rf.localRentFreeze && rf.localRentFreeze.applies) ? 'red' : (rf.ab1482 && rf.ab1482.applies ? 'orange' : 'neutral'),
        rfBody
      ));
    }

    var container = document.getElementById('reportRegulatoryFlags');
    if (container) {
      container.innerHTML = cards.length ? cards.join('') :
        '<p style="color:var(--color-text-muted);font-size:0.88em;margin:4px 0">No additional regulatory flags for this parcel.</p>';
    }
  })();

  // Initialise Pro Forma with parcel context
  if (window.ProForma) {
    initProForma(r);
  }

  // Update UIWiring header now that we have the report
  if (window.UIWiring && state._pendingHeaderApn) {
    window.UIWiring.updateParcelHeader(
      state._pendingHeaderApn,
      state._pendingHeaderAddr,
      state._pendingHeaderLat,
      state._pendingHeaderLng,
      r,
      null  // pfResult not yet available; updated when user runs pro forma
    );
  }
  if (window.currentParcelData) window.currentParcelData.report = r;
}

// ── Report rendering helpers ──────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function fmtNum(n) {
  if (n == null || n === '—') return '—';
  return Number(n).toLocaleString();
}

function unitCard(label, count, color, sub, prefix) {
  var subText = (sub || '');
  if (subText.length > 32) subText = subText.substring(0, 30).trim() + '…';
  return '<div class="unit-card" style="border-top-color:' + color + '">' +
    (prefix ? '<div class="unit-card-prefix" style="color:' + color + '">' + escHtml(prefix) + '</div>' : '') +
    '<div class="unit-card-num" style="color:' + color + '">' + count + '</div>' +
    '<div class="unit-card-label">' + label + '</div>' +
    '<div class="unit-card-sub" title="' + escHtml(sub || '') + '">' + escHtml(subText) + '</div>' +
    '</div>';
}

function makeLawCard(law, subtitle, analysis, type) {
  var isEligible = type === 'shra'
    ? (analysis && (analysis.sb684Eligible || analysis.sb1123Eligible || analysis.isAudCommercial))
    : (analysis && analysis.eligible !== false);

  var statusColor = isEligible ? 'var(--color-success)' : 'var(--color-text-muted)';
  var statusText  = (type === 'sb35')
    ? '— Not Applicable'
    : isEligible ? '✔ Eligible' : '✗ Not Eligible';
  var details = '';

  if (type === 'sb9' && isEligible) {
    var twoUnit = analysis.twoUnit;
    var split   = analysis.lotSplit;
    details +=
      '<div class="law-detail-row"><span>2-Unit Development</span><span class="law-detail-val">' + (twoUnit && twoUnit.allowed ? '2 units, ministerial' : '—') + '</span></div>' +
      '<div class="law-detail-row"><span>Lot Split</span><span class="law-detail-val">' + (split && split.allowed ? '4 units (2+2)' : 'Not eligible') + '</span></div>' +
      (analysis.aduBonus ? '<div class="law-detail-row"><span>+ ADU Stack</span><span class="law-detail-val">' + escHtml(analysis.aduBonus.totalPotential) + '</span></div>' : '') +
      '<div class="law-detail-row"><span>Timeline</span><span class="law-detail-val">' + escHtml(analysis.timelineEstimate || '') + '</span></div>' +
      (analysis.coastalNote ? '<div class="law-warning">' + escHtml(analysis.coastalNote) + '</div>' : '') +
      (analysis.fireNote    ? '<div class="law-warning">' + escHtml(analysis.fireNote) + '</div>' : '');
  } else if (type === 'sb9') {
    details = '<div class="law-warning">' + escHtml((analysis && analysis.reason) || 'Not applicable') + '</div>';
    if (analysis && analysis.exclusions) {
      analysis.exclusions.forEach(function(e) { details += '<div class="law-warning">' + escHtml(e) + '</div>'; });
    }
  } else if (type === 'adu' && isEligible) {
    var headline = analysis.headline || '';
    var pathways = analysis.pathways || [];
    details +=
      '<div class="law-detail-row"><span><strong>Theoretical Maximum</strong></span><span class="law-detail-val"><strong>' + escHtml(headline) + '</strong></span></div>';

    pathways.forEach(function(pw) {
      var sizeLine = pw.maxCount
        ? escHtml(pw.sizeNote || ('Up to ' + pw.maxCount))
        : escHtml(pw.sizeNote || (pw.maxSqft ? 'Up to ' + pw.maxSqft + ' SF' : ''));
      details +=
        '<div class="law-pathway">' +
          '<div class="law-pathway-head">' +
            '<span class="law-pathway-label">' + escHtml(pw.label) + '</span>' +
            '<span class="law-pathway-cite">' + escHtml(pw.citation) + '</span>' +
          '</div>' +
          '<div class="law-pathway-size">' + sizeLine + '</div>' +
          (pw.note ? '<div class="law-pathway-note">' + escHtml(pw.note) + '</div>' : '') +
        '</div>';
    });

    details +=
      '<div class="law-detail-row"><span>Approval</span><span class="law-detail-val">' + escHtml(analysis.approval || 'Ministerial') + '</span></div>' +
      '<div class="law-detail-row"><span>Timeline</span><span class="law-detail-val">' + escHtml(analysis.timelineEstimate || '') + '</span></div>';

    (analysis.siteNotes || []).forEach(function(n) {
      details += '<div class="law-warning">' + escHtml(n) + '</div>';
    });
  } else if (type === 'adu') {
    details = '<div class="law-warning">' + escHtml((analysis && analysis.reason) || 'Not applicable') + '</div>';
  } else if (type === 'shra' && isEligible) {
    details +=
      '<div class="law-detail-row"><span>SB 684 (MF zones)</span><span class="law-detail-val">' + (analysis.sb684Eligible ? '✔ Eligible' : (analysis.isAudCommercial ? 'Via AUD pathway' : 'N/A')) + '</span></div>' +
      '<div class="law-detail-row"><span>SB 1123 (SF vacant)</span><span class="law-detail-val">' + (analysis.sb1123Eligible ? '✔ Eligible' : 'N/A') + '</span></div>' +
      '<div class="law-detail-row"><span>Max Units</span><span class="law-detail-val">Up to ' + (analysis.maxUnits || 10) + ' units</span></div>' +
      '<div class="law-detail-row"><span>Max Unit Size</span><span class="law-detail-val">Avg ≤ ' + (analysis.maxUnitSqft || 1750) + ' sq ft</span></div>' +
      '<div class="law-detail-row"><span>Approval</span><span class="law-detail-val">' + escHtml(analysis.approval || 'Ministerial — 60 days max') + '</span></div>' +
      '<div class="law-detail-row"><span>Effective</span><span class="law-detail-val">' + escHtml(analysis.effectiveDate || '') + '</span></div>' +
      (analysis.coastalNote ? '<div class="law-warning">' + escHtml(analysis.coastalNote) + '</div>' : '') +
      (analysis.audCommercialNote ? '<div class="law-note law-note-interpretive">' + escHtml(analysis.audCommercialNote) + '</div>' : '');
  } else if (type === 'shra') {
    details = '<div class="law-warning">' + escHtml((analysis && analysis.reason) || 'Not eligible') + '</div>';
    if (analysis && analysis.exclusions) {
      analysis.exclusions.forEach(function(e) { details += '<div class="law-warning">' + escHtml(e) + '</div>'; });
    }
    if (analysis && analysis.note) {
      details += '<div class="law-note">' + escHtml(analysis.note) + '</div>';
    }
  } else if (type === 'dbl' && isEligible) {
    (analysis.tiers || []).forEach(function(t) {
      const bonusUnits = Math.ceil(analysis.baseUnits * (1 + t.bonus));
      details += '<div class="law-detail-row"><span>' + escHtml(t.affordable) + '</span>' +
        '<span class="law-detail-val">' + escHtml(t.label) + ' → ' + bonusUnits + ' units</span></div>';
    });
    details += '<div class="law-detail-row" style="margin-top:6px"><span>Concessions (up to 3)</span><span class="law-detail-val">Available per § 65915(d)</span></div>';
    (analysis.concessions || []).forEach(function(c) {
      details += '<div class="law-pathway-note" style="padding-left:8px">• ' + escHtml(c) + '</div>';
    });
    details +=
      '<div class="law-detail-row"><span>Approval</span><span class="law-detail-val">' + escHtml(analysis.approval || '') + '</span></div>' +
      '<div class="law-note law-note-interpretive" style="margin-top:6px">' + escHtml(analysis.bapNote || '') + '</div>';
  } else if (type === 'dbl') {
    details = '<div class="law-warning">' + escHtml((analysis && analysis.reason) || 'Not applicable') + '</div>';
  } else if (type === 'shra' && isEligible) {
    const shraParcels = analysis.newParcels || analysis.maxUnits || 10;
    const minSqft = analysis.minParcelSqft || (analysis.sb1123Eligible ? 1200 : 600);
    details +=
      '<div class="law-detail-row"><span>SB 684 (MF zones)</span><span class="law-detail-val">' + (analysis.sb684Eligible ? '✔ Eligible' : (analysis.isAudCommercial ? 'Via AUD pathway' : 'N/A')) + '</span></div>' +
      '<div class="law-detail-row"><span>SB 1123 (SF vacant)</span><span class="law-detail-val">' + (analysis.sb1123Eligible ? '✔ Eligible' : 'N/A') + '</span></div>' +
      '<div class="law-detail-row"><span>New Parcels / Units</span><span class="law-detail-val">' + shraParcels + ' parcel' + (shraParcels !== 1 ? 's' : '') + ' × 1 unit each (City of SB local ordinance)</span></div>' +
      '<div class="law-detail-row"><span>Min Parcel Size</span><span class="law-detail-val">' + minSqft.toLocaleString() + ' sq ft per new parcel</span></div>' +
      (analysis.remainderNote ? '<div class="law-note law-note-interpretive" style="margin-top:4px">' + escHtml(analysis.remainderNote) + '</div>' : '') +
      '<div class="law-detail-row"><span>Max Unit Size</span><span class="law-detail-val">Avg ≤ ' + (analysis.maxUnitSqft || 1750) + ' sq ft</span></div>' +
      '<div class="law-detail-row"><span>Approval</span><span class="law-detail-val">' + escHtml(analysis.approval || 'Ministerial — 60 days max') + '</span></div>' +
      '<div class="law-detail-row"><span>Effective</span><span class="law-detail-val">' + escHtml(analysis.effectiveDate || '') + '</span></div>' +
      '<div class="law-detail-row" style="margin-top:8px"><span><b>Development Standards</b></span><span class="law-detail-val"></span></div>' +
      '<div class="law-pathway-note" style="padding-left:8px">✓ No parking required on new parcels</div>' +
      '<div class="law-pathway-note" style="padding-left:8px">✓ No setbacks between units (CBC fire separation only)</div>' +
      '<div class="law-pathway-note" style="padding-left:8px">✓ Side/rear setbacks: max 4 ft from original lot line</div>' +
      '<div class="law-pathway-note" style="padding-left:8px">✓ No minimum lot frontage or dimensions</div>' +
      '<div class="law-pathway-note" style="padding-left:8px">• Height, FAR, and objective design standards apply per zone</div>' +
      '<div class="law-pathway-note" style="padding-left:8px">• Inclusionary housing requirements apply</div>' +
      (analysis.coastalNote ? '<div class="law-warning" style="margin-top:6px">' + escHtml(analysis.coastalNote) + '</div>' : '') +
      (analysis.audCommercialNote ? '<div class="law-note law-note-interpretive">' + escHtml(analysis.audCommercialNote) + '</div>' : '');
  } else if (type === 'shra') {
    details = '<div class="law-warning">' + escHtml((analysis && analysis.reason) || 'Not eligible') + '</div>';
  } else if (type === 'ar' && isEligible) {
    details +=
      '<div class="law-detail-row"><span>Unit Count</span><span class="law-detail-val">' + escHtml(analysis.unitNote || '') + '</span></div>' +
      '<div class="law-detail-row"><span>Avg Unit Size</span><span class="law-detail-val">' + escHtml(analysis.avgUnitSize || '') + '</span></div>' +
      '<div class="law-detail-row"><span>Approval</span><span class="law-detail-val">' + escHtml(analysis.approval || '') + '</span></div>';
    if (analysis.incentives && analysis.incentives.length) {
      details += '<div class="law-detail-row" style="margin-top:6px"><span>Key Incentives</span><span class="law-detail-val"></span></div>';
      analysis.incentives.forEach(function(i) { details += '<div class="law-pathway-note" style="padding-left:8px">✓ ' + escHtml(i) + '</div>'; });
    }
    if (analysis.constraints && analysis.constraints.length) {
      details += '<div class="law-detail-row" style="margin-top:6px"><span>Key Constraints</span><span class="law-detail-val"></span></div>';
      analysis.constraints.forEach(function(c) { details += '<div class="law-pathway-note" style="padding-left:8px">• ' + escHtml(c) + '</div>'; });
    }
    if (analysis.notes && analysis.notes.length) {
      analysis.notes.forEach(function(n) { details += '<div class="law-warning" style="margin-top:4px">' + escHtml(n) + '</div>'; });
    }
    details += '<div class="law-note law-note-interpretive" style="margin-top:6px">' + escHtml(analysis.bapNote || '') + '</div>';
  } else if (type === 'ar') {
    details = '<div class="law-warning">' + escHtml((analysis && analysis.reason) || 'Not applicable') + '</div>';
  } else if (type === 'ab2011' && isEligible) {
    (analysis.pathways || []).forEach(function(pw) {
      details += '<div class="law-detail-row" style="margin-top:6px"><span><b>' + escHtml(pw.label) + '</b></span><span class="law-detail-val"></span></div>';
      details += '<div class="law-pathway-note" style="padding-left:8px">' + escHtml(pw.description) + '</div>';
      details += '<div class="law-pathway-note" style="padding-left:8px">Affordability: ' + escHtml(pw.affordability) + '</div>';
      details += '<div class="law-pathway-note" style="padding-left:8px">Approval: ' + escHtml(pw.approval) + '</div>';
      if (pw.heightBonus) details += '<div class="law-pathway-note" style="padding-left:8px">Height: ' + escHtml(pw.heightBonus) + '</div>';
      if (pw.corridorDisclaimer) details += '<div class="law-note law-note-interpretive" style="margin-top:4px">' + escHtml(pw.corridorDisclaimer) + '</div>';
    });
    if (!analysis.hasCorridor) details += '<div class="law-note" style="margin-top:6px">Pathway B (Mixed-Income Corridor) not available — parcel is not within ½ mile of a major transit stop. Only Pathway A (100% Affordable) applies.</div>';
    details +=
      '<div class="law-detail-row" style="margin-top:6px"><span>Prevailing Wage</span><span class="law-detail-val">Required for all AB 2011 projects</span></div>' +
      '<div class="law-note law-note-interpretive" style="margin-top:6px">' + escHtml(analysis.bapNote || '') + '</div>';
  } else if (type === 'ab2011') {
    details = '<div class="law-warning">' + escHtml((analysis && analysis.reason) || 'Not applicable') + '</div>';
  } else if (type === 'sb35') {
    details =
      '<div class="law-note" style="color:var(--color-text-muted);margin-bottom:6px">' + escHtml(analysis.reason || '') + '</div>' +
      '<div class="law-note law-note-interpretive">' + escHtml(analysis.note || '') + '</div>';
  }

  return '<div class="law-card law-card-' + type + ' ' + (isEligible ? 'law-eligible' : 'law-ineligible') + '">' +
    '<div class="law-card-header">' +
      '<div class="law-card-title">' + escHtml(law) + '</div>' +
      '<span class="law-status" style="color:' + statusColor + '">' + statusText + '</span>' +
    '</div>' +
    '<div class="law-card-sub">' + escHtml(subtitle) + '</div>' +
    '<div class="law-card-details">' + details + '</div>' +
    (analysis && analysis.citation ? '<div class="law-citation">' + escHtml(analysis.citation) + '</div>' : '') +
    '</div>';
}

function makeRestrictionCard(name, isActive, data, type) {
  var icons = { coastal: '🌊', fire: '🔥', historic: '🏛', flood: '💧' };
  var icon = icons[type] || '⚠️';

  if (!isActive) {
    return '<div class="restriction-card restriction-clear">' +
      '<span class="restriction-icon">✔</span>' +
      '<span class="restriction-name">' + name + '</span>' +
      '<span class="restriction-status restriction-ok">Clear</span>' +
      '</div>';
  }

  var items = (data && data.restrictions && data.restrictions.slice(0, 3)) ||
              (data && data.requirements && data.requirements.slice(0, 3)) || [];
  return '<div class="restriction-card restriction-active">' +
    '<div class="restriction-header">' +
      '<span class="restriction-icon">' + icon + '</span>' +
      '<span class="restriction-name">' + name + '</span>' +
      '<span class="restriction-status restriction-warn">Active</span>' +
    '</div>' +
    (items.length ? '<ul class="restriction-list">' + items.map(function(i) { return '<li>' + escHtml(i) + '</li>'; }).join('') + '</ul>' : '') +
    (data && data.timelineImpact ? '<div class="restriction-timeline">' + escHtml(data.timelineImpact) + '</div>' : '') +
    (data && data.chipProgram ? '<div class="restriction-chip-note">CHIP: ' + escHtml(data.chipProgram.name) + ' — ' + escHtml(data.chipProgram.annualFee) + '</div>' : '') +
    (data && data.opportunity ? '<div class="restriction-opportunity">★ ' + escHtml(data.opportunity) + '</div>' : '') +
    (data && data.citation ? '<div class="law-citation">' + escHtml(data.citation) + '</div>' : '') +
    '</div>';
}

// ── Pro Forma Estimator ───────────────────────────────────────

// State for the current parcel context (set when parcel loads)
var _pfContext = {};
var _pfMode = 'sale'; // 'sale' or 'rent'

function initProForma(report) {
  // Pre-fill inputs from analyzer report
  var bc = report.buildableCalc;
  var mu = report.maxUnits;
  var r  = report;

  // Pick best default scenario based on zone/eligibility
  var defaultScenario = 'SFR_NEW';
  if (r.aduAnalysis && r.aduAnalysis.eligible) defaultScenario = 'ADU_DETACHED';
  if (r.sb9Analysis && r.sb9Analysis.eligible) defaultScenario = 'DUPLEX_SB9';
  if (r.shraAnalysis && (r.shraAnalysis.sb684Eligible || r.shraAnalysis.sb1123Eligible)) defaultScenario = 'SHRA_TOWNHOME';

  var scenarioEl = document.getElementById('pfScenario');
  if (scenarioEl) scenarioEl.value = defaultScenario;

  // Pre-fill unit count from report
  var unitsEl = document.getElementById('pfUnits');
  if (unitsEl) unitsEl.value = mu.withStateLaw || 1;

  // Pre-fill avg unit sqft: use remaining FAR / unit count, fallback 800
  var avgSqft = 800;
  if (bc.available && bc.remainingFARCapacity && bc.remainingFARCapacity !== '—') {
    var remFAR = parseInt(bc.remainingFARCapacity) || 0;
    var units  = mu.withStateLaw || 1;
    avgSqft = remFAR > 0 ? Math.round(Math.min(remFAR / units, 1750)) : 800;
  }
  var sqftEl = document.getElementById('pfSqft');
  if (sqftEl) sqftEl.value = Math.max(300, avgSqft);

  // Pre-fill land value from Net AV (assessor data via report summary)
  var landEl = document.getElementById('pfLandValue');
  if (landEl && r.summary && r.summary.landValue > 0) {
    // Use 1.5x land AV as rough market land value (SB typical ratio)
    landEl.value = Math.round(r.summary.landValue * 1.5 / 10000) * 10000;
  }

  // Store context flags for entitlement cost calc
  _pfContext = {
    isCoastal:   !!(r.coastalAnalysis && r.coastalAnalysis.inCoastalZone),
    isHighFire:  !!(r.fireAnalysis    && r.fireAnalysis.inHighFireZone),
    isHistoric:  !!(r.historicAnalysis && r.historicAnalysis.isHistoric),
    sb9LotSplit: !!(r.sb9Analysis && r.sb9Analysis.lotSplit && r.sb9Analysis.lotSplit.allowed),
  };

  // Reset output
  var outputEl = document.getElementById('pfOutput');
  if (outputEl) outputEl.style.display = 'none';

  // Wire buttons (only once; remove old listeners by replacing nodes)
  var runBtn = document.getElementById('pfRunBtn');
  if (runBtn) {
    var newBtn = runBtn.cloneNode(true);
    runBtn.parentNode.replaceChild(newBtn, runBtn);
    newBtn.addEventListener('click', runProFormaEstimate);
  }

  var modeSale = document.getElementById('pfModeSale');
  var modeRent = document.getElementById('pfModeRent');
  if (modeSale) {
    var newSale = modeSale.cloneNode(true);
    modeSale.parentNode.replaceChild(newSale, modeSale);
    newSale.addEventListener('click', function() {
      _pfMode = 'sale';
      newSale.classList.add('active');
      document.getElementById('pfModeRent').classList.remove('active');
    });
  }
  if (modeRent) {
    var newRent = modeRent.cloneNode(true);
    modeRent.parentNode.replaceChild(newRent, modeRent);
    newRent.addEventListener('click', function() {
      _pfMode = 'rent';
      newRent.classList.add('active');
      document.getElementById('pfModeSale').classList.remove('active');
    });
  }
}

function runProFormaEstimate() {
  var scenario  = document.getElementById('pfScenario').value;
  var unitCount = parseInt(document.getElementById('pfUnits').value) || 1;
  var avgSqft   = parseInt(document.getElementById('pfSqft').value)  || 800;
  var landValue = parseInt(document.getElementById('pfLandValue').value) || 0;

  var inputs = { unitCount: unitCount, avgUnitSqft: avgSqft, landValue: landValue };
  var pf = window.ProForma.calcProForma(scenario, inputs, _pfContext);

  renderProForma(pf, _pfMode);
  document.getElementById('pfOutput').style.display = 'block';

  // Store pfResult for PDF export and advanced metrics
  if (window.currentParcelData) window.currentParcelData.pfResult = pf;

  // Advanced metrics: IRR / NPV / Equity Multiple
  if (window.AdvancedProForma) {
    var advEl = document.getElementById('reportAdvancedMetrics');
    if (advEl) {
      advEl.innerHTML = window.AdvancedProForma.renderAdvancedMetrics(pf, _pfMode);
    }
    // Sensitivity panel — append after advanced metrics
    var sensHtml = window.AdvancedProForma.renderSensitivityPanel(pf);
    if (advEl && sensHtml) {
      advEl.innerHTML += sensHtml;
    }
  }

  // Update UIWiring header with pfResult so PDF export has it
  if (window.UIWiring && state._pendingHeaderApn) {
    window.UIWiring.updateParcelHeader(
      state._pendingHeaderApn,
      state._pendingHeaderAddr,
      state._pendingHeaderLat,
      state._pendingHeaderLng,
      window.currentParcelData ? window.currentParcelData.report : null,
      pf
    );
  }
}

function renderProForma(pf, mode) {
  var fmt = window.ProForma.fmt$;
  var isSale = mode !== 'rent';

  // ── KPI cards ────────────────────────────────────────────
  var kpiGrid = document.getElementById('pfKpiGrid');
  var tdc = pf.totalDevCost;
  var tdcMid = tdc.mid;

  if (isSale) {
    var rev = pf.saleRevenue;
    var net = pf.netProfit;
    var roi = pf.roi;
    kpiGrid.innerHTML = [
      pfKpi('Total Dev Cost', fmt(tdc.low) + '–' + fmt(tdc.high), fmt(tdc.mid), 'cost', 'Sum of all costs to develop'),
      pfKpi('Sale Revenue', fmt(rev.low) + '–' + fmt(rev.high), fmt(rev.mid), 'revenue', 'Estimated sale value at SB market comps'),
      pfKpi('Net Profit', fmt(net.low) + '–' + fmt(net.high), fmt(net.mid), net.mid >= 0 ? 'profit' : 'loss', 'Revenue minus total dev cost'),
      pfKpi('ROI', roi.low + '%–' + roi.high + '%', roi.mid + '%', parseFloat(roi.mid) >= 15 ? 'profit' : 'neutral', 'Return on total capital invested'),
    ].join('');
  } else {
    var grent = pf.grossMonthlyRent;
    var noi   = pf.noi;
    var ival  = pf.incomeValue;
    kpiGrid.innerHTML = [
      pfKpi('Total Dev Cost', fmt(tdc.low) + '–' + fmt(tdc.high), fmt(tdc.mid), 'cost', 'Sum of all costs to develop'),
      pfKpi('Monthly Rent', fmt(grent.low) + '–' + fmt(grent.high), fmt(grent.mid), 'revenue', 'Estimated gross monthly rent (all units)'),
      pfKpi('Annual NOI', fmt(noi.low) + '–' + fmt(noi.high), fmt(noi.mid), 'profit', 'Net operating income after 35% vacancy/expenses'),
      pfKpi('Income Value', fmt(ival.low) + '–' + fmt(ival.high), fmt(ival.mid), 'neutral', 'Asset value using cap rate'),
    ].join('');
  }

  // ── Cost breakdown bars ───────────────────────────────────
  var bdEl = document.getElementById('pfBreakdown');
  bdEl.innerHTML = '<div class="pf-breakdown-title">Cost Breakdown</div>' +
    pf.costBreakdown.map(function(item) {
      var pct = Math.round((item.pct || 0) * 100);
      var barW = Math.min(100, Math.max(3, pct));
      return '<div class="pf-bar-row">' +
        '<div class="pf-bar-label">' + escHtml(item.label) + '</div>' +
        '<div class="pf-bar-track">' +
          '<div class="pf-bar-fill" style="width:' + barW + '%"></div>' +
        '</div>' +
        '<div class="pf-bar-values">' +
          '<span class="pf-bar-range">' + fmt(item.range.low) + '–' + fmt(item.range.high) + '</span>' +
          '<span class="pf-bar-mid">' + fmt(item.range.mid) + '</span>' +
          '<span class="pf-bar-pct">' + pct + '%</span>' +
        '</div>' +
      '</div>';
    }).join('') +
    '<div class="pf-bar-total">' +
      '<div class="pf-bar-label"><strong>Total Dev Cost</strong></div>' +
      '<div class="pf-bar-track"></div>' +
      '<div class="pf-bar-values">' +
        '<span class="pf-bar-range">' + fmt(tdc.low) + '–' + fmt(tdc.high) + '</span>' +
        '<span class="pf-bar-mid pf-total-mid">' + fmt(tdc.mid) + '</span>' +
        '<span class="pf-bar-pct">100%</span>' +
      '</div>' +
    '</div>';

  // ── Rental detail (rent mode only) ───────────────────────
  var rentalEl = document.getElementById('pfRental');
  if (!isSale) {
    var rc = pf.rentPerUnit;
    var cpu = pf.costPerUnit;
    var be  = pf.breakEvenLand;
    rentalEl.style.display = 'block';
    rentalEl.innerHTML =
      '<div class="pf-breakdown-title">Rental Analysis</div>' +
      '<div class="pf-rental-grid">' +
        makeRow('Bedroom Type',    pf.bedroomType.replace('br',' BR').replace('studio','Studio')) +
        makeRow('Rent / Unit / Mo', fmt(rc.low) + '–' + fmt(rc.high) + ' <span class="pf-mid-tag">mid: ' + fmt(rc.mid) + '</span>') +
        makeRow('Gross Annual Rent',fmt(pf.grossAnnualRent.low) + '–' + fmt(pf.grossAnnualRent.high)) +
        makeRow('NOI (65% of gross)',fmt(pf.noi.low) + '–' + fmt(pf.noi.high)) +
        makeRow('Income Value (cap)',fmt(pf.incomeValue.low) + '–' + fmt(pf.incomeValue.high)) +
        makeRow('Cost / Unit',      fmt(cpu.low) + '–' + fmt(cpu.high)) +
        makeRow('Break-Even Land',  fmt(be.low)  + '–' + fmt(be.high)) +
      '</div>';
  } else {
    rentalEl.style.display = 'none';
    // Show break-even land in sale mode too
    var be2 = pf.breakEvenLand;
    rentalEl.style.display = 'block';
    rentalEl.innerHTML =
      '<div class="pf-breakdown-title">Key Metrics</div>' +
      '<div class="pf-rental-grid">' +
        makeRow('Cost / Unit',     fmt(pf.costPerUnit.low) + '–' + fmt(pf.costPerUnit.high) + ' <span class="pf-mid-tag">mid: ' + fmt(pf.costPerUnit.mid) + '</span>') +
        makeRow('Sale Comps',      fmt(pf.saleComp.low) + '–' + fmt(pf.saleComp.high) + '/sq ft') +
        makeRow('Break-Even Land', fmt(be2.low) + '–' + fmt(be2.high) + ' <span class="pf-mid-tag">mid: ' + fmt(be2.mid) + '</span>') +
      '</div>';
  }

  // ── Assumptions ───────────────────────────────────────────
  var aList = document.getElementById('pfAssumptionList');
  aList.innerHTML = pf.assumptions.map(function(a) {
    return '<li>' + escHtml(a) + '</li>';
  }).join('');
}

function pfKpi(label, range, mid, type, sub) {
  var colors = {
    cost:    { bg: '#1a5f7a12', border: '#1a5f7a40', val: '#1a5f7a' },
    revenue: { bg: '#2e704112', border: '#2e704140', val: '#2e7041' },
    profit:  { bg: '#2e704112', border: '#2e704140', val: '#2e7041' },
    loss:    { bg: '#ef444412', border: '#ef444440', val: '#dc2626' },
    neutral: { bg: 'var(--color-surface-2)', border: 'var(--color-border)', val: 'var(--color-text)' },
  };
  var c = colors[type] || colors.neutral;
  return '<div class="pf-kpi" style="background:' + c.bg + ';border-color:' + c.border + '">' +
    '<div class="pf-kpi-label">' + escHtml(label) + '</div>' +
    '<div class="pf-kpi-mid" style="color:' + c.val + '">' + escHtml(mid) + '</div>' +
    '<div class="pf-kpi-range">' + escHtml(range) + '</div>' +
    '<div class="pf-kpi-sub">' + escHtml(sub) + '</div>' +
  '</div>';
}

// ── Detail panel population ───────────────────────────────────
function showParcelDetail(feature) {
  const p = feature.properties;

  document.getElementById('detailEmpty').style.display = 'none';
  document.getElementById('detailPanel').style.display = 'flex';
  // Hide the results table when a single parcel detail is shown
  document.getElementById('resultsSection').style.display = 'none';
  // Open bottom sheet on mobile
  if (window.MobileUI && window.MobileUI.isMobile()) window.MobileUI.openPanel();

  const apn  = p.apn || p.apn9Digit || '—';
  const addr = [p.situs1, p.situs2].filter(Boolean).join(' ') || '—';

  document.getElementById('detailApn').textContent = apn;
  document.getElementById('detailAddress').textContent = addr;

  populateParcelTab(p);
  populateZoningTab(null); // placeholder until async loads
  populateFireTab(null, false, null);

  // Raw data (absent in public version)
  const rawDataEl = document.getElementById('rawData');
  if (rawDataEl) rawDataEl.textContent = JSON.stringify(p, null, 2);

  // Store export handler so UIWiring can re-attach it after replacing .detail-actions
  window._handleExportParcel = () => exportGeoJSON([feature], `parcel_${apn}`);
  document.getElementById('exportParcel').onclick = window._handleExportParcel;

  // ── Street View in Parcel tab ─────────────────────────────
  const svContainer = document.getElementById('svContainer');
  if (svContainer && window.DataFeatures) {
    // Get WGS84 centroid from geometry
    const env = feature.geometry?.coordinates?.[0];
    if (env) {
      const lngs = env.map(c => c[0]);
      const lats  = env.map(c => c[1]);
      const clng  = (Math.min(...lngs) + Math.max(...lngs)) / 2;
      const clat  = (Math.min(...lats) + Math.max(...lats)) / 2;
      svContainer.innerHTML = window.DataFeatures.getStreetViewHTML(clat, clng, addr);
    }
  }

  // Reset Data tab to loading state
  ['permitHistoryContainer','aduCompsContainer','schoolsContainer','waterZoneContainer','ownershipContainer'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<div class="detail-row"><span class="detail-val" style="color:var(--color-text-muted)">Loading…</span></div>';
  });

  // ── Ownership signals (synchronous, from parcel attrs) ────
  if (window.DataFeatures) {
    const ownershipEl = document.getElementById('ownershipContainer');
    if (ownershipEl) {
      const ownerAnalysis = window.DataFeatures.analyzeOwnership(p);
      ownershipEl.innerHTML = window.DataFeatures.renderOwnershipSignals(ownerAnalysis);
    }
  }

  // Auto-switch to Dev Report tab
  switchTab('report');

  // ── Wire UIWiring header (watchlist / compare / PDF) ─────
  // Will be called again after report renders with pfResult; call now with nulls
  if (window.UIWiring) {
    const env2 = feature.geometry?.coordinates?.[0];
    let lat2 = null, lng2 = null;
    if (env2) {
      lng2 = (Math.min(...env2.map(c => c[0])) + Math.max(...env2.map(c => c[0]))) / 2;
      lat2 = (Math.min(...env2.map(c => c[1])) + Math.max(...env2.map(c => c[1]))) / 2;
    }
    window.UIWiring.updateParcelHeader(apn, addr, lat2, lng2, null, null);
    // Store for later update with full report
    state._pendingHeaderApn  = apn;
    state._pendingHeaderAddr = addr;
    state._pendingHeaderLat  = lat2;
    state._pendingHeaderLng  = lng2;
  }
}

function makeRow(key, val, cls = '') {
  return `<div class="detail-row">
    <span class="detail-key">${key}</span>
    <span class="detail-val ${cls}">${val}</span>
  </div>`;
}

function populateParcelTab(p) {
  const addr = [p.Situs1, p.Situs2].filter(Boolean).join(' ') ||
    [p.SNum, p.SDir, p.SStreet, p.SStreetSuf].filter(Boolean).join(' ') || '—';
  const grid = document.getElementById('parcelGrid');
  grid.innerHTML = [
    makeRow('APN', `<span class="highlight">${fmtVal(p.apn || p.apn9Digit)}</span>`),
    makeRow('Address', fmtVal(addr)),
    makeRow('Owner', fmtVal(p.ownerName)),
    makeRow('Land Use', fmtVal(p.landUse)),
    makeRow('Use Code', fmtVal(p.useCode)),
    makeRow('Acreage', fmtAcre(p.acreage)),
    makeRow('Sq Footage', fmtSqft(p.squareFootage)),
    makeRow('Year Built', fmtVal(p.yearBuilt)),
    makeRow('Bedrooms', fmtVal(p.Bedrooms)),
    makeRow('Bathrooms', fmtVal(p.Bathrooms)),
    '<div style="height:4px;border-bottom:1px solid var(--color-divider);margin:4px 0"></div>',
    makeRow('Land Value', `<span class="money">${fmtCurrency(p.landValue)}</span>`),
    makeRow('Struct. Impr.', `<span class="money">${fmtCurrency(p.strImpr)}</span>`),
    makeRow('Living Impr.', `<span class="money">${fmtCurrency(p.livingImprovements)}</span>`),
    makeRow('Net AV', `<span class="money">${fmtCurrency(p.netAssessedValue)}</span>`),
    makeRow('Exemptions', `<span class="money">${fmtCurrency(p.exemptions)}</span>`),
    makeRow('HomeOwner Ex.', `<span class="money">${fmtCurrency(p.homeownerExemption)}</span>`),
    makeRow('Tax Bill', p.taxBill ? `<a href="${p.taxBill}" target="_blank" style="color:var(--color-primary)">View ↗</a>` : '—'),
    '<div style="height:4px;border-bottom:1px solid var(--color-divider);margin:4px 0"></div>',
    makeRow('Tract Name', fmtVal(p.TractName)),
    makeRow('Map Type', fmtVal(p.MapType)),
    makeRow('Lot/Unit', [p.LotNum, p.UnitNum].filter(Boolean).join(' / ') || '—'),
    makeRow('TRA', fmtVal(p.TRA)),
    makeRow('Doc Date', fmtVal(p.DocDate)),
  ].join('');
}

function populateZoningTab(zp) {
  const grid = document.getElementById('zoningGrid');
  if (!zp) {
    grid.innerHTML = '<div class="detail-row"><span class="detail-val" style="color:var(--color-text-muted)">Loading zoning data…</span></div>';
    return;
  }
  const zoneRaw = zp.zoneOther || zp.zone1 || zp.zone || '—';
  const zone = zoneRaw.split('/')[0].trim() || '—';
  const zoneColor = ZONE_COLORS[zone] || '#cccccc';
  const label = ZONE_LABELS[zone] || zp.zoneDescr || '—';
  grid.innerHTML = [
    makeRow('Zone', `<span class="zone-chip" style="background:${zoneColor}20;color:${zoneColor};border:1px solid ${zoneColor}40">${zone}</span>`),
    makeRow('Description', fmtVal(label)),
    makeRow('Full Designation', fmtVal(zp.zonedesg)),
    makeRow('Zone Other', fmtVal(zp.zoneOther)),
    makeRow('Overlay Zone', fmtVal(zp.overlayZone)),
  ].join('');
}

function populateFireTab(chipData, isHighFire, floodData) {
  const grid = document.getElementById('fireGrid');
  grid.innerHTML = [
    makeRow('High Fire Area', isHighFire
      ? '<span style="color:var(--color-error);font-weight:700">⚠ Yes</span>'
      : '<span style="color:var(--color-success)">No</span>'),
    makeRow('Chip Hazard Zone', fmtVal(chipData?.haz_zone)),
    makeRow('Chip Assessment', fmtVal(chipData?.assessment)),
    '<div style="height:4px;border-bottom:1px solid var(--color-divider);margin:4px 0"></div>',
    makeRow('FEMA Flood Zone', floodData ? fmtVal(floodData.fldZone || floodData.zoneSubty || 'Yes') : 'Not in flood zone'),
    makeRow('Flood Zone Type', fmtVal(floodData?.SFHA_TF ? 'Special Flood Hazard Area' : floodData ? 'Flood zone' : '—')),
  ].join('');
}

// ── Results Table ────────────────────────────────────────────
function populateResultsTable(features) {
  const tbody = document.getElementById('tableBody');
  const section = document.getElementById('resultsSection');
  const title = document.getElementById('resultsTitle');

  if (!features.length) {
    tbody.innerHTML = '<tr class="no-results-row"><td colspan="6">No results in current view</td></tr>';
    section.style.display = 'flex';
    return;
  }

  state.lastSearchResults = features;
  title.textContent = `${features.length} Parcels in View`;
  section.style.display = 'flex';

  tbody.innerHTML = features.slice(0, CONFIG.MAX_RESULTS).map(f => {
    const p = f.attributes || f.properties;
    const addr = [p.situs1, p.situs2].filter(Boolean).join(' ') || '—';
    return `<tr data-objectid="${p.OBJECTID}" data-apn="${p.apn || ''}">
      <td title="${p.apn || ''}">${p.apn || '—'}</td>
      <td title="${addr}">${addr}</td>
      <td title="${p.ownerName || ''}">${p.ownerName || '—'}</td>
      <td title="${p.landUse || ''}">${p.landUse || '—'}</td>
      <td>${p.acreage ? Number(p.acreage).toFixed(3) : '—'}</td>
      <td style="font-family:var(--font-mono)">${p.netAssessedValue ? '$' + Number(p.netAssessedValue).toLocaleString() : '—'}</td>
    </tr>`;
  }).join('');

  // Row click → show parcel detail directly from cached results (no re-query)
  tbody.querySelectorAll('tr').forEach(row => {
    row.addEventListener('click', () => {
      const apn = row.dataset.apn;
      if (!apn) return;

      // Find the feature in the last search results first (fastest path)
      const cached = (state.lastSearchResults || []).find(f => {
        const p = f.attributes || f.properties || {};
        return (p.apn || p.apn9Digit || '') === apn;
      });

      if (cached) {
        // Convert ArcGIS feature format to GeoJSON if needed
        const gj = cached.geometry
          ? arcgisPolygonToGeoJSON(cached)
          : { type: 'Feature', geometry: null, properties: cached.attributes || cached.properties || {} };
        if (gj) {
          selectParcel(gj, null);
          // Zoom map to parcel
          if (gj.geometry) {
            try {
              const coords = gj.geometry.coordinates[0];
              const latlngs = coords.map(([lng, lat]) => [lat, lng]);
              state.map.fitBounds(L.latLngBounds(latlngs), { padding: [60, 60], maxZoom: 18 });
            } catch(e) { /* ignore zoom errors */ }
          }
        }
      } else {
        // Fallback: full APN search
        searchByAPN(apn, true);
      }
    });
  });
}

function highlightTableRow(id) {
  document.querySelectorAll('#tableBody tr').forEach(r => r.classList.remove('selected'));
  const row = document.querySelector(`#tableBody tr[data-objectid="${id}"]`);
  if (row) { row.classList.add('selected'); row.scrollIntoView({ block: 'nearest' }); }
}

// ── Search ───────────────────────────────────────────────────
const searchInput = document.getElementById('searchInput');
const searchDropdown = document.getElementById('searchDropdown');
const searchClear = document.getElementById('searchClear');

let searchTimer = null;

searchInput.addEventListener('input', () => {
  const v = searchInput.value.trim();
  searchClear.style.display = v ? 'flex' : 'none';
  clearTimeout(searchTimer);
  if (v.length < 3) { searchDropdown.hidden = true; return; }
  searchTimer = setTimeout(() => liveSearch(v), 350);
});

searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    clearTimeout(searchTimer);
    searchDropdown.hidden = true;
    executeSearch(searchInput.value.trim());
  }
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.style.display = 'none';
  searchDropdown.hidden = true;
});

document.getElementById('searchBtn').addEventListener('click', () => {
  searchDropdown.hidden = true;
  executeSearch(searchInput.value.trim());
});

// Close dropdown on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('.header-center')) searchDropdown.hidden = true;
});

// Determine if query looks like APN
function isAPN(q) {
  return /^\d{3}-?\d{3}-?\d{2,3}/.test(q.replace(/\s/g, ''));
}

function normalizeDirectionQuery(q) {
  return q
    .replace(/\bNorth\b/gi,'N').replace(/\bSouth\b/gi,'S')
    .replace(/\bEast\b/gi,'E').replace(/\bWest\b/gi,'W')
    .replace(/\bNortheast\b/gi,'NE').replace(/\bNorthwest\b/gi,'NW')
    .replace(/\bSoutheast\b/gi,'SE').replace(/\bSouthwest\b/gi,'SW');
}

async function liveSearch(q) {
  if (!q) return;
  try {
    let results = [];
    if (isAPN(q)) {
      const normalizedAPN = q.replace(/\s/g, '');
      const data = await queryLayer(CONFIG.LAYERS.parcels, {
        where: `APN LIKE '${normalizedAPN}%'`,
        outFields: 'apn,situs1,situs2,ownerName,landUse',
        returnGeometry: 'false',
        resultRecordCount: 8,
      });
      results = (data.features || []).map(f => ({
        type: 'APN',
        title: f.attributes.apn,
        sub: [f.attributes.situs1, f.attributes.situs2].filter(Boolean).join(' ') || f.attributes.ownerName || '—',
        apn: f.attributes.apn,
      }));
    } else {
      // Address search
      const data = await queryLayer(CONFIG.LAYERS.parcels, {
        where: `UPPER(Situs1) LIKE UPPER('%${q.replace(/'/g, "''")}%')`,
        outFields: 'apn,situs1,situs2,ownerName,landUse',
        returnGeometry: 'false',
        resultRecordCount: 8,
      });
      results = (data.features || []).map(f => ({
        type: 'Address',
        title: [f.attributes.situs1, f.attributes.situs2].filter(Boolean).join(' ') || '—',
        sub: `APN: ${f.attributes.apn || '—'} · ${f.attributes.ownerName || ''}`,
        apn: f.attributes.apn,
      }));
    }
    renderDropdown(results);
  } catch (e) {
    renderDropdown([]);
  }
}

function renderDropdown(results) {
  if (!results.length) {
    searchDropdown.innerHTML = '<div class="search-no-results">No results found</div>';
    searchDropdown.hidden = false;
    return;
  }
  searchDropdown.innerHTML = results.map(r => `
    <div class="search-result-item" data-apn="${r.apn}">
      <div class="result-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      </div>
      <div class="result-main">
        <div class="result-title">${r.title}</div>
        <div class="result-sub">${r.sub}</div>
      </div>
      <span class="result-type">${r.type}</span>
    </div>
  `).join('');
  searchDropdown.hidden = false;

  searchDropdown.querySelectorAll('.search-result-item').forEach(el => {
    el.addEventListener('click', () => {
      searchDropdown.hidden = true;
      searchInput.value = el.querySelector('.result-title').textContent;
      searchClear.style.display = 'flex';
      searchByAPN(el.dataset.apn, true);
    });
  });
}

async function executeSearch(q) {
  if (!q) return;
  if (isAPN(q)) {
    await searchByAPN(q.replace(/\s/g, ''), true);
  } else {
    await searchByAddress(q);
  }
}

async function searchByAPN(apn, zoom = true) {
  try {
    setLoading(true);
    setStatus('Searching by APN…', 'loading');
    const data = await queryLayer(CONFIG.LAYERS.parcels, {
      where: `APN = '${apn.replace(/'/g, "''")}'`,
      outFields: '*',
      returnGeometry: 'true',
    });
    setLoading(false);

    if (!data.features?.length) {
      showToast(`No parcel found for APN: ${apn}`, 'error');
      setStatus('No results');
      return;
    }

    const feature = arcgisPolygonToGeoJSON(data.features[0]);
    if (!feature) return;

    // Zoom to it
    if (zoom) {
      const latlngs = feature.geometry.coordinates[0].map(([lng, lat]) => [lat, lng]);
      const bounds = L.latLngBounds(latlngs);
      state.map.fitBounds(bounds, { padding: [60, 60], maxZoom: 18 });
    }

    // Highlight on existing layer or add temp layer
    await loadParcelsInView();
    setTimeout(() => {
      // Find and select the layer
      if (state.activeFeatureLayers.parcels) {
        state.activeFeatureLayers.parcels.eachLayer(layer => {
          if ((layer.feature?.properties?.apn || layer.feature?.properties?.apn9Digit) === apn) {
            selectParcel(layer.feature, layer);
          }
        });
      } else {
        showParcelDetail(feature);
      }
    }, 300);

    setStatus(`Found APN ${apn}`);
  } catch (e) {
    setLoading(false);
    showToast('Search failed: ' + e.message, 'error');
    setStatus('Search failed', 'error');
  }
}

async function searchByAddress(addr) {
  try {
    setLoading(true);
    setStatus('Searching by address…', 'loading');
    const safAddr = addr.replace(/'/g, "''").toUpperCase();
    const data = await queryLayer(CONFIG.LAYERS.parcels, {
      where: `UPPER(situs1) LIKE '%${safAddr}%' OR UPPER(situs2) LIKE '%${safAddr}%'`,
      outFields: '*',
      returnGeometry: 'true',
      resultRecordCount: 20,
    });
    setLoading(false);

    if (!data.features?.length) {
      showToast(`No parcels found for "${addr}"`, 'error');
      setStatus('No results');
      return;
    }

    if (data.features.length === 1) {
      const feature = arcgisPolygonToGeoJSON(data.features[0]);
      if (!feature) return;
      const latlngs = feature.geometry.coordinates[0].map(([lng, lat]) => [lat, lng]);
      state.map.fitBounds(L.latLngBounds(latlngs), { padding: [60, 60], maxZoom: 18 });
      await loadParcelsInView();
      setTimeout(() => {
        if (state.activeFeatureLayers.parcels) {
          state.activeFeatureLayers.parcels.eachLayer(layer => {
            const p = layer.feature?.properties;
            if (p && (p.situs1?.toUpperCase().includes(addr.toUpperCase()) || p.situs2?.toUpperCase().includes(addr.toUpperCase()))) {
              selectParcel(layer.feature, layer);
            }
          });
        }
      }, 300);
    } else {
      // Multiple results: populate table, zoom to extent
      const geojsonFeatures = data.features.map(arcgisPolygonToGeoJSON).filter(Boolean);
      populateResultsTable(data.features);
      const allCoords = geojsonFeatures.flatMap(f => f.geometry.coordinates[0]).map(([lng, lat]) => [lat, lng]);
      if (allCoords.length) state.map.fitBounds(L.latLngBounds(allCoords), { padding: [40, 40] });
      showToast(`Found ${data.features.length} parcels matching "${addr}"`, 'info');
    }
    setStatus(`Found ${data.features.length} result(s)`);
  } catch (e) {
    setLoading(false);
    showToast('Search failed: ' + e.message, 'error');
    setStatus('Search failed', 'error');
  }
}

// ── GeoJSON Export ───────────────────────────────────────────
function exportGeoJSON(features, filename = 'sb_parcels') {
  const geojson = {
    type: 'FeatureCollection',
    features: features.map(f => {
      if (f.type === 'Feature') return f;
      return arcgisPolygonToGeoJSON(f);
    }).filter(Boolean),
    metadata: {
      source: 'City of Santa Barbara ArcGIS REST API',
      endpoint: CONFIG.CITY_BASE,
      timestamp: new Date().toISOString(),
      crs: 'WGS84 (EPSG:4326)',
    },
  };
  const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.geojson`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exported ${geojson.features.length} features as GeoJSON`, 'success');
}

document.getElementById('exportAll').addEventListener('click', () => {
  if (!state.lastSearchResults.length) {
    showToast('No data to export — load parcels first', 'error');
    return;
  }
  const geojsonFeatures = state.lastSearchResults
    .map(f => f.attributes ? arcgisPolygonToGeoJSON({ geometry: f.geometry, attributes: f.attributes }) : f)
    .filter(Boolean);
  exportGeoJSON(geojsonFeatures, 'sb_parcels_view');
});

// ── Layer toggles ────────────────────────────────────────────
document.querySelectorAll('input[data-layer]').forEach(cb => {
  cb.addEventListener('change', async () => {
    const key = cb.dataset.layer;
    const checked = cb.checked;

    if (checked) {
      switch (key) {
        case 'parcels':
          if (state.map.getZoom() >= 14) loadParcelsInView();
          else { showToast('Zoom in to zoom level 14+ to see parcel boundaries', 'info'); cb.checked = false; }
          break;
        case 'zoning': loadZoningInView(); break;
        case 'city-limits': loadCityLimits(); break;
        case 'assessment-chips': loadAssessmentChips(); break;
        case 'neighborhoods': loadNeighborhoods(); break;
        case 'high-fire': loadHighFire(); break;
        case 'fema-flood': loadFemaFlood(); break;
        case 'coastal-zone': loadCoastalZone(); break;
        case 'historic': loadHistoricSites(); break;
        case 'county-parcels':
          if (state.map.getZoom() >= 13) loadCountyParcelsInView();
          else { showToast('Zoom in to see county parcels', 'info'); cb.checked = false; }
          break;
      }
    } else {
      removeLayer(key);
    }
  });
});

// Reset layers button
document.getElementById('resetLayers').addEventListener('click', () => {
  document.querySelectorAll('input[data-layer]').forEach(cb => {
    const shouldBeOn = ['parcels', 'city-limits'].includes(cb.dataset.layer);
    if (cb.checked !== shouldBeOn) {
      cb.checked = shouldBeOn;
      cb.dispatchEvent(new Event('change'));
    }
  });
  showToast('Layers reset to defaults', 'info');
});

// ── Basemap switching ────────────────────────────────────────
document.querySelectorAll('.basemap-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.basemap;
    if (key === state.currentBasemap) return;
    state.map.removeLayer(BASEMAPS[state.currentBasemap]);
    BASEMAPS[key].addTo(state.map);
    BASEMAPS[key].bringToBack();
    state.currentBasemap = key;
    document.querySelectorAll('.basemap-btn').forEach(b => b.classList.toggle('active', b.dataset.basemap === key));
  });
});

// ── Opacity controls ─────────────────────────────────────────
document.querySelectorAll('.opacity-slider').forEach(slider => {
  slider.addEventListener('input', () => {
    const key = slider.dataset.opacity;
    const val = parseFloat(slider.value);
    state.layerOpacity[key] = val;
    if (state.activeFeatureLayers[key]) {
      state.activeFeatureLayers[key].setStyle({ fillOpacity: val * (key === 'zoning' ? 1 : 0.35), opacity: val });
    }
  });
});

// ── Detail tab switching ──────────────────────────────────────
function switchTab(tabName) {
  document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.hidden = true);
  const tabEl = document.querySelector(`.detail-tab[data-tab="${tabName}"]`);
  if (tabEl) tabEl.classList.add('active');
  const contentEl = document.getElementById('tab' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
  if (contentEl) contentEl.hidden = false;
}

document.querySelectorAll('.detail-tab').forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

// ── Expose export handler for UIWiring re-attachment ────────
window._handleExportParcel = null;
window._appState = state;

// Close detail panel
document.getElementById('closeDetail').addEventListener('click', () => {
  document.getElementById('detailPanel').style.display = 'none';
  if (state.selectedParcel) {
    try { state.selectedParcel.setStyle({ fillOpacity: state.layerOpacity.parcels * 0.35, weight: 1, color: '#1a5f7a' }); } catch(e) {}
    state.selectedParcel = null;
  }
  state.selectedAPN = null;
  state.compareAPNs.forEach(apn => {
    const l = state.compareLayers[apn];
    if (l) try { l.setStyle({ fillOpacity: state.layerOpacity.parcels * 0.35, weight: 1, color: '#1a5f7a' }); } catch(e) {}
  });
  state.compareAPNs = []; state.compareLayers = {}; state.compareMode = false;
  const mapEl = document.getElementById('map');
  if (mapEl) mapEl.classList.remove('compare-pick-mode');
  // If there are results in the table, show the results section; otherwise show empty state
  const hasResults = state.lastSearchResults && state.lastSearchResults.length > 0;
  if (hasResults) {
    document.getElementById('resultsSection').style.display = 'flex';
    document.getElementById('detailEmpty').style.display = 'none';
  } else {
    document.getElementById('detailEmpty').style.display = 'flex';
    document.getElementById('resultsSection').style.display = 'none';
  }
  // Close mobile bottom sheet
  if (window.MobileUI) window.MobileUI.closePanel();
});

// ── Dark mode toggle ─────────────────────────────────────────
(function () {
  const t = document.querySelector('[data-theme-toggle]');
  const r = document.documentElement;
  let d = r.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
  r.setAttribute('data-theme', d);
  t && t.addEventListener('click', () => {
    d = d === 'dark' ? 'light' : 'dark';
    r.setAttribute('data-theme', d);
    t.innerHTML = d === 'dark'
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  });
})();

// ── Initial data load ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  // Load city limits immediately since it's always-on
  // Parcels will auto-load via zoom/move events
  showToast('Connected to Santa Barbara GIS Portal', 'success', 3000);
});
