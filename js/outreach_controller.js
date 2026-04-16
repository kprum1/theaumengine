// ============================================================
// THE AUM ENGINE — OUTREACH AGENT STACK v1
// outreach_controller.js
//
// Coordinator + 3 specialist agents:
//   1. ResearchAgent    — enriches prospect context
//   2. StrategyAgent    — selects angle, channel, CTA
//   3. CustomizationAgent — generates 3 draft variants (outreach_agent.js)
//   4. CadenceAgent     — recommends next-touch sequence
//
// Single entry point: OutreachController.run(prospectId, channel, stage)
// ============================================================

// ── SHARED STATE (readable by UI) ────────────────────────────
window._outreachState = {
  prospectId:      null,
  channel:         'email',
  stage:           'first_touch',
  enrichedContext: null,
  strategy:        null,
  draftResult:     null,
  cadence:         null,
  activeVariant:   'A',
  isGenerating:    false,
};

// ============================================================
// AGENT 1: RESEARCH AGENT
// Gathers and normalizes all available prospect context into
// one clean enrichedContext object the other agents can read.
// ============================================================
const ResearchAgent = {

  gather(prospect) {
    if (!prospect) return null;

    const advisorProfile = window._advisorProfile || {};
    const nicheProfile   = _safeJSON('aumNicheProfile');
    const icp            = _safeJSON('aumEngineICP');
    const notes          = window.NOTES_STORE?.[prospect.id] || '';

    // Parse company / prior company from title + signals
    const company    = prospect.company || prospect.employer || _extractCompany(prospect.title || '');
    const signals    = prospect.signals || {};
    const reasonCodes = prospect.reasonCodes || [];

    // Determine planning pain points from reason codes + signals
    const planningPain = _inferPlanningPain(prospect.nicheId, reasonCodes, signals);

    // Warmth level
    const rel      = (signals.relationship || '').toLowerCase();
    const warmth   = rel.includes('warm') || rel.includes('2nd') || rel.includes('referral')
                     ? 'warm' : 'cold';

    // Wealth complexity
    const aum = parseFloat((prospect.estimatedAUM || '0').replace(/[^0-9.]/g,''));
    const wealthComplexity = aum >= 3 ? 'high' : aum >= 1 ? 'medium' : 'developing';

    // Prior enrichment feedback
    const priorFeedback = (prospect.advisorRating === 'up')
                          ? 'positive_signal'
                          : (prospect.advisorRating === 'down') ? 'negative_signal' : 'neutral';

    return {
      // Prospect basics
      id:           prospect.id,
      firstName:    prospect.firstName,
      lastName:     prospect.lastName,
      fullName:     `${prospect.firstName} ${prospect.lastName}`,
      title:        prospect.title || '',
      company,
      city:         prospect.city  || '',
      state:        prospect.state || '',
      nicheId:      prospect.nicheId || '',
      niche:        prospect.niche   || '',
      status:       prospect.status  || 'New',
      priorityScore: prospect.priorityScore || 0,

      // Enriched context
      planningPain,
      wealthComplexity,
      warmth,
      nextEvent:    signals.nextEvent   || '',
      relationship: signals.relationship || 'Cold',
      reasonCodes,
      advisorNotes: notes,
      priorFeedback,
      estimatedAUM: prospect.estimatedAUM || '',

      // Advisor context
      advisor: {
        primaryNiche: nicheProfile?.top3?.[0]?.name || icp?.primaryNiche || 'Financial Planning',
        specialties:  advisorProfile?.serviceCapabilities || ['Financial Planning', 'Investment Management'],
        tone:         icp?.toneStyle || 'professional_warm',
        geography:    icp?.geography || advisorProfile?.officeLocations?.[0]?.city || '',
        aumMin:       icp?.minAssets || '$1M+',
        messagingAngle: icp?.messagingAngle || '',
        approvedPhrases: advisorProfile?.approvedPhrases || [],
        bannedPhrases:   advisorProfile?.bannedPhrases || [
          "I know you were laid off", "I know your net worth",
          "I saw your private details", "I found your contact information",
        ],
        complianceMode: advisorProfile?.complianceMode || 'moderate',
      },
    };
  },
};

// ── Research helpers ──────────────────────────────────────────
function _safeJSON(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}

function _extractCompany(title) {
  // No hallucination — only extract if it's prepended like "CEO @ Acme"
  const match = title.match(/(?:@|at)\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function _inferPlanningPain(nicheId, reasonCodes, signals) {
  const pain = [];
  const hay  = [...reasonCodes, signals.nextEvent || '', signals.relationship || ''].join(' ').toLowerCase();

  const painMap = {
    'aircraft-owners':         ['asset planning', 'estate coordination', 'insurance review'],
    'physicians':              ['income complexity', 'disability gap', 'practice transition'],
    'business-owners':        ['exit planning', 'succession', 'tax efficiency'],
    'ai-displaced-executives': ['severance strategy', 'equity decision', 'cash flow reset'],
    'c-suite-executives':     ['deferred comp', 'concentrated stock', 'executive transition'],
    'charity-board-members':  ['DAF strategy', 'legacy planning', 'philanthropic tax efficiency'],
    'inheritance-recipients': ['sudden wealth', 'estate settlement', 'investment deployment'],
    'real-estate-developers': ['1031 exchange', 'concentration risk', 'deal-level tax planning'],
    'law-partners':           ['K-1 complexity', 'partner buyout', 'uneven income'],
    'pro-athletes':           ['signing bonus deployment', 'career-window income planning', 'post-career income transition'],
  };

  const nichePain = painMap[nicheId] || painMap['business-owners'];
  pain.push(...nichePain);

  // Layer in signal-specific pain
  if (hay.includes('retire'))    pain.push('retirement transition');
  if (hay.includes('exit'))      pain.push('exit timing');
  if (hay.includes('vesting'))   pain.push('equity vesting');
  if (hay.includes('sale'))      pain.push('liquidity event');
  if (hay.includes('acquisition')) pain.push('deal coordination');

  return [...new Set(pain)].slice(0, 4);
}

// ============================================================
// AGENT 2: STRATEGY AGENT
// Selects the optimal angle, channel recommendation, and CTA
// based on enriched prospect context + advisor profile.
// ============================================================
const StrategyAgent = {

  select(enrichedCtx, channel, stage) {
    const { nicheId, warmth, planningPain, wealthComplexity, priorFeedback, reasonCodes } = enrichedCtx;

    // Detect trigger from reason codes
    const triggerType = detectTriggerType(
      Object.values(enrichedCtx.signals || {}),
      reasonCodes,
      enrichedCtx.title
    );

    // Persona → angle via existing matrix in outreach_agent.js
    const personaType = PERSONA_TYPES[nicheId] || 'business_owner';
    const personaAngles = ANGLE_MATRIX[personaType] || ANGLE_MATRIX['business_owner'];
    const angleStrategy = personaAngles[triggerType] || personaAngles['general_intro']
                          || { angle: 'general_niche_intro', cta: 'reply_if_relevant' };

    // Adjust CTA based on warmth + wealth complexity
    let cta = angleStrategy.cta;
    if (warmth === 'warm') cta = 'brief_intro_call';
    if (wealthComplexity === 'high' && warmth === 'cold') cta = 'send_short_guide';

    // Channel recommendation — let advisor choose but suggest based on signals
    const channelRec = this._recommendChannel(enrichedCtx, stage);

    // Tone recommendation
    const tone = warmth === 'warm' ? 'B'    // soft if warm
               : wealthComplexity === 'high' ? 'C'   // insight-led for complex
               : 'A';                                   // direct by default

    const angleMeta = ANGLE_META[angleStrategy.angle] || ANGLE_META['general_niche_intro'];
    const ctaMeta   = CTA_PHRASES[cta] || CTA_PHRASES['brief_intro_call'];

    return {
      angle:       angleStrategy.angle,
      angleLabel:  angleMeta.label,
      reason:      angleMeta.why,
      cta,
      ctaLabel:    ctaMeta.short,
      ctaFull:     ctaMeta.full,
      tone,                     // suggested variant A/B/C
      triggerType,
      personaType,
      channelRec,
      warmth,
      wealthComplexity,
    };
  },

  _recommendChannel(ctx, stage) {
    // First touch: email or LinkedIn based on role level
    if (stage === 'first_touch') {
      const executiveTitle = /VP|Director|Chief|President|Partner|Physician|MD|DO|Surgeon/i.test(ctx.title);
      return executiveTitle ? 'linkedin' : 'email';
    }
    // Follow-up: escalate channel
    const stageMap = {
      'follow_up_1': 'email',
      'follow_up_2': 'linkedin',
      'follow_up_3': 'call',
      'final':       'voicemail',
    };
    return stageMap[stage] || 'email';
  },
};

// ============================================================
// AGENT 3: CADENCE AGENT
// Recommends the next-touch sequence: timing, channel, theme.
// Returns a structured 5-touch sequence based on persona + warmth.
// ============================================================
const CadenceAgent = {

  // Per-persona sequence templates
  _sequences: {
    ai_displaced_exec: [
      { touch: 1, day: 0,  channel: 'email',    theme: 'Executive transition — financial windows',     cta: 'brief_intro_call' },
      { touch: 2, day: 3,  channel: 'linkedin',  theme: 'Connect — shared transition context',          cta: 'reply_if_relevant' },
      { touch: 3, day: 8,  channel: 'email',    theme: 'Follow-up — equity & severance timing guide', cta: 'send_short_guide' },
      { touch: 4, day: 14, channel: 'call',     theme: 'Quick call — RSU decision window',             cta: 'brief_intro_call' },
      { touch: 5, day: 21, channel: 'email',    theme: 'Final touch — "worth a 15-min call?"',        cta: 'soft_permission' },
    ],
    business_owner: [
      { touch: 1, day: 0,  channel: 'email',    theme: 'Exit planning — getting the financial side right', cta: 'brief_intro_call' },
      { touch: 2, day: 4,  channel: 'linkedin',  theme: 'Connect — business owner planning',               cta: 'reply_if_relevant' },
      { touch: 3, day: 9,  channel: 'email',    theme: 'Follow-up — succession planning guide',           cta: 'send_short_guide' },
      { touch: 4, day: 16, channel: 'voicemail', theme: 'Brief voicemail — exit timing question',          cta: 'brief_intro_call' },
      { touch: 5, day: 24, channel: 'email',    theme: 'Final — tax-smart exit checklist',               cta: 'soft_permission' },
    ],
    physician: [
      { touch: 1, day: 0,  channel: 'email',    theme: 'Practice-aware financial planning',         cta: 'brief_intro_call' },
      { touch: 2, day: 5,  channel: 'linkedin',  theme: 'Connect — physician financial complexity',  cta: 'reply_if_relevant' },
      { touch: 3, day: 10, channel: 'email',    theme: 'Follow-up — disability + retirement gaps',  cta: 'send_short_guide' },
      { touch: 4, day: 17, channel: 'call',     theme: 'Practice transition planning call',          cta: 'brief_intro_call' },
      { touch: 5, day: 25, channel: 'email',    theme: 'Final — high-income planning checklist',    cta: 'soft_permission' },
    ],
    aircraft_owner: [
      { touch: 1, day: 0,  channel: 'email',    theme: 'Aviation + wealth coordination',           cta: 'compare_notes' },
      { touch: 2, day: 5,  channel: 'linkedin',  theme: 'Connect — aircraft owner planning niche', cta: 'reply_if_relevant' },
      { touch: 3, day: 12, channel: 'email',    theme: 'Estate + lifestyle coordination',          cta: 'send_short_guide' },
      { touch: 4, day: 18, channel: 'call',     theme: 'Quick call — hangar to estate planning',  cta: 'brief_intro_call' },
      { touch: 5, day: 26, channel: 'email',    theme: 'Final touch',                              cta: 'soft_permission' },
    ],
    charity_board: [
      { touch: 1, day: 0,  channel: 'email',    theme: 'Philanthropic + personal wealth coordination', cta: 'soft_permission' },
      { touch: 2, day: 5,  channel: 'linkedin',  theme: 'Connect — board member planning',             cta: 'reply_if_relevant' },
      { touch: 3, day: 12, channel: 'email',    theme: 'DAF + charitable trust strategy',             cta: 'send_short_guide' },
      { touch: 4, day: 20, channel: 'email',    theme: 'Legacy planning — follow-up',                cta: 'compare_notes' },
      { touch: 5, day: 28, channel: 'call',     theme: 'Final — philanthropic planning call',        cta: 'soft_permission' },
    ],
    pro_athlete: [
      { touch: 1, day: 0,  channel: 'email',    theme: 'Career-window wealth planning intro',              cta: 'brief_intro_call' },
      { touch: 2, day: 4,  channel: 'linkedin',  theme: 'Connect — athlete financial planning niche',       cta: 'reply_if_relevant' },
      { touch: 3, day: 9,  channel: 'email',    theme: 'Follow-up — signing bonus & income spike guide',   cta: 'send_short_guide' },
      { touch: 4, day: 16, channel: 'call',     theme: 'Quick call — post-career transition planning',     cta: 'brief_intro_call' },
      { touch: 5, day: 24, channel: 'email',    theme: 'Final — career window checklist',                  cta: 'soft_permission' },
    ],
    _default: [
      { touch: 1, day: 0,  channel: 'email',    theme: 'First-touch — introduce your niche specialty', cta: 'brief_intro_call' },
      { touch: 2, day: 3,  channel: 'linkedin',  theme: 'LinkedIn connection',                         cta: 'reply_if_relevant' },
      { touch: 3, day: 9,  channel: 'email',    theme: 'Follow-up — value add content',              cta: 'send_short_guide' },
      { touch: 4, day: 16, channel: 'voicemail', theme: 'Voicemail — brief, low-pressure',            cta: 'brief_intro_call' },
      { touch: 5, day: 23, channel: 'email',    theme: 'Final email — open door',                    cta: 'soft_permission' },
    ],
  },

  _channelIcon: { email: '✉️', linkedin: '💼', call: '📞', voicemail: '📣' },

  sequence(enrichedCtx, strategy) {
    const seq = this._sequences[strategy.personaType] || this._sequences['_default'];

    // Mark current stage as done
    const currentTouch = _touchFromStage(_outreachState.stage);

    return seq.map(s => ({
      ...s,
      icon:   this._channelIcon[s.channel] || '📬',
      done:   s.touch < currentTouch,
      active: s.touch === currentTouch,
      ctaLabel: CTA_PHRASES[s.cta]?.short || s.cta,
    }));
  },

  nextTouch(sequence) {
    return sequence.find(s => !s.done) || sequence[sequence.length - 1];
  },
};

function _touchFromStage(stage) {
  const map = { first_touch: 1, follow_up_1: 2, follow_up_2: 3, follow_up_3: 4, final: 5 };
  return map[stage] || 1;
}

// ============================================================
// ORCHESTRATOR: OutreachController
// Single entry point — routes to all 4 agents, stores results
// in window._outreachState, calls UI renderer when done.
// ============================================================
const OutreachController = {

  async run(prospectId, channel, stage) {
    const prospect = PROSPECTS.find(p => p.id === prospectId) || PROSPECTS[0];
    if (!prospect) return;

    // Update shared state
    Object.assign(window._outreachState, {
      prospectId, channel, stage,
      isGenerating: true,
    });

    _setGeneratingUI(true);

    // Small async tick so UI can show loading state
    await new Promise(r => setTimeout(r, 400));

    try {
      // ── Agent 1: Research ────────────────────────────────
      const enrichedCtx = ResearchAgent.gather(prospect);
      window._outreachState.enrichedContext = enrichedCtx;

      // ── Agent 2: Strategy ────────────────────────────────
      const strategy = StrategyAgent.select(enrichedCtx, channel, stage);
      window._outreachState.strategy = strategy;

      // ── Agent 3: Customization (via outreach_agent.js) ───
      // Pass the full enriched context through into draft generation
      const draftResult = _generateWithContext(prospect, enrichedCtx, strategy, channel, stage);
      window._outreachState.draftResult = draftResult;
      window._outreachState.activeVariant = strategy.tone || 'A'; // start on recommended variant

      // ── Agent 4: Cadence ─────────────────────────────────
      const cadence = CadenceAgent.sequence(enrichedCtx, strategy);
      window._outreachState.cadence = cadence;

    } catch (err) {
      console.error('[OutreachController] Agent error:', err);
    }

    window._outreachState.isGenerating = false;
    _setGeneratingUI(false);
    _renderOutreachPanel();

    // ── Funnel tracking: draft generated ────────────────────
    if (typeof FunnelTracker !== 'undefined') {
      const st = window._outreachState;
      FunnelTracker.outreachDrafted(
        st.prospectId,
        st.channel,
        st.draftResult?.angle || 'unknown',
        st.activeVariant
      );
    }
  },
};

// ── Bridge: enriched context → customization agent ───────────
function _generateWithContext(prospect, ctx, strategy, channel, stage) {
  // Override the PERSONA_TYPES + angle resolution based on strategy agent output
  const draftCtx = buildDraftContext(prospect, channel, stage);
  // Inject enriched pain + strategy choice
  draftCtx.planningPain   = ctx.planningPain;
  draftCtx.wealthComplexity = ctx.wealthComplexity;
  draftCtx.strategy       = strategy;

  const channelTemplates = _TEMPLATES[channel] || _TEMPLATES['email'];
  const templateFn = channelTemplates[strategy.angle]
                  || channelTemplates['_default']
                  || _TEMPLATES.email['general_niche_intro'];

  const variants = ['A','B','C'].map(t => ({
    ...templateFn(draftCtx, { angle: strategy.angle, ctaMeta: { full: strategy.ctaFull, short: strategy.ctaLabel } }, t),
    length: channel === 'email' ? 'medium' : 'short',
  }));

  const riskFlags = validateDraftOutput({ variants }, ctx.advisor.bannedPhrases || []);

  return {
    angle:       strategy.angle,
    angleLabel:  strategy.angleLabel,
    reason:      strategy.reason,
    channel,
    tone:        ctx.advisor.tone,
    ctaKey:      strategy.cta,
    ctaLabel:    strategy.ctaLabel,
    riskFlags,
    variants,
    channelRec:  strategy.channelRec,
    prospectName: ctx.fullName,
    company:     ctx.company,
    warmth:      ctx.warmth,
    generatedAt: new Date().toISOString(),
  };
}

// ── UI: Loading state ─────────────────────────────────────────
function _setGeneratingUI(loading) {
  const btn = document.getElementById('agent-generate-btn');
  if (btn) {
    btn.disabled = loading;
    btn.textContent = loading ? '⌛ Researching…' : '💎 Generate';
  }
  const body = document.getElementById('draft-body');
  if (body) body.style.opacity = loading ? '0.3' : '1';
  const meta = document.getElementById('agent-meta-bar');
  if (meta) meta.style.opacity = loading ? '0.4' : '1';
}

// ── UI: Full panel render after agents finish ─────────────────
function _renderOutreachPanel() {
  const state = window._outreachState;
  if (!state.draftResult) return;

  // Metadata bar
  const metaEl = document.getElementById('agent-meta-bar');
  if (metaEl) metaEl.outerHTML = _buildMetaBar(state.draftResult, state.strategy);

  // Variant tabs
  const tabsEl = document.getElementById('variant-tabs');
  if (tabsEl) tabsEl.outerHTML = _buildVariantTabs(state.draftResult, state.activeVariant);

  // Apply active variant to editor
  _applyVariantToEditor(state.activeVariant);

  // Channel recommendation badge
  const chanRecEl = document.getElementById('channel-rec');
  if (chanRecEl && state.strategy?.channelRec) {
    const icons = { email:'✉️', linkedin:'💼', call:'📞', voicemail:'📣' };
    chanRecEl.textContent = `${icons[state.strategy.channelRec] || '📬'} Recommended: ${state.strategy.channelRec}`;
    chanRecEl.style.opacity = '1';
  }

  // Cadence panel
  const cadEl = document.getElementById('cadence-sequence');
  if (cadEl && state.cadence) cadEl.outerHTML = _buildCadencePanel(state.cadence);

  showToast(`${state.draftResult.angleLabel} · ${state.draftResult.variants.length} variants ready`, '💎');
}

// ── UI BUILDERS ───────────────────────────────────────────────

function _buildMetaBar(result, strategy) {
  const risk = result.riskFlags?.length
    ? `<span class="risk-pill">⚠️ ${result.riskFlags[0]}</span>`
    : `<span class="clean-pill">✅ Compliance clear</span>`;
  const chanRec = strategy?.channelRec
    ? `<span class="clean-pill" style="background:rgba(96,165,250,0.12);color:var(--blue)">📬 Try ${strategy.channelRec} first</span>`
    : '';
  return `
  <div class="agent-meta-bar" id="agent-meta-bar">
    <div class="agent-meta-grid">
      <div class="agent-meta-item">
        <div class="agent-meta-label">ANGLE</div>
        <div class="agent-meta-value">${result.angleLabel}</div>
      </div>
      <div class="agent-meta-item" style="flex:2">
        <div class="agent-meta-label">WHY THIS ANGLE</div>
        <div class="agent-meta-value agent-meta-why">${result.reason}</div>
      </div>
      <div class="agent-meta-item">
        <div class="agent-meta-label">WARMTH</div>
        <div class="agent-meta-value">${result.warmth === 'warm' ? '🟢 Warm' : '🔵 Cold'}</div>
      </div>
      <div class="agent-meta-item">
        <div class="agent-meta-label">CTA</div>
        <div class="agent-meta-value">${result.ctaLabel}</div>
      </div>
    </div>
    <div class="agent-meta-flags" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
      ${risk}${chanRec}
    </div>
  </div>`;
}

function _buildVariantTabs(result, activeId) {
  if (!result?.variants?.length) return '<div class="variant-tabs" id="variant-tabs"></div>';
  return `
  <div class="variant-tabs" id="variant-tabs">
    ${result.variants.map(v => `
    <button class="variant-tab ${v.id === activeId ? 'active' : ''}"
            id="vtab-${v.id}" onclick="osSelectVariant('${v.id}')">
      <span class="variant-tab-badge">${v.id}</span>
      <span class="variant-tab-label">${v.label}</span>
    </button>`).join('')}
  </div>`;
}

function _buildCadencePanel(cadence) {
  const icons = { email:'✉️', linkedin:'💼', call:'📞', voicemail:'📣' };
  const nextTouch = CadenceAgent.nextTouch(cadence);
  return `
  <div id="cadence-sequence">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div class="section-title" style="font-size:11.5px"><div class="section-title-dot"></div>Agent Cadence — ${cadence.length}-Touch Sequence</div>
      ${nextTouch ? `<span style="font-size:10px;color:var(--blue);font-weight:600">Next: ${icons[nextTouch.channel]||'📬'} ${nextTouch.theme.split('—')[0].trim()}</span>` : ''}
    </div>
    ${cadence.map(s => `
    <div class="signal-row cadence-row ${s.active ? 'cadence-active' : ''}" style="${s.active ? 'background:rgba(96,165,250,0.07);border-left:2px solid var(--blue);padding-left:8px;' : ''}">
      <span class="signal-label" style="min-width:52px;font-size:10px">
        ${s.done ? '<span style="color:var(--emerald)">✓</span>' : s.active ? '▶' : '○'}
        Day ${s.day}
      </span>
      <span style="flex:1;font-size:11px;color:${s.done?'var(--text-muted)':s.active?'var(--text-primary)':'var(--text-secondary)'}">
        ${icons[s.channel]||'📬'} ${s.theme}
      </span>
      <span style="font-size:10px;color:var(--text-muted)">${s.ctaLabel}</span>
    </div>`).join('')}
  </div>`;
}

// ── PUBLIC: Apply variant to editor ──────────────────────────
function osSelectVariant(id) {
  window._outreachState.activeVariant = id;
  document.querySelectorAll('.variant-tab').forEach(t => t.classList.remove('active'));
  const tab = document.getElementById(`vtab-${id}`);
  if (tab) tab.classList.add('active');
  _applyVariantToEditor(id);
}

function _applyVariantToEditor(id) {
  const result = window._outreachState.draftResult;
  if (!result) return;
  const v = result.variants.find(x => x.id === id);
  if (!v) return;

  const subjEl = document.getElementById('draft-subject');
  if (subjEl) subjEl.textContent = v.subject || '';

  const bodyEl = document.getElementById('draft-body');
  if (!bodyEl) return;
  bodyEl.style.opacity = '0.4';
  setTimeout(() => {
    const rendered = typeof _injectAdvisorSignature === 'function'
      ? _injectAdvisorSignature(v.body)
      : v.body;
    bodyEl.textContent = rendered;
    bodyEl.style.opacity = '1';
  }, 120);
}

// ── PUBLIC: Trigger agent run ─────────────────────────────────
function osRunAgentStack(channel) {
  const ch      = channel || window._outreachState.channel || activeOutreachType || 'email';
  const stage   = window._outreachState.stage || 'first_touch';
  const pid     = activeOutreachProspectId || (PROSPECTS[0]?.id);
  window._outreachState.channel = ch;
  OutreachController.run(pid, ch, stage);
}

// ── PUBLIC: Channel switch ────────────────────────────────────
function osSwitchChannel(ch) {
  window._outreachState.channel = ch;
  activeOutreachType = ch;
  // Update channel type buttons
  document.querySelectorAll('.outreach-type-btn').forEach(b => b.classList.remove('active'));
  const idx  = ['email','call','linkedin','voicemail'].indexOf(ch);
  const btns = document.querySelectorAll('.outreach-type-btn');
  if (btns[idx]) btns[idx].classList.add('active');
  osRunAgentStack(ch);
}

// ── PUBLIC: Tone shift ────────────────────────────────────────
function osShiftTone(mode) {
  const map = { direct:'A', soft:'B', insight:'C', safe:'C' };
  osSelectVariant(map[mode] || 'A');
  const labels = { direct:'Direct tone', soft:'Soft tone', insight:'Insight-led', safe:'Safer version' };
  showToast(labels[mode] || 'Tone adjusted', '🔄');
}

// ── PUBLIC: Stage toggle ─────────────────────────────────────
function osSetStage(stage) {
  window._outreachState.stage = stage;
  osRunAgentStack();
}

// ── INIT on prospect change ───────────────────────────────────
function osInitForProspect(prospectId) {
  window._outreachState.prospectId = prospectId;
  window._outreachState.stage      = 'first_touch';
  window._outreachState.channel    = activeOutreachType || 'email';

  // ── Funnel tracking: lead opened ──────────────────────────
  if (typeof FunnelTracker !== 'undefined') {
    const prospect = PROSPECTS.find(p => p.id === prospectId);
    FunnelTracker.leadViewed(prospectId, prospect?.nicheId, prospect?.fitScore);
  }

  // Auto-run stack when studio loads
  osRunAgentStack();
}

// ── Outcome logger (Phase C1 — dual-write: Firestore primary + localStorage fallback) ──
async function osLogOutcome(outcome) {
  // outcome: { variant, channel, angle, edited, sent }
  const state    = window._outreachState;
  const prospect = PROSPECTS.find(p => p.id === state.prospectId);

  const log = {
    prospectId:       state.prospectId,
    nicheId:          prospect?.nicheId || state.enrichedContext?.nicheId || null,
    channel:          state.channel,
    stage:            state.stage,
    angle:            state.draftResult?.angle       || null,
    variantChosen:    outcome.variant || state.activeVariant,
    editedBeforeSend: outcome.edited                 || false,
    sent:             outcome.sent                   || false,
    outcome:          outcome.outcome                || null,   // set later via osLogReply()
    timestamp:        new Date().toISOString(),
    firestoreDocId:   null,  // stamped after Firestore write
  };

  // PRIMARY: Firestore (async — we await to get the doc ID)
  const uid = window._currentUser?.uid || null;
  if (uid && typeof saveOutcomeToFirestore === 'function') {
    try {
      const docId = await saveOutcomeToFirestore(uid, log);
      if (docId) log.firestoreDocId = docId;
    } catch(e) {
      // Firestore write failed — localStorage fallback still runs below
    }
  }

  // FALLBACK / local cache: always write localStorage (last 100 events)
  try {
    const existing = JSON.parse(localStorage.getItem('aumOutreachLog') || '[]');
    existing.push(log);
    localStorage.setItem('aumOutreachLog', JSON.stringify(existing.slice(-100)));
  } catch(e) {}

  // Store docId for reply tapper
  if (window._outreachState) window._outreachState.lastDocId = log.firestoreDocId || null;

  // ── Funnel tracking: outreach sent ──────────────────────────
  if (log.sent && typeof FunnelTracker !== 'undefined') {
    FunnelTracker.outreachSent(
      log.prospectId,
      log.channel,
      log.variantChosen
    );
  }

  console.info('[OutreachController] Outcome logged:', log);
}

// ── [Your Name] / [Firm] injection — called after draft body is rendered ──
function _injectAdvisorSignature(bodyText) {
  if (!bodyText) return bodyText;
  const user   = window._currentUser;
  const profile = window._advisorProfile || {};
  const name   = user?.displayName || profile.displayName || user?.email?.split('@')[0] || '[Your Name]';
  const firm   = profile.firmName  || '[Firm]';
  return bodyText
    .replace(/\[Your Name\]/g, name)
    .replace(/\[Firm\]/g, firm)
    .replace(/\[number\]/g, '[your number]');
}

// ── Reply outcome updater (called when advisor taps a reply outcome button) ──
// outcome: 'reply' | 'positive' | 'meeting' | 'dead' | 'objection' | 'not_now' | 'unsubscribe'
async function osLogReply(firestoreDocId, outcome) {
  const uid = window._currentUser?.uid || null;
  if (!uid || !firestoreDocId) return;
  try {
    const db = firebase.firestore();
    await db.collection('outreach_outcomes').doc(firestoreDocId).update({
      outcome,
      replyType:     outcome,          // parallel field — matches al_assignments schema
      replyLoggedAt: new Date().toISOString(),
    });
    showToast(`Outcome logged: ${outcome}`, '📊');
  } catch(e) {
    console.warn('[OutreachController] osLogReply failed:', e);
  }
}

// ── Reply Tapper UI (Phase C2) ────────────────────────────────
// Renders a one-tap outcome strip below Send Now immediately after sending.
// Reads firestoreDocId from window._outreachState.lastDocId.
function _showReplyTapper() {
  const container = document.getElementById('reply-tapper-zone');
  if (!container) return;

  const outcomes = [
    { label: '✉️ They Replied',   value: 'reply',    color: 'var(--blue)' },
    { label: '📅 Meeting Booked', value: 'meeting',  color: 'var(--emerald)' },
    { label: '⏳ Not Now',         value: 'not_now',  color: 'var(--amber)' },
    { label: '👎 Wrong Fit',       value: 'dead',     color: 'var(--text-muted)' },
  ];

  container.innerHTML = `
    <div class="reply-tapper" id="reply-tapper-inner">
      <div style="font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px">
        📊 Did they respond? Log the outcome now
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${outcomes.map(o => `
          <button class="btn btn-ghost" style="font-size:11px;padding:5px 12px;border:1px solid ${o.color}30;color:${o.color}"
            onclick="_tapReplyOutcome('${o.value}')">
            ${o.label}
          </button>`).join('')}
        <button class="btn btn-ghost" style="font-size:10px;padding:5px 8px;color:var(--text-muted);margin-left:auto"
          onclick="document.getElementById('reply-tapper-zone').innerHTML=''">✕</button>
      </div>
    </div>`;
}

// Called by the tapper buttons in the DOM
async function _tapReplyOutcome(outcome) {
  const docId = window._outreachState?.lastDocId || null;

  // ── Funnel tracking: reply or meeting logged ────────────────
  if (typeof FunnelTracker !== 'undefined') {
    const pid = window._outreachState?.prospectId;
    const prospect = PROSPECTS.find(p => p.id === pid);
    FunnelTracker.replyLogged(pid, outcome);
    if (outcome === 'meeting') {
      FunnelTracker.meetingBooked(pid, prospect?.nicheId);
    }
  }

  // ── C6: Reply Tapper → al_assignments write-back ─────────
  // For routing-engine leads (_fromFirestore: true), persist replyType
  // to al_assignments/{assignmentId} so runGovernance can track reply rates.
  const pid = window._outreachState?.prospectId;
  const currentProspect = PROSPECTS.find(p => p.id === pid);
  if (currentProspect?._fromFirestore && currentProspect?.assignmentId
      && typeof updateAlAssignmentReply === 'function') {
    updateAlAssignmentReply(currentProspect.assignmentId, outcome)
      .catch(e => console.warn('[ReplyTapper] al_assignments write-back failed:', e));
  }

  if (!docId) {
    try {
      const log = JSON.parse(localStorage.getItem('aumOutreachLog') || '[]');
      const last = [...log].reverse().find(e => e.firestoreDocId);
      if (last?.firestoreDocId) {
        await osLogReply(last.firestoreDocId, outcome);
        document.getElementById('reply-tapper-zone').innerHTML = '';
        return;
      }
    } catch(e) {}
    showToast('No send record found to attach reply to', '⚠️');
    return;
  }
  await osLogReply(docId, outcome);
  document.getElementById('reply-tapper-zone').innerHTML = '';
}


