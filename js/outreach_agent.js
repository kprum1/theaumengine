// ============================================================
// THE AUM ENGINE — OUTREACH CUSTOMIZATION AGENT v1.5
// outreach_agent.js
// Constrained, situation-aware draft generation — 3 variants
// per channel, built from structured prospect + advisor inputs.
// Aligns to: Prospect Context, Advisor Profile, Strategy,
//            Draft Generation, Safety Filter
// ============================================================

// ── PERSONA MAP — nicheId → persona type ─────────────────────
const PERSONA_TYPES = {
  'aircraft-owners':          'aircraft_owner',
  'physicians':               'physician',
  'business-owners':          'business_owner',
  'law-partners':             'law_partner',
  'henrys':                   'henry',
  'c-suite-executives':       'c_suite_exec',
  'ai-displaced-executives':  'ai_displaced_exec',
  'dentists-specialists':     'dentist_specialist',
  'high-earning-tradesman':   'high_earning_trade',
  'inheritance-recipients':   'inheritance_recipient',
  'real-estate-developers':   'real_estate_developer',
  'charity-boards':           'charity_board',
  'charity-board-members':    'charity_board',
  'yacht-owners':             'yacht_owner',
};

// ── TRIGGER SIGNALS → trigger type ───────────────────────────
const TRIGGER_PATTERNS = {
  retirement:    ['retire','retirement','retiring','early retirement','former'],
  exit_liquidity:['exit','business sale','sold','acquisition','selling'],
  layoff:        ['layoff','laid off','downsizing','restructur','displaced','transition'],
  inheritance:   ['inherit','estate','beneficiar','trust distribution'],
  new_role:      ['appointed','promoted','new role','joined','named'],
  practice:      ['practice','partnership','buy-in','buy in','partner track'],
  rsu_vest:      ['rsu','vesting','equity','stock grant','stock option'],
};

function detectTriggerType(signals = [], reasonCodes = [], title = '') {
  const haystack = [...signals, ...reasonCodes, title].join(' ').toLowerCase();
  for (const [type, words] of Object.entries(TRIGGER_PATTERNS)) {
    if (words.some(w => haystack.includes(w))) return type;
  }
  return 'general_intro';
}

// ── ANGLE STRATEGY MATRIX ────────────────────────────────────
// Maps persona + trigger → best outreach angle
const ANGLE_MATRIX = {
  ai_displaced_exec: {
    layoff:          { angle: 'executive_transition',    cta: 'brief_intro_call' },
    retirement:      { angle: 'executive_transition',    cta: 'brief_intro_call' },
    rsu_vest:        { angle: 'equity_complexity',       cta: 'send_short_guide' },
    general_intro:   { angle: 'executive_transition',    cta: 'reply_if_relevant' },
  },
  business_owner: {
    exit_liquidity:  { angle: 'exit_liquidity',          cta: 'brief_intro_call' },
    retirement:      { angle: 'owner_succession',        cta: 'compare_notes'    },
    general_intro:   { angle: 'owner_succession',        cta: 'send_short_guide' },
  },
  physician: {
    practice:        { angle: 'practice_complexity',     cta: 'brief_intro_call' },
    retirement:      { angle: 'practice_complexity',     cta: 'compare_notes'    },
    general_intro:   { angle: 'income_complexity',       cta: 'send_short_guide' },
  },
  aircraft_owner: {
    general_intro:   { angle: 'lifestyle_wealth',        cta: 'compare_notes'    },
    exit_liquidity:  { angle: 'exit_liquidity',          cta: 'brief_intro_call' },
  },
  c_suite_exec: {
    retirement:      { angle: 'executive_transition',    cta: 'brief_intro_call' },
    new_role:        { angle: 'deferred_comp',           cta: 'send_short_guide' },
    general_intro:   { angle: 'deferred_comp',           cta: 'brief_intro_call' },
  },
  law_partner: {
    general_intro:   { angle: 'partner_complexity',      cta: 'compare_notes'    },
    retirement:      { angle: 'partner_complexity',      cta: 'brief_intro_call' },
  },
  charity_board: {
    general_intro:   { angle: 'philanthropic_planning',  cta: 'soft_permission'  },
  },
  inheritance_recipient: {
    inheritance:     { angle: 'inheritance_transition',  cta: 'soft_permission'  },
    general_intro:   { angle: 'inheritance_transition',  cta: 'send_short_guide' },
  },
  real_estate_developer: {
    exit_liquidity:  { angle: 'deal_fluency',            cta: 'brief_intro_call' },
    general_intro:   { angle: 'deal_fluency',            cta: 'compare_notes'    },
  },
  dentist_specialist: {
    practice:        { angle: 'practice_complexity',     cta: 'brief_intro_call' },
    general_intro:   { angle: 'practice_complexity',     cta: 'send_short_guide' },
  },
  henry: {
    rsu_vest:        { angle: 'equity_complexity',       cta: 'send_short_guide' },
    general_intro:   { angle: 'equity_complexity',       cta: 'send_short_guide' },
  },
  high_earning_trade: {
    general_intro:   { angle: 'owner_succession',        cta: 'compare_notes'    },
  },
  yacht_owner: {
    general_intro:   { angle: 'yacht_lifestyle',          cta: 'compare_notes'    },
    exit_liquidity:  { angle: 'exit_liquidity',           cta: 'brief_intro_call' },
    retirement:      { angle: 'yacht_lifestyle',          cta: 'compare_notes'    },
  },
};

// ── ANGLE METADATA (for UI display) ──────────────────────────
const ANGLE_META = {
  executive_transition:   { label: 'Executive Transition',     why: 'High-competence career change creates immediate financial complexity and decision urgency' },
  exit_liquidity:         { label: 'Exit & Liquidity Event',   why: 'Business sale creates sudden wealth, tax decisions, and reinvestment pressure' },
  practice_complexity:    { label: 'Practice Complexity',      why: 'Medical/dental practice ownership creates planning gaps most generalists miss' },
  income_complexity:      { label: 'Income Complexity',        why: 'High income + limited time = high leverage for a planning-forward advisor' },
  owner_succession:       { label: 'Owner Succession',         why: 'Business owners building toward exit trust advisors who understand their operating reality' },
  equity_complexity:      { label: 'Equity Compensation',      why: 'RSUs, options, and concentrated stock require tax-aware planning most advisors skip' },
  deferred_comp:          { label: 'Deferred Comp & Benefits', why: 'Executive benefits packages are complex, under-optimized, and rarely advisor-led' },
  lifestyle_wealth:       { label: 'Lifestyle & Wealth',       why: 'Aircraft ownership is a signal of affluence and planning confidence — lead with that' },
  partner_complexity:     { label: 'Partner Complexity',       why: 'Partner capital, K-1s, and buyouts require advisor fluency most firms lack' },
  philanthropic_planning: { label: 'Philanthropic Planning',   why: 'Board members want their giving as optimized as their personal finances' },
  inheritance_transition: { label: 'Inheritance Transition',   why: 'Sudden wealth creates anxiety — lead with clarity, not performance' },
  deal_fluency:           { label: 'Deal Fluency',             why: '1031s, DSTs, and concentration risk need someone who understands real estate tax strategy' },
  general_niche_intro:    { label: 'Niche Introduction',       why: 'Warm, observation-based intro establishes relevance without pressure' },
  yacht_lifestyle:        { label: 'Yacht & Maritime Wealth',  why: 'USCG-documented vessel ownership signals $2M+ AUM — lead with lifestyle fluency, not finance-first' },
};

// ── CTA LANGUAGE ─────────────────────────────────────────────
const CTA_PHRASES = {
  brief_intro_call:  { short: '15-minute intro call', full: 'a brief 15-minute intro call to compare notes' },
  send_short_guide:  { short: 'short planning guide', full: 'send you a short guide specifically written for this situation' },
  compare_notes:     { short: 'compare notes',        full: 'connect briefly to compare notes — no agenda' },
  reply_if_relevant: { short: 'reply if relevant',    full: 'reply only if this is relevant — no pressure' },
  soft_permission:   { short: 'see if it\'s a fit',  full: 'see if a conversation might be useful' },
};

// ── LAYER 1: CONTEXT BUILDER ──────────────────────────────────
function buildDraftContext(prospect, channel, stage = 'first_touch') {
  const advisorProfile = window._advisorProfile || {};
  const nicheProfile   = (() => { try { return JSON.parse(localStorage.getItem('aumNicheProfile') || 'null'); } catch(e){return null;} })();
  const icpConfig      = (() => { try { return JSON.parse(localStorage.getItem('aumEngineICP') || 'null'); } catch(e){return null;} })();

  const triggerType = detectTriggerType(
    Object.values(prospect.signals || {}),
    prospect.reasonCodes || [],
    prospect.title || ''
  );

  const nicheId     = (prospect.nicheId || prospect.niche || '').toLowerCase().replace(/\s+/g,'-');
  const personaType = PERSONA_TYPES[nicheId] || 'business_owner';

  // Pull company/employer — prefer explicit, then parse from title/signals
  const company = prospect.company || prospect.employer || '';

  // Determine warmth
  const warmth = (prospect.signals?.relationship || '').toLowerCase().includes('warm') ||
                 (prospect.signals?.relationship || '').toLowerCase().includes('2nd') ? 'warm' : 'cold';

  // Advisor messaging profile — merge from multiple sources
  const advisorMessaging = {
    primaryNiche:      nicheProfile?.top3?.[0]?.name || icpConfig?.primaryNiche || advisorProfile?.firmName || 'Financial Planning',
    specialties:       advisorProfile?.serviceCapabilities || ['Financial Planning', 'Investment Management'],
    toneStyle:         icpConfig?.toneStyle              || 'professional_warm',
    ctaStyle:          icpConfig?.ctaStyle               || 'brief_intro_call',
    messagingAngle:    icpConfig?.messagingAngle         || '',
    approvedPhrases:   advisorProfile?.approvedPhrases   || [],
    bannedPhrases:     advisorProfile?.bannedPhrases     || [
      "I know you were laid off",
      "I know your net worth",
      "I saw your private details",
      "I found your contact information",
    ],
    complianceMode:    advisorProfile?.complianceMode    || 'moderate',
  };

  return {
    prospect: {
      id:           prospect.id,
      firstName:    prospect.firstName,
      lastName:     prospect.lastName,
      fullName:     `${prospect.firstName} ${prospect.lastName}`,
      title:        prospect.title || '',
      company,
      city:         prospect.city || '',
      state:        prospect.state || '',
      nicheId,
      personaType,
      triggerType,
      reasonCodes:  prospect.reasonCodes || [],
      signals:      prospect.signals || {},
      warmth,
      nextEvent:    prospect.signals?.nextEvent || '',
    },
    advisor: advisorMessaging,
    channel,
    stage,
    timestamp: new Date().toISOString(),
  };
}

// ── LAYER 2: STRATEGY SELECTOR ────────────────────────────────
function chooseDraftStrategy(ctx) {
  const { personaType, triggerType } = ctx.prospect;
  const personaAngles = ANGLE_MATRIX[personaType] || ANGLE_MATRIX['business_owner'];
  const strategy = personaAngles[triggerType] || personaAngles['general_intro'] || { angle: 'general_niche_intro', cta: 'reply_if_relevant' };

  const angleMeta = ANGLE_META[strategy.angle] || ANGLE_META['general_niche_intro'];
  const ctaMeta   = CTA_PHRASES[strategy.cta]  || CTA_PHRASES['brief_intro_call'];

  return { ...strategy, angleMeta, ctaMeta };
}

// ── LAYER 3: DRAFT GENERATOR ──────────────────────────────────
// Structured template-engine approach — assembles from known-good
// sentence components, never invents facts, respects channel limits.

const _TEMPLATES = {

  // ── EMAIL TEMPLATES ─────────────────────────────────────────
  email: {
    executive_transition: (ctx, strategy, tone) => {
      const { firstName, company, title, city } = ctx.prospect;
      const cta = strategy.ctaMeta.full;
      const variants = {
        A: { id:'A', label:'Direct', subject:`Coordinating finances through your transition, ${firstName}`,
             body:`${firstName},\n\nI work with executives who are navigating career transitions — helping them make smart decisions around retirement income, equity, deferred comp, and taxes before the window closes.\n\nGiven your background${company ? ` at ${company}` : ''}, you likely have complexity in more than one place.\n\nWorth ${cta}? Happy to keep it short.\n\n[Your Name]\n[Firm]` },
        B: { id:'B', label:'Soft', subject:`A question about executives in transition`,
             body:`${firstName},\n\nI've spent a lot of time working with senior executives navigating career changes — particularly around getting their finances positioned well before major decisions get made.\n\nNot a pitch — just wondering if a short conversation might be useful given where you are right now.\n\nIf this lands at the wrong moment, no worries at all.\n\n[Your Name]` },
        C: { id:'C', label:'Insight-Led', subject:`One thing executives in transition often miss`,
             body:`${firstName},\n\nOne pattern I see often with executives ${company ? `leaving companies like ${company}` : 'going through role transitions'}: the first 90 days set the tone for everything — pension timing, severance tax strategy, concentrated stock decisions.\n\nMost advisors address these one at a time. We coordinate all of them.\n\nHappy to ${cta} if the timing is right.\n\n[Your Name]` },
      };
      return variants[tone] || variants.A;
    },

    exit_liquidity: (ctx, strategy, tone) => {
      const { firstName, company } = ctx.prospect;
      const cta = strategy.ctaMeta.full;
      const variants = {
        A: { id:'A', label:'Direct', subject:`Exit planning — coordinating the financial side`,
             body:`${firstName},\n\nBusiness exits create a narrow window to make tax-smart decisions. I specialize in working with owners who are in or approaching that window — coordinating the planning before the deal closes, not after.\n\n${company ? `Given what I know about ${company}, ` : ''}you may have more complexity than a typical exit frame handles.\n\nWould ${cta} make sense?\n\n[Your Name]` },
        B: { id:'B', label:'Soft', subject:`Quick thought on exit planning`,
             body:`${firstName},\n\nI work primarily with business owners navigating exits or major liquidity events. The financial coordination piece — timing, taxes, what comes next — is often the last thing that gets attention and the most important.\n\nNot sure if the timing is right for you, but happy to ${cta} if it is.\n\n[Your Name]` },
        C: { id:'C', label:'Insight-Led', subject:`What most advisors miss on the exit`,
             body:`${firstName},\n\nThe biggest mistake I see in business exits: owners call their financial advisor after the deal is signed. By then, a lot of the tax leverage is gone.\n\nI work with a small group of owners who want to build a financial plan around the exit — not just respond to it afterward.\n\nHappy to ${cta}.\n\n[Your Name]` },
      };
      return variants[tone] || variants.A;
    },

    practice_complexity: (ctx, strategy, tone) => {
      const { firstName, title } = ctx.prospect;
      const cta = strategy.ctaMeta.full;
      const isPhysician = ctx.prospect.nicheId === 'physicians';
      const label = isPhysician ? 'physician' : 'specialist';
      const variants = {
        A: { id:'A', label:'Direct', subject:`Financial planning for ${label}s in practice`,
             body:`${firstName},\n\nI work specifically with ${label}s — helping them navigate practice income complexity, retirement planning gaps, and the financial decisions that come with practice transitions.\n\nMost generalist advisors can manage the portfolio. Fewer understand the planning layer underneath — PSA income, disability coverage gaps, buy-in risk.\n\nWorth ${cta}?\n\n[Your Name]` },
        B: { id:'B', label:'Soft', subject:`A thought for ${label}s on the financial planning side`,
             body:`${firstName},\n\nI've spent years focused on financial planning for ${label}s. The complexity is real — high income, limited time, practice-level risk that most advisors don't address well.\n\nIf any of that resonates, happy to ${cta}.\n\n[Your Name]` },
        C: { id:'C', label:'Insight-Led', subject:`The financial gap most ${label}s don't catch`,
             body:`${firstName},\n\nHigh-income ${label}s are some of the most financially under-advised professionals I work with — not because of access, but because their planning needs are genuinely more complex.\n\nPractice income, student loan payoff timing, disability exposure, retirement structure — these all interact in ways that require someone who works in this lane.\n\nHappy to ${cta} if the timing makes sense.\n\n[Your Name]` },
      };
      return variants[tone] || variants.A;
    },

    owner_succession: (ctx, strategy, tone) => {
      const { firstName, company } = ctx.prospect;
      const cta = strategy.ctaMeta.full;
      const variants = {
        A: { id:'A', label:'Direct', subject:`Succession planning — getting the financial side right`,
             body:`${firstName},\n\nI work with business owners on the financial architecture behind succession — compensation restructuring, buy-sell coordination, and building a plan that survives the transition.\n\n${company ? `Based on what I've seen with owners in ${company}'s space, ` : ''}the planning window is usually shorter than people expect.\n\nWorth ${cta}?\n\n[Your Name]` },
        B: { id:'B', label:'Soft', subject:`Thinking about succession?`,
             body:`${firstName},\n\nI focus on working with business owners who are building toward an exit or transition — not just managing the portfolio, but the full financial picture around it.\n\nIf that's on your radar (even loosely), happy to ${cta}.\n\n[Your Name]` },
        C: { id:'C', label:'Insight-Led', subject:`The owner financial questions that come before the exit`,
             body:`${firstName},\n\nMost business owners I talk to know the exit is coming — but haven't thought through how their personal financial plan integrates with it. Compensation, retained earnings, timing, taxes.\n\nThat gap usually costs more than the advisor fee.\n\nHappy to ${cta} if it's the right moment.\n\n[Your Name]` },
      };
      return variants[tone] || variants.A;
    },

    lifestyle_wealth: (ctx, strategy, tone) => {
      const { firstName, city, state } = ctx.prospect;
      const cta = strategy.ctaMeta.full;
      const geo = city ? `${city}, ${state}` : 'your area';
      const variants = {
        A: { id:'A', label:'Direct', subject:`Wealth planning for aircraft owners in ${geo}`,
             body:`${firstName},\n\nI specialize in financial planning for aircraft owners — coordinating everything from aviation asset planning to estate coordination and wealth management.\n\nMany of my clients are in the ${geo} area. Happy to ${cta} if the timing's right.\n\n[Your Name]` },
        B: { id:'B', label:'Soft', subject:`A thought on aircraft ownership and financial planning`,
             body:`${firstName},\n\nI work with a niche group of clients who are aircraft owners — people who tend to have interesting financial lives beyond just the plane.\n\nNot sure if you're working with an advisor now, but happy to ${cta} if it'd be useful.\n\n[Your Name]` },
        C: { id:'C', label:'Insight-Led', subject:`One thing most advisors miss with aircraft owners`,
             body:`${firstName},\n\nAircraft owners are some of the most interesting planning clients I work with — not because of the plane, but because of everything around it. Insurance exposure, estate coordination, concentrated wealth, lifestyle continuity.\n\nHappy to ${cta} if this resonates.\n\n[Your Name]` },
      };
      return variants[tone] || variants.A;
    },

    philanthropic_planning: (ctx, strategy, tone) => {
      const { firstName } = ctx.prospect;
      const cta = strategy.ctaMeta.full;
      const variants = {
        A: { id:'A', label:'Direct', subject:`Charitable planning for board members`,
             body:`${firstName},\n\nI work with board members and major donors on the financial side of philanthropy — DAFs, charitable trusts, legacy giving, and making sure their giving strategy is as optimized as their personal finances.\n\nHappy to ${cta} if that's an area of interest.\n\n[Your Name]` },
        B: { id:'B', label:'Soft', subject:`A thought on the planning side of philanthropy`,
             body:`${firstName},\n\nMost board members I talk to have a clear sense of *why* they give — but fewer have thought through the financial structure behind it.\n\nIf optimizing the giving side is on your radar, happy to ${cta}.\n\n[Your Name]` },
        C: { id:'C', label:'Insight-Led', subject:`What I see most board members miss on the financial side`,
             body:`${firstName},\n\nBoard-level donors are often generous with their time and resources — but the tax efficiency of their philanthropic strategy varies enormously.\n\nDAFs, QCDs, bunching, trust structures — the right tools save money and increase impact. Most advisors don't work in this lane.\n\nHappy to ${cta}.\n\n[Your Name]` },
      };
      return variants[tone] || variants.A;
    },

    equity_complexity: (ctx, strategy, tone) => {
      const { firstName, company } = ctx.prospect;
      const cta = strategy.ctaMeta.full;
      const variants = {
        A: { id:'A', label:'Direct', subject:`Equity compensation planning${company ? ` — ${company}` : ''}`,
             body:`${firstName},\n\nI work with professionals who have significant equity compensation — RSUs, options, ESPP — helping them think through vesting timelines, tax exposure, and concentration risk before they run out of time to act.\n\nHappy to ${cta}.\n\n[Your Name]` },
        B: { id:'B', label:'Soft', subject:`A quick thought on equity and tax planning`,
             body:`${firstName},\n\nEquity compensation is one of those areas where the decisions made in the first few months really matter for taxes and long-term wealth. I specialize in helping people navigate that.\n\nHappy to ${cta} if equity planning is on your mind.\n\n[Your Name]` },
        C: { id:'C', label:'Insight-Led', subject:`The RSU decision most people make too late`,
             body:`${firstName},\n\nThe most common mistake with significant RSU or stock grants: deciding what to do with them after they vest, instead of planning the strategy before.\n\nTax liability, concentration risk, timing — all of these require advance thinking.\n\nHappy to ${cta}.\n\n[Your Name]` },
      };
      return variants[tone] || variants.A;
    },

    general_niche_intro: (ctx, strategy, tone) => {
      const { firstName, niche } = ctx.prospect;
      const cta = strategy.ctaMeta.full;
      const variants = {
        A: { id:'A', label:'Direct', subject:`Financial planning for ${ctx.prospect.personaType?.replace(/_/g,' ') || 'your situation'}`,
             body:`${firstName},\n\nI specialize in financial planning for clients in your space — and the complexity tends to be different than what generalist advisors are built for.\n\nHappy to ${cta} to see if there's a fit.\n\n[Your Name]` },
        B: { id:'B', label:'Soft', subject:`A quick thought`,
             body:`${firstName},\n\nI work with a specific group of clients who tend to have complex financial lives. Not sure if you're already working with an advisor, but happy to ${cta} if it might be useful.\n\n[Your Name]` },
        C: { id:'C', label:'Insight-Led', subject:`One thing clients in your space ask about most`,
             body:`${firstName},\n\nThe most common question I get from clients similar to you: "Why did I wait so long to have this conversation?"\n\nHappy to ${cta}.\n\n[Your Name]` },
      };
      return variants[tone] || variants.A;
    },

    yacht_lifestyle: (ctx, strategy, tone) => {
      const { firstName, city, state } = ctx.prospect;
      const cta = strategy.ctaMeta.full;
      const geo = city ? `${city}, ${state}` : 'your area';
      const vessel = ctx.prospect.signals?.vesselName ? `your ${ctx.prospect.signals.vesselLength || ''} ${ctx.prospect.signals.vesselType || 'vessel'}` : 'your vessel';
      const variants = {
        A: { id:'A', label:'Direct', subject:`Wealth planning for yacht owners in ${geo}`,
             body:`${firstName},\n\nI work with a select group of clients who own documented vessels — people whose financial lives tend to be more complex than a generalist advisor is built for.\n\nEstate coordination, insurance exposure, concentrated wealth, legacy planning — it all connects.\n\nHappy to ${cta} if the timing's right.\n\n[Your Name]` },
        B: { id:'B', label:'Soft', subject:`A thought on vessel ownership and financial planning`,
             body:`${firstName},\n\nI specialize in working with clients who own private vessels — not because of the boat itself, but because of what tends to surround it: serious wealth, planning gaps, and a lifestyle worth protecting.\n\nNot sure if you're working with an advisor now, but happy to ${cta}.\n\n[Your Name]` },
        C: { id:'C', label:'Insight-Led', subject:`What I see most vessel owners overlook`,
             body:`${firstName},\n\nOwning a documented vessel at your level usually means the wealth picture around it is significant — and often under-coordinated. Insurance gaps, estate titling, concentrated assets.\n\nI work specifically with clients who want that picture managed as well as the vessel itself is.\n\nHappy to ${cta}.\n\n[Your Name]` },
      };
      return variants[tone] || variants.A;
    },
  },

  // ── LINKEDIN NOTE TEMPLATES ──────────────────────────────────
  linkedin: {
    executive_transition: (ctx, s, tone) => {
      const { firstName, company } = ctx.prospect;
      return {
        A: { id:'A', label:'Direct',      body:`${firstName} — I work with executives navigating transitions${company?` like what I've seen from ${company}`:''}. Complex finances, narrow windows. Happy to connect if it's relevant.` },
        B: { id:'B', label:'Soft',        body:`${firstName} — I specialize in financial planning for executives in transition moments. No agenda — just connecting with people going through a similar chapter. Happy to see if a quick conversation is useful.` },
        C: { id:'C', label:'Insight-Led', body:`${firstName} — a lot of the financial complexity for senior execs shows up in the first 90 days of a transition. I work specifically in that window. Happy to connect.` },
      }[tone] || { id:'A', label:'Direct', body:`${firstName} — I specialize in financial planning for executives in transition. Happy to connect if that's where you are.` };
    },
    exit_liquidity: (ctx, s, tone) => {
      const { firstName } = ctx.prospect;
      return {
        A: { id:'A', label:'Direct',      body:`${firstName} — I work with business owners coordinating the financial side of exits. Tax, timing, what comes next. Happy to connect if relevant.` },
        B: { id:'B', label:'Soft',        body:`${firstName} — exits are complex. I help owners get the financial picture right before (and after) the deal. Happy to connect if the timing's right.` },
        C: { id:'C', label:'Insight-Led', body:`${firstName} — most owners call the financial advisor after the deal is signed. The best ones start earlier. I work in that window. Happy to connect.` },
      }[tone] || { id:'A', label:'Direct', body:`${firstName} — I work with business owners on exit planning. Happy to connect.` };
    },
    practice_complexity: (ctx, s, tone) => {
      const { firstName } = ctx.prospect;
      return {
        A: { id:'A', label:'Direct',      body:`${firstName} — I specialize in financial planning for physicians and specialists. Practice income, retirement, transitions. Happy to connect if relevant.` },
        B: { id:'B', label:'Soft',        body:`${firstName} — I work exclusively with medical professionals. Not a pitch — just connecting with people whose financial lives tend to be more complex than most advisors handle well.` },
        C: { id:'C', label:'Insight-Led', body:`${firstName} — high-income specialists are some of the most under-planned professionals I work with. Not because of access, but because the complexity is real. Happy to connect.` },
      }[tone] || { id:'A', label:'Direct', body:`${firstName} — I specialize in financial planning for specialists. Happy to connect.` };
    },
    _default: (ctx, s, tone) => {
      const { firstName } = ctx.prospect;
      return {
        A: { id:'A', label:'Direct',      body:`${firstName} — I specialize in financial planning for professionals in your space. Happy to connect if relevant.` },
        B: { id:'B', label:'Soft',        body:`${firstName} — I work with a specific group of clients who tend to have complex financial situations. Happy to connect.` },
        C: { id:'C', label:'Insight-Led', body:`${firstName} — the financial questions people in your position ask are different. I work specifically in that lane. Happy to connect.` },
      }[tone] || { id:'A', label:'Direct', body:`${firstName} — happy to connect and see if a conversation would be useful.` };
    },
  },

  // ── CALL OPENER TEMPLATES ────────────────────────────────────
  call: {
    _default: (ctx, s, tone) => {
      const { firstName } = ctx.prospect;
      return {
        A: { id:'A', label:'Direct',      body:`"Hi ${firstName}, this is [Your Name] from [Firm]. I work with ${ctx.prospect.personaType?.replace(/_/g,' ') || 'professionals'} on complex financial planning — not a long call, just wondering if you have 20 seconds to hear why I'm reaching out?"` },
        B: { id:'B', label:'Soft',        body:`"${firstName}, hi — [Your Name] from [Firm]. I know this is out of the blue. I specialize in financial planning for people in your situation and thought it was worth a quick hello. Do you have 30 seconds?"` },
        C: { id:'C', label:'Insight-Led', body:`"Hi ${firstName} — [Your Name] from [Firm]. One quick thing: I've been working with a few clients going through similar situations to yours and I'd love to share one thing that's been useful. 20 seconds — worth it?"` },
      }[tone] || { id:'A', label:'Direct', body:`"Hi ${firstName}, [Your Name] from [Firm]. I specialize in financial planning for professionals in your space — do you have 20 seconds?"` };
    },
  },

  // ── VOICEMAIL TEMPLATES ──────────────────────────────────────
  voicemail: {
    _default: (ctx, s, tone) => {
      const { firstName } = ctx.prospect;
      return {
        A: { id:'A', label:'Direct',      body:`"${firstName}, [Your Name] at [Firm], [number]. I work specifically with ${ctx.prospect.personaType?.replace(/_/g,' ') || 'professionals'} — thought it might be worth a 15-minute conversation. No pressure — call or text back if you're curious."` },
        B: { id:'B', label:'Soft',        body:`"Hey ${firstName}, [Your Name] from [Firm]. Leaving a quick message — I work with a handful of people in your world on financial planning and thought it was worth reaching out. If it feels relevant, I'm at [number]. No worries either way."` },
        C: { id:'C', label:'Insight-Led', body:`"${firstName}, [Your Name] at [Firm]. Quick thought: one planning move that comes up a lot with clients in your position that most advisors don't address. Happy to share it in 10 minutes. [Number] — text or call whenever."` },
      }[tone] || { id:'A', label:'Direct', body:`"${firstName}, [Your Name] at [Firm], [number]. I specialize in financial planning for professionals like you — happy to connect if useful."` };
    },
  },
};

// ── LAYER 4: SAFETY FILTER ────────────────────────────────────
function validateDraftOutput(output, bannedPhrases = []) {
  const flags  = [];
  const body   = (output.variants || []).map(v => v.body + ' ' + (v.subject || '')).join(' ');
  const lower  = body.toLowerCase();

  // Universal risk checks
  if (lower.includes('net worth') || lower.includes('your assets'))
    flags.push('⚠️ Avoid implying knowledge of prospect wealth figures');
  if (lower.includes('i know you were') || lower.includes('i saw that you'))
    flags.push('⚠️ Avoid language that implies surveillance or scraped data');
  if (lower.includes('recently laid off') || lower.includes('just got fired'))
    flags.push('⚠️ Soften language around employment events — keep dignified');
  if (lower.includes('database') || lower.includes('scraped') || lower.includes('data provider'))
    flags.push('⚠️ Remove references to data sourcing');

  // Custom banned phrases from advisor profile
  bannedPhrases.forEach(phrase => {
    if (phrase && lower.includes(phrase.toLowerCase()))
      flags.push(`⚠️ Banned phrase detected: "${phrase}"`);
  });

  return flags;
}

// ── LAYER 5: MAIN GENERATE FUNCTION ──────────────────────────
function generateCustomizedDraft(prospect, channel = 'email', stage = 'first_touch') {
  const ctx      = buildDraftContext(prospect, channel, stage);
  const strategy = chooseDraftStrategy(ctx);
  const angle    = strategy.angle;

  // Get template set for this channel + angle
  const channelTemplates = _TEMPLATES[channel] || _TEMPLATES.email;
  const templateFn = channelTemplates[angle] || channelTemplates['_default'] || _TEMPLATES.email.general_niche_intro;

  // Generate all 3 tones
  const tones   = ['A', 'B', 'C'];
  const variants = tones.map(t => {
    const v = templateFn(ctx, strategy, t);
    return { ...v, length: channel === 'email' ? 'medium' : 'short' };
  });

  // Safety filter
  const riskFlags = validateDraftOutput({ variants }, ctx.advisor.bannedPhrases);

  return {
    angle,
    angleLabel:   strategy.angleMeta.label,
    reason:       strategy.angleMeta.why,
    channel,
    tone:         ctx.advisor.toneStyle || 'professional_warm',
    ctaKey:       strategy.cta,
    ctaLabel:     strategy.ctaMeta.short,
    riskFlags,
    variants,
    prospectName: ctx.prospect.fullName,
    company:      ctx.prospect.company,
    advisorNiche: ctx.advisor.primaryNiche,
    generatedAt:  new Date().toISOString(),
  };
}

// ── UI STATE ──────────────────────────────────────────────────
let _currentDraftResult  = null;
let _activeVariantId     = 'A';
let _activeDraftChannel  = 'email';
let _activeDraftStage    = 'first_touch';

// ── RENDER: Angle / Reason / Tone / CTA metadata bar ─────────
function renderDraftMetaBar(result) {
  if (!result) return '';
  const risk = result.riskFlags.length > 0
    ? `<span class="risk-pill">⚠️ ${result.riskFlags[0]}</span>`
    : `<span class="clean-pill">✅ No compliance flags</span>`;

  return `
  <div class="agent-meta-bar" id="agent-meta-bar">
    <div class="agent-meta-grid">
      <div class="agent-meta-item">
        <div class="agent-meta-label">Angle</div>
        <div class="agent-meta-value">${result.angleLabel}</div>
      </div>
      <div class="agent-meta-item">
        <div class="agent-meta-label">Why</div>
        <div class="agent-meta-value agent-meta-why">${result.reason}</div>
      </div>
      <div class="agent-meta-item">
        <div class="agent-meta-label">Tone</div>
        <div class="agent-meta-value">${result.tone?.replace(/_/g,' ') || 'Professional'}</div>
      </div>
      <div class="agent-meta-item">
        <div class="agent-meta-label">CTA</div>
        <div class="agent-meta-value">${result.ctaLabel}</div>
      </div>
    </div>
    <div class="agent-meta-flags">${risk}</div>
  </div>`;
}

// ── RENDER: Variant tabs (A / B / C) ─────────────────────────
function renderVariantTabs(result) {
  if (!result?.variants?.length) return '';
  return `
  <div class="variant-tabs" id="variant-tabs">
    ${result.variants.map(v => `
    <button class="variant-tab ${v.id === _activeVariantId ? 'active' : ''}"
            id="vtab-${v.id}"
            onclick="selectVariant('${v.id}')">
      <span class="variant-tab-id">${v.id}</span>
      <span class="variant-tab-label">${v.label}</span>
    </button>`).join('')}
  </div>`;
}

// ── RENDER: Action buttons ────────────────────────────────────
function renderAgentActionButtons() {
  return `
  <div class="agent-action-row" id="agent-action-row">
    <button class="agent-action-btn primary" onclick="runCustomAgent()">💎 Generate 3 Angles</button>
    <button class="agent-action-btn" onclick="shiftTone('direct')">📌 More Direct</button>
    <button class="agent-action-btn" onclick="shiftTone('specific')">🎯 More Specific</button>
    <button class="agent-action-btn" onclick="shiftTone('safe')">🔒 Safer</button>
    <div class="agent-action-sep"></div>
    <button class="agent-action-btn channel ${_activeDraftChannel==='linkedin'?'active':''}" onclick="switchDraftChannel('linkedin')">💼 LinkedIn</button>
    <button class="agent-action-btn channel ${_activeDraftChannel==='voicemail'?'active':''}" onclick="switchDraftChannel('voicemail')">📣 Voicemail</button>
    <button class="agent-action-btn channel ${_activeDraftChannel==='call'?'active':''}" onclick="switchDraftChannel('call')">📞 Call</button>
    <button class="agent-action-btn channel ${_activeDraftChannel==='email'?'active':''}" onclick="switchDraftChannel('email')">✉️ Email</button>
  </div>`;
}

// ── APPLY variant to editor ───────────────────────────────────
function selectVariant(id) {
  _activeVariantId = id;
  if (!_currentDraftResult) return;
  const v = _currentDraftResult.variants.find(x => x.id === id);
  if (!v) return;

  // Update tab active state
  document.querySelectorAll('.variant-tab').forEach(t => t.classList.remove('active'));
  const tab = document.getElementById(`vtab-${id}`);
  if (tab) tab.classList.add('active');

  // Update subject line if visible
  const subjEl = document.getElementById('draft-subject');
  if (subjEl && v.subject) subjEl.textContent = v.subject;

  // Update body
  const bodyEl = document.getElementById('draft-body');
  if (bodyEl) {
    bodyEl.style.opacity = '0.5';
    setTimeout(() => { bodyEl.textContent = v.body; bodyEl.style.opacity = '1'; }, 150);
  }
}

// ── RUN AGENT (called from Generate button) ───────────────────
function runCustomAgent(channel) {
  const ch = channel || _activeDraftChannel || activeOutreachType || 'email';
  _activeDraftChannel = ch;

  const prospect = PROSPECTS.find(p => p.id === activeOutreachProspectId) || PROSPECTS[0];
  if (!prospect) return;

  // Show "thinking" state
  const metaBar = document.getElementById('agent-meta-bar');
  if (metaBar) metaBar.style.opacity = '0.4';
  const bodyEl = document.getElementById('draft-body');
  if (bodyEl) bodyEl.style.opacity = '0.3';

  setTimeout(() => {
    _currentDraftResult = generateCustomizedDraft(prospect, ch, _activeDraftStage);
    _activeVariantId = 'A';

    // Inject metadata bar
    const newMeta = document.getElementById('agent-meta-bar');
    if (newMeta) newMeta.outerHTML = renderDraftMetaBar(_currentDraftResult);

    // Inject variant tabs
    const tabsEl = document.getElementById('variant-tabs');
    if (tabsEl) tabsEl.outerHTML = renderVariantTabs(_currentDraftResult);

    // Apply variant A
    const v = _currentDraftResult.variants[0];
    if (v) {
      const subjEl = document.getElementById('draft-subject');
      if (subjEl && v.subject) subjEl.textContent = v.subject;
      if (bodyEl) { bodyEl.textContent = v.body; bodyEl.style.opacity = '1'; }
    }

    // Refresh action buttons' channel active state
    const actionRow = document.getElementById('agent-action-row');
    if (actionRow) actionRow.outerHTML = renderAgentActionButtons();

    showToast(`${_currentDraftResult.angleLabel} — 3 variants ready`, '💎');
  }, 600);
}

// ── TONE SHIFTER ──────────────────────────────────────────────
function shiftTone(mode) {
  if (!_currentDraftResult) { runCustomAgent(); return; }
  // Cycle variants: direct=A, specific=B, safe=C
  const map = { direct: 'A', specific: 'B', safe: 'C' };
  selectVariant(map[mode] || 'A');
  showToast(mode === 'direct' ? 'More direct tone' : mode === 'specific' ? 'More specific angle' : 'Safer compliance mode', '🔄');
}

// ── CHANNEL SWITCHER ──────────────────────────────────────────
function switchDraftChannel(ch) {
  _activeDraftChannel = ch;
  runCustomAgent(ch);
  // Also sync the main channel selector
  document.querySelectorAll('.outreach-type-btn').forEach(b => b.classList.remove('active'));
  const idx = ['email','call','linkedin','voicemail'].indexOf(ch);
  const btns = document.querySelectorAll('.outreach-type-btn');
  if (btns[idx]) btns[idx].classList.add('active');
}

// ── getDraftFromAgent — replaces old getDraft() ───────────────
// Returns the agent's variant A body as the initial draft
function getDraftFromAgent(prospect, channel) {
  if (!prospect) return '';
  const result = generateCustomizedDraft(prospect, channel || 'email', 'first_touch');
  _currentDraftResult = result;
  _activeVariantId = 'A';
  return result.variants[0]?.body || '';
}
