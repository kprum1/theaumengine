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

// Write lead status change back to Firestore assignment doc
async function updateLeadStatusInFirestore(assignmentId, newStatus) {
  if (!assignmentId) return;
  try {
    await _getDB().collection('lead_assignments').doc(assignmentId).update({
      advisorStatus: newStatus,
      updatedAt:     new Date().toISOString(),
    });
  } catch(e) { console.warn('[db.js] updateLeadStatus failed:', e); }
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
