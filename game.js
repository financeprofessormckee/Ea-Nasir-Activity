/* ============================================================
   Ea-Nasir: The Copper Merchant — Game Logic
   ============================================================ */

// ── Configuration ────────────────────────────────────────────

/*
  Reputation and formal institutions are SUBSTITUTES for contract enforcement.

  Weak institutions (Ancient Bazaar):
    - Reputation spreads fast (2x multiplier). Your rep IS the enforcement mechanism.
    - Each defect can dramatically erode your standing.
    - Lawsuits are rare but possible; reputational collapse is the main risk.

  Strong institutions (Modern Corporate):
    - Reputation moves slowly (0.5x). Courts enforce contracts regardless of rep.
    - Rep erosion is mild; formal legal consequences are severe.
*/

const INSTITUTIONS = {
  weak: {
    name: "Ancient Bazaar",
    refundRange:      [20, 45],
    lawsuitCostRange: [30, 70],
    lawsuitProb:      { high: 0.005, medium: 0.015, low: 0.03 },
    repSpeedMult:     2.0,
    repDropBase:      15,
    repGainBase:      5,
    complaintMult:    { high: 0.8, medium: 1.0, low: 1.5 },
    revenueBase:      100,
    revenueLowRep:    75,
  },
  strong: {
    name: "Modern Corporate",
    refundRange:      [25, 55],
    lawsuitCostRange: [150, 250],
    lawsuitProb:      { high: 0.02, medium: 0.10, low: 0.20 },
    repSpeedMult:     0.5,
    repDropBase:      8,
    repGainBase:      3,
    complaintMult:    { high: 0.9, medium: 1.0, low: 1.2 },
    revenueBase:      100,
    revenueLowRep:    90,
  }
};

const QA_OPTIONS = {
  none:   { label: "No QA",     cost: 0,  defectProb: 0.40 },
  basic:  { label: "Basic QA",  cost: 10, defectProb: 0.20 },
  strict: { label: "Strict QA", cost: 25, defectProb: 0.05 },
};

const TOTAL_ROUNDS   = 10;
const STARTING_SILVER = 200;
const STARTING_REP    = 70;

const FLAVOR_TEXTS = [
  "A temple contractor in the city of Nippur requires copper ingots for sacred vessels. The priests have high standards and long memories.",
  "A wealthy merchant guild needs copper sheets for trade caravans heading south to the Gulf ports.",
  "The palace administrator has placed an urgent order. They need copper fittings for the city gates — immediately.",
  "A shipbuilder in the harbor district requires copper for new vessel fittings. He inspects every piece himself.",
  "A bronze-smith of some renown has commissioned a large batch of ingots. He is known for turning away inferior work.",
  "A group of traveling merchants offers a substantial contract. They have heard of you and are watching carefully.",
  "A prominent temple is expanding and needs copper for statuary. The head priest is exacting and well-connected.",
  "A new buyer approaches — referred by a past client. Your reputation has reached them before you have.",
  "The city's chief administrator has commissioned copper writing instruments for the royal archive. Prestige work.",
  "A grand merchant house places their final order of the season. They will remember how this partnership ends.",
];

const PERSONALITY_LABELS = {
  maximizer: "Short-Term Maximizer",
  builder:   "Reputation Builder",
  minimizer: "Risk Minimizer",
};

// ── State ─────────────────────────────────────────────────────

let state = {};

// ── Utilities ─────────────────────────────────────────────────

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRepTier(rep) {
  if (rep > 80) return 'high';
  if (rep >= 40) return 'medium';
  return 'low';
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// ── Game flow ──────────────────────────────────────────────────

function startGame() {
  const instEl = document.querySelector('#institution-selector .option-card.selected');
  const persEl = document.querySelector('#personality-selector .option-card.selected');

  state = {
    silver:              STARTING_SILVER,
    reputation:          STARTING_REP,
    round:               1,
    lawsuits:            0,
    defectiveShipments:  0,
    history:             [],
    institutions:        instEl ? instEl.dataset.value : 'weak',
    personalityType:     persEl ? persEl.dataset.value : null,
    selectedQA:          'basic',
  };

  renderRoundScreen();
  showScreen('screen-round');
}

function sendShipment() {
  const selected = document.querySelector('#qa-selector .option-card.selected');
  const qaKey = selected ? selected.dataset.value : 'basic';
  state.selectedQA = qaKey;

  const record = resolveRound(qaKey);
  renderOutcomeScreen(record);
  showScreen('screen-outcome');
}

function nextRound() {
  if (state.round >= TOTAL_ROUNDS) {
    renderDebriefScreen();
    showScreen('screen-debrief');
  } else {
    state.round++;
    renderRoundScreen();
    showScreen('screen-round');
  }
}

function resetGame() {
  // Clear personality selection (it's optional, so reset to none)
  document.querySelectorAll('#personality-selector .option-card')
    .forEach(c => c.classList.remove('selected'));
  // Reset institution to default
  selectOption('institution-selector', 'weak');
  showScreen('screen-setup');
}

// ── Round resolution ───────────────────────────────────────────

function resolveRound(qaKey) {
  const cfg = INSTITUTIONS[state.institutions];
  const qa  = QA_OPTIONS[qaKey];
  const repTier = getRepTier(state.reputation);

  // Revenue is reduced if reputation is in the low tier
  const revenue        = repTier === 'low' ? cfg.revenueLowRep : cfg.revenueBase;
  const revenuePenalty = cfg.revenueBase - revenue;

  // The defect roll is stored so the counterfactual can replay with same luck
  const defectRoll  = Math.random();
  const isDefective = defectRoll < qa.defectProb;

  let refund      = 0;
  let repChange   = 0;
  let lawsuitCost = 0;
  let lawsuitFiled = false;

  if (isDefective) {
    // Refund to buyer
    refund = randInt(cfg.refundRange[0], cfg.refundRange[1]);

    // Reputation drop: base × institution speed × complaint multiplier for current tier
    const mult = cfg.complaintMult[repTier];
    repChange = -Math.round(cfg.repDropBase * cfg.repSpeedMult * mult);

    // Lawsuit check
    if (Math.random() < cfg.lawsuitProb[repTier]) {
      lawsuitFiled = true;
      lawsuitCost  = randInt(cfg.lawsuitCostRange[0], cfg.lawsuitCostRange[1]);
      state.lawsuits++;
    }

    state.defectiveShipments++;
  } else {
    // Good shipment: reputation improves
    repChange = Math.round(cfg.repGainBase * cfg.repSpeedMult);
  }

  const roundProfit = revenue - qa.cost - refund - lawsuitCost;

  // Save before updating state
  const repBefore    = state.reputation;
  const silverBefore = state.silver;

  state.silver     += roundProfit;
  state.reputation  = clamp(state.reputation + repChange, 0, 100);

  const record = {
    round:          state.round,
    qaKey,
    defectRoll,     // stored for counterfactual replay
    isDefective,
    revenue,
    revenuePenalty,
    qaCost:         qa.cost,
    refund,
    lawsuitCost,
    lawsuitFiled,
    repChange,
    repBefore,
    repAfter:       state.reputation,
    silverBefore,
    silverAfter:    state.silver,
    roundProfit,
  };

  state.history.push(record);
  return record;
}

// ── Counterfactual ─────────────────────────────────────────────

/*
  Replay the full game substituting Basic QA at every round.
  Uses the same defect rolls (same luck), only the QA decision changes.
  Refunds for counterfactual defects use the midpoint of the refund range
  to give a fair expected-value comparison.
*/
function computeCounterfactual() {
  const cfg   = INSTITUTIONS[state.institutions];
  const cfQA  = QA_OPTIONS.basic;
  const cfRefund = Math.round((cfg.refundRange[0] + cfg.refundRange[1]) / 2);

  let cfSilver = STARTING_SILVER;
  let cfRep    = STARTING_REP;

  for (const rec of state.history) {
    const cfRepTier   = getRepTier(cfRep);
    const cfRevenue   = cfRepTier === 'low' ? cfg.revenueLowRep : cfg.revenueBase;
    const cfDefective = rec.defectRoll < cfQA.defectProb;

    let cfRepChange = 0;
    let cfLoss      = 0;

    if (cfDefective) {
      cfLoss = cfRefund;  // no lawsuits in counterfactual (expected value view)
      const mult = cfg.complaintMult[cfRepTier];
      cfRepChange = -Math.round(cfg.repDropBase * cfg.repSpeedMult * mult);
    } else {
      cfRepChange = Math.round(cfg.repGainBase * cfg.repSpeedMult);
    }

    cfSilver += cfRevenue - cfQA.cost - cfLoss;
    cfRep     = clamp(cfRep + cfRepChange, 0, 100);
  }

  return { silver: cfSilver, reputation: cfRep };
}

// ── Screen renderers ───────────────────────────────────────────

function renderRoundScreen() {
  const cfg     = INSTITUTIONS[state.institutions];
  const repTier = getRepTier(state.reputation);

  setText('round-num',  state.round);
  setText('inst-badge', cfg.name);
  setText('stat-silver', state.silver);
  setText('stat-rep',    state.reputation);

  const riskEl    = document.getElementById('stat-risk');
  const riskLabel = { high: 'Low', medium: 'Medium', low: 'High' };
  // Note: repTier 'high' = Low legal risk; repTier 'low' = High legal risk
  riskEl.textContent = riskLabel[repTier];
  riskEl.className   = 'stat-value risk-badge risk-' + { high: 'low', medium: 'medium', low: 'high' }[repTier];

  setText('flavor-text', FLAVOR_TEXTS[state.round - 1]);

  document.getElementById('progress-fill').style.width =
    ((state.round - 1) / TOTAL_ROUNDS * 100) + '%';

  // Restore or default the QA selection
  selectOption('qa-selector', state.selectedQA || 'basic');

  // Sparkline shows after at least one round
  const sparkWrap = document.getElementById('sparkline-wrap-round');
  if (state.history.length > 0) {
    sparkWrap.classList.remove('hidden');
    renderSparkline('sparkline-round', state.history.map(r => r.roundProfit), -1);
  } else {
    sparkWrap.classList.add('hidden');
  }
}

function renderOutcomeScreen(rec) {
  setText('outcome-round', rec.round);

  // Banner
  const banner  = document.getElementById('outcome-banner');
  const iconEl  = document.getElementById('outcome-icon');
  const titleEl = document.getElementById('outcome-title');
  const subEl   = document.getElementById('outcome-sub');

  if (rec.isDefective) {
    banner.className  = 'outcome-banner outcome-bad';
    iconEl.textContent  = '✗';
    titleEl.textContent = 'Defective Shipment!';
    subEl.textContent   = rec.lawsuitFiled
      ? 'The buyer is furious. They are taking you to court.'
      : 'The buyer demands a full refund. Word will spread.';
  } else {
    banner.className  = 'outcome-banner outcome-good';
    iconEl.textContent  = '✓';
    titleEl.textContent = 'Good Shipment';
    subEl.textContent   = 'The buyer accepts the copper. Your standing improves.';
  }

  // Ledger rows
  setLedgerCell('ld-revenue', '+' + rec.revenue + ' ◆', 'positive');

  setRowVisible('ld-rev-penalty-row', rec.revenuePenalty > 0);
  if (rec.revenuePenalty > 0)
    setLedgerCell('ld-rev-penalty', '−' + rec.revenuePenalty + ' ◆', 'negative');

  setLedgerCell('ld-qa-cost',
    rec.qaCost > 0 ? '−' + rec.qaCost + ' ◆' : '0 ◆',
    rec.qaCost > 0 ? 'negative' : '');

  setRowVisible('ld-refund-row', rec.refund > 0);
  if (rec.refund > 0)
    setLedgerCell('ld-refund', '−' + rec.refund + ' ◆', 'negative');

  setRowVisible('ld-lawsuit-row', rec.lawsuitCost > 0);
  if (rec.lawsuitCost > 0)
    setLedgerCell('ld-lawsuit', '−' + rec.lawsuitCost + ' ◆', 'negative');

  const totalEl = document.getElementById('ld-total');
  totalEl.textContent = (rec.roundProfit >= 0 ? '+' : '') + rec.roundProfit + ' ◆';
  totalEl.className   = rec.roundProfit >= 0 ? 'positive' : 'negative';

  // Reputation meter
  setText('rep-before', rec.repBefore);
  setText('rep-after',  rec.repAfter);

  const deltaEl = document.getElementById('rep-delta');
  deltaEl.textContent = (rec.repChange >= 0 ? '(+' : '(') + rec.repChange + ')';
  deltaEl.className   = 'rep-delta ' + (rec.repChange >= 0 ? 'positive' : 'negative');

  const repBar    = document.getElementById('rep-bar');
  const afterTier = getRepTier(rec.repAfter);
  repBar.style.width = rec.repAfter + '%';
  repBar.className   = 'rep-bar-fill rep-bar-' + afterTier;

  // Lawsuit alert
  const lawsuitBox = document.getElementById('lawsuit-box');
  if (rec.lawsuitFiled) {
    lawsuitBox.classList.remove('hidden');
    setText('lawsuit-desc',
      'A settlement of ' + rec.lawsuitCost + ' silver has been demanded.');
  } else {
    lawsuitBox.classList.add('hidden');
  }

  // Sparkline — highlight the current round's bar
  renderSparkline('sparkline-outcome', state.history.map(r => r.roundProfit), state.history.length - 1);

  // Next button label
  document.getElementById('btn-next').textContent =
    state.round >= TOTAL_ROUNDS ? 'View Final Ledger →' : 'Next Round →';
}

function renderDebriefScreen() {
  const cfg = INSTITUTIONS[state.institutions];
  setText('debrief-inst-name', cfg.name);

  // Final stats
  const silverEl = document.getElementById('db-silver');
  silverEl.textContent = state.silver + ' ◆';
  silverEl.className   = 'final-stat-value ' + (state.silver >= STARTING_SILVER ? 'positive' : 'negative');

  const repEl = document.getElementById('db-rep');
  repEl.textContent = state.reputation;
  repEl.className   = 'final-stat-value rep-bar-' + getRepTier(state.reputation);

  setText('db-defects',  state.defectiveShipments + ' / ' + TOTAL_ROUNDS);
  setText('db-lawsuits', state.lawsuits);

  // Sparkline (no highlight)
  renderSparkline('sparkline-debrief', state.history.map(r => r.roundProfit), -1);

  // Counterfactual
  const cf   = computeCounterfactual();
  const diff = cf.silver - state.silver;
  const cfEl = document.getElementById('db-counterfactual');
  let cfMessage;
  if (diff > 10) {
    cfMessage = `Basic QA would have earned you <strong>${diff} more silver</strong>. The higher upfront cost was more than offset by avoided refunds and reputation losses.`;
  } else if (diff < -10) {
    cfMessage = `Your choices earned you <strong>${Math.abs(diff)} more silver</strong> than Basic QA would have. You got away with it — but consider: was the variance worth the risk?`;
  } else {
    cfMessage = `Your choices and Basic QA produced nearly identical results (<strong>${diff >= 0 ? '+' : ''}${diff} silver</strong>). The QA level had similar expected value — but not necessarily similar risk.`;
  }
  cfEl.innerHTML =
    `<p>With Basic QA every round, you would have ended with <strong>${cf.silver} ◆</strong> ` +
    `(you ended with <strong>${state.silver} ◆</strong>).</p>` +
    `<p>${cfMessage}</p>`;

  // Volatility
  const profits = state.history.map(r => r.roundProfit);
  const mean    = profits.reduce((a, b) => a + b, 0) / profits.length;
  const stdDev  = Math.sqrt(profits.reduce((a, b) => a + (b - mean) ** 2, 0) / profits.length);
  const minP    = Math.min(...profits);
  const maxP    = Math.max(...profits);
  const volDesc = stdDev < 15 ? 'low' : stdDev < 35 ? 'moderate' : 'high';

  document.getElementById('db-volatility').innerHTML =
    `<p>Round profits ranged from <strong>${minP}</strong> to <strong>${maxP}</strong> ◆ ` +
    `(std. deviation: ${Math.round(stdDev)}).</p>` +
    `<p>This is <strong>${volDesc} volatility</strong>. ` +
    { low:      'Your conservative choices produced consistent, predictable profits.',
      moderate: 'Your profits varied meaningfully — some good rounds, some bad.',
      high:     'Large swings indicate high tail risk. A single bad round can undo several good ones.' }[volDesc] +
    `</p>`;

  // Personality consistency
  const persSection = document.getElementById('db-personality-section');
  if (state.personalityType) {
    persSection.classList.remove('hidden');
    const qaCounts = { none: 0, basic: 0, strict: 0 };
    state.history.forEach(r => qaCounts[r.qaKey]++);
    const typeName = PERSONALITY_LABELS[state.personalityType];
    let assessment;

    if (state.personalityType === 'maximizer') {
      const n = qaCounts.none;
      assessment = n >= 6
        ? `Consistent. You chose No QA in ${n}/10 rounds — staying true to short-term profit maximization.`
        : n <= 2
        ? `You identified as a Short-Term Maximizer but chose No QA only ${n} times. Your actual behavior was more cautious than your stated type.`
        : `Mixed. You chose No QA ${n}/10 rounds — balancing profit with some risk awareness.`;
    } else if (state.personalityType === 'builder') {
      const n = qaCounts.basic + qaCounts.strict;
      assessment = n >= 8
        ? `Consistent. You invested in QA in ${n}/10 rounds — building your reputation steadily.`
        : n <= 4
        ? `You identified as a Reputation Builder but skipped QA in ${TOTAL_ROUNDS - n} rounds. Your choices didn't match your stated goal.`
        : `Partially consistent. You chose higher QA in ${n}/10 rounds.`;
    } else { // minimizer
      const n = qaCounts.strict;
      assessment = n >= 7
        ? `Consistent. Strict QA in ${n}/10 rounds shows genuine, systematic risk aversion.`
        : n <= 2
        ? `You identified as a Risk Minimizer but chose Strict QA only ${n} times. Your choices carried more risk than your stated type.`
        : `Mixed consistency. Strict QA in ${n}/10 rounds — some risk aversion, but not systematic.`;
    }

    document.getElementById('db-personality').innerHTML =
      `<p>You identified as a <strong>${typeName}</strong>.</p><p>${assessment}</p>`;
  } else {
    persSection.classList.add('hidden');
  }

  // Insights
  const lines = [];

  if (state.defectiveShipments >= 4 && state.institutions === 'weak') {
    lines.push('In a weak-institution market, reputation erosion is self-reinforcing: each defect raises the cost of the next one. There is no legal backstop — your reputation <em>is</em> the enforcement mechanism.');
  }
  if (state.lawsuits >= 2 && state.institutions === 'strong') {
    lines.push('In a strong-institution market, formal legal risk is the primary cost of corner-cutting — not reputation. Courts enforce contracts regardless of how you are perceived.');
  }
  if (state.reputation < 40) {
    lines.push('Your reputation fell below the critical threshold (40), reducing your revenue per shipment. Reputation is productive capital, not just a score: it directly affects your cash flows.');
  }
  if (state.defectiveShipments === 0) {
    lines.push('Zero defects: rigorous QA eliminated tail risk — but at a cost. Compare your outcome to the counterfactual: was the added insurance worth it?');
  }
  if (state.lawsuits === 0 && state.defectiveShipments >= 3 && state.institutions === 'strong') {
    lines.push('You got defects but no lawsuits — you were lucky. Under strong institutions, the lawsuit probability per defect is real; a larger sample would likely include at least one.');
  }

  // Always include at least one structural insight
  if (lines.length === 0) {
    lines.push('QA is risk management: it reduces variance, not just expected cost. Strict QA does not just save money on average — it prevents catastrophic tail outcomes.');
  }

  lines.push(
    state.institutions === 'weak'
      ? 'Under weak institutions, reputation and formal contracts are <em>substitutes</em>. Where courts cannot enforce agreements, reputation networks do the job — but only if you protect them.'
      : 'Under strong institutions, formal contracts substitute for reputation. Courts limit the damage from a bad deal — but they are expensive when invoked.'
  );

  document.getElementById('db-insights').innerHTML =
    lines.map(l => `<p style="margin-bottom:8px">• ${l}</p>`).join('');
}

// ── Sparkline renderer ─────────────────────────────────────────

function renderSparkline(containerId, profits, highlightIndex) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  if (profits.length === 0) {
    // Show placeholder bars while no history yet
    for (let i = 0; i < TOTAL_ROUNDS; i++) {
      const bar = document.createElement('div');
      bar.className = 'spark-placeholder';
      container.appendChild(bar);
    }
    return;
  }

  const maxAbs      = Math.max(...profits.map(Math.abs), 1);
  const maxBarHeight = 48; // px

  profits.forEach((profit, i) => {
    const bar    = document.createElement('div');
    bar.className = 'spark-bar ' + (profit >= 0 ? 'positive' : 'negative');
    if (i === highlightIndex) bar.classList.add('current');
    bar.style.height = Math.max(4, Math.round(Math.abs(profit) / maxAbs * maxBarHeight)) + 'px';
    bar.title        = 'Round ' + (i + 1) + ': ' + (profit >= 0 ? '+' : '') + profit + ' ◆';
    container.appendChild(bar);
  });
}

// ── DOM helpers ───────────────────────────────────────────────

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setLedgerCell(id, text, className) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className   = className || '';
}

function setRowVisible(rowId, visible) {
  const row = document.getElementById(rowId);
  if (row) row.style.display = visible ? '' : 'none';
}

function selectOption(selectorId, value) {
  const container = document.getElementById(selectorId);
  if (!container) return;
  container.querySelectorAll('.option-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.value === value);
  });
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) target.classList.add('active');
  window.scrollTo(0, 0);
}
