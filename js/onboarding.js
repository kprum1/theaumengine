// ============================================================
// THE AUM ENGINE — ONBOARDING WIZARD
// onboarding.js
//
// Fires on first login (or if aumOnboardingComplete is absent).
// 5-step modal guiding advisor through the core workflow.
// Persists completion to localStorage so it only shows once.
// ============================================================

const ONBOARDING_KEY   = 'aumOnboardingComplete';
const ONBOARDING_STEP_KEY = 'aumOnboardingStep';

// ── Step definitions ──────────────────────────────────────────
const ONBOARDING_STEPS = [
  {
    id: 'welcome',
    emoji: '💎',
    title: 'Welcome to The AUM Engine',
    subtitle: 'Your advisor growth cockpit — set up in 5 minutes',
    body: `You're in. Here's what we'll do to get you ready for your first right-fit meeting:<br><br>
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:4px">
      <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:rgba(96,165,250,0.08);border-radius:10px;border:1px solid rgba(96,165,250,0.2)">
        <span style="font-size:20px;width:32px;text-align:center">🧭</span>
        <div><div style="font-size:12.5px;font-weight:700;color:var(--text-primary)">Step 1 — Map your niche</div><div style="font-size:11px;color:var(--text-muted)">5-minute assessment to find where you'll win</div></div>
        <span style="margin-left:auto;font-size:10px;color:var(--blue);font-weight:600">~5 min</span>
      </div>
      <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:rgba(167,139,250,0.08);border-radius:10px;border:1px solid rgba(167,139,250,0.2)">
        <span style="font-size:20px;width:32px;text-align:center">💎</span>
        <div><div style="font-size:12.5px;font-weight:700;color:var(--text-primary)">Step 2 — Review your top prospects</div><div style="font-size:11px;color:var(--text-muted)">Pre-scored households ready to work</div></div>
        <span style="margin-left:auto;font-size:10px;color:var(--violet);font-weight:600">~2 min</span>
      </div>
      <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:rgba(52,211,153,0.08);border-radius:10px;border:1px solid rgba(52,211,153,0.2)">
        <span style="font-size:20px;width:32px;text-align:center">✍️</span>
        <div><div style="font-size:12.5px;font-weight:700;color:var(--text-primary)">Step 3 — Draft your first outreach</div><div style="font-size:11px;color:var(--text-muted)">AI-personalized in your voice, you approve</div></div>
        <span style="margin-left:auto;font-size:10px;color:var(--emerald);font-weight:600">~2 min</span>
      </div>
    </div>`,
    primaryLabel: 'Let\'s Go →',
    skipLabel: 'Skip setup — go to dashboard',
    primaryAction: 'next',
    showProgress: false,
  },
  {
    id: 'niche',
    emoji: '🧭',
    title: 'Step 1 of 3 — Map Your Niche',
    subtitle: 'The Engine can\'t work until it knows where you\'ll win',
    body: `<div style="padding:14px 16px;background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.2);border-radius:10px;margin-bottom:14px">
      <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.7">
        The 5-stage Niche Mapping assessment scores you across <strong>Fit, Focus, Market, Access, and Service Match</strong> for 12+ advisor niches — physicians, business owners, AI-displaced executives, yacht owners, and more.<br><br>
        After the assessment, the AUM Engine auto-configures your ICP (Ideal Client Profile) so Alfred knows exactly who to mine.
      </div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
      ${['Physicians','Business Owners','AI-Displaced Execs','Aircraft Owners','HENRYs','Law Partners','Charity Boards','Inheritance Recipients','Pro Athletes'].map(n =>
        `<span style="font-size:10.5px;padding:3px 9px;border-radius:20px;background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.2);color:var(--blue);font-weight:500">${n}</span>`
      ).join('')}
    </div>`,
    primaryLabel: '🧭 Open Niche Mapping',
    skipLabel: 'Skip for now',
    primaryAction: 'niche',
    showProgress: true,
    step: 1,
  },
  {
    id: 'prospects',
    emoji: '💎',
    title: 'Step 2 of 3 — Review Your Top Prospects',
    subtitle: 'Pre-scored households ranked by fit and urgency',
    body: `<div style="padding:14px 16px;background:rgba(167,139,250,0.06);border:1px solid rgba(167,139,250,0.2);border-radius:10px;margin-bottom:14px">
      <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.7">
        Your Lead Scoreboard has <strong>${typeof PROSPECTS !== 'undefined' ? PROSPECTS.length : '100+'} pre-scored prospects</strong>, ranked by AI Priority Score. Each prospect shows:<br><br>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px">
          <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-muted)"><span style="color:var(--blue)">●</span> Fit Score</div>
          <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-muted)"><span style="color:var(--violet)">●</span> Timing Score</div>
          <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-muted)"><span style="color:var(--emerald)">●</span> Priority Score</div>
          <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-muted)"><span style="color:var(--amber)">●</span> Wealth Signals</div>
        </div>
      </div>
    </div>
    <div style="padding:12px 14px;background:rgba(251,191,36,0.07);border:1px solid rgba(251,191,36,0.25);border-radius:10px;margin-bottom:10px">
      <div style="font-size:11.5px;font-weight:700;color:var(--amber);margin-bottom:5px">📅 Set your booking link first</div>
      <div style="font-size:11.5px;color:var(--text-muted);line-height:1.6">
        Before sending outreach, add your Calendly or scheduling link in <strong>Settings &amp; ICP</strong>. Without it, prospects won't be able to book a call with you.
      </div>
      <button onclick="document.getElementById('onboarding-overlay')?.remove();navigate('settings');showToast('Add your booking link in Settings &amp; ICP \u2192 Booking Link','📅')" style="margin-top:10px;padding:6px 14px;border-radius:7px;background:rgba(251,191,36,0.15);border:1px solid rgba(251,191,36,0.3);color:var(--amber);font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit">⚙️ Go to Settings &amp; ICP →</button>
    </div>
    <div style="font-size:11.5px;color:var(--text-muted);padding:8px 12px;background:var(--bg-elevated);border-radius:8px">
      💡 <strong>Tip:</strong> Click any prospect to open their detail panel — you'll see estimated assets, life event signals, and activity history.
    </div>`,
    primaryLabel: '💎 View Lead Scoreboard',
    skipLabel: 'Skip for now',
    primaryAction: 'scoreboard',
    showProgress: true,
    step: 2,
  },
  {
    id: 'booking',
    emoji: '📅',
    title: 'Step 3 of 4 — Add Your Booking Link',
    subtitle: 'Required before your first outreach — prospects need to book with you',
    body: `<div style="padding:14px 16px;background:rgba(251,191,36,0.07);border:1px solid rgba(251,191,36,0.25);border-radius:10px;margin-bottom:16px">
      <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.7">
        Your Calendly (or any scheduling) link is embedded in every outreach message. Without it, prospects can't book a call — and the Send button will be blocked until it's set.
      </div>
    </div>
    <div style="margin-bottom:10px">
      <label style="display:block;font-size:10.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:7px">Your Booking Link</label>
      <input
        id="ob-booking-link-input"
        type="url"
        placeholder="https://calendly.com/yourname/30min"
        style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--border-default);background:var(--bg-elevated);color:var(--text-primary);font-family:inherit;font-size:13px;outline:none;box-sizing:border-box"
        oninput="document.getElementById('ob-booking-save-status').textContent=''"
      />
      <div id="ob-booking-save-status" style="font-size:11px;color:var(--emerald);margin-top:5px;min-height:16px"></div>
    </div>
    <div style="font-size:11.5px;color:var(--text-muted);padding:8px 12px;background:var(--bg-elevated);border-radius:8px">
      💡 <strong>Tip:</strong> Not using Calendly? Any scheduling URL works — Calendly, Acuity, SimplePractice, or your own calendar link.
    </div>`,
    primaryLabel: '💾 Save & Continue →',
    skipLabel: 'Set it later in Settings & ICP',
    primaryAction: 'bookingLink',
    showProgress: true,
    step: 3,
  },
  {
    id: 'outreach',
    emoji: '✍️',
    title: 'Step 4 of 4 — Draft Your First Outreach',
    subtitle: 'AI-personalized in your voice — you always approve before it goes out',
    body: `<div style="padding:14px 16px;background:rgba(52,211,153,0.06);border:1px solid rgba(52,211,153,0.2);border-radius:10px;margin-bottom:14px">
      <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.7">
        The Outreach Studio generates <strong>3 tone variants</strong> (Direct / Soft / Insight-Led) for Email, LinkedIn, Voicemail, and Call scripts — all based on each prospect's signals and your niche.<br><br>
        <strong>Nothing sends automatically.</strong> You review every draft, copy it to your email client, and send from your own account. Full compliance control.
      </div>
    </div>
    <div style="font-size:11.5px;color:var(--text-muted);padding:8px 12px;background:var(--bg-elevated);border-radius:8px">
      💡 <strong>Tip:</strong> Click "💎 Generate" to trigger the AI agent stack — Research → Strategy → Customization → Cadence. Takes about 1 second.
    </div>`,
    primaryLabel: '✍️ Open Outreach Studio',
    skipLabel: 'Skip for now',
    primaryAction: 'outreach',
    showProgress: true,
    step: 4,
  },

  {
    id: 'done',
    emoji: '🎉',
    title: 'You\'re set up — go get meetings',
    subtitle: 'Your cockpit is ready. Here\'s what to do next.',
    body: `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(52,211,153,0.08);border-radius:10px">
        <span style="font-size:16px">✅</span>
        <div style="font-size:12px;color:var(--text-secondary)">Niche mapped and ICP configured</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(52,211,153,0.08);border-radius:10px">
        <span style="font-size:16px">✅</span>
        <div style="font-size:12px;color:var(--text-secondary)">Top prospects reviewed and ready</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(52,211,153,0.08);border-radius:10px">
        <span style="font-size:16px">✅</span>
        <div style="font-size:12px;color:var(--text-secondary)">First outreach drafted — copy and send</div>
      </div>
    </div>
    <div style="padding:12px 14px;background:var(--bg-elevated);border-radius:10px;font-size:11.5px;color:var(--text-muted);line-height:1.7">
      📅 <strong>Your onboarding call</strong> is your next step — we'll walk through your first 10 prospects with you live and refine your messaging.<br>
      <a href="mailto:kosal@fin-tegration.com" style="color:var(--blue)">Reply to your welcome email</a> to schedule it.
    </div>`,
    primaryLabel: '🚀 Go to Command Center',
    skipLabel: null,
    primaryAction: 'finish',
    showProgress: false,
  },
];

let _onboardingCurrentStep = 0;

// ── Entry point — call after login ────────────────────────────
function checkAndShowOnboarding() {
  // Don't show if already completed
  if (localStorage.getItem(ONBOARDING_KEY) === 'true') return;
  // Don't show if operator (they know the system)
  const userEmail = window._currentUser?.email || '';
  if (userEmail === 'kosal@fin-tegration.com') return;

  // Small delay so the cockpit renders first
  setTimeout(() => {
    _onboardingCurrentStep = parseInt(localStorage.getItem(ONBOARDING_STEP_KEY) || '0', 10);
    _renderOnboardingModal(_onboardingCurrentStep);
  }, 800);
}

// ── Render the modal for a given step ─────────────────────────
function _renderOnboardingModal(stepIdx) {
  const step = ONBOARDING_STEPS[stepIdx];
  if (!step) { _completeOnboarding(); return; }

  // Remove existing modal if any
  const existing = document.getElementById('onboarding-overlay');
  if (existing) existing.remove();

  const progressHTML = step.showProgress
    ? `<div style="display:flex;gap:5px;justify-content:center;margin-bottom:20px">
        ${[1,2,3,4].map(i => `<div style="width:28px;height:3px;border-radius:2px;background:${i <= step.step ? 'var(--blue)' : 'var(--border-default)'}"></div>`).join('')}
      </div>`
    : '';

  const overlay = document.createElement('div');
  overlay.id = 'onboarding-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9999;
    background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);
    display:flex;align-items:center;justify-content:center;
    animation:ob-fade-in 0.25s ease;
  `;

  overlay.innerHTML = `
    <style>
      @keyframes ob-fade-in { from { opacity:0; } to { opacity:1; } }
      @keyframes ob-slide-up { from { opacity:0;transform:translateY(16px); } to { opacity:1;transform:translateY(0); } }
      #onboarding-card {
        background:var(--bg-card,#1e293b);
        border:1px solid var(--border-default,rgba(255,255,255,0.08));
        border-radius:18px;
        padding:36px 32px 28px;
        width:100%;
        max-width:520px;
        max-height:90vh;
        overflow-y:auto;
        box-shadow:0 24px 80px rgba(0,0,0,0.5);
        animation:ob-slide-up 0.3s ease;
        position:relative;
      }
      #onboarding-card .ob-emoji {
        font-size:40px;display:block;text-align:center;margin-bottom:14px;
      }
      #onboarding-card .ob-title {
        font-size:20px;font-weight:800;color:var(--text-primary,#f1f5f9);
        text-align:center;margin-bottom:5px;line-height:1.3;
      }
      #onboarding-card .ob-subtitle {
        font-size:12.5px;color:var(--text-muted,#64748b);
        text-align:center;margin-bottom:22px;
      }
      #onboarding-card .ob-body {
        font-size:12.5px;color:var(--text-secondary,#94a3b8);
        line-height:1.7;margin-bottom:24px;
      }
      #onboarding-card .ob-primary-btn {
        width:100%;padding:12px 20px;
        background:linear-gradient(135deg,#3b82f6,#6366f1);
        color:#fff;border:none;border-radius:10px;
        font-size:13px;font-weight:700;cursor:pointer;
        transition:opacity 0.15s;margin-bottom:10px;
        box-shadow:0 4px 16px rgba(99,102,241,0.3);
      }
      #onboarding-card .ob-primary-btn:hover { opacity:0.9; }
      #onboarding-card .ob-skip-btn {
        width:100%;padding:8px;background:none;border:none;
        color:var(--text-muted,#64748b);font-size:11.5px;cursor:pointer;
        transition:color 0.15s;
      }
      #onboarding-card .ob-skip-btn:hover { color:var(--text-secondary,#94a3b8); }
    </style>
    <div id="onboarding-card" role="dialog" aria-modal="true" aria-label="Setup wizard">
      ${progressHTML}
      <span class="ob-emoji">${step.emoji}</span>
      <div class="ob-title">${step.title}</div>
      <div class="ob-subtitle">${step.subtitle}</div>
      <div class="ob-body">${step.body}</div>
      <button class="ob-primary-btn" id="ob-primary-btn" onclick="_onboardingPrimary('${step.primaryAction}')">${step.primaryLabel}</button>
      ${step.skipLabel ? `<button class="ob-skip-btn" onclick="_onboardingSkip()">${step.skipLabel}</button>` : ''}
    </div>
  `;

  document.body.appendChild(overlay);
}

// ── Primary CTA handler ───────────────────────────────────────
function _onboardingPrimary(action) {
  const overlay = document.getElementById('onboarding-overlay');
  if (overlay) overlay.style.opacity = '0';

  setTimeout(() => {
    if (overlay) overlay.remove();

    switch (action) {
      case 'next':
        _advanceOnboarding();
        break;
      case 'niche':
        _advanceOnboarding();
        if (typeof navigate === 'function') navigate('niche-mapping');
        // Show next step automatically after a delay
        setTimeout(() => _renderOnboardingModal(_onboardingCurrentStep), 2500);
        break;
      case 'scoreboard':
        _advanceOnboarding();
        if (typeof navigate === 'function') navigate('lead-scoreboard');
        setTimeout(() => _renderOnboardingModal(_onboardingCurrentStep), 2500);
        break;
      case 'bookingLink': {
        // Save the booking link from the embedded input field
        const input = document.getElementById('ob-booking-link-input');
        const link  = input ? input.value.trim() : '';
        if (link && link.startsWith('http')) {
          // Persist to ICP_CONFIG + localStorage + Firestore
          if (typeof ICP_CONFIG !== 'undefined') ICP_CONFIG.bookingLink = link;
          try { localStorage.setItem('aum_booking_link', link); } catch(e) {}
          if (typeof saveBookingLink === 'function' && typeof currentUID !== 'undefined' && currentUID) {
            saveBookingLink(currentUID, link).catch(() => {});
          }
          if (typeof showToast === 'function') showToast('Booking link saved ✅', '📅');
        }
        _advanceOnboarding();
        break;
      }
      case 'outreach':
        _advanceOnboarding();
        if (typeof navigate === 'function') navigate('outreach-studio');
        setTimeout(() => _renderOnboardingModal(_onboardingCurrentStep), 2500);
        break;
      case 'finish':
        _completeOnboarding();
        if (typeof navigate === 'function') navigate('command-center');
        break;
    }
  }, 200);
}

// ── Skip handler ──────────────────────────────────────────────
function _onboardingSkip() {
  const overlay = document.getElementById('onboarding-overlay');
  if (overlay) {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 200);
  }
  _completeOnboarding();
}

// ── Advance to next step ──────────────────────────────────────
function _advanceOnboarding() {
  _onboardingCurrentStep = Math.min(_onboardingCurrentStep + 1, ONBOARDING_STEPS.length - 1);
  localStorage.setItem(ONBOARDING_STEP_KEY, String(_onboardingCurrentStep));
  if (_onboardingCurrentStep < ONBOARDING_STEPS.length - 1) {
    _renderOnboardingModal(_onboardingCurrentStep);
  }
}

// ── Mark complete ─────────────────────────────────────────────
function _completeOnboarding() {
  localStorage.setItem(ONBOARDING_KEY, 'true');
  localStorage.removeItem(ONBOARDING_STEP_KEY);
  if (typeof showToast === 'function') {
    showToast('Setup complete — you\'re ready to mine 💎', '🚀');
  }
}

// ── Dev / operator utility: reset onboarding (accessible via console) ──
function resetOnboarding() {
  localStorage.removeItem(ONBOARDING_KEY);
  localStorage.removeItem(ONBOARDING_STEP_KEY);
  if (typeof showToast === 'function') showToast('Onboarding reset — refresh to replay', '🔄');
}
