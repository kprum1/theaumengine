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
    // ✅ Authenticated — show cockpit immediately, then hydrate from Firestore
    showAppShell();
    updateUserDisplay(user);
    if (typeof syncThemeButton === 'function') syncThemeButton();

    // Bootstrap user data from Firestore (falls back to localStorage if offline)
    if (typeof bootstrapUserData === 'function') {
      const data = await bootstrapUserData(user.uid);
      if (typeof initWithUserData === 'function') initWithUserData(data);
    }

    if (typeof navigate === 'function') navigate('command-center');
    if (typeof bindPageEvents === 'function') bindPageEvents();
  } else {
    currentUID = null;
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
