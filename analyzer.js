/* ============================================================
   Santa Barbara Parcel Development Analyzer
   Provides developer-grade planning analysis based on:
   - City of Santa Barbara Zoning Ordinance
   - California SB 9 (Gov Code §65852.21 / §66411.7)
   - California AB 2097 (parking exemption near transit)
   - California SB 684 / SB 1123 (Starter Home Revitalization Act)
   - California ADU Law (Gov Code §65852.2)
   - Coastal Act / Local Coastal Program (S-D-3 overlay)
   - High Fire Hazard restrictions
   - FEMA Flood restrictions
   - Historic District restrictions
   ============================================================ */

'use strict';

// ── Zone category mappings ────────────────────────────────────

const ZONE_CATEGORIES = {
  // Single-family residential
  SINGLE_FAMILY: ['RS-1A','A-1','RS-25','A-2','RS-15','E-1','RS-10','RS-7.5','E-3','RS-6','R-1'],
  // Multi-family residential
  MULTI_FAMILY: ['R-2','R-M','R-3','R-MH','R-4'],
  // Commercial
  COMMERCIAL: ['C-R','C-1','C-P','C-G','C-2','O-R','O-M','ACS'],
  // Industrial/Manufacturing
  INDUSTRIAL: ['M-C','M-I','M-1'],
  // Parks
  PARKS: ['P-R'],
  // Coastal commercial
  COASTAL_COMM: ['HRC-1','CO-HR','HRC-2','CO-HV','OC','CO-CAR','OM-1','CO-MI','HC','CO-H'],
  // Special plan / PUD / RD
  SPECIAL: ['PUD','RD','SP7-RC','SP1-PP','SP2-CP','SP8-H','SP5-WC','SP4-RA','SP9-VM','SP10-LP','SP-9','SP11-CHC'],
  // Airport
  AIRPORT: ['A-A-O','G-S-R','A-C','A-C-R','A-I-1','A-I-2','A-F'],
};

// Minimum lot sizes by zone (sq ft)
const MIN_LOT_SIZE = {
  'RS-1A': 43560, 'A-1': 43560,
  'RS-25': 25000, 'A-2': 25000,
  'RS-15': 15000, 'E-1': 15000,
  'RS-10': 10000,
  'RS-7.5': 7500, 'E-3': 7500,
  'RS-6': 6000, 'R-1': 6000,
  'R-2': 6000,
  'R-M': 6000, 'R-3': 6000,
  'R-MH': 6000, 'R-4': 6000,
};

// Max height by zone (feet)
const MAX_HEIGHT = {
  'RS-1A': 30, 'A-1': 30, 'RS-25': 30, 'A-2': 30,
  'RS-15': 30, 'E-1': 30, 'RS-10': 30,
  'RS-7.5': 30, 'E-3': 30,
  'RS-6': 28, 'R-1': 28,
  'R-2': 30,
  'R-M': 40, 'R-3': 40,
  'R-MH': 55, 'R-4': 55,
  'C-R': 30, 'C-1': 30,
  'C-G': 40, 'C-2': 40,
  'O-R': 35, 'O-M': 50,
  'M-C': 40, 'M-I': 40,
};

// Max FAR (floor area ratio) by zone
const MAX_FAR = {
  'RS-1A': 0.35, 'A-1': 0.35, 'RS-25': 0.35, 'A-2': 0.35,
  'RS-15': 0.40, 'E-1': 0.40, 'RS-10': 0.45,
  'RS-7.5': 0.50, 'E-3': 0.50,
  'RS-6': 0.55, 'R-1': 0.55,
  'R-2': 0.65,
  'R-M': 0.80, 'R-3': 0.80,
  'R-MH': 1.20, 'R-4': 1.20,
  'C-R': 1.0, 'C-G': 1.5,
  'O-R': 1.0, 'O-M': 1.5,
  'M-C': 0.75, 'M-I': 0.60,
};

// Setbacks (front/side/rear in feet)
const SETBACKS = {
  'RS-1A': { front: 25, side: 10, rear: 25 },
  'RS-25': { front: 25, side: 8, rear: 20 },
  'RS-15': { front: 20, side: 7, rear: 15 },
  'RS-10': { front: 20, side: 5, rear: 15 },
  'RS-7.5': { front: 20, side: 5, rear: 15 },
  'RS-6': { front: 15, side: 4, rear: 10 },
  'R-1': { front: 15, side: 4, rear: 10 },
  'R-2': { front: 15, side: 4, rear: 10 },
  'R-M': { front: 15, side: 4, rear: 10 },
  'R-MH': { front: 15, side: 4, rear: 10 },
  'C-R': { front: 0, side: 0, rear: 0 },
  'C-G': { front: 0, side: 0, rear: 0 },
  'O-R': { front: 10, side: 5, rear: 10 },
  'O-M': { front: 10, side: 5, rear: 10 },
};

// Lot coverage (%) by zone
const MAX_LOT_COVERAGE = {
  'RS-1A': 25, 'A-1': 25, 'RS-25': 25, 'RS-15': 30,
  'RS-10': 35, 'RS-7.5': 40, 'E-3': 40,
  'RS-6': 45, 'R-1': 45,
  'R-2': 50, 'R-M': 55, 'R-MH': 60,
  'C-R': 75, 'C-G': 80,
  'O-R': 60, 'O-M': 65,
  'M-C': 65, 'M-I': 70,
};

// ── Helper: is zone in category ───────────────────────────────
function isZone(zone, category) {
  return (ZONE_CATEGORIES[category] || []).includes(zone);
}

function getZoneCategory(zone) {
  for (const [cat, zones] of Object.entries(ZONE_CATEGORIES)) {
    if (zones.includes(zone)) return cat;
  }
  return 'UNKNOWN';
}

// ── Main Analysis Function ────────────────────────────────────
/**
 * Run full developer planning analysis for a selected parcel.
 * @param {Object} parcelAttrs - Attributes from Assessors Parcels layer (layer 8)
 * @param {Object} zoningAttrs - Attributes from Zoning layer (layer 401)
 * @param {Object} context - Spatial context flags from adjacent queries:
 *   { inCoastalZone, inHighFire, chipZone, inFEMAFlood, inHistoric,
 *     nearTransit, inTransitPriorityArea, inAppealJurisdiction }
 * @returns {Object} Full analysis result
 */
function analyzeParcel(parcelAttrs, zoningAttrs, context) {
  const p = parcelAttrs || {};
  const z = zoningAttrs || {};
  const ctx = context || {};

  const zone = z.zoneOther || z.zone1 || z.zone || '';
  // zoneOther can contain compound values like "SP6-AIA/A-A-O" or "RS-15/DR"
  // Extract the primary zone code (before the slash, or the whole value if no slash)
  const zonePrimary = zone.split('/')[0].trim();
  const zoneOther = z.zoneOther || z.overlayZone || zone;
  const zoneDesc = z.zoneDescr || '';
  const overlayZone = z.overlayZone || '';
  // Lot size: prefer polygon-derived planimetric area (computed in app.js from
  // EPSG:2229 ring coordinates via Shoelace formula — true square-feet from geometry).
  // Fall back to Assessor's SqFootage, then Acreage × 43,560.
  // Why prefer polygon: the Assessor's SqFootage field is unreliable — sometimes net,
  // sometimes building-footprint, sometimes clipped. The polygon is the authoritative shape.
  const acreage = parseFloat(p.acreage) || 0;
  const assessorSqft = parseFloat(p.squareFootage) || 0;
  const polygonSqft = parseFloat(p._polygonSqft) || 0;
  const lotSqft = polygonSqft > 0
    ? polygonSqft
    : (assessorSqft > 0 ? assessorSqft : acreage * 43560);
  // Track which source was used so the UI can disclose it
  const lotSqftSource = polygonSqft > 0
    ? 'polygon'
    : (assessorSqft > 0 ? 'assessor' : 'acreage');
  const sqft = lotSqft; // legacy alias, used downstream
  const existingUnits = guessExistingUnits(p);
  const yearBuilt = parseInt(p.yearBuilt) || 0;
  const landValue = parseInt(p.landValue) || 0;
  const netAV = parseInt(p.netAssessedValue) || 0;

  const category = getZoneCategory(zonePrimary);
  const isSF = isZone(zonePrimary, 'SINGLE_FAMILY');
  const isMF = isZone(zonePrimary, 'MULTI_FAMILY');
  const isComm = isZone(zonePrimary, 'COMMERCIAL');
  const isIndustrial = isZone(zonePrimary, 'INDUSTRIAL');
  const isCoastal = ctx.inCoastalZone || false;
  const isHighFire = ctx.inHighFire || false;
  const isFlood = ctx.inFEMAFlood || false;
  const isHistoric = ctx.inHistoric || false;
  const nearTransit = ctx.nearTransit || false;
  const inTPA = ctx.inTransitPriorityArea || false;
  const chipZone = ctx.chipZone || null;
  const audTier = ctx.audTier || null; // 'medium-high' | 'high' | 'priority' | null

  // ── Build what-you-can-build analysis ──────────────────────
  const opportunities = [];
  const restrictions = [];
  const warnings = [];
  const permits = [];

  // ── 1. Base Zoning Rights ─────────────────────────────────
  const baseRights = getBaseZoningRights(zonePrimary, lotSqft, acreage, p, isSF, isMF, isComm);
  const aduAnalysis = analyzeADU(zonePrimary, lotSqft, isSF, isMF, isCoastal, isHighFire, nearTransit, p, existingUnits, audTier);
  const sb9Analysis = analyzeSB9(zonePrimary, lotSqft, isSF, isCoastal, isHighFire, isHistoric, isFlood, p, ctx);
  const shraAnalysis = analyzeSHRA(zonePrimary, lotSqft, isSF, isMF, isCoastal, isHighFire, isHistoric, isFlood, acreage, p, audTier);
  const parkingAnalysis = analyzeAB2097(nearTransit, inTPA, zonePrimary);
  const coastalAnalysis = analyzeCoastal(isCoastal, ctx, zonePrimary);
  const fireAnalysis = analyzeFire(isHighFire, chipZone, zonePrimary);
  const floodAnalysis = analyzeFlood(isFlood, ctx);
  const historicAnalysis = analyzeHistoric(isHistoric, p);
  const buildableCalc = calcBuildableArea(zonePrimary, lotSqft, acreage, p);
  const dblAnalysis    = analyzeDBL(zonePrimary, isMF, isCoastal, audTier, lotSqft);
  const arAnalysis     = analyzeAR(zonePrimary, isCoastal, isHistoric, yearBuilt);
  const ab2011Analysis = analyzeAB2011(zonePrimary, lotSqft, isCoastal, isHistoric, isFlood, isHighFire, nearTransit);
  const sb35Analysis   = analyzeSB35(isCoastal);
  const maxUnits = calcMaxUnits(zonePrimary, sb9Analysis, aduAnalysis, shraAnalysis, dblAnalysis, arAnalysis, ab2011Analysis, baseRights, lotSqft, audTier, isCoastal, isHighFire);
  const permitsRequired = buildPermitList(isCoastal, isHighFire, isHistoric, zonePrimary, sb9Analysis, shraAnalysis, ctx);
  const score = calcFeasibilityScore(isSF, isMF, isComm, isCoastal, isHighFire, isHistoric, isFlood, sb9Analysis, shraAnalysis, lotSqft, zonePrimary);

  // ── Extra regulatory flags ──────────────────────────────────
  const inclusionaryFlag  = analyzeInclusionary(maxUnits, zonePrimary, isMF);
  const prevailingWageFlag= analyzePrevailingWage(zonePrimary, sb9Analysis, shraAnalysis, ctx, maxUnits);
  const oddsFlag          = analyzeODDS(zonePrimary, isMF, isCoastal, isHistoric);
  const coastalTierFlag   = analyzeCoastalTier(isCoastal, ctx);
  const rentFreezeFlag    = analyzeRentFreeze(yearBuilt, p);

  return {
    summary: {
      zone: zonePrimary,
      zoneRaw: zone,
      zoneDesc,
      zoneOther,
      overlayZone,
      category,
      acreage: acreage.toFixed(3),
      lotSqft: Math.round(lotSqft),
      lotSqftSource,  // 'polygon' | 'assessor' | 'acreage' — for UI disclosure
      existingUnits,
      yearBuilt: yearBuilt || '—',
      landValue,
      netAV,
    },
    maxUnits,
    score,
    baseRights,
    aduAnalysis,
    sb9Analysis,
    shraAnalysis,
    dblAnalysis,
    arAnalysis,
    ab2011Analysis,
    sb35Analysis,
    parkingAnalysis,
    coastalAnalysis,
    fireAnalysis,
    floodAnalysis,
    historicAnalysis,
    buildableCalc,
    permitsRequired,
    inclusionaryFlag,
    prevailingWageFlag,
    oddsFlag,
    coastalTierFlag,
    rentFreezeFlag,
  };
}

// ── Base residential density ──────────────────────────────────
//
// Source: City of Santa Barbara Title 28 Zoning (Coastal) and Title 30 (Inland).
// "Base density" = the by-right number of dwelling units a vacant parcel can
// accommodate per local zoning code, BEFORE any state-law uplift (SB 9, ADU
// stacking, DBL, etc.). Per BAP framing decision (May 2026), AUD will eventually
// fold into this number when General Plan land-use data is wired in; for now,
// AUD is not applied and Variable Density (§ 28.21.080.F) is suspended during
// the AUD program duration so it's ignored.
//
// Slope multiplier (§§ 28.15.080, 28.18.075.E) intentionally ignored — see BAP
// decision May 2026: theoretical max framing means we don't penalize for slope.
//
const BASE_DENSITY = {
  // ── Single-family zones — 1 unit per parcel (lot size sets min lot for new lots, not unit count) ──
  'A-1':    { type: 'sf', unitsPerLot: 1, citation: '§ 28.15.080.A (1 ac min)' },
  'A-2':    { type: 'sf', unitsPerLot: 1, citation: '§ 28.15.080.B (25,000 SF min)' },
  'E-1':    { type: 'sf', unitsPerLot: 1, citation: '§ 28.15.080.C (15,000 SF min)' },
  'E-2':    { type: 'sf', unitsPerLot: 1, citation: '§ 28.15.080.D (10,000 SF min)' },
  'E-3':    { type: 'sf', unitsPerLot: 1, citation: '§ 28.15.080.E (7,500 SF min)' },
  'R-1':    { type: 'sf', unitsPerLot: 1, citation: '§ 28.15.080.F (6,000 SF min)' },
  // Title 30 inland SF equivalents
  'RS-1A':  { type: 'sf', unitsPerLot: 1, citation: 'Title 30 inland SF' },
  'RS-25':  { type: 'sf', unitsPerLot: 1, citation: 'Title 30 inland SF' },
  'RS-15':  { type: 'sf', unitsPerLot: 1, citation: 'Title 30 inland SF' },
  'RS-10':  { type: 'sf', unitsPerLot: 1, citation: 'Title 30 inland SF' },
  'RS-7.5': { type: 'sf', unitsPerLot: 1, citation: 'Title 30 inland SF' },
  'RS-6':   { type: 'sf', unitsPerLot: 1, citation: 'Title 30 inland SF' },

  // ── R-2 (Two-Family) — § 28.18.075 (Coastal) / § 30.20.030.B (Inland) tiered by lot size ──
  // Lots < 6,000 SF → 1 unit; 6,000–6,999 → 2 units; ≥7,000 → 1 per 3,500 SF
  'R-2':    { type: 'r2', citation: '§ 28.18.075 / § 30.20.030.B (1 per 3,500 SF; tiered)' },

  // ── R-3 / R-4 — Coastal § 28.21.080 tiered + variable density (latter suspended) ──
  // Standard density: 1 per 3,500 SF for lots ≥14,000; tiered below
  'R-3':    { type: 'r3', citation: '§ 28.21.080 (1 per 3,500 SF; tiered)' },
  'R-4':    { type: 'r3', citation: '§ 28.21.080 (1 per 3,500 SF; tiered)' },

  // ── R-M / R-MH — Inland § 30.20.030.B tiered by lot size and avg slope ──
  // R-M: <5,000→1; 5,000–6,999→2; ≥7,000→1 per 3,500 SF
  // R-MH: <5,000→1; 5,000–6,999→2; ≥7,000→max(3 units, 1 per 3,500 SF)
  'R-M':    { type: 'rm',  citation: '§ 30.20.030.B (R-M; 1 per 3,500 SF ≥7,000 SF; tiered)' },
  'R-MH':   { type: 'rmh', citation: '§ 30.20.030.B (R-MH; min 3 units or 1 per 3,500 SF ≥7,000 SF)' },

  // ── HRC-1 — no residential ──
  'HRC-1':  { type: 'none', citation: '§ 28.22.030.A (visitor-serving only; no residential)' },

  // ── HRC-2 — residential only in specific areas; default to 0 ──
  'HRC-2':  { type: 'none', citation: '§ 28.22.030.B.4 (residential only in 2 specific areas; not modeled)' },
  // Coastal-prefixed variants
  'CO-HV':  { type: 'none', citation: 'HRC-2 coastal variant' },
  'CO-HR':  { type: 'none', citation: 'HRC-1 coastal variant' },

  // ── R-H Resort-Residential Hotel — sleeping units, not DUs; specialty zone ──
  // Skip for now — specialized hotel zone with sleeping-unit math (§ 28.27.070)
  'R-H':    { type: 'special', citation: '§ 28.27.070 — sleeping units per acre (specialty)' },

  // ── Commercial/Office zones — no by-right residential without AUD ──
  'C-1':    { type: 'comm', citation: 'No by-right residential (AUD eligible)' },
  'C-2':    { type: 'comm', citation: 'No by-right residential (AUD eligible)' },
  'C-M':    { type: 'comm', citation: 'No by-right residential (AUD eligible)' },
  'C-G':    { type: 'comm', citation: 'No by-right residential (AUD eligible — § 30.150)' },
  'C-P':    { type: 'comm', citation: 'No by-right residential (AUD eligible)' },
  'C-L':    { type: 'comm', citation: 'No by-right residential (AUD eligible)' },
  'C-O':    { type: 'comm', citation: 'No by-right residential' },
  'C-R':    { type: 'comm', citation: 'No by-right residential (AUD eligible — § 30.150)' },
  'C-X':    { type: 'comm', citation: 'No by-right residential' },
  'R-O':    { type: 'comm', citation: 'No by-right residential (AUD eligible)' },
  'O-R':    { type: 'comm', citation: 'No by-right residential (AUD eligible — § 30.150)' },
  'O-M':    { type: 'comm', citation: 'Medical office — no by-right residential' },
  'OC':     { type: 'comm', citation: 'OC — no by-right residential (AUD eligible)' },
  'M-C':    { type: 'comm', citation: 'Manufacturing/commercial — AUD eligible per § 30.150' },

  // ── Industrial / Manufacturing ──
  'M-1':    { type: 'none', citation: 'Light manufacturing — no residential' },
  'M-I':    { type: 'none', citation: 'Manufacturing/industrial — no residential' },
  'OM-1':   { type: 'none', citation: 'Ocean-oriented manufacturing — no residential' },

  // ── Parks ──
  'P-R':    { type: 'none', citation: 'Parks & recreation — no residential' },
  'PR':     { type: 'none', citation: 'Parks & recreation — no residential' },

  // ── Outlier/special-plan zones — not modeled per BAP scope ──
  'PUD':    { type: 'special', citation: 'Planned Unit Development — per Planning Commission approval' },
};

// AUD-eligible zones per current ordinance (2020 amendment, codified in Title 30 § 30.150
// and Title 28 § 28.20.030). Includes Inland (R-M, R-MH, O-R, C-R, C-G, M-C, CO-HV, CO-CAR)
// and Coastal residential equivalents (R-3, R-4) and additional Coastal commercial zones
// (HRC-2, C-1, C-2, C-M, C-P, C-L, OC) retained from the original 2013 chapter.
//
// NOTE: The 2013 § 28.20.030 list (R-3, R-4, HRC-2, R-O, C-P, C-L, C-1, C-2, C-M, OC) is
// now superseded by the 2020 amendment which moved AUD into Title 30 § 30.150 and added
// C-G, M-C, C-R, CO-CAR. Including both lists for the union — any zone that ever was AUD-eligible.
const AUD_ELIGIBLE_ZONES = new Set([
  // Inland Title 30 § 30.150 (current effective list)
  'R-M', 'R-MH', 'O-R', 'C-R', 'C-G', 'M-C', 'CO-HV', 'CO-CAR',
  // Coastal Title 28 § 28.20.030 (residential and commercial)
  'R-3', 'R-4', 'HRC-2', 'R-O', 'C-P', 'C-L', 'C-1', 'C-2', 'C-M', 'OC',
]);

// AUD tier maximum densities per § 28.20.060 (du/ac) — used for theoretical max calculation
const AUD_TIER_MAX_DUAC = {
  'medium-high': 27, // 15-27 du/ac range
  'high':        36, // 28-36 du/ac range
  'priority':    63, // 37-63 du/ac range
};
const AUD_TIER_LABEL = {
  'medium-high': 'AUD Medium-High Density (15-27 du/ac)',
  'high':        'AUD High Density (28-36 du/ac)',
  'priority':    'AUD Priority Housing Overlay (37-63 du/ac)',
};

// Calculate base by-right unit count for a parcel.
// Returns { units, rule, citation } — units is the number of dwelling units allowed
// by local zoning on a vacant parcel; rule and citation describe the basis.
// If audTier is set AND the zone is AUD-eligible AND the parcel is NOT in the Coastal Zone,
// returns the *higher* of base zoning vs. AUD uplift.
// AUD is an Inland-only program (Title 30 § 30.150); Coastal Zone parcels follow Title 28 base zoning only.
function calcBaseDensity(zone, lotSqft, audTier, isCoastal) {
  const baseEntry = BASE_DENSITY[zone];
  // First, compute base zoning result (existing logic)
  const baseResult = _calcBaseDensityFromZoning(zone, lotSqft, baseEntry);

  // If parcel is in Coastal Zone, AUD doesn't apply (Inland-only program per Title 30 § 30.150)
  if (isCoastal) return baseResult;

  // If parcel is not in an AUD tier polygon, or zone is not AUD-eligible, return base
  if (!audTier || !AUD_ELIGIBLE_ZONES.has(zone)) {
    return baseResult;
  }

  // AUD uplift calculation: lotSqft × duPerAc ÷ 43,560
  const duAc = AUD_TIER_MAX_DUAC[audTier];
  if (!duAc || !lotSqft || lotSqft <= 0) return baseResult;
  const audUnits = Math.floor((lotSqft * duAc) / 43560);

  // Use AUD only if it's strictly greater than base zoning
  if (audUnits <= baseResult.units) return baseResult;

  return {
    units: audUnits,
    rule: 'aud',
    citation: `${AUD_TIER_LABEL[audTier]} — § 28.20.060`,
    note: `AUD uplift: ${lotSqft.toLocaleString()} SF × ${duAc} du/ac ÷ 43,560 = ${audUnits} units (base zoning would allow ${baseResult.units})`,
    audTier: audTier,
    baseZoneUnits: baseResult.units,
  };
}

function _calcBaseDensityFromZoning(zone, lotSqft, entry) {
  if (!entry) {
    return { units: 1, rule: 'unknown', citation: `Zone "${zone}" not yet configured — defaulting to 1 unit. Verify with Planning.` };
  }

  switch (entry.type) {
    case 'sf':
      // Single-family — always 1 unit per legal lot
      return { units: 1, rule: 'sf', citation: entry.citation };

    case 'r2': {
      // R-2 § 28.18.075 (Coastal) / § 30.20.030.B (Inland): tiered density by lot size
      // < 6,000 → 1 unit; 6,000–6,999 → 2 units; ≥ 7,000 → 1 per 3,500 SF (min 2)
      if (!lotSqft || lotSqft <= 0) return { units: 2, rule: 'r2', citation: entry.citation, note: 'Lot size not detected; assuming typical R-2 (2 units)' };
      if (lotSqft < 6000) return { units: 1, rule: 'r2', citation: entry.citation, note: 'Lots < 6,000 SF → 1-family dwelling only' };
      if (lotSqft < 7000) return { units: 2, rule: 'r2', citation: entry.citation };
      return { units: Math.max(2, Math.floor(lotSqft / 3500)), rule: 'r2', citation: entry.citation };
    }

    case 'r3': {
      // R-3/R-4 Coastal § 28.21.080: tiered density
      // < 5,000 → 1; 5,000–6,999 → 2; 7,000–13,999 → 3; ≥ 14,000 → 1 per 3,500 SF
      if (!lotSqft || lotSqft <= 0) return { units: 1, rule: 'r3', citation: entry.citation, note: 'Lot size not detected' };
      if (lotSqft < 5000) return { units: 1, rule: 'r3', citation: entry.citation };
      if (lotSqft < 7000) return { units: 2, rule: 'r3', citation: entry.citation };
      if (lotSqft < 14000) return { units: 3, rule: 'r3', citation: entry.citation };
      return { units: Math.floor(lotSqft / 3500), rule: 'r3', citation: entry.citation };
    }

    case 'rm': {
      // R-M Inland § 30.20.030.B: tiered density
      // < 5,000 → 1; 5,000–6,999 → 2; ≥ 7,000 → 1 per 3,500 SF (min 2)
      if (!lotSqft || lotSqft <= 0) return { units: 2, rule: 'rm', citation: entry.citation, note: 'Lot size not detected; assuming typical R-M (2 units)' };
      if (lotSqft < 5000) return { units: 1, rule: 'rm', citation: entry.citation };
      if (lotSqft < 7000) return { units: 2, rule: 'rm', citation: entry.citation };
      return { units: Math.max(2, Math.floor(lotSqft / 3500)), rule: 'rm', citation: entry.citation };
    }

    case 'rmh': {
      // R-MH Inland § 30.20.030.B: tiered density with bonus
      // < 5,000 → 1; 5,000–6,999 → 2; ≥ 7,000 → max(3 units, 1 per 3,500 SF)
      if (!lotSqft || lotSqft <= 0) return { units: 3, rule: 'rmh', citation: entry.citation, note: 'Lot size not detected; assuming typical R-MH (3 units)' };
      if (lotSqft < 5000) return { units: 1, rule: 'rmh', citation: entry.citation };
      if (lotSqft < 7000) return { units: 2, rule: 'rmh', citation: entry.citation };
      return { units: Math.max(3, Math.floor(lotSqft / 3500)), rule: 'rmh', citation: entry.citation };
    }

    case 'comm':
      // Commercial zones — no by-right residential. AUD may apply (handled separately when GP data wired in).
      return { units: 0, rule: 'comm', citation: entry.citation, note: 'Commercial zone — residential available via AUD program (eligibility depends on General Plan designation)' };

    case 'none':
      // Industrial, parks, etc. — no residential at all
      return { units: 0, rule: 'none', citation: entry.citation };

    case 'special':
      // R-H, PUD, etc. — specialty zones
      return { units: 0, rule: 'special', citation: entry.citation, note: 'Specialty zone — density calculation requires individual review' };

    default:
      return { units: 1, rule: 'unknown', citation: 'Unknown zone type — defaulting to 1' };
  }
}

// ── Base zoning rights ────────────────────────────────────────
function getBaseZoningRights(zone, lotSqft, acreage, p, isSF, isMF, isComm) {
  const height = MAX_HEIGHT[zone] || null;
  const far = MAX_FAR[zone] || null;
  const coverage = MAX_LOT_COVERAGE[zone] || null;
  const setbacks = SETBACKS[zone] || SETBACKS[zone.split('-')[0]] || null;
  const minLot = MIN_LOT_SIZE[zone] || null;
  const maxBuildable = far && lotSqft ? Math.round(far * lotSqft) : null;

  let byRight = '';
  let density = '';

  if (isSF) {
    byRight = 'Single-family residential dwelling';
    density = '1 primary unit by-right (+ ADU/JADU under state law)';
  } else if (zone === 'R-2') {
    byRight = 'Two-unit residential (duplex)';
    density = '2 units by-right (+ ADU state law may apply)';
  } else if (zone === 'R-M' || zone === 'R-3') {
    byRight = 'Multi-unit residential';
    density = 'Multiple units; density determined by lot size & FAR';
  } else if (zone === 'R-MH' || zone === 'R-4') {
    byRight = 'Multi-unit residential & hotel';
    density = 'High-density residential + hotel uses permitted';
  } else if (isComm) {
    byRight = 'Commercial uses';
    density = 'Commercial/retail/office; residential mixed use may be permitted';
  } else if (zone === 'O-R') {
    byRight = 'Restricted office';
    density = 'Professional offices only; no residential by-right';
  } else if (zone === 'O-M') {
    byRight = 'Office/medical';
    density = 'Medical and professional office; no residential by-right';
  } else if (zone === 'M-I' || zone === 'M-1') {
    byRight = 'Light manufacturing/industrial';
    density = 'Industrial uses; residential generally not permitted';
  } else if (zone === 'P-R') {
    byRight = 'Parks & recreation';
    density = 'Park, open space, recreation facilities only';
  } else {
    byRight = zone ? `${zone} zone` : 'Unknown zone';
    density = 'Consult Santa Barbara Planning Division';
  }

  return { byRight, density, height, far, coverage, setbacks, minLot, maxBuildable };
}

// ── ADU Analysis ──────────────────────────────────────────────
function analyzeADU(zone, lotSqft, isSF, isMF, isCoastal, isHighFire, nearTransit, p, existingUnits, audTier) {
  // State ADU law (§§ 66310-66342) applies to any zone that allows residential use,
  // including mixed-use and commercial zones where residential is allowed (e.g. via AUD).
  // Per § 66314(a), local agencies must allow ADUs in any zone where SF or MF residential
  // is permitted — which includes the commercial/mixed-use zones in the AUD-eligible list.
  const isAudEligibleZone = AUD_ELIGIBLE_ZONES.has(zone);
  const eligible = isSF || isMF || zone === 'R-2' || isAudEligibleZone;
  if (!eligible) {
    return { eligible: false, reason: 'ADUs require a zone that allows residential use (residential, mixed-use, or AUD-eligible commercial)' };
  }

  // ── Branch selection: SF stack vs. MF stack is determined by PRIMARY UNIT COUNT, not zone type ──
  // Per § 66323:
  //   - (a)(1) JADU + (a)(2) detached 800 SF are SF-only ("lot with a proposed or existing single-family dwelling")
  //   - (a)(3) conversion + (a)(4) detached (up to 8) apply to lots with multifamily dwellings
  // So a small MF-zoned lot that only entitles 1 primary unit gets the SF stack (3 ADUs + 1 JADU),
  // not the MF stack. Conversely, an AUD-eligible commercial parcel that entitles many primaries
  // gets the MF stack.
  const baseInfo = calcBaseDensity(zone, lotSqft, audTier, isCoastal);
  const primaryUnits = (baseInfo && typeof baseInfo.units === 'number') ? baseInfo.units : 1;
  // Use SF stack when only 1 primary unit can be built; MF stack when 2+
  const useSfStack = primaryUnits <= 1;
  const useMfStack = primaryUnits >= 2;

  // ── Site-condition notes (apply across pathways) ──────────────
  const notes = [];
  if (isCoastal) {
    notes.push('Coastal Zone: ADUs are processed under SBMC Title 28 (Ch. 28.86). A Coastal Development Permit may be required; one uncovered parking space typically required.');
  }
  if (isHighFire) {
    notes.push('Very High Fire Hazard Severity Zone: §66314 Standard ADU is prohibited in SBMC; §66323 ADUs/JADUs remain allowed and are subject to defensible-space and high-fire construction standards.');
  }

  // ── Single-Family Pathways (Theoretical Max: 3 ADUs + 1 JADU) ──
  // Applies to any lot that entitles only 1 primary unit, regardless of underlying zone type.
  // Per § 66323(a)(1)+(a)(2), these pathways are for lots with a proposed or existing
  // single-family dwelling.
  if (useSfStack) {
    const pathways = [];

    // §66314 Standard ADU — subject to local SBMC standards; prohibited in VHFHSZ
    if (!isHighFire) {
      pathways.push({
        key: 'standard',
        label: 'Standard ADU',
        citation: 'Gov. Code § 66314',
        maxSqft: 1200,
        sizeNote: 'Up to 1,200 SF detached, or 50% of primary dwelling if attached',
        height: nearTransit ? '18 ft (within ½ mi of transit)' : '16 ft default; up to 25 ft if attached to 2-story primary',
        setbacks: '4 ft side/rear; front per zoning',
        localStandardsApply: true,
        note: 'Subject to local SBMC objective standards (FAR, design review, solar setback). One per lot.',
      });
    }

    // §66323(a)(2) Detached new-construction ADU — state-exempt
    pathways.push({
      key: 'detached800',
      label: 'Detached ADU (state-exempt)',
      citation: 'Gov. Code § 66323(a)(2)',
      maxSqft: 800,
      sizeNote: 'Up to 800 SF',
      height: '16, 18, or 20 ft per § 66321(b)(4)',
      setbacks: '4 ft side/rear; may encroach into front setback',
      localStandardsApply: false,
      note: 'Not subject to local FAR, lot coverage, or design standards. Ministerial approval required.',
    });

    // §66323(a)(1) Conversion ADU — state-exempt, no statutory size cap
    pathways.push({
      key: 'conversion',
      label: 'Conversion ADU (state-exempt)',
      citation: 'Gov. Code § 66323(a)(1)',
      maxSqft: null,
      sizeNote: 'No statutory size cap',
      height: 'N/A — within existing structure',
      setbacks: 'Existing structure setbacks; may expand up to 150 SF for ingress/egress',
      localStandardsApply: false,
      note: 'Must be within proposed/existing SF dwelling or accessory structure with exterior access. Ministerial.',
    });

    // §66333 JADU — state-exempt, within walls of primary dwelling
    pathways.push({
      key: 'jadu',
      label: 'JADU',
      citation: 'Gov. Code §§ 66323(a)(1)(D), 66333',
      maxSqft: 500,
      sizeNote: 'Up to 500 SF',
      height: 'N/A — within primary dwelling',
      setbacks: 'Within existing walls of primary SF dwelling (may include attached garage)',
      localStandardsApply: false,
      note: 'Owner-occupancy of JADU or primary dwelling required per § 66333. Efficiency kitchen allowed.',
    });

    const totalNewUnits = pathways.length;

    return {
      eligible: true,
      parcelType: 'single-family',
      headline: isHighFire
        ? 'Up to 2 ADUs + 1 JADU (VHFHSZ — Standard ADU not permitted)'
        : 'Up to 3 ADUs + 1 JADU',
      theoreticalMaxNewUnits: totalNewUnits,
      pathways,
      siteNotes: notes,
      approval: isCoastal
        ? 'Coastal Zone — Special Process Required (Coastal Development Permit)'
        : 'Ministerial (no hearing) — 60-day review per § 66317',
      timelineEstimate: isCoastal ? '3–6 months (CDP processing)' : '60 days max review + building permit',
      citation: 'Gov. Code §§ 66310–66342 (recodified by AB 2533, eff. 2025); SBMC Ch. 28.86 (Coastal) / § 30.185.040 (Inland)',
    };
  }

  // ── Multi-Family Pathways (Theoretical Max: 8 Detached + Scaled Conversion) ──
  // Applies when the lot entitles 2 or more primary units (per BASE_DENSITY + AUD).
  // Per BAP framing decision (May 2026): tool assumes parcel is VACANT and uses the
  // max number of primary units local zoning allows on the parcel. The 25%-conversion
  // cap under § 66323(a)(3) and the "capped at existing units" detached cap under
  // § 66323(a)(4) both scale to this theoretical maximum density.
  if (useMfStack) {
    const units = primaryUnits; // already computed above; reflects base zoning + AUD uplift
    const pathways = [];

    // §66323(a)(4) Detached ADUs — up to 8, capped at zoned unit count
    const detachedCap = units > 0 ? Math.min(8, units) : 8;
    pathways.push({
      key: 'mfDetached',
      label: 'Detached ADUs',
      citation: 'Gov. Code § 66323(a)(4)',
      maxCount: detachedCap,
      sizeNote: units > 0
        ? `Up to ${detachedCap} detached ADUs (capped at ${units} primary units allowed by zoning)`
        : 'Up to 8 detached ADUs (capped at number of primary units on the lot)',
      height: '16, 18, or 20 ft per § 66321(b)(4)',
      setbacks: '4 ft side/rear',
      localStandardsApply: false,
      note: units === 0
        ? 'Zoned density not configured for this zone — actual cap depends on number of primary units on the lot.'
        : null,
    });

    // §66323(a)(3) Interior Conversion ADUs — at least 1, up to 25% of primary units (rounded up)
    const conversionCap = units > 0 ? Math.max(1, Math.ceil(units * 0.25)) : 1;
    pathways.push({
      key: 'mfConversion',
      label: 'Interior Conversion ADUs',
      citation: 'Gov. Code § 66323(a)(3)',
      maxCount: conversionCap,
      sizeNote: units > 0
        ? `At least 1, up to ${conversionCap} (25% of ${units} primary units, rounded up)`
        : 'At least 1; up to 25% of primary units on the lot (rounded up)',
      height: 'N/A — within existing non-livable space',
      setbacks: 'Within existing structure (storage, boiler, attic, basement, garage, etc.)',
      localStandardsApply: false,
      note: 'Must come from non-livable space within the multifamily structure (e.g., storage rooms, garages, attics).',
    });

    const totalNewUnits = detachedCap + conversionCap;

    return {
      eligible: true,
      parcelType: 'multi-family',
      headline: units > 0
        ? `Up to ${detachedCap} detached + ${conversionCap} conversion ADUs (${totalNewUnits} new units)`
        : 'Up to 8 detached + 1+ conversion ADUs (zoned density needed to scale conversion cap)',
      theoreticalMaxNewUnits: totalNewUnits,
      maxZonedUnits: units,
      pathways,
      siteNotes: notes,
      approval: isCoastal
        ? 'Coastal Zone — Special Process Required (Coastal Development Permit)'
        : 'Ministerial (no hearing) — 60-day review per § 66317',
      timelineEstimate: isCoastal ? '3–6 months (CDP processing)' : '60 days max review + building permit',
      citation: 'Gov. Code §§ 66310–66342 (recodified by AB 2533, eff. 2025); SB 1211 (eff. Jan 1 2025); SBMC Ch. 28.86 (Coastal) / § 30.185.040 (Inland)',
    };
  }

  // ── Fallback (R-2 or other residential — treat conservatively as SF stack) ──
  return {
    eligible: true,
    parcelType: 'residential',
    headline: 'Standard ADU + JADU pathways available',
    pathways: [],
    siteNotes: notes,
    citation: 'Gov. Code §§ 66310–66342',
  };
}

// ── SB 9 Analysis ─────────────────────────────────────────────
// SB 9 (2021, amended by SB 450 in 2024, AB 1061 in 2025; codified at Gov. Code
// §§ 65852.21 + 66411.7) — implemented locally by SBMC Ch. 28.80 (Coastal),
// Ch. 27.60 (Lot Splits, both Coastal & Inland), and § 30.185.440 (Inland).
//
// Per BAP decision (May 2026): tool focuses on the LOT SPLIT + 2 UNITS PER PARCEL
// pathway only (4 units total). The plain two-unit pathway (2 units + ADU stack)
// is omitted because users get the same outcome via the ADU pathway with less
// process burden.
//
// Local SB-specific overlays the tool surfaces:
//  - Affordability mandate: at least 1 unit per lot must be deed-restricted
//    moderate/low/very-low income (§ 28.80.010.A, § 30.185.440.A.1).
//    Net effect at 4 units total: 2 affordable units (one per resulting lot).
//  - Foothill/Extreme Foothill HFHSZ: prohibited (§ 28.80.020.E, § 30.185.440.B.4).
//    Other HFHSZ areas: allowed with high-fire construction standards.
//  - Coastal Zone: CDP required BEFORE parcel map can be submitted (§ 27.60.080).
//
function analyzeSB9(zone, lotSqft, isSF, isCoastal, isHighFire, isHistoric, isFlood, p, ctx) {
  // Hard eligibility: zone must be a single-family residential zone
  // Per SBMC § 27.60.010.B, eligible zones are A-1, A-2, E-1, E-2, E-3, R-1
  // (Coastal Title 28) and RS-1A through RS-6 (Inland Title 30). Our isSF flag
  // captures all of these.
  if (!isSF) {
    return {
      eligible: false,
      reason: 'SB 9 only applies to single-family residential zones (A-1/A-2/E-*/R-1 Coastal; RS-* Inland)',
      citation: 'Gov. Code §§ 65852.21, 66411.7; SBMC Ch. 27.60',
    };
  }

  // Lot-size feasibility for split:
  //   - Each new parcel ≥ 1,200 SF (state floor, Gov. Code § 66411.7(a)(2)(A))
  //   - Smaller new parcel ≥ 40% of original (Gov. Code § 66411.7(a)(1))
  // The 40% rule means original lot must be ≥ 3,000 SF (so the 40% side hits 1,200).
  // We don't check excluded-area subtractions (creeks, slopes ≥ 25%, wetlands,
  // bluff buffers per SBMC § 27.60.030.A) — those require site-specific data.
  const MIN_ORIGINAL_LOT_FOR_SPLIT = 1200 / 0.4; // = 3,000 SF
  const lotLargeEnough = lotSqft >= MIN_ORIGINAL_LOT_FOR_SPLIT;

  // Hard exclusions (return eligible: false)
  // Historic: SBMC § 28.80.020.B / § 30.185.440.B.1 — prohibited on SHRI, Landmark
  // District, Historic District Overlay, designated Landmark, or Structure of Merit.
  // AB 1061 (2025) narrowed the state-law historic exclusion to INDIVIDUALLY listed
  // landmarks, but SBMC's local ordinance retains the broader district-level
  // exclusion. Layer 213 (Historic Sites Structures) flags individually-listed
  // sites — district-level exclusions require separate verification.
  if (isHistoric) {
    return {
      eligible: false,
      reason: 'Historic resource — SB 9 prohibited per SBMC § 28.80.020.B / § 30.185.440.B.1 (Landmark, Structure of Merit, or SHRI listing)',
      citation: 'SBMC § 28.80.020.B, § 30.185.440.B.1; Gov. Code § 65852.21(a)(5)',
      verifyLocally: 'Confirm whether parcel is in a Historic District Overlay or Landmark District — not detected by individual-site GIS layer.',
    };
  }

  // Lot too small to split
  if (!lotLargeEnough) {
    return {
      eligible: false,
      reason: `Lot is too small for an urban lot split — needs ≥ ${MIN_ORIGINAL_LOT_FOR_SPLIT.toLocaleString()} sq ft (each new parcel must be ≥ 1,200 SF AND ≥ 40% of original)`,
      citation: 'Gov. Code § 66411.7(a)(1)–(2); SBMC § 27.60.030.A',
    };
  }

  // Soft warnings (eligible: true but flagged)
  const warnings = [];
  const verifyLocally = [];

  if (isHighFire) {
    warnings.push('High Fire Hazard Severity Zone — SB 9 allowed only with high-fire construction standards per SBMC Title 8/22. Foothill and Extreme Foothill HFHSZ areas are PROHIBITED (§ 28.80.020.E / § 30.185.440.B.4).');
    verifyLocally.push('Confirm parcel is not within Foothill or Extreme Foothill HFHSZ (Figure 14, City Community Wildfire Protection Plan, Feb 2021).');
  }
  if (isFlood) {
    warnings.push('FEMA Special Flood Hazard Area — base flood elevation requirements apply; may complicate development but does not block SB 9 by itself.');
  }
  if (isCoastal) {
    verifyLocally.push('Coastal Zone parcels: Coastal Development Permit must be approved BEFORE parcel map can be submitted (SBMC § 27.60.080). Public hearing not required for CDP under SB 9.');
  }
  verifyLocally.push('Confirm parcel has not been previously split via SB 9, and that no adjacent parcel has been split by the same owner (Gov. Code § 66411.7(a)(3)(F)–(G)).');
  verifyLocally.push('Confirm no tenant has occupied the property in the past 3 years and no rent-restricted housing exists on the lot (Gov. Code § 65852.21(a)(3)).');

  // Lot-split outcome
  const splitLotMin = Math.round(lotSqft * 0.4);
  const splitLotMax = Math.round(lotSqft * 0.6);

  return {
    eligible: true,
    pathway: 'lot-split',                // signals tool to show only the lot-split path
    totalUnits: 4,                       // 2 units per new parcel × 2 parcels
    affordableUnits: 2,                  // SBMC affordability mandate (1 per lot)
    minUnitSqft: 800,                    // state-law floor § 65852.21(b)(2)(A)
    setbacks: '4 ft side/rear from original lot line (state); existing structures exempt',
    parking: '1 space per unit; waived within ½ mi of major transit stop or High-Quality Transit Corridor, or with car-share within 1 block',
    resultingParcels: 2,
    parcelSizeRange: { minSqft: Math.max(1200, splitLotMin), maxSqft: splitLotMax },
    ownerOccupancyReq: 'Owner must occupy one unit on a resulting lot for ≥ 3 years from parcel-map approval (Gov. Code § 66411.7(g))',
    affordabilityNote: 'SBMC § 28.80.010.A / § 30.185.440.A.1: at least 1 unit per resulting lot must be deed-restricted as moderate, low, or very-low income (per City Affordable Housing Policies). Net: 2 of the 4 total units must be affordable.',
    aduStacking: 'No ADUs/JADUs permitted on parcels created by an SB 9 lot split (Gov. Code § 66411.7(j); SBMC § 28.80.030.G).',
    approval: isCoastal
      ? 'Coastal Zone — Special Process Required (Coastal Development Permit per SBMC § 27.60.080, then ministerial parcel map)'
      : isHighFire
        ? 'High Fire Zone — Special Process Required (fire construction standards review per SBMC Title 8/22 before ministerial parcel map)'
        : 'Ministerial — no CEQA, no hearing, no design discretion. 60-day deemed-approval clock per SB 450 (2024).',
    timelineEstimate: isCoastal
      ? '4–9 months total (CDP processing + 60-day map review)'
      : isHighFire
        ? '3–6 months (fire standards review + 60-day map review)'
        : '60–90 days (CDP not required; parcel map ministerial)',
    fireNote: isHighFire
      ? 'High Fire Zone — Special Process Required: ignition-resistant construction (Chapter 7A) and defensible space standards must be met. Foothill and Extreme Foothill HFHSZ areas may be fully prohibited (§ 28.80.020.E / § 30.185.440.B.4) — verify parcel location against City CWPP Figure 14.'
      : null,
    warnings: warnings.length ? warnings : null,
    verifyLocally,
    citation: 'Gov. Code §§ 65852.21, 66411.7 (SB 9 2021, SB 450 2024, AB 1061 2025); SBMC Ch. 28.80, Ch. 27.60, § 30.185.440',
  };
}

// ── SB 684 / SB 1123 (Starter Home Revitalization Act) ────────
function analyzeSHRA(zone, lotSqft, isSF, isMF, isCoastal, isHighFire, isHistoric, isFlood, acreage, p, audTier) {
  const acresNum = acreage || (lotSqft / 43560);

  // Hard statutory exclusions per § 65852.28 — no mitigation exception (stricter than SB 9/SB 35)
  if (isHighFire) {
    return {
      sb684Eligible: false, sb1123Eligible: false, isAudCommercial: false, eligible: false,
      reason: 'High/Very High Fire Hazard Severity Zone — SHRA is prohibited on this parcel. § 65852.28 lists HFHSZ as a hard disqualifier with no mitigation exception.',
      citation: 'Gov. Code § 65852.28 (SB 684 / SB 1123)',
    };
  }
  if (isFlood) {
    return {
      sb684Eligible: false, sb1123Eligible: false, isAudCommercial: false, eligible: false,
      reason: 'FEMA Special Flood Hazard Area — SHRA is prohibited on this parcel. AB 130 remainder-parcel provision may create a pathway for portions outside the floodplain — consult BAP.',
      citation: 'Gov. Code § 65852.28 (SB 684 / SB 1123 / AB 130 2025)',
    };
  }

  const sb684Eligible = isMF && acresNum <= 5;
  const sb1123Eligible = isSF && acresNum <= 5;
  const isAudCommercial = !isSF && !isMF && !!audTier && AUD_ELIGIBLE_ZONES.has(zone) && acresNum <= 5;

  const overlayNotes = [];
  if (isHistoric) overlayNotes.push('Historic designation on parcel — SHRA does not have an explicit historic exclusion, but historic resource impacts will require resolution during project review.');

  if (!sb684Eligible && !sb1123Eligible && !isAudCommercial) {
    return {
      sb684Eligible: false, sb1123Eligible: false, isAudCommercial: false,
      reason: acresNum > 5
        ? 'Lot exceeds 5-acre maximum for SHRA'
        : 'SHRA applies to SF (SB 1123) and MF (SB 684) zoned lots — this zone does not qualify',
      overlayNotes: overlayNotes.length ? overlayNotes : null,
      citation: 'Gov. Code § 65852.28 (SB 684 / SB 1123 / AB 130)',
    };
  }

  let effectiveDate;
  if (sb1123Eligible) effectiveDate = 'SB 1123 effective July 1, 2025';
  else if (sb684Eligible) effectiveDate = 'SB 684 effective July 1, 2024';
  else effectiveDate = 'SB 684 effective July 1, 2024 (AUD residential pathway required first)';

  // Parcel count: min 600 sf (MF/AUD) or 1,200 sf (SF), capped at 10
  const minParcelSqft = sb1123Eligible ? 1200 : 600;
  const rawParcels = Math.floor(lotSqft / minParcelSqft);
  const newParcels = Math.min(rawParcels, 10);
  const remainderSqft = lotSqft - (newParcels * minParcelSqft);
  const remainderFraction = remainderSqft / minParcelSqft;
  let remainderNote = null;
  if (remainderFraction >= 0.5) {
    remainderNote = `+ 1 remainder parcel (${remainderSqft.toLocaleString()} sq ft — may be buildable; see AB 130)`;
  } else if (remainderFraction >= 0.25) {
    remainderNote = `+ small remainder parcel (${remainderSqft.toLocaleString()} sq ft — likely not independently buildable)`;
  }

  return {
    sb684Eligible,
    sb1123Eligible,
    isAudCommercial,
    effectiveDate,
    newParcels,
    remainderNote,
    minParcelSqft,
    maxUnits: newParcels,
    maxLots: newParcels,
    maxUnitSqft: 1750,
    noSetbackBetweenUnits: true,
    sideRearSetback: '4 ft from original lot line',
    noFrontageReq: true,
    noMinParcelSize: true,
    noMinDimensions: true,
    approval: isCoastal
      ? 'Coastal Zone — Special Process Required (Coastal Development Permit)'
      : 'Ministerial — no CEQA, no public hearing, no design review',
    approvalTimeline: isCoastal ? '3–6 months (CDP processing per unit)' : '60 days max; auto-approved if no action taken',
    aduAllowed: 'ADUs/JADUs optional per local agency; do not count toward 10-unit max',
    keyAdvantage: isCoastal
      ? 'Build up to 10 starter homes (≤1,750 sq ft avg) on a single lot or subdivided parcels — Coastal Zone requires CDP processing'
      : 'Build up to 10 starter homes (≤1,750 sq ft avg) on a single lot or subdivided parcels with streamlined 60-day ministerial approval',
    overlayNotes: overlayNotes.length ? overlayNotes : null,
    coastalNote: isCoastal ? 'Coastal Zone: Each unit requires Coastal Development Permit. Streamlined timeline extended significantly.' : null,
    audCommercialNote: isAudCommercial
      ? `This is a commercial zone (${zone}) where AUD provides the residential entitlement pathway. SHRA eligibility under § 65852.28 is interpretive — the statute applies to MF-zoned parcels, but AUD is Santa Barbara's primary mechanism for adding housing in commercial corridors. Residential entitlement via AUD must be secured first. Verify applicability with City Planning before relying on this pathway.`
      : null,
    citation: 'Gov. Code § 65852.28 (SB 684 2024 / SB 1123 2025 / AB 130 2025)',
  };
}

// ── AB 2097 Parking Analysis ──────────────────────────────────
function analyzeAB2097(nearTransit, inTPA, zone) {
  const applicable = nearTransit || inTPA;
  if (!applicable) {
    return {
      eligible: false,
      reason: 'Parcel is not within ½ mile of a major transit stop',
      note: 'Check MTD bus stops and Amtrak station proximity',
      citation: 'Assembly Bill 2097 (2022)',
    };
  }

  return {
    eligible: true,
    rule: 'City of Santa Barbara CANNOT impose minimum parking requirements',
    scope: 'Applies to residential, commercial, and industrial projects (excludes hotels/motels/STRs)',
    distance: 'Within ½ mile of a major transit stop (MTD bus, Amtrak)',
    exception: 'City may impose parking if it demonstrates negative impact on low-income housing RHNA capacity or on existing residential/commercial parking within ½ mile',
    practicalImpact: 'Eliminates parking construction costs — can significantly increase unit count or reduce project cost',
    adusNote: 'ADU height allowance also increases to 18 ft (vs. 16 ft) within ½ mile of transit',
    cityFactsheet: 'https://santabarbaraca.gov/services/construction-land-development/project-guidance/parking-exemptions-near-transit-ab-2097',
    citation: 'Assembly Bill 2097 (2022); effective Jan 1, 2023',
  };
}

// ── Coastal Analysis ──────────────────────────────────────────
function analyzeCoastal(isCoastal, ctx, zone) {
  if (!isCoastal) {
    return {
      inCoastalZone: false,
      note: 'Parcel is outside the City of Santa Barbara Coastal Zone (S-D-3 overlay)',
    };
  }

  const inAppealJurisdiction = ctx.inAppealJurisdiction || false;

  return {
    inCoastalZone: true,
    overlay: 'S-D-3 Coastal Overlay Zone',
    lcpStatus: 'City of Santa Barbara has a Certified Local Coastal Program (LCP)',
    permitRequired: 'Coastal Development Permit (CDP) required for most exterior development, grading, and new construction',
    reviewLevels: [
      { level: 'Exemption/Exclusion', desc: 'Interior work, minor repairs — staff review, no hearing. Weeks to months.' },
      { level: 'Staff Hearing Officer', desc: 'ADUs, single-unit residential ≥50 ft from bluff, non-appealable development. 30–90 days.' },
      { level: 'Planning Commission', desc: 'New structures, subdivisions, appealable development. 3–6 months typical.' },
      { level: 'California Coastal Commission', desc: inAppealJurisdiction ? '⚠ THIS PARCEL IS IN APPEAL JURISDICTION — CCC may review after local approval' : 'CCC reviews appeals; direct permit authority in unincorporated or uncertified areas.' },
    ],
    triggers: [
      'New residential construction or addition that expands footprint or height',
      'Grading, fill, or major landscaping altering topography',
      'Driveways, retaining walls, foundation work',
      'Shoreline protection (seawalls, revetments)',
      'Any change affecting public beach/coastal access',
    ],
    conditions: [
      'Setbacks from coastal bluffs and waterlines',
      'Restrictions on future shoreline armoring',
      'Habitat mitigation requirements',
      'Public access easements may be required',
    ],
    timelineImpact: 'CDP adds 3–18+ months to project timeline depending on complexity and whether CCC appeal is filed',
    costsImpact: 'Geotechnical report, coastal hazard analysis, and biological assessment often required',
    bluffTopNote: ctx.nearBluff ? '⚠ BLUFF-TOP PARCEL: Stricter setbacks, sea-level rise analysis required, armoring restrictions apply' : null,
    citation: 'California Coastal Act of 1976 (Pub. Resources Code §30000 et seq.); City of Santa Barbara LCP',
    cityContact: 'PlanningCounter@SantaBarbaraCA.gov',
  };
}

// ── Fire Analysis ─────────────────────────────────────────────
function analyzeFire(isHighFire, chipZone, zone) {
  const result = {
    inHighFireZone: isHighFire,
    chipZone: chipZone || 'Not in an Assessment Chip Area',
    restrictions: [],
    requirements: [],
    impact: [],
  };

  if (chipZone) {
    result.chipProgram = {
      name: chipZone,
      description: 'Santa Barbara Fire Department Assessment Chip Program — properties in this zone are assessed an annual fee for vegetation management and fire prevention in the wildland-urban interface',
      annualFee: 'Varies by zone — typically $150–$700/year added to property tax bill',
      obligations: 'Property owner must maintain fire-safe vegetation clearance per SFD requirements',
    };
  }

  if (isHighFire) {
    result.restrictions = [
      'SB 9 lot split allowed only if development meets fire mitigation standards',
      'SHRA (SB 684/SB 1123) excluded in High/Very High Fire Hazard Severity Zones',
      'Fire-resistant construction materials required (Title 24, Chapter 7A)',
    ];
    result.requirements = [
      'Class A fire-resistant roofing',
      'Ignition-resistant construction for exterior walls, vents, eaves',
      'Ember-resistant vents and screening',
      'Defensible space clearance: Zone 1 (0–30 ft) and Zone 2 (30–100 ft)',
      'SFD fire clearance inspection before occupancy',
    ];
    result.impact = [
      'Increased construction costs (5–15% premium for fire-resistant materials)',
      'Insurance may be difficult to obtain or expensive',
      'Some lenders require additional review',
    ];
  }

  return result;
}

// ── Flood Analysis ────────────────────────────────────────────
function analyzeFlood(isFlood, ctx) {
  if (!isFlood) {
    return {
      inFloodZone: false,
      note: 'Parcel is not in a mapped FEMA Special Flood Hazard Area (2023 FIRM)',
    };
  }

  return {
    inFloodZone: true,
    firmDate: '2023',
    floodZone: ctx.floodZoneType || 'FEMA Special Flood Hazard Area',
    requirements: [
      'Structures must be elevated to or above Base Flood Elevation (BFE)',
      'Flood-proofing certificate required for non-residential construction',
      'Flood insurance (NFIP) typically required by lenders',
      'Fill/grading in floodway prohibited without CLOMR/LOMR from FEMA',
    ],
    exclusions: [
      'SB 9 lot splits generally not allowed in floodplains/floodways',
      'SHRA (SB 684/SB 1123) excluded in floodplains',
    ],
    impact: [
      'Flood insurance: $1,000–$10,000+/year depending on structure value',
      'Elevation certificate required (surveyor cost: $500–$1,500)',
      'Additional engineering review likely required',
    ],
    citation: 'National Flood Insurance Act; FEMA FIRM Map 2023',
  };
}

// ── Historic Analysis ─────────────────────────────────────────
function analyzeHistoric(isHistoric, p) {
  if (!isHistoric) {
    return {
      isHistoric: false,
      note: 'Parcel is not in a mapped Historic Site or District',
    };
  }

  return {
    isHistoric: true,
    restrictions: [
      '⛔ SB 9 lot split NOT allowed — individually listed landmark (Gov. Code §66411.7(a)(1); AB 1061 2025)',
      '⛔ SHRA (SB 684/SB 1123) NOT allowed for individually listed historic resources',
      'Alterations to exterior character-defining features require Historic Preservation review',
      'Demolition of historic structures may require additional CEQA review',
      'Design must be compatible with historic character of district/structure',
    ],
    requirements: [
      'Mills Act eligibility (property tax reduction possible if enrolled)',
      'Design review by Historic Landmarks Commission',
      'Secretary of the Interior Standards for Rehabilitation apply',
    ],
    impact: [
      'ADUs generally still allowed under state law but may require additional design review',
      'By-right development limited — more discretionary review',
      'Mills Act enrollment can reduce property taxes 40–60% in exchange for preservation agreement',
    ],
    opportunity: 'Mills Act enrollment: Contact SB Planning for potential property tax reduction of 40–60% in exchange for a 10-year preservation agreement',
    citation: 'Gov. Code §66411.7(a)(1); City of Santa Barbara Historic Preservation Ordinance',
    contact: 'SB Historic Landmarks Commission — PlanningCounter@SantaBarbaraCA.gov',
  };
}

// ── Buildable Area Estimate ───────────────────────────────────
function calcBuildableArea(zone, lotSqft, acreage, p) {
  const far = MAX_FAR[zone];
  const coverage = MAX_LOT_COVERAGE[zone];
  const height = MAX_HEIGHT[zone];
  const setbacks = SETBACKS[zone];

  if (!far && !coverage) {
    return { available: false, note: 'Contact Santa Barbara Planning for specific development standards for this zone' };
  }

  const maxByFAR = far ? Math.round(far * lotSqft) : null;
  const maxByCoverage = coverage ? Math.round((coverage / 100) * lotSqft) : null;
  const existingSqft = parseInt(p.squareFootage) || 0;
  const remainingFAR = maxByFAR ? Math.max(0, maxByFAR - existingSqft) : null;

  // Rough footprint after setbacks
  let netLotEstimate = null;
  if (setbacks && lotSqft > 0) {
    // Approximate a square lot and subtract setbacks
    const side = Math.sqrt(lotSqft);
    const netW = Math.max(0, side - setbacks.side * 2);
    const netD = Math.max(0, side - setbacks.front - setbacks.rear);
    netLotEstimate = Math.round(netW * netD);
  }

  return {
    available: true,
    lotSqft: Math.round(lotSqft),
    maxFAR: far,
    maxBuildableSqft: maxByFAR,
    maxLotCoverage: coverage ? `${coverage}%` : null,
    maxCoverageSqft: maxByCoverage,
    maxHeight: height ? `${height} ft` : null,
    existingImprovSqft: existingSqft || '—',
    remainingFARCapacity: remainingFAR !== null ? remainingFAR : '—',
    approxBuildableFootprint: netLotEstimate,
    setbacks: setbacks ? `${setbacks.front}ft front / ${setbacks.side}ft side / ${setbacks.rear}ft rear` : 'Varies — consult zoning code',
    note: 'Estimates based on zoning standards. Actual buildable area depends on lot shape, existing structures, easements, and site-specific conditions.',
  };
}

// ── Max unit count ────────────────────────────────────────────
function calcMaxUnits(zone, sb9, adu, shra, dbl, ar, ab2011, base, lotSqft, audTier, isCoastal, isHighFire) {
  // Get base local-zoning density from the lookup table.
  // Treat null (pending) and 0 (non-residential) as 1 for display continuity,
  // but keep the original baseInfo so the UI can surface notes/citations.
  // Passing audTier means AUD-eligible parcels return AUD-uplifted density when applicable.
  const baseInfo = calcBaseDensity(zone, lotSqft, audTier, isCoastal);
  const byRight = (typeof baseInfo.units === 'number' && baseInfo.units > 0)
    ? baseInfo.units
    : (baseInfo.units === 0 ? 0 : 1); // null/pending → fall back to 1
  let withStateLaw = byRight;
  let absolute = byRight;
  let breakdown = [];

  // ADU additions — use the actual pathway count from analyzeADU()
  // SF: 3 ADUs + 1 JADU = 4 new units (or 3 if VHFHSZ removes Standard ADU)
  // MF: 8 detached + scaled conversion (now scaled to MAX ZONED DENSITY, not existing units —
  //     per BAP framing: tool assumes vacant parcel, theoretical max)
  const aduMaxNew = (adu.eligible && typeof adu.theoreticalMaxNewUnits === 'number')
    ? adu.theoreticalMaxNewUnits
    : 0;
  if (adu.eligible) {
    withStateLaw += aduMaxNew;
  }

  // SB 9 uplift
  // Per BAP decision: tool focuses on the lot-split pathway only (4 units total =
  // 2 per new parcel). No ADU stacking on SB 9-created parcels (Gov. Code § 66411.7(j)).
  // Local affordability mandate: 2 of the 4 units are deed-restricted (SBMC § 28.80.010.A).
  let sb9Max = 0;
  if (sb9.eligible && sb9.totalUnits) {
    sb9Max = sb9.totalUnits;
    if (sb9Max > withStateLaw) withStateLaw = sb9Max;
    breakdown.push({
      law: 'SB 9',
      units: sb9Max,
      note: isCoastal
        ? `${sb9Max} units via lot split (2 per new parcel; ${sb9.affordableUnits} affordable).`
        : `${sb9Max} units via lot split (2 per new parcel; ${sb9.affordableUnits} must be deed-restricted affordable per SBMC § 28.80.010.A / § 30.185.440.A.1)`,
      processNote: isCoastal
        ? 'Special Process Required (CDP) — Coastal Development Permit required before parcel map.'
        : isHighFire
          ? 'Special Process Required (High Fire Zone) — Chapter 7A construction standards apply.'
          : null,
    });
  }

  // SHRA uplift — use calculated parcel count
  if (shra.sb684Eligible || shra.sb1123Eligible || shra.isAudCommercial) {
    const shraUnits = shra.newParcels || 10;
    if (shraUnits > withStateLaw) withStateLaw = shraUnits;
    absolute = Math.max(absolute, shraUnits);
    const shraNote = isCoastal
      ? `${shraUnits} parcel${shraUnits !== 1 ? 's' : ''}, Special Process Required (CDP), avg ≤1,750 sq ft`
      : `${shraUnits} parcel${shraUnits !== 1 ? 's' : ''} (1 unit each), ministerial, avg ≤1,750 sq ft`;
    breakdown.push({
      law: 'SB 684/1123 (SHRA)',
      units: shraUnits,
      note: shraNote + (shra.remainderNote ? ' — ' + shra.remainderNote : ''),
    });
  } else {
    absolute = withStateLaw;
  }

  if (adu.eligible && aduMaxNew > 0) {
    const aduLabel = adu.parcelType === 'multi-family'
      ? 'ADUs (§ 66323 detached + conversion)'
      : (adu.parcelType === 'single-family' ? 'ADUs + JADU (§§ 66314, 66323)' : 'ADUs + JADU');
    const aduNote = adu.headline || (isCoastal ? 'Coastal Zone — Special Process Required' : 'Ministerial; no hearing required');
    breakdown.push({ law: aduLabel, units: aduMaxNew, note: aduNote });
  }

  if (dbl && dbl.eligible) {
    breakdown.push({
      law: 'Density Bonus Law',
      units: dbl.maxBonusUnits,
      note: 'with 24% of units very low income',
      processNote: isCoastal ? 'Special Process Required (CDP + density bonus findings)' : null,
    });
  }

  // AR — informational; no reliable unit count from assessor data
  if (ar && ar.eligible) {
    breakdown.push({
      law: 'Adaptive Reuse',
      units: null,
      note: 'Eligible — unit count depends on existing building (contact BAP for estimate)',
    });
  }

  // AB 2011 — Pathway B corridor units if near transit
  if (ab2011 && ab2011.eligible && ab2011.hasCorridor && ab2011.corridorUnits > 0) {
    breakdown.push({
      law: 'AB 2011 (Mixed-Income)',
      units: ab2011.corridorUnits,
      note: `${ab2011.corridorUnits} units via mixed-income corridor (1/545 sf); 15% VLI or 24% low income; prevailing wage required`,
      processNote: ab2011.isCoastal ? 'Special Process Required (CDP)' : null,
    });
  }

  return {
    byRight,
    withStateLaw,
    absolute: Math.max(withStateLaw, absolute),
    baseInfo,  // { units, rule, citation, note? } — surface for UI to render
    breakdown,  // empty array when no state laws apply — UI uses baseInfo for the Local Zoning card instead
    disclaimer: 'Unit counts are estimates based on state law and zoning. Site-specific constraints, overlays, and design standards will affect actual achievable density.',
  };
}

// ── Density Bonus Law ─────────────────────────────────────────
function analyzeDBL(zone, isMF, isCoastal, audTier, lotSqft) {
  const isAudCommercial = !isMF && !!audTier && AUD_ELIGIBLE_ZONES.has(zone);
  const eligible = isMF || isAudCommercial;
  if (!eligible) return { eligible: false, reason: 'Density Bonus Law applies to multifamily and AUD-eligible zones only', citation: 'Gov. Code § 65915' };
  const baseInfo = calcBaseDensity(zone, lotSqft, audTier, isCoastal);
  const baseUnits = (typeof baseInfo.units === 'number' && baseInfo.units > 0) ? baseInfo.units : 0;
  if (baseUnits <= 0) return { eligible: false, reason: 'Base density too low to calculate bonus — verify zoning', citation: 'Gov. Code § 65915' };
  return {
    eligible: true,
    isAudCommercial,
    baseUnits,
    maxBonusUnits: Math.ceil(baseUnits * 1.50),
    tiers: [
      { affordable: '5% very low income',  bonus: 0.225, label: '22.5% bonus' },
      { affordable: '10% very low income', bonus: 0.325, label: '32.5% bonus' },
      { affordable: '24% very low income', bonus: 0.50,  label: '50% bonus (maximum)' },
    ],
    concessions: [
      'Reduced setbacks or minimum lot sizes',
      'Increased lot coverage or floor area ratio',
      'Reduced parking requirements (in addition to AB 2097 where applicable)',
    ],
    approval: isCoastal
      ? 'Coastal Zone — Special Process Required (CDP + density bonus findings)'
      : 'Discretionary with ministerial bonus entitlement — City may not deny qualifying project',
    bapNote: 'The full DBL affordability table offers many combinations of income level, set-aside percentage, and density increase. Contact Bildsten Architecture & Planning to evaluate the right combination for your project.',
    citation: 'Gov. Code § 65915 et seq. (Density Bonus Law, as amended 2023)',
  };
}

// ── Adaptive Reuse (SBMC § 30.185.045) ───────────────────────
const AR_ELIGIBLE_ZONES = new Set(['R-M','R-MH','O-R','O-M','C-R','C-G','M-C']);

function analyzeAR(zone, isCoastal, isHistoric, yearBuilt) {
  const eligible = AR_ELIGIBLE_ZONES.has(zone);
  if (!eligible) {
    return { eligible: false, reason: `Adaptive Reuse applies to zones that allow multi-unit residential (R-M, R-MH, O-R, O-M, C-R, C-G, M-C) — ${zone} does not qualify.`, citation: 'SBMC § 30.185.045 (Ord. 6191, eff. Nov. 20, 2025)' };
  }
  const currentYear = 2026;
  const ageWarning = (yearBuilt && (currentYear - parseInt(yearBuilt)) < 5)
    ? `Building year (${yearBuilt}) may not meet the 5-year certificate of occupancy requirement — verify with City.` : null;
  const notes = [];
  if (isHistoric) notes.push('Designated Historic Resource — must comply with SBMC Ch. 30.157 during conversion.');
  if (ageWarning) notes.push(ageWarning);
  return {
    eligible: true, isCoastal, isHistoric,
    notes: notes.length ? notes : null,
    unitNote: 'Unit count depends on existing building size. Assessor square footage data is unreliable for commercial parcels — contact BAP for a building-specific estimate.',
    avgUnitSize: 'Rental: avg ≤1,200 sq ft · Ownership: avg ≤2,000 sq ft',
    incentives: [
      'No density limits — residential units do not count toward zoning maximum',
      'No additional parking required (bicycle parking required; max 1 space/unit if parking provided)',
      'No open yard requirements',
      'Existing nonconforming setbacks may remain',
    ],
    constraints: [
      'Must convert within existing building envelope (minor additions allowed)',
      'No demolition or substantial redevelopment',
      'No conversion to hotel or industrial uses',
      'State Street (Montecito to Sola): ground floor nonresidential use required, min. 35 ft deep',
      'Inclusionary housing required (CBD exemption: <40 rental units exempt)',
    ],
    approval: isCoastal ? 'Coastal Zone — Coastal Development Permit required' : 'Exempt from discretionary review — building permit only (exterior additions or subdivision may trigger design review)',
    bapNote: 'Unit count is entirely dependent on existing building size and layout. Assessor data does not reliably capture commercial building square footage. Contact Bildsten Architecture & Planning to evaluate conversion potential for a specific building.',
    citation: 'SBMC § 30.185.045 (Ord. 6191, eff. Nov. 20, 2025)',
  };
}

// ── AB 2011 — Affordable Housing and High Road Jobs Act ───────
const AB2011_ELIGIBLE_ZONES = new Set(['C-G','C-R','C-1','C-2','C-P','O-R','O-M','ACS','C-L','C-M','OC']);

function analyzeAB2011(zone, lotSqft, isCoastal, isHistoric, isFlood, isHighFire, nearTransit) {
  const eligible = AB2011_ELIGIBLE_ZONES.has(zone);
  if (!eligible) return { eligible: false, reason: `AB 2011 applies to commercial zones where office, retail, or parking are principally permitted — ${zone} does not qualify.`, citation: 'Gov. Code § 65912.100 et seq.' };
  if (isHistoric) return { eligible: false, reason: 'Historic structure on parcel — AB 2011 prohibits demolition of individually listed historic buildings.', citation: 'Gov. Code § 65912.111(a)' };
  if (isFlood)   return { eligible: false, reason: 'FEMA Special Flood Hazard Area — AB 2011 site criteria exclude special flood hazard areas.', citation: 'Gov. Code § 65912.111(a)' };
  if (isHighFire) return { eligible: false, reason: 'High/Very High Fire Hazard Severity Zone — AB 2011 site criteria exclude HFHSZ parcels.', citation: 'Gov. Code § 65912.111(a)' };
  const hasCorridor = nearTransit;
  const unitsBy545 = Math.floor(lotSqft / 545);
  const unitsByAcCap = Math.floor((lotSqft / 43560) * 80);
  const corridorUnits = Math.min(unitsBy545, unitsByAcCap);
  return {
    eligible: true, isCoastal, hasCorridor,
    corridorUnits: hasCorridor ? corridorUnits : null,
    pathways: [
      { label: 'Pathway A — 100% Affordable', description: 'All units deed-restricted affordable. Density per local zoning (AUD where applicable). Ministerial, no CEQA.', affordability: '100% affordable (income mix per project)', approval: isCoastal ? 'Coastal Zone — CDP required' : 'Ministerial — no CEQA, no discretionary review', prevailingWage: 'Required' },
      ...(hasCorridor ? [{ label: 'Pathway B — Mixed-Income Corridor', description: `Up to ${corridorUnits} units (1 unit/545 sf, max 80 du/ac). Min. 15% very low income or 24% low income.`, affordability: '15% very low income OR 24% low income (deed-restricted)', units: corridorUnits, approval: isCoastal ? 'Coastal Zone — CDP required' : 'Ministerial — no CEQA, no discretionary review', prevailingWage: 'Required', heightBonus: '65 ft max (if within ½ mi transit and AB 2097 applies)', corridorDisclaimer: 'Pathway B eligibility shown because this parcel is within ½ mile of a major transit stop, which approximates Santa Barbara\'s qualifying commercial corridors. AB 2011 formally requires commercial zoning on both sides of the street for ½ mile — verify corridor qualification with City Planning before relying on this pathway.' }] : []),
    ],
    bapNote: 'AB 2011 is a voluntary pathway — the developer elects to use it. Contact Bildsten Architecture & Planning to evaluate feasibility and required affordability commitments for your site.',
    citation: 'Gov. Code § 65912.100 et seq. (AB 2011, eff. July 1, 2023; amended by AB 2243)',
  };
}

// ── SB 35 / SB 423 ────────────────────────────────────────────
// Not applicable to City of SB — compliant Housing Element (HCD Feb. 13, 2024)
function analyzeSB35(isCoastal) {
  return {
    eligible: false, notApplicable: true,
    reason: 'City of Santa Barbara has a compliant 2023-2031 Housing Element (HCD finding Feb. 13, 2024) and adequate sites to meet 6th Cycle RHNA. SB 35 applies only to jurisdictions failing to meet RHNA targets — Santa Barbara currently does not qualify.',
    note: 'SB 35 eligibility is re-evaluated annually by HCD. If the City falls out of RHNA compliance, this pathway may become available. Check HCD\'s annual Streamlining Report for current status.',
    citation: 'Gov. Code § 65913.4 (SB 35 / SB 423)',
  };
}

// ── Permits required ──────────────────────────────────────────
function buildPermitList(isCoastal, isHighFire, isHistoric, zone, sb9, shra, ctx) {
  const list = [];

  list.push({ name: 'Building Permit', authority: 'City of Santa Barbara Building & Safety', required: true, timeline: '4–12 weeks' });

  if (isCoastal) {
    list.push({
      name: 'Coastal Development Permit (CDP)',
      authority: ctx.inAppealJurisdiction ? 'City + possible CA Coastal Commission review' : 'City of Santa Barbara Planning Division',
      required: true,
      timeline: '3–12 months',
      notes: 'Required for most new construction in Coastal Zone (S-D-3 overlay)',
      url: 'https://santabarbaraca.gov/services/construction-land-development/project-guidance',
    });
  }

  if (isHistoric) {
    list.push({
      name: 'Historic Landmarks Commission Review',
      authority: 'City of Santa Barbara Historic Landmarks Commission',
      required: true,
      timeline: '2–6 months',
      notes: 'Required for alterations to character-defining features of historic structures/districts',
    });
  }

  if (isHighFire) {
    list.push({
      name: 'Santa Barbara Fire Department Clearance',
      authority: 'Santa Barbara Fire Department',
      required: true,
      timeline: '2–4 weeks',
      notes: 'Defensible space inspection + fire-resistant construction compliance',
    });
  }

  if (sb9?.eligible && !sb9?.lotSplit?.allowed === false) {
    list.push({
      name: 'Urban Lot Split (Parcel Map)',
      authority: 'City of Santa Barbara Planning Division (ministerial)',
      required: false,
      conditional: 'If pursuing SB 9 lot split',
      timeline: '60–90 days',
      notes: 'Ministerial — no hearing, no CEQA (Gov. Code §66411.7)',
    });
  }

  if (shra?.sb684Eligible || shra?.sb1123Eligible) {
    list.push({
      name: 'SHRA Parcel Map (SB 684/1123)',
      authority: 'City of Santa Barbara Planning Division (ministerial)',
      required: false,
      conditional: 'If pursuing Starter Home Revitalization Act project',
      timeline: '60 days max (auto-approved if no action)',
      notes: 'No CEQA, no public hearing, no appeals',
    });
  }

  list.push({
    name: 'CEQA Review',
    authority: 'City of Santa Barbara',
    required: false,
    conditional: 'Not required for SB 9, ADU, or SHRA projects. Required for other discretionary approvals.',
    timeline: '3–18 months if triggered',
    notes: 'By-right state law projects (SB 9, ADU, SHRA) are exempt from CEQA',
  });

  return list;
}

// ── Feasibility score ─────────────────────────────────────────
function calcFeasibilityScore(isSF, isMF, isComm, isCoastal, isHighFire, isHistoric, isFlood, sb9, shra, lotSqft, zone) {
  let score = 70; // base
  let factors = [];

  if (isSF) { score += 10; factors.push({ label: 'Single-family zone', impact: '+10', note: 'SB 9 + ADU opportunities' }); }
  if (isMF) { score += 5; factors.push({ label: 'Multi-family zone', impact: '+5', note: 'Higher density permitted' }); }
  if (sb9?.eligible) { score += 8; factors.push({ label: 'SB 9 eligible', impact: '+8', note: 'Ministerial 2–4 unit upzoning' }); }
  if (shra?.sb684Eligible || shra?.sb1123Eligible) { score += 12; factors.push({ label: 'SHRA eligible (SB 684/1123)', impact: '+12', note: 'Up to 10 units ministerially' }); }
  if (lotSqft > 10000) { score += 5; factors.push({ label: 'Large lot (>10,000 sq ft)', impact: '+5', note: 'More buildable area' }); }

  if (isCoastal) { score -= 15; factors.push({ label: 'Coastal Zone', impact: '-15', note: 'CDP adds cost, time, and uncertainty' }); }
  if (isHighFire) { score -= 10; factors.push({ label: 'High Fire Hazard Zone', impact: '-10', note: 'Fire construction reqs + insurance challenges' }); }
  if (isHistoric) { score -= 20; factors.push({ label: 'Historic designation', impact: '-20', note: 'Blocks SB 9, SHRA; discretionary review' }); }
  if (isFlood) { score -= 12; factors.push({ label: 'FEMA Flood Zone', impact: '-12', note: 'Elevation reqs, flood insurance, restricted state law' }); }

  score = Math.max(10, Math.min(100, score));

  let label, color;
  if (score >= 80) { label = 'High Opportunity'; color = '#2e7041'; }
  else if (score >= 60) { label = 'Moderate Opportunity'; color = '#c47a0a'; }
  else if (score >= 40) { label = 'Constrained'; color = '#c4611a'; }
  else { label = 'Highly Restricted'; color = '#b92d2d'; }

  return { score, label, color, factors };
}

// ── Utility: guess existing units from land use ───────────────
function guessExistingUnits(p) {
  const lu = (p.landUse || '').toUpperCase();
  const uc = (p.useCode || '');
  if (lu.includes('SINGLE') || lu.includes('SFR') || lu.includes('1 UNIT')) return 1;
  if (lu.includes('DUPLEX') || lu.includes('2 UNIT')) return 2;
  if (lu.includes('TRIPLEX') || lu.includes('3 UNIT')) return 3;
  if (lu.includes('VACANT') || lu.includes('LAND')) return 0;
  if (lu.includes('MULTI') || lu.includes('APT')) return 'Multi-unit';
  if (lu.includes('COMMERCIAL') || lu.includes('OFFICE')) return 'Commercial';
  return '—';
}

// Export
// ── Inclusionary Zoning Flag ─────────────────────────────────
// SB City: 15% BMR at ≤120% AMI for ownership projects of 10+ units.
// In-lieu fee study underway (mid-2026). Rental projects: no current local mandate
// but AB 2011 / SB 6 / SB 423 streamlined paths require affordability mix.
function analyzeInclusionary(maxUnits, zone, isMF) {
  const totalMax = maxUnits ? (maxUnits.absolute || maxUnits.withStateLaw || 1) : 1;
  const triggers = totalMax >= 10;
  const bmrUnits = triggers ? Math.ceil(totalMax * 0.15) : 0;
  return {
    triggers,
    totalUnits: totalMax,
    bmrUnits,
    bmrPct: '15%',
    affordabilityLevel: '≤120% AMI (moderate income)',
    inLieuOption: 'In-lieu fee study underway; not yet adopted — check with City',
    exemptions: [
      'Projects < 10 units: no BMR requirement',
      'Downtown adaptive reuse < 40 units: exempt (adopted 2025)',
      'ADUs / JADUs: exempt',
    ],
    note: triggers
      ? `${bmrUnits} unit${bmrUnits > 1 ? 's' : ''} must be affordable at ≤120% AMI. Factor below-market revenue into pro forma.`
      : 'No inclusionary requirement (< 10 units).',
    citation: 'Santa Barbara Municipal Code Ch. 28.93 / Title 30 Inclusionary Housing; SB 743 exemption for adaptive reuse',
  };
}

// ── Prevailing Wage Warning ────────────────────────────────────
// Triggers when project uses streamlined state law paths (AB 2011, SB 6, SB 423/SB 35)
// or public financing. Adds ~20–40% to labor costs (~$30–60/sqft in SB).
// Projects ≤ 25 units under AB 130 (2025) moderate-wage alternative: $27–$40/hr.
function analyzePrevailingWage(zone, sb9, shra, ctx, maxUnits) {
  const streamlinedPaths = [];
  // SB 423 / SB 35: applies when project meets affordability floor and city is non-compliant
  // with Housing Element — SB is currently certified (Feb 2024) but RHNA severely behind
  const rhnaLaggard = true; // SB at ~10.8% of RHNA target after 3 years
  if (rhnaLaggard) streamlinedPaths.push('SB 423 / SB 35 (streamlined MF approval — city behind on RHNA)');

  // AB 2011 / SB 6: commercial-to-residential conversion
  const isCommZone = !!(zone && (zone.startsWith('C-') || zone.startsWith('M-') || zone === 'C-1' || zone === 'C-2'));
  if (isCommZone) streamlinedPaths.push('AB 2011 / SB 6 (housing on commercial/industrial zone)');

  // SHRA (SB 684 / SB 1123): NO prevailing wage required (ministerial, market-rate)
  // SB 9: NO prevailing wage required
  // ADU: NO prevailing wage required

  const totalMax = maxUnits ? (maxUnits.absolute || 1) : 1;
  const smallProject = totalMax <= 25;

  return {
    streamlinedPaths,
    prevailingWageRequired: streamlinedPaths.length > 0,
    smallProjectAlt: smallProject && streamlinedPaths.length > 0,
    paths: streamlinedPaths,
    costImpact: streamlinedPaths.length > 0
      ? (smallProject
          ? 'AB 130 (2025) moderate-wage alternative may apply (≤25 units): $27–$40/hr vs. ~$99/hr prevailing. Confirm with labor counsel.'
          : 'Full prevailing wage likely required: adds 20–40% to labor costs (~$30–60/sqft in SB). Factor into pro forma hard costs.')
      : 'No prevailing wage trigger identified for standard ministerial paths (SB 9, ADU, SHRA).',
    note: streamlinedPaths.length > 0
      ? '⚠ One or more applicable law paths require prevailing wage or skilled/trained workforce. Verify with a labor attorney before underwriting.'
      : null,
    citation: 'Labor Code §1720 et seq.; AB 2011 §65912.130; SB 6 §65912.116; AB 130 (2025)',
  };
}

// ── Title 25 ODDS Ministerial Bypass Flag ─────────────────────
// Santa Barbara adopted Objective Design and Development Standards (Feb 2025).
// Projects meeting ODDS get ministerial approval — bypasses ABR discretionary review.
// Applies to: 2+ unit multi-family and mixed-use projects in qualifying zones.
// Saves 3–12 months of ABR review + $15–40K in design iteration costs.
function analyzeODDS(zone, isMF, isCoastal, isHistoric) {
  // ODDS applies to multifamily zones (R-2, R-3, R-4, R-M, R-MH, C-1, C-2 with residential)
  const oddsZones = ['R-2','R-3','R-4','R-M','R-MH','C-1','C-2','C-G','R-3/SD-3','R-4/SD-3'];
  const zoneBase = zone ? zone.split('/')[0].trim() : '';
  const qualifies = (isMF || oddsZones.includes(zoneBase)) && !isHistoric;
  const coastalNote = isCoastal ? 'Coastal Zone: ODDS path available but CDP still required. Saves ABR time but not CDP time.' : null;

  return {
    qualifies,
    description: 'Title 25 Objective Design and Development Standards (adopted Feb. 2025)',
    benefit: qualifies
      ? 'Ministerial (no-discretion) approval available for qualifying multi-unit projects — bypasses ABR entirely. Saves 3–12 months and $15–40K in typical design iteration costs.'
      : 'ODDS ministerial path not available for this zone/use type.',
    requirements: qualifies ? [
      'Project must meet all objective design standards (setbacks, height, massing, materials)',
      'Cannot be used for individually listed historic landmarks',
      'Mixed-use ground-floor commercial must meet ground-floor activation standards',
      '2+ residential units required to invoke ODDS path',
    ] : [],
    coastalNote,
    note: qualifies
      ? '✅ ODDS available — request ministerial review track at SB Planning counter. Bring your objective design checklist.'
      : null,
    citation: 'Santa Barbara Title 25 ODDS, adopted February 4, 2025',
    contact: 'SB Planning Division — PlanningCounter@SantaBarbaraCA.gov | (805) 564-5470',
  };
}

// ── Coastal Tier Flag ──────────────────────────────────────────
// Three-tier coastal jurisdiction system — determines who issues the CDP and
// whether CCC can appeal after local approval.
function analyzeCoastalTier(isCoastal, ctx) {
  if (!isCoastal) {
    return { isCoastal: false, tier: null, note: 'Parcel is outside the Coastal Zone — no CDP required.' };
  }

  // ctx.inAppealJurisdiction is set in app.js (conservatively = isCoastal)
  // Without a dedicated appeal-jurisdiction sub-layer we flag as "likely appeal jurisdiction"
  const tier = ctx.inAppealJurisdiction ? 'appeal' : 'non-appealable';

  const tiers = {
    'non-appealable': {
      label: 'Non-Appealable Area',
      authority: 'City of Santa Barbara (final authority)',
      cdpRequired: true,
      cccRole: 'None — City has final CDP authority',
      timeline: '6–18 months for standard projects; 3–6 months for minor projects',
      appealWindow: 'None to CCC after City approval',
      fee: '$5,000–$65,000 depending on project size and discretionary level',
    },
    'appeal': {
      label: 'Appeal Jurisdiction',
      authority: 'City of Santa Barbara — subject to CCC appeal',
      cdpRequired: true,
      cccRole: 'California Coastal Commission may appeal City CDP decision within 10 working days of final approval',
      timeline: '6–18 months City + potential 6–18 months additional if CCC appeals',
      appealWindow: '10 working days for CCC to appeal after City final action',
      fee: '$5,000–$65,000 (City) + $0 if no CCC appeal; CCC appeal process adds significant time',
      warning: '⚠ CCC appeal risk adds 6–18 months and significant cost uncertainty. Obtain a coastal consultant opinion before underwriting.',
    },
  };

  const tierData = tiers[tier];
  return {
    isCoastal: true,
    tier,
    tierLabel: tierData.label,
    authority: tierData.authority,
    cdpRequired: true,
    cccRole: tierData.cccRole,
    timeline: tierData.timeline,
    appealWindow: tierData.appealWindow || null,
    feeRange: tierData.fee,
    warning: tierData.warning || null,
    note: `CDP required. ${tierData.label}: ${tierData.authority}. Timeline: ${tierData.timeline}.`,
    citation: 'Public Resources Code §30600; City of Santa Barbara Local Coastal Program (LCP)',
    contact: 'SB Planning — Coastal Planning Section | (805) 564-5470',
  };
}

// ── Rent Freeze / AB 1482 Flag ────────────────────────────────
// Flags rent-controlled / rent-freeze conditions for existing residential structures.
// Relevant for renovation, conversion, and remodel scenarios.
function analyzeRentFreeze(yearBuilt, p) {
  const yr = parseInt(yearBuilt) || 0;
  const hasExistingResidential = !!(p && (p.squareFootage > 0 || p.bedrooms > 0));

  // AB 1482 (Tenant Protection Act): applies to units with C of O before Jan 1, 2010
  // (15-year rolling new construction exemption; as of 2026 that's pre-2011)
  const ab1482Applies = yr > 0 && yr <= 2010 && hasExistingResidential;

  // SB rent freeze (Ordinance 2026-6206): pre-1995 C of O units frozen through Dec 31, 2026
  const rentFreezeApplies = yr > 0 && yr < 1995 && hasExistingResidential;

  if (!hasExistingResidential || yr === 0) {
    return {
      applicable: false,
      note: 'No existing residential structure data available — verify at SB Rent Control office if converting or renovating.',
    };
  }

  return {
    applicable: ab1482Applies || rentFreezeApplies,
    yearBuilt: yr || '—',
    ab1482: {
      applies: ab1482Applies,
      currentCap: '7.7% annually (Aug 1 2025 – Jul 31 2026)',
      newConstructionExempt: yr > 2010,
      note: ab1482Applies
        ? '⚠ AB 1482 rent cap applies — max 7.7%/yr increase. New construction (post-2010) is exempt. Factor in rental upside ceiling for renovation/remodel scenarios.'
        : yr > 2010 ? 'New construction (post-2010) — exempt from AB 1482 for 15 years.' : 'Verify status.',
    },
    localRentFreeze: {
      applies: rentFreezeApplies,
      ordinance: 'Ordinance 2026-6206 (enacted Jan 2026)',
      expires: 'December 31, 2026',
      note: rentFreezeApplies
        ? '🚨 Santa Barbara LOCAL rent freeze in effect through Dec 31, 2026 for pre-1995 C of O units. Rents CANNOT be raised during freeze period. Critical for renovation underwriting.'
        : null,
    },
    renovation: ab1482Applies
      ? 'For renovation/major remodel scenarios: tenant displacement triggers just cause eviction requirements under SBMC Ch. 26.50. Allow 6–12 months for relocation if occupied.'
      : null,
    citation: 'AB 1482 (Gov. Code §1946.2); SB Rent Stabilization Ordinance 2026-6206; SBMC Ch. 26.50',
    contact: 'SB Rent Control Office — (805) 897-1984',
  };
}

window.DevelopmentAnalyzer = { analyzeParcel };
