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

function getExpectedRevenue() {
  const cfg = INSTITUTIONS[state.institutions];
  return getRepTier(state.reputation) === 'low' ? cfg.revenueLowRep : cfg.revenueBase;
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

// ── Counterfactual replay ──────────────────────────────────────

/*
  Replay the full game substituting a fixed QA choice at every round.
  Uses the same defect rolls captured in state.history (same luck).
  Refund and lawsuit costs use the midpoint of their ranges so each
  pure strategy is evaluated on its expected loss, not on fresh dice.
*/
function replayWithFixedQA(qaKey) {
  const cfg     = INSTITUTIONS[state.institutions];
  const qa      = QA_OPTIONS[qaKey];
  const refund  = Math.round((cfg.refundRange[0] + cfg.refundRange[1]) / 2);
  const lawsuit = Math.round((cfg.lawsuitCostRange[0] + cfg.lawsuitCostRange[1]) / 2);

  let silver = STARTING_SILVER;
  let rep    = STARTING_REP;

  for (const rec of state.history) {
    const tier      = getRepTier(rep);
    const revenue   = tier === 'low' ? cfg.revenueLowRep : cfg.revenueBase;
    const defective = rec.defectRoll < qa.defectProb;

    let repChange = 0;
    let loss      = 0;

    if (defective) {
      // expected loss: refund + P(lawsuit) * lawsuit-cost
      loss = refund + cfg.lawsuitProb[tier] * lawsuit;
      const mult = cfg.complaintMult[tier];
      repChange = -Math.round(cfg.repDropBase * cfg.repSpeedMult * mult);
    } else {
      repChange = Math.round(cfg.repGainBase * cfg.repSpeedMult);
    }

    silver += revenue - qa.cost - loss;
    rep     = clamp(rep + repChange, 0, 100);
  }

  return { silver: Math.round(silver), reputation: Math.round(rep) };
}

function computeStrategyComparison() {
  return {
    none:   replayWithFixedQA('none'),
    basic:  replayWithFixedQA('basic'),
    strict: replayWithFixedQA('strict'),
    actual: { silver: state.silver, reputation: state.reputation },
  };
}

// ── Strategy classification ───────────────────────────────────

/*
  Best pure strategy by expected value, computed offline via Monte
  Carlo over each institution's parameters. See plan verification
  step. These are constants in shipped code, not runtime simulation.
*/
const EX_ANTE_OPTIMAL = { weak: 'basic', strong: 'basic' };

function classifyRevealedStrategy() {
  const counts = { none: 0, basic: 0, strict: 0 };
  state.history.forEach(r => counts[r.qaKey]++);

  let dominant = 'basic';
  let max = -1;
  for (const k of ['none', 'basic', 'strict']) {
    if (counts[k] > max) { max = counts[k]; dominant = k; }
  }
  // call it "mixed" if the dominant choice is less than half the rounds
  if (max < TOTAL_ROUNDS / 2) dominant = 'mixed';

  const weights = { none: 0, basic: 1, strict: 2 };
  const cautionIndex =
    state.history.reduce((s, r) => s + weights[r.qaKey], 0) / state.history.length;

  // Adaptive: did QA strictly increase after at least one defect round?
  let adaptive = false;
  for (let i = 1; i < state.history.length; i++) {
    if (state.history[i - 1].isDefective &&
        weights[state.history[i].qaKey] > weights[state.history[i - 1].qaKey]) {
      adaptive = true;
      break;
    }
  }

  // Static: same QA every round
  const isStatic = new Set(state.history.map(r => r.qaKey)).size === 1;

  const exAnteOptimal = (dominant !== 'mixed') &&
                        dominant === EX_ANTE_OPTIMAL[state.institutions];

  // Stated-vs-revealed: rough mapping from stated personality to expected dominant choice
  const personalityExpected = {
    maximizer: 'none',
    builder:   'basic',  // builders invest in QA but not necessarily strict
    minimizer: 'strict',
  };
  const statedRevealedGap = state.personalityType &&
    dominant !== 'mixed' &&
    personalityExpected[state.personalityType] !== dominant;

  return { counts, dominant, cautionIndex, adaptive, isStatic, exAnteOptimal, statedRevealedGap };
}

// ── Expected-value (skill vs luck) ────────────────────────────

/*
  Walk the student's actual QA choices and compute the expected
  per-round profit using midpoint refunds and lawsuit-cost expectations.
  This is the ex-ante value of the strategy the student played.
*/
function computeExpectedValue() {
  const cfg     = INSTITUTIONS[state.institutions];
  const refund  = (cfg.refundRange[0] + cfg.refundRange[1]) / 2;
  const lawsuit = (cfg.lawsuitCostRange[0] + cfg.lawsuitCostRange[1]) / 2;

  let silver = STARTING_SILVER;
  let rep    = STARTING_REP;

  for (const rec of state.history) {
    const tier    = getRepTier(rep);
    const revenue = tier === 'low' ? cfg.revenueLowRep : cfg.revenueBase;
    const qa      = QA_OPTIONS[rec.qaKey];

    const expectedLoss = qa.defectProb * (refund + cfg.lawsuitProb[tier] * lawsuit);
    const expectedRepChange =
      qa.defectProb * (-cfg.repDropBase * cfg.repSpeedMult * cfg.complaintMult[tier]) +
      (1 - qa.defectProb) * (cfg.repGainBase * cfg.repSpeedMult);

    silver += revenue - qa.cost - expectedLoss;
    rep     = clamp(rep + expectedRepChange, 0, 100);
  }

  return Math.round(silver);
}

// ── Lesson selector ───────────────────────────────────────────

const LESSON_LIBRARY = {
  deathSpiral: {
    title: 'Reputational death spiral',
    body:  'In a weak-institution market your reputation <em>is</em> the enforcement mechanism. Every defect raises the cost of the next defect — the complaint multiplier compounds, revenue falls, and there is no court to limit the damage. This is what a reputation cascade looks like in real time.',
  },
  luckyWeak: {
    title: 'You got lucky in a regime that punishes the unlucky',
    body:  'You skipped QA in a market with no legal backstop and avoided a reputation collapse — this round. Reputation networks have heavy left-tail risk; one bad streak is usually enough to break the cycle. A 10-round sample understates how often the cascade fires.',
  },
  reputationAsCapital: {
    title: 'Reputation as productive capital',
    body:  'Under weak institutions, QA spending is not just insurance — it is investment in a productive asset. Your high-reputation revenue stayed at full strength, and that flow of payments is what the QA cost was buying. Treat reputation as a balance-sheet item, not a vibe.',
  },
  overInsurance: {
    title: 'Over-insurance under formal contracts',
    body:  'Strict QA in a strong-institution market is often dominated. Courts already cap your downside through enforceable refunds and damages, so paying 25 silver per round to push defect probability from 20% to 5% is double-paying for protection you partly already had. Check the strategy comparison: Basic QA likely beat your strategy on expected value.',
  },
  luckyBinary: {
    title: 'You drew the lucky side of a binary risk',
    body:  'Lawsuits in this regime are rare-but-large events. With ten rounds and a low per-round probability, most playthroughs of your strategy would draw zero lawsuits — but the few that do can wipe out a season. Expected value is the right lens, not the realized outcome.',
  },
  formalLiability: {
    title: 'Formal liability is the binding constraint',
    body:  'Reputation moved slowly here, but the courts did not. A single lawsuit landed the kind of blow that, in the weak-institution market, would have taken a string of bad shipments to inflict. Under strong institutions, formal liability — not reputation — is the dominant cost of corner-cutting.',
  },
  bayesian: {
    title: 'Bayesian updating in practice',
    body:  'You raised your QA after observing a defect — exactly what a rational agent does when new information arrives. Whether or not the realized outcome was favorable, the <em>policy</em> of conditioning future choices on observed signals is the right one. Most students in this game play a fixed rule for ten rounds.',
  },
  staticStrategy: {
    title: 'A strategy without state-dependence',
    body:  'You played one rule for ten rounds — your QA never changed in response to defects, lawsuits, or reputation movements. That is fine if the rule was right for the regime; it is expensive if it was not. Compare your strategy to the comparison table above.',
  },
  statedVsRevealed: {
    title: 'Stated vs. revealed preferences',
    body:  'You called yourself a {stated}, but your choices look more like a {revealed} player. The gap between what people say they value and what they actually choose under stakes is one of the oldest results in behavioral economics. The choices, not the labels, are the data.',
  },
  internalized: {
    title: 'You internalized the regime\'s incentives',
    body:  'Your dominant strategy was the expected-value-best pure strategy for {institution}. Whether you finished ahead or behind on this run was luck stacked on top of a sound choice. Replay the same strategy enough times and the average will reflect that soundness.',
  },
  wrongRegime: {
    title: 'A dominated pure strategy',
    body:  'Your dominant choice of {dominant} was beaten in expectation by Basic QA in {institution}. Basic QA cuts defect probability in half (40% → 20%) for only 10 silver per round; pushing it further to 5% costs another 15 silver per round and is rarely worth it on its own. Strict QA earns its keep mainly when used <em>adaptively</em> — escalated after a bad signal — not as a flat rule.',
  },
};

function selectKeyLesson(cls, comparison) {
  const inst = state.institutions;
  const lowCaution  = cls.cautionIndex < 0.7;
  const highCaution = cls.cautionIndex > 1.3;
  const repCollapsed = state.reputation < 40 ||
                       state.history.some(r => r.repAfter < 40);
  const profitable   = state.silver >= STARTING_SILVER;
  const beatBasicCF  = state.silver >= comparison.basic.silver;

  // Adaptive behavior is more diagnostic than the level of caution,
  // so it preempts the static high-caution lessons.
  if (cls.adaptive) return 'bayesian';

  // Layer A — institution × strategy × outcome (most specific)
  if (inst === 'weak'   && lowCaution  && repCollapsed)            return 'deathSpiral';
  if (inst === 'weak'   && lowCaution  && !repCollapsed)           return 'luckyWeak';
  if (inst === 'weak'   && highCaution && profitable)              return 'reputationAsCapital';
  if (inst === 'strong' && highCaution)                            return 'overInsurance';
  if (inst === 'strong' && lowCaution  && state.lawsuits === 0)    return 'luckyBinary';
  if (inst === 'strong' && lowCaution  && state.lawsuits >  0)     return 'formalLiability';

  // Layer B — static behavior (adaptive already handled above)
  if (cls.isStatic) return 'staticStrategy';

  // Layer C — stated vs revealed preferences
  if (cls.statedRevealedGap) return 'statedVsRevealed';

  // Layer D — regime fit (always fires)
  return cls.exAnteOptimal ? 'internalized' : 'wrongRegime';
}

// ── Screen renderers ───────────────────────────────────────────

function renderRoundScreen() {
  const cfg     = INSTITUTIONS[state.institutions];
  const repTier = getRepTier(state.reputation);

  setText('round-num',  state.round);
  setText('inst-badge', cfg.name);
  setText('stat-silver', state.silver + ' ◆');
  setText('stat-rep',    state.reputation);

  const riskEl    = document.getElementById('stat-risk');
  const riskLabel = { high: 'Low', medium: 'Medium', low: 'High' };
  // Note: repTier 'high' = Low legal risk; repTier 'low' = High legal risk
  riskEl.textContent = riskLabel[repTier];
  riskEl.className   = 'stat-value risk-badge risk-' + { high: 'low', medium: 'medium', low: 'high' }[repTier];

  setText('flavor-text', FLAVOR_TEXTS[state.round - 1]);

  document.getElementById('progress-fill').style.width =
    ((state.round - 1) / TOTAL_ROUNDS * 100) + '%';

  // Restore or default the QA selection and refresh the pre-send summary
  selectOption('qa-selector', state.selectedQA || 'basic');
  updatePreSendSummary();

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

  const cls        = classifyRevealedStrategy();
  const comparison = computeStrategyComparison();
  const expected   = computeExpectedValue();

  // ── Layer 1: Revealed strategy (descriptive) ──────────────
  renderRevealedStrategy(cls);

  // ── Layer 2: Strategy comparison table ────────────────────
  renderStrategyComparison(comparison);

  // ── Layer 3: Skill vs. luck ───────────────────────────────
  renderSkillVsLuck(expected);

  // ── Volatility (kept, tightened) ──────────────────────────
  const profits = state.history.map(r => r.roundProfit);
  const mean    = profits.reduce((a, b) => a + b, 0) / profits.length;
  const stdDev  = Math.sqrt(profits.reduce((a, b) => a + (b - mean) ** 2, 0) / profits.length);
  const minP    = Math.min(...profits);
  const maxP    = Math.max(...profits);
  const volDesc = stdDev < 15 ? 'low' : stdDev < 35 ? 'moderate' : 'high';

  document.getElementById('db-volatility').innerHTML =
    `<p>Round-to-round profits ranged from <strong>${minP}</strong> to <strong>${maxP}</strong> ◆ ` +
    `(std. deviation: <strong>${Math.round(stdDev)}</strong>) — <strong>${volDesc} volatility</strong>.</p>` +
    `<p>${ { low:      'A flat profile means your downside was contained, but you may have left expected value on the table by over-insuring.',
             moderate: 'Some good rounds, some bad — typical of a strategy that takes calibrated risk.',
             high:     'Large swings mean a single bad round can undo several good ones. Volatility is itself a cost when refunds and lawsuits stack.' }[volDesc] }</p>`;

  // ── Personality (only if there is a real gap) ─────────────
  const persSection = document.getElementById('db-personality-section');
  if (state.personalityType && cls.statedRevealedGap) {
    persSection.classList.remove('hidden');
    const stated   = PERSONALITY_LABELS[state.personalityType];
    const revealed = revealedLabel(cls.dominant);
    document.getElementById('db-personality').innerHTML =
      `<p>You identified as a <strong>${stated}</strong>, but your choices look more like a <strong>${revealed}</strong> ` +
      `(${cls.counts.none} No QA, ${cls.counts.basic} Basic, ${cls.counts.strict} Strict). ` +
      `That gap between stated and revealed preference is itself an economic insight — choices, not labels, are the data.</p>`;
  } else if (state.personalityType) {
    persSection.classList.remove('hidden');
    const stated = PERSONALITY_LABELS[state.personalityType];
    document.getElementById('db-personality').innerHTML =
      `<p>You identified as a <strong>${stated}</strong>, and your choices were broadly consistent with that.</p>`;
  } else {
    persSection.classList.add('hidden');
  }

  // ── Layer 4: One targeted lesson ──────────────────────────
  const key = selectKeyLesson(cls, comparison);
  const lesson = LESSON_LIBRARY[key];
  const filled = lesson.body
    .replace('{stated}',      state.personalityType ? PERSONALITY_LABELS[state.personalityType] : '')
    .replace('{revealed}',    revealedLabel(cls.dominant))
    .replace('{institution}', cfg.name)
    .replace('{dominant}',    cls.dominant === 'mixed' ? 'a mixed strategy' : QA_OPTIONS[cls.dominant].label);

  document.getElementById('db-insights').innerHTML =
    `<h4 class="lesson-title">${lesson.title}</h4>` +
    `<p>${filled}</p>` +
    `<p class="lesson-coda"><em>${
      state.institutions === 'weak'
        ? 'Under weak institutions, reputation and formal contracts are substitutes. Where courts cannot enforce agreements, reputation networks do the job — if you protect them.'
        : 'Under strong institutions, formal contracts substitute for reputation. Courts limit the damage from a bad deal — but they are expensive when invoked.'
    }</em></p>`;
}

function renderRevealedStrategy(cls) {
  const el = document.getElementById('db-revealed');
  if (!el) return;
  const dominantLabel = cls.dominant === 'mixed' ? 'mixed' : QA_OPTIONS[cls.dominant].label;
  const adapt = cls.adaptive ? 'adaptive (raised QA after a defect)'
              : cls.isStatic ? 'static (same choice every round)'
              : 'varied (no clear adaptive pattern)';
  el.innerHTML =
    `<p>You played a <strong>${dominantLabel.toLowerCase()}</strong>, ${adapt} strategy. ` +
    `Caution index: <strong>${cls.cautionIndex.toFixed(2)}</strong> on a 0–2 scale ` +
    `(0 = always No QA, 2 = always Strict QA).</p>` +
    `<p>QA mix: ${cls.counts.none} No QA · ${cls.counts.basic} Basic · ${cls.counts.strict} Strict.</p>`;
}

function renderStrategyComparison(c) {
  const el = document.getElementById('db-strategy-table');
  if (!el) return;

  const rows = [
    { key: 'none',   label: 'Pure No QA',     data: c.none },
    { key: 'basic',  label: 'Pure Basic QA',  data: c.basic },
    { key: 'strict', label: 'Pure Strict QA', data: c.strict },
    { key: 'actual', label: 'Your choices',   data: c.actual },
  ];
  const bestSilver = Math.max(...rows.map(r => r.data.silver));
  const exAnte     = EX_ANTE_OPTIMAL[state.institutions];

  let html = '<table class="strategy-table"><thead><tr>' +
             '<th>Strategy</th><th>Final silver</th><th>Final reputation</th>' +
             '</tr></thead><tbody>';
  for (const r of rows) {
    const cls = [];
    if (r.key === 'actual')                    cls.push('your-row');
    if (r.data.silver === bestSilver)          cls.push('best-silver');
    if (r.key === exAnte)                      cls.push('ex-ante-optimal');
    html += `<tr class="${cls.join(' ')}">` +
            `<td>${r.label}${r.key === exAnte ? ' <span class="badge">EV-best ex-ante</span>' : ''}</td>` +
            `<td>${r.data.silver} ◆</td>` +
            `<td>${r.data.reputation}</td></tr>`;
  }
  html += '</tbody></table>';
  html += `<p class="table-note">Same defect dice across all rows — only the QA decision changes. ` +
          `“Best in this dice draw” is highlighted; the EV-best pure strategy for ${INSTITUTIONS[state.institutions].name} ` +
          `is marked with a badge. The two are not always the same in any single run.</p>`;
  el.innerHTML = html;
}

function renderSkillVsLuck(expected) {
  const el = document.getElementById('db-skill-luck');
  if (!el) return;
  const luck = state.silver - expected;
  const sign = luck >= 0 ? '+' : '';
  let frame;
  if (Math.abs(luck) < 15) {
    frame = 'Your realized result tracked your strategy\'s expected value closely — this run was a fair sample.';
  } else if (luck > 0) {
    frame = `You finished <strong>${sign}${luck}</strong> silver above the expected value of your strategy. That gap is good luck on top of your choices, not skill on top of your choices. Don\'t over-update from a single run.`;
  } else {
    frame = `You finished <strong>${luck}</strong> silver below the expected value of your strategy. That gap is bad luck on top of your choices, not a verdict on the choices themselves. Replay the same strategy enough times and the average will move toward ${expected}.`;
  }
  el.innerHTML =
    `<p>Your strategy had an expected value of <strong>${expected} ◆</strong>. ` +
    `You finished at <strong>${state.silver} ◆</strong>.</p>` +
    `<p>${frame}</p>`;
}

function revealedLabel(dominant) {
  if (dominant === 'mixed')  return 'Mixed-Strategy player';
  if (dominant === 'none')   return 'Short-Term Maximizer';
  if (dominant === 'basic')  return 'Reputation Builder';
  if (dominant === 'strict') return 'Risk Minimizer';
  return 'player';
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

function selectQAOption(value) {
  selectOption('qa-selector', value);
  updatePreSendSummary();
}

function updatePreSendSummary() {
  const selected = document.querySelector('#qa-selector .option-card.selected');
  const qaKey = selected ? selected.dataset.value : 'basic';
  const qa  = QA_OPTIONS[qaKey];
  const rev = getExpectedRevenue();
  const net = rev - qa.cost;

  document.getElementById('pre-revenue').textContent = '+' + rev + ' ◆';
  document.getElementById('pre-qa-cost').textContent = '−' + qa.cost + ' ◆';
  const netEl = document.getElementById('pre-net');
  netEl.textContent = (net >= 0 ? '+' : '') + net + ' ◆';
  netEl.className   = net >= 0 ? 'positive' : 'negative';
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) target.classList.add('active');
  window.scrollTo(0, 0);
}
