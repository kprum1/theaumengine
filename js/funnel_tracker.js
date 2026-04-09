// ======================================================================
// AUM ENGINE — Funnel Tracker (Path B)
// js/funnel_tracker.js
//
// Additive analytics layer — tracks advisor actions without modifying
// any existing Firestore collections or Cloud Functions.
//
// Events tracked:
//   lead_viewed           — advisor opens a lead card
//   outreach_drafted      — advisor generates a draft email/linkedin
//   outreach_sent         — advisor marks "Send Now"
//   reply_logged          — advisor logs reply via Reply Tapper
//   meeting_booked        — advisor books a meeting
//   lead_status_changed   — advisor updates lead status
//   demo_cta_clicked      — landing page CTA click (public)
//   niche_form_submitted  — onboarding niche intake form
//
// Storage: Firestore → funnel_events collection (append-only)
// Operator view: scripts/funnel_report.js  (Path B)
// Live dashboard: operator_dashboard section in app
//
// HOW TO USE:
//   Call FunnelTracker.log(eventName, metadata) anywhere in the app.
//   It's fire-and-forget — never blocks UI or throws to the user.
// ======================================================================

const FunnelTracker = (() => {

  // ── Config ──────────────────────────────────────────────────
  const ENABLED = true;  // flip to false to pause tracking
  const VERSION = 'v1';

  // ── Get current advisor context ─────────────────────────────
  function getAdvisorCtx() {
    try {
      const u = firebase.auth().currentUser;
      return {
        advisorUid:   u?.uid  || 'anonymous',
        advisorEmail: u?.email || 'unknown',
      };
    } catch(e) {
      return { advisorUid: 'anonymous', advisorEmail: 'unknown' };
    }
  }

  // ── Core log function ────────────────────────────────────────
  async function log(eventName, meta = {}) {
    if (!ENABLED) return;
    try {
      const ctx   = getAdvisorCtx();
      const event = {
        event:        eventName,
        version:      VERSION,
        ...ctx,
        ...meta,
        sessionId:    sessionStorage.getItem('aum_session_id') || 'no_session',
        page:         window.location.pathname || '/',
        ts:           new Date().toISOString(),
        tsMs:         Date.now(),
      };

      // Firestore write (fire-and-forget)
      if (typeof db !== 'undefined' && db?.collection) {
        db.collection('funnel_events').add(event).catch(() => {});
      }

      // Also buffer to sessionStorage for instant operator view
      try {
        const buf = JSON.parse(sessionStorage.getItem('aum_funnel_buf') || '[]');
        buf.push(event);
        sessionStorage.setItem('aum_funnel_buf', JSON.stringify(buf.slice(-100))); // keep last 100
      } catch(e) {}

    } catch(e) {
      // Never break the UI
    }
  }

  // ── Session ID init ──────────────────────────────────────────
  function initSession() {
    if (!sessionStorage.getItem('aum_session_id')) {
      const sid = `sess_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
      sessionStorage.setItem('aum_session_id', sid);
    }
  }

  // ── Convenience event methods ────────────────────────────────

  function leadViewed(leadId, nicheId, fitScore) {
    return log('lead_viewed', { leadId, nicheId, fitScore });
  }

  function outreachDrafted(leadId, channel, angle, variantId) {
    return log('outreach_drafted', { leadId, channel, angle, variantId });
  }

  function outreachSent(leadId, channel, variantId) {
    return log('outreach_sent', { leadId, channel, variantId });
  }

  function replyLogged(leadId, replyType) {
    // replyType: 'reply' | 'meeting' | 'not_now' | 'dead'
    return log('reply_logged', { leadId, replyType });
  }

  function meetingBooked(leadId, nicheId) {
    return log('meeting_booked', { leadId, nicheId });
  }

  function leadStatusChanged(leadId, fromStatus, toStatus) {
    return log('lead_status_changed', { leadId, fromStatus, toStatus });
  }

  function ctaClicked(ctaLabel, page) {
    return log('demo_cta_clicked', { ctaLabel, page });
  }

  function nicheFormSubmitted(topNiche, questionCount) {
    return log('niche_form_submitted', { topNiche, questionCount });
  }

  function pageViewed(pageName) {
    return log('page_viewed', { pageName });
  }

  // ── Auto-init ────────────────────────────────────────────────
  initSession();

  // Public API
  return {
    log,
    leadViewed,
    outreachDrafted,
    outreachSent,
    replyLogged,
    meetingBooked,
    leadStatusChanged,
    ctaClicked,
    nicheFormSubmitted,
    pageViewed,
  };

})();

// Make globally accessible
window.FunnelTracker = FunnelTracker;
