// ==========================================
// THE AUM ENGINE — NICHE MAPPING ENGINE v2.0
// Macro → Meso → Micro → Results
// 85-question bank · 12 niches · 5 zones
// ==========================================

// ===== ZONE CONFIG =====
const NICHE_ZONE_CONFIG = {
  fit:     { label: 'Background Fit',  weight: 1.8, desc: 'Your experience & credibility alignment' },
  focus:   { label: 'Specialization',  weight: 1.4, desc: 'Depth of commitment to this niche' },
  market:  { label: 'Market Depth',    weight: 1.3, desc: 'Geographic & community opportunity' },
  access:  { label: 'Entry Points',    weight: 1.5, desc: 'Existing warm relationships & channels' },
  service: { label: 'Service Match',   weight: 1.2, desc: 'Your model vs what this niche needs' },
};

// ===== 12 NICHES =====
const NICHE_MAP = {
  n1:  { name: 'Aircraft Owners',          icon: '✈️',  color: '#60a5fa', cluster: 'affluence-hobbies'     },
  n2:  { name: 'Physicians',               icon: '👩‍⚕️', color: '#fb7185', cluster: 'licensed-professionals' },
  n3:  { name: 'Business Owners',          icon: '🏢',  color: '#a78bfa', cluster: 'owners-builders'        },
  n4:  { name: 'Law Partners',             icon: '⚖️',  color: '#f59e0b', cluster: 'licensed-professionals' },
  n5:  { name: 'HENRYs',                   icon: '🚀',  color: '#22d3ee', cluster: 'emerging-wealth'        },
  n6:  { name: 'C-Suite Executives',       icon: '👔',  color: '#34d399', cluster: 'corporate-executives'   },
  n7:  { name: 'AI-Displaced Executives',  icon: '🤖',  color: '#fbbf24', cluster: 'corporate-executives'   },
  n8:  { name: 'Dentists & Specialists',   icon: '🦷',  color: '#e879f9', cluster: 'licensed-professionals' },
  n9:  { name: 'High Earning Tradesman',   icon: '🔧',  color: '#4ade80', cluster: 'owners-builders'        },
  n10: { name: 'Inheritance Recipients',   icon: '💰',  color: '#facc15', cluster: 'money-in-motion'        },
  n11: { name: 'Real Estate Developers',   icon: '🏗️',  color: '#f97316', cluster: 'owners-builders'        },
  n12: { name: 'Charity Boards',           icon: '🎗️',  color: '#2dd4bf', cluster: 'community-influence'    },
};

// ===== LAYER 1: MACRO — always shown (8 questions) =====
const MACRO_QUESTIONS = [
  {
    id: 'm1', layer: 'macro', zone: 'fit',
    text: 'How strongly does your current client base already cluster around one profession, life stage, or wealth situation?',
    options: ['No clustering at all', 'Slight lean', 'About 30–40% in one group', 'More than half in one group', 'Almost entirely one type'],
    nicheWeights: { n2:1.0, n3:1.0, n4:1.0, n6:0.8, n8:1.0, n10:0.7, n11:0.8 },
  },
  {
    id: 'm2', layer: 'macro', zone: 'access',
    text: 'How many real warm-network entry points do you have into any specific niche community today?',
    options: ['None', '1–2 loose contacts', 'A handful of warm connections', 'A strong referral orbit', 'Multiple active channels'],
    nicheWeights: { n2:0.9, n3:1.0, n4:0.9, n6:0.8, n12:1.2, n10:0.8 },
  },
  {
    id: 'm3', layer: 'macro', zone: 'focus',
    text: 'How comfortable are you building highly tailored messaging for a narrow audience vs. speaking broadly to everyone?',
    options: ['I prefer being a generalist', 'Slightly open to specializing', 'Comfortable narrowing focus', 'Committed to a niche', 'Fully niche-only philosophy'],
    nicheWeights: { n2:1.0, n3:1.0, n4:1.0, n7:1.1, n8:1.0, n10:0.9, n6:1.0 },
  },
  {
    id: 'm4', layer: 'macro', zone: 'service',
    text: 'How strong is your team at solving complex planning issues beyond investment allocation?',
    options: ['We focus on investments mainly', 'Some planning depth', 'Solid planning capability', 'Strong complex planning', 'Deep multi-discipline expertise'],
    nicheWeights: { n2:1.1, n3:1.0, n4:1.0, n6:1.0, n7:1.2, n8:1.1, n10:1.2, n11:1.0 },
  },
  {
    id: 'm5', layer: 'macro', zone: 'market',
    text: 'How deep is the affluent-household opportunity in your geography or natural service reach?',
    options: ['Very limited', 'Some opportunity', 'Moderate base', 'Strong market', 'Dense high-wealth metro'],
    nicheWeights: { n1:0.8, n2:1.0, n3:1.0, n5:0.9, n6:1.0, n9:0.8, n11:1.0, n12:0.8 },
  },
  {
    id: 'm6', layer: 'macro', zone: 'fit',
    text: 'How much lived credibility do you personally have with business owners, licensed professionals, or executives?',
    options: ['Very little', 'Some exposure', 'Moderate credibility', 'Strong personal credibility', 'Deep — former colleague or peer'],
    nicheWeights: { n2:1.0, n3:1.1, n4:1.0, n6:1.0, n7:0.9, n8:1.0, n11:1.0, n9:0.8 },
  },
  {
    id: 'm7', layer: 'macro', zone: 'access',
    text: 'How often do referrals or warm introductions come to you organically without paid marketing?',
    options: ['Rarely or never', 'A few per year', 'Monthly', 'Weekly', 'Consistently — strong COI network'],
    nicheWeights: { n2:0.9, n3:1.0, n4:1.0, n8:0.9, n12:1.2, n10:0.9 },
  },
  {
    id: 'm8', layer: 'macro', zone: 'service',
    text: 'How comfortable are you advising around taxes, exits, estate complexity, equity comp, or sudden liquidity events?',
    options: ['Not my strength', 'Basic familiarity', 'Moderate capability', 'Confident advisor', 'Expert — I lead these conversations'],
    nicheWeights: { n3:1.1, n6:1.0, n7:1.2, n10:1.2, n11:1.1, n4:1.0, n2:0.9 },
  },
];

// ===== LAYER 2: MESO — cluster refinement (12 questions, show 8–10) =====
const MESO_QUESTIONS = [
  {
    id: 'c1', layer: 'meso', cluster: 'licensed-professionals', zone: 'fit',
    text: 'How often do you work with clients whose careers require licenses, credentials, or a private practice?',
    options: ['Never', 'Rarely', 'Sometimes', 'Often', 'This is my primary client type'],
    nicheWeights: { n2:1.2, n4:1.0, n8:1.2 },
  },
  {
    id: 'c2', layer: 'meso', cluster: 'licensed-professionals', zone: 'access',
    text: 'Do you have connections into hospitals, physician groups, dental associations, or legal networks?',
    options: ['None', 'Vague awareness', 'A contact or two', 'Moderate access', 'Strong existing relationships'],
    nicheWeights: { n2:1.2, n4:1.0, n8:1.1 },
  },
  {
    id: 'c3', layer: 'meso', cluster: 'owners-builders', zone: 'service',
    text: 'How strong is your planning around business cash flow, succession, entity strategy, or exit readiness?',
    options: ['Not a focus area', 'Basic capability', 'Moderate strength', 'Strong', 'Expert — I lead exits regularly'],
    nicheWeights: { n3:1.2, n9:1.0, n11:1.1 },
  },
  {
    id: 'c4', layer: 'meso', cluster: 'owners-builders', zone: 'access',
    text: 'How many business owners, builders, contractors, or developers are realistically in your referral orbit today?',
    options: ['None', '1–3', '4–10', '10–25', '25+'],
    nicheWeights: { n3:1.1, n9:1.1, n11:1.1 },
  },
  {
    id: 'c5', layer: 'meso', cluster: 'corporate-executives', zone: 'service',
    text: 'How comfortable are you advising on concentrated stock, deferred comp, RSUs, or executive severance?',
    options: ['Not comfortable', 'Surface familiarity', 'Adequate', 'Strong', 'Expert — taught or published on this'],
    nicheWeights: { n6:1.2, n7:1.3 },
  },
  {
    id: 'c6', layer: 'meso', cluster: 'corporate-executives', zone: 'access',
    text: 'Do you have warm reach into corporate leadership circles, alumni networks, or large-employer communities?',
    options: ['No', 'A loose contact or two', 'Some access', 'Good access', 'Active in these circles'],
    nicheWeights: { n6:1.1, n7:1.0 },
  },
  {
    id: 'c7', layer: 'meso', cluster: 'money-in-motion', zone: 'service',
    text: 'How equipped is your firm to handle inheritance, probate, trust transitions, or sudden cash events?',
    options: ['Not equipped', 'Basic capability', 'Moderate', 'Strong — done it many times', 'This is a specialty'],
    nicheWeights: { n10:1.3 },
  },
  {
    id: 'c8', layer: 'meso', cluster: 'money-in-motion', zone: 'access',
    text: 'Do you have trusted relationships with attorneys, CPAs, executors, or COIs connected to wealth transfer events?',
    options: ['None', '1–2 loose', 'A few warm', 'A solid referral network', 'Multiple active pipelines'],
    nicheWeights: { n10:1.2, n4:0.6, n12:0.6 },
  },
  {
    id: 'c9', layer: 'meso', cluster: 'community-influence', zone: 'access',
    text: 'How active are you in donor circles, nonprofit boards, civic groups, or charitable communities?',
    options: ['Not active', 'Occasional attendee', 'Regular attendee', 'Active member', 'Board member or major donor'],
    nicheWeights: { n12:1.3 },
  },
  {
    id: 'c10', layer: 'meso', cluster: 'emerging-wealth', zone: 'market',
    text: 'How much opportunity do you see among high earners under 45 who are asset-rich in potential but under-advised?',
    options: ['Very little', 'Some', 'Moderate', 'Strong', 'This is my fastest-growing segment'],
    nicheWeights: { n5:1.3 },
  },
  {
    id: 'c11', layer: 'meso', cluster: 'affluence-hobbies', zone: 'fit',
    text: 'How naturally do you connect with clients whose wealth is visible through lifestyle — aviation, collecting, or high-cost hobbies?',
    options: ['Not my world', 'Mildly relatable', 'Some common ground', 'Very comfortable', 'I share these interests'],
    nicheWeights: { n1:1.3 },
  },
  {
    id: 'c12', layer: 'meso', cluster: 'owners-builders', zone: 'market',
    text: 'How concentrated is your geography in privately held businesses, trade entrepreneurs, and property operators?',
    options: ['Very sparse', 'Some presence', 'Moderate density', 'Rich ecosystem', 'Dense — core of my market'],
    nicheWeights: { n3:1.0, n9:1.0, n11:1.1 },
  },
];

// ===== LAYER 3: MICRO — niche-specific deep dive (44 questions, show top 6–10) =====
const MICRO_QUESTIONS = [
  // PHYSICIANS (n2) — 5 questions
  { id: 'p1', layer: 'micro', niche: 'n2', zone: 'fit',
    text: 'How often have you advised physicians or surgeons on practice income complexity, student debt, or tax-heavy cash flow?',
    options: ['Never', 'Once or twice', 'A few times', 'Regularly', 'This is a primary focus'],
    nicheWeights: { n2:1.4 } },
  { id: 'p2', layer: 'micro', niche: 'n2', zone: 'access',
    text: 'Do you have relationships with physician groups, hospital administrators, or medical recruiters who could open doors?',
    options: ['None', '1–2 loose', 'A few warm', 'Strong access', 'Active referral pipeline'],
    nicheWeights: { n2:1.3 } },
  { id: 'p3', layer: 'micro', niche: 'n2', zone: 'service',
    text: 'How well does your firm solve planning tied to high income, limited time, malpractice concerns, and practice transitions?',
    options: ['Not our strength', 'Basic', 'Moderate', 'Strong', 'Expert — physician-specific process'],
    nicheWeights: { n2:1.3 } },
  { id: 'p4', layer: 'micro', niche: 'n2', zone: 'focus',
    text: 'Could you explain in one sentence why a physician should choose you over a generalist advisor?',
    options: ['No, not yet', 'Vague idea', 'Rough draft', 'Clear and rehearsed', 'Yes — battle-tested pitch'],
    nicheWeights: { n2:1.2 } },
  { id: 'p5', layer: 'micro', niche: 'n2', zone: 'market',
    text: 'How many physician practices, hospital systems, or specialty groups are within your natural geographic reach?',
    options: ['Very few', 'A handful', 'A moderate number', 'Many', 'Dense — major medical hub'],
    nicheWeights: { n2:1.1 } },

  // BUSINESS OWNERS (n3) — 5 questions
  { id: 'b1', layer: 'micro', niche: 'n3', zone: 'fit',
    text: 'How often have you advised privately held business owners on succession, liquidity, or owner compensation planning?',
    options: ['Never', 'Once or twice', 'A few times', 'Regularly', 'Core expertise'],
    nicheWeights: { n3:1.4 } },
  { id: 'b2', layer: 'micro', niche: 'n3', zone: 'access',
    text: 'How many accountants, attorneys, lenders, or consultants in your network could introduce you to business owners?',
    options: ['None', '1–2', '3–5', '6–15', '15+'],
    nicheWeights: { n3:1.3 } },
  { id: 'b3', layer: 'micro', niche: 'n3', zone: 'service',
    text: 'How strong is your team in exit planning, buy-sell coordination, and tax-efficient liquidity planning?',
    options: ['Not our strength', 'Basic', 'Moderate', 'Strong', 'Expert — we run exits'],
    nicheWeights: { n3:1.3 } },
  { id: 'b4', layer: 'micro', niche: 'n3', zone: 'market',
    text: 'How many owner-led firms in your area fit the size and profile you would actually want to prospect?',
    options: ['Very few', 'A handful', 'A moderate pool', 'A large pool', 'Enormous opportunity'],
    nicheWeights: { n3:1.2 } },
  { id: 'b5', layer: 'micro', niche: 'n3', zone: 'focus',
    text: 'Do you have or are you building a specific offer (workshop, guide, checklist) designed for business owners?',
    options: ['No', 'Thinking about it', 'In progress', 'Yes — soft launched', 'Yes — established'],
    nicheWeights: { n3:1.1 } },

  // AI-DISPLACED EXECUTIVES (n7) — 5 questions
  { id: 'a1', layer: 'micro', niche: 'n7', zone: 'fit',
    text: 'How comfortable are you advising displaced tech executives on RSUs, severance, option windows, and cash management after a layoff?',
    options: ['Not at all', 'Basic awareness', 'Adequate', 'Confident', 'Expert — I specialize in this'],
    nicheWeights: { n7:1.5 } },
  { id: 'a2', layer: 'micro', niche: 'n7', zone: 'access',
    text: 'Do you have access to alumni, tech, venture, or executive communities where role transitions are discussed?',
    options: ['None', 'Marginal', 'Some', 'Good access', 'Active in these communities'],
    nicheWeights: { n7:1.3 } },
  { id: 'a3', layer: 'micro', niche: 'n7', zone: 'service',
    text: 'Could your firm credibly lead with an executive-exit guide, tax checklist, or concentrated-stock transition framework?',
    options: ['No capability', 'Could develop it', 'Have some material', 'Yes — ready to go', 'Yes — published and tested'],
    nicheWeights: { n7:1.3 } },
  { id: 'a4', layer: 'micro', niche: 'n7', zone: 'focus',
    text: 'How specific is your message for someone leaving Amazon, Meta, Google, Salesforce, or another large employer?',
    options: ['Generic', 'Slightly tailored', 'Moderate specificity', 'Very specific', 'Company-level playbooks ready'],
    nicheWeights: { n7:1.2 } },
  { id: 'a5', layer: 'micro', niche: 'n7', zone: 'market',
    text: 'Have you seen news coverage of tech/AI layoffs or exec restructuring in your region in the past 24 months?',
    options: ['None', 'Minimal', 'Some', 'Moderate wave', 'Major — several large employers'],
    nicheWeights: { n7:1.1 } },

  // INHERITANCE RECIPIENTS (n10) — 4 questions
  { id: 'i1', layer: 'micro', niche: 'n10', zone: 'service',
    text: 'How prepared is your firm to lead with estate settlement, inherited IRA decisions, and cash deployment after loss?',
    options: ['Not prepared', 'Basic', 'Moderate', 'Strong', 'Expert — clear process'],
    nicheWeights: { n10:1.5 } },
  { id: 'i2', layer: 'micro', niche: 'n10', zone: 'access',
    text: 'How strong are your attorney, executor, CPA, or family office relationships around inheritance events?',
    options: ['None', '1–2 loose', 'A few warm', 'Strong', 'Multiple active pipelines'],
    nicheWeights: { n10:1.3 } },
  { id: 'i3', layer: 'micro', niche: 'n10', zone: 'fit',
    text: 'Have you personally guided beneficiaries through the emotional and financial complexity of a large inheritance?',
    options: ['Never', 'Once or twice', 'A few times', 'Regularly', 'This is a specialty'],
    nicheWeights: { n10:1.3 } },
  { id: 'i4', layer: 'micro', niche: 'n10', zone: 'focus',
    text: 'Do you have a "sudden wealth" onboarding process tailored to beneficiaries who feel overwhelmed?',
    options: ['No', 'Thinking about it', 'Partial process', 'Yes — documented', 'Yes — refined and tested'],
    nicheWeights: { n10:1.2 } },

  // LAW PARTNERS (n4) — 4 questions
  { id: 'l1', layer: 'micro', niche: 'n4', zone: 'fit',
    text: 'How much experience do you have advising attorneys with uneven cash flow, equity interest, or complex tax exposure?',
    options: ['None', 'Occasional', 'Some', 'Regular', 'Niche specialty'],
    nicheWeights: { n4:1.4 } },
  { id: 'l2', layer: 'micro', niche: 'n4', zone: 'access',
    text: 'How strong is your access to law firms, bar associations, or attorney referral relationships?',
    options: ['None', 'Loose contacts', 'A few warm', 'Strong', 'Active referral channel'],
    nicheWeights: { n4:1.3 } },
  { id: 'l3', layer: 'micro', niche: 'n4', zone: 'service',
    text: 'How capable is your firm in advising on law firm buyouts, partner capital accounts, and K-1 complexity?',
    options: ['Not our strength', 'Basic', 'Moderate', 'Strong', 'Expert'],
    nicheWeights: { n4:1.3 } },
  { id: 'l4', layer: 'micro', niche: 'n4', zone: 'focus',
    text: 'Could you credibly host a lunch-and-learn or webinar for a law firm on partner retirement planning?',
    options: ['Not yet', 'Maybe with help', 'Probably', 'Yes', 'Yes — already done it'],
    nicheWeights: { n4:1.1 } },

  // DENTISTS & SPECIALISTS (n8) — 4 questions
  { id: 'd1', layer: 'micro', niche: 'n8', zone: 'fit',
    text: 'How often do you advise dentists or medical specialists on practice value, buy-in/out, or high-income cash flow?',
    options: ['Never', 'Once or twice', 'A few times', 'Regularly', 'Core of my book'],
    nicheWeights: { n8:1.4 } },
  { id: 'd2', layer: 'micro', niche: 'n8', zone: 'access',
    text: 'Do you have relationships with dental consultants, practice lenders, DSOs, or specialists who influence owners?',
    options: ['None', 'Loose contacts', 'A few warm', 'Strong', 'Active referral pipeline'],
    nicheWeights: { n8:1.3 } },
  { id: 'd3', layer: 'micro', niche: 'n8', zone: 'service',
    text: 'How well can your firm advise on dental practice acquisition financing, disability protection, and retirement funding?',
    options: ['Not our strength', 'Basic', 'Moderate', 'Strong', 'Expert — turnkey process'],
    nicheWeights: { n8:1.2 } },
  { id: 'd4', layer: 'micro', niche: 'n8', zone: 'market',
    text: 'How many dental practices or specialist offices are within a 20-mile radius of your primary office?',
    options: ['Very few', 'A handful', 'A moderate number', 'Many', 'Dense market'],
    nicheWeights: { n8:1.1 } },

  // C-SUITE EXECUTIVES (n6) — 4 questions
  { id: 'e1', layer: 'micro', niche: 'n6', zone: 'service',
    text: 'How capable is your firm in advising on deferred comp, concentration risk, philanthropy, and executive transitions?',
    options: ['Not our strength', 'Basic', 'Moderate', 'Strong', 'Expert'],
    nicheWeights: { n6:1.4 } },
  { id: 'e2', layer: 'micro', niche: 'n6', zone: 'access',
    text: 'How realistic is it today for you to get warm introductions into senior leadership or board-level circles?',
    options: ['Very unlikely', 'Slim chance', 'Possible', 'Likely', 'I already have this'],
    nicheWeights: { n6:1.3 } },
  { id: 'e3', layer: 'micro', niche: 'n6', zone: 'fit',
    text: 'Have you personally worked alongside or advised C-Suite leaders at publicly traded or large private corporations?',
    options: ['Never', 'Once or twice', 'A few times', 'Regularly', 'Veteran of this world'],
    nicheWeights: { n6:1.3 } },
  { id: 'e4', layer: 'micro', niche: 'n6', zone: 'focus',
    text: 'How tailored is your pitch for a CFO or COO vs. a generalist prospect?',
    options: ['Not tailored', 'Slightly different', 'Noticeably distinct', 'Highly specific', 'Executive-only playbook'],
    nicheWeights: { n6:1.1 } },

  // REAL ESTATE DEVELOPERS (n11) — 4 questions
  { id: 'r1', layer: 'micro', niche: 'n11', zone: 'fit',
    text: 'How often do you work with developers or operators facing leverage, liquidity, partnership, or 1031-related complexity?',
    options: ['Never', 'Once or twice', 'A few times', 'Regularly', 'Core expertise'],
    nicheWeights: { n11:1.4 } },
  { id: 'r2', layer: 'micro', niche: 'n11', zone: 'access',
    text: 'Do you have meaningful reach into real estate investor, builder, or developer communities in your market?',
    options: ['None', 'A contact or two', 'Some', 'Good access', 'Active in these circles'],
    nicheWeights: { n11:1.3 } },
  { id: 'r3', layer: 'micro', niche: 'n11', zone: 'service',
    text: 'How well can your firm advise on deal-level tax planning, DSTs, 1031 exchanges, and concentrated real estate risk?',
    options: ['Not our strength', 'Basic', 'Moderate', 'Strong', 'Expert'],
    nicheWeights: { n11:1.3 } },
  { id: 'r4', layer: 'micro', niche: 'n11', zone: 'market',
    text: 'How active is real estate development (commercial, residential, or mixed-use) in your primary geography?',
    options: ['Stagnant', 'Minimal', 'Moderate', 'Active', 'Boom market'],
    nicheWeights: { n11:1.1 } },

  // CHARITY BOARDS (n12) — 3 questions
  { id: 'cbd1', layer: 'micro', niche: 'n12', zone: 'access',
    text: 'How active are you personally in charitable, nonprofit, or donor communities that include affluent board members?',
    options: ['Not active', 'Peripheral', 'Occasional', 'Regular', 'Board member myself'],
    nicheWeights: { n12:1.5 } },
  { id: 'cbd2', layer: 'micro', niche: 'n12', zone: 'focus',
    text: 'How clearly could you position around charitable planning, donor-advised strategies, or philanthropic legacy conversations?',
    options: ['Not at all', 'Vaguely', 'Somewhat', 'Clearly', 'Expert — turnkey philanthropic process'],
    nicheWeights: { n12:1.2 } },
  { id: 'cbd3', layer: 'micro', niche: 'n12', zone: 'service',
    text: 'How capable is your firm in advising on charitable trusts, DAFs, QCDs, and legacy giving strategies?',
    options: ['Not capable', 'Basic', 'Moderate', 'Strong', 'Expert'],
    nicheWeights: { n12:1.2 } },

  // HENRYs (n5) — 3 questions
  { id: 'h1', layer: 'micro', niche: 'n5', zone: 'fit',
    text: 'How comfortable are you serving high earners under 45 who are accumulating assets but not yet advised?',
    options: ['Not my focus', 'Open to it', 'Somewhat comfortable', 'Comfortable', 'Love this segment'],
    nicheWeights: { n5:1.4 } },
  { id: 'h2', layer: 'micro', niche: 'n5', zone: 'service',
    text: 'How well does your service model work for clients with RSUs, 401(k)s, student debt, and first-home decisions — all at once?',
    options: ['Not equipped', 'Basic', 'Moderate', 'Strong', 'Expert — built for this'],
    nicheWeights: { n5:1.3 } },
  { id: 'h3', layer: 'micro', niche: 'n5', zone: 'market',
    text: 'How many large tech, biotech, healthcare, or finance employers are within 30 miles of your office?',
    options: ['None', '1–2', '3–5', '6–15', '15+'],
    nicheWeights: { n5:1.2, n6:0.9, n7:1.0 } },

  // HIGH EARNING TRADESMAN (n9) — 3 questions
  { id: 't1', layer: 'micro', niche: 'n9', zone: 'fit',
    text: 'Have you personally worked with electricians, plumbers, HVAC owners, or trade contractors as clients?',
    options: ['Never', 'Once or twice', 'A few times', 'Regularly', 'Core focus'],
    nicheWeights: { n9:1.4 } },
  { id: 't2', layer: 'micro', niche: 'n9', zone: 'access',
    text: 'Do you have any connections into trade associations, union networks, or contractor business communities?',
    options: ['None', 'Loose contacts', 'A few warm', 'Good access', 'Active relationships'],
    nicheWeights: { n9:1.3 } },
  { id: 't3', layer: 'micro', niche: 'n9', zone: 'service',
    text: 'How capable is your firm in advising on business protection insurance, SEP/SIMPLE IRAs, and owner-only 401(k) structures?',
    options: ['Not our strength', 'Basic', 'Moderate', 'Strong', 'Expert'],
    nicheWeights: { n9:1.2 } },

  // AIRCRAFT OWNERS (n1) — 3 questions
  { id: 'av1', layer: 'micro', niche: 'n1', zone: 'fit',
    text: 'Do you have personal or professional experience in aviation (pilot, aircraft owner, FBO, enthusiast)?',
    options: ['None', 'Casual awareness', 'Amateur interest', 'Active hobby', 'Professional background'],
    nicheWeights: { n1:1.5 } },
  { id: 'av2', layer: 'micro', niche: 'n1', zone: 'access',
    text: 'Do you belong to or regularly attend aviation clubs, EAA chapters, or airport-based social events?',
    options: ['No', 'Aware of them', 'Attended once or twice', 'Regular attendee', 'Active member or leader'],
    nicheWeights: { n1:1.4 } },
  { id: 'av3', layer: 'micro', niche: 'n1', zone: 'market',
    text: 'Does your local area have a significant concentration of aircraft owners or a regional airport with private hangars?',
    options: ['No presence', 'Very limited', 'Some', 'Moderate', 'Strong GA or bizjet community'],
    nicheWeights: { n1:1.3 } },
];

// ===== ROUTER — selects which meso + micro questions to show =====
function selectAssessmentPath(macroAnswers, maxTotal = 25) {
  const macro = MACRO_QUESTIONS;

  // Score niches from macro answers only
  const macroResult = _scoreRaw(macro, macroAnswers);

  // Pick top 4 clusters
  const clusterScores = {};
  Object.entries(macroResult.nicheScores).forEach(([nId, score]) => {
    const cluster = NICHE_MAP[nId]?.cluster;
    if (cluster) clusterScores[cluster] = (clusterScores[cluster] || 0) + score;
  });
  const topClusters = Object.entries(clusterScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([c]) => c);

  // Filter + cap meso pool
  const mesoPool = MESO_QUESTIONS.filter(q => topClusters.includes(q.cluster));
  const mesoCount = Math.min(mesoPool.length, 9);
  const meso = mesoPool.slice(0, mesoCount);

  // Pick top 3 niches from macro
  const topNiches = Object.entries(macroResult.nicheScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id);

  // Filter micro to top niches, cap remaining budget
  const microPool = MICRO_QUESTIONS.filter(q => topNiches.includes(q.niche));
  const budget = Math.max(0, maxTotal - macro.length - meso.length);
  const micro = microPool.slice(0, budget);

  return { macro, meso, micro, topNiches };
}

// ===== RAW SCORER (used internally by router + final scoring) =====
function _scoreRaw(questions, answers) {
  const nicheIds = Object.keys(NICHE_MAP);
  const nicheScores = {};
  const zoneScores = {};
  nicheIds.forEach(n => {
    nicheScores[n] = 0;
    zoneScores[n] = { fit: 0, focus: 0, market: 0, access: 0, service: 0 };
  });

  questions.forEach(q => {
    const ansIdx = answers[q.id];
    if (ansIdx === undefined || ansIdx === null) return;
    const val = ansIdx + 1; // 0-indexed → 1-5
    const zw = NICHE_ZONE_CONFIG[q.zone]?.weight || 1.0;
    Object.entries(q.nicheWeights || {}).forEach(([nId, nw]) => {
      if (!nicheScores[nId] !== undefined) nicheScores[nId] = 0;
      const contrib = val * zw * nw;
      nicheScores[nId] = (nicheScores[nId] || 0) + contrib;
      if (!zoneScores[nId]) zoneScores[nId] = { fit: 0, focus: 0, market: 0, access: 0, service: 0 };
      zoneScores[nId][q.zone] = (zoneScores[nId][q.zone] || 0) + contrib;
    });
  });

  return { nicheScores, zoneScores };
}

// ===== FINAL SCORING ENGINE =====
function scoreNicheMapping(answers, path) {
  const allQuestions = [...(path?.macro || []), ...(path?.meso || []), ...(path?.micro || [])];
  const raw = _scoreRaw(allQuestions, answers);

  // Find max possible for normalization
  const maxPossible = {};
  Object.keys(NICHE_MAP).forEach(n => {
    maxPossible[n] = allQuestions.reduce((acc, q) => {
      const nw = q.nicheWeights?.[n] || 0;
      const zw = NICHE_ZONE_CONFIG[q.zone]?.weight || 1.0;
      return acc + 5 * zw * nw;
    }, 0);
  });

  const normalized = {};
  Object.keys(NICHE_MAP).forEach(n => {
    normalized[n] = maxPossible[n] > 0
      ? Math.round(Math.min(100, (raw.nicheScores[n] / maxPossible[n]) * 100))
      : 0;
  });

  // Normalize zone scores per niche to 0-100
  const zoneNorm = {};
  Object.keys(NICHE_MAP).forEach(n => {
    zoneNorm[n] = {};
    Object.keys(NICHE_ZONE_CONFIG).forEach(zone => {
      const zMax = allQuestions.filter(q => q.zone === zone).reduce((acc, q) => {
        const nw = q.nicheWeights?.[n] || 0;
        const zw = NICHE_ZONE_CONFIG[zone]?.weight || 1.0;
        return acc + 5 * zw * nw;
      }, 0);
      zoneNorm[n][zone] = zMax > 0
        ? Math.round(Math.min(100, (raw.zoneScores[n]?.[zone] || 0) / zMax * 100))
        : 0;
    });
  });

  return { nicheScores: normalized, zoneScores: zoneNorm };
}

// ===== PROFILE GENERATOR =====
const _messagingAngles = {
  n1:  'Lead with passion-first language — aircraft ownership is a lifestyle, not just an asset. Position around hangar-to-estate coordination and legacy planning.',
  n2:  'Lead with time liberation. Physicians are time-starved and trust is earned through medical-practice fluency. Talk PSA income, 401(k) alternatives, and disability planning.',
  n3:  'Lead with business sale readiness and exit planning. Business owners trust advisors who understand their operational reality, not just their investment portfolio.',
  n4:  'Lead with uneven-income mastery. Law partners respect advisors who understand equity buyouts, K-1 complexity, and partner capital account transitions.',
  n5:  'Lead with equity complexity. HENRYs are burning cash and anxious about RSU cliffs. Show you understand vesting, stock concentration, and liquidity events.',
  n6:  'Lead with executive-level confidence. C-Suite leaders want an advisor who speaks their language — deferred comp, 10b5-1 plans, and philanthropic legacy.',
  n7:  'Lead with transition confidence. AI-displaced execs are high-competence and ego-bruised — they need a partner who understands severance, 409A, and reinvention planning.',
  n8:  'Lead with practice-wealth fluency. Dentists and specialists want an advisor who understands their specific income model, buy-in risk, and retirement gap.',
  n9:  'Lead with owner-operator respect. High-earning tradespeople are under-served and loyally refer. Show you understand irregular income, business protection, and building wealth while running a crew.',
  n10: 'Lead with "sudden wealth" empathy. Inheritance recipients are often overwhelmed. Position around clarity, coordination, and protection — not performance.',
  n11: 'Lead with deal fluency. Real estate developers respect advisors who understand 1031s, DSTs, concentration risk, and the long-term exit transition.',
  n12: 'Lead with charitable planning mastery. Board members want their philanthropy as optimized as their personal finances — show you can handle both sides of the ledger.',
};

const _icpTemplates = {
  n1:  { primaryNiche:'Aircraft Owners',         minAssets:'$1M',  professions:'Pilot, aircraft owner, FBO operator', lifeEventTriggers:'Aircraft purchase, hangar acquisition, estate planning' },
  n2:  { primaryNiche:'Physicians',              minAssets:'$500K',professions:'MD, DO, surgeon, specialist, physician group owner', lifeEventTriggers:'Practice acquisition, contract signing, partnership track, retirement' },
  n3:  { primaryNiche:'Business Owners',         minAssets:'$1M',  professions:'Business owner, entrepreneur, CEO, founder', lifeEventTriggers:'Business sale, exit planning, succession, M&A event' },
  n4:  { primaryNiche:'Law Partners',            minAssets:'$1M',  professions:'Partner, senior attorney, of-counsel', lifeEventTriggers:'Equity buyout, partner retirement, firm dissolution' },
  n5:  { primaryNiche:'HENRYs',                  minAssets:'$500K',professions:'Tech professional, FAANG employee, high-earning millennial', lifeEventTriggers:'RSU vesting, IPO, home purchase, marriage, first child' },
  n6:  { primaryNiche:'C-Suite Executives',      minAssets:'$2M',  professions:'CEO, CFO, COO, CTO, SVP, Division Head', lifeEventTriggers:'Leadership transition, executive separation, board appointment, liquidity event' },
  n7:  { primaryNiche:'AI-Displaced Executives', minAssets:'$1M',  professions:'Director, VP, C-Suite exec, tech/AI leader', lifeEventTriggers:'Layoff, severance, equity liquidation, career transition' },
  n8:  { primaryNiche:'Dentists & Specialists',  minAssets:'$500K',professions:'Dentist, orthodontist, oral surgeon, specialist', lifeEventTriggers:'Practice buy-in, acquisition, partner exit, retirement funding' },
  n9:  { primaryNiche:'High Earning Tradesman',  minAssets:'$500K',professions:'Electrical, HVAC, plumbing, general contracting owner', lifeEventTriggers:'Business buyout, succession, insurance review, retirement gap' },
  n10: { primaryNiche:'Inheritance Recipients',  minAssets:'$1M',  professions:'Beneficiary, trust beneficiary, estate heir', lifeEventTriggers:'Inheritance received, estate settlement, trust distribution' },
  n11: { primaryNiche:'Real Estate Developers',  minAssets:'$2M',  professions:'Developer, operator, syndicator, builder', lifeEventTriggers:'Property sale, 1031 exchange window, partnership exit, re-investment' },
  n12: { primaryNiche:'Charity Boards',          minAssets:'$2M',  professions:'Nonprofit board member, foundation trustee, major donor', lifeEventTriggers:'Major gift commitment, estate planning, DAF setup' },
};

function generateNicheProfile(scores, path) {
  const ranked = Object.entries(scores.nicheScores)
    .sort((a, b) => b[1] - a[1])
    .map(([id, score]) => ({
      id,
      score,
      zoneBreakdown: scores.zoneScores[id] || {},
      ...NICHE_MAP[id],
    }));

  const top3 = ranked.slice(0, 3);
  const topId = top3[0]?.id || 'n3';

  return {
    top3,
    allRanked: ranked,
    icpBlock: { ...(_icpTemplates[topId] || _icpTemplates.n3), messagingAngle: _messagingAngles[topId] },
    messagingAngle: _messagingAngles[topId],
    miningConfig: {
      primaryNicheId: topId,
      secondaryNicheId: top3[1]?.id || null,
      recommendedNicheIds: top3.map(n => n.id),
    },
    path,
    completedAt: new Date().toISOString(),
  };
}

// ===== ICP APPLIER =====
function applyNicheProfileToICP(profile) {
  if (!profile?.icpBlock) return;
  Object.assign(ICP_CONFIG, profile.icpBlock);
  try {
    localStorage.setItem('aumEngineICP', JSON.stringify(ICP_CONFIG));
    localStorage.setItem('aumNicheProfile', JSON.stringify(profile));
  } catch (e) {}
}

// ===== PERSISTENCE =====
function loadSavedNicheProfile() {
  try {
    const raw = localStorage.getItem('aumNicheProfile');
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
