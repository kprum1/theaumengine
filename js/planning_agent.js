// ============================================================
// THE AUM ENGINE — AL PLANNING AGENT v1.0
// js/planning_agent.js
// Ported from EdAlTim — merged 2026-04-08 per Vera compliance plan
//
// COMPLIANCE NOTE (Vera, 2026-04-08):
// ED/Al are planning SUPPORT tools — not financial advice.
// All outputs are drafts, subject to mandatory advisor review.
// Advisors are solely responsible for all recommendations
// and client communications. Do not represent Al briefs as advice.
//
// Processes ED client profiles (ed-human.json) into
// advisor-ready planning briefs, meeting prep, and internal
// resource match recommendations.
//
// Tim logic stays internal — no partner branding shown to client.
// ============================================================

// ── OPPORTUNITY SCORE BANDS (advisor-facing only) ────────────
const AL_PRIORITY_BANDS = {
  CRITICAL:   { min: 85, label: 'Critical — Act This Week',   color: 'var(--rose)',    emoji: '🔴' },
  URGENT:     { min: 70, label: 'Urgent — Schedule Now',      color: 'var(--amber)',   emoji: '🟠' },
  PRIORITY:   { min: 55, label: 'Priority — This Month',      color: 'var(--blue)',    emoji: '🔵' },
  STANDARD:   { min: 40, label: 'Standard — Queue',           color: 'var(--emerald)', emoji: '🟢' },
  DEVELOPING: { min: 0,  label: 'Developing — Nurture',       color: 'var(--text-muted)', emoji: '⚪' },
};

function alGetBand(score) {
  for (const [key, band] of Object.entries(AL_PRIORITY_BANDS)) {
    if (score >= band.min) return { key, ...band };
  }
  return { key: 'DEVELOPING', ...AL_PRIORITY_BANDS.DEVELOPING };
}

// ── WEALTH TIER LABELS ────────────────────────────────────────
const WEALTH_LABELS = {
  under_500k: 'Under $500K',
  '500k_1m':  '$500K – $1M',
  '1m_3m':    '$1M – $3M',
  '3m_10m':   '$3M – $10M',
  over_10m:   '$10M+',
};

// ── PRIORITY MAP → planning gap language ─────────────────────
const PRIORITY_GAP_MAP = {
  estate_planning:      'Estate planning and legacy documentation are incomplete or uncoordinated.',
  tax_optimization:     'Tax strategy has significant optimization potential at this wealth level.',
  retirement_income:    'Retirement income sequencing and drawdown strategy needs a dedicated plan.',
  investment_strategy:  'Investment allocation is not aligned to risk tolerance and time horizon.',
  business_exit:        'Business exit/succession planning needs a coordinated financial plan.',
  insurance_gaps:       'Insurance coverage has identified gaps — disability, life, or liability.',
  charitable_giving:    'Charitable giving strategy is not tax-optimized (DAF, QCD, bunching).',
  education_funding:    'Education funding strategy for dependents is not formalized.',
  cash_flow_management: 'Cash flow and spending coordination across accounts needs attention.',
  wealth_transfer:      'Wealth transfer and generational planning strategy is not in place.',
};

// ── LIFE STAGE → advisor approach ────────────────────────────
const LIFE_STAGE_APPROACH = {
  wealth_building:    'Focus on accumulation strategy, tax efficiency, and protection.',
  pre_retirement:     'Prioritize income sequencing, Social Security timing, and transition planning.',
  retirement:         'Focus on distribution strategy, longevity risk, and estate coordination.',
  business_ownership: 'Lead with business planning, exit prep, and personal/business integration.',
  inheritance_event:  'Lead with liquidity management, tax positioning, and emotional pacing.',
  career_transition:  'Coordinate deferred comp, equity decisions, and income gap management.',
  major_life_change:  'Assess all financial dimensions — often needs a full plan refresh.',
};

// ── INTERNAL RESOURCE MAP (not exposed in UI) ────────────────
// Tim logic stays internal for pilot — no partner branding shown
const _TIM_RESOURCE_INTERNAL = {
  estate_planning:      { label: 'Estate Planning',        suggestion: 'Coordinate with estate attorney before first meeting' },
  tax_optimization:     { label: 'Tax Strategy',           suggestion: 'Loop in CPA for tax projection before proceeding' },
  retirement_income:    { label: 'Retirement Income',      suggestion: 'Run a basic income projection scenario' },
  investment_strategy:  { label: 'Investment Management',  suggestion: 'Review current allocation vs. stated risk tolerance' },
  business_exit:        { label: 'Business Exit',          suggestion: 'Identify M&A or exit advisor for business valuation' },
  insurance_gaps:       { label: 'Insurance Review',       suggestion: 'Disability + life audit before new planning engagement' },
  charitable_giving:    { label: 'Charitable Planning',    suggestion: 'Explore DAF option for current-year tax benefit' },
  education_funding:    { label: 'Education Funding',      suggestion: 'Review 529 structure and contribution limits' },
  cash_flow_management: { label: 'Cash Flow',              suggestion: 'Map income and expense picture before investment advice' },
  wealth_transfer:      { label: 'Wealth Transfer',        suggestion: 'Estate attorney + advisor alignment meeting needed' },
  exit_planning:        { label: 'Business Exit',          suggestion: 'Identify M&A or exit advisor for business valuation' },
  tax_reduction:        { label: 'Tax Strategy',           suggestion: 'Loop in CPA for tax projection — especially on proceeds' },
  investment_plan:      { label: 'Post-Exit Investment',   suggestion: 'Build reinvestment plan before exit closes' },
  estate_update:        { label: 'Estate Planning',        suggestion: 'Coordinate with estate attorney before first meeting' },
  diversify:            { label: 'Concentration Risk',     suggestion: 'Map concentrated position and define exit timeline' },
  find_advisor:         { label: 'Advisor Search',         suggestion: 'Confirm advisor match before any plan development' },
};

// ── CORE: PLAN BRIEF GENERATOR ────────────────────────────────
function generatePlanningBrief(edProfile) {
  if (!edProfile) return null;

  const score     = edProfile.situationScore || 0;
  const band      = alGetBand(score);
  const priorities= Array.isArray(edProfile.priorities) ? edProfile.priorities :
                    (edProfile.topPriority ? [edProfile.topPriority] : []);
  const stage     = edProfile.lifeStage || 'wealth_building';
  const tier      = edProfile.wealthTier || '1m_3m';
  const urgency   = edProfile.urgencyTiming || 'within_6_months';
  const state     = edProfile.state || '';

  const gaps = priorities
    .slice(0, 3)
    .map(p => ({
      key:       p,
      label:     (PRIORITY_GAP_MAP[p] || p.replace(/_/g, ' ')).split('.')[0],
      internalSuggestion: (_TIM_RESOURCE_INTERNAL[p] || {}).suggestion || null,
    }));

  const approach = LIFE_STAGE_APPROACH[stage] || LIFE_STAGE_APPROACH['wealth_building'];

  const internalResources = gaps
    .filter(g => g.internalSuggestion)
    .map(g => ({ label: g.label, suggestion: g.internalSuggestion }))
    .slice(0, 3);

  const questions    = _buildMeetingQuestions(edProfile, gaps);
  const nextActions  = _buildNextActions(edProfile, gaps);
  const brief        = _buildBriefParagraph(edProfile, band, gaps);
  const hypotheses   = _buildHypotheses(edProfile, gaps);

  const DISCLAIMER = 'Generated by The AUM Engine as a planning support tool. All recommendations are the advisor\'s professional judgment. Not financial advice.';

  return {
    situationId:      edProfile.id,
    clientName:       edProfile.fullName || 'Client',
    score,
    band,
    wealthTier:       WEALTH_LABELS[tier] || tier,
    lifeStage:        stage.replace(/_/g, ' '),
    urgency:          urgency.replace(/_/g, ' '),
    state,
    gaps,
    approach,
    internalResources,
    questions,
    nextActions,
    hypotheses,
    brief,
    disclaimer: DISCLAIMER,
    generatedAt:      new Date().toISOString(),
    _fromEdProfile:   true,
  };
}

function _buildBriefParagraph(profile, band, gaps) {
  const name     = profile.fullName || 'This client';
  const tier     = WEALTH_LABELS[profile.wealthTier] || 'substantial';
  const stage    = (profile.lifeStage || '').replace(/_/g, ' ');
  const urgency  = (profile.urgencyTiming || '').replace(/_/g, ' ');
  const topGap   = gaps[0]?.label || 'financial planning coordination';

  const urgencyLine = urgency.includes('immediate') || urgency.includes('90')
    ? `The situation has immediate urgency — action is needed within 90 days.`
    : urgency.includes('6_months') || urgency.includes('year')
    ? `The client is ready to act within 6–12 months.`
    : `The client is in an exploratory phase and open to a guided conversation.`;

  return `${name} is a ${tier} prospect in the ${stage} life stage with an Opportunity Score of ${profile.situationScore}/100 — ${band.label}. The highest-value planning opportunity is ${topGap}. ${urgencyLine} ED has captured the full situation and flagged ${gaps.length} coordinated planning priorities. This client is ready for a structured first conversation.`;
}

function _buildMeetingQuestions(profile, gaps) {
  const baseQuestions = [
    `Where do you feel the most uncertainty in your financial picture right now?`,
    `What does financial success look like for you in the next 3–5 years?`,
    `Have you had a single advisor who coordinates the full picture — investments, tax, estate, insurance?`,
  ];

  const gapQuestions = gaps.map(g => {
    const qMap = {
      estate_planning:      `What's the current state of your estate plan — reviewed recently and coordinated with your accounts?`,
      tax_optimization:     `How are you currently thinking about tax strategy at your income and wealth level?`,
      retirement_income:    `Do you have a specific income plan for retirement — or is that still in progress?`,
      investment_strategy:  `Is your investment portfolio currently aligned to your goals and timeline?`,
      business_exit:        `Where are you in your thinking about the next chapter for your business?`,
      insurance_gaps:       `When did you last review your insurance coverage across disability, life, and liability?`,
      charitable_giving:    `Is your philanthropic giving as tax-efficient as your investment strategy?`,
      education_funding:    `What's your current plan for education funding?`,
      cash_flow_management: `Do you have a clear picture of your monthly and annual cash flow across all accounts?`,
      wealth_transfer:      `Have you thought through how you want to transfer wealth to the next generation?`,
      exit_planning:        `Where are you in the exit process — and have you walked through the tax picture of a sale?`,
      tax_reduction:        `Are you working with a CPA on a tax projection specifically for the exit or proceeds?`,
      investment_plan:      `Do you have a plan for what happens to the proceeds — or is that still open?`,
      estate_update:        `Is your estate plan coordinated with your business ownership and family situation?`,
      diversify:            `When you think about diversifying, what's the biggest obstacle you're facing?`,
      find_advisor:         `What hasn't worked about the advisor relationships you've had so far?`,
    };
    return qMap[g.key] || `Tell me more about your priorities around ${g.key.replace(/_/g,' ')}.`;
  });

  return [...baseQuestions, ...gapQuestions].slice(0, 5);
}

function _buildHypotheses(profile, gaps) {
  const hypoMap = {
    exit_planning:        `Tax-aware exit structuring is likely the highest-leverage planning move before the deal closes.`,
    tax_reduction:        `There are likely significant tax optimization opportunities that are time-sensitive given the situation.`,
    investment_plan:      `A post-exit reinvestment policy needs to be defined before the proceeds arrive to avoid reactive decisions.`,
    estate_update:        `The estate plan likely needs to be updated to reflect current wealth, ownership structure, and family situation.`,
    diversify:            `Concentration risk is the primary wealth-preservation threat — a staged diversification plan is needed.`,
    find_advisor:         `The client is actively in the market for a new advisor and is decision-ready given the right fit.`,
    business_exit:        `The business exit timeline and personal financial plan are likely not yet coordinated.`,
    tax_optimization:     `Tax drag on the portfolio and income is likely higher than it needs to be at this wealth level.`,
    estate_planning:      `Estate plan coordination (will, trust, POA, beneficiary designations) is likely incomplete or outdated.`,
    insurance_gaps:       `Disability and life coverage likely has gaps relative to current income, wealth, and obligations.`,
    retirement_income:    `A formal income sequencing and drawdown strategy has not yet been established for retirement.`,
    investment_strategy:  `The current investment allocation may not be aligned to stated risk tolerance and time horizon.`,
    wealth_transfer:      `Generational wealth transfer has not been formally addressed despite the wealth level and life stage.`,
  };

  const baseHypos = [
    `The client does not currently have a single advisor coordinating the full financial picture.`,
  ];

  const gapHypos = gaps
    .map(g => hypoMap[g.key])
    .filter(Boolean);

  return [...baseHypos, ...gapHypos].slice(0, 3);
}

function _buildNextActions(profile, gaps) {
  const urgency = profile.urgencyTiming || '';
  const isUrgent = urgency === 'now' || urgency === 'months_3';

  const baseActions = [
    `Schedule ${isUrgent ? 'an urgent' : 'an introductory'} call — brief suggests this is ${isUrgent ? 'time-sensitive' : 'a good fit'}.`,
  ];

  const gapActions = gaps.map(g => {
    const aMap = {
      exit_planning:        `Connect client with CPA before first meeting — tax projection on exit proceeds is critical.`,
      tax_reduction:        `Request prior-year tax returns and current income picture before first meeting.`,
      investment_plan:      `Come to meeting with a 3-scenario post-exit reinvestment framework.`,
      estate_update:        `Ask client to bring current estate documents (will, trust, POA) to first meeting.`,
      diversify:            `Prepare a concentration risk overview — show the cost of single-asset exposure.`,
      find_advisor:         `Lead with a fiduciary conversation — client is shopping, positioning matters.`,
      business_exit:        `Loop in an exit planning specialist for the first conversation if possible.`,
      tax_optimization:     `Introduce CPA connection in first meeting — don't wait.`,
      estate_planning:      `Refer to estate attorney within 30 days of first meeting if plan is outdated.`,
      insurance_gaps:       `Flag insurance review as a first-meeting agenda item.`,
      retirement_income:    `Prepare a basic income projection model to show at first meeting.`,
      investment_strategy:  `Review current holdings before meeting — prepare an alignment gap summary.`,
      wealth_transfer:      `Introduce trust structure conversation in first meeting.`,
    };
    return aMap[g.key] || null;
  }).filter(Boolean);

  return [...baseActions, ...gapActions].slice(0, 3);
}

function formatSituationQueue(situations = []) {
  return situations
    .map(s => ({
      ...s,
      band:        alGetBand(s.opportunityScore || s.situationScore || 0),
      wealthLabel: WEALTH_LABELS[s.wealthTier] || s.wealthTier || '—',
      stageLabel:  (s.lifeStage || '').replace(/_/g, ' '),
      urgencyLabel:(s.urgencyTiming || '').replace(/_/g, ' '),
      displayName: s.fullName || [s.firstName, s.lastName].filter(Boolean).join(' ') || 'Anonymous',
      createdDate: s.savedAt?.toDate
        ? s.savedAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : (s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Today'),
    }))
    .sort((a, b) => ((b.opportunityScore || b.situationScore || 0) - (a.opportunityScore || a.situationScore || 0)));
}

// ── Live state ────────────────────────────────────────────────
let _alActiveSituationId  = null;
let _alCurrentBrief       = null;
let _alSituationQueue     = [];

window.alSelectSituation = function(id) {
  _alActiveSituationId = id;
  navigate('command-center');
};

window.alGenerateBrief = function(situationId) {
  const situations = window._edSituations || _alSituationQueue;
  const profile    = situations.find(s => (s.id || s._firestoreId) === situationId);
  if (!profile) { showToast('Situation not found', '⚠️'); return; }

  const brief = generatePlanningBrief(profile);
  _alCurrentBrief              = brief;
  window._alCurrentBrief      = brief;
  window._alActiveSituationId = situationId;
  _alActiveSituationId        = situationId;

  // Persist to sessionStorage so brief survives navigate() + page reload
  // (mirrors the save in edAdvance() for the auto-generate path)
  try {
    sessionStorage.setItem('alCurrentBrief', JSON.stringify({
      brief,
      situationId,
      savedAt: new Date().toISOString(),
    }));
  } catch(e) { console.warn('[alGenerateBrief] sessionStorage write failed:', e); }

  navigate('command-center');
  showToast(`Planning brief ready for ${brief.clientName}`, '💼');
};

window.alAcceptSituation = async function(situationId) {
  if (!situationId || !currentUID) return;
  await updateEdSituationStatus(situationId, 'al_accepted', currentUID);
  await saveAlAssignment({
    situationId,
    advisorUid:  currentUID,
    brief:       _alCurrentBrief,
    acceptedAt:  new Date().toISOString(),
    outcome:     null,
  });
  // Clear sessionStorage so approved brief doesn't ghost back
  try { sessionStorage.removeItem('alCurrentBrief'); } catch(e) {}
  _alCurrentBrief      = null;
  _alActiveSituationId = null;
  showToast('Client accepted — added to your planning queue', '✅');
  if (typeof refreshEdSituations === 'function') {
    window._edSituations = await refreshEdSituations();
  }
  navigate('command-center');
};

window.alDeclineSituation = async function(situationId) {
  if (!situationId) return;
  await updateEdSituationStatus(situationId, 'al_declined', currentUID);
  _alActiveSituationId = null;
  _alCurrentBrief      = null;
  // Clear sessionStorage so declined brief doesn't ghost back
  try { sessionStorage.removeItem('alCurrentBrief'); } catch(e) {}
  showToast('Situation returned to queue', '↩️');
  navigate('command-center');
};

// ── Exports ───────────────────────────────────────────────────
window.PlanningAgent = {
  generateBrief:    generatePlanningBrief,
  formatQueue:      formatSituationQueue,
  getBand:          alGetBand,
  WEALTH_LABELS,
  AL_PRIORITY_BANDS,
};
