// ==========================================
// THE AUM ENGINE — FIRESTORE DATA LAYER
// js/db.js — Phase 2.0 (Per-User Persistence)
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
// this advisor's UID, then maps to the PROSPECTS schema the cockpit uses.

async function loadAssignedLeadsFromFirestore(uid) {
  if (!uid) return [];
  try {
    const db   = _getDB();
    if (!db) return [];

    // Pull all active assignments for this advisor
    const snap = await db.collection('lead_assignments')
      .where('ownerUid', '==', uid)
      .where('ownershipStatus', 'in', ['active', 'pending'])
      .get();

    if (snap.empty) return [];

    // For each assignment, pull the master_lead doc to get full data
    const leadFetches = snap.docs.map(async (aDoc) => {
      const a = aDoc.data();
      try {
        const leadSnap = await db.collection('master_leads').doc(a.masterLeadId).get();
        if (!leadSnap.exists) return null;
        const lead = leadSnap.data();

        // Map lead_assignment + master_lead → PROSPECTS schema
        const name   = (lead.fullName || '').trim();
        const parts  = name.split(' ');
        const first  = parts[0] || 'Unknown';
        const last   = parts.slice(1).join(' ') || '';

        return {
          // Identity
          id:            'fs_' + aDoc.id,     // prefix avoids collision with demo p1..p25
          assignmentId:  aDoc.id,             // Firestore doc ID for write-back
          masterLeadId:  a.masterLeadId,

          // Name fields pages.js expects
          firstName:     first,
          lastName:      last,
          name:          name,

          // Role / company
          title:         lead.jobTitle         || lead.title    || '',
          company:       lead.company          || lead.employer || '',
          location:      [lead.city, lead.state].filter(Boolean).join(', '),

          // Scores (from assignment doc if present, else defaults)
          fitScore:      Math.round((a.finalScore   || 0) * 100) || 72,
          timingScore:   Math.round((a.timingScore  || 0) * 100) || 65,
          priorityScore: Math.round((a.finalScore   || 0) * 100) || 70,

          // Classification
          niche:         lead.niche            || 'Assigned Lead',
          nicheId:       lead.nicheId          || 'n0',
          assets:        lead.estimatedAUM     || lead.assets   || '$1M+',

          // Pipeline state
          status:        a.advisorStatus       || 'New',
          assignedRep:   'You',
          lastActivity:  a.assignedAt
                           ? new Date(a.assignedAt).toLocaleDateString('en-US',{month:'short',day:'numeric'})
                           : 'Today',

          // Source badge
          source:        lead.source           || a.source || 'AUM Engine',
          tags:          ['🔵 Assigned'],    // visual indicator it's a live lead

          // Signals passthrough
          signals:       lead.signals          || [],
          enrichment:    lead.enrichment       || {},

          // Metadata for write-back
          _fromFirestore: true,
        };
      } catch (innerErr) {
        console.warn('[db.js] Could not hydrate lead:', a.masterLeadId, innerErr);
        return null;
      }
    });

    const results = await Promise.all(leadFetches);
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

// Write lead status change back to Firestore — al_assignments (routing engine)
// Used for leads assigned by routing_engine.js (pilot advisors)
async function updateAlAssignmentStatus(assignmentId, newStatus) {
  if (!assignmentId) return;
  try {
    await _getDB().collection('al_assignments').doc(assignmentId).update({
      status:    newStatus,
      outcome:   newStatus,
      outcomeAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    console.info('[db.js] al_assignment status updated:', assignmentId, '→', newStatus);
  } catch(e) { console.warn('[db.js] updateAlAssignmentStatus failed:', e); }
}

// Write reply outcome back to al_assignments (Phase C6 — Reply Tapper persistence)
// Called from _tapReplyOutcome() in outreach_controller.js for routing-engine leads.
// replyType: 'reply' | 'positive' | 'meeting' | 'dead' | 'objection' | 'not_now' | 'unsubscribe'
async function updateAlAssignmentReply(assignmentId, replyType) {
  if (!assignmentId || !replyType) return;
  try {
    await _getDB().collection('al_assignments').doc(assignmentId).update({
      replyType,
      replyOutcome:  replyType,
      repliedAt:     new Date().toISOString(),
      updatedAt:     new Date().toISOString(),
    });
    console.info('[db.js] al_assignment reply written:', assignmentId, '→', replyType);
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

// ── Bootstrap: Load All User Data on Login ────────────────────────────────
// Called from auth.js onAuthStateChanged when user is authenticated.
// Returns { nicheProfile, nicheAnswers, icpConfig, advisorProfile, assignedLeads }
async function bootstrapUserData(uid) {
  if (!uid) return { nicheProfile: null, nicheAnswers: {}, icpConfig: null, advisorProfile: null, assignedLeads: [] };
  try {
    const [profileSnap, answersSnap, icpSnap, apSnap, assignedLeads] = await Promise.all([
      _userDoc(uid, 'nicheProfile').get(),
      _userDoc(uid, 'nicheAnswers').get(),
      _userDoc(uid, 'icpConfig').get(),
      _userDoc(uid, 'advisorProfile').get(),
      loadAssignedLeadsFromFirestore(uid),   // ← Phase B: live leads
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

// ── AL ASSIGNMENTS — advisor accepted briefs ─────────────────
async function saveAlAssignment(assignment) {
  try {
    const db = _getDB();
    if (!db) return null;
    const docRef = await db.collection('al_assignments').add({
      ...assignment,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      status: 'pending_review',
    });
    return docRef.id;
  } catch(e) { console.warn('[db.js] saveAlAssignment failed:', e); return null; }
}

async function loadAlAssignmentsForAdvisor(uid) {
  if (!uid) return [];
  try {
    const db = _getDB();
    if (!db) return [];
    const snap = await db.collection('al_assignments')
      .where('advisorUid', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) { console.warn('[db.js] loadAlAssignments failed:', e); return []; }
}

// ── Refresh helper (non-blocking, called from planning_agent.js) ──
window.refreshEdSituations = async function() {
  const uid = typeof currentUID !== 'undefined' ? currentUID : null;
  const situations = await loadEdSituationsForAdvisor(uid);
  window._edSituations = situations;
  return situations;
};
