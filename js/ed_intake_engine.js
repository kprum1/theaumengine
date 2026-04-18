// ============================================================
// THE AUM ENGINE — ED INTAKE ENGINE v2 (Pilot)
// js/ed_intake_engine.js
// Ported from EdAlTim — merged 2026-04-08 per Vera compliance plan
//
// COMPLIANCE NOTE (Vera, 2026-04-08):
// ED/Al are planning SUPPORT tools — not financial advice.
// All outputs are drafts, subject to mandatory advisor review.
// Advisors are solely responsible for all recommendations
// and client communications. Do not represent Al briefs as advice.
//
// ED is the client-intelligence agent. This engine runs an
// adaptive intake for business-owner and liquidity-event
// prospects and generates:
//   1. ed-human.json — portable profile file
//   2. Opportunity Score — urgency × complexity × fit (0–100)
//      NOTE: Score is advisor-facing only. Never shown to client.
//   3. Al-ready brief — for advisor handoff
//
// Two question sets:
//   ED_QUESTIONS_LITE — 10Q pilot-default (business owners / exits)
//   ED_QUESTIONS_FULL — 30Q deep-intake (reserved for Phase 2)
//
// Entry point: EdIntakeEngine.init(mode)  mode = 'lite' | 'full'
// Output:      EdIntakeEngine.generateProfile() → ed-human.json
// ============================================================

'use strict';

// ============================================================
// ED_QUESTIONS_LITE — 10 questions, pilot default
// Niche: Business owners + liquidity-event prospects
// Target completion time: ~3 minutes
// ============================================================
const ED_QUESTIONS_LITE = [
  {
    id: 'lq1', phase: 1, phaseLabel: 'Your Situation',
    text: 'What is your approximate total investable wealth?',
    type: 'single', field: 'wealthTier',
    options: [
      { value: 'under_500k',   label: 'Under $500K',         score: { urgency: 2, complexity: 1 } },
      { value: '500k_1m',      label: '$500K – $1M',         score: { urgency: 3, complexity: 2 } },
      { value: '1m_3m',        label: '$1M – $3M',           score: { urgency: 4, complexity: 3 } },
      { value: '3m_10m',       label: '$3M – $10M',          score: { urgency: 5, complexity: 4 } },
      { value: 'over_10m',     label: '$10M+',               score: { urgency: 5, complexity: 5 } },
    ]
  },
  {
    id: 'lq2', phase: 1, phaseLabel: 'Your Situation',
    text: 'Which best describes your primary wealth source? Select all that apply.',
    type: 'multi', field: 'wealthSource', maxSelect: 3,
    options: [
      { value: 'business_sale',      label: 'Selling or exiting a business',                               score: { urgency: 5, complexity: 5 } },
      { value: 'business_equity',    label: 'Active business owner (not yet exiting)',                     score: { urgency: 4, complexity: 4 } },
      { value: 'corporate_equity',   label: 'Corporate equity / RSUs',                                    score: { urgency: 4, complexity: 4 } },
      { value: 'inheritance',        label: 'Inheritance or windfall',                                    score: { urgency: 4, complexity: 4 } },
      { value: 'real_estate',        label: 'Real estate / development',                                  score: { urgency: 3, complexity: 4 } },
      { value: 'professional_inc',   label: 'Professional practice income (MD, JD, DDS, other)',          score: { urgency: 3, complexity: 3 } },
      { value: 'athlete_income',     label: 'Athletic contract / signing bonus / endorsement income',     score: { urgency: 5, complexity: 4 } },
      { value: 'trade_business',     label: 'Trade business / self-employment (HVAC, electrical, etc.)',  score: { urgency: 3, complexity: 3 } },
      { value: 'partnership_k1',     label: 'Partnership income / K-1 / law firm equity',                score: { urgency: 4, complexity: 5 } },
      { value: 'deferred_comp',      label: 'Deferred comp / NQDC / executive equity plan',              score: { urgency: 4, complexity: 5 } },
      { value: 'charitable_daf',     label: 'Charitable giving / foundation / DAF strategy',             score: { urgency: 3, complexity: 4 } },
      { value: 'aviation_lifestyle', label: 'Aviation / lifestyle asset wealth (aircraft, collectibles)', score: { urgency: 2, complexity: 3 } },
      { value: 'other',              label: 'Other / combination',                                        score: { urgency: 2, complexity: 3 } },
    ]
  },
  {
    id: 'lq2b', phase: 1, phaseLabel: 'Your Situation',
    text: 'Which best describes your primary profession or career? Select up to 2.',
    type: 'multi', field: 'profession', maxSelect: 2,
    options: [
      { value: 'athlete_active',   label: '🏆 Professional athlete (active)',                          score: { fit: 5, urgency: 5 } },
      { value: 'athlete_retired',  label: '🏆 Recently retired from professional sports',              score: { fit: 5, urgency: 4 } },
      { value: 'physician',        label: '👩‍⚕️ Physician / surgeon',                                   score: { fit: 4, urgency: 3 } },
      { value: 'dentist',          label: '🦷 Dentist / dental or medical specialist',                 score: { fit: 4, urgency: 3 } },
      { value: 'attorney',         label: '⚖️ Attorney / law firm partner',                            score: { fit: 4, urgency: 3 } },
      { value: 'executive',        label: '👔 Corporate executive (C-Suite, VP, Director)',            score: { fit: 4, urgency: 3 } },
      { value: 'business_owner',   label: '🏢 Business owner / entrepreneur',                         score: { fit: 4, urgency: 4 } },
      { value: 'trade_owner',      label: '🔧 Skilled trade business owner (HVAC, electrical, etc.)',  score: { fit: 3, urgency: 3 } },
      { value: 'real_estate_dev',  label: '🏗️ Real estate developer / operator',                      score: { fit: 4, urgency: 3 } },
      { value: 'nonprofit_board',  label: '🎗️ Nonprofit board member / foundation trustee',           score: { fit: 3, urgency: 2 } },
      { value: 'aircraft_owner',   label: '✈️ Pilot / aircraft owner',                                score: { fit: 3, urgency: 2 } },
      { value: 'w2_professional',  label: '🚀 High-earning W-2 professional (not yet in above)',      score: { fit: 3, urgency: 2 } },
    ]
  },
  {
    id: 'lq3', phase: 1, phaseLabel: 'Your Situation',
    text: 'Where are you in your wealth journey right now?',
    type: 'single', field: 'lifeStage',
    options: [
      { value: 'liquidity_event',  label: 'Planning or expecting a liquidity event in the next 12–24 months', score: { urgency: 5, complexity: 5 } },
      { value: 'recently_liquid',  label: 'Recently received a lump sum or windfall',                         score: { urgency: 5, complexity: 5 } },
      { value: 'transition',       label: 'At a business, career, or family transition point',               score: { urgency: 4, complexity: 4 } },
      { value: 'accumulating',     label: 'Still building — focused on growing wealth',                      score: { urgency: 2, complexity: 3 } },
      { value: 'preserving',       label: 'Focused on protecting and distributing wealth',                   score: { urgency: 3, complexity: 4 } },
    ]
  },
  {
    id: 'lq4', phase: 1, phaseLabel: 'Your Situation',
    text: 'How would you describe your current advisor relationship?',
    type: 'single', field: 'advisorStatus',
    options: [
      { value: 'none',             label: 'I don\'t have a financial advisor',          score: { fit: 5, urgency: 4 } },
      { value: 'unsatisfied',      label: 'I have one but I\'m not satisfied',          score: { fit: 5, urgency: 3 } },
      { value: 'fragmented',       label: 'I have multiple advisors but they\'re siloed', score: { fit: 4, urgency: 3 } },
      { value: 'open',             label: 'I\'m happy but open to a second opinion',    score: { fit: 2, urgency: 2 } },
    ]
  },
  {
    id: 'lq5', phase: 1, phaseLabel: 'Your Situation',
    text: 'Which of these challenges are most relevant to you right now?',
    type: 'multi', field: 'primaryChallenges', maxSelect: 3,
    options: [
      { value: 'tax_burden',      label: '📊 High tax burden — especially on a sale or exit' },
      { value: 'estate_gap',      label: '🏠 Estate plan not up to date' },
      { value: 'concentration',   label: '⚠️ Wealth concentrated in one business or asset' },
      { value: 'no_plan',         label: '📋 No coordinated financial plan across all advisors' },
      { value: 'business_exit',   label: '🚪 Structuring or timing a business exit' },
      { value: 'investment_gap',  label: '📈 Don\'t have a plan for what comes after the exit' },
      { value: 'insurance_gap',   label: '🛡️ Unsure if insurance coverage is adequate' },
      { value: 'family_transfer', label: '👨‍👩‍👧 Planning for family wealth transfer' },
    ]
  },
  {
    id: 'lq6', phase: 2, phaseLabel: 'Planning Priorities',
    text: 'What is your single biggest financial priority over the next 12 months?',
    type: 'single', field: 'topPriority',
    options: [
      { value: 'exit_planning',    label: 'Execute or prepare for a business exit',     score: { urgency: 5 } },
      { value: 'tax_reduction',    label: 'Reduce tax exposure — especially on proceeds', score: { urgency: 5 } },
      { value: 'investment_plan',  label: 'Build a plan for what to do with proceeds',  score: { urgency: 4 } },
      { value: 'estate_update',    label: 'Update my estate plan',                      score: { urgency: 4 } },
      { value: 'diversify',        label: 'Diversify out of concentrated position',    score: { urgency: 4 } },
      { value: 'find_advisor',     label: 'Find the right advisor for this chapter',    score: { urgency: 5 } },
    ]
  },
  {
    id: 'lq7', phase: 2, phaseLabel: 'Planning Priorities',
    text: 'How urgent is this for you?',
    type: 'single', field: 'urgencyTiming',
    options: [
      { value: 'now',          label: 'Immediately — this can\'t wait',           score: { urgency: 5 } },
      { value: 'months_3',     label: 'Within the next 3 months',                score: { urgency: 4 } },
      { value: 'months_6',     label: 'Within the next 6 months',                score: { urgency: 3 } },
      { value: 'year',         label: 'Within the next year',                    score: { urgency: 2 } },
      { value: 'exploring',    label: 'Just exploring right now',                score: { urgency: 1 } },
    ]
  },
  {
    id: 'lq8', phase: 2, phaseLabel: 'Planning Priorities',
    text: 'Have you experienced a significant financial event in the last 18 months? Select all that apply.',
    type: 'multi', field: 'recentEvents', maxSelect: 6,
    options: [
      { value: 'business_sold',     label: '🤝 Sold or exited a business',                     score: { urgency: 5 } },
      { value: 'equity_vested',     label: '📈 Significant equity or RSU vested',              score: { urgency: 4 } },
      { value: 'inherited',         label: '💰 Received an inheritance or gift',               score: { urgency: 5 } },
      { value: 'real_estate_tx',    label: '🏠 Major real estate sale or purchase',            score: { urgency: 3 } },
      { value: 'job_change',        label: '💼 Changed employers or career',                   score: { urgency: 3 } },
      { value: 'marriage_divorce',  label: '💍 Marriage or divorce',                           score: { urgency: 4 } },
      { value: 'athlete_contract',  label: '🏆 Signed a new sports contract or signing bonus', score: { urgency: 5 } },
      { value: 'athlete_free_agent',label: '🏆 Currently in free agency or contract talks',   score: { urgency: 5 } },
      { value: 'athlete_retired',   label: '🏆 Recently retired from professional sports',     score: { urgency: 5 } },
      { value: 'none',              label: 'None of the above',                     score: {} },
    ]
  },
  {
    id: 'lq9', phase: 2, phaseLabel: 'Planning Priorities',
    text: 'What would you want from an initial conversation with an advisor?',
    type: 'single', field: 'meetingIntent',
    options: [
      { value: 'ready_to_act',   label: 'I\'m ready to move — want to get started fast', score: { urgency: 5, fit: 5 } },
      { value: 'evaluating',     label: 'I\'m comparing advisors — want the right fit',  score: { urgency: 3, fit: 4 } },
      { value: 'second_opinion', label: 'I want a second opinion on my current plan',    score: { urgency: 3, fit: 4 } },
      { value: 'educating',      label: 'I want to understand what I should be doing',   score: { urgency: 2, fit: 3 } },
    ]
  },
  {
    id: 'lq10', phase: 3, phaseLabel: 'Almost Done',
    text: 'Last step — how should your matched advisor reach you?',
    type: 'text', field: 'fullName',
    placeholder: 'Your full name',
    score: {}
  },
];

// ── ALIAS: the active question set ───────────────────────────
const ED_QUESTIONS_FULL = ED_QUESTIONS_LITE; // Phase 2 placeholder

// ============================================================
// SCORING ENGINE
// Aggregates all answers into a 0–100 Situation Score:
//   Urgency    (0–40 pts) — how pressing is the need
//   Complexity (0–35 pts) — how sophisticated the situation
//   Fit        (0–25 pts) — how ready to engage with an advisor
// ============================================================
const EdScoring = {

  compute(answers) {
    let urgencyRaw = 0, complexityRaw = 0, fitRaw = 0;
    let urgencyMax = 0, complexityMax = 0, fitMax = 0;

    for (const q of ED_QUESTIONS_LITE) {
      const ans = answers[q.field];
      if (ans === undefined || ans === null || ans === '') continue;

      if (q.type === 'single') {
        const opt = q.options?.find(o => o.value === ans);
        if (opt?.score) {
          urgencyRaw    += opt.score.urgency    || 0;
          complexityRaw += opt.score.complexity || 0;
          fitRaw        += opt.score.fit        || 0;
          urgencyMax    += 5;
          complexityMax += 5;
          fitMax        += 5;
        }
      } else if (q.type === 'multi') {
        const vals = Array.isArray(ans) ? ans : [ans];
        for (const v of vals) {
          const opt = q.options?.find(o => o.value === v);
          if (opt?.score) {
            urgencyRaw    += opt.score.urgency    || 0;
            complexityRaw += opt.score.complexity || 0;
            fitRaw        += opt.score.fit        || 0;
          }
        }
        urgencyMax    += 5;
        complexityMax += 5;
        fitMax        += 5;
      }
    }

    const urgencyScore    = urgencyMax    > 0 ? Math.round((urgencyRaw    / urgencyMax)    * 40) : 0;
    const complexityScore = complexityMax > 0 ? Math.round((complexityRaw / complexityMax) * 35) : 0;
    const fitScore        = fitMax        > 0 ? Math.round((fitRaw        / fitMax)        * 25) : 0;

    const total = Math.min(urgencyScore + complexityScore + fitScore, 100);

    return { total, urgencyScore, complexityScore, fitScore };
  },

  // Opportunity Score bands — advisor-facing only, never shown to client
  label(total) {
    if (total >= 85) return { label: 'Critical',     color: 'var(--rose)',       emoji: '🔴' };
    if (total >= 70) return { label: 'Urgent',        color: 'var(--amber)',      emoji: '🟠' };
    if (total >= 55) return { label: 'Priority',      color: 'var(--blue)',       emoji: '🔵' };
    if (total >= 40) return { label: 'Standard',      color: 'var(--emerald)',    emoji: '🟢' };
    return               { label: 'Developing',   color: 'var(--text-muted)', emoji: '⚪' };
  },
};

// ============================================================
// PROFILE GENERATOR
// Produces the ed-human.json object + handoff brief
// ============================================================
const EdProfileGenerator = {

  build(answers, scores, engine) {
    const name     = answers.fullName || 'Anonymous';
    const [first]  = name.trim().split(' ');
    const now      = new Date().toISOString();
    const scoreLabel = EdScoring.label(scores.total);

    const sessionId           = engine?._sessionId || `ed_${Date.now()}`;
    const referringAdvisorUid = engine?._referringAdvisorUid || null;

    return {
      id:              sessionId,
      fullName:        name,
      firstName:       first,
      email:           answers.email  || '',
      phone:           answers.phone  || '',
      completedAt:     now,
      version:         'ed-human-v1',

      wealthTier:        answers.wealthTier || '',
      wealthSource:      Array.isArray(answers.wealthSource) ? answers.wealthSource : (answers.wealthSource ? [answers.wealthSource] : []),
      profession:        answers.profession || [],
      lifeStage:         answers.lifeStage || '',
      advisorStatus:     answers.advisorStatus || '',
      topPriority:       answers.topPriority || '',
      urgencyTiming:     answers.urgencyTiming || '',
      primaryChallenges: answers.primaryChallenges || [],
      recentEvents:      answers.recentEvents || [],
      meetingIntent:     answers.meetingIntent || '',

      opportunityScore:  scores.total,
      situationScore:    scores.total,
      urgencyScore:      scores.urgencyScore,
      complexityScore:   scores.complexityScore,
      fitScore:          scores.fitScore,
      scoreLabel:        scoreLabel.label,

      referringAdvisorUid:  referringAdvisorUid,
      assignedAdvisorUid:   referringAdvisorUid,
      assignedAt:           referringAdvisorUid ? now : null,

      handoffReady:  true,
      intakeMode:    engine?._mode || 'lite',
    };
  },

  buildBrief(profile) {
    const wealthMap = {
      under_500k: 'under $500K', '500k_1m': '$500K–$1M',
      '1m_3m': '$1M–$3M', '3m_10m': '$3M–$10M', over_10m: '$10M+',
    };
    const stageMap = {
      transition: 'at a career or life transition',
      liquidity_event: 'expecting a liquidity event within 24 months',
      recently_liquid: 'recently received a windfall or lump sum',
      accumulating: 'in the wealth accumulation phase',
      preserving: 'focused on wealth preservation',
    };
    const professionMap = {
      athlete_active:  'active professional athlete',
      athlete_retired: 'recently retired professional athlete',
      physician:       'physician / surgeon',
      dentist:         'dentist / specialist',
      attorney:        'attorney / law firm partner',
      executive:       'corporate executive',
      business_owner:  'business owner',
      trade_owner:     'skilled trade business owner',
      real_estate_dev: 'real estate developer',
      nonprofit_board: 'nonprofit board member',
      aircraft_owner:  'pilot / aircraft owner',
      w2_professional: 'high-earning W-2 professional',
    };

    const wealth      = wealthMap[profile.wealthTier] || 'an undisclosed amount';
    const stage       = stageMap[profile.lifeStage]   || 'an active planning phase';
    const urgent      = profile.urgencyTiming === 'now' || profile.urgencyTiming === 'months_3';
    const challenges  = (profile.primaryChallenges || []).slice(0, 2).join(' and ');
    const professions = (profile.profession || []).map(p => professionMap[p] || p).join(' / ');
    const sources     = (profile.wealthSource || []).map(s => s.replace(/_/g, ' ')).join(', ');

    return `${profile.firstName} is ${stage} with approximately ${wealth} in investable wealth. ` +
      (professions ? `Primary profession: ${professions}. ` : '') +
      (sources     ? `Wealth sources: ${sources}. ` : '') +
      `Primary focus: ${profile.topPriority?.replace(/_/g, ' ') || 'financial planning'}. ` +
      (challenges  ? `Key challenges: ${challenges.replace(/_/g, ' ')}. ` : '') +
      (urgent      ? `This situation is URGENT — they need to act within 3 months. ` : '') +
      `Situation Score: ${profile.situationScore}/100 (${profile.scoreLabel}). ` +
      `Meeting intent: ${profile.meetingIntent?.replace(/_/g, ' ') || 'exploring options'}.`;
  },
};

// ============================================================
// ENGINE STATE
// ============================================================
const EdIntakeEngine = {
  _answers:              {},
  _currentIdx:           0,
  _phase:                1,
  _isComplete:           false,
  _profile:              null,
  _mode:                 'lite',
  _referringAdvisorUid:  null,
  _sessionId:            null,

  get _activeQuestions() { return ED_QUESTIONS_LITE; },
  get questions()   { return this._activeQuestions; },
  get currentQ()    { return this._activeQuestions[this._currentIdx]; },
  get progress()    { return Math.round(((this._currentIdx + 1) / this._activeQuestions.length) * 100); },
  get isComplete()  { return this._isComplete; },

  init(mode) {
    this._mode       = mode || 'lite';
    this._answers    = {};
    this._currentIdx = 0;
    this._phase      = 1;
    this._isComplete = false;
    this._profile    = null;

    try {
      const params = new URLSearchParams(window.location.search);
      // ?ref= is present when a prospect uses the advisor's shared intake link.
      // When an advisor starts intake directly from the cockpit, fall back to currentUID
      // so referringAdvisorUid is never null (required for Firestore rule matching).
      this._referringAdvisorUid = params.get('ref')
        || (typeof currentUID !== 'undefined' && currentUID ? currentUID : null);
    } catch(e) { this._referringAdvisorUid = null; }

    this._sessionId = `ed_${Date.now()}`;

    try {
      const saved = localStorage.getItem('edIntakeDraft');
      if (saved) {
        const draft = JSON.parse(saved);
        if ((draft.mode || 'lite') === this._mode) {
          this._answers    = draft.answers    || {};
          this._referringAdvisorUid  = draft.referringAdvisorUid  || this._referringAdvisorUid;
          this._sessionId            = draft.sessionId            || this._sessionId;
          // Clamp currentIdx — a stale draft can have an out-of-bounds value
          const savedIdx = parseInt(draft.currentIdx) || 0;
          this._currentIdx = (savedIdx >= 0 && savedIdx < this._activeQuestions.length) ? savedIdx : 0;
          this._phase      = this.currentQ?.phase || 1;
        }
      }
    } catch(e) {}
  },

  answer(value) {
    const q = this.currentQ;
    if (!q) return;
    this._answers[q.field] = value;
    this._save();
    return this.advance();
  },

  advance() {
    if (this._currentIdx < this._activeQuestions.length - 1) {
      this._currentIdx++;
      this._phase = this.currentQ.phase;
      return { done: false, question: this.currentQ, progress: this.progress };
    }
    return this.complete();
  },

  back() {
    if (this._currentIdx > 0) {
      this._currentIdx--;
      this._phase = this.currentQ.phase;
    }
    return { question: this.currentQ, progress: this.progress };
  },

  complete() {
    this._isComplete = true;
    const scores = EdScoring.compute(this._answers);
    this._profile = EdProfileGenerator.build(this._answers, scores, this);

    // Hard guard — profile.id must always be a non-empty string before any save attempt.
    // saveEdSituationToFirestore() exits early on a falsy id, creating a phantom UI success.
    if (!this._profile.id || typeof this._profile.id !== 'string' || !this._profile.id.trim()) {
      const fallbackId = `ed_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      console.warn('[EdIntakeEngine] profile.id was blank — assigning fallback:', fallbackId);
      this._profile.id = fallbackId;
      this._sessionId  = fallbackId;
    }

    this._profile.brief = EdProfileGenerator.buildBrief(this._profile);
    localStorage.removeItem('edIntakeDraft');
    return { done: true, profile: this._profile, scores };
  },

  generateProfile() {
    if (!this._isComplete) this.complete();
    return this._profile;
  },

  _save() {
    try {
      localStorage.setItem('edIntakeDraft', JSON.stringify({
        answers:              this._answers,
        currentIdx:           this._currentIdx,
        phase:                this._phase,
        mode:                 this._mode,
        sessionId:            this._sessionId,
        referringAdvisorUid:  this._referringAdvisorUid,
        savedAt:              new Date().toISOString(),
      }));
    } catch(e) {}
  },
};

window.EdIntakeEngine       = EdIntakeEngine;
window.EdScoring            = EdScoring;
window.EdProfileGenerator   = EdProfileGenerator;
window.ED_QUESTIONS_LITE    = ED_QUESTIONS_LITE;
