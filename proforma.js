/* ============================================================
   Santa Barbara Development Pro Forma Estimator
   All cost and revenue figures are calibrated to the
   Santa Barbara / South Coast market (2024–2025 data).
   Sources: SB Building & Safety fee schedules, local GC
   interviews, SB Association of Realtors MLS data,
   CoStar South Coast rental comps, CBRE construction index.
   ============================================================ */

'use strict';

// ── Hard Cost Benchmarks ($/sq ft, all-in construction) ──────
// Ranges: [low, mid, high] per sq ft
const HARD_COSTS = {
  // New ground-up construction
  SFR_NEW:       { low: 380, mid: 480, high: 620, label: 'New Single-Family Residence' },
  DUPLEX_SB9:    { low: 340, mid: 430, high: 560, label: 'SB 9 Duplex / Two-Unit' },
  SHRA_TOWNHOME: { low: 310, mid: 395, high: 510, label: 'SHRA Townhome (attached)' },
  ADU_DETACHED:  { low: 420, mid: 530, high: 680, label: 'Detached ADU' },
  ADU_ATTACHED:  { low: 280, mid: 350, high: 450, label: 'Attached ADU (conversion/addition)' },
  JADU:          { low: 180, mid: 240, high: 320, label: 'JADU (interior conversion)' },
  CONDO_MF:      { low: 360, mid: 450, high: 580, label: 'Multi-Family Condo/Apartments' },
  REMODEL:       { low: 120, mid: 200, high: 320, label: 'Major Remodel / Addition' },
};

// ── Soft Cost Factors (as % of hard costs) ───────────────────
const SOFT_COST_PCT = {
  architecture:  { low: 0.07, mid: 0.09, high: 0.12 },   // A&E design fees
  engineering:   { low: 0.025, mid: 0.035, high: 0.05 },  // Structural, civil, MEP
  title24:       { low: 0.005, mid: 0.008, high: 0.012 },  // Energy compliance
  soils_geo:     { low: 0.008, mid: 0.012, high: 0.02 },   // Soils/geotech report
  surveying:     { low: 0.004, mid: 0.006, high: 0.01 },
  contingency:   { low: 0.08,  mid: 0.10,  high: 0.15 },  // Construction contingency
  project_mgmt:  { low: 0.03,  mid: 0.04,  high: 0.055 }, // Owner's rep / PM
};

// Total soft cost range (sum of above as % of hard)
const SOFT_TOTAL_PCT = {
  low:  0.07 + 0.025 + 0.005 + 0.008 + 0.004 + 0.08 + 0.03,   // ~0.222
  mid:  0.09 + 0.035 + 0.008 + 0.012 + 0.006 + 0.10 + 0.04,   // ~0.291
  high: 0.12 + 0.05  + 0.012 + 0.02  + 0.01  + 0.15 + 0.055,  // ~0.417
};

// ── Permit & Entitlement Fees (flat, $/project) ──────────────
const PERMIT_FEES = {
  building_permit_base: { low: 8000,  mid: 18000, high: 45000 }, // scales w/ valuation
  cdp_staff_ho:         { low: 5000,  mid: 12000, high: 20000 }, // Coastal — Staff HO level
  cdp_planning_comm:    { low: 15000, mid: 35000, high: 65000 }, // Coastal — Planning Commission
  historic_hlc:         { low: 8000,  mid: 15000, high: 28000 }, // Historic Landmarks Commission
  sb9_lot_split:        { low: 3500,  mid: 7500,  high: 14000 }, // SB 9 parcel map processing
  shra_parcel_map:      { low: 2500,  mid: 6000,  high: 12000 }, // SHRA ministerial map
  adu_permit:           { low: 4000,  mid: 9000,  high: 16000 }, // ADU permit package
  // School impact fees: Level 1 = $5.38/sqft residential (eff. Jan 28, 2026 — Education Code §17620)
  // ADU/JADU ≤500 sqft are EXEMPT under SB 543 (eff. Jan 1, 2026)
  // Stored as $/sqft scalar — applied per totalSqft in calcProForma
  school_fee_per_sqft:  5.38,        // $/sqft (Level 1, Jan 2026)
  school_fee_exempt_scenarios: ['JADU'], // JADU ≤500sqft typically exempt; ADU ≤500 handled by size check
  // Utility connection fees — itemized (City of Santa Barbara / SBSD, FY2024–25)
  water_capacity_sfr:   { low: 9000,  mid: 10827, high: 13000 }, // 5/8" meter (SFR / ADU)
  water_capacity_1in:   { low: 22000, mid: 27071, high: 33000 }, // 1" meter (duplex/small MF)
  wastewater_sfr:       { low: 3500,  mid: 3955,  high: 4800  }, // Wastewater connection per SFR equiv.
  sewer_connection:     { low: 1100,  mid: 3000,  high: 8500  }, // SBSD sewer connection (varies)
  fire_clearance:       { low: 800,   mid: 1500,  high: 3500  }, // SFD inspection (fire zone only)
};

// Utility connection cost by scenario ($/unit basis)
const UTILITY_BY_SCENARIO = {
  ADU_DETACHED:  { water: 'sfr',  waste: true, sewer: true  }, // new meter likely needed
  ADU_ATTACHED:  { water: 'sfr',  waste: true, sewer: false }, // usually uses existing sewer
  JADU:          { water: null,   waste: false, sewer: false }, // interior conversion — no new connections
  SFR_NEW:       { water: 'sfr',  waste: true, sewer: true  },
  DUPLEX_SB9:    { water: '1in',  waste: true, sewer: true  }, // 2 units → 1" meter typical
  SHRA_TOWNHOME: { water: '1in',  waste: true, sewer: true  },
  CONDO_MF:      { water: '1in',  waste: true, sewer: true  },
  REMODEL:       { water: null,   waste: false, sewer: false }, // typically no new connections
};

// ── Financing / Carry Costs ───────────────────────────────────
const FINANCING = {
  construction_loan_rate: 0.085,   // 8.5% annual (2024–25 SB hard money / construction)
  loan_to_cost:           0.70,    // 70% LTC typical
  avg_draw_months:        { low: 12, mid: 16, high: 24 }, // ADU vs full build
};

// ── Santa Barbara Revenue Benchmarks ─────────────────────────

// Sale comps $/sq ft [low, mid, high]
const SALE_COMPS = {
  SFR:        { low: 850,  mid: 1050, high: 1400 }, // SFR detached, SB city
  ADU_SALE:   { low: 600,  mid: 780,  high: 1000 }, // ADU (often adds value, not sold sep.)
  DUPLEX:     { low: 700,  mid: 880,  high: 1100 }, // Per unit, duplex/SB9
  TOWNHOME:   { low: 650,  mid: 820,  high: 1050 }, // SHRA townhomes, new product
  CONDO_MF:   { low: 580,  mid: 750,  high: 980  }, // Condo/MF
};

// Monthly rent comps by bedroom count (SB market, 2024–25)
const RENT_COMPS = {
  studio: { low: 1800, mid: 2300, high: 2900 },
  '1br':  { low: 2400, mid: 3000, high: 3800 },
  '2br':  { low: 3200, mid: 4000, high: 5200 },
  '3br':  { low: 4200, mid: 5400, high: 7000 },
  '4br':  { low: 5500, mid: 7200, high: 9500 },
};

// Gross rent multiplier (GRM) for cap rate valuation
const GRM = { low: 18, mid: 22, high: 28 }; // months of gross annual rent

// Cap rate range for income valuation
const CAP_RATE = { low: 0.035, mid: 0.045, high: 0.06 };

// Vacancy + expense ratio (for NOI calc)
const VACANCY_EXPENSE_RATIO = 0.35; // 35% of gross rent

// ── Utility: range arithmetic ─────────────────────────────────
function addRange(a, b) {
  return { low: a.low + b.low, mid: a.mid + b.mid, high: a.high + b.high };
}
function mulRange(r, scalar) {
  return { low: r.low * scalar, mid: r.mid * scalar, high: r.high * scalar };
}
function pctRange(base, pct) {
  return { low: base.low * pct.low, mid: base.mid * pct.mid, high: base.high * pct.high };
}
function fmt$(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(2) + 'M';
  if (n >= 1000)    return '$' + Math.round(n / 1000) + 'K';
  return '$' + Math.round(n).toLocaleString();
}
function fmtRange(r, label) {
  return { low: r.low, mid: r.mid, high: r.high, label };
}

// ── Bedroom count guess from sq ft ───────────────────────────
function guessBedroomsFromSqft(sqft) {
  if (sqft <= 450)  return 'studio';
  if (sqft <= 750)  return '1br';
  if (sqft <= 1100) return '2br';
  if (sqft <= 1600) return '3br';
  return '4br';
}

// ── Main calculation engine ───────────────────────────────────
/**
 * calcProForma(scenario, inputs, context)
 * @param {string} scenario  - Key from SCENARIO_DEFS
 * @param {Object} inputs    - { unitCount, avgUnitSqft, landValue, totalLotSqft, zone }
 * @param {Object} context   - { isCoastal, inAppealJurisdiction, isHighFire, isHistoric, sb9LotSplit }
 * @returns {Object}         - Full pro forma result
 */
function calcProForma(scenario, inputs, context) {
  const ctx = context || {};
  const inp = inputs || {};

  const unitCount     = Math.max(1, parseInt(inp.unitCount)    || 1);
  const avgUnitSqft   = Math.max(200, parseInt(inp.avgUnitSqft)|| 1000);
  const landValue     = parseInt(inp.landValue) || 0;
  const totalSqft     = unitCount * avgUnitSqft;

  // Hard cost basis
  const hc = HARD_COSTS[scenario] || HARD_COSTS.SFR_NEW;
  const hardCostRange = {
    low:  hc.low  * totalSqft,
    mid:  hc.mid  * totalSqft,
    high: hc.high * totalSqft,
  };

  // Soft costs
  const softCostRange = {
    low:  hardCostRange.low  * SOFT_TOTAL_PCT.low,
    mid:  hardCostRange.mid  * SOFT_TOTAL_PCT.mid,
    high: hardCostRange.high * SOFT_TOTAL_PCT.high,
  };

  // Permit & entitlement fees (pass inputs so school fees can use sqft)
  const entitlementRange = buildEntitlementCosts(scenario, unitCount, ctx, { avgUnitSqft });

  // Construction financing cost
  const loanBase = {
    low:  (hardCostRange.low  + softCostRange.low)  * FINANCING.loan_to_cost,
    mid:  (hardCostRange.mid  + softCostRange.mid)  * FINANCING.loan_to_cost,
    high: (hardCostRange.high + softCostRange.high) * FINANCING.loan_to_cost,
  };
  const financingRange = {
    low:  loanBase.low  * FINANCING.construction_loan_rate * (FINANCING.avg_draw_months.low  / 12),
    mid:  loanBase.mid  * FINANCING.construction_loan_rate * (FINANCING.avg_draw_months.mid  / 12),
    high: loanBase.high * FINANCING.construction_loan_rate * (FINANCING.avg_draw_months.high / 12),
  };

  // Total development cost (TDC)
  const landRange = {
    low:  landValue * 0.85,  // land value can fluctuate; use AV as proxy
    mid:  landValue,
    high: landValue * 1.20,
  };

  const totalDevCost = {
    low:  landRange.low  + hardCostRange.low  + softCostRange.low  + entitlementRange.low  + financingRange.low,
    mid:  landRange.mid  + hardCostRange.mid  + softCostRange.mid  + entitlementRange.mid  + financingRange.mid,
    high: landRange.high + hardCostRange.high + softCostRange.high + entitlementRange.high + financingRange.high,
  };

  // ── Revenue: For-Sale ─────────────────────────────────────
  const saleComp = getSaleComps(scenario);
  const saleRevenue = {
    low:  saleComp.low  * totalSqft,
    mid:  saleComp.mid  * totalSqft,
    high: saleComp.high * totalSqft,
  };

  // Net profit (for sale)
  const netProfit = {
    low:  saleRevenue.low  - totalDevCost.high,  // conservative
    mid:  saleRevenue.mid  - totalDevCost.mid,
    high: saleRevenue.high - totalDevCost.low,   // optimistic
  };

  // ROI %
  const roi = {
    low:  totalDevCost.mid > 0 ? ((netProfit.low  / totalDevCost.mid) * 100).toFixed(1) : 0,
    mid:  totalDevCost.mid > 0 ? ((netProfit.mid  / totalDevCost.mid) * 100).toFixed(1) : 0,
    high: totalDevCost.mid > 0 ? ((netProfit.high / totalDevCost.mid) * 100).toFixed(1) : 0,
  };

  // ── Revenue: Rental (Hold) ────────────────────────────────
  const bedroomType = guessBedroomsFromSqft(avgUnitSqft);
  const rentPerUnit = RENT_COMPS[bedroomType];
  const grossMonthlyRent = {
    low:  rentPerUnit.low  * unitCount,
    mid:  rentPerUnit.mid  * unitCount,
    high: rentPerUnit.high * unitCount,
  };
  const grossAnnualRent = mulRange(grossMonthlyRent, 12);
  const noi = {
    low:  grossAnnualRent.low  * (1 - VACANCY_EXPENSE_RATIO),
    mid:  grossAnnualRent.mid  * (1 - VACANCY_EXPENSE_RATIO),
    high: grossAnnualRent.high * (1 - VACANCY_EXPENSE_RATIO),
  };
  // Income value (cap rate approach)
  const incomeValue = {
    low:  noi.mid  / CAP_RATE.high,   // conservative valuation
    mid:  noi.mid  / CAP_RATE.mid,
    high: noi.high / CAP_RATE.low,    // optimistic
  };

  // Cost-per-unit
  const costPerUnit = {
    low:  totalDevCost.low  / unitCount,
    mid:  totalDevCost.mid  / unitCount,
    high: totalDevCost.high / unitCount,
  };

  // Break-even land value (what you can afford to pay for land)
  const breakEvenLand = {
    low:  saleRevenue.low  - (hardCostRange.mid + softCostRange.mid + entitlementRange.mid + financingRange.mid),
    mid:  saleRevenue.mid  - (hardCostRange.mid + softCostRange.mid + entitlementRange.mid + financingRange.mid),
    high: saleRevenue.high - (hardCostRange.mid + softCostRange.mid + entitlementRange.mid + financingRange.mid),
  };

  // ── Cost breakdown detail ─────────────────────────────────
  const costBreakdown = [
    { label: 'Land / Acquisition',  range: landRange,        pct: landRange.mid  / totalDevCost.mid },
    { label: 'Hard Construction',   range: hardCostRange,    pct: hardCostRange.mid / totalDevCost.mid },
    { label: 'Soft Costs (A&E, PM)',range: softCostRange,    pct: softCostRange.mid / totalDevCost.mid },
    { label: 'Permits & Fees',      range: entitlementRange, pct: entitlementRange.mid / totalDevCost.mid },
    { label: 'Construction Financing', range: financingRange, pct: financingRange.mid / totalDevCost.mid },
  ];

  // ── Assumptions summary ───────────────────────────────────
  const assumptions = [
    `Hard cost: ${fmt$(hc.low)}–${fmt$(hc.high)}/sq ft (${hc.label})`,
    `Soft costs: ${Math.round(SOFT_TOTAL_PCT.low * 100)}–${Math.round(SOFT_TOTAL_PCT.high * 100)}% of hard costs`,
    `Construction loan: ${(FINANCING.construction_loan_rate * 100).toFixed(1)}% annual at ${FINANCING.loan_to_cost * 100}% LTC`,
    `Draw period: ${FINANCING.avg_draw_months.low}–${FINANCING.avg_draw_months.high} months`,
    `Sale comps: ${fmt$(saleComp.low)}–${fmt$(saleComp.high)}/sq ft (SB market 2024–25)`,
    `Rental: Est. ${rentPerUnit.low < 2000 ? '$'+rentPerUnit.low : fmt$(rentPerUnit.low)}–${fmt$(rentPerUnit.high)}/mo per unit (${bedroomType.replace('br',' BR')})`,
    `Cap rate: ${(CAP_RATE.low * 100).toFixed(1)}–${(CAP_RATE.high * 100).toFixed(1)}% (SB residential income)`,
    ctx.isCoastal    ? 'Coastal CDP fees included in entitlement costs' : null,
    ctx.isHighFire   ? 'Fire clearance and Chapter 7A premium included' : null,
    ctx.isHistoric   ? 'Historic Landmarks Commission review fees included' : null,
    ctx.sb9LotSplit  ? 'SB 9 lot split processing fee included' : null,
    `School impact fees: $5.38/sqft (Level 1, eff. Jan 28 2026 — Education Code §17620). JADU and ADU ≤500sqft exempt (SB 543).`,
    `Utility connections: Water capacity ($10,827 SFR / $27,071 1" meter), Wastewater ($3,955), Sewer connection ($1,100–$8,500) — Santa Barbara FY2024–25 rates.`,
  ].filter(Boolean);

  return {
    scenario,
    scenarioLabel: hc.label,
    inputs: { unitCount, avgUnitSqft, landValue, totalSqft, bedroomType },
    // Cost side
    hardCostRange,
    softCostRange,
    entitlementRange,
    financingRange,
    landRange,
    totalDevCost,
    costPerUnit,
    costBreakdown,
    // Revenue side
    saleRevenue,
    netProfit,
    roi,
    // Rental side
    grossMonthlyRent,
    grossAnnualRent,
    noi,
    incomeValue,
    // Break-even
    breakEvenLand,
    // Meta
    assumptions,
    bedroomType,
    rentPerUnit,
    saleComp,
  };
}

// ── Entitlement cost builder ──────────────────────────────────
function buildEntitlementCosts(scenario, unitCount, ctx, inp) {
  let low = 0, mid = 0, high = 0;

  // Base building permit (scales with project size)
  const bp = PERMIT_FEES.building_permit_base;
  low  += bp.low;
  mid  += bp.mid;
  high += bp.high;

  // ADU-specific permit
  if (scenario === 'ADU_DETACHED' || scenario === 'ADU_ATTACHED') {
    low  += PERMIT_FEES.adu_permit.low;
    mid  += PERMIT_FEES.adu_permit.mid;
    high += PERMIT_FEES.adu_permit.high;
  }

  // SB 9 lot split
  if (scenario === 'DUPLEX_SB9' && ctx.sb9LotSplit) {
    low  += PERMIT_FEES.sb9_lot_split.low;
    mid  += PERMIT_FEES.sb9_lot_split.mid;
    high += PERMIT_FEES.sb9_lot_split.high;
  }

  // SHRA parcel map
  if (scenario === 'SHRA_TOWNHOME') {
    low  += PERMIT_FEES.shra_parcel_map.low;
    mid  += PERMIT_FEES.shra_parcel_map.mid;
    high += PERMIT_FEES.shra_parcel_map.high;
  }

  // Coastal CDP
  if (ctx.isCoastal) {
    // Most new residential = Planning Commission level
    const cdp = PERMIT_FEES.cdp_planning_comm;
    low  += cdp.low;
    mid  += cdp.mid;
    high += cdp.high;
  }

  // Historic
  if (ctx.isHistoric) {
    const hlc = PERMIT_FEES.historic_hlc;
    low  += hlc.low;
    mid  += hlc.mid;
    high += hlc.high;
  }

  // Fire clearance
  if (ctx.isHighFire) {
    low  += PERMIT_FEES.fire_clearance.low;
    mid  += PERMIT_FEES.fire_clearance.mid;
    high += PERMIT_FEES.fire_clearance.high;
  }

  // School impact fees — $5.38/sqft (eff. Jan 28, 2026; Education Code §17620)
  // EXEMPT: JADU, and any ADU ≤500 sqft (SB 543, eff. Jan 1 2026)
  const avgSqftEst = (inp && inp.avgUnitSqft) ? inp.avgUnitSqft : 800;
  const isSchoolExempt = scenario === 'JADU' ||
    ((scenario === 'ADU_DETACHED' || scenario === 'ADU_ATTACHED') && avgSqftEst <= 500);
  const schoolFeeTotal = isSchoolExempt ? 0 : PERMIT_FEES.school_fee_per_sqft * avgSqftEst * unitCount;
  // Apply ±20% range for levy adjustments
  low  += isSchoolExempt ? 0 : schoolFeeTotal * 0.8;
  mid  += schoolFeeTotal;
  high += isSchoolExempt ? 0 : schoolFeeTotal * 1.1;

  // Utility connection fees — itemized by scenario
  const utilProfile = UTILITY_BY_SCENARIO[scenario] || { water: 'sfr', waste: true, sewer: true };
  for (let u = 0; u < unitCount; u++) {
    if (utilProfile.water === 'sfr') {
      low  += PERMIT_FEES.water_capacity_sfr.low;
      mid  += PERMIT_FEES.water_capacity_sfr.mid;
      high += PERMIT_FEES.water_capacity_sfr.high;
    } else if (utilProfile.water === '1in' && u === 0) {
      // Single 1" meter for the whole project (not per-unit)
      low  += PERMIT_FEES.water_capacity_1in.low;
      mid  += PERMIT_FEES.water_capacity_1in.mid;
      high += PERMIT_FEES.water_capacity_1in.high;
    }
    if (utilProfile.waste) {
      low  += PERMIT_FEES.wastewater_sfr.low;
      mid  += PERMIT_FEES.wastewater_sfr.mid;
      high += PERMIT_FEES.wastewater_sfr.high;
    }
    if (utilProfile.sewer && u === 0) {
      // Sewer connection once per project
      low  += PERMIT_FEES.sewer_connection.low;
      mid  += PERMIT_FEES.sewer_connection.mid;
      high += PERMIT_FEES.sewer_connection.high;
    }
  }

  return { low, mid, high };
}

// ── Sale comp selector ────────────────────────────────────────
function getSaleComps(scenario) {
  const map = {
    SFR_NEW:       SALE_COMPS.SFR,
    DUPLEX_SB9:    SALE_COMPS.DUPLEX,
    SHRA_TOWNHOME: SALE_COMPS.TOWNHOME,
    ADU_DETACHED:  SALE_COMPS.ADU_SALE,
    ADU_ATTACHED:  SALE_COMPS.ADU_SALE,
    JADU:          SALE_COMPS.ADU_SALE,
    CONDO_MF:      SALE_COMPS.CONDO_MF,
    REMODEL:       SALE_COMPS.SFR,
  };
  return map[scenario] || SALE_COMPS.SFR;
}

// ── Public scenario list ──────────────────────────────────────
const SCENARIOS = [
  { key: 'ADU_DETACHED',  label: 'Detached ADU',               icon: '🏠' },
  { key: 'ADU_ATTACHED',  label: 'Attached ADU',               icon: '🏠' },
  { key: 'JADU',          label: 'JADU (Interior Conversion)', icon: '🚪' },
  { key: 'SFR_NEW',       label: 'New Single-Family Home',     icon: '🏡' },
  { key: 'DUPLEX_SB9',    label: 'SB 9 Duplex / Two-Unit',     icon: '🏘' },
  { key: 'SHRA_TOWNHOME', label: 'SHRA Townhomes (SB 684/1123)', icon: '🏗' },
  { key: 'CONDO_MF',      label: 'Multi-Family / Condo',       icon: '🏢' },
  { key: 'REMODEL',       label: 'Major Remodel / Addition',   icon: '🔨' },
];

window.ProForma = {
  calcProForma,
  SCENARIOS,
  HARD_COSTS,
  RENT_COMPS,
  SALE_COMPS,
  fmt$,
};
