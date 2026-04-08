// ==========================================
// THE AUM ENGINE — ADMIN / PRESENCE SYSTEM
// Phase C1 — Operator Dashboard
// Visible ONLY when logged in as operator
// ==========================================

const OPERATOR_EMAIL = 'kosal@fin-tegration.com';

// ── Presence Config ────────────────────────────────────────────────────────
const PRESENCE_HEARTBEAT_MS = 90_000;   // update lastSeen every 90 seconds
const PRESENCE_ONLINE_CUTOFF_MS = 5 * 60_000; // "online" if seen < 5 min ago
let _presenceHeartbeatTimer = null;
let _presenceCleanedUp      = false;

// Page display names for the activity column
const PAGE_LABELS = {
  'command-center':  '📊 Command Center',
  'prospect-mine':   '⛏️ Prospect Mine',
  'lead-scoreboard': '📋 Scoreboard',
  'niche-mapping':   '🧭 Niche Mapping',
  'outreach-studio': '✍️ Outreach Studio',
  'nurture-booking': '📅 Nurture & Booking',
  'meeting-prep':    '🤝 Meeting Prep',
  'manager-console': '📈 Manager Console',
  'settings':        '⚙️ Settings',
  'admin-dashboard': '🛡️ Admin Dashboard',
};

// ── Write / Update Presence ────────────────────────────────────────────────
async function writePresence(uid, fields) {
  if (!uid) return;
  try {
    const db = firebase.firestore();
    await db.collection('operator_presence').doc(uid).set({
      uid,
      ...fields,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch(e) {
    // Non-blocking — presence failures must never disrupt the app
    console.warn('[admin.js] writePresence failed:', e.code || e.message);
  }
}

// Called by auth.js on login
async function initPresence(user) {
  if (!user) return;
  _presenceCleanedUp = false;
  await writePresence(user.uid, {
    email:       user.email,
    displayName: user.displayName || user.email.split('@')[0],
    status:      'online',
    lastSeen:    new Date().toISOString(),
    loginAt:     new Date().toISOString(),
    currentPage: 'command-center',
  });

  // Heartbeat — keeps lastSeen fresh while tab is open
  clearInterval(_presenceHeartbeatTimer);
  _presenceHeartbeatTimer = setInterval(async () => {
    await writePresence(user.uid, {
      status:   'online',
      lastSeen: new Date().toISOString(),
    });
  }, PRESENCE_HEARTBEAT_MS);

  // Best-effort cleanup on tab close (no guarantee, but works most of the time)
  window.addEventListener('beforeunload', () => clearPresence(user.uid));
}

// Called by auth.js on logout or navigate away
async function clearPresence(uid) {
  if (!uid || _presenceCleanedUp) return;
  _presenceCleanedUp = true;
  clearInterval(_presenceHeartbeatTimer);
  try {
    const db = firebase.firestore();
    await db.collection('operator_presence').doc(uid).set({
      status:   'offline',
      lastSeen: new Date().toISOString(),
    }, { merge: true });
  } catch(e) {
    console.warn('[admin.js] clearPresence failed:', e.code || e.message);
  }
}

// Called by navigate() in app.js on every page change
async function updatePresencePage(uid, page) {
  if (!uid) return;
  await writePresence(uid, {
    currentPage: page,
    lastSeen:    new Date().toISOString(),
  });
}

// ── Is Operator? ──────────────────────────────────────────────────────────
function isOperator(user) {
  return user && user.email === OPERATOR_EMAIL;
}

// ── Load All Presence (operator only) ────────────────────────────────────
async function loadAllPresence() {
  try {
    const db   = firebase.firestore();
    const snap = await db.collection('operator_presence')
      .orderBy('lastSeen', 'desc')
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) {
    console.warn('[admin.js] loadAllPresence failed:', e);
    return [];
  }
}

// ── Admin Dashboard UI ────────────────────────────────────────────────────
function pageAdminDashboard() {
  if (!isOperator(window._currentUser)) {
    return `<div class="page-header"><h1 class="page-title">Access Denied</h1></div>`;
  }
  return `
  <div class="page-header">
    <div>
      <div class="page-label">OPERATOR ONLY</div>
      <h1 class="page-title">🛡️ Admin Dashboard</h1>
      <p class="page-sub">Live advisor activity — refreshes every 30 seconds</p>
    </div>
    <button class="btn btn-secondary" onclick="renderAdminDashboard()" id="admin-refresh-btn">
      ↻ Refresh
    </button>
  </div>

  <!-- Live Sessions -->
  <div class="card" style="margin-bottom:20px">
    <div class="card-header">
      <div class="card-title">Live Sessions</div>
      <div id="admin-online-count" class="nav-badge" style="background:var(--emerald);font-size:11px;padding:3px 10px;border-radius:12px">— online</div>
    </div>
    <div id="admin-presence-table">
      <div class="empty-state">
        <div class="empty-state-icon">📡</div>
        <div class="empty-state-title">Loading sessions…</div>
      </div>
    </div>
  </div>

  <!-- Quick stats strip -->
  <div class="grid-3" style="gap:14px;margin-bottom:20px" id="admin-stats-strip">
    <div class="card" style="text-align:center">
      <div style="font-size:28px;font-weight:900;color:var(--blue)" id="admin-stat-total">—</div>
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-top:4px">Total Advisors</div>
    </div>
    <div class="card" style="text-align:center">
      <div style="font-size:28px;font-weight:900;color:var(--emerald)" id="admin-stat-online">—</div>
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-top:4px">Online Now</div>
    </div>
    <div class="card" style="text-align:center">
      <div style="font-size:28px;font-weight:900;color:var(--amber)" id="admin-stat-today">—</div>
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-top:4px">Active Today</div>
    </div>
  </div>

  <!-- Phase C2 — Outreach KPIs -->
  <div class="card" style="margin-bottom:20px">
    <div class="card-header">
      <div class="card-title">📊 Outreach Analytics</div>
      <div style="font-size:10px;color:var(--text-muted)">All advisors · Last 200 sends</div>
    </div>
    <div id="admin-kpi-section">
      <div class="agent-thinking"><div class="agent-dots"><span>●</span><span>●</span><span>●</span></div>Loading analytics…</div>
    </div>
  </div>`;
}

// Called after the admin page HTML is in the DOM
async function renderAdminDashboard() {
  const tableEl = document.getElementById('admin-presence-table');
  const countEl = document.getElementById('admin-online-count');
  if (!tableEl) return;

  tableEl.innerHTML = `<div class="agent-thinking"><div class="agent-dots"><span>●</span><span>●</span><span>●</span></div>Scanning sessions…</div>`;

  const sessions = await loadAllPresence();
  const now      = Date.now();

  // Classify
  const isOnline  = s => s.status === 'online' && (now - new Date(s.lastSeen).getTime()) < PRESENCE_ONLINE_CUTOFF_MS;
  const isToday   = s => s.lastSeen && new Date(s.lastSeen).toDateString() === new Date().toDateString();
  const onlineN   = sessions.filter(isOnline).length;
  const todayN    = sessions.filter(isToday).length;

  // Stats strip
  const statTotal  = document.getElementById('admin-stat-total');
  const statOnline = document.getElementById('admin-stat-online');
  const statToday  = document.getElementById('admin-stat-today');
  if (statTotal)  statTotal.textContent  = sessions.length;
  if (statOnline) statOnline.textContent = onlineN;
  if (statToday)  statToday.textContent  = todayN;
  if (countEl)    countEl.textContent    = `${onlineN} online`;

  if (!sessions.length) {
    tableEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📡</div><div class="empty-state-title">No sessions found</div><div class="empty-state-sub">Advisors will appear here once they log in.</div></div>`;
    return;
  }

  // Build table rows
  const rows = sessions.map(s => {
    const online   = isOnline(s);
    const lastSeen = _relativeTime(s.lastSeen);
    const page     = PAGE_LABELS[s.currentPage] || s.currentPage || '—';
    const name     = s.displayName || s.email;
    const dot      = online
      ? `<span style="width:8px;height:8px;border-radius:50%;background:var(--emerald);display:inline-block;box-shadow:0 0 6px rgba(52,211,153,0.7);flex-shrink:0"></span>`
      : `<span style="width:8px;height:8px;border-radius:50%;background:var(--border-default);display:inline-block;flex-shrink:0"></span>`;
    const statusLabel = online ? '<span style="color:var(--emerald);font-weight:700;font-size:10px">ONLINE</span>' : `<span style="color:var(--text-muted);font-size:10px">${lastSeen}</span>`;

    return `
    <tr style="border-bottom:1px solid var(--border-subtle)">
      <td style="padding:12px 14px">
        <div style="display:flex;align-items:center;gap:8px">
          ${dot}
          <div>
            <div style="font-size:12.5px;font-weight:700;color:var(--text-primary)">${name}</div>
            <div style="font-size:10.5px;color:var(--text-muted)">${s.email}</div>
          </div>
        </div>
      </td>
      <td style="padding:12px 14px;font-size:11.5px;color:var(--text-secondary)">${page}</td>
      <td style="padding:12px 14px">${statusLabel}</td>
      <td style="padding:12px 14px;font-size:10.5px;color:var(--text-muted)">${s.loginAt ? _relativeTime(s.loginAt) : '—'}</td>
    </tr>`;
  }).join('');

  tableEl.innerHTML = `
  <table style="width:100%;border-collapse:collapse">
    <thead>
      <tr style="border-bottom:1px solid var(--border-subtle)">
        <th style="padding:8px 14px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted)">Advisor</th>
        <th style="padding:8px 14px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted)">Current Page</th>
        <th style="padding:8px 14px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted)">Status</th>
        <th style="padding:8px 14px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted)">Session Started</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;

  // Auto-refresh every 30s while on the page
  setTimeout(() => {
    if (document.getElementById('admin-presence-table')) {
      renderAdminDashboard();
    }
  }, 30_000);

  // Load KPI section in parallel
  renderAdminKPIs();
}

// ── Phase C2: Outreach Analytics ─────────────────────────────────────────
async function renderAdminKPIs() {
  const el = document.getElementById('admin-kpi-section');
  if (!el) return;

  const outcomes = typeof loadOperatorOutcomes === 'function'
    ? await loadOperatorOutcomes(200)
    : [];

  if (!outcomes.length) {
    el.innerHTML = `
      <div class="empty-state" style="padding:32px 0">
        <div class="empty-state-icon">📬</div>
        <div class="empty-state-title">No outreach data yet</div>
        <div class="empty-state-sub">Data appears here as advisors click Send Now in Outreach Studio.</div>
      </div>`;
    return;
  }

  // ── Aggregate ────────────────────────────────────────────────
  const total    = outcomes.length;
  const replied  = outcomes.filter(o => ['reply','positive','meeting'].includes(o.outcome)).length;
  const meetings = outcomes.filter(o => o.outcome === 'meeting').length;
  const replyRate = total ? Math.round(replied / total * 100) : 0;

  // Channel breakdown
  const byCh = {};
  outcomes.forEach(o => { const c = o.channel || 'email'; byCh[c] = (byCh[c]||0)+1; });

  // Variant breakdown
  const byVar = { A:0, B:0, C:0 };
  outcomes.forEach(o => { if (o.variantChosen && byVar[o.variantChosen] !== undefined) byVar[o.variantChosen]++; });

  // Top angle
  const byAngle = {};
  outcomes.forEach(o => { if (o.angle) byAngle[o.angle] = (byAngle[o.angle]||0)+1; });
  const topAngle = Object.entries(byAngle).sort((a,b)=>b[1]-a[1])[0];

  // Per-advisor
  const byAdvisor = {};
  outcomes.forEach(o => {
    if (!byAdvisor[o.advisorUid]) byAdvisor[o.advisorUid] = { uid: o.advisorUid, sends:0, replies:0 };
    byAdvisor[o.advisorUid].sends++;
    if (['reply','positive','meeting'].includes(o.outcome)) byAdvisor[o.advisorUid].replies++;
  });
  const advisorRows = Object.values(byAdvisor)
    .sort((a,b) => b.sends - a.sends)
    .map(a => {
      const rate = a.sends ? Math.round(a.replies/a.sends*100) : 0;
      return `<tr style="border-bottom:1px solid var(--border-subtle)">
        <td style="padding:8px 14px;font-size:11px;color:var(--text-secondary)">${a.uid.slice(0,8)}…</td>
        <td style="padding:8px 14px;font-size:12px;font-weight:700;color:var(--text-primary)">${a.sends}</td>
        <td style="padding:8px 14px;font-size:12px;color:var(--emerald)">${a.replies}</td>
        <td style="padding:8px 14px;font-size:12px;color:var(--blue)">${rate}%</td>
      </tr>`;
    }).join('');

  // Channel bars helper
  const chBar = (label, n, color) => {
    const pct = total ? Math.round(n/total*100) : 0;
    return `<div style="margin-bottom:6px">
      <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px">
        <span style="color:var(--text-secondary)">${label}</span>
        <span style="color:var(--text-muted)">${n} (${pct}%)</span>
      </div>
      <div style="height:4px;border-radius:2px;background:var(--border-subtle)">
        <div style="height:4px;border-radius:2px;background:${color};width:${pct}%"></div>
      </div>
    </div>`;
  };

  el.innerHTML = `
    <!-- Top KPI row -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;padding:16px 14px;border-bottom:1px solid var(--border-subtle)">
      <div style="text-align:center">
        <div style="font-size:26px;font-weight:900;color:var(--blue)">${total}</div>
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-top:3px">Total Sends</div>
      </div>
      <div style="text-align:center">
        <div style="font-size:26px;font-weight:900;color:var(--emerald)">${replyRate}%</div>
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-top:3px">Reply Rate</div>
      </div>
      <div style="text-align:center">
        <div style="font-size:26px;font-weight:900;color:var(--amber)">${meetings}</div>
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-top:3px">Meetings</div>
      </div>
      <div style="text-align:center">
        <div style="font-size:26px;font-weight:900;color:var(--violet)">${topAngle ? topAngle[0] : '—'}</div>
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-top:3px">Top Angle</div>
      </div>
    </div>

    <!-- Channel + Variant row -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:1px solid var(--border-subtle)">
      <div style="padding:14px;border-right:1px solid var(--border-subtle)">
        <div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px">Channel Split</div>
        ${chBar('📧 Email',     byCh.email     ||0, 'var(--blue)')}
        ${chBar('📞 Call',      byCh.call      ||0, 'var(--emerald)')}
        ${chBar('💼 LinkedIn',  byCh.linkedin  ||0, 'var(--violet)')}
        ${chBar('📣 Voicemail', byCh.voicemail ||0, 'var(--amber)')}
      </div>
      <div style="padding:14px">
        <div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px">Variant Split</div>
        ${chBar('A — Direct',      byVar.A, '#60a5fa')}
        ${chBar('B — Soft',        byVar.B, '#a78bfa')}
        ${chBar('C — Insight-Led', byVar.C, '#34d399')}
      </div>
    </div>

    <!-- Per-advisor table -->
    <div style="padding:14px">
      <div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px">By Advisor</div>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="border-bottom:1px solid var(--border-subtle)">
            <th style="padding:4px 14px;text-align:left;font-size:9px;color:var(--text-muted)">Advisor</th>
            <th style="padding:4px 14px;text-align:left;font-size:9px;color:var(--text-muted)">Sends</th>
            <th style="padding:4px 14px;text-align:left;font-size:9px;color:var(--text-muted)">Replies</th>
            <th style="padding:4px 14px;text-align:left;font-size:9px;color:var(--text-muted)">Rate</th>
          </tr>
        </thead>
        <tbody>${advisorRows || '<tr><td colspan="4" style="padding:12px 14px;color:var(--text-muted);font-size:11px">No outcome data yet</td></tr>'}</tbody>
      </table>
    </div>`;
}

// ── Time helper ────────────────────────────────────────────────────────────
function _relativeTime(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m    = Math.floor(diff / 60_000);
  const h    = Math.floor(m / 60);
  const d    = Math.floor(h / 24);
  if (diff < 60_000)  return 'Just now';
  if (m < 60)         return `${m}m ago`;
  if (h < 24)         return `${h}h ago`;
  return `${d}d ago`;
}
