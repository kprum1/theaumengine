// ==========================================
// THE AUM ENGINE — FIRESTORE DATA LAYER
// js/db.js — Phase 2.0 (Per-User Persistence)
// Sprint 4: al_assignments → lead_assignments unified
// v=20260412c
// ==========================================
// Depends on: firebase-firestore-compat.js loaded in index.html BEFORE this file
// All functions are async. Firestore is keyed by Firebase Auth UID.
// Pattern: dual-write to BOTH Firestore (primary) + localStorage (offline fallback)
// ==========================================

let _db = null;

function _getDB() {
  if (!_db) {
    try { _db = firebase.firestore(); } catch(e) { console.warn('[db.js] Firestore not available:', e); }
  }
  return _db;
}

// Firestore path helpers
const _userDoc  = (uid, docName) => _getDB()?.collection('users').doc(uid).collection('data').doc(docName);

// ── Niche Profile ──────────────────────────────────────────────────────────
async function saveNicheProfileToFirestore(uid, profile) {
  if (!uid || !profile) return;
  try {
    await _userDoc(uid, 'nicheProfile').set({ ...profile, updatedAt: new Date().toISOString() });
  } catch(e) { console.warn('[db.js] saveNicheProfile failed:', e); }
}

async function loadNicheProfileFromFirestore(uid) {
  if (!uid) return null;
  try {
    const snap = await _userDoc(uid, 'nicheProfile').get();
    return snap.exists ? snap.data() : null;
  } catch(e) { console.warn('[db.js] loadNicheProfile failed:', e); return null; }
}

// ── Niche Answers (in-progress cache) ────────────────────────────────────
async function saveNicheAnswersToFirestore(uid, answers) {
  if (!uid || !answers) return;
  try {
    await _userDoc(uid, 'nicheAnswers').set({ answers, updatedAt: new Date().toISOString() });
  } catch(e) { console.warn('[db.js] saveNicheAnswers failed:', e); }
}

async function loadNicheAnswersFromFirestore(uid) {
  if (!uid) return {};
  try {
    const snap = await _userDoc(uid, 'nicheAnswers').get();
    return snap.exists ? (snap.data().answers || {}) : {};
  } catch(e) { console.warn('[db.js] loadNicheAnswers failed:', e); return {}; }
}

// ── ICP Config ────────────────────────────────────────────────────────────
async function saveICPConfigToFirestore(uid, cfg) {
  if (!uid || !cfg) return;
  try {
    await _userDoc(uid, 'icpConfig').set({ ...cfg, updatedAt: new Date().toISOString() });
  } catch(e) { console.warn('[db.js] saveICPConfig failed:', e); }
}

async function loadICPConfigFromFirestore(uid) {
  if (!uid) return null;
  try {
    const snap = await _userDoc(uid, 'icpConfig').get();
    return snap.exists ? snap.data() : null;
  } catch(e) { console.warn('[db.js] loadICPConfig failed:', e); return null; }
}

// ── Advisor Routing Profile (Phase B) ────────────────────────────────────
// Stores: advisorType, licensedStates[], serviceCapabilities[], targetAUMBands[],
//         activeLeadCap, calendarCapacity, firmName, officeLocations[]
async function saveAdvisorProfileToFirestore(uid, profile) {
  if (!uid || !profile) return;
  try {
    await _userDoc(uid, 'advisorProfile').set({ ...profile, updatedAt: new Date().toISOString() });
  } catch(e) { console.warn('[db.js] saveAdvisorProfile failed:', e); }
}

async function loadAdvisorProfileFromFirestore(uid) {
  if (!uid) return null;
  try {
    const snap = await _userDoc(uid, 'advisorProfile').get();
    return snap.exists ? snap.data() : null;
  } catch(e) { console.warn('[db.js] loadAdvisorProfile failed:', e); return null; }
}

// ── Clear All Niche Data (for Retake / Reset) ─────────────────────────────
async function clearNicheDataFromFirestore(uid) {
  if (!uid) return;
  try {
    const batch = _getDB().batch();
    batch.delete(_userDoc(uid, 'nicheProfile'));
    batch.delete(_userDoc(uid, 'nicheAnswers'));
    await batch.commit();
  } catch(e) { console.warn('[db.js] clearNicheData failed:', e); }
}

// ── Sync Niche Discovery → Routing Engine (called after wizard "Apply" click) ───
// Updates advisor_pool/{uid} with the wizard-discovered nicheIds so
// processRoutingQueue routes the right leads going forward.
async function syncNicheToAdvisorPool(uid, nicheIds, nicheProfile) {
  if (!uid || !nicheIds?.length) return;
  try {
    await _getDB().collection('advisor_pool').doc(uid).set({
      nicheIds,
      topNiche:           nicheProfile?.top3?.[0]?.name || '',
      nicheScore:         nicheProfile?.top3?.[0]?.score || 0,
      nicheDiscoveredAt:  new Date().toISOString(),
      nicheSource:        'wizard',
      eligibleForRouting: true,
      updatedAt:          new Date().toISOString(),
    }, { merge: true });  // merge: keep firmName, geography, leadCap, etc.
    console.info('[db.js] advisor_pool niche synced:', uid, nicheIds);
  } catch(e) { console.warn('[db.js] syncNicheToAdvisorPool failed:', e); }
}

// Reads from the global lead_assignments collection (Layer 1) filtered to
// this advisor's UID, then fetches master_lead data via the getLeadsByIds
// Cloud Function (C41 gateway — enforces per-doc assignment ownership).
// Direct master_leads reads are no longer permitted by Firestore rules.

async function loadAssignedLeadsFromFirestore(uid) {
  if (!uid) return [];
  try {
    const db   = _getDB();
    if (!db) return [];

    // Step 1: Pull all active assignments for this advisor
    const snap = await db.collection('lead_assignments')
      .where('ownerUid', '==', uid)
      .where('ownershipStatus', 'in', ['active', 'pending'])
      .limit(1000)
      .get();

    if (snap.empty) return [];

    // Build a map: masterLeadId → assignment doc data
    const assignmentMap = {};
    snap.docs.forEach(aDoc => {
      const a = aDoc.data();
      if (a.masterLeadId) {
        assignmentMap[a.masterLeadId] = { assignmentId: aDoc.id, ...a };
      }
    });

    const masterLeadIds = Object.keys(assignmentMap);
    if (!masterLeadIds.length) return [];

    // Step 2: Fetch master_leads via CF gateway (getLeadsByIds).
    // On CF failure (AppCheck, timeout, network), we continue with masterLeadsById={}
    // and let the assignment doc fallback (Step 3) populate all leads from 'a' directly.
    // route_production_to_master.js writes all fields to lead_assignments, so this is safe.
    let masterLeadsById = {};
    try {
      const fn = firebase.functions().httpsCallable('getLeadsByIds');
      const result = await fn({ ids: masterLeadIds });
      const leads = result.data?.leads || [];
      leads.forEach(lead => {
        if (lead.id) masterLeadsById[lead.id] = lead;
      });
    } catch (cfErr) {
      // DO NOT return [] — continue with empty masterLeadsById so Step 3 can use 'a' as fallback.
      // This ensures NPI-routed leads always load even when the CF gateway is unavailable.
      console.warn('[db.js] getLeadsByIds CF unavailable — loading from assignment docs directly:', cfErr.message);
    }

    // Step 3: Map assignment + master_lead → PROSPECTS schema
    const results = snap.docs.map(aDoc => {
      const a    = aDoc.data();
      // Use master_lead from CF when available; fall back to the assignment doc itself.
      // route_production_to_master.js writes ALL lead fields to lead_assignments,
      // so 'a' is a complete fallback when the CF's 200-doc cap excludes this ID.
      const lead = masterLeadsById[a.masterLeadId] || a;

      // For person-level leads (physicians, dentists, etc.): use firstName + lastName
      // For org-level leads (SBA business, HUD project, law firm): use company as display name
      const personFirst = (a.firstName || lead.firstName || '').trim();
      const personLast  = (a.lastName  || lead.lastName  || '').trim();
      const personName  = (a.fullName  || lead.fullName  || (personFirst + ' ' + personLast).trim());
      const orgName     = (lead.company   || lead.firmName || '').trim();
      const isOrgLead   = !personFirst && !personName && !!orgName;

      const displayName = personName || orgName || 'Unknown Lead';
      const first = isOrgLead ? orgName  : (personFirst || displayName.split(' ')[0] || 'Unknown');
      const last  = isOrgLead ? ''       : (personLast  || displayName.split(' ').slice(1).join(' ') || '');

      const mapped = {
        // Identity
        id:            'fs_' + aDoc.id,     // prefix avoids collision with demo p1..p25
        assignmentId:  aDoc.id,             // Firestore doc ID for write-back
        masterLeadId:  a.masterLeadId,

        // Name fields pages.js expects
        firstName:     first,
        lastName:      last,
        name:          displayName,

        // Role / company — assignment doc has these when it was written by routing script
        title:         a.title    || lead.title    || lead.jobTitle    || (isOrgLead ? lead.firmTierLabel || '' : ''),
        company:       a.company  || lead.company  || lead.firmName    || lead.employer || '',
        city:          a.city     || lead.city     || '',
        state:         a.state    || lead.state    || '',
        zip:           a.zip      || lead.zip      || '',
        location:      [a.city || lead.city, a.state || lead.state].filter(Boolean).join(', '),

        // Scores — check integer fitScore from our routing script first (0-100 scale),
        // then fall back to finalScore (0.0-1.0 float from old routing engine × 100)
        fitScore:      a.fitScore      || Math.round((a.finalScore   || 0) * 100) || 72,
        timingScore:   a.timingScore   || Math.round((a.timingScore  || 0) * 100) || 65,
        priorityScore: a.priorityScore || a.fitScore || Math.round((a.finalScore || 0) * 100) || 70,

        // Classification — prefer assignment doc (always written by routing script)
        niche:         a.niche    || lead.niche    || 'Assigned Lead',
        nicheId:       a.nicheId  || lead.nicheId  || 'n0',
        assets:        a.assets   || lead.estimatedAUM || lead.assets || '$1M+',

        // Pipeline state
        status:        a.advisorStatus       || 'New',
        assignedRep:   'You',
        lastActivity:  a.assignedAt
                         ? new Date(a.assignedAt).toLocaleDateString('en-US',{month:'short',day:'numeric'})
                         : 'Today',

        // Source badge
        source:        a.source || lead.source || 'AUM Engine',
        tags:          ['🔵 Assigned'],    // visual indicator it's a live lead

        // Contact info — assignment doc always has these fields (written by route_production_to_master.js)
        // Fallback chain: assignment doc → master_lead root → enrichment aliases → blank
        email:         a.email         || lead.email         || lead.personalEmail || '',
        phone:         a.phone         || lead.phone         || lead.personalPhone || '',
        linkedInUrl:   a.linkedInUrl   || lead.linkedInUrl   || lead.linkedin_url  || lead.linkedin || '',

        // NPI / professional identity — always on assignment doc for NPI-sourced leads
        npiNumber:     a.npiNumber     || lead.npiNumber     || '',
        credential:    a.credential    || lead.credential    || '',
        specialty:     a.specialty     || lead.specialty     || '',

        // Homestead / property — always on assignment doc for homestead-sourced leads
        propertyAddress: a.propertyAddress || lead.propertyAddress || '',
        homeValue:     a.homeValue     || lead.homeValue     || 0,

        // Signals passthrough
        signals:       lead.signals    || a.signals          || [],

        // Metadata for write-back
        _fromFirestore: true,
      };

      // Seed ENRICHMENT_STORE from Firestore enrichment sub-object so getEnrichment()
      // returns live data for the Enterprise Intelligence panel without a CSV import.
      const enrData = lead.enrichment || {};
      if (Object.keys(enrData).length && typeof ENRICHMENT_STORE !== 'undefined') {
        const key = mapped.id;   // 'fs_' + aDoc.id — matches what getEnrichment() is called with
        if (!ENRICHMENT_STORE[key]) {
          ENRICHMENT_STORE[key] = {
            wealthScore:        enrData.wealthScore        || null,
            estimatedNetWorth:  enrData.estimatedNetWorth  || null,
            liquidityEvent:     enrData.liquidityEvent     || null,
            liquidityEventType: enrData.liquidityEventType || null,
            liquidityEventDate: enrData.liquidityEventDate || null,
            personalEmail:      mapped.email               || enrData.personalEmail || null,
            personalPhone:      mapped.phone               || enrData.personalPhone || null,
            contactConfidence:  enrData.contactConfidence  || null,
            courtSignal:        enrData.courtSignal        || null,
            courtSignalType:    enrData.courtSignalType    || null,
            courtSignalDate:    enrData.courtSignalDate    || null,
            enrichedAt:         enrData.enrichedAt         || '',
            enrichmentSources:  enrData.enrichmentSources  || [],
          };
        }
      }

      return mapped;
    });  // end snap.docs.map()

    return results.filter(Boolean);

  } catch(e) {
    console.warn('[db.js] loadAssignedLeads failed:', e);
    return [];
  }
}


// Write lead status change back to Firestore — lead_assignments (Layer 1 / legacy)
async function updateLeadStatusInFirestore(assignmentId, newStatus) {
  if (!assignmentId) return;
  try {
    await _getDB().collection('lead_assignments').doc(assignmentId).update({
      advisorStatus: newStatus,
      updatedAt:     new Date().toISOString(),
    });
  } catch(e) { console.warn('[db.js] updateLeadStatus failed:', e); }
}

// Write lead status change back to Firestore — al_assignments leads (Sprint 4: now uses lead_assignments)
// Keeps function name for backward compatibility with app.js call sites.
async function updateAlAssignmentStatus(assignmentId, newStatus) {
  if (!assignmentId) return;
  try {
    await _getDB().collection('lead_assignments').doc(assignmentId).update({
      advisorStatus: newStatus,
      status:        newStatus,
      outcome:       newStatus,
      outcomeAt:     new Date().toISOString(),
      updatedAt:     new Date().toISOString(),
    });
    console.info('[db.js] lead_assignments status updated:', assignmentId, '→', newStatus);
  } catch(e) { console.warn('[db.js] updateAlAssignmentStatus failed:', e); }
}

// Write reply outcome back to lead_assignments (Sprint 4: unified from al_assignments)
// Called from _tapReplyOutcome() in outreach_controller.js for routing-engine leads.
// replyType: 'reply' | 'positive' | 'meeting' | 'dead' | 'objection' | 'not_now' | 'unsubscribe'
async function updateAlAssignmentReply(assignmentId, replyType) {
  if (!assignmentId || !replyType) return;
  try {
    await _getDB().collection('lead_assignments').doc(assignmentId).update({
      replyType,
      replyOutcome:  replyType,
      repliedAt:     new Date().toISOString(),
      updatedAt:     new Date().toISOString(),
    });
    console.info('[db.js] lead_assignments reply written:', assignmentId, '→', replyType);
  } catch(e) { console.warn('[db.js] updateAlAssignmentReply failed:', e); }
}

// Write advisor thumbs up/down feedback back to Firestore
async function updateLeadFeedbackInFirestore(assignmentId, vote, notes) {
  if (!assignmentId) return;
  try {
    await _getDB().collection('lead_assignments').doc(assignmentId).update({
      advisorFeedback:      vote,
      advisorFeedbackNotes: notes || '',
      feedbackAt:           new Date().toISOString(),
    });
  } catch(e) { console.warn('[db.js] updateLeadFeedback failed:', e); }
}

// ── Fast lead count — sets window._firestoreLeadTotal for computeMetrics() ──
// Reads meta/pipeline_stats (written by scripts/write_pipeline_meta.js).
// One Firestore read — no aggregation API required (compat SDK compatible).
// Operator (kosal@fin-tegration.com) gets totalLeads (global across all advisors).
// Regular advisors get their per-UID count from leadsByAdvisor map.
const _OPERATOR_EMAIL = 'kosal@fin-tegration.com';

async function fetchAdvisorLeadCount(uid) {
  if (!uid) return 0;
  try {
    const db = _getDB();
    if (!db) return 0;

    const metaSnap = await db.collection('meta').doc('pipeline_stats').get();
    if (!metaSnap.exists) {
      console.warn('[db.js] meta/pipeline_stats not found — using PROSPECTS.length fallback');
      return 0;
    }
    const meta = metaSnap.data();
    const isOp = window._currentUser && window._currentUser.email === _OPERATOR_EMAIL;

    const count = isOp
      ? (meta.totalMasterLeads || meta.totalLeads || 0)  // operator → unique prospects (master_leads)
      : (meta.leadsByAdvisor?.[uid] || 0);               // advisor  → their own assignments

    window._firestoreLeadTotal     = count;
    // Cache per-niche breakdown for Recent Cohorts in Prospect Mine
    window._firestoreNicheBreakdown = meta.nicheBreakdown || null;
    window._firestoreMetaUpdatedAt  = meta.updatedAt || null;

    console.info(`[db.js] Lead count (${isOp ? 'GLOBAL/operator' : uid.slice(0,8)}): ${count}`);
    return count;
  } catch(e) {
    console.warn('[db.js] fetchAdvisorLeadCount failed:', e.message);
    return 0;
  }
}

// ── Bootstrap: Load All User Data on Login ────────────────────────────────
// Called from auth.js onAuthStateChanged when user is authenticated.
// Returns { nicheProfile, nicheAnswers, icpConfig, advisorProfile, assignedLeads }
async function bootstrapUserData(uid) {
  if (!uid) return { nicheProfile: null, nicheAnswers: {}, icpConfig: null, advisorProfile: null, assignedLeads: [] };
  try {
    const [profileSnap, answersSnap, icpSnap, apSnap, assignedLeads, _count] = await Promise.all([
      _userDoc(uid, 'nicheProfile').get(),
      _userDoc(uid, 'nicheAnswers').get(),
      _userDoc(uid, 'icpConfig').get(),
      _userDoc(uid, 'advisorProfile').get(),
      loadAssignedLeadsFromFirestore(uid),   // ← Phase B: live leads
      fetchAdvisorLeadCount(uid),           // ← await count so KPI is correct on first render
    ]);
    return {
      nicheProfile:   profileSnap.exists  ? profileSnap.data()              : null,
      nicheAnswers:   answersSnap.exists  ? (answersSnap.data().answers||{}) : {},
      icpConfig:      icpSnap.exists      ? icpSnap.data()                   : null,
      advisorProfile: apSnap.exists       ? apSnap.data()                    : null,
      assignedLeads,                         // array of PROSPECTS-schema objects
    };
  } catch(e) {
    console.warn('[db.js] bootstrapUserData failed — using localStorage fallback:', e);
    return { nicheProfile: null, nicheAnswers: {}, icpConfig: null, advisorProfile: null, assignedLeads: [] };
  }
}



// ── Outreach Outcome Logging (Phase C1 — Measurement) ────────────────────────
// Writes one outcome event to outreach_outcomes/{auto-id}
// Schema mirrors osLogOutcome() in outreach_controller.js
async function saveOutcomeToFirestore(uid, outcome) {
  if (!uid || !outcome) return null;
  try {
    const db = _getDB();
    if (!db) throw new Error('Firestore not available');
    const docRef = await db.collection('outreach_outcomes').add({
      advisorUid:       uid,
      prospectId:       outcome.prospectId       || null,
      nicheId:          outcome.nicheId          || null,
      channel:          outcome.channel          || null,
      stage:            outcome.stage            || null,
      angle:            outcome.angle            || null,
      variantChosen:    outcome.variantChosen    || null,
      editedBeforeSend: outcome.editedBeforeSend || false,
      sent:             outcome.sent             || false,
      outcome:          outcome.outcome          || null,
      replyType:        null,                    // set later via osLogReply() — Reply Tapper
      replyClassification: null,
      timestamp:        outcome.timestamp        || new Date().toISOString(),
      createdAt:        new Date().toISOString(),
    });
    console.info('[db.js] outreach outcome saved to Firestore — id:', docRef.id);
    return docRef.id;   // ← returned so caller can enable reply write-backs
  } catch(e) {
    console.warn('[db.js] saveOutcomeToFirestore failed (falling back to localStorage):', e);
    throw e;
  }
}

// Reads the advisor's own outcome log for the measurement dashboard
async function loadOutcomesFromFirestore(uid, limitN) {
  if (!uid) return [];
  try {
    const db = _getDB();
    if (!db) return [];
    let q = db.collection('outreach_outcomes')
               .where('advisorUid', '==', uid)
               .orderBy('createdAt', 'desc');
    if (limitN) q = q.limit(limitN);
    const snap = await q.get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) {
    console.warn('[db.js] loadOutcomesFromFirestore failed:', e);
    return [];
  }
}

// ── Booking Link — advisor_settings/{uid} ────────────────────────────────
// Persists the advisor's Calendly / booking URL to Firestore for cross-device sync.
// Mirrors the localStorage key 'aum_booking_link' as the offline fallback.
async function saveBookingLink(uid, url) {
  if (!uid || !url) return;
  try {
    await _getDB().collection('advisor_settings').doc(uid).set({
      bookingLink: url,
      bookingLinkUpdatedAt: new Date().toISOString(),
    }, { merge: true });
    console.info('[db.js] bookingLink saved to Firestore for uid:', uid);
  } catch(e) { console.warn('[db.js] saveBookingLink failed:', e); }
}

async function loadBookingLink(uid) {
  if (!uid) return null;
  try {
    const snap = await _getDB().collection('advisor_settings').doc(uid).get();
    return snap.exists ? (snap.data().bookingLink || null) : null;
  } catch(e) { console.warn('[db.js] loadBookingLink failed:', e); return null; }
}

// Reads ALL outcomes across all advisors — operator only
async function loadOperatorOutcomes(limitN) {
  try {
    const db = _getDB();
    if (!db) return [];
    let q = db.collection('outreach_outcomes').orderBy('createdAt', 'desc');
    if (limitN) q = q.limit(limitN);
    const snap = await q.get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) {
    console.warn('[db.js] loadOperatorOutcomes failed:', e);
    return [];
  }
}

// Reads ALL prospects from the top-level 'prospects' collection (Alfred-imported leads)
// This is NOT user-scoped — it's a shared operator-managed pool
async function loadProspectsFromFirestore() {
  try {
    const db = _getDB();
    if (!db) return [];
    const snap = await db.collection('prospects').orderBy('priorityScore', 'desc').limit(500).get();
    return snap.docs.map(d => ({ id: d.id, _fromFirestore: true, ...d.data() }));
  } catch(e) {
    console.warn('[db.js] loadProspectsFromFirestore failed:', e);
    return [];
  }
}

// ================================================================
// CLIENT INTELLIGENCE — ED / Al Functions
// Merged from EdAlTim — 2026-04-08 per Vera compliance plan
//
// COMPLIANCE NOTE: All reads are scoped per referringAdvisorUid
// or assignedAdvisorUid. No "read all" allowed. Operator-only
// override via isOperator() in firestore.rules.
// ================================================================

// ── ED CONSENT LOG — immutable audit trail ───────────────────
async function saveConsentToFirestore(consentRecord) {
  try {
    const db = _getDB();
    if (!db) { console.warn('[db.js] saveConsent skipped — Firestore unavailable'); return null; }
    const docId = consentRecord.situationId || `consent_${Date.now()}`;
    await db.collection('ed_consent_log').doc(docId).set({
      situationId:         consentRecord.situationId         || docId,
      consentTimestamp:    consentRecord.consentTimestamp     || new Date().toISOString(),
      disclosureVersion:   consentRecord.disclosureVersion    || 'v1.0',
      referringAdvisorUid: consentRecord.referringAdvisorUid || null,
      intakeMode:          consentRecord.intakeMode           || 'lite',
      consentGiven:        true,
      userAgent:           consentRecord.userAgent            || (navigator?.userAgent || ''),
      savedAt:             firebase.firestore.FieldValue.serverTimestamp(),
    });
    console.info('[db.js] Consent recorded — id:', docId);
    return docId;
  } catch(e) { console.warn('[db.js] saveConsent failed:', e); return null; }
}

// ── ED SITUATIONS — client intake profiles ───────────────────
// Dual-query: Firestore doesn't support OR across different fields,
// so we query by referringAdvisorUid AND assignedAdvisorUid separately,
// then merge and deduplicate by doc ID. This handles Phase 1 (both same UID)
// and future multi-advisor routing (different UIDs).
async function loadEdSituationsForAdvisor(uid) {
  if (!uid) return [];
  try {
    const db = _getDB();
    if (!db) return [];

    const [referringSnap, assignedSnap] = await Promise.all([
      db.collection('ed_situations')
        .where('referringAdvisorUid', '==', uid)
        .orderBy('savedAt', 'desc')
        .limit(50)
        .get(),
      db.collection('ed_situations')
        .where('assignedAdvisorUid', '==', uid)
        .orderBy('savedAt', 'desc')
        .limit(50)
        .get(),
    ]);

    // Merge and deduplicate by Firestore doc ID
    const seen = new Set();
    const results = [];
    for (const snap of [referringSnap, assignedSnap]) {
      for (const d of snap.docs) {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          results.push({ _firestoreId: d.id, ...d.data() });
        }
      }
    }
    // Sort by savedAt descending (best effort — already ordered per query)
    results.sort((a, b) => {
      const aTime = a.savedAt?.toMillis ? a.savedAt.toMillis() : (a.savedAt ? new Date(a.savedAt).getTime() : 0);
      const bTime = b.savedAt?.toMillis ? b.savedAt.toMillis() : (b.savedAt ? new Date(b.savedAt).getTime() : 0);
      return bTime - aTime;
    });
    return results.slice(0, 50);

  } catch(e) { console.warn('[db.js] loadEdSituations failed:', e); return []; }
}

async function saveEdSituationToFirestore(profile) {
  if (!profile?.id) return null;
  try {
    const db = _getDB();
    if (!db) throw new Error('Firestore unavailable');
    await db.collection('ed_situations').doc(profile.id).set({
      ...profile,
      savedAt: firebase.firestore.FieldValue.serverTimestamp(),
      status: profile.status || 'new',
    }, { merge: true });
    return profile.id;
  } catch(e) { console.warn('[db.js] saveEdSituation failed:', e); return null; }
}

async function updateEdSituationStatus(situationId, status, advisorUid) {
  if (!situationId) return;
  try {
    const db = _getDB();
    if (!db) return;
    await db.collection('ed_situations').doc(situationId).update({
      status,
      assignedAdvisorUid: advisorUid || null,
      statusUpdatedAt: new Date().toISOString(),
    });
  } catch(e) { console.warn('[db.js] updateEdSituationStatus failed:', e); }
}

// ── AL ASSIGNMENTS — Sprint 4: now writes to lead_assignments ─────────────
// Kept for backward compatibility. Any new batch assignments go to lead_assignments.
async function saveAlAssignment(assignment) {
  try {
    const db = _getDB();
    if (!db) return null;
    const docRef = await db.collection('lead_assignments').add({
      ...assignment,
      ownerUid:        assignment.advisorUid || assignment.ownerUid || null,
      ownershipStatus: 'active',
      assignedBy:      'saveAlAssignment_v2',
      createdAt:       firebase.firestore.FieldValue.serverTimestamp(),
      status:          'new',
    });
    return docRef.id;
  } catch(e) { console.warn('[db.js] saveAlAssignment failed:', e); return null; }
}


// Sprint 4: reads from lead_assignments only (canonical collection).
// Covers both CF-routed leads (ownerUid) AND migrated al_assignments docs
// (also use ownerUid after migration). The _fromAlAssignment flag is kept
// for backward compat with app.js / outreach_controller.js write-back routing.
async function loadAlAssignmentsForAdvisor(uid) {
  if (!uid) return [];
  try {
    const db = _getDB();
    if (!db) return [];

    // Query lead_assignments for this advisor — includes migrated al docs
    // (migrated docs have ownerUid set to advisorUid by migration script)
    const snap = await db.collection('lead_assignments')
      .where('ownerUid', '==', uid)
      .orderBy('assignedAt', 'desc')
      .limit(500)   // raised from 100 → supports large pipelines (was truncating at 100)
      .get();

    if (snap.empty) return [];

    return snap.docs.map(d => {
      const a = d.data();
      // Skip docs already loaded by loadAssignedLeadsFromFirestore (ownershipStatus: active/pending)
      // Only surface migrated-from-al docs or batch-sourced docs not in the standard track
      const isMigrated = !!a.migratedFromAlId;
      const isCFRouted = a.assignedBy === 'RoutingOrchestrator_v1';
      // If it's a pure CF-routed lead, loadAssignedLeadsFromFirestore already handles it
      // via the master_leads hydration path. Don't double-count those.
      if (isCFRouted && !isMigrated) return null;

      const firstName = a.firstName || (a.fullName || '').split(' ')[0] || 'Unknown';
      const lastName  = a.lastName  || (a.fullName || '').split(' ').slice(1).join(' ') || '';
      return {
        // PROSPECTS schema
        id:            'al_' + d.id,
        assignmentId:  d.id,
        masterLeadId:  a.masterLeadId || d.id,

        firstName,
        lastName,
        name:          a.fullName || `${firstName} ${lastName}`.trim(),

        title:         a.title    || '',
        company:       a.company  || '',
        location:      [
                          a.city  || a.homeCity  || a.prospect_city  || '',
                          a.state || a.homeState || a.prospect_state || '',
                        ].filter(Boolean).join(', '),

        fitScore:      a.fitScore      || 0,
        timingScore:   a.timingScore   || 0,
        priorityScore: a.priorityScore || Math.round(((a.fitScore||0)+(a.timingScore||0))/2),

        niche:         a.niche   || 'Assigned Lead',
        nicheId:       a.nicheId || 'n0',
        assets:        a.estimatedAUM || '$1M+',

        status:        a.advisorStatus || a.status || 'New',
        assignedRep:   'You',
        lastActivity:  a.assignedAt
                         ? new Date(a.assignedAt).toLocaleDateString('en-US',{month:'short',day:'numeric'})
                         : 'Today',

        source:        a.source  || 'AUM Engine',
        tags:          ['🔵 Assigned'],

        signals:       a.signals    || [],
        enrichment:    a.enrichment || {},

        // Write-back routing — still identifies via lead_assignments now
        _fromFirestore:    true,
        _fromAlAssignment: true,     // preserves app.js write-back routing path
        batchId:           a.batchId || '',
        routingScore:      a.routingScore || 0,
      };
    }).filter(Boolean);
  } catch(e) { console.warn('[db.js] loadAlAssignments failed:', e); return []; }
}

// ── Refresh helper (non-blocking, called from planning_agent.js) ──
window.refreshEdSituations = async function() {
  const uid = typeof currentUID !== 'undefined' ? currentUID : null;
  const situations = await loadEdSituationsForAdvisor(uid);
  window._edSituations = situations;
  return situations;
};
