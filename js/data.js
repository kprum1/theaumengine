// =====================================
// THE AUM ENGINE — DATA LAYER v1.2
// Internal codename: Diamond Mining
// =====================================

const ICP_CONFIG = JSON.parse(localStorage.getItem('aumEngineICP') || 'null') || {
  primaryNiche: 'Business Owners (50–65)',
  minAssets: '$1M',
  ageMin: 50, ageMax: 65,
  geography: 'Phoenix Metro AZ, Dallas TX, Overland Park KS',
  professions: 'Business owners, Physicians, Pilots, Board members',
  lifeEventTriggers: 'Business sale, Inheritance, Retirement, Divorce',
  messagingAngle: 'We help [niche] who are navigating [key transition] build a coordinated strategy across their [assets/business/legacy] — without adding complexity to an already full life.',
  bookingLink: localStorage.getItem('aum_booking_link') || '',
};

const NOTES_STORE    = JSON.parse(localStorage.getItem('aumEngineNotes')    || '{}');
const FEEDBACK_STORE = JSON.parse(localStorage.getItem('aumEngineFeedback') || '{}');

// ===== NICHES =====
const NICHES = [
  { id: 'n1',  icon: '✈️',  name: 'Aircraft Owners',          desc: 'Private pilots & aircraft owners in affluent zip codes',                                               count: 47,  color: '#60a5fa' },
  { id: 'n2',  icon: '👩‍⚕️',name: 'Physicians & Surgeons',    desc: 'Practice owners and partners nearing peak earning years',                                              count: 61,  color: '#fb7185' },
  { id: 'n3',  icon: '🏢',  name: 'Business Owners',          desc: 'SMB owners age 50–65 near succession planning',                                                       count: 89,  color: '#a78bfa' },
  { id: 'n4',  icon: '⚖️',  name: 'Law Partners',             desc: 'Equity partners with uneven cash flow, K-1 complexity, and partnership buyout timelines',             count: 22,  color: '#f59e0b' },
  { id: 'n5',  icon: '🚀',  name: 'HENRYs',                   desc: 'High Earner Not Rich Yet — W2 professionals ages 32–45 with high income but no wealth plan',          count: 19,  color: '#22d3ee' },
  { id: 'n6',  icon: '👔',  name: 'C-Suite Executives',       desc: 'Senior leaders navigating deferred comp, concentrated stock, and executive transition planning',       count: 31,  color: '#34d399' },
  { id: 'n7',  icon: '🤖',  name: 'AI-Displaced Executives',  desc: 'Former C-suite & Director-level tech executives displaced by AI — est. $3M–$8M in unmanaged assets', count: 32,  color: '#fbbf24' },
  { id: 'n8',  icon: '🦷',  name: 'Dentists & Specialists',   desc: 'Practice owners navigating buy-in/out decisions, disability gaps, and retirement funding',            count: 18,  color: '#e879f9' },
  { id: 'n9',  icon: '🔧',  name: 'High Earning Tradesman',   desc: 'HVAC, electrical & plumbing owner-operators with irregular income and no coordinated wealth plan',    count: 14,  color: '#4ade80' },
  { id: 'n10', icon: '💰',  name: 'Inheritance Recipients',   desc: 'Individuals receiving $750K+ inheritance in last 24 months',                                          count: 28,  color: '#facc15' },
  { id: 'n11', icon: '🏗️',  name: 'Real Estate Developers',  desc: 'Developers and operators facing 1031 windows, partnership exits, and concentrated property risk',     count: 16,  color: '#f97316' },
  { id: 'n12', icon: '🎗️',  name: 'Charity Boards',          desc: 'Nonprofit board members with philanthropic giving patterns and DAF/estate planning needs',             count: 34,  color: '#2dd4bf' },
  { id: 'n13', icon: '⛵',  name: 'Yacht Owners',             desc: 'USCG-documented vessel owners (40ft+) — strong $2M+ AUM signal from registry cross-reference',        count: 11,  color: '#38bdf8' },
];

// ===== VALID STATUSES (stage labels only — no temperature labels) =====
// New | Contacted | Engaged | Nurture | Meeting Requested | Booked | Dead

// ===== PROSPECTS (28 — expanded demo dataset) =====
const PROSPECTS = [
  // ── AIRCRAFT OWNERS ──────────────────────────────────────────
  {
    id:'p1', firstName:'David', lastName:'Harrington', title:'CEO & Private Pilot', company:'Harrington Logistics',
    city:'Scottsdale', state:'AZ', niche:'Aircraft Owners', nicheId:'n1',
    fitScore:94, timingScore:88, priorityScore:92, status:'Contacted', assignedRep:'Big Nate',
    source:'Prospect Mine',
    reasonCodes:['Beechcraft King Air owner','Net worth est. $4.2M','Recent ERP sale proceeds','No current advisor relationship'],
    signals:{estimatedAssets:'$4.2M', ageRange:'58–62', relationship:'Secondary connection via Ron Keller', nextEvent:'AOPA Fly-In (May 12)'},
    enrolled:'2026-03-18', lastActivity:'2 days ago',
    emailDraft:`Hi David,\n\nI came across your name through the Arizona Aircraft Owners network and wanted to reach out.\n\nWe specialize in working with pilot-entrepreneurs managing serious wealth alongside business ownership. Most don't have a coordinated strategy across their aircraft assets, business equity, and personal investments.\n\nWould you be open to a 20-minute call to see if what we do might be relevant? I can work around your flying schedule.\n\nBest,\nYour Name`,
    activityLog:[
      {type:'Prospect Mined', date:'2026-03-18', note:'Added from AOPA member cross-reference'},
      {type:'Email Sent',     date:'2026-03-24', note:'First touch email delivered'},
      {type:'Email Opened',   date:'2026-03-25', note:'Opened 3x — strong signal'},
    ]
  },
  {
    id:'p9', firstName:'Michael', lastName:'Chen', title:'Retired Airline Captain', company:'Self',
    city:'Paradise Valley', state:'AZ', niche:'Aircraft Owners', nicheId:'n1',
    fitScore:88, timingScore:76, priorityScore:82, status:'New', assignedRep:'Big Nate',
    source:'Prospect Mine',
    reasonCodes:['Cirrus SR22 owner','Pension + deferred comp','Age 62, recently retired','No advisor visible'],
    signals:{estimatedAssets:'$2.8M', ageRange:'61–64', relationship:'None — cold', nextEvent:'EAA AirVenture (Jul 2026)'},
    enrolled:'2026-04-04', lastActivity:'1 day ago',
    emailDraft:`Hi Michael,\n\nI came across your name in the Arizona pilot community and wanted to reach out.\n\nWe work with retired airline pilots who are navigating the transition from steady income to managing a larger asset picture — pension, deferred comp, personal investments, and often an aircraft. Most find that coordination is the missing piece.\n\nWorth a 20-minute call to see if we might add value?\n\nBest,\nYour Name`,
    activityLog:[{type:'Prospect Mined', date:'2026-04-04', note:'AZ pilot registry cross-reference'}]
  },
  {
    id:'p10', firstName:'Robert', lastName:'Shaw', title:'Real Estate Developer & Pilot', company:'Shaw Development Group',
    city:'Sedona', state:'AZ', niche:'Aircraft Owners', nicheId:'n1',
    fitScore:85, timingScore:80, priorityScore:83, status:'Engaged', assignedRep:'Chris Vance',
    source:'Event — AOPA Fly-In',
    reasonCodes:['Piper Meridian owner','Active real estate portfolio','Multiple LLCs','Age 57'],
    signals:{estimatedAssets:'$3.6M', ageRange:'55–59', relationship:'Met at AOPA Sedona 2026', nextEvent:'Follow-up scheduled Apr 14'},
    enrolled:'2026-03-10', lastActivity:'4 days ago',
    emailDraft:`Hi Robert,\n\nGreat connecting at the AOPA Fly-In last month — your Meridian story was impressive.\n\nAdvisors who work with real estate entrepreneurs and pilots often tell us the same thing: the assets are scattered across entities, the tax picture is complex, and coordinating it all takes someone who gets both sides. That's exactly where we work.\n\nLet's schedule that 30 minutes we talked about.\n\nBest,\nYour Name`,
    activityLog:[
      {type:'Event Contact', date:'2026-03-10', note:'Met at AOPA Sedona Fly-In'},
      {type:'Email Sent',    date:'2026-03-18', note:'Follow-up email sent'},
      {type:'Reply',         date:'2026-03-22', note:'Positive reply — scheduling call'},
    ]
  },
  {
    id:'p11', firstName:'Lisa', lastName:'Fontaine', title:'Surgeon & Private Pilot', company:'Fountain Hills Surgery Center',
    city:'Fountain Hills', state:'AZ', niche:'Aircraft Owners', nicheId:'n1',
    fitScore:82, timingScore:85, priorityScore:84, status:'Meeting Requested', assignedRep:'Maria Lopes',
    source:'Referral — Dr. Kim',
    reasonCodes:['Diamond DA42 owner','Surgery center partner','Income $650K+','No succession plan'],
    signals:{estimatedAssets:'$3.1M', ageRange:'50–54', relationship:'Referred by Dr. Kim', nextEvent:'Meeting request sent Apr 5'},
    enrolled:'2026-03-22', lastActivity:'1 day ago',
    emailDraft:`Hi Lisa,\n\nDr. Kim mentioned you and I wanted to follow up directly.\n\nWe work with physician-pilots who often find that their planning has two separate worlds — the practice and the cockpit — neither of which has ever been coordinated into one strategy. Most find there's real money being left on the table.\n\nI'd love 30 minutes to walk you through what that looks like in practice.\n\nBest,\nYour Name`,
    activityLog:[
      {type:'Referral Added',    date:'2026-03-22', note:'Dr. Kim warm intro'},
      {type:'Email Sent',        date:'2026-03-28', note:'Personalized outreach'},
      {type:'Meeting Requested', date:'2026-04-05', note:'She requested a time — pending confirm'},
    ]
  },
  {
    id:'p12', firstName:'William', lastName:'Knox', title:'Entrepreneur & Pilot', company:'Knox Aviation LLC',
    city:'Mesa', state:'AZ', niche:'Aircraft Owners', nicheId:'n1',
    fitScore:74, timingScore:68, priorityScore:71, status:'Nurture', assignedRep:'Big Nate',
    source:'Prospect Mine',
    reasonCodes:['Charter aircraft operator','Business aviation tax complexity','Age 55','Existing advisor (unknown quality)'],
    signals:{estimatedAssets:'$1.9M', ageRange:'53–57', relationship:'None — cold', nextEvent:'No triggers flagged'},
    enrolled:'2026-02-20', lastActivity:'3 weeks ago',
    emailDraft:`Hi William,\n\nI know you likely have an advisor already — most successful operators in the charter space do. But one thing we hear often is that the aviation-specific tax complexity — bonus depreciation, entity structure, personal vs. business use — rarely gets the attention it deserves.\n\nHappy to offer a second opinion if you ever want one, no pressure.\n\nBest,\nYour Name`,
    activityLog:[
      {type:'Prospect Mined', date:'2026-02-20', note:'AZ charter operator list'},
      {type:'Email Sent',     date:'2026-02-28', note:'First touch — no reply'},
      {type:'Nurture Start',  date:'2026-03-14', note:'Added to nurture sequence'},
    ]
  },

  // ── BUSINESS OWNERS ──────────────────────────────────────────
  {
    id:'p2', firstName:'Sandra', lastName:'Westhoff', title:'Founder & CEO', company:'Westhoff Dental Group',
    city:'Overland Park', state:'KS', niche:'Business Owners', nicheId:'n2',
    fitScore:88, timingScore:91, priorityScore:90, status:'Meeting Requested', assignedRep:'Big Nate',
    source:'Referral — Tom Bridges',
    reasonCodes:['6-practice dental group','Looking at succession','Age 61, no buy-sell agreement','Referred by existing client'],
    signals:{estimatedAssets:'$6.8M', ageRange:'60–63', relationship:'Referred by Tom Bridges', nextEvent:'Q2 tax meeting (Apr 20)'},
    enrolled:'2026-03-05', lastActivity:'5 hours ago',
    emailDraft:`Hi Sandra,\n\nTom Bridges mentioned you might be thinking about the next chapter for Westhoff Dental Group — specifically the succession question and what that means for your personal wealth.\n\nWe help practice owners navigate exactly that transition: aligning business sale proceeds, retirement income, and legacy planning in one coordinated strategy.\n\nI'd love to schedule 30 minutes if the timing is right. Tom can vouch for how we work.\n\nAll the best,\nYour Name`,
    activityLog:[
      {type:'Referral Added',    date:'2026-03-05', note:'Tom Bridges referral — warm intro'},
      {type:'Call',              date:'2026-03-12', note:'8-min call, she is interested'},
      {type:'Email Sent',        date:'2026-03-28', note:'Meeting request sent'},
      {type:'Reply Received',    date:'2026-04-01', note:'Positive reply — checking calendar'},
    ]
  },
  {
    id:'p7', firstName:'Thomas', lastName:'Castellano', title:'Partner', company:'Castellano Capital',
    city:'Dallas', state:'TX', niche:'Business Owners', nicheId:'n2',
    fitScore:85, timingScore:82, priorityScore:84, status:'Booked', assignedRep:'Big Nate',
    source:'Referral — Karen West',
    reasonCodes:['Private equity partner','Year-end liquidity event pending','Active in YPO Dallas','Age 55'],
    signals:{estimatedAssets:'$7.4M', ageRange:'53–57', relationship:'Referred by Karen West', nextEvent:'Intro meeting booked: Apr 9, 2:00 PM'},
    enrolled:'2026-03-15', lastActivity:'Today',
    emailDraft:`Hi Thomas,\n\nLooking forward to our meeting on April 9th. I'll keep it to 30 minutes — prepared a quick overview of a few concepts relevant to your situation at Castellano.\n\nAny prep materials or specific questions you'd like me to address in advance?\n\nBest,\nYour Name`,
    activityLog:[
      {type:'Referral Added',  date:'2026-03-15', note:'Karen West warm intro'},
      {type:'Call',            date:'2026-03-22', note:'Great 20-min call. Very interested.'},
      {type:'Meeting Booked',  date:'2026-04-01', note:'Confirmed Apr 9 @ 2PM via Calendly'},
    ]
  },
  {
    id:'p13', firstName:'Gregory', lastName:'Holt', title:'Owner & CEO', company:'Holt Manufacturing',
    city:'Kansas City', state:'MO', niche:'Business Owners', nicheId:'n2',
    fitScore:86, timingScore:79, priorityScore:83, status:'Contacted', assignedRep:'Big Nate',
    source:'Prospect Mine',
    reasonCodes:['3rd-generation manufacturer','Revenue $18M+','Age 58, no exit plan','ESOP consideration emerging'],
    signals:{estimatedAssets:'$5.2M', ageRange:'56–60', relationship:'None — cold outreach', nextEvent:'KC Chamber Dinner (May 8)'},
    enrolled:'2026-03-12', lastActivity:'1 week ago',
    emailDraft:`Hi Gregory,\n\nI came across Holt Manufacturing through my research in the Kansas City business community — impressive 3rd-generation operation.\n\nOwners at your stage often find that succession planning, ESOP consideration, and personal wealth coordination need to happen in parallel — but rarely do without a deliberate push.\n\nWould a brief conversation be worth your time?\n\nBest,\nYour Name`,
    activityLog:[
      {type:'Prospect Mined', date:'2026-03-12', note:'KC manufacturer database'},
      {type:'Email Sent',     date:'2026-03-20', note:'First touch sent'},
    ]
  },
  {
    id:'p14', firstName:'Ellen', lastName:'Marsh', title:'Co-Founder', company:'Marsh & Taggart Law',
    city:'Denver', state:'CO', niche:'Business Owners', nicheId:'n2',
    fitScore:80, timingScore:83, priorityScore:82, status:'Engaged', assignedRep:'Maria Lopes',
    source:'Event — Denver Business Forum',
    reasonCodes:['Law firm partner buyout upcoming','Age 60','No clear post-buyout wealth plan','High income last 10 years'],
    signals:{estimatedAssets:'$4.4M', ageRange:'59–62', relationship:'Met at Denver Business Forum', nextEvent:'Partner meeting Apr 22'},
    enrolled:'2026-03-08', lastActivity:'3 days ago',
    emailDraft:`Hi Ellen,\n\nIt was great to connect at the Denver Business Forum. Your perspective on the law firm transition market was really on point.\n\nPartner buyouts create a very specific wealth moment — often the largest single liquidity event a business owner ever has. The window for planning is narrow, and the decisions made in the first 90 days matter a lot.\n\nWould a 25-minute call be useful?\n\nBest,\nYour Name`,
    activityLog:[
      {type:'Event Contact', date:'2026-03-08', note:'Met at Denver Business Forum'},
      {type:'LinkedIn',      date:'2026-03-15', note:'Connected and messaged'},
      {type:'Email Sent',    date:'2026-03-25', note:'Follow-up with value content'},
      {type:'Reply',         date:'2026-04-03', note:'Expressed interest — scheduling soon'},
    ]
  },
  {
    id:'p15', firstName:'Frank', lastName:'DiNapoli', title:'Owner', company:'DiNapoli Restaurant Group',
    city:'Chicago', state:'IL', niche:'Business Owners', nicheId:'n2',
    fitScore:77, timingScore:72, priorityScore:75, status:'New', assignedRep:'Unassigned',
    source:'Prospect Mine',
    reasonCodes:['14 restaurant locations','Exploring PE buyout','Age 63','Significant real estate holdings'],
    signals:{estimatedAssets:'$8.1M', ageRange:'62–65', relationship:'None', nextEvent:'No triggers flagged'},
    enrolled:'2026-04-05', lastActivity:'Today',
    emailDraft:`Hi Frank,\n\nI came across DiNapoli Restaurant Group through the Chicago hospitality market — 14 locations is a real operation.\n\nOwners exploring PE interest at your stage often find that the wealth coordination work — real estate, business value, personal assets — gets rushed to fit the deal timeline. We help make sure it doesn't.\n\nWorth a brief conversation?\n\nBest,\nYour Name`,
    activityLog:[{type:'Prospect Mined', date:'2026-04-05', note:'Chicago hospitality PE target list'}]
  },
  {
    id:'p16', firstName:'Catherine', lastName:'Moss', title:'Founder & CEO', company:'Moss Wealth Strategies',
    city:'Nashville', state:'TN', niche:'Business Owners', nicheId:'n2',
    fitScore:83, timingScore:76, priorityScore:80, status:'Contacted', assignedRep:'Chris Vance',
    source:'LinkedIn',
    reasonCodes:['RIA firm sale in progress','Age 57','Transition from operator to investor','Significant deferred comp'],
    signals:{estimatedAssets:'$3.8M', ageRange:'55–59', relationship:'LinkedIn connection', nextEvent:'RIA sale closing Q3 2026'},
    enrolled:'2026-03-28', lastActivity:'5 days ago',
    emailDraft:`Hi Catherine,\n\nI noticed your profile through the Nashville financial advisory community and wanted to reach out.\n\nAdvisors who are selling their own practice face an unusual challenge — you know the theory, but being on the receiving end of a significant liquidity event after years as the operator is a different experience. We work with people at exactly that intersection.\n\nWould a peer-level conversation be useful?\n\nBest,\nYour Name`,
    activityLog:[
      {type:'LinkedIn',   date:'2026-03-28', note:'Sent connection + message'},
      {type:'Connected',  date:'2026-04-01', note:'Accepted connection'},
    ]
  },
  {
    id:'p17', firstName:'Richard', lastName:'Vance', title:'Managing Partner', company:'Vance & Sons Construction',
    city:'Atlanta', state:'GA', niche:'Business Owners', nicheId:'n2',
    fitScore:79, timingScore:65, priorityScore:72, status:'Nurture', assignedRep:'Big Nate',
    source:'Prospect Mine',
    reasonCodes:['$22M revenue construction firm','Age 64','Medical event slowed planning','Sons not ready to take over'],
    signals:{estimatedAssets:'$4.9M', ageRange:'63–67', relationship:'None', nextEvent:'Family meeting planned Q3'},
    enrolled:'2026-02-14', lastActivity:'2 weeks ago',
    emailDraft:`Hi Richard,\n\nI'm reaching out because Vance & Sons came up in my research on Atlanta's construction market — impressive longevity.\n\nConstruction firm owners at your stage often face a version of the same challenge: the business is the wealth, but the succession and personal planning haven't kept pace. Sometimes life events make this more urgent than expected.\n\nNo pressure — just keeping the door open if the timing ever feels right.\n\nBest,\nYour Name`,
    activityLog:[
      {type:'Prospect Mined', date:'2026-02-14', note:'Atlanta construction database'},
      {type:'Email Sent',     date:'2026-02-22', note:'First touch — no reply'},
      {type:'Email Sent',     date:'2026-03-15', note:'Nurture touch — value content'},
    ]
  },
  {
    id:'p18', firstName:'Barbara', lastName:'Keene', title:'Owner', company:'Keene Logistics Solutions',
    city:'Houston', state:'TX', niche:'Business Owners', nicheId:'n2',
    fitScore:87, timingScore:88, priorityScore:88, status:'Booked', assignedRep:'Maria Lopes',
    source:'Referral — Jason Tanner',
    reasonCodes:['Logistics firm — LOI signed for sale','Age 59','$14M expected proceeds','Referred by CPA Jason Tanner'],
    signals:{estimatedAssets:'$14M (pending close)', ageRange:'58–61', relationship:'CPA referral — Jason Tanner', nextEvent:'Strategy meeting Apr 11, 10:00 AM'},
    enrolled:'2026-03-28', lastActivity:'Today',
    emailDraft:`Hi Barbara,\n\nJason Tanner mentioned you're approaching close on the Keene Logistics sale — congratulations on reaching that milestone.\n\nThe 90-day window around a transaction is critical for tax positioning, investment structure, and income planning. We work exclusively with owners at this stage to make sure the planning matches the moment.\n\nLooking forward to our meeting on April 11th.\n\nBest,\nYour Name`,
    activityLog:[
      {type:'CPA Referral',   date:'2026-03-28', note:'Jason Tanner warm intro — urgent'},
      {type:'Call',           date:'2026-03-30', note:'Strong call — very motivated'},
      {type:'Meeting Booked', date:'2026-04-02', note:'Confirmed Apr 11 @ 10AM'},
    ]
  },

  // ── CHARITY BOARD MEMBERS ─────────────────────────────────────
  {
    id:'p3', firstName:'Robert', lastName:'Kimathi', title:'Board Chair', company:'Midwest Arts Alliance',
    city:'Chicago', state:'IL', niche:'Charity Board Members', nicheId:'n3',
    fitScore:81, timingScore:72, priorityScore:77, status:'Engaged', assignedRep:'Chris Vance',
    source:'Event — Philanthropy Forum',
    reasonCodes:['Chairs 2 major nonprofits','Philanthropic giving $120K/yr','Family foundation interest','Connected to 14 board members'],
    signals:{estimatedAssets:'$3.1M', ageRange:'55–60', relationship:'Met at Philanthropy Forum 2026', nextEvent:'Annual Charity Gala (Apr 28)'},
    enrolled:'2026-03-02', lastActivity:'1 week ago',
    emailDraft:`Hi Robert,\n\nGreat meeting you at the Philanthropy Forum last month. Your perspective on impact investing stayed with me.\n\nMany board members we work with have both a deep philanthropic commitment and complex personal wealth that deserves the same level of strategic thinking. Coordinating charitable giving, a potential family foundation, and long-term income is something we help simplify.\n\nWorth a conversation when you have 20 minutes?\n\nWarm regards,\nYour Name`,
    activityLog:[
      {type:'Event Contact', date:'2026-03-02', note:'Met at Chicago Philanthropy Forum'},
      {type:'LinkedIn',      date:'2026-03-10', note:'Connected, sent follow-up message'},
      {type:'Email Sent',    date:'2026-03-22', note:'Personalized email based on forum topic'},
    ]
  },
  {
    id:'p20', firstName:'Diana', lastName:'Osei', title:'Board Member & Philanthropist', company:'Osei Family Foundation',
    city:'Atlanta', state:'GA', niche:'Charity Board Members', nicheId:'n3',
    fitScore:79, timingScore:70, priorityScore:74, status:'Contacted', assignedRep:'Chris Vance',
    source:'Prospect Mine',
    reasonCodes:['Sits on 4 nonprofit boards','Giving $80K+/yr','Family foundation newly formed','Age 58'],
    signals:{estimatedAssets:'$2.9M', ageRange:'56–61', relationship:'None — cold', nextEvent:'United Way Gala (May 3)'},
    enrolled:'2026-03-30', lastActivity:'6 days ago',
    emailDraft:`Hi Diana,\n\nI came across your work through the Atlanta philanthropic community — the foundation you and your family have built is impressive.\n\nWe work with board members who are managing active charitable giving alongside personal wealth — helping make sure the two are coordinated so that your philanthropy doesn't create unintended tax or estate complications.\n\nWorth a brief conversation?\n\nBest,\nYour Name`,
    activityLog:[
      {type:'Prospect Mined', date:'2026-03-30', note:'Atlanta philanthropy board cross-reference'},
      {type:'Email Sent',     date:'2026-04-02', note:'First touch sent'},
    ]
  },

  // ── INHERITANCE RECIPIENTS ────────────────────────────────────
  {
    id:'p4', firstName:'Margaret', lastName:'Dolenz', title:'Inherited Beneficiary', company:'Dolenz Family',
    city:'Naples', state:'FL', niche:'Inheritance Recipients', nicheId:'n4',
    fitScore:76, timingScore:85, priorityScore:80, status:'Nurture', assignedRep:'Big Nate',
    source:'Prospect Mine',
    reasonCodes:['Inherited $1.2M July 2025','No advisor on record','Age 49, pre-retirement','FL coastal zip code'],
    signals:{estimatedAssets:'$1.4M', ageRange:'47–51', relationship:'None — cold outreach', nextEvent:'12-month anniversary (Jul 2026)'},
    enrolled:'2026-03-28', lastActivity:'3 days ago',
    emailDraft:`Hi Margaret,\n\nI know outreach like this can feel out of place, so I'll be direct: we noticed that individuals in your area who've recently received a significant inheritance often find themselves navigating an unfamiliar set of decisions quickly.\n\nWe work with people at exactly this crossroads — helping them protect what they've received and build a plan that reflects their values.\n\nNo pressure at all, but if you'd ever like a second opinion with no strings, I'm here.\n\nBest,\nYour Name`,
    activityLog:[
      {type:'Prospect Mined', date:'2026-03-28', note:'Inheritance signal via probate records'},
      {type:'Email Sent',     date:'2026-04-02', note:'Gentle intro sent — nurture sequence started'},
    ]
  },
  {
    id:'p21', firstName:'James', lastName:'Calloway', title:'Inheritance Beneficiary', company:'Calloway Estate',
    city:'Sarasota', state:'FL', niche:'Inheritance Recipients', nicheId:'n4',
    fitScore:72, timingScore:78, priorityScore:75, status:'New', assignedRep:'Unassigned',
    source:'Prospect Mine',
    reasonCodes:['Inherited $2.1M Aug 2025','Probate just cleared','No financial advisor','Age 52'],
    signals:{estimatedAssets:'$2.3M', ageRange:'50–54', relationship:'None', nextEvent:'6-month check-in window open'},
    enrolled:'2026-04-05', lastActivity:'Today',
    emailDraft:`Hi James,\n\nI'll keep this brief — you recently navigated the probate process, and with that behind you, now is the time when having a thoughtful plan for what you inherited matters most.\n\nWe work specifically with people in this window: protecting the asset base, making sense of tax implications, and aligning the inheritance with your longer-term picture.\n\nNo obligation — just here if it's useful.\n\nBest,\nYour Name`,
    activityLog:[{type:'Prospect Mined', date:'2026-04-05', note:'FL probate records — recent clearance'}]
  },

  // ── PHYSICIANS & SURGEONS ─────────────────────────────────────
  {
    id:'p5', firstName:'James', lastName:'Okafor', title:'Orthopedic Surgeon', company:'Southwest Ortho Group',
    city:'Phoenix', state:'AZ', niche:'Physicians & Surgeons', nicheId:'n5',
    fitScore:90, timingScore:79, priorityScore:85, status:'Contacted', assignedRep:'Maria Lopes',
    source:'Prospect Mine',
    reasonCodes:['Partner in 12-physician group','Income est. $700K/yr','No succession plan','High-risk specialty'],
    signals:{estimatedAssets:'$2.9M', ageRange:'52–56', relationship:'Mutual connection — Dr. Kim', nextEvent:'AMA Conference (Jun 4)'},
    enrolled:'2026-03-10', lastActivity:'4 days ago',
    emailDraft:`Hi James,\n\nThrough Dr. Kim's network I learned about your practice at Southwest Ortho — impressive group you've built.\n\nPhysician partners at your stage tend to face the same 3 blind spots: malpractice-exposed assets, underallocated retirement vehicles, and no formal exit timeline. We help partners get ahead of those without adding complexity to an already full schedule.\n\nHappy to do a quick call — even 15 minutes over lunch works.\n\nBest,\nYour Name`,
    activityLog:[
      {type:'Prospect Mined',   date:'2026-03-10', note:'AZ physician partner list'},
      {type:'LinkedIn Outreach',date:'2026-03-20', note:'Connection request accepted'},
      {type:'Email Sent',       date:'2026-03-30', note:'First-touch email — awaiting reply'},
    ]
  },
  {
    id:'p22', firstName:'Priya', lastName:'Mehta', title:'Cardiologist & Partner', company:'Advanced Heart Institute',
    city:'Dallas', state:'TX', niche:'Physicians & Surgeons', nicheId:'n5',
    fitScore:84, timingScore:77, priorityScore:81, status:'Engaged', assignedRep:'Maria Lopes',
    source:'Referral — Dr. Patel',
    reasonCodes:['Cardiology practice partner','Income $820K/yr','Group exploring ASC investment','Age 48'],
    signals:{estimatedAssets:'$3.3M', ageRange:'46–50', relationship:'Referred by Dr. Patel', nextEvent:'ASC decision Q2'},
    enrolled:'2026-03-18', lastActivity:'2 days ago',
    emailDraft:`Hi Priya,\n\nDr. Patel thought it might be worth connecting — he mentioned the ASC discussion your group is navigating.\n\nPhysician investors in ambulatory surgery centers face a unique wealth moment: the income from practice + facility investment can create serious concentration risk if it's not managed proactively.\n\nHappy to share what we've seen work for other physician investors in similar situations.\n\nBest,\nYour Name`,
    activityLog:[
      {type:'Referral Added', date:'2026-03-18', note:'Dr. Patel warm intro'},
      {type:'Email Sent',     date:'2026-03-24', note:'Personalized email re: ASC investment'},
      {type:'Reply',          date:'2026-04-01', note:'Interested — scheduling'},
    ]
  },
  {
    id:'p23', firstName:'Marcus', lastName:'Bell', title:'Neurosurgeon', company:'Premier Neuro Group',
    city:'Houston', state:'TX', niche:'Physicians & Surgeons', nicheId:'n5',
    fitScore:78, timingScore:63, priorityScore:71, status:'Dead', assignedRep:'Chris Vance',
    source:'Prospect Mine',
    reasonCodes:['High income — limited time to engage','Already with advisor','Duplicate outreach risk'],
    signals:{estimatedAssets:'$4.1M', ageRange:'52–56', relationship:'None', nextEvent:'N/A — closed'},
    enrolled:'2026-02-01', lastActivity:'5 weeks ago',
    emailDraft:`Hi Marcus,\n\nThank you for our brief conversation. I understand you're well taken care of on the planning side. I'll keep your contact for our network and reach out again if anything meaningful changes in the space that might be relevant.\n\nBest,\nYour Name`,
    activityLog:[
      {type:'Cold Email',    date:'2026-02-10', note:'First touch — no reply'},
      {type:'Phone Attempt', date:'2026-02-24', note:'Reached — has advisor, not interested'},
      {type:'Closed',        date:'2026-03-01', note:'Marked dead — has advisor'},
    ]
  },

  // ── YOUNG MILLENNIAL RIAs ─────────────────────────────────────
  // ── HENRYs ─────────────────────────────────────
  {
    id:'p6', firstName:'Alicia', lastName:'Ruiz', title:'Founder & CIO', company:'Ruiz Wealth Partners',
    city:'Austin', state:'TX', niche:'HENRYs', nicheId:'n6',
    fitScore:72, timingScore:65, priorityScore:68, status:'New', assignedRep:'Unassigned',
    source:'Prospect Mine',
    reasonCodes: ['Income $280K+, minimal investable assets','No financial advisor','Tech sector W2','Age 34 — early accumulation stage'],
    signals: { estimatedAssets: '$280K income, <$200K invested', ageRange: '33–37', relationship: 'None — cold', nextEvent: 'Year-end bonus expected Dec 2026' },
    enrolled:'2026-04-04', lastActivity:'1 day ago',
    emailDraft: `Hi Alicia,\n\nI know you're probably not short on income — but most high earners I talk to in tech will quietly admit that the wealth picture hasn't kept up with the paycheck.\n\nWe work specifically with people in your bracket: high W2 income, RSUs or options, a 401k that's probably not maxed the right way, and not much time to deal with it. We remove the complexity.\n\nWorth a 15-minute call to see if it's even relevant?\n\nBest,\nYour Name`,
    activityLog:[{type:'Prospect Mined', date:'2026-04-04', note:'Added from LinkedIn income signal + employer data'}]
  },
  {
    id:'p24', firstName:'Jordan', lastName:'Pierce', title:'Founder & CFP', company:'Pierce Financial Planning',
    city:'Denver', state:'CO', niche:'HENRYs', nicheId:'n6',
    fitScore:68, timingScore:60, priorityScore:64, status:'New', assignedRep:'Unassigned',
    source:'Prospect Mine',
    reasonCodes: ['Income $310K — minimal investments','RSUs unvesting Q3','No advisor on record','Age 34'],
    signals: { estimatedAssets: '$310K income, RSUs pending', ageRange: '32–36', relationship: 'None', nextEvent: 'RSU vesting event Q3 2026' },
    enrolled:'2026-04-05', lastActivity:'Today',
    emailDraft: `Hi Jordan,\n\nYour name came up in my research on Denver's tech professional community — congratulations on what looks like a strong career trajectory.\n\nI work with people in your income bracket — W2 earners in the $250K+ range who are doing well but feel like the financial piece hasn't caught up. The RSU question alone is usually worth a conversation.\n\nWorth 15 minutes to see if there's anything useful?\n\nBest,\nYour Name`,
    activityLog:[{type:'Prospect Mined', date:'2026-04-05', note:'LinkedIn income signal — Denver tech cluster'}]
  },

  // ── AI-DISPLACED EXECUTIVES ──────────────────────────────────────
  {
    id:'p25', firstName:'Kirk', lastName:'McDonald', title:'Former Director of Data Science', company:'Apple (Ex)',
    city:'Bend', state:'OR', niche:'AI-Displaced Executives', nicheId:'n7',
    fitScore:98, timingScore:94, priorityScore:97, status:'New', assignedRep:'Big Nate',
    source:'Alfred Wealth Trigger Miner',
    reasonCodes:['Former Director at Apple — Data Science','Est. Home Value: $2.4M (Bend, OR)','Est. Liquid Assets: $4M–$7M','Transitioned out post-AI reorg — no advisor on record'],
    signals:{estimatedAssets:'$4M–$7M', ageRange:'44–50', relationship:'None — cold', nextEvent:'LinkedIn activity spike — open to new opportunities'},
    enrolled:'2026-04-06', lastActivity:'Today',
    emailDraft:`Hi Kirk,\n\nYour name came up through my research on former Apple Directors who've made significant transitions recently — and I wanted to reach out directly.\n\nI work with people at your level who've built real wealth inside large tech companies but haven't had the bandwidth to build a coordinated financial strategy around it. The transition moment — especially after a company like Apple — is usually when the biggest decisions get made by default, not by design.\n\nWould you be open to a 20-minute conversation to see if what we do could be useful? I'll follow your lead.\n\nBest,\nYour Name`,
    activityLog:[
      {type:'Prospect Mined', date:'2026-04-06', note:'Alfred Wealth Trigger Miner — Apple Director transition signal'},
    ]
  },
  {
    id:'p26', firstName:'Nuria', lastName:'Molina', title:'Early Retired — Former VP Global Client Director', company:'IBM (Ex)',
    city:'Miami', state:'FL', niche:'AI-Displaced Executives', nicheId:'n7',
    fitScore:99, timingScore:98, priorityScore:99, status:'New', assignedRep:'Big Nate',
    source:'Alfred Wealth Trigger Miner',
    reasonCodes:['Recently declared early retirement from IBM','Former Global VP — VP-level pension + stock grants','Miami market — no known advisor relationship','Age 48 — 17+ working years ahead: complex planning window'],
    signals:{estimatedAssets:'$3.5M–$6M', ageRange:'46–50', relationship:'None — cold', nextEvent:'Early retirement declared — actively reassessing financial situation'},
    enrolled:'2026-04-06', lastActivity:'Today',
    emailDraft:`Hi Nuria,\n\nI noticed your recent transition from IBM — congratulations on taking that step.\n\nI specialize in working with executives in your position: high-achieving careers that generated real wealth that now needs a coordinated strategy for what comes next. Early retirement at your stage is one of the most complex financial decisions a person makes — and most people make it without the right framework in place.\n\nI'd love to share what that looks like for people in analogous situations. Would a brief call make sense?\n\nBest,\nYour Name`,
    activityLog:[
      {type:'Prospect Mined', date:'2026-04-06', note:'Alfred Wealth Trigger Miner — IBM VP early retirement signal'},
    ]
  },
  {
    id:'p27', firstName:'Tim', lastName:'Sneath', title:'Former Director of CoreOS', company:'Apple / Google (Ex)',
    city:'San Francisco', state:'CA', niche:'AI-Displaced Executives', nicheId:'n7',
    fitScore:91, timingScore:87, priorityScore:89, status:'New', assignedRep:'Unassigned',
    source:'Alfred Wealth Trigger Miner',
    reasonCodes:['Director-level roles at both Apple and Google','Active tech speaker — public LinkedIn profile','SF Bay Area — high wealth density market','Likely $3M–$5M in unvested stock + pension'],
    signals:{estimatedAssets:'$3M–$5M', ageRange:'42–48', relationship:'None — cold', nextEvent:'Speaking at tech conference Q2 2026'},
    enrolled:'2026-04-06', lastActivity:'Today',
    emailDraft:`Hi Tim,\n\nI followed your work at Apple and Google — the CoreOS space is fascinating, and your public thought leadership is impressive.\n\nI work with senior tech executives who've built significant wealth across multiple companies and are now thinking about what the financial picture actually looks like when you add it all up: unvested stock, pension benefits, real estate equity, and what comes next.\n\nWould you be open to a 20-minute call? I'll keep it focused and respect your time.\n\nBest,\nYour Name`,
    activityLog:[
      {type:'Prospect Mined', date:'2026-04-06', note:'Alfred Wealth Trigger Miner — Apple/Google Director transition'},
    ]
  },
  {
    id:'p28', firstName:'Ajay', lastName:'Punjabi', title:'Senior Executive (Former)', company:'Salesforce (Ex)',
    city:'Los Angeles', state:'CA', niche:'AI-Displaced Executives', nicheId:'n7',
    fitScore:88, timingScore:85, priorityScore:87, status:'New', assignedRep:'Unassigned',
    source:'Alfred Wealth Trigger Miner',
    reasonCodes:['Salesforce Executive — Duke Fuqua MBA alum','LA market — high HNW density','Tech exec exit timing — likely equity liquidation event','No financial advisor on public record'],
    signals:{estimatedAssets:'$2.5M–$5M', ageRange:'40–46', relationship:'None — cold', nextEvent:'Equity vesting / liquidation event likely in transition period'},
    enrolled:'2026-04-06', lastActivity:'Today',
    emailDraft:`Hi Ajay,\n\nYour name came up through my research on the Salesforce executive community, and your background at Duke caught my attention as well.\n\nI work with executives at your career stage who are navigating the financial complexity that comes with a major company transition — RSUs, pension, comp structures that need unwinding and redeploying strategically.\n\nI'd love to share a quick framework for how we approach this. Would 15 minutes work?\n\nBest,\nYour Name`,
    activityLog:[
      {type:'Prospect Mined', date:'2026-04-06', note:'Alfred Wealth Trigger Miner — Salesforce Exec exit signal + Duke Fuqua'},
    ]
  },
  {
    id:'p29', firstName:'Corinne', lastName:'Sklar', title:'Former VP & Managing Director', company:'IBM / Salesforce (Ex)',
    city:'New York', state:'NY', niche:'AI-Displaced Executives', nicheId:'n7',
    fitScore:93, timingScore:90, priorityScore:92, status:'New', assignedRep:'Unassigned',
    source:'Alfred Wealth Trigger Miner',
    reasonCodes:['VP & MD across IBM and Salesforce — dual-company exec track','NY market — UHNW prospect zone','Likely significant unvested equity + executive pension blend','LinkedIn profile active — open to connection'],
    signals:{estimatedAssets:'$4M–$8M', ageRange:'48–54', relationship:'None — cold', nextEvent:'Post-Salesforce transition — evaluating next chapter'},
    enrolled:'2026-04-06', lastActivity:'Today',
    emailDraft:`Hi Corinne,\n\nYour career track across IBM and Salesforce is remarkable — VP and MD at both is a rare combination.\n\nI work exclusively with executives at your level who are navigating the transition from a high-comp corporate role into whatever comes next. The challenge is almost never about the wealth itself — it's about building a coordinated strategy that accounts for all of it: deferred comp, pension, unvested equity, and the planning side that corporate life never gave you time for.\n\nWould a 20-minute call make sense?\n\nBest,\nYour Name`,
    activityLog:[
      {type:'Prospect Mined', date:'2026-04-06', note:'Alfred Wealth Trigger Miner — IBM/Salesforce VP dual-company exec'},
    ]
  },
];

// ===== TEAM REPS =====
const TEAM_REPS = [
  { id:'r1', initials:'BN', name:'Big Nate',    role:'Lead Advisor Rep', booked:5, contacted:24, converted:2, color:'av-blue' },
  { id:'r2', initials:'ML', name:'Maria Lopes', role:'Advisor Rep',       booked:3, contacted:18, converted:1, color:'av-violet' },
  { id:'r3', initials:'CV', name:'Chris Vance', role:'Advisor Rep',       booked:2, contacted:15, converted:1, color:'av-emerald' },
];

// ===== ALERTS =====
const ALERTS = [
  { id:'a1', type:'hot',     title:'David Harrington opened email 3×', sub:'Aircraft Owner · Scottsdale AZ · Follow up now', time:'2h ago', prospectId:'p1' },
  { id:'a2', type:'booking', title:'Thomas Castellano — meeting tomorrow', sub:'Business Owner · Dallas TX · Meeting Prep ready', time:'5h ago', prospectId:'p7' },
  { id:'a3', type:'stale',   title:'William Knox — 21 days no contact', sub:'Aircraft Owner · Mesa AZ · Consider reactivation', time:'1d ago', prospectId:'p12' },
  { id:'a4', type:'new',     title:'10 AI-exec prospects mined by Alfred', sub:'Transitioning Tech Executives · Apple · IBM · Salesforce', time:'Just now', prospectId:null },
  { id:'a5', type:'reply',   title:'Sandra Westhoff replied!', sub:'Business Owner · Overland Park KS · Checking calendar', time:'5h ago', prospectId:'p2' },
  { id:'a6', type:'booking', title:'Barbara Keene — meeting in 5 days', sub:'Business Owner · Houston TX · High-priority close', time:'3h ago', prospectId:'p18' },
  { id:'a7', type:'hot',     title:'Kirk McDonald — Fit Score 98 🔥', sub:'AI-Displaced Exec · Former Apple Director · Bend OR · Mine now', time:'Just now', prospectId:'p25' },
];

const PIPELINE_COLUMNS = ['New','Contacted','Engaged','Nurture','Meeting Requested','Booked','Dead','Snoozed'];

// ===== COMPUTED METRICS (stable — no Math.random) =====
function computeMetrics() {
  const total = PROSPECTS.length;
  const booked = PROSPECTS.filter(p => p.status === 'Booked').length;
  const contacted = PROSPECTS.filter(p => !['New','Dead'].includes(p.status)).length;
  const engaged = PROSPECTS.filter(p => ['Engaged','Meeting Requested','Booked'].includes(p.status)).length;
  const dead = PROSPECTS.filter(p => p.status === 'Dead').length;

  return {
    total,
    booked,
    contacted,
    engaged,
    dead,
    contactRate: Math.round(contacted / total * 100),
    replyRate:   Math.round(engaged   / Math.max(contacted,1) * 100),
    convRate:    Math.round(booked    / Math.max(contacted,1) * 100),
  };
}

function computeNicheMetrics() {
  return NICHES.map(n => {
    const nprospects = PROSPECTS.filter(p => p.nicheId === n.id);
    const total     = nprospects.length;
    const contacted = nprospects.filter(p => !['New','Dead'].includes(p.status)).length;
    const booked    = nprospects.filter(p => p.status === 'Booked').length;
    const convPct   = total ? Math.round(contacted / total * 100) : 0;
    const bookPct   = total ? Math.round(booked    / total * 100) : 0;
    return { ...n, total, contacted, booked, convPct, bookPct };
  });
}

// ===== DRAFT GENERATOR (multi-channel) =====
function getDraft(prospect, type = 'email') {
  if (type === 'email') return prospect.emailDraft;
  const { firstName: f, niche, reasonCodes: rc } = prospect;
  const hook = rc[0] || 'your background';
  const n = niche.toLowerCase();

  if (type === 'call') {
    return `Hi ${f}, this is [Your Name] — I specialize in working with ${n} and your name came up in my research. Do you have 60 seconds? I'll be brief.\n\n[If yes]: We help people with ${hook.toLowerCase()} build a coordinated financial strategy — I'd love to ask you two quick questions to see if it's even relevant.\n\n[If now's not good]: No problem at all — I'll send a short email and you can decide if it's worth a conversation.`;
  }
  if (type === 'linkedin') {
    return `Hi ${f} — came across your profile through the ${niche} community. I work with people who have ${hook.toLowerCase()}, helping them build a more coordinated financial picture. Might be worth a quick conversation — happy to keep it brief if it's not the right fit.`;
  }
  if (type === 'voicemail') {
    return `Hi ${f}, this is [Your Name]. I work specifically with ${n} and your name came up through my research. I'll send a short email — if what I do doesn't resonate, no worries at all. Thanks, and have a great day.`;
  }
  return prospect.emailDraft;
}

// ===== UTILITY FUNCTIONS =====
function getStatusPill(status) {
  const map = {
    'New':              'pill-new',
    'Contacted':        'pill-contacted',
    'Engaged':          'pill-engaged',
    'Nurture':          'pill-nurture',
    'Meeting Requested':'pill-warm',
    'Booked':           'pill-booked',
    'Dead':             'pill-dead',
    'Snoozed':          'pill-snoozed',
    // legacy fallbacks
    'hot':'pill-contacted', 'warm':'pill-warm', 'cold':'pill-nurture',
  };
  return `<span class="status-pill ${map[status] || 'pill-new'}">${status}</span>`;
}

function getScoreBar(score, color) {
  return `<div class="score-bar">
    <div class="score-track"><div class="score-fill" style="width:${score}%;background:${color}"></div></div>
    <span class="score-num" style="color:${color}">${score}</span>
  </div>`;
}

function getAvatarClass(name) {
  const classes = ['av-blue','av-violet','av-cyan','av-emerald','av-rose','av-amber','av-indigo'];
  let idx = 0; for(let c of name) idx += c.charCodeAt(0);
  return classes[idx % classes.length];
}

function getInitials(first, last) { return (first[0] + last[0]).toUpperCase(); }

// ===== CSV UTILITIES =====
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g,''));
  return lines.slice(1).map((line, idx) => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g,''));
    const row = {};
    headers.forEach((h, i) => { row[h] = vals[i] || ''; });
    return {
      id: 'csv_' + Date.now() + '_' + idx,
      firstName:    row.firstname   || row.first || 'Unknown',
      lastName:     row.lastname    || row.last  || 'Prospect',
      title:        row.title       || row.jobtitle || '',
      company:      row.company     || row.firm  || '',
      city:         row.city        || '',
      state:        row.state       || '',
      niche:        row.niche       || 'Business Owners',
      nicheId:      'n2',
      fitScore:     parseInt(row.fitscore)     || 65,
      timingScore:  parseInt(row.timingscore)  || 60,
      priorityScore:parseInt(row.priorityscore)|| 62,
      status:       row.status      || 'New',
      assignedRep:  row.rep         || 'Unassigned',
      source:       'CSV Import',
      reasonCodes:  row.signals ? [row.signals] : ['Imported from CSV'],
      signals:      { estimatedAssets: row.assets || 'Unknown', ageRange: row.age || 'Unknown', relationship: 'CSV import', nextEvent: 'No trigger set' },
      enrolled:     new Date().toISOString().split('T')[0],
      lastActivity: 'Just added',
      emailDraft:   '',
      activityLog:  [{ type:'CSV Imported', date: new Date().toISOString().split('T')[0], note:'Added via CSV import' }],
    };
  });
}

function prospectsToCSV(prospects) {
  const headers = ['Name','Niche','City','State','Status','Fit Score','Timing Score','Priority Score','Rep','Last Activity','Key Signal','Source'];
  const rows = prospects.map(p => [
    `${p.firstName} ${p.lastName}`, p.niche, p.city, p.state, p.status,
    p.fitScore, p.timingScore, p.priorityScore, p.assignedRep, p.lastActivity,
    (p.reasonCodes[0] || ''), p.source
  ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));
  return [headers.join(','), ...rows].join('\n');
}

// =====================================
// ENTERPRISE INTELLIGENCE — DATA LAYER
// =====================================
// Source connectors (Phase 2 API):
//   Wealth    → Windfall / WealthEngine
//   Liquidity → Crunchbase Pro / PitchBook
//   Contact   → ContactOut / Lusha
//   Court     → UniCourt / LexisNexis
// Until APIs are live: populate via enrichment CSV import

const ENRICHMENT_STORE = JSON.parse(localStorage.getItem('aumEngineEnrichment') || 'null') || {

  // ── AI-Displaced Executives (Alfred Wealth Trigger Miner) ──
  'p25': {
    wealthScore: 87,        estimatedNetWorth: '$4M–$7M',
    liquidityEvent:     'Departed Apple — Director, Data Science — AI reorg',
    liquidityEventType: 'exec_transition',  liquidityEventDate: 'Mar 2026',
    personalEmail: 'k.m****ald@gmail.com',  personalPhone: '+1 541-***-****',
    contactConfidence: 'high',
    courtSignal: null, courtSignalType: null, courtSignalDate: null,
    enrichedAt: '2026-04-06', enrichmentSources: ['windfall','crunchbase','contactout'],
  },
  'p26': {
    wealthScore: 92,        estimatedNetWorth: '$3.5M–$6M',
    liquidityEvent:     'Early retirement declared — IBM Global VP — pension + stock grant activation',
    liquidityEventType: 'exec_transition',  liquidityEventDate: 'Apr 2026',
    personalEmail: 'n.molina92@icloud.com', personalPhone: '+1 305-***-****',
    contactConfidence: 'high',
    courtSignal: null, courtSignalType: null, courtSignalDate: null,
    enrichedAt: '2026-04-06', enrichmentSources: ['windfall','crunchbase','contactout'],
  },
  'p29': {
    wealthScore: 91,        estimatedNetWorth: '$4M–$8M',
    liquidityEvent:     'Post-Salesforce transition — deferred comp + unvested equity window open',
    liquidityEventType: 'exec_transition',  liquidityEventDate: 'Mar 2026',
    personalEmail: null, personalPhone: null, contactConfidence: null,
    courtSignal: null, courtSignalType: null, courtSignalDate: null,
    enrichedAt: '2026-04-06', enrichmentSources: ['windfall','crunchbase'],
  },

  // ── Business Owners ──
  'p7': {
    wealthScore: 85,        estimatedNetWorth: '$7.4M+',
    liquidityEvent:     'Year-end PE secondary — Castellano Capital liquidity event',
    liquidityEventType: 'secondary',        liquidityEventDate: 'Q4 2026',
    personalEmail: null, personalPhone: null, contactConfidence: null,
    courtSignal: null, courtSignalType: null, courtSignalDate: null,
    enrichedAt: '2026-04-06', enrichmentSources: ['crunchbase','windfall'],
  },
  'p18': {
    wealthScore: 94,        estimatedNetWorth: '$14M (pending close)',
    liquidityEvent:     'LOI signed — Keene Logistics acquisition — est. $14M proceeds',
    liquidityEventType: 'acquisition',      liquidityEventDate: 'Q2 2026',
    personalEmail: null, personalPhone: null, contactConfidence: null,
    courtSignal: null, courtSignalType: null, courtSignalDate: null,
    enrichedAt: '2026-04-06', enrichmentSources: ['crunchbase','windfall'],
  },

  // ── Inheritance Recipient (UniCourt probate signal) ──
  'p4': {
    wealthScore: 68,        estimatedNetWorth: '$1.4M',
    liquidityEvent: null, liquidityEventType: null, liquidityEventDate: null,
    personalEmail: 'm.d****z@gmail.com',    personalPhone: '+1 239-***-****',
    contactConfidence: 'medium',
    courtSignal: 'Probate filing — Collier County, FL',
    courtSignalType: 'probate', courtSignalDate: 'Jul 2025',
    enrichedAt: '2026-04-06', enrichmentSources: ['windfall','contactout','unicourt'],
  },
};

function getEnrichment(prospectId) {
  return ENRICHMENT_STORE[prospectId] || null;
}

function saveEnrichment(prospectId, data) {
  ENRICHMENT_STORE[prospectId] = {
    ...(ENRICHMENT_STORE[prospectId] || {}),
    ...data,
    enrichedAt: new Date().toISOString().split('T')[0],
  };
  try { localStorage.setItem('aumEngineEnrichment', JSON.stringify(ENRICHMENT_STORE)); } catch(e) {}
}

function getEnrichmentSignals(e) {
  if (!e) return { wealth: false, liquidity: false, contact: false, court: false, count: 0 };
  const wealth    = !!e.wealthScore;
  const liquidity = !!e.liquidityEvent;
  const contact   = !!(e.personalEmail || e.personalPhone);
  const court     = !!e.courtSignal;
  return { wealth, liquidity, contact, court, count: [wealth,liquidity,contact,court].filter(Boolean).length };
}

// Liquidity event type → label + color
function getLiquidityBadge(type) {
  const map = {
    exec_transition: { label: 'Exec Exit',    color: '#f59e0b' },
    series_b:        { label: 'Series B',     color: '#a78bfa' },
    acquisition:     { label: 'Acquisition',  color: '#34d399' },
    secondary:       { label: 'Secondary',    color: '#60a5fa' },
    ipo:             { label: 'IPO',          color: '#22d3ee' },
  };
  return map[type] || { label: type || 'Event', color: '#94a3b8' };
}

