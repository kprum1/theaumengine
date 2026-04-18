// ==========================================
// THE AUM ENGINE — AUTH CONTROLLER v1.0
// Phase 1.2.5 — Firebase Auth Gate
// ==========================================
// Firebase is loaded via CDN compat modules in index.html
// This file must load AFTER the Firebase SDK scripts.

// Expose modal helpers globally so inline onclick in HTML works
window.openAuthModal = function() {
  document.getElementById('auth-modal-overlay').classList.add('open');
  _resetAuthButtons();
  clearAuthError();
  setTimeout(() => { const el = document.getElementById('auth-email'); if (el) el.focus(); }, 80);
};
window.closeAuthModal = function() {
  document.getElementById('auth-modal-overlay').classList.remove('open');
  clearAuthError();
  _resetAuthButtons();
  const form = document.getElementById('auth-form');
  if (form) form.reset();
};

// C35-2: Demo data gate — removes hardcoded p1/p25 demo leads from PROSPECTS
// the moment any real Firestore leads are verified. Non-destructive: only
// removes leads whose ID matches the demo pattern (p1, p2, ... p99).
function _flushDemoLeads(reason) {
  if (!window._isDemoMode) return; // already flushed — no-op
  const demoBefore = PROSPECTS.filter(p => /^p\d+$/.test(p.id)).length;
  // Splice out all demo leads (IDs matching /^p\d+$/)
  for (let i = PROSPECTS.length - 1; i >= 0; i--) {
    if (/^p\d+$/.test(PROSPECTS[i].id)) PROSPECTS.splice(i, 1);
  }
  window._isDemoMode = false;
  console.info(`[auth.js] Demo data flushed (C35-2): removed ${demoBefore} demo leads. Reason: ${reason}`);
}

// Central reset — safe to call at any time
function _resetAuthButtons() {
  const submitBtn = document.getElementById('auth-submit-btn');
  if (submitBtn) {
    submitBtn.removeAttribute('disabled'); // removeAttribute is more reliable than .disabled=false
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign In';
  }
  const gBtn = document.getElementById('auth-google-btn');
  if (gBtn) {
    gBtn.removeAttribute('disabled');
    gBtn.disabled = false;
    gBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/><path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/></svg> Continue with Google`;
  }
}

// ===== FIREBASE CONFIG =====
const firebaseConfig = {
  apiKey: "AIzaSyAc7Gb9CUQ9OirXUe8AEFh2b7F9m_Mn8Sg",
  authDomain: "theaumengine.firebaseapp.com",
  projectId: "theaumengine",
  storageBucket: "theaumengine.firebasestorage.app",
  messagingSenderId: "938002241793",
  appId: "1:938002241793:web:756cdb9f01674456e66300"
};

// ===== INIT =====
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// ===== UI HELPERS =====
function showAppShell() {
  document.getElementById('public-shell').style.display = 'none';
  document.getElementById('app-shell').style.display   = 'flex';
  document.body.classList.add('app-mode');
  document.body.classList.remove('public-mode');
}

function showPublicShell() {
  document.getElementById('app-shell').style.display   = 'none';
  document.getElementById('public-shell').style.display = 'block';
  document.body.classList.remove('app-mode');
  document.body.classList.add('public-mode');
  closeAuthModal();
  // Timing failsafe: re-reset buttons after DOM settles (handles SPA transition races)
  setTimeout(_resetAuthButtons, 50);
  setTimeout(_resetAuthButtons, 200);
}

// Note: openAuthModal and closeAuthModal are defined above as window globals.
// These local re-declarations are intentionally removed to prevent state desync.


function setAuthError(msg) {
  const el = document.getElementById('auth-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function clearAuthError() {
  const el = document.getElementById('auth-error');
  if (el) { el.textContent = ''; el.style.display = 'none'; }
}

function setAuthLoading(loading) {
  const btn = document.getElementById('auth-submit-btn');
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? 'Signing in…' : 'Sign In';
}

function resetGoogleBtn() { _resetAuthButtons(); }

function updateUserDisplay(user) {
  // Show user email in sidebar footer
  const nameEl = document.getElementById('user-display-name');
  const emailEl = document.getElementById('user-display-email');
  if (nameEl && user) nameEl.textContent = user.displayName || user.email.split('@')[0];
  if (emailEl && user) emailEl.textContent = user.email;
}

// ===== AUTH STATE LISTENER =====
// Core gate — runs once on page load and on every auth state change
let currentUID = null; // global — used by db.js helpers throughout the app

auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUID = user.uid;
    window._currentUser = user; // ← shared with admin.js + outreach_controller.js
    // ✅ Authenticated — show cockpit immediately, then hydrate from Firestore
    showAppShell();
    updateUserDisplay(user);
    if (typeof syncThemeButton === 'function') syncThemeButton();

    // Bootstrap user data from Firestore (falls back to localStorage if offline)
    if (typeof bootstrapUserData === 'function') {
      const data = await bootstrapUserData(user.uid);
      if (typeof initWithUserData === 'function') initWithUserData(data);

      // C35-2: Flush demo leads the moment real Firestore pipeline leads arrive
      if (data.assignedLeads && data.assignedLeads.length > 0) {
        _flushDemoLeads('bootstrapUserData — ' + data.assignedLeads.length + ' assigned leads loaded');
        if (typeof refreshAlerts === 'function') refreshAlerts(); // recompute alerts from live data
      }

      // Load booking link from Firestore → hydrate ICP_CONFIG + localStorage
      if (typeof loadBookingLink === 'function') {
        loadBookingLink(user.uid).then(link => {
          if (link) {
            if (typeof ICP_CONFIG !== 'undefined') ICP_CONFIG.bookingLink = link;
            try { localStorage.setItem('aum_booking_link', link); } catch(e) {}
            console.info('[auth.js] bookingLink loaded from Firestore');
          }
        }).catch(() => {});
      }
    }

    // Start presence tracking (non-blocking)
    if (typeof initPresence === 'function') initPresence(user);

    // Show admin nav item if operator
    const adminNavItem    = document.getElementById('nav-admin-dashboard');
    const adminNavSection = document.getElementById('admin-nav-section');
    const isOp = user.email === 'kosal@fin-tegration.com';
    if (adminNavItem)    adminNavItem.style.display    = isOp ? 'flex'  : 'none';
    if (adminNavSection) adminNavSection.style.display = isOp ? 'block' : 'none';

    // C18-1: Manager Console — operator only (advisors should not see team-level data)
    const managerNavItem = document.getElementById('nav-manager-console');
    if (managerNavItem) managerNavItem.style.display = isOp ? 'flex' : 'none';

    // Security Sentinel nav — revealed only if sentinel_enabled flag is true
    // AND the current user is the operator (M4 fix: role-gate Security Sentinel).
    // loadSentinelConfig() (called from initWithUserData in app.js) sets
    // window.SENTINEL_ENABLED asynchronously; we check after a short delay.
    const sentinelNavItem    = document.getElementById('nav-security-sentinel');
    const sentinelNavSection = document.getElementById('sentinel-nav-section');
    setTimeout(() => {
      const sentinelOn = window.SENTINEL_ENABLED === true && isOp;
      if (sentinelNavItem)    sentinelNavItem.style.display    = sentinelOn ? 'flex'  : 'none';
      if (sentinelNavSection) sentinelNavSection.style.display = sentinelOn ? 'block' : 'none';
      if (sentinelOn) console.info('[auth.js] Sentinel nav revealed (operator only).');
    }, 1500);

    if (typeof navigate === 'function') navigate('command-center');
    if (typeof bindPageEvents === 'function') bindPageEvents();

    // Show first-run onboarding wizard for new advisors (onboarding.js)
    if (typeof checkAndShowOnboarding === 'function') checkAndShowOnboarding();

    // ── SLA Breach Banner (C21) ────────────────────────────────────────────
    // Non-blocking: query lead_assignments for this advisor's stale new leads.
    // If any are >7 days old with no outreach, inject a dismissible red banner.
    _checkAndShowSlaBanner(user.uid).catch(() => {});

    // Load Alfred's Firestore prospects and merge into the live PROSPECTS array
    if (typeof loadProspectsFromFirestore === 'function') {
      loadProspectsFromFirestore().then(firestoreProspects => {
        if (!firestoreProspects.length) return;
        // C35-2: Flush demo data before injecting real Firestore prospects
        _flushDemoLeads('loadProspectsFromFirestore — ' + firestoreProspects.length + ' prospects loaded');
        // Deduplicate by id — ensures no double-adds on re-auth
        const existingIds = new Set(PROSPECTS.map(p => p.id));
        const newOnes = firestoreProspects.filter(p => !existingIds.has(p.id));
        if (newOnes.length) {
          PROSPECTS.push(...newOnes);
          // Re-sort by priority score descending
          PROSPECTS.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
          console.info(`[auth.js] Loaded ${newOnes.length} Firestore prospects (total: ${PROSPECTS.length})`);
          // Recompute live alerts from updated pipeline
          if (typeof refreshAlerts === 'function') refreshAlerts();
          // Refresh the current page so the scoreboard shows new leads
          if (typeof navigate === 'function') {
            const currentPage = document.querySelector('.nav-item.active')?.dataset?.page || 'command-center';
            navigate(currentPage);
          }
        }
      }).catch(e => console.warn('[auth.js] Prospect load failed (non-blocking):', e));
    }

  } else {
    currentUID = null;
    window._currentUser = null;
    // ❌ Not authenticated — show public landing page
    _resetAuthButtons(); // ← guarantee clean modal state on every signout
    showPublicShell();
  }
});

// ===== LOGIN FORM =====
document.addEventListener('DOMContentLoaded', () => {
  // Google Sign-In button
  const googleBtn = document.getElementById('auth-google-btn');
  if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
      clearAuthError();
      googleBtn.disabled = true;
      googleBtn.textContent = 'Signing in…';
      try {
        await auth.signInWithPopup(googleProvider);
        // onAuthStateChanged fires and takes over from here
      } catch (err) {
        googleBtn.disabled = false;
        googleBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/><path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/></svg> Continue with Google`;
        if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
          setAuthError('Google sign-in failed. Please try again.');
        }
      }
    });
  }

  // Login button → open modal
  const loginBtn = document.getElementById('login-btn');
  if (loginBtn) loginBtn.addEventListener('click', openAuthModal);

  // Hero CTA → open modal
  const heroCta = document.getElementById('hero-login-cta');
  if (heroCta) heroCta.addEventListener('click', openAuthModal);

  // Founding CTA → open modal
  const foundingCta = document.getElementById('founding-cta-btn');
  if (foundingCta) foundingCta.addEventListener('click', openAuthModal);

  // Close modal on overlay click
  const overlay = document.getElementById('auth-modal-overlay');
  if (overlay) overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeAuthModal();
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAuthModal();
  });

  // Auth form submit
  const authForm = document.getElementById('auth-form');
  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email    = document.getElementById('auth-email').value.trim();
      const password = document.getElementById('auth-password').value;
      if (!email || !password) { setAuthError('Please enter your email and password.'); return; }
      setAuthLoading(true);
      clearAuthError();
      try {
        await auth.signInWithEmailAndPassword(email, password);
        // onAuthStateChanged will fire and show app shell
      } catch (err) {
        setAuthLoading(false);
        const messages = {
          'auth/user-not-found':   'No account found with that email.',
          'auth/wrong-password':   'Incorrect password. Please try again.',
          'auth/invalid-email':    'Please enter a valid email address.',
          'auth/too-many-requests':'Too many attempts. Please wait a moment.',
          'auth/invalid-credential': 'Invalid email or password.',
        };
        setAuthError(messages[err.code] || 'Sign-in failed. Please try again.');
      }
    });
  }

  // Forgot password link
  const forgotBtn = document.getElementById('forgot-password-btn');
  if (forgotBtn) {
    forgotBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const email = document.getElementById('auth-email').value.trim();
      if (!email) { setAuthError('Enter your email above first, then click Forgot Password.'); return; }
      try {
        await auth.sendPasswordResetEmail(email);
        setAuthError('');
        const el = document.getElementById('auth-error');
        if (el) { el.textContent = 'Password reset email sent. Check your inbox.'; el.style.color = 'var(--emerald)'; el.style.display = 'block'; }
      } catch (err) {
        setAuthError('Could not send reset email. Check the address and try again.');
      }
    });
  }

  // Logout button (in app sidebar)
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      // Clear presence before signing out
      if (typeof clearPresence === 'function' && window._currentUser) {
        await clearPresence(window._currentUser.uid);
      }
      // Clear active Al brief — prevents ghost brief persisting across advisor sessions
      try { sessionStorage.removeItem('alCurrentBrief'); } catch(e) {}
      window._alCurrentBrief      = null;
      window._alActiveSituationId = null;
      window._edSituations        = null;
      window._alAssignments       = null;
      // Reset all auth UI state before signout so modal is clean on next open
      setAuthLoading(false);
      resetGoogleBtn();
      await auth.signOut();
      // onAuthStateChanged will fire and show public shell
    });
  }

  // Scroll effect for public header
  const pubHeader = document.getElementById('pub-header');
  if (pubHeader) {
    window.addEventListener('scroll', () => {
      pubHeader.classList.toggle('scrolled', window.scrollY > 40);
    }, { passive: true });
  }

  // Nav bindings only after DOM is ready — guard against early calls
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      if (typeof navigate === 'function') navigate(item.dataset.page);
    });
  });

  // FAQ accordion
  document.querySelectorAll('.faq-item').forEach(item => {
    const q = item.querySelector('.faq-question');
    if (q) q.addEventListener('click', () => {
      item.classList.toggle('open');
    });
  });

  // Sample board link (smooth scroll or toast)
  const sampleLink = document.getElementById('sample-board-link');
  if (sampleLink) {
    sampleLink.addEventListener('click', (e) => {
      e.preventDefault();
      openAuthModal();
    });
  }
  // Lead capture form — AJAX Formspree submit (no page redirect)
  const leadForm = document.getElementById('lead-capture-form');
  if (leadForm) {
    leadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = leadForm.querySelector('.lead-capture-btn');
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
      try {
        const resp = await fetch(leadForm.action, {
          method: 'POST',
          body: new FormData(leadForm),
          headers: { 'Accept': 'application/json' }
        });
        if (resp.ok) {
          leadForm.style.display = 'none';
          const success = document.getElementById('lead-capture-success');
          if (success) success.style.display = 'block';
        } else {
          if (btn) { btn.disabled = false; btn.textContent = 'Get the details →'; }
        }
      } catch {
        if (btn) { btn.disabled = false; btn.textContent = 'Get the details →'; }
      }
    });
  }
});
  // ======================================================
  // ACCOUNT MANAGEMENT MODAL
  // ======================================================

  // ── Open/Close ────────────────────────────────────────
  window.openAccountModal = function() {
    const overlay = document.getElementById('account-modal-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';

    // Hydrate with current user data
    const user = auth.currentUser;
    if (!user) return;

    const name    = user.displayName || user.email.split('@')[0];
    const email   = user.email || '';
    const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const provider = user.providerData?.[0]?.providerId === 'google.com' ? 'Google' : 'Email / Password';
    const lastSignIn = user.metadata?.lastSignInTime
      ? new Date(user.metadata.lastSignInTime).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
      : '—';

    // Avatar
    const avatarEl = document.getElementById('acct-avatar');
    if (avatarEl) avatarEl.textContent = initials;

    // Name / email display row
    const nameDisp  = document.getElementById('acct-name-display');
    const emailDisp = document.getElementById('acct-email-display');
    if (nameDisp)  nameDisp.textContent  = name;
    if (emailDisp) emailDisp.textContent = email;

    // Profile panel fields
    const nameInput = document.getElementById('acct-display-name-input');
    const emailRO   = document.getElementById('acct-email-readonly');
    if (nameInput) nameInput.value = user.displayName || '';
    if (emailRO)   emailRO.textContent = email;

    // Security panel session info
    const sessEmail    = document.getElementById('acct-session-email');
    const sessProv     = document.getElementById('acct-session-provider');
    const sessLastSign = document.getElementById('acct-session-lastsignin');
    if (sessEmail)    sessEmail.textContent    = email;
    if (sessProv)     sessProv.textContent     = provider;
    if (sessLastSign) sessLastSign.textContent = lastSignIn;

    // Reset messages + tab to Profile
    switchAccountTab('profile');
    _clearAccountMsg('profile');
    _clearAccountMsg('security');

    // Focus name input
    setTimeout(() => { if (nameInput) nameInput.focus(); }, 80);
  };

  window.closeAccountModal = function() {
    const overlay = document.getElementById('account-modal-overlay');
    if (overlay) overlay.style.display = 'none';
  };

  // ── Tab Switch ─────────────────────────────────────────
  window.switchAccountTab = function(tab) {
    const tabs   = { profile: 'acct-tab-profile',   security: 'acct-tab-security'   };
    const panels = { profile: 'acct-panel-profile', security: 'acct-panel-security' };
    Object.keys(tabs).forEach(t => {
      const btn = document.getElementById(tabs[t]);
      const pnl = document.getElementById(panels[t]);
      const active = t === tab;
      if (btn) {
        btn.style.borderBottomColor = active ? 'var(--blue)' : 'transparent';
        btn.style.color             = active ? 'var(--blue)' : 'var(--text-muted)';
      }
      if (pnl) pnl.style.display = active ? 'block' : 'none';
    });
  };

  // ── Profile: Save Display Name ─────────────────────────
  window.saveDisplayName = async function() {
    const user = auth.currentUser;
    if (!user) return;
    const input = document.getElementById('acct-display-name-input');
    const newName = input?.value.trim();
    if (!newName) { _showAccountMsg('profile', 'Please enter a display name.', 'error'); return; }

    const btn = document.getElementById('acct-save-name-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

    try {
      await user.updateProfile({ displayName: newName });
      // Sync sidebar
      updateUserDisplay(auth.currentUser);
      // Sync modal header
      const nameDisp = document.getElementById('acct-name-display');
      if (nameDisp) nameDisp.textContent = newName;
      // Sync avatar initials
      const initials = newName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      const avatarEl = document.getElementById('acct-avatar');
      if (avatarEl) avatarEl.textContent = initials;
      const sidebarAvatar = document.getElementById('user-avatar');
      if (sidebarAvatar) sidebarAvatar.textContent = initials;

      _showAccountMsg('profile', '✅ Display name updated!', 'success');
      if (typeof showToast === 'function') showToast('Display name updated ✅', '👤');
    } catch(e) {
      _showAccountMsg('profile', 'Could not update name. Please try again.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
    }
  };

  // ── Security: Send Password Reset ─────────────────────
  window.sendAccountPasswordReset = async function() {
    const user = auth.currentUser;
    if (!user?.email) return;

    const btn = document.getElementById('acct-reset-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

    try {
      await auth.sendPasswordResetEmail(user.email);
      _showAccountMsg('security', `✅ Reset email sent to ${user.email}. Check your inbox.`, 'success');
    } catch(e) {
      _showAccountMsg('security', 'Could not send reset email. Please try again.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '📧 Send Password Reset Email'; }
    }
  };

  // ── Internal helpers ───────────────────────────────────
  function _showAccountMsg(panel, text, type) {
    const id = panel === 'profile' ? 'acct-profile-msg' : 'acct-security-msg';
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.style.display = 'block';
    el.style.background = type === 'success' ? 'rgba(52,211,153,0.12)' : 'rgba(244,63,94,0.10)';
    el.style.color      = type === 'success' ? 'var(--emerald)'         : 'var(--rose)';
    el.style.border     = `1px solid ${type === 'success' ? 'rgba(52,211,153,0.25)' : 'rgba(244,63,94,0.2)'}`;
  }
  function _clearAccountMsg(panel) {
    const id = panel === 'profile' ? 'acct-profile-msg' : 'acct-security-msg';
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }

  // Close on Escape (add to existing keydown listener)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const overlay = document.getElementById('account-modal-overlay');
      if (overlay && overlay.style.display !== 'none') closeAccountModal();
    }
  });

// ── SLA Breach Banner — C21 (patched C23) ────────────────────────────────
// Checks this advisor's lead_assignments for new leads > 7 days old.
// Injects a dismissible amber/red banner at the top of #page-content.
// Dismissed state is stored in sessionStorage — banner does NOT re-fire
// on navigation within the same session.
async function _checkAndShowSlaBanner(uid) {
  if (!uid || typeof firebase === 'undefined') return;

  // C23-4: Skip if advisor already dismissed the banner this session
  const dismissKey = `sla_banner_dismissed_${uid}`;
  if (sessionStorage.getItem(dismissKey)) return;

  const db = firebase.firestore();
  const SLA_DAYS = 7;
  const threshold = new Date(Date.now() - SLA_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Short delay to let the page render first
  await new Promise(r => setTimeout(r, 1200));

  let snap;
  try {
    snap = await db.collection('lead_assignments')
      .where('ownerUid', '==', uid)
      .where('status', '==', 'new')
      .get();
  } catch (e) { return; }

  const stale = snap.docs.filter(d => {
    const assigned = d.data().assignedAt || d.data().createdAt || '';
    return assigned && assigned < threshold;
  });

  if (!stale.length) return;

  // Remove any existing banner first (prevents duplicates on re-auth)
  const existing = document.getElementById('sla-breach-banner');
  if (existing) existing.remove();

  const count  = stale.length;
  const plural = count !== 1;
  const banner = document.createElement('div');
  banner.id = 'sla-breach-banner';
  banner.setAttribute('role', 'alert');
  banner.innerHTML = `
    <span style="font-size:16px;">⏰</span>
    <span style="flex:1;">
      <strong>${count} lead${plural ? 's' : ''}</strong> ${plural ? 'have' : 'has'} not been contacted in
      <strong>${SLA_DAYS}+ days</strong>. Open your pipeline and initiate outreach today.
    </span>
    <button
      aria-label="Dismiss SLA alert"
      onclick="(function(){
        sessionStorage.setItem('${dismissKey}', '1');
        const b = document.getElementById('sla-breach-banner');
        if (b) { b.style.opacity='0'; b.style.transition='opacity 0.25s'; setTimeout(()=>b.remove(),260); }
      })()"
      style="background:none;border:none;color:inherit;cursor:pointer;opacity:.7;font-size:18px;line-height:1;padding:0 0 0 12px;"
      title="Dismiss">✕</button>
  `;

  Object.assign(banner.style, {
    display:        'flex',
    alignItems:     'center',
    gap:            '10px',
    padding:        '12px 18px',
    background:     'linear-gradient(90deg,rgba(248,113,113,0.14),rgba(251,146,60,0.10))',
    border:         '1px solid rgba(248,113,113,0.35)',
    borderRadius:   '10px',
    color:          '#fca5a5',
    fontSize:       '13px',
    fontWeight:     '500',
    lineHeight:     '1.5',
    marginBottom:   '18px',
    animation:      'fadeInDown 0.35s ease',
    cursor:         'default',
  });

  // Inject at top of #page-content (the main scrollable area)
  const target = document.getElementById('page-content') || document.getElementById('main-content');
  if (target) {
    target.insertBefore(banner, target.firstChild);
  }
  // Note: MutationObserver auto-dismiss removed (C23-4) — banner now persists
  // across navigation within the session until advisor explicitly dismisses it.
}

