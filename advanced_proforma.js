/* ============================================================
   Santa Barbara Parcel Explorer — Advanced Pro Forma Module
   IRR, NPV, Equity Multiple, Sensitivity Analysis
   All calculations use mid-point estimates from window.ProForma.
   No external dependencies.
   ============================================================ */

'use strict';

// ── Constants ─────────────────────────────────────────────────

var CONSTRUCTION_LOAN_RATE = 0.085;  // 8.5% annual
var LOAN_TO_COST           = 0.70;   // 70% LTC
var EQUITY_SHARE           = 0.30;   // 30% equity
var PERM_LOAN_RATE         = 0.085;  // 8.5% (perm / takeout loan, same era)
var PERM_LOAN_AMORT_YRS    = 20;     // 20-year amortization
var DEFAULT_NPV_RATE       = 0.08;   // 8% annual discount
var CONSTRUCTION_MONTHS    = 18;     // default construction period
var MAX_IRR_ITER           = 100;
var IRR_TOLERANCE          = 1e-7;

// ── Utility ───────────────────────────────────────────────────

function _fmt$(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  if (n >= 1000000)  return '$' + (n / 1000000).toFixed(2) + 'M';
  if (n >= 1000)     return '$' + Math.round(n / 1000) + 'K';
  if (n <= -1000000) return '-$' + (Math.abs(n) / 1000000).toFixed(2) + 'M';
  if (n <= -1000)    return '-$' + Math.round(Math.abs(n) / 1000) + 'K';
  return '$' + Math.round(n).toLocaleString();
}

function _fmtPct(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return n.toFixed(1) + '%';
}

function _fmtX(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return n.toFixed(2) + 'x';
}

// ── IRR (Newton-Raphson) ──────────────────────────────────────

/**
 * calcIRR(cashFlows, guess)
 * Standard Newton-Raphson IRR on an array of cash flows.
 * cashFlows[0] = negative initial equity investment
 * cashFlows[1..n] = periodic returns
 * Returns IRR as an annualized percentage (assumes monthly periods → ×12).
 *
 * For the SB development model:
 *   Period 0 : -equity (equity = TDC × 0.30)
 *   Periods 1–18 : 0 (construction phase; debt-funded draws not in equity CF)
 *   Period 19 : +saleRevenue - loanRepayment  (for-sale exit)
 *              OR +incomeValue - loanRepayment (hold/rent exit)
 *
 * @param {number[]} cashFlows - Array of cash flows (period 0 = investment)
 * @param {number} [guess=0.01] - Initial monthly rate guess
 * @returns {number} Annualized IRR as a percentage, or NaN on failure
 */
function calcIRR(cashFlows, guess) {
  if (!cashFlows || cashFlows.length < 2) return NaN;

  var rate = (guess !== undefined && !isNaN(guess)) ? guess : 0.01;
  var n    = cashFlows.length;

  for (var iter = 0; iter < MAX_IRR_ITER; iter++) {
    // NPV at current rate
    var npv  = 0;
    var dnpv = 0; // derivative of NPV w.r.t. rate

    for (var t = 0; t < n; t++) {
      var cf    = cashFlows[t];
      var denom = Math.pow(1 + rate, t);
      npv  += cf / denom;
      if (t > 0) {
        dnpv -= t * cf / Math.pow(1 + rate, t + 1);
      }
    }

    if (Math.abs(dnpv) < 1e-12) break; // avoid division by zero

    var rateNew = rate - npv / dnpv;

    if (Math.abs(rateNew - rate) < IRR_TOLERANCE) {
      rate = rateNew;
      break;
    }

    rate = rateNew;

    // Guard against divergence
    if (rate <= -1 || rate > 10) {
      rate = 0.01;
    }
  }

  // Annualize from monthly
  var annualIRR = (Math.pow(1 + rate, 12) - 1) * 100;
  return annualIRR;
}

/**
 * _buildDevCashFlows(totalDevCostMid, exitValue, mode)
 * Builds simplified monthly equity cash flow array for a development project.
 * @param {number} totalDevCostMid  - TDC at mid-point
 * @param {number} exitValue        - Sale revenue (for-sale) or income value (rent)
 * @param {string} mode             - 'sale' or 'rent'
 * @returns {number[]} Monthly cash flows over 20 periods
 */
function _buildDevCashFlows(totalDevCostMid, exitValue, mode) {
  var equity        = totalDevCostMid * EQUITY_SHARE;
  var loanAmount    = totalDevCostMid * LOAN_TO_COST;

  // Interest-only construction loan during 18 months
  // (debt service not in equity CF — only equity in at start, exit at month 19)
  var flows = [];

  // Period 0: equity injection
  flows.push(-equity);

  // Periods 1–18: no equity cash flow (debt draws funded by construction loan)
  for (var m = 1; m <= CONSTRUCTION_MONTHS; m++) {
    flows.push(0);
  }

  // Period 19: exit — receive net proceeds
  // For both modes: sale price or income value, minus loan repayment
  var netExit = exitValue - loanAmount;
  flows.push(netExit);

  // Period 20: small stub (0) to allow solver room
  flows.push(0);

  return flows;
}

// ── NPV ───────────────────────────────────────────────────────

/**
 * calcNPV(cashFlows, annualRate)
 * Standard NPV calculation.
 * Uses monthly discount rate = annualRate / 12.
 * @param {number[]} cashFlows
 * @param {number}   annualRate  - Annual discount rate (e.g. 0.08 for 8%)
 * @returns {number} Net Present Value
 */
function calcNPV(cashFlows, annualRate) {
  if (!cashFlows || cashFlows.length === 0) return NaN;
  var monthlyRate = (annualRate || DEFAULT_NPV_RATE) / 12;
  var npv = 0;
  for (var t = 0; t < cashFlows.length; t++) {
    npv += cashFlows[t] / Math.pow(1 + monthlyRate, t);
  }
  return npv;
}

// ── Equity Multiple ───────────────────────────────────────────

/**
 * calcEquityMultiple(totalReturn, equityIn)
 * @param {number} totalReturn - Total value returned to equity (distributions + exit)
 * @param {number} equityIn    - Initial equity invested
 * @returns {number} Equity multiple (e.g. 1.8)
 */
function calcEquityMultiple(totalReturn, equityIn) {
  if (!equityIn || equityIn === 0) return NaN;
  return totalReturn / equityIn;
}

// ── Monthly Debt Service ───────────────────────────────────────

/**
 * _calcMonthlyDebtService(loanAmount, annualRate, amortYears)
 * Standard mortgage payment formula.
 * @param {number} loanAmount
 * @param {number} annualRate
 * @param {number} amortYears
 * @returns {number} Monthly payment
 */
function _calcMonthlyDebtService(loanAmount, annualRate, amortYears) {
  if (!loanAmount || loanAmount <= 0) return 0;
  var r = annualRate / 12;
  var n = amortYears * 12;
  if (r === 0) return loanAmount / n;
  return loanAmount * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

// ── Sensitivity Analysis ──────────────────────────────────────

/**
 * renderSensitivityPanel(baseProForma)
 * Returns HTML string with a 3×3 sensitivity table.
 * Rows = construction cost variance: -15%, 0%, +15%
 * Cols = sale price variance:        -10%, 0%, +10%
 * Cell = Net Profit (mid), color-coded green/red.
 *
 * @param {Object} baseProForma - Output from window.ProForma.calcProForma()
 * @returns {string} HTML string
 */
function renderSensitivityPanel(baseProForma) {
  if (!baseProForma) {
    return '<div class="sensitivity-panel sensitivity-empty">No pro forma data. Run the estimator first.</div>';
  }

  var baseTDC    = (baseProForma.totalDevCost && baseProForma.totalDevCost.mid)   || 0;
  var baseSale   = (baseProForma.saleRevenue  && baseProForma.saleRevenue.mid)    || 0;
  var baseHard   = (baseProForma.hardCostRange && baseProForma.hardCostRange.mid) || 0;
  var baseSoft   = (baseProForma.softCostRange && baseProForma.softCostRange.mid) || 0;
  var baseEnti   = (baseProForma.entitlementRange && baseProForma.entitlementRange.mid) || 0;
  var baseFin    = (baseProForma.financingRange && baseProForma.financingRange.mid)     || 0;
  var baseLand   = (baseProForma.landRange && baseProForma.landRange.mid)               || 0;
  var baseNonHard = baseSoft + baseEnti + baseFin + baseLand; // stays fixed in sensitivity

  var costVars  = [-0.15, 0, 0.15];
  var priceVars = [-0.10, 0, 0.10];

  var costLabels  = ['-15% Hard Cost', 'Base', '+15% Hard Cost'];
  var priceLabels = ['-10% Sale Price', 'Base Sale', '+10% Sale Price'];

  // Table CSS (inline)
  var css = [
    '.sensitivity-panel { font-family: inherit; }',
    '.sensitivity-title { font-size: 0.8rem; font-weight: 700; color: var(--color-primary, #1a5f7a); margin-bottom: 8px; }',
    '.sensitivity-subtitle { font-size: 0.72rem; color: var(--color-text-faint, #888); margin-bottom: 10px; }',
    '.sensitivity-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }',
    '.sensitivity-table th { background: var(--color-primary, #1a3a5c); color: #fff; padding: 6px 8px; text-align: center; font-size: 0.72rem; font-weight: 600; }',
    '.sensitivity-table th.row-header { background: #f0f4f8; color: #333; text-align: right; font-weight: 600; }',
    '.sensitivity-table td { padding: 6px 8px; text-align: center; border: 1px solid #e0e8f0; font-family: var(--font-mono, monospace); font-size: 0.78rem; }',
    '.sensitivity-table td.row-label { font-family: inherit; text-align: right; font-size: 0.72rem; color: #555; font-weight: 600; background: #f8fafb; padding: 6px 10px; }',
    '.cell-pos { background: #e8f5ea; color: #1a5c2a; font-weight: 700; }',
    '.cell-pos-mid { background: #c3e6cb; color: #155724; font-weight: 700; }',
    '.cell-neg { background: #fde8e8; color: #8b0000; font-weight: 700; }',
    '.cell-zero { background: #fff9e6; color: #7a4f00; font-weight: 600; }',
    '.sensitivity-note { font-size: 0.68rem; color: var(--color-text-faint, #888); margin-top: 6px; }',
  ].join('\n');

  // Build header row
  var header = '<tr><th class="row-header">↓ Construction Cost &nbsp;|&nbsp; Sale Price →</th>';
  for (var pi = 0; pi < priceVars.length; pi++) {
    header += '<th>' + priceLabels[pi] + '</th>';
  }
  header += '</tr>';

  // Build data rows
  var rows = '';
  for (var ci = 0; ci < costVars.length; ci++) {
    var cv  = costVars[ci];
    var adjHard   = baseHard * (1 + cv);
    var adjTDC    = adjHard + baseNonHard;
    rows += '<tr><td class="row-label">' + costLabels[ci] + '</td>';

    for (var pj = 0; pj < priceVars.length; pj++) {
      var pv      = priceVars[pj];
      var adjSale = baseSale * (1 + pv);
      var profit  = adjSale - adjTDC;

      // Color class
      var cellClass;
      if (ci === 1 && pj === 1) {
        // Center cell = base case
        cellClass = profit >= 0 ? 'cell-pos-mid' : 'cell-neg';
      } else if (profit > 0) {
        cellClass = 'cell-pos';
      } else if (profit < 0) {
        cellClass = 'cell-neg';
      } else {
        cellClass = 'cell-zero';
      }

      var roiPct = adjTDC > 0 ? ((profit / adjTDC) * 100).toFixed(1) : '0.0';
      var display = _fmt$(profit) + '<br><span style="font-size:0.68rem;opacity:0.8;">' + roiPct + '% ROI</span>';

      rows += '<td class="' + cellClass + '">' + display + '</td>';
    }
    rows += '</tr>';
  }

  var scenarioLabel = baseProForma.scenarioLabel || baseProForma.scenario || 'Development';
  var unitCount     = (baseProForma.inputs && baseProForma.inputs.unitCount) || 1;
  var totalSqft     = (baseProForma.inputs && baseProForma.inputs.totalSqft) || 0;

  return '<style>' + css + '</style>' +
    '<div class="sensitivity-panel">' +
    '<div class="sensitivity-title">Sensitivity Analysis — Net Profit</div>' +
    '<div class="sensitivity-subtitle">' +
      'Scenario: ' + scenarioLabel + ' · ' + unitCount + ' unit(s) · ' + totalSqft.toLocaleString() + ' sf total · ' +
      'Base TDC: ' + _fmt$(baseTDC) + ' · Base Sale: ' + _fmt$(baseSale) +
    '</div>' +
    '<table class="sensitivity-table">' +
    '<thead>' + header + '</thead>' +
    '<tbody>' + rows + '</tbody>' +
    '</table>' +
    '<div class="sensitivity-note">Center cell (shaded) = base case. Green = profitable. Red = loss. ROI shown relative to adjusted TDC.</div>' +
    '</div>';
}

// ── Advanced Metrics Panel ────────────────────────────────────

/**
 * renderAdvancedMetrics(pfResult, mode)
 * Returns HTML for a metrics panel showing:
 *   - IRR % (annualized)
 *   - NPV at 8% discount rate
 *   - Equity Multiple
 *   - Equity In (30% of TDC mid)
 *   - Loan Amount (70% of TDC mid)
 *   - Monthly Debt Service
 *   - DSCR (for rent mode)
 *
 * @param {Object} pfResult - Output from window.ProForma.calcProForma()
 * @param {string} mode     - 'sale' or 'rent'
 * @returns {string} HTML string
 */
function renderAdvancedMetrics(pfResult, mode) {
  if (!pfResult) {
    return '<div class="adv-metrics-empty" style="font-size:0.8rem;color:var(--color-text-faint,#888);padding:12px 0;">' +
      'Run the Pro Forma Estimator first to see advanced metrics.' +
      '</div>';
  }

  var currentMode = mode || 'sale';
  var tdc         = (pfResult.totalDevCost && pfResult.totalDevCost.mid) || 0;
  var equity      = tdc * EQUITY_SHARE;
  var loanAmount  = tdc * LOAN_TO_COST;

  // Exit value
  var exitValue;
  if (currentMode === 'rent') {
    exitValue = (pfResult.incomeValue && pfResult.incomeValue.mid) || 0;
  } else {
    exitValue = (pfResult.saleRevenue && pfResult.saleRevenue.mid) || 0;
  }

  // Build cash flows
  var cashFlows = _buildDevCashFlows(tdc, exitValue, currentMode);

  // IRR
  var irrMonthlyGuess = 0.015; // ~18% annual starting guess
  var irrPct = calcIRR(cashFlows, irrMonthlyGuess);

  // NPV
  var npv = calcNPV(cashFlows, DEFAULT_NPV_RATE);

  // Equity Multiple
  // Total return to equity = net exit proceeds (exit - loan) for sale
  // For both modes: netExit = exitValue - loanAmount
  var netExit       = exitValue - loanAmount;
  var equityMult    = calcEquityMultiple(Math.max(0, netExit), equity);

  // Monthly debt service (permanent loan at takeout)
  var monthlyDS     = _calcMonthlyDebtService(loanAmount, PERM_LOAN_RATE, PERM_LOAN_AMORT_YRS);
  var annualDS      = monthlyDS * 12;

  // DSCR (only meaningful for rent mode)
  var noi           = (pfResult.noi && pfResult.noi.mid) || 0;
  var dscr          = (annualDS > 0 && noi > 0) ? (noi / annualDS) : null;

  // Net profit mid
  var netProfit = 0;
  if (currentMode === 'rent') {
    netProfit = (pfResult.incomeValue && pfResult.incomeValue.mid)
      ? pfResult.incomeValue.mid - tdc
      : 0;
  } else {
    netProfit = (pfResult.netProfit && pfResult.netProfit.mid) || 0;
  }

  // Color helpers
  function metricColor(val, goodIfHigh) {
    if (val === null || isNaN(val)) return 'var(--color-text,#222)';
    if (goodIfHigh) return val > 0 ? 'var(--color-success,#2e7041)' : '#c00';
    return val >= 1.0 ? 'var(--color-success,#2e7041)' : '#c00';
  }

  var irrColor    = (!isNaN(irrPct) && irrPct > 0) ? 'var(--color-success,#2e7041)' : '#c00';
  var npvColor    = (!isNaN(npv)    && npv    > 0) ? 'var(--color-success,#2e7041)' : '#c00';
  var multColor   = (!isNaN(equityMult) && equityMult >= 1.0) ? 'var(--color-success,#2e7041)' : '#c00';
  var dscrColor   = (dscr !== null && dscr >= 1.25) ? 'var(--color-success,#2e7041)' : (dscr !== null && dscr < 1.0 ? '#c00' : '#c4611a');

  // CSS
  var css = [
    '.adv-metrics { }',
    '.adv-metrics-title { font-size:0.82rem;font-weight:700;color:var(--color-primary,#1a5f7a);margin-bottom:10px; }',
    '.adv-kpi-grid { display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px; }',
    '.adv-kpi-card { border:1px solid var(--color-border,#e0e8f0);border-radius:6px;padding:10px 12px; }',
    '.adv-kpi-label { font-size:0.68rem;text-transform:uppercase;letter-spacing:0.5px;color:var(--color-text-faint,#888);font-weight:600;margin-bottom:3px; }',
    '.adv-kpi-value { font-size:1.1rem;font-weight:700;font-family:var(--font-mono,monospace); }',
    '.adv-kpi-sub { font-size:0.68rem;color:var(--color-text-faint,#888);margin-top:2px; }',
    '.adv-struct-table { width:100%;border-collapse:collapse;font-size:0.8rem;margin-bottom:8px; }',
    '.adv-struct-table th { background:#f0f4f8;color:#444;padding:5px 8px;text-align:left;font-size:0.72rem;font-weight:600; }',
    '.adv-struct-table td { padding:5px 8px;border-bottom:1px solid #e8eef4; }',
    '.adv-struct-table td.num { font-family:var(--font-mono,monospace);text-align:right; }',
    '.adv-disclaimer { font-size:0.68rem;color:var(--color-text-faint,#888);line-height:1.5;margin-top:6px; }',
    '.dscr-badge { display:inline-block;padding:1px 7px;border-radius:3px;font-size:0.72rem;font-weight:700; }',
    '.dscr-good { background:#e8f5ea;color:#1a5c2a; }',
    '.dscr-warn { background:#fff4e0;color:#7a3e00; }',
    '.dscr-bad  { background:#fde8e8;color:#8b0000; }',
  ].join('\n');

  var dscrHtml = '—';
  if (dscr !== null && !isNaN(dscr)) {
    var dscrClass = dscr >= 1.25 ? 'dscr-good' : (dscr >= 1.0 ? 'dscr-warn' : 'dscr-bad');
    dscrHtml = '<span class="dscr-badge ' + dscrClass + '">' + dscr.toFixed(2) + 'x</span>';
    if (currentMode === 'sale') {
      dscrHtml += ' <span style="font-size:0.68rem;color:#aaa">(rent mode only)</span>';
    }
  }

  var cashFlowsNote = 'CF: [' +
    cashFlows.slice(0, 3).map(function(v){ return _fmt$(Math.round(v)); }).join(', ') +
    ' … ' + _fmt$(Math.round(cashFlows[cashFlows.length - 2])) + ', 0]';

  return '<style>' + css + '</style>' +
    '<div class="adv-metrics">' +
    '<div class="adv-metrics-title">Advanced Financial Metrics</div>' +

    '<div class="adv-kpi-grid">' +

    '<div class="adv-kpi-card">' +
    '<div class="adv-kpi-label">IRR (Annualized)</div>' +
    '<div class="adv-kpi-value" style="color:' + irrColor + '">' + (!isNaN(irrPct) ? _fmtPct(irrPct) : '—') + '</div>' +
    '<div class="adv-kpi-sub">Monthly NR solve · 20 periods</div>' +
    '</div>' +

    '<div class="adv-kpi-card">' +
    '<div class="adv-kpi-label">NPV @ 8% Discount</div>' +
    '<div class="adv-kpi-value" style="color:' + npvColor + '">' + (!isNaN(npv) ? _fmt$(Math.round(npv)) : '—') + '</div>' +
    '<div class="adv-kpi-sub">Monthly discount rate: 0.667%</div>' +
    '</div>' +

    '<div class="adv-kpi-card">' +
    '<div class="adv-kpi-label">Equity Multiple</div>' +
    '<div class="adv-kpi-value" style="color:' + multColor + '">' + (!isNaN(equityMult) ? _fmtX(equityMult) : '—') + '</div>' +
    '<div class="adv-kpi-sub">Total return ÷ equity in</div>' +
    '</div>' +

    '<div class="adv-kpi-card">' +
    '<div class="adv-kpi-label">Est. Net ' + (currentMode === 'rent' ? 'Value Gain' : 'Profit') + '</div>' +
    '<div class="adv-kpi-value" style="color:' + (netProfit >= 0 ? 'var(--color-success,#2e7041)' : '#c00') + '">' + _fmt$(netProfit) + '</div>' +
    '<div class="adv-kpi-sub">' + (currentMode === 'rent' ? 'Income Value − TDC (mid)' : 'Sale Revenue − TDC (mid)') + '</div>' +
    '</div>' +

    '</div>' +

    '<table class="adv-struct-table">' +
    '<thead><tr><th>Capital Structure</th><th style="text-align:right">Amount</th></tr></thead>' +
    '<tbody>' +
    '<tr><td>Total Development Cost (mid)</td><td class="num">' + _fmt$(tdc) + '</td></tr>' +
    '<tr><td>Equity In (30% of TDC)</td><td class="num">' + _fmt$(equity) + '</td></tr>' +
    '<tr><td>Loan Amount (70% of TDC)</td><td class="num">' + _fmt$(loanAmount) + '</td></tr>' +
    '<tr><td>Monthly Debt Service (8.5%, 20yr)</td><td class="num">' + _fmt$(Math.round(monthlyDS)) + '/mo</td></tr>' +
    '<tr><td>Annual Debt Service</td><td class="num">' + _fmt$(Math.round(annualDS)) + '/yr</td></tr>' +
    (currentMode === 'rent'
      ? '<tr><td>Net Operating Income (NOI, mid)</td><td class="num">' + _fmt$(noi) + '/yr</td></tr>'
      : '') +
    '<tr><td>DSCR (NOI ÷ Annual DS)</td><td class="num">' + dscrHtml + '</td></tr>' +
    '</tbody>' +
    '</table>' +

    '<div class="adv-disclaimer">' +
    'IRR / NPV modeled over 20 monthly periods (18-mo construction + exit at month 19). ' +
    'Equity CF assumes 30% in at close, zero equity draws during construction (debt-funded), exit proceeds net of loan repayment. ' +
    cashFlowsNote + '. ' +
    'Debt service assumes perm loan at 8.5% / 20yr amortization. DSCR meaningful only in Hold &amp; Rent mode with NOI &gt; 0. ' +
    'Not investment advice.' +
    '</div>' +

    '</div>';
}

// ── Export ────────────────────────────────────────────────────

window.AdvancedProForma = {
  calcIRR:                calcIRR,
  calcNPV:                calcNPV,
  calcEquityMultiple:     calcEquityMultiple,
  renderSensitivityPanel: renderSensitivityPanel,
  renderAdvancedMetrics:  renderAdvancedMetrics,
  // Internal helpers exposed for testing
  _buildDevCashFlows:         _buildDevCashFlows,
  _calcMonthlyDebtService:    _calcMonthlyDebtService,
};
