// =====================================
// THE AUM ENGINE — APP CONTROLLER v1.3
// =====================================

// ===== THEME (init before anything renders) =====
(function initTheme() {
  const saved = localStorage.getItem('aumTheme') || 'dark';
  document.documentElement.dataset.theme = saved;
})();

function toggleTheme() {
  const html   = document.documentElement;
  const isDark = html.dataset.theme === 'dark';
  const next   = isDark ? 'light' : 'dark';
  html.dataset.theme = next;
  localStorage.setItem('aumTheme', next);
  _syncAllThemeButtons(next);
}

function syncThemeButton() {
  const t = document.documentElement.dataset.theme || 'dark';
  _syncAllThemeButtons(t);
}

function _syncAllThemeButtons(theme) {
  const isDark = theme === 'dark';
  // Cockpit sidebar button
  const icon  = document.getElementById('theme-icon');
  const label = document.getElementById('theme-label');
  if (icon)  icon.textContent  = isDark ? '☀️' : '🌙';
  if (label) label.textContent = isDark ? 'Light Mode' : 'Dark Mode';
  // Landing page header button
  const pubIcon = document.getElementById('pub-theme-icon');
  if (pubIcon) pubIcon.textContent = isDark ? '☀️' : '🌙';
}

// ===== STATE =====
let currentPage          = 'command-center';
let drawerProspect       = null;
let activeNiche          = null;
let activeFilters        = { status:'all', niche:'all' };
let activeOutreachType   = 'email';
let activeOutreachProspectId = PROSPECTS[0].id;   // ← Phase 1.2: real prospect switching
let activeMeetingProspect   = null;
let miningActive         = false;
let _boundOverlay        = null;                  // ← Phase 1.2: prevent double-bind

// ── Niche Wizard State (v2.0) ──
// stage: 0=macro, 1=quick-preview, 2=meso, 3=micro, 4=results
let nicheWizardStage  = 0;
let nicheAnswers      = {};   // { questionId: answerIndex (0-4) }
let nicheProfile      = null; // generated profile object
let nichePath         = null; // { macro, meso, micro, topNiches } — built after macro
let nichePreviewScores = null; // preliminary scores from macro-only
function _saveAnswersCache() {
  // Dual-write: localStorage (instant) + Firestore (cross-device)
  try { localStorage.setItem('aumNicheAnswers', JSON.stringify(nicheAnswers)); } catch(e){}
  if (typeof saveNicheAnswersToFirestore === 'function' && typeof currentUID !== 'undefined' && currentUID) {
    saveNicheAnswersToFirestore(currentUID, nicheAnswers);
  }
}
function _loadAnswersCache() {
  try {
    const raw = localStorage.getItem('aumNicheAnswers');
    return raw ? JSON.parse(raw) : {};
  } catch(e) { return {}; }
}
function _clearAnswersCache() {
  try { localStorage.removeItem('aumNicheAnswers'); localStorage.removeItem('aumNicheProfile'); } catch(e){}
}

// ── Firestore Bootstrap — called by auth.js after login ─────────────────────
function initWithUserData(data) {
  if (!data) return;
  // Hydrate niche profile from Firestore (overrides localStorage)
  if (data.nicheProfile) {
    nicheProfile     = data.nicheProfile;
    nichePath        = data.nicheProfile.path || null;
    nicheWizardStage = 4;
    // Also write back to localStorage as offline fallback
    try { localStorage.setItem('aumNicheProfile', JSON.stringify(nicheProfile)); } catch(e){}
  } else if (Object.keys(data.nicheAnswers || {}).length > 0) {
    // Partial session — restore in-progress answers
    nicheAnswers = data.nicheAnswers;
    try { localStorage.setItem('aumNicheAnswers', JSON.stringify(nicheAnswers)); } catch(e){}
  }
  // Hydrate ICP config from Firestore
  if (data.icpConfig) {
    Object.assign(ICP_CONFIG, data.icpConfig);
    try { localStorage.setItem('aumEngineICP', JSON.stringify(ICP_CONFIG)); } catch(e){}
  }
  // Hydrate advisor routing profile from Firestore (Phase B)
  if (data.advisorProfile) {
    window._advisorProfile = data.advisorProfile;
  }

  // ── Phase B: Merge Firestore-assigned leads into PROSPECTS ──────────────
  // Prepend live leads to top of PROSPECTS so they appear first in scoreboard.
  // Deduplicate by masterLeadId to prevent double-entry on re-login.
  if (data.assignedLeads && data.assignedLeads.length > 0) {
    const existingIds = new Set(PROSPECTS.map(p => p.masterLeadId).filter(Boolean));
    const fresh = data.assignedLeads.filter(l => !existingIds.has(l.masterLeadId));
    if (fresh.length > 0) {
      PROSPECTS.unshift(...fresh);
      console.info(`[AUM] Loaded ${fresh.length} assigned lead(s) from Firestore.`);
    }
    activeOutreachProspectId = PROSPECTS[0]?.id || activeOutreachProspectId;
  }

  // ── CLIENT INTELLIGENCE: load ED situations + Al assignments (non-blocking) ──
  const _uid = typeof currentUID !== 'undefined' ? currentUID : null;
  if (_uid && typeof loadEdSituationsForAdvisor === 'function') {
    loadEdSituationsForAdvisor(_uid).then(sits => {
      window._edSituations = sits;
      console.info(`[AUM] Loaded ${sits.length} ED situation(s).`);
    }).catch(e => console.warn('[AUM] ED situations load failed:', e));
  }
  if (_uid && typeof loadAlAssignmentsForAdvisor === 'function') {
    loadAlAssignmentsForAdvisor(_uid).then(assigns => {
      window._alAssignments = assigns;
      console.info(`[AUM] Loaded ${assigns.length} Al assignment(s).`);

      // ── Merge routing-engine leads into PROSPECTS (same pattern as lead_assignments) ──
      // These are leads written by routing_engine.js / route_batch.js to al_assignments.
      // They come back as PROSPECTS-schema objects (id:'al_'+docId) and need to appear
      // in the pipeline board and scoreboard like any other lead.
      if (assigns.length > 0) {
        const existingIds = new Set(PROSPECTS.map(p => p.masterLeadId).filter(Boolean));
        const freshAl = assigns.filter(l => l.masterLeadId && !existingIds.has(l.masterLeadId));
        if (freshAl.length > 0) {
          PROSPECTS.unshift(...freshAl);
          console.info(`[AUM] Injected ${freshAl.length} routing-engine lead(s) from al_assignments into PROSPECTS.`);
          // Re-render current page to show new leads (non-blocking)
          requestAnimationFrame(() => { if (typeof renderPage === 'function') renderPage(); });
        }
      }
    }).catch(e => console.warn('[AUM] Al assignments load failed:', e));
  }
  // Restore any in-session status overrides from localStorage
  _restoreStatusCache();

  // Load Sentinel config — sets window.SENTINEL_ENABLED asynchronously (non-blocking)
  // auth.js reads this flag 1.5s later to reveal/hide the nav item.
  if (typeof loadSentinelConfig === 'function') {
    loadSentinelConfig().catch(() => {});
  }
}

// ===== ROUTER =====
function navigate(page) {
  currentPage = page;
  // Check if any snoozed leads have expired — auto-promote them back to New
  if (typeof _checkSnoozedLeads === 'function') _checkSnoozedLeads();
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const el = document.getElementById('nav-'+page);
  if (el) el.classList.add('active');

  // Reset ED intake state when leaving the intake flow
  if (!['ed-disclosure','ed-intake'].includes(page)) {
    try { localStorage.removeItem('edConsentGiven'); } catch(e){}
    window._edIntakeInitialized = false;
    if (window.EdIntakeEngine?.reset) window.EdIntakeEngine.reset();
  }

  // Update presence with current page (non-blocking)
  if (typeof updatePresencePage === 'function' && window._currentUser) {
    updatePresencePage(window._currentUser.uid, page);
  }

  // Auto-restore niche state on every visit to niche-mapping
  if (page === 'niche-mapping' && nicheWizardStage === 0) {
    const savedProfile = loadSavedNicheProfile();
    if (savedProfile) {
      nicheProfile      = savedProfile;
      nichePath         = savedProfile.path || null;
      nicheWizardStage  = 4;
    } else {
      const cached = _loadAnswersCache();
      if (Object.keys(cached).length > 0) { nicheAnswers = cached; }
    }
  }

  renderPage();
}

function renderPage() {
  const main = document.getElementById('main-content');
  main.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'fade-in';
  div.style.minHeight = '100%';
  const pageMap = {
    'command-center' : pageCommandCenter,
    'prospect-mine'  : pageProspectMine,
    'lead-scoreboard': pageLeadScoreboard,
    'niche-mapping'  : pageNicheMapping,
    'outreach-studio': pageOutreachStudio,
    'nurture-booking': pageNurtureBooking,
    'meeting-prep'   : pageMeetingPrep,
    'manager-console': pageManagerConsole,
    'settings'       : pageSettings,
    'admin-dashboard': typeof pageAdminDashboard === 'function' ? pageAdminDashboard : pageCommandCenter,
    // ── CLIENT INTELLIGENCE (ED/Al) ───────────────────────────────
    'ed-disclosure'  : typeof pageEdDisclosure  === 'function' ? pageEdDisclosure  : pageCommandCenter,
    'ed-intake'      : typeof pageEdIntake      === 'function' ? pageEdIntake      : pageCommandCenter,
    'privacy'        : typeof pagePrivacyPolicy  === 'function' ? pagePrivacyPolicy  : pageCommandCenter,
    // ── SECURITY SENTINEL ───────────────────────────────────────
    'security-sentinel': typeof pageSentinelDashboard === 'function' ? pageSentinelDashboard : pageCommandCenter,
  };
  div.innerHTML = (pageMap[currentPage] || pageCommandCenter)();
  main.appendChild(div);
  bindPageEvents();
  // After DOM is ready, load admin data if on admin page
  if (currentPage === 'admin-dashboard' && typeof renderAdminDashboard === 'function') {
    renderAdminDashboard();
  }
  // Load advisor's own activity stats on Command Center
  if (currentPage === 'command-center' && typeof FunnelTracker !== 'undefined') {
    setTimeout(() => FunnelTracker.loadMyActivity(), 300);
  }
}

// ===== PROSPECT MINE =====
function startMining() {
  if (miningActive) return;                // ← Phase 1.2 guard
  const status = document.getElementById('mining-status');
  if (!status) return;
  miningActive = true;
  status.innerHTML = `<div class="agent-thinking"><div class="agent-dots"><span>💎</span><span>💎</span><span>💎</span></div>Prospect Mine Agent running — scanning niche signals…</div>`;
  setTimeout(()=>{
    miningActive = false;
    if (status) status.innerHTML = `<div class="agent-thinking" style="color:var(--emerald);border-color:rgba(52,211,153,0.2);background:rgba(52,211,153,0.06)">✓ Mine complete — 14 new prospects found and scored</div>`;
    showToast('💎 14 new prospects mined and added to scoreboard!','✅');
  }, 3200);
}

function selectNiche(id) {
  activeNiche = id;
  document.querySelectorAll('.niche-card').forEach(c=>c.classList.remove('active'));
  const el = document.getElementById('niche-'+id);
  if (el) el.classList.add('active');
}

// ===== NICHE WIZARD v2.0 (macro → meso → micro → results) =====

function selectNicheAnswer(questionId, answerIdx) {
  nicheAnswers[questionId] = answerIdx;
  _saveAnswersCache(); // persist after every click
  const group = document.getElementById('lg-' + questionId);
  if (group) {
    group.querySelectorAll('.likert-btn').forEach((btn, i) => {
      btn.classList.toggle('selected', i === answerIdx);
    });
  }
  const card = document.getElementById('wq-' + questionId);
  if (card) card.classList.add('answered');
  refreshWizardNavState();
}

function _currentStageQuestions() {
  if (nicheWizardStage === 0) return MACRO_QUESTIONS;
  if (nicheWizardStage === 1) return []; // preview stage — no questions
  if (nicheWizardStage === 2) return nichePath ? nichePath.meso  : [];
  if (nicheWizardStage === 3) return nichePath ? nichePath.micro : [];
  return [];
}

function refreshWizardNavState() {
  const qs = _currentStageQuestions();
  const answered = qs.filter(q => nicheAnswers[q.id] !== undefined).length;
  const metaEl = document.querySelector('.wizard-nav-meta');
  if (metaEl) metaEl.textContent = `${answered} of ${qs.length} answered`;
  const advBtn = document.querySelector('.wizard-nav .btn-primary');
  if (!advBtn) return;
  const allDone = answered === qs.length;
  if (allDone) {
    advBtn.removeAttribute('disabled');
    advBtn.style.opacity = '1';
    advBtn.style.cursor = 'pointer';
    if (nicheWizardStage === 2) advBtn.textContent = 'See My Results 🎯';
  } else {
    advBtn.setAttribute('disabled', '');
    advBtn.style.opacity = '0.5';
    advBtn.style.cursor = 'not-allowed';
    if (nicheWizardStage === 2) advBtn.textContent = `${answered}/${qs.length} Answered`;
  }
}

function advanceNicheWizard() {
  const qs = _currentStageQuestions();
  const allAnswered = qs.every(q => nicheAnswers[q.id] !== undefined);
  if (nicheWizardStage !== 1 && !allAnswered) {
    showToast('Answer all questions before continuing', '⚠️'); return;
  }

  if (nicheWizardStage === 0) {
    // Build adaptive path + compute preview scores from macro answers only
    nichePath = selectAssessmentPath(nicheAnswers, 25);
    const macroOnlyScores = scoreNicheMapping(nicheAnswers, { macro: MACRO_QUESTIONS, meso: [], micro: [] });
    nichePreviewScores = macroOnlyScores;
    nicheWizardStage = 1; // go to quick preview
  } else if (nicheWizardStage === 1) {
    // Advance from preview to deep assessment
    if (nichePath && nichePath.meso.length > 0) {
      nicheWizardStage = 2;
    } else if (nichePath && nichePath.micro.length > 0) {
      nicheWizardStage = 3;
    } else {
      _computeAndShowResults(); return;
    }
  } else if (nicheWizardStage === 2) {
    if (nichePath && nichePath.micro.length > 0) {
      nicheWizardStage = 3;
    } else {
      _computeAndShowResults(); return;
    }
  } else if (nicheWizardStage === 3) {
    _computeAndShowResults(); return;
  }
  navigate('niche-mapping');
}

function _computeAndShowResults() {
  const path = nichePath || { macro: MACRO_QUESTIONS, meso: [], micro: [] };
  const scores = scoreNicheMapping(nicheAnswers, path);
  nicheProfile = generateNicheProfile(scores, path);
  // Dual-write: localStorage + Firestore
  try { localStorage.setItem('aumNicheProfile', JSON.stringify(nicheProfile)); } catch(e){}
  if (typeof saveNicheProfileToFirestore === 'function' && typeof currentUID !== 'undefined' && currentUID) {
    saveNicheProfileToFirestore(currentUID, nicheProfile);
    // Clear partial answers from Firestore now that we have a complete profile
    if (typeof clearNicheDataFromFirestore === 'function') {
      // Only clear answers doc, keep profile
      saveNicheAnswersToFirestore(currentUID, {});
    }
  }
  nicheWizardStage = 4;
  navigate('niche-mapping');
  showToast(`Top match: ${nicheProfile.top3[0].name} (${nicheProfile.top3[0].score}/100)`, '🎯');
}

function backNicheWizard() {
  nicheWizardStage = Math.max(0, nicheWizardStage - 1);
  navigate('niche-mapping');
}

function scoreAndShowResults() {
  advanceNicheWizard();
}

function resetNicheWizard() {
  nicheWizardStage  = 0;
  nicheAnswers      = {};
  nicheProfile      = null;
  nichePath         = null;
  nichePreviewScores = null;
  _clearAnswersCache();
  // Also clear from Firestore so the next login starts fresh
  if (typeof clearNicheDataFromFirestore === 'function' && typeof currentUID !== 'undefined' && currentUID) {
    clearNicheDataFromFirestore(currentUID);
  }
  renderPage();
}

function viewSavedProfile() {
  const saved = loadSavedNicheProfile();
  if (!saved) return;
  nicheProfile = saved;
  nichePath = saved.path || null;
  nicheWizardStage = 4;
  navigate('niche-mapping');
}

// ── Print / PDF Export ──────────────────────────────────────────────────────
function printNicheProfile() {
  const p = nicheProfile;
  if (!p) return;
  const zoneOrder = ['fit','focus','market','access','service'];
  const zoneLabels = { fit:'Background Fit', focus:'Specialization', market:'Market Depth', access:'Entry Points', service:'Service Match' };
  const zoneColors = { fit:'#60a5fa', focus:'#a78bfa', market:'#22d3ee', access:'#34d399', service:'#fbbf24' };
  const rankLabels = ['#1 Best Fit','#2 Strong Match','#3 Good Match'];
  const completedDate = p.completedAt ? new Date(p.completedAt).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}) : 'N/A';

  const cardHTML = p.top3.map((n, i) => `
    <div style="border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:16px;page-break-inside:avoid">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:12px">
          <span style="font-size:28px">${n.icon}</span>
          <div>
            <div style="font-size:17px;font-weight:800;color:#1e293b">${n.name}</div>
            <div style="font-size:11px;font-weight:600;color:${n.color || '#6366f1'};text-transform:uppercase;letter-spacing:0.5px">${rankLabels[i]}</div>
          </div>
        </div>
        <div style="text-align:center">
          <div style="font-size:32px;font-weight:900;color:#1e293b">${n.score}</div>
          <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Match Score</div>
        </div>
      </div>
      <div style="margin-bottom:${i===0?'14px':'0'}">
        ${zoneOrder.map(z => {
          const pct = (n.zoneBreakdown || {})[z] || 0;
          return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:7px">
            <span style="font-size:11px;color:#64748b;width:110px;flex-shrink:0">${zoneLabels[z]}</span>
            <div style="flex:1;height:7px;background:#f1f5f9;border-radius:4px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${zoneColors[z]};border-radius:4px"></div>
            </div>
            <span style="font-size:11px;color:#334155;width:32px;text-align:right">${pct}%</span>
          </div>`;
        }).join('')}
      </div>
      ${i === 0 && p.messagingAngle ? `
        <div style="margin-top:12px;padding:12px;background:#f8fafc;border-left:3px solid ${n.color||'#6366f1'};border-radius:0 8px 8px 0">
          <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;margin-bottom:5px">Recommended Messaging Angle</div>
          <div style="font-size:12px;color:#334155;line-height:1.6">${p.messagingAngle}</div>
        </div>` : ''}
    </div>`).join('');

  const icp = p.icpBlock || {};
  const icpHTML = `
    <div style="border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:16px;page-break-inside:avoid">
      <div style="font-size:13px;font-weight:800;color:#1e293b;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px">Generated ICP Profile</div>
      ${[
        ['Primary Niche',icp.primaryNiche],['Min Assets',icp.minAssets],
        ['Target Professions',icp.professions],['Life Event Triggers',icp.lifeEventTriggers],
        ['Messaging Angle',icp.messagingAngle]
      ].map(([k,v]) => v ? `
        <div style="display:flex;gap:12px;padding:8px 0;border-bottom:1px solid #f1f5f9">
          <span style="font-size:11px;font-weight:600;color:#64748b;width:130px;flex-shrink:0">${k}</span>
          <span style="font-size:12px;color:#1e293b;flex:1">${v}</span>
        </div>` : '').join('')}
    </div>`;

  const win = window.open('','_blank','width=800,height=900');
  win.document.write(`<!DOCTYPE html><html lang="en"><head>
    <meta charset="UTF-8">
    <title>Niche Profile — The AUM Engine</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; color: #1e293b; padding: 32px; max-width: 740px; margin: 0 auto; }
      @media print {
        body { padding: 16px; }
        .no-print { display: none !important; }
        @page { margin: 1.5cm; }
      }
    </style>
  </head><body>
    <!-- Header -->
    <div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:20px;border-bottom:2px solid #6366f1;margin-bottom:24px">
      <div>
        <div style="font-size:22px;font-weight:900;color:#1e293b">🧭 Your Niche Profile</div>
        <div style="font-size:12px;color:#64748b;margin-top:3px">The AUM Engine · Completed ${completedDate}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:11px;font-weight:700;color:#6366f1">Top Match</div>
        <div style="font-size:19px;font-weight:800;color:#1e293b">${p.top3[0].icon} ${p.top3[0].name}</div>
      </div>
    </div>
    <!-- Niche Cards -->
    <div style="font-size:14px;font-weight:800;color:#1e293b;margin-bottom:14px;text-transform:uppercase;letter-spacing:0.5px">Niche Rankings</div>
    ${cardHTML}
    <!-- ICP -->
    ${icpHTML}
    <!-- Footer -->
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:10px;color:#94a3b8">Generated by The AUM Engine · theaumengine.com</div>
      <div style="font-size:10px;color:#94a3b8">Confidential advisor use only</div>
    </div>
    <!-- Print CTA -->
    <div class="no-print" style="margin-top:24px;text-align:center">
      <button onclick="window.print()" style="background:#6366f1;color:#fff;border:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">🖨️ Print / Save as PDF</button>
    </div>
  </body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 600);
}

// ── Download Profile as JSON ─────────────────────────────────────────────────
function downloadNicheProfile() {
  const p = nicheProfile;
  if (!p) return;
  const data = {
    exportedAt: new Date().toISOString(),
    source: 'The AUM Engine — Niche Mapping Engine v2.1',
    primaryNiche: p.top3[0].name,
    matchScore: p.top3[0].score,
    top3: p.top3.map(n => ({ name: n.name, icon: n.icon, score: n.score, zoneBreakdown: n.zoneBreakdown })),
    icpProfile: p.icpBlock,
    messagingAngle: p.messagingAngle,
    completedAt: p.completedAt
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `aum-niche-profile-${p.top3[0].name.replace(/\s+/g,'-').toLowerCase()}-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Profile downloaded as JSON', '💾');
}

function applyProfileToSettings() {
  if (!nicheProfile) { showToast('No profile to apply yet', '⚠️'); return; }
  applyNicheProfileToICP(nicheProfile);

  // ── Phase B: Sync discovered niches → routing engine ──────────────────
  // The niche wizard is the source of truth for which leads get routed here.
  // Map top3 niche names → nicheIds the routing engine understands.
  const NICHE_ID_MAP = {
    'Aircraft Owners':          'aircraft-owners',
    'Physicians':               'physicians',
    'Business Owners':          'business-owners',
    'Law Partners':             'law-partners',
    'HENRYs':                   'henrys',
    'C-Suite Executives':       'c-suite-executives',
    'AI-Displaced Executives':  'ai-displaced-executives',
    'Dentists & Specialists':   'dentists-specialists',
    'High Earning Tradesman':   'high-earning-tradesman',
    'Inheritance Recipients':   'inheritance-recipients',
    'Real Estate Developers':   'real-estate-developers',
    'Charity Boards':           'charity-board-members',
  };

  const discoveredNicheIds = (nicheProfile.top3 || [])
    .map(n => NICHE_ID_MAP[n.name] || n.id)
    .filter(Boolean);

  if (discoveredNicheIds.length > 0 && typeof currentUID !== 'undefined' && currentUID) {
    // 1. Update advisorProfile doc (what db.js reads on login)
    if (typeof saveAdvisorProfileToFirestore === 'function') {
      const existing = window._advisorProfile || {};
      saveAdvisorProfileToFirestore(currentUID, {
        ...existing,
        nicheIds:           discoveredNicheIds,
        nicheDiscoveredAt:  new Date().toISOString(),
        nicheSource:        'wizard',
        topNiche:           nicheProfile.top3[0]?.name || '',
        eligibleForRouting: true,
      });
    }
    // 2. Update advisor_pool (what processRoutingQueue reads for matching)
    if (typeof syncNicheToAdvisorPool === 'function') {
      syncNicheToAdvisorPool(currentUID, discoveredNicheIds, nicheProfile);
    }
    console.info('[AUM] Niche discovery synced to routing engine:', discoveredNicheIds);
  }

  showToast(`✅ Niche set: ${nicheProfile.top3[0].name} — routing engine updated`, '🎯');
  navigate('settings');
}

// ===== LEAD SCOREBOARD =====
function setFilter(key,val) { activeFilters[key]=val; }
function filterProspects(q) {
  const rows = document.querySelectorAll('#scoreboard-body tr');
  const lq = q.toLowerCase();
  rows.forEach(row=>{ row.style.display = row.textContent.toLowerCase().includes(lq)?'':'none'; });
}

// ===== PROSPECT STATUS UPDATE =====
// The canonical way to move a lead through the pipeline.
// Updates: in-memory PROSPECTS[], localStorage, Firestore (al_assignments or lead_assignments),
//          fires a funnel_event, then re-renders the current page.
function setProspectStatus(id, newStatus) {
  const p = PROSPECTS.find(x => x.id === id);
  if (!p) return;

  const prevStatus = p.status;
  if (prevStatus === newStatus) return; // no-op

  // 1 — Mutate in-memory
  p.status       = newStatus;
  p.lastActivity = 'Just now';

  // 2 — Persist to localStorage (demo prospects)
  try {
    const cache = JSON.parse(localStorage.getItem('aum_prospect_statuses') || '{}');
    cache[id] = { status: newStatus, updatedAt: new Date().toISOString() };
    localStorage.setItem('aum_prospect_statuses', JSON.stringify(cache));
  } catch(e) {}

  // 3 — Firestore write-back (non-blocking)
  if (p._fromFirestore && p.assignmentId) {
    // Routing engine leads live in al_assignments
    if (typeof updateAlAssignmentStatus === 'function') {
      updateAlAssignmentStatus(p.assignmentId, newStatus).catch(() => {});
    }
    // Legacy Layer 1 leads also update lead_assignments advisorStatus
    if (typeof updateLeadStatusInFirestore === 'function') {
      updateLeadStatusInFirestore(p.assignmentId, newStatus).catch(() => {});
    }
  }

  // 4 — Funnel event (fire-and-forget)
  if (typeof FunnelTracker !== 'undefined') {
    FunnelTracker.leadStatusChanged(id, prevStatus, newStatus);
    // If moving to "Booked" → also fire meeting_booked
    if (newStatus === 'Booked') FunnelTracker.meetingBooked(id, p.nicheId);
  }

  // 5 — Re-render and toast
  closeDrawer();
  navigate(currentPage);
  const icons = {
    Contacted: '📞', Engaged: '💬', Nurture: '🌱',
    'Meeting Requested': '📅', Booked: '🎉', Dead: '❌', New: '🔄'
  };
  showToast(`${icons[newStatus] || '↗'} ${p.firstName} moved to ${newStatus}`, '✅');
}

// Restores status overrides from localStorage on app boot (called from initWithUserData)
function _restoreStatusCache() {
  try {
    const cache = JSON.parse(localStorage.getItem('aum_prospect_statuses') || '{}');
    Object.entries(cache).forEach(([id, data]) => {
      const p = PROSPECTS.find(x => x.id === id);
      if (p && data.status) { p.status = data.status; }
    });
  } catch(e) {}
}

// ===== RE-ENGAGE / SNOOZE SYSTEM =====
// Moves a Dead lead to "Snoozed" with a timestamp. The lead sits in the Snoozed column
// (hidden from active workflow) and auto-promotes back to "New" after the chosen interval.

// Snooze a lead for N days: status → "Snoozed", stores snoozeUntil timestamp
function snoozeProspect(id, days) {
  const p = PROSPECTS.find(x => x.id === id);
  if (!p) return;

  const snoozeUntil = new Date();
  snoozeUntil.setDate(snoozeUntil.getDate() + parseInt(days));

  p.status       = 'Snoozed';
  p.lastActivity = 'Snoozed';
  p._snoozeUntil = snoozeUntil.toISOString();
  p._snoozeDays  = days;

  try {
    const statCache = JSON.parse(localStorage.getItem('aum_prospect_statuses') || '{}');
    statCache[id] = { status: 'Snoozed', updatedAt: new Date().toISOString() };
    localStorage.setItem('aum_prospect_statuses', JSON.stringify(statCache));

    const snoozeCache = JSON.parse(localStorage.getItem('aum_snooze_cache') || '{}');
    snoozeCache[id] = { snoozeUntil: snoozeUntil.toISOString(), days, snoozedAt: new Date().toISOString() };
    localStorage.setItem('aum_snooze_cache', JSON.stringify(snoozeCache));
  } catch(e) {}

  if (p._fromFirestore && p.assignmentId && typeof updateAlAssignmentStatus === 'function') {
    updateAlAssignmentStatus(p.assignmentId, 'Snoozed').catch(() => {});
  }

  const until = snoozeUntil.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
  document.getElementById('snooze-modal')?.remove();
  closeDrawer();
  navigate(currentPage);
  showToast('⏰ ' + p.firstName + ' snoozed — returns ' + until, '✅');
}

// Check all snoozed leads — auto-promote any with expired snoozeUntil dates back to New
// Runs on boot (inside _restoreStatusCache) and on every navigate() invocation
function _checkSnoozedLeads() {
  try {
    const snoozeCache = JSON.parse(localStorage.getItem('aum_snooze_cache') || '{}');
    const statCache   = JSON.parse(localStorage.getItem('aum_prospect_statuses') || '{}');
    const now = Date.now();
    const promoted = [];

    Object.entries(snoozeCache).forEach(([id, data]) => {
      if (!data.snoozeUntil) return;
      if (now >= new Date(data.snoozeUntil).getTime()) {
        const p = PROSPECTS.find(x => x.id === id);
        if (p && p.status === 'Snoozed') {
          p.status       = 'New';
          p.lastActivity = 'Re-activated';
          p._snoozeUntil = null;
          p._snoozeDays  = null;
          statCache[id]  = { status: 'New', updatedAt: new Date().toISOString() };
          promoted.push(p.firstName + ' ' + p.lastName);
        }
        delete snoozeCache[id];
      } else {
        const p = PROSPECTS.find(x => x.id === id);
        if (p) { p._snoozeUntil = data.snoozeUntil; p._snoozeDays = data.days; }
      }
    });

    localStorage.setItem('aum_snooze_cache', JSON.stringify(snoozeCache));
    localStorage.setItem('aum_prospect_statuses', JSON.stringify(statCache));
    if (promoted.length) showToast('🔄 ' + promoted.join(', ') + ' re-entered the queue', '📅');
  } catch(e) {}
}

// Snooze picker modal — shows 90/120/180/365 day options + custom input
function showSnoozeModal(prospectId) {
  const p = PROSPECTS.find(x => x.id === prospectId);
  if (!p) return;
  document.getElementById('snooze-modal')?.remove();

  const opts = [
    { days: 90,  label: '90 Days', sub: '"Call me in 3 months"' },
    { days: 120, label: '120 Days', sub: '"Check back next quarter"' },
    { days: 180, label: '180 Days', sub: '"Reach out in 6 months"' },
    { days: 365, label: '1 Year',   sub: '"Annual cycle / waiting on event"' },
  ];

  const modal = document.createElement('div');
  modal.id = 'snooze-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;animation:fadeIn 0.15s ease;';
  modal.innerHTML = `
    <div style="background:var(--bg-card);border:1px solid var(--border-default);border-radius:16px;
      padding:26px;width:380px;max-width:90vw;box-shadow:0 24px 64px rgba(0,0,0,0.4);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-size:15px;font-weight:800;color:var(--text-primary)">♻️ Re-engage ${p.firstName} ${p.lastName}</div>
        <button onclick="document.getElementById('snooze-modal').remove()"
          style="background:none;border:none;font-size:18px;color:var(--text-muted);cursor:pointer;padding:4px 8px;border-radius:6px">✕</button>
      </div>
      <div style="font-size:11.5px;color:var(--text-muted);margin-bottom:20px;line-height:1.5">
        Re-label this lead and send it back to <strong style="color:var(--blue)">New</strong> after the chosen snooze window.
        They'll reappear at the top of your queue automatically — no manual follow-up needed.
      </div>
      <div style="font-size:10px;font-weight:700;color:var(--text-muted);letter-spacing:0.07em;text-transform:uppercase;margin-bottom:10px">Re-activate interval</div>
      <div style="display:flex;flex-direction:column;gap:7px;margin-bottom:20px">
        ${opts.map(o => `
        <button onclick="snoozeProspect('${prospectId}',${o.days})"
          style="display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:10px;
          border:1px solid var(--border-subtle);background:transparent;cursor:pointer;text-align:left;width:100%;
          font-family:inherit;transition:all 0.15s ease"
          onmouseover="this.style.borderColor='var(--amber)';this.style.background='rgba(251,191,36,0.06)'"
          onmouseout="this.style.borderColor='var(--border-subtle)';this.style.background='transparent'">
          <div style="width:44px;height:44px;border-radius:10px;background:rgba(251,191,36,0.1);
            border:1px solid rgba(251,191,36,0.2);display:flex;align-items:center;justify-content:center;
            font-size:10px;font-weight:800;color:var(--amber);flex-shrink:0;line-height:1.2;text-align:center;">
            ${o.label}</div>
          <div>
            <div style="font-size:13px;font-weight:700;color:var(--text-primary)">${o.label} snooze</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${o.sub}</div>
          </div>
        </button>`).join('')}
      </div>
      <div style="border-top:1px solid var(--border-subtle);padding-top:16px">
        <div style="font-size:10px;font-weight:700;color:var(--text-muted);letter-spacing:0.07em;text-transform:uppercase;margin-bottom:8px">Custom interval</div>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="number" id="custom-snooze-days" min="7" max="730" value="90"
            style="width:72px;background:var(--bg-elevated);border:1px solid var(--border-default);
            border-radius:8px;color:var(--text-primary);font-family:inherit;font-size:14px;font-weight:700;
            padding:8px 10px;outline:none;text-align:center">
          <span style="font-size:12px;color:var(--text-muted)">days</span>
          <button onclick="const d=parseInt(document.getElementById('custom-snooze-days').value);if(d>=7&&d<=730)snoozeProspect('${prospectId}',d);"
            style="flex:1;padding:9px 12px;border-radius:8px;background:rgba(251,191,36,0.1);
            border:1px solid rgba(251,191,36,0.25);color:var(--amber);font-weight:700;
            font-size:12.5px;cursor:pointer;font-family:inherit">Set Snooze ⏰</button>
        </div>
      </div>
    </div>`;
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

// Status picker modal — displayed when advisor clicks "Update Status" in drawer
function showStatusModal(prospectId) {
  const p = PROSPECTS.find(x => x.id === prospectId);
  if (!p) return;

  // Remove any existing modal
  document.getElementById('status-modal')?.remove();

  const statuses = ['New','Contacted','Engaged','Nurture','Meeting Requested','Booked','Dead'];
  const colors   = {
    New:'var(--text-muted)', Contacted:'var(--blue)', Engaged:'var(--violet)',
    Nurture:'var(--amber)', 'Meeting Requested':'var(--blue)', Booked:'var(--emerald)', Dead:'var(--rose)'
  };
  const icons = {
    New:'🔵', Contacted:'📞', Engaged:'💬',
    Nurture:'🌱', 'Meeting Requested':'📅', Booked:'🎉', Dead:'❌'
  };
  const descriptions = {
    New: 'Lead not yet contacted',
    Contacted: 'First outreach sent',
    Engaged: 'Prospect replied or showing interest',
    Nurture: 'Long-term — not ready yet',
    'Meeting Requested': 'Meeting ask made',
    Booked: 'Meeting confirmed on calendar',
    Dead: 'Not a fit — mark as inactive',
  };

  const modal = document.createElement('div');
  modal.id = 'status-modal';
  modal.style.cssText = `
    position:fixed;inset:0;z-index:9999;
    background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);
    display:flex;align-items:center;justify-content:center;
    animation:fadeIn 0.15s ease;
  `;
  modal.innerHTML = `
    <div style="background:var(--bg-card);border:1px solid var(--border-default);border-radius:16px;
      padding:24px;width:340px;max-width:90vw;box-shadow:0 24px 64px rgba(0,0,0,0.4);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div>
          <div style="font-size:14px;font-weight:800;color:var(--text-primary)">Move ${p.firstName} ${p.lastName}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Current: <span style="color:var(--blue);font-weight:600">${p.status}</span></div>
        </div>
        <button onclick="document.getElementById('status-modal').remove()"
          style="background:none;border:none;font-size:18px;color:var(--text-muted);cursor:pointer;padding:4px 8px;border-radius:6px">✕</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${statuses.map(s => `
          <button onclick="setProspectStatus('${prospectId}','${s}');document.getElementById('status-modal')?.remove()"
            style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;
            border:1px solid ${s === p.status ? 'var(--blue)' : 'var(--border-subtle)'};
            background:${s === p.status ? 'rgba(96,165,250,0.08)' : 'transparent'};
            cursor:${s === p.status ? 'default' : 'pointer'};text-align:left;width:100%;
            transition:all 0.15s ease" ${s === p.status ? 'disabled' : ''}>
            <span style="font-size:16px">${icons[s]}</span>
            <div style="flex:1">
              <div style="font-size:12px;font-weight:700;color:${colors[s]}">${s}</div>
              <div style="font-size:10px;color:var(--text-muted)">${descriptions[s]}</div>
            </div>
            ${s === p.status ? '<span style="font-size:10px;color:var(--blue);font-weight:700">CURRENT</span>' : ''}
          </button>`).join('')}
      </div>
    </div>`;

  // Click outside to close
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}


// ===== BATCH ACTION MODALS =====

// Run Nurture Batch — shows all Nurture leads with re-engagement email drafts
// Advisor reviews each, clicks "Mark Sent" to log outreach + advance to Contacted
function openNurtureBatch() {
  const leads = PROSPECTS.filter(p => p.status === 'Nurture');
  document.getElementById('batch-modal')?.remove();

  if (!leads.length) {
    showToast('No leads in Nurture right now', '📭');
    return;
  }

  const modal = document.createElement('div');
  modal.id = 'batch-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);display:flex;align-items:flex-start;justify-content:center;padding:40px 20px;overflow-y:auto;animation:fadeIn 0.15s ease;';

  modal.innerHTML = `
    <div style="background:var(--bg-card);border:1px solid var(--border-default);border-radius:18px;
      width:680px;max-width:95vw;box-shadow:0 32px 80px rgba(0,0,0,0.5);">
      <div style="padding:24px 24px 0;display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="font-size:16px;font-weight:800;color:var(--text-primary)">📧 Nurture Batch — ${leads.length} leads</div>
          <div style="font-size:11.5px;color:var(--text-muted);margin-top:4px">
            Review each re-engagement draft. Click <strong style="color:var(--blue)">Mark Sent</strong> after you send it — this logs the outreach and moves the lead to Contacted.
          </div>
        </div>
        <button onclick="document.getElementById('batch-modal').remove()"
          style="background:none;border:none;font-size:20px;color:var(--text-muted);cursor:pointer;padding:4px 8px;margin-left:16px;flex-shrink:0">✕</button>
      </div>

      <div style="padding:16px 24px;display:flex;flex-direction:column;gap:14px">
        ${leads.map(p => {
          const preview = (p.emailDraft || 'No draft available — open in Outreach Studio.')
            .split('\n').slice(0, 5).join('\n').substring(0, 280);
          const daysSince = p.lastActivity || 'Unknown';
          return `
          <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:12px;padding:16px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
              <div>
                <div style="font-size:13px;font-weight:700;color:var(--text-primary)">${p.firstName} ${p.lastName}</div>
                <div style="font-size:11px;color:var(--text-muted)">${p.niche} · ${p.city || ''} ${p.state || ''} · Last: ${daysSince}</div>
              </div>
              <span style="font-size:12px;font-weight:800;color:var(--amber);background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.2);padding:3px 9px;border-radius:20px;white-space:nowrap">🌱 Nurture · ${p.priorityScore}</span>
            </div>
            <div style="background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:8px;
              padding:12px;font-size:11.5px;line-height:1.65;color:var(--text-secondary);
              white-space:pre-line;max-height:120px;overflow-y:auto;margin-bottom:12px;font-family:'JetBrains Mono',monospace">${preview}…</div>
            <div style="display:flex;gap:8px">
              <button onclick="
                setProspectStatus('${p.id}','Contacted');
                const card = this.closest('[data-lead-id=\\'${p.id}\\']') || this.closest('div[style]');
                this.closest('div[style*=border-radius]').style.opacity='0.4';
                this.disabled=true;this.textContent='✓ Sent';
                if(typeof FunnelTracker!=='undefined') FunnelTracker.outreachSent('${p.id}','${p.nicheId}','email');"
                style="flex:1;padding:8px;border-radius:8px;background:var(--blue);color:white;
                border:none;font-weight:700;font-size:12px;cursor:pointer;font-family:inherit">
                ✉️ Mark Sent → Move to Contacted
              </button>
              <button onclick="setOutreachProspect('${p.id}');navigate('outreach-studio');document.getElementById('batch-modal').remove();"
                style="padding:8px 14px;border-radius:8px;background:var(--bg-card);border:1px solid var(--border-default);
                color:var(--text-secondary);font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit">
                Edit in Studio
              </button>
            </div>
          </div>`;
        }).join('')}
      </div>

      <div style="padding:16px 24px 24px;border-top:1px solid var(--border-subtle);display:flex;justify-content:flex-end;gap:8px">
        <button onclick="document.getElementById('batch-modal').remove()"
          style="padding:9px 20px;border-radius:9px;background:var(--bg-elevated);border:1px solid var(--border-default);
          color:var(--text-secondary);font-weight:600;font-size:12.5px;cursor:pointer;font-family:inherit">Done</button>
      </div>
    </div>`;

  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

// Send Booking Links — shows all Meeting Requested leads with booking-link email drafts
// Advisor reviews, clicks "Mark Sent" to log + advance to Booked
function openBookingLinksBatch() {
  const leads = PROSPECTS.filter(p => p.status === 'Meeting Requested');
  document.getElementById('batch-modal')?.remove();

  if (!leads.length) {
    showToast('No Meeting Requested leads right now', '📭');
    return;
  }

  // Pull Calendly / booking link from ICP config or use placeholder
  const calLink = ICP_CONFIG?.bookingLink || '[YOUR_CALENDLY_LINK]';

  const modal = document.createElement('div');
  modal.id = 'batch-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);display:flex;align-items:flex-start;justify-content:center;padding:40px 20px;overflow-y:auto;animation:fadeIn 0.15s ease;';

  modal.innerHTML = `
    <div style="background:var(--bg-card);border:1px solid var(--border-default);border-radius:18px;
      width:680px;max-width:95vw;box-shadow:0 32px 80px rgba(0,0,0,0.5);">
      <div style="padding:24px 24px 0;display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="font-size:16px;font-weight:800;color:var(--text-primary)">📅 Booking Links — ${leads.length} leads</div>
          <div style="font-size:11.5px;color:var(--text-muted);margin-top:4px">
            Send each prospect your booking link to confirm the meeting. Click <strong style="color:var(--emerald)">Mark Sent</strong> to move them to <strong style="color:var(--emerald)">Booked</strong>.
          </div>
        </div>
        <button onclick="document.getElementById('batch-modal').remove()"
          style="background:none;border:none;font-size:20px;color:var(--text-muted);cursor:pointer;padding:4px 8px;margin-left:16px;flex-shrink:0">✕</button>
      </div>

      <div style="padding:16px 24px;display:flex;flex-direction:column;gap:14px">
        ${leads.map(p => {
          const bookingDraft = `Hi ${p.firstName},\n\nExcited to connect. Here's a link to grab a time that works for you:\n${calLink}\n\nThe call is 20–30 minutes. Feel free to pick whatever slot works best — I'll come prepared with a few thoughts relevant to your situation.\n\nLooking forward to it,\n[Your Name]`;
          return `
          <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:12px;padding:16px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
              <div>
                <div style="font-size:13px;font-weight:700;color:var(--text-primary)">${p.firstName} ${p.lastName}</div>
                <div style="font-size:11px;color:var(--text-muted)">${p.niche} · ${p.city || ''} ${p.state || ''} · Score ${p.priorityScore}</div>
              </div>
              <span style="font-size:12px;font-weight:800;color:var(--blue);background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.2);padding:3px 9px;border-radius:20px;white-space:nowrap">📅 Meeting Requested</span>
            </div>
            <div style="background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:8px;
              padding:12px;font-size:11.5px;line-height:1.65;color:var(--text-secondary);
              white-space:pre-line;max-height:120px;overflow-y:auto;margin-bottom:12px;font-family:'JetBrains Mono',monospace">${bookingDraft}</div>
            <div style="display:flex;gap:8px">
              <button onclick="
                setProspectStatus('${p.id}','Booked');
                this.closest('div[style*=border-radius]').style.opacity='0.4';
                this.disabled=true;this.textContent='✓ Sent → Booked';
                if(typeof FunnelTracker!=='undefined') FunnelTracker.meetingBooked('${p.id}','${p.nicheId}');"
                style="flex:1;padding:8px;border-radius:8px;background:var(--emerald);color:white;
                border:none;font-weight:700;font-size:12px;cursor:pointer;font-family:inherit">
                📅 Mark Sent → Move to Booked
              </button>
              <button onclick="navigator.clipboard?.writeText('${calLink}').then(()=>showToast('Link copied','📋')).catch(()=>showToast('Copy manually: ${calLink}','📋'))"
                style="padding:8px 14px;border-radius:8px;background:var(--bg-card);border:1px solid var(--border-default);
                color:var(--text-secondary);font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit">
                Copy Link
              </button>
            </div>
          </div>`;
        }).join('')}
      </div>

      <div id="booking-link-footer" style="padding:16px 24px 24px;border-top:1px solid var(--border-subtle)">
        <div id="booking-link-display" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <div style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:6px;min-width:0">
            <span style="flex-shrink:0">🔗 Booking link:</span>
            ${calLink && calLink !== '[YOUR_CALENDLY_LINK]'
              ? `<a href="${calLink}" target="_blank" style="color:var(--blue);text-decoration:none;font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:280px;display:inline-block">${calLink}</a>`
              : `<span style="color:var(--rose);font-size:11px;font-weight:600">⚠️ Not set — add your Calendly link</span>`
            }
            <button id="booking-link-edit-btn" onclick="
              document.getElementById('booking-link-display').style.display='none';
              document.getElementById('booking-link-edit-form').style.display='flex';"
              style="background:none;border:none;color:var(--blue);font-size:11px;cursor:pointer;white-space:nowrap;flex-shrink:0">Edit</button>
          </div>
          <button onclick="document.getElementById('batch-modal').remove()"
            style="padding:9px 20px;border-radius:9px;background:var(--bg-elevated);border:1px solid var(--border-default);
            color:var(--text-secondary);font-weight:600;font-size:12.5px;cursor:pointer;font-family:inherit;flex-shrink:0">Done</button>
        </div>

        <div id="booking-link-edit-form" style="display:none;gap:8px;align-items:center">
          <span style="font-size:11px;color:var(--text-muted);white-space:nowrap;flex-shrink:0">🔗 Your link:</span>
          <input id="booking-link-input" type="url"
            placeholder="https://calendly.com/yourname/30min"
            value="${calLink !== '[YOUR_CALENDLY_LINK]' ? calLink : ''}"
            style="flex:1;background:var(--bg-elevated);border:1px solid var(--amber);border-radius:8px;
            color:var(--text-primary);font-family:inherit;font-size:12px;padding:8px 10px;outline:none;min-width:0"
            onfocus="this.style.borderColor='var(--blue)'" onblur="this.style.borderColor='var(--amber)'">
          <button onclick="
            const val = document.getElementById('booking-link-input').value.trim();
            if (!val) { showToast('Paste your Calendly link first', '⚠️'); return; }
            ICP_CONFIG.bookingLink = val;
            try { localStorage.setItem('aum_booking_link', val); } catch(e) {}
            // Firestore dual-write — cross-device persistence
            if (typeof saveBookingLink === 'function' && typeof currentUID !== 'undefined' && currentUID) {
              saveBookingLink(currentUID, val).catch(() => {});
            }
            document.getElementById('batch-modal').remove();
            openBookingLinksBatch();"
            style="padding:8px 14px;border-radius:8px;background:var(--blue);border:none;
            color:white;font-weight:700;font-size:12px;cursor:pointer;font-family:inherit;white-space:nowrap">Save ✓</button>
          <button onclick="
            document.getElementById('booking-link-edit-form').style.display='none';
            document.getElementById('booking-link-display').style.display='flex';"
            style="padding:8px 12px;border-radius:8px;background:var(--bg-elevated);border:1px solid var(--border-default);
            color:var(--text-secondary);font-size:12px;cursor:pointer;font-family:inherit">Cancel</button>
        </div>
      </div>
    </div>`;

  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

function setOutreachProspect(id) {
  activeOutreachProspectId = id;
}

function selectOutreachType(type) {
  activeOutreachType = type;
  const prospect = PROSPECTS.find(p=>p.id===activeOutreachProspectId) || PROSPECTS[0];
  const body = document.getElementById('draft-body');
  if (body) {
    body.style.opacity = '0.5';
    setTimeout(()=>{ body.textContent = getDraft(prospect,type); body.style.opacity='1'; },180);
  }
  document.querySelectorAll('.outreach-type-btn').forEach(b=>b.classList.remove('active'));
  const idx = ['email','call','linkedin','voicemail'].indexOf(type);
  const btns = document.querySelectorAll('.outreach-type-btn');
  if (btns[idx]) btns[idx].classList.add('active');
}

function regenerateDraft() {
  const body = document.getElementById('draft-body');
  if (!body) return;
  body.style.opacity='0.3';
  setTimeout(()=>{ body.style.opacity='1'; showToast('Draft regenerated by Outreach Agent','💎'); },1200);
}

function copyDraft() {
  const body = document.getElementById('draft-body');
  if (!body) return;
  navigator.clipboard?.writeText(body.textContent).then(()=>showToast('Draft copied to clipboard','📋'));
}

// ===== MEETING PREP =====
function setActiveMeeting(id) {
  activeMeetingProspect = PROSPECTS.find(p=>p.id===id);
  navigate('meeting-prep');
}

// ===== ICP PERSISTENCE (localStorage) =====
function saveICP() {
  const cfg = {
    primaryNiche:     document.getElementById('icp-niche')?.value    || ICP_CONFIG.primaryNiche,
    minAssets:        document.getElementById('icp-assets')?.value   || ICP_CONFIG.minAssets,
    geography:        document.getElementById('icp-geo')?.value      || ICP_CONFIG.geography,
    professions:      document.getElementById('icp-prof')?.value     || ICP_CONFIG.professions,
    lifeEventTriggers:document.getElementById('icp-events')?.value   || ICP_CONFIG.lifeEventTriggers,
    messagingAngle:   document.getElementById('icp-message')?.value  || ICP_CONFIG.messagingAngle,
  };
  Object.assign(ICP_CONFIG, cfg);
  try { localStorage.setItem('aumEngineICP', JSON.stringify(cfg)); } catch(e){}
  // Dual-write to Firestore
  if (typeof saveICPConfigToFirestore === 'function' && typeof currentUID !== 'undefined' && currentUID) {
    saveICPConfigToFirestore(currentUID, cfg);
  }
  showToast('ICP settings saved','✅');
}

// ===== ADVISOR ROUTING PROFILE (Phase B) =====
function saveAdvisorProfile() {
  const advisorType = document.getElementById('ap-type')?.value || '';
  const statesRaw   = document.getElementById('ap-states')?.value || '';
  const licensedStates = statesRaw.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);

  // Read active filter-chips for capabilities and AUM bands
  const caps  = [...document.querySelectorAll('[data-cap].active')].map(el=>el.dataset.cap);
  const bands = [...document.querySelectorAll('[data-band].active')].map(el=>el.dataset.band);

  const activeLeadCap    = parseInt(document.getElementById('ap-lead-cap')?.value) || 25;
  const calendarCapacity = parseInt(document.getElementById('ap-calendar')?.value) || 8;
  const firmName         = document.getElementById('ap-firm')?.value || '';
  const officeRaw        = document.getElementById('ap-office')?.value || '';
  const officeParts      = officeRaw.split(',').map(s=>s.trim());
  const officeLocations  = officeRaw ? [{ city: officeParts[0]||'', state: officeParts[1]||'' }] : [];

  const profile = {
    advisorType, licensedStates,
    serviceCapabilities: caps,
    targetAUMBands: bands,
    activeLeadCap, calendarCapacity,
    firmName, officeLocations,
  };

  window._advisorProfile = profile;

  // Dual-write: localStorage + Firestore
  try { localStorage.setItem('aumAdvisorProfile', JSON.stringify(profile)); } catch(e){}
  if (typeof saveAdvisorProfileToFirestore === 'function' && typeof currentUID !== 'undefined' && currentUID) {
    saveAdvisorProfileToFirestore(currentUID, profile);
  }
  showToast('Routing profile saved — you\'re in the eligibility pool', '✅');
}

// ===== NOTES PERSISTENCE (localStorage) =====
function saveNotes(prospectId) {
  const ta = document.getElementById('meeting-notes-'+prospectId);
  if (!ta) return;
  NOTES_STORE[prospectId] = ta.value;
  try { localStorage.setItem('aumEngineNotes', JSON.stringify(NOTES_STORE)); } catch(e){}
  showToast('Notes saved to prospect file','✅');
}

// ===== PILOT PROSPECT FEEDBACK (thumbs up/down) =====
function saveFeedback(prospectId, vote) {
  // Toggle off if same vote clicked again
  const current = FEEDBACK_STORE[prospectId];
  FEEDBACK_STORE[prospectId] = current === vote ? null : vote;
  try { localStorage.setItem('aumEngineFeedback', JSON.stringify(FEEDBACK_STORE)); } catch(e){}

  // Animate the buttons in-place (no full re-render)
  const upBtn   = document.getElementById('fb-up-'  + prospectId);
  const downBtn = document.getElementById('fb-down-' + prospectId);
  const newVote = FEEDBACK_STORE[prospectId];
  if (upBtn)   upBtn.classList.toggle('fb-active-up',   newVote === 'up');
  if (downBtn) downBtn.classList.toggle('fb-active-down', newVote === 'down');

  // Phase B: write-back to Firestore for live assigned leads
  const p = PROSPECTS.find(x => x.id === prospectId);
  if (p && p._fromFirestore && p.assignmentId && typeof updateLeadFeedbackInFirestore === 'function') {
    updateLeadFeedbackInFirestore(p.assignmentId, newVote || null, NOTES_STORE[prospectId] || '');
  }

  const label = document.getElementById('fb-label-' + prospectId);
  if (label) {
    label.textContent = newVote === 'up'
      ? '✓ Marked as quality lead'
      : newVote === 'down'
        ? 'Marked as poor fit'
        : 'Rate this prospect';
    label.style.color = newVote === 'up'
      ? 'var(--emerald)'
      : newVote === 'down'
        ? 'var(--rose)'
        : 'var(--text-muted)';
  }
  if (newVote) showToast(newVote === 'up' ? 'Prospect rated 👍 — feedback recorded' : 'Prospect rated 👎 — feedback recorded', '💎');
}

function getFeedbackHTML(prospectId) {
  const vote = FEEDBACK_STORE[prospectId] || null;
  return `
  <div class="feedback-widget" id="fw-${prospectId}">
    <span class="fb-label" id="fb-label-${prospectId}" style="color:${vote === 'up' ? 'var(--emerald)' : vote === 'down' ? 'var(--rose)' : 'var(--text-muted)'}">${
      vote === 'up' ? '✓ Marked as quality lead' : vote === 'down' ? 'Marked as poor fit' : 'Rate this prospect'
    }</span>
    <div class="fb-btns">
      <button class="fb-btn ${vote === 'up' ? 'fb-active-up' : ''}" id="fb-up-${prospectId}"
        onclick="saveFeedback('${prospectId}','up')" title="Quality lead">
        👍
      </button>
      <button class="fb-btn ${vote === 'down' ? 'fb-active-down' : ''}" id="fb-down-${prospectId}"
        onclick="saveFeedback('${prospectId}','down')" title="Poor fit">
        👎
      </button>
    </div>
  </div>`;
}

// ===== CSV IMPORT =====
function triggerCSVImport() {
  const el = document.getElementById('csv-file-input') || document.getElementById('csv-file-input2');
  if (el) el.click();
}

function handleCSVImport(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const parsed = parseCSV(e.target.result);
    if (!parsed.length) { showToast('No valid rows found in CSV','⚠️'); return; }
    parsed.forEach(p => {
      if (!PROSPECTS.find(x=>x.firstName===p.firstName&&x.lastName===p.lastName)) {
        PROSPECTS.push(p);
      }
    });
    showToast(`✅ ${parsed.length} prospects imported from CSV`,'💎');
    navigate(currentPage);
  };
  reader.readAsText(file);
  input.value = '';
}

// ===== CSV EXPORT =====
function exportCSV() {
  const worked = PROSPECTS.filter(p=>!['New','Dead'].includes(p.status));
  if (!worked.length) { showToast('No worked leads to export yet','⚠️'); return; }
  const csv = prospectsToCSV(worked);
  const blob = new Blob([csv], {type:'text/csv'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `aum-engine-leads-${new Date().toISOString().split('T')[0]}.csv`;
  a.click(); URL.revokeObjectURL(url);
  showToast(`Exported ${worked.length} worked leads to CSV`,'⬇');
}

// ===== PROSPECT DRAWER =====
function openDrawer(id) {
  const p = PROSPECTS.find(x=>x.id===id);
  if (!p) return;
  drawerProspect = p;
  document.getElementById('drawer-content').innerHTML = `
  <div class="drawer-header">
    <div style="display:flex;align-items:flex-start;gap:12px">
      <div class="dossier-avatar ${getAvatarClass(p.lastName)}" style="width:44px;height:44px;border-radius:10px;font-size:16px;font-weight:800">${getInitials(p.firstName,p.lastName)}</div>
      <div>
        <div style="font-size:16px;font-weight:800;color:var(--text-primary)">${p.firstName} ${p.lastName}</div>
        <div style="font-size:12px;color:var(--text-muted)">${p.title} · ${p.company}</div>
        <div style="margin-top:5px">${getStatusPill(p.status)}</div>
      </div>
    </div>
    <button class="drawer-close" onclick="closeDrawer()">✕</button>
  </div>
  <div class="drawer-section">
    <div class="drawer-section-title">Scores</div>
    <div class="grid-3" style="gap:8px">
      <div style="text-align:center;background:var(--bg-elevated);border-radius:8px;padding:10px"><div style="font-size:22px;font-weight:900;color:#60a5fa">${p.fitScore}</div><div style="font-size:10px;color:var(--text-muted)">Fit</div></div>
      <div style="text-align:center;background:var(--bg-elevated);border-radius:8px;padding:10px"><div style="font-size:22px;font-weight:900;color:#a78bfa">${p.timingScore}</div><div style="font-size:10px;color:var(--text-muted)">Timing</div></div>
      <div style="text-align:center;background:var(--bg-elevated);border-radius:8px;padding:10px"><div style="font-size:22px;font-weight:900;color:#34d399">${p.priorityScore}</div><div style="font-size:10px;color:var(--text-muted)">Priority</div></div>
    </div>
  </div>
  <div class="drawer-section">
    <div class="drawer-section-title">Why This Lead Fits</div>
    <div>${p.reasonCodes.map(r=>`<span class="reason-tag">${r}</span>`).join('')}</div>
  </div>
  <div class="drawer-section" style="padding-bottom:0">
    <div class="drawer-section-title">Enterprise Intelligence
      <span style="font-size:9px;font-weight:600;letter-spacing:0.07em;padding:2px 7px;border-radius:8px;background:rgba(96,165,250,0.12);color:var(--blue);margin-left:6px;text-transform:uppercase">NEW</span>
    </div>
    ${buildEnrichmentPanel(p.id)}
  </div>
  <div class="drawer-section">
    <div class="drawer-section-title">Signals & Context</div>
    ${Object.entries(p.signals).map(([k,v])=>`<div class="signal-row"><span class="signal-label">${k.replace(/([A-Z])/g,' $1').trim()}</span><span class="signal-value">${v}</span></div>`).join('')}
  </div>
  <div class="drawer-section">
    <div class="drawer-section-title">Suggested Outreach</div>
    <div class="msg-draft" onclick="setOutreachProspect('${p.id}');navigate('outreach-studio');closeDrawer()">${p.emailDraft.split('\n').slice(0,4).join('\n')}…
      <div style="margin-top:6px;font-size:10px;color:var(--blue)">Click to edit in Outreach Studio →</div>
    </div>
  </div>
  <div class="drawer-section">
    <div class="drawer-section-title">Activity History</div>
    ${p.activityLog.map(a=>`<div style="display:flex;gap:8px;margin-bottom:8px">
      <div style="width:6px;height:6px;border-radius:50%;background:var(--blue);margin-top:5px;flex-shrink:0"></div>
      <div><div style="font-size:12px;font-weight:600;color:var(--text-primary)">${a.type}</div>
      <div style="font-size:11px;color:var(--text-muted)">${a.date} — ${a.note}</div></div>
    </div>`).join('')}
  </div>
  <div class="drawer-section">
    <div class="drawer-section-title">Pilot Feedback</div>
    ${getFeedbackHTML(p.id)}
  </div>
  <div style="padding:16px;display:flex;flex-direction:column;gap:8px">
    <button class="btn btn-primary" style="width:100%" onclick="setOutreachProspect('${p.id}');navigate('outreach-studio');closeDrawer()">Draft Outreach</button>
    <div style="display:flex;gap:8px">
      <button class="btn btn-secondary" style="flex:1" onclick="showStatusModal('${p.id}')">Update Status</button>
      <button class="btn btn-ghost" style="flex:1" onclick="setActiveMeeting('${p.id}');closeDrawer()">Meeting Prep</button>
    </div>
  </div>`;
  document.getElementById('prospect-drawer').classList.add('open');
  document.getElementById('drawer-overlay').classList.add('open');
}

function closeDrawer() {
  document.getElementById('prospect-drawer').classList.remove('open');
  document.getElementById('drawer-overlay').classList.remove('open');
}

// ===== ENTERPRISE INTELLIGENCE PANEL =====
function buildEnrichmentPanel(prospectId) {
  const e    = getEnrichment(prospectId);
  const sigs = getEnrichmentSignals(e);

  if (!e) {
    return `
    <div class="enrich-panel enrich-pending">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:22px">🔬</span>
        <div>
          <div style="font-size:12px;font-weight:700;color:var(--text-primary)">No enrichment data yet</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Import enrichment CSV or connect Windfall · Crunchbase · ContactOut</div>
        </div>
      </div>
      <button class="btn btn-secondary" style="width:100%;font-size:11.5px;margin-top:12px" onclick="triggerEnrichmentImport()">⬆ Import Enrichment CSV</button>
    </div>`;
  }

  const lb = e.liquidityEventType ? getLiquidityBadge(e.liquidityEventType) : null;

  return `
  <div class="enrich-panel">
    <div class="enrich-panel-head">
      <div style="display:flex;align-items:center;gap:7px">
        <span style="font-size:14px">🔬</span>
        <span style="font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:var(--text-muted)">Enterprise Intelligence</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <div class="esig-row">
          <span class="esig-dot ${sigs.wealth    ? 'esig-wealth'    : 'esig-empty'}" title="Wealth Score"></span>
          <span class="esig-dot ${sigs.liquidity ? 'esig-liquidity' : 'esig-empty'}" title="Liquidity Event"></span>
          <span class="esig-dot ${sigs.contact   ? 'esig-contact'   : 'esig-empty'}" title="Personal Contact"></span>
          <span class="esig-dot ${sigs.court     ? 'esig-court'     : 'esig-empty'}" title="Court Signal"></span>
        </div>
        <span style="font-size:10px;font-weight:700;color:${sigs.count>=3?'var(--emerald)':sigs.count>=1?'var(--amber)':'var(--text-muted)'}"
          >${sigs.count}/4</span>
      </div>
    </div>

    ${e.wealthScore ? `
    <div class="enrich-row">
      <span class="enrich-label">💰 Wealth Score</span>
      <div style="display:flex;align-items:center;gap:8px;flex:1;justify-content:flex-end">
        <div class="enrich-score-track"><div class="enrich-score-fill" style="width:${e.wealthScore}%"></div></div>
        <span class="enrich-value">${e.wealthScore}<span style="font-size:9px;color:var(--text-muted)">/100</span></span>
      </div>
    </div>` : ''}

    ${e.estimatedNetWorth ? `
    <div class="enrich-row">
      <span class="enrich-label">💎 Est. Net Worth</span>
      <span class="enrich-value enrich-highlight">${e.estimatedNetWorth}</span>
    </div>` : ''}

    ${e.liquidityEvent ? `
    <div class="enrich-row enrich-row-block">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
        <span class="enrich-label">⚡ Liquidity Event</span>
        ${lb ? `<span class="enrich-badge" style="background:${lb.color}22;color:${lb.color};border:1px solid ${lb.color}44">${lb.label} ${e.liquidityEventDate ? '· '+e.liquidityEventDate : ''}</span>` : ''}
      </div>
      <div style="font-size:11px;color:var(--text-secondary);line-height:1.5">${e.liquidityEvent}</div>
    </div>` : ''}

    ${(e.personalEmail || e.personalPhone) ? `
    <div class="enrich-row enrich-row-block">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
        <span class="enrich-label">📧 Personal Contact</span>
        ${e.contactConfidence ? `<span class="enrich-badge enrich-conf-${e.contactConfidence}">${e.contactConfidence} confidence</span>` : ''}
      </div>
      ${e.personalEmail ? `<div style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--text-secondary)">${e.personalEmail}</div>` : ''}
      ${e.personalPhone ? `<div style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--text-secondary);margin-top:2px">${e.personalPhone}</div>` : ''}
    </div>` : `
    <div class="enrich-row" style="opacity:0.5">
      <span class="enrich-label">📧 Personal Contact</span>
      <span style="font-size:10px;color:var(--text-muted)">ContactOut pending</span>
    </div>`}

    ${e.courtSignal ? `
    <div class="enrich-row enrich-row-block" style="border-left:2px solid var(--rose);padding-left:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
        <span class="enrich-label">⚖️ Court Signal</span>
        <span class="enrich-badge" style="background:rgba(251,113,133,0.12);color:var(--rose);border:1px solid rgba(251,113,133,0.3)">${e.courtSignalType === 'probate' ? 'Probate' : 'Divorce QDRO'}</span>
      </div>
      <div style="font-size:11px;color:var(--text-secondary)">${e.courtSignal}</div>
      ${e.courtSignalDate ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px">${e.courtSignalDate}</div>` : ''}
    </div>` : ''}

    <div class="enrich-footer">
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        ${(e.enrichmentSources || []).map(s => `<span class="enrich-source-tag">${s}</span>`).join('')}
      </div>
      <span style="font-size:10px;color:var(--text-muted)">Enriched ${e.enrichedAt || ''}</span>
    </div>
  </div>`;
}

// ===== ENRICHMENT CSV IMPORT =====
function triggerEnrichmentImport() {
  let el = document.getElementById('enrichment-file-input');
  if (!el) {
    el = document.createElement('input');
    el.type = 'file'; el.id = 'enrichment-file-input';
    el.accept = '.csv'; el.style.display = 'none';
    el.onchange = () => handleEnrichmentCSV(el);
    document.body.appendChild(el);
  }
  el.click();
}

function handleEnrichmentCSV(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    const lines = evt.target.result.trim().split('\n');
    if (lines.length < 2) { showToast('No valid rows in enrichment CSV','⚠️'); return; }
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g,''));
    let matched = 0;
    lines.slice(1).forEach(line => {
      const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g,''));
      const row  = {};
      headers.forEach((h,i) => { row[h] = vals[i] || ''; });
      const p = PROSPECTS.find(x =>
        x.firstName.toLowerCase() === (row.firstname||row.first||'').toLowerCase() &&
        x.lastName.toLowerCase()  === (row.lastname ||row.last ||'').toLowerCase()
      );
      if (p) {
        saveEnrichment(p.id, {
          wealthScore:        parseInt(row.wealthscore)    || null,
          estimatedNetWorth:  row.networth                 || null,
          liquidityEvent:     row.liquidityevent           || null,
          liquidityEventType: row.liquiditytype            || null,
          liquidityEventDate: row.liquiditydate            || null,
          personalEmail:      row.personalemail            || null,
          personalPhone:      row.personalphone            || null,
          contactConfidence:  row.contactconfidence        || null,
          courtSignal:        row.courtsignal              || null,
          courtSignalType:    row.courttype                || null,
          courtSignalDate:    row.courtdate                || null,
          enrichmentSources:  row.sources ? row.sources.split(';') : ['csv_import'],
        });
        matched++;
      }
    });
    showToast(`🔬 ${matched} prospects enriched from CSV`, '✅');
    navigate(currentPage);
  };
  reader.readAsText(file);
  input.value = '';
}

// ===== UTILITIES =====
function switchTab(btn, groupId) {
  const g = document.getElementById(groupId);
  if (g) g.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}

function showToast(msg, icon='💎') {
  const container = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span class="toast-icon">${icon}</span><span>${msg}</span>`;
  container.appendChild(t);
  setTimeout(()=>{ t.style.opacity='0'; t.style.transform='translateX(100%)'; t.style.transition='all 0.3s ease'; setTimeout(()=>t.remove(),320); },3000);
}

function bindPageEvents() {
  // ← Phase 1.2: remove old listener before adding new one to prevent double-bind
  const overlay = document.getElementById('drawer-overlay');
  if (_boundOverlay) overlay.removeEventListener('click', _boundOverlay);
  _boundOverlay = closeDrawer;
  overlay.addEventListener('click', _boundOverlay);
}

// ===== NAV BINDINGS =====
// NOTE: Nav bindings are now handled in auth.js DOMContentLoaded
// to prevent nav from firing before auth state resolves.
// The lines below are kept for manual re-bind if needed.

// ===== INIT =====
// syncThemeButton() and navigate() are now called by auth.js
// inside onAuthStateChanged() after confirming a valid user session.
// This prevents the app from rendering any cockpit data for unauthenticated visitors.

// ===== MOBILE NAV =====
function toggleMobileNav() {
  const drawer = document.getElementById('pub-mobile-drawer');
  const btn    = document.getElementById('pub-hamburger');
  if (!drawer || !btn) return;
  const isOpen = drawer.classList.contains('is-open');
  if (isOpen) {
    drawer.classList.remove('is-open');
    btn.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
  } else {
    drawer.classList.add('is-open');
    btn.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
  }
}

function closeMobileNav() {
  const drawer = document.getElementById('pub-mobile-drawer');
  const btn    = document.getElementById('pub-hamburger');
  if (drawer) drawer.classList.remove('is-open');
  if (btn)    { btn.classList.remove('is-open'); btn.setAttribute('aria-expanded','false'); }
}

// ===== BOOK DEMO EMAIL =====
// TODO: Set up hello@theaumengine.com forwarding → kosal@fin-tegration.com (confirmed interim inbox)
function openDemoEmail() {
  const to      = 'kosal@fin-tegration.com';
  const subject = encodeURIComponent("I'd like to discuss The AUM Engine");
  const body    = encodeURIComponent(
    "Hi,\n\n" +
    "I'm a Financial Advisor and I'd like to learn more about the AUM Engine pilot program and schedule a 20-minute walkthrough.\n\n" +
    "Name: \n" +
    "Firm: \n" +
    "Approximate AUM: $\n" +
    "Primary Niche: \n" +
    "Best time to connect: \n\n" +
    "Looking forward to the conversation!"
  );
  window.open(`mailto:${to}?subject=${subject}&body=${body}`, '_self');
}
