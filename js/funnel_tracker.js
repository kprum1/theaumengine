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

  // ── Load advisor's own stats into Command Center widget ──────
  // Called automatically when Command Center renders.
  // Reads funnel_events scoped to current advisor UID.
  async function loadMyActivity() {
    const sentEl     = document.getElementById('my-stat-sent');
    const repliedEl  = document.getElementById('my-stat-replied');
    const meetingsEl = document.getElementById('my-stat-meetings');
    const rateEl     = document.getElementById('my-stat-rate');
    if (!sentEl) return;  // not on Command Center page

    try {
      const uid = firebase.auth().currentUser?.uid;
      if (!uid) return;

      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const snap  = await db.collection('funnel_events')
        .where('advisorUid', '==', uid)
        .where('ts', '>=', since)
        .limit(1000)
        .get();

      let sent = 0, replied = 0, meetings = 0;
      snap.docs.forEach(d => {
        const e = d.data();
        if (e.event === 'outreach_sent')  sent++;
        if (e.event === 'reply_logged')   replied++;
        if (e.event === 'meeting_booked') meetings++;
      });

      const rate = sent > 0 ? Math.round(replied / sent * 100) + '%' : '—';

      // Animate in the numbers
      const set = (el, val) => {
        if (!el) return;
        el.style.opacity = '0';
        el.style.transform = 'translateY(4px)';
        el.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        setTimeout(() => {
          el.textContent = val;
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';
        }, 80);
      };

      set(sentEl,     sent);
      set(repliedEl,  replied);
      set(meetingsEl, meetings);
      set(rateEl,     rate);

    } catch(e) {
      // Non-blocking — stats are nice-to-have
    }
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
    loadMyActivity,
  };

})();

// Make globally accessible
window.FunnelTracker = FunnelTracker;
