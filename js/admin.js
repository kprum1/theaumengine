// ==========================================
// THE AUM ENGINE — ADMIN / PRESENCE SYSTEM
// Phase C1 — Operator Dashboard  |  v=20260413c  (Pilot Funnel: lead_assignments fix)
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

  <!-- Phase C2 — Pilot Funnel Dashboard -->
  <div class="card" style="margin-bottom:20px">
    <div class="card-header">
      <div class="card-title">📊 Pilot Funnel</div>
      <div style="font-size:10px;color:var(--text-muted)" id="admin-kpi-updated">Loading…</div>
    </div>
    <div id="admin-kpi-section">
      <div class="agent-thinking"><div class="agent-dots"><span>●</span><span>●</span><span>●</span></div>Loading funnel data…</div>
    </div>
  </div>

  <!-- Master Leads Pool -->
  <div class="card" style="margin-bottom:20px">
    <div class="card-header" style="justify-content:space-between;flex-wrap:wrap;gap:10px">
      <div>
        <div class="card-title">🗂️ Master Leads Pool</div>
        <div style="font-size:10px;color:var(--text-muted)" id="admin-leads-meta">Loading all leads…</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <select id="admin-leads-niche-filter" onchange="renderMasterLeadsPool()"
          style="font-size:11px;padding:5px 10px;border-radius:8px;border:1px solid var(--border-default);background:var(--bg-card);color:var(--text-primary);cursor:pointer">
          <option value="">All Niches</option>
          <option value="yacht-owners">Yacht Owners</option>
          <option value="aircraft-owners">Aircraft Owners</option>
          <option value="business-owners">Business Owners</option>
          <option value="physicians">Physicians</option>
          <option value="ai-displaced-executives">AI-Displaced Execs</option>
          <option value="charity-board-members">Charity Board Members</option>
          <option value="c-suite-executives">C-Suite Executives</option>
          <option value="real-estate-developers">Real Estate Developers</option>
          <option value="law-partners">Law Partners</option>
          <option value="inheritance-recipients">Inheritance Recipients</option>
          <option value="pro-athletes">Pro Athletes</option>
        </select>
        <select id="admin-leads-status-filter" onchange="renderMasterLeadsPool()"
          style="font-size:11px;padding:5px 10px;border-radius:8px;border:1px solid var(--border-default);background:var(--bg-card);color:var(--text-primary);cursor:pointer">
          <option value="">All Status</option>
          <option value="unassigned">Unassigned</option>
          <option value="assigned">Assigned</option>
        </select>
        <button class="btn btn-secondary" style="font-size:11px;padding:5px 14px" onclick="renderMasterLeadsPool()">↻ Refresh</button>
      </div>
    </div>
    <div id="admin-leads-pool-section">
      <div class="agent-thinking"><div class="agent-dots"><span>●</span><span>●</span><span>●</span></div>Loading leads…</div>
    </div>
  </div>

  <!-- SLA Governance Alerts -->
  <div class="card" style="margin-bottom:20px">
    <div class="card-header" style="justify-content:space-between">
      <div>
        <div class="card-title">⚠️ SLA Alerts</div>
        <div style="font-size:10px;color:var(--text-muted)" id="admin-flags-meta">Checking governance flags…</div>
      </div>
      <button class="btn btn-secondary" style="font-size:11px;padding:5px 14px" onclick="renderGovernanceFlags(true)">↻ Refresh</button>
    </div>
    <div id="admin-flags-section">
      <div class="agent-thinking"><div class="agent-dots"><span>●</span><span>●</span><span>●</span></div>Loading SLA flags…</div>
    </div>
  </div>

  <!-- Outreach Send Analytics (legacy) -->
  <div class="card">
    <div class="card-header">
      <div class="card-title">✉️ Outreach Outcomes</div>
      <div style="font-size:10px;color:var(--text-muted)">All advisors · Last 200 sends</div>
    </div>
    <div id="admin-outcomes-section">
      <div class="agent-thinking"><div class="agent-dots"><span>●</span><span>●</span><span>●</span></div>Loading outcomes…</div>
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

  // Load funnel + outcomes + master leads + governance flags in parallel
  renderAdminKPIs();
  renderAdminOutcomes();
  renderMasterLeadsPool();
  renderGovernanceFlags();
}

// ── Phase C2: Pilot Funnel Dashboard ───────────────────────────────────────
async function renderAdminKPIs() {
  const el        = document.getElementById('admin-kpi-section');
  const updatedEl = document.getElementById('admin-kpi-updated');
  if (!el) return;

  try {
    const fdb  = firebase.firestore();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Pull funnel_events (last 30 days)
    const evSnap = await fdb.collection('funnel_events')
      .where('ts', '>=', since)
      .limit(3000).get();
    const events = evSnap.docs.map(d => d.data());

    // Pull lead_assignments (Sprint 4 canonical — replaced stale al_assignments query)
    let assigns = [];
    try {
      const aSnap = await fdb.collection('lead_assignments')
        .where('assignedAt', '>=', since)
        .limit(2000).get();
      assigns = aSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch(e) {}

    // Pull presence for advisor names
    const presSnap = await fdb.collection('operator_presence').get();
    const nameMap  = {};
    presSnap.docs.forEach(d => {
      const p = d.data();
      nameMap[d.id] = p.displayName || p.email || d.id.slice(0,8);
    });

    // ── Aggregate per advisor ─────────────────────────────────
    const adv = {};
    const ensure = uid => {
      if (!adv[uid]) adv[uid] = {
        uid, name: nameMap[uid] || uid.slice(0,10),
        assigned:0, viewed:0, drafted:0, sent:0, replied:0, meetings:0, sla:0,
      };
    };

    assigns.forEach(a => {
      // lead_assignments uses ownerUid (canonical — Sprint 4 unified)
      const uid = a.ownerUid || a.advisorUid;
      if (!uid) return;
      ensure(uid);
      adv[uid].assigned++;
      const age = (Date.now() - new Date(a.assignedAt || a.createdAt || Date.now()).getTime()) / 86400000;
      if ((a.status === 'New' || a.status === 'new') && age > 7) adv[uid].sla++;
    });

    // funnel_events uses advisorUid (written by funnel_tracker.js)
    events.forEach(e => {
      const uid = e.advisorUid;
      if (!uid) return;
      ensure(uid);
      if (e.event === 'lead_viewed')      adv[uid].viewed++;
      if (e.event === 'outreach_drafted') adv[uid].drafted++;
      if (e.event === 'outreach_sent')    adv[uid].sent++;
      if (e.event === 'reply_logged')     adv[uid].replied++;
      if (e.event === 'meeting_booked')   adv[uid].meetings++;
    });

    const rows   = Object.values(adv).sort((a,b) => b.meetings - a.meetings || b.sent - a.sent);
    const totals = rows.reduce((t,a) => {
      t.assigned += a.assigned; t.viewed  += a.viewed;  t.drafted  += a.drafted;
      t.sent += a.sent; t.replied += a.replied; t.meetings += a.meetings; t.sla += a.sla;
      return t;
    }, {assigned:0,viewed:0,drafted:0,sent:0,replied:0,meetings:0,sla:0});

    if (updatedEl) updatedEl.textContent = `Updated ${new Date().toLocaleTimeString()}`;

    // ── Funnel bar helper ─────────────────────────────────────
    const pct  = (n, d) => d ? Math.round(n/d*100) : 0;
    const fBar = (label, n, denom, color, icon) => {
      const p = pct(n, denom);
      return `
      <div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="font-size:11px;color:var(--text-secondary);font-weight:600">${icon} ${label}</span>
          <span style="font-size:11px;font-weight:800;color:${color}">${n.toLocaleString()} <span style="font-size:9px;color:var(--text-muted);font-weight:400">${denom !== n ? `(${p}%)` : ''}</span></span>
        </div>
        <div style="height:5px;border-radius:3px;background:var(--border-subtle)">
          <div style="height:5px;border-radius:3px;background:${color};width:${Math.max(p,denom?0:0)}%;transition:width 0.6s ease"></div>
        </div>
      </div>`;
    };

    // ── Per-advisor rows ──────────────────────────────────────
    const medal = ['🥇','🥈','🥉'];
    const advRows = rows.map((a, i) => {
      const slaFlag = a.sla > 0 ? `<span style="color:var(--amber);font-size:10px;font-weight:700"> ⚠️${a.sla}</span>` : '';
      return `
      <tr style="border-bottom:1px solid var(--border-subtle)">
        <td style="padding:9px 14px;font-size:12px;font-weight:700;color:var(--text-primary)">
          ${i < 3 ? medal[i] + ' ' : ''}${a.name}${slaFlag}
        </td>
        <td style="padding:9px 14px;font-size:12px;color:var(--text-secondary);text-align:center">${a.assigned}</td>
        <td style="padding:9px 14px;font-size:12px;color:var(--text-secondary);text-align:center">${a.sent}</td>
        <td style="padding:9px 14px;font-size:12px;color:var(--emerald);text-align:center;font-weight:700">${a.replied}</td>
        <td style="padding:9px 14px;font-size:13px;color:var(--blue);text-align:center;font-weight:900">${a.meetings}</td>
        <td style="padding:9px 14px;font-size:11px;color:var(--text-muted);text-align:center">${a.sent ? pct(a.replied,a.sent)+'%' : '—'}</td>
      </tr>`;
    }).join('');

    el.innerHTML = !rows.length ? `
      <div class="empty-state" style="padding:32px 0">
        <div class="empty-state-icon">📊</div>
        <div class="empty-state-title">No funnel data yet</div>
        <div class="empty-state-sub">Advisor activity will appear automatically once they start using the app.</div>
      </div>` : `

      <!-- Global funnel -->
      <div style="padding:16px 16px 8px;border-bottom:1px solid var(--border-subtle)">
        <div style="font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted);margin-bottom:14px">30-Day Pilot Funnel</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 28px">
          <div>
            ${fBar('Leads Assigned',  totals.assigned, totals.assigned, '#60a5fa', '📋')}
            ${fBar('Leads Viewed',    totals.viewed,   totals.assigned, '#818cf8', '👁')}
            ${fBar('Draft Generated', totals.drafted,  totals.assigned, '#a78bfa', '✍️')}
          </div>
          <div>
            ${fBar('Outreach Sent',   totals.sent,     totals.assigned, '#fb7185', '✉️')}
            ${fBar('Reply Received',  totals.replied,  totals.sent,     '#34d399', '💬')}
            ${fBar('Meeting Booked',  totals.meetings, totals.replied,  '#fbbf24', '📅')}
          </div>
        </div>
        ${totals.sla > 0 ? `<div style="margin-top:10px;padding:8px 12px;background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);border-radius:8px;font-size:11px;color:var(--amber);font-weight:600">⚠️ ${totals.sla} lead(s) not contacted in 7+ days — follow up needed</div>` : `<div style="margin-top:10px;padding:8px 12px;background:rgba(52,211,153,0.06);border-radius:8px;font-size:11px;color:var(--emerald);font-weight:600">✅ All leads contacted within SLA window</div>`}
      </div>

      <!-- Per-advisor scorecard -->
      <div style="padding:14px">
        <div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px">Advisor Scorecard</div>
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="border-bottom:1px solid var(--border-subtle)">
              <th style="padding:4px 14px;text-align:left;font-size:9px;color:var(--text-muted)">Advisor</th>
              <th style="padding:4px 14px;text-align:center;font-size:9px;color:var(--text-muted)">Assigned</th>
              <th style="padding:4px 14px;text-align:center;font-size:9px;color:var(--text-muted)">Sent</th>
              <th style="padding:4px 14px;text-align:center;font-size:9px;color:var(--emerald)">Replies</th>
              <th style="padding:4px 14px;text-align:center;font-size:9px;color:var(--blue)">Meetings</th>
              <th style="padding:4px 14px;text-align:center;font-size:9px;color:var(--text-muted)">Rate</th>
            </tr>
          </thead>
          <tbody>${advRows}</tbody>
        </table>
      </div>`;

  } catch(e) {
    const el2 = document.getElementById('admin-kpi-section');
    if (el2) el2.innerHTML = `<div class="empty-state" style="padding:24px"><div class="empty-state-icon">⚠️</div><div class="empty-state-title">Could not load funnel data</div><div class="empty-state-sub">${e.message}</div></div>`;
  }
}

// ── Legacy Outreach Outcomes (send analytics) ──────────────────────────────
async function renderAdminOutcomes() {
  const el = document.getElementById('admin-outcomes-section');
  if (!el) return;

  const outcomes = typeof loadOperatorOutcomes === 'function'
    ? await loadOperatorOutcomes(200) : [];

  if (!outcomes.length) {
    el.innerHTML = `
      <div class="empty-state" style="padding:32px 0">
        <div class="empty-state-icon">📬</div>
        <div class="empty-state-title">No send data yet</div>
        <div class="empty-state-sub">Data appears here as advisors click Send Now in Outreach Studio.</div>
      </div>`;
    return;
  }

  const total    = outcomes.length;
  const replied  = outcomes.filter(o => ['reply','positive','meeting'].includes(o.outcome)).length;
  const meetings = outcomes.filter(o => o.outcome === 'meeting').length;
  const replyRate = total ? Math.round(replied / total * 100) : 0;
  const byCh = {};
  outcomes.forEach(o => { const c = o.channel || 'email'; byCh[c] = (byCh[c]||0)+1; });
  const byVar = { A:0, B:0, C:0 };
  outcomes.forEach(o => { if (o.variantChosen && byVar[o.variantChosen] !== undefined) byVar[o.variantChosen]++; });
  const chBar = (label, n, color) => {
    const p = total ? Math.round(n/total*100) : 0;
    return `<div style="margin-bottom:6px"><div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px"><span style="color:var(--text-secondary)">${label}</span><span style="color:var(--text-muted)">${n} (${p}%)</span></div><div style="height:4px;border-radius:2px;background:var(--border-subtle)"><div style="height:4px;border-radius:2px;background:${color};width:${p}%"></div></div></div>`;
  };

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:16px 14px;border-bottom:1px solid var(--border-subtle)">
      <div style="text-align:center"><div style="font-size:26px;font-weight:900;color:var(--blue)">${total}</div><div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-top:3px">Total Sends</div></div>
      <div style="text-align:center"><div style="font-size:26px;font-weight:900;color:var(--emerald)">${replyRate}%</div><div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-top:3px">Reply Rate</div></div>
      <div style="text-align:center"><div style="font-size:26px;font-weight:900;color:var(--amber)">${meetings}</div><div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-top:3px">Meetings</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;padding:14px">
      <div style="padding-right:14px;border-right:1px solid var(--border-subtle)">
        <div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px">Channel Split</div>
        ${chBar('✉️ Email', byCh.email||0, 'var(--blue)')}
        ${chBar('📞 Call', byCh.call||0, 'var(--emerald)')}
        ${chBar('💼 LinkedIn', byCh.linkedin||0, 'var(--violet)')}
        ${chBar('📣 Voicemail', byCh.voicemail||0, 'var(--amber)')}
      </div>
      <div style="padding-left:14px">
        <div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px">Variant Split</div>
        ${chBar('A — Direct', byVar.A, '#60a5fa')}
        ${chBar('B — Soft', byVar.B, '#a78bfa')}
        ${chBar('C — Insight-Led', byVar.C, '#34d399')}
      </div>
    </div>`;
}

// ── Master Leads Pool ─────────────────────────────────────────────────────
// Reads master_leads collection (operator-only). Supports niche + status filter.
let _masterLeadsCache = null;  // cache for filter re-renders without re-fetching

async function renderMasterLeadsPool() {
  const el      = document.getElementById('admin-leads-pool-section');
  const metaEl  = document.getElementById('admin-leads-meta');
  if (!el) return;

  const nicheFilter  = document.getElementById('admin-leads-niche-filter')?.value  || '';
  const statusFilter = document.getElementById('admin-leads-status-filter')?.value || '';

  // Only fetch from Firestore if cache is empty
  if (!_masterLeadsCache) {
    el.innerHTML = `<div class="agent-thinking"><div class="agent-dots"><span>●</span><span>●</span><span>●</span></div>Fetching master leads pool…</div>`;
    try {
      const db   = firebase.firestore();
      const snap = await db.collection('master_leads').orderBy('ingestedAt','desc').limit(500).get();

      // Also pull lead_assignments to build ownerUid lookup
      const laSnap = await db.collection('lead_assignments').get();
      const ownerMap = {}; // masterLeadId → ownerUid
      laSnap.docs.forEach(d => {
        const la = d.data();
        if (la.masterLeadId && la.ownerUid && la.ownershipStatus !== 'released') {
          ownerMap[la.masterLeadId] = la.ownerUid;
        }
      });

      // Advisor name map from operator_presence
      const presSnap = await db.collection('operator_presence').get();
      const nameMap  = {};
      presSnap.docs.forEach(d => {
        const p = d.data();
        nameMap[d.id] = p.displayName || p.email?.split('@')[0] || d.id.slice(0,8);
      });

      _masterLeadsCache = snap.docs.map(d => ({
        id: d.id,
        ownerName: ownerMap[d.id] ? (nameMap[ownerMap[d.id]] || ownerMap[d.id].slice(0,8)) : null,
        ...d.data(),
      }));
    } catch(e) {
      el.innerHTML = `<div class="empty-state" style="padding:24px"><div class="empty-state-icon">⚠️</div><div class="empty-state-title">Could not load leads pool</div><div class="empty-state-sub">${e.message}</div></div>`;
      return;
    }
  }

  // Apply filters client-side
  let leads = _masterLeadsCache;
  if (nicheFilter)  leads = leads.filter(l => (l.nicheId||'').toLowerCase() === nicheFilter);
  if (statusFilter) leads = leads.filter(l => (l.ownershipStatus||'unassigned') === statusFilter);

  if (metaEl) metaEl.textContent = `${leads.length} lead${leads.length !== 1 ? 's' : ''} · ${_masterLeadsCache.length} total in pool · Updated ${new Date().toLocaleTimeString()}`;

  if (!leads.length) {
    el.innerHTML = `<div class="empty-state" style="padding:32px 0"><div class="empty-state-icon">🗂️</div><div class="empty-state-title">No leads match filter</div></div>`;
    return;
  }

  // Niche badge colors
  const nicheColor = {
    'yacht-owners':            '#0ea5e9',
    'aircraft-owners':         '#8b5cf6',
    'business-owners':         '#3b82f6',
    'physicians':              '#10b981',
    'ai-displaced-executives': '#f59e0b',
    'charity-board-members':   '#ec4899',
    'c-suite-executives':      '#6366f1',
    'real-estate-developers':  '#f97316',
    'law-partners':            '#14b8a6',
    'inheritance-recipients':  '#a855f7',
    'pro-athletes':            '#f43f5e',
  };

  const rows = leads.map(l => {
    const assigned   = l.ownershipStatus === 'assigned';
    const color      = nicheColor[l.nicheId] || 'var(--text-muted)';
    const fitPct     = l.fitScore     ? Math.round(l.fitScore)     : (l.priorityScore ? Math.round(l.priorityScore) : 0);
    const timingPct  = l.timingScore  ? Math.round(l.timingScore)  : 0;
    const city_state = [l.city, l.state].filter(Boolean).join(', ') || '—';
    const niche_label = (l.niche || l.nicheId || '—').replace(/-/g,' ').replace(/\b\w/g, c => c.toUpperCase());

    const statusBadge = assigned
      ? `<span style="font-size:9.5px;font-weight:700;color:var(--emerald);background:rgba(52,211,153,0.1);padding:2px 8px;border-radius:10px">✅ Assigned → ${l.ownerName || 'advisor'}</span>`
      : `<span style="font-size:9.5px;font-weight:700;color:var(--amber);background:rgba(251,191,36,0.1);padding:2px 8px;border-radius:10px">⏳ Unassigned</span>`;

    const scoreBar = n => `<div style="display:inline-block;width:${Math.max(n,0)}px;height:4px;border-radius:2px;background:var(--blue);vertical-align:middle;max-width:50px"></div>`;

    return `
    <tr style="border-bottom:1px solid var(--border-subtle);transition:background .15s" onmouseover="this.style.background='rgba(96,165,250,0.04)'" onmouseout="this.style.background=''">
      <td style="padding:10px 14px">
        <div style="font-size:12.5px;font-weight:700;color:var(--text-primary)">${l.firstName || ''} ${l.lastName || ''}</div>
        <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px">${l.title || ''} ${l.company ? '· ' + l.company : ''}</div>
      </td>
      <td style="padding:10px 14px">
        <span style="font-size:10px;font-weight:700;color:${color};background:${color}18;padding:2px 8px;border-radius:10px">${niche_label}</span>
      </td>
      <td style="padding:10px 14px;font-size:11px;color:var(--text-secondary)">${city_state}</td>
      <td style="padding:10px 14px;font-size:11px;color:var(--text-secondary)">${l.estimatedAUM || '—'}</td>
      <td style="padding:10px 14px">
        <div style="display:flex;align-items:center;gap:6px">
          ${scoreBar(fitPct * 0.5)}
          <span style="font-size:11px;font-weight:700;color:var(--blue)">${fitPct}</span>
        </div>
      </td>
      <td style="padding:10px 14px">${statusBadge}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
  <table style="width:100%;border-collapse:collapse">
    <thead>
      <tr style="border-bottom:1px solid var(--border-subtle)">
        <th style="padding:8px 14px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted)">Lead</th>
        <th style="padding:8px 14px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted)">Niche</th>
        <th style="padding:8px 14px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted)">Location</th>
        <th style="padding:8px 14px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted)">Est. AUM</th>
        <th style="padding:8px 14px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--blue)">Fit Score</th>
        <th style="padding:8px 14px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted)">Assignment</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ── SLA Governance Flags ──────────────────────────────────────────────────
// Reads governance_flags where resolvedAt == null (active SLA breaches).
// forceRefresh=true clears the cache so Refresh button always re-fetches.
let _govFlagsCache = null;

async function renderGovernanceFlags(forceRefresh = false) {
  const el     = document.getElementById('admin-flags-section');
  const metaEl = document.getElementById('admin-flags-meta');
  if (!el) return;

  if (forceRefresh) _govFlagsCache = null;

  if (!_govFlagsCache) {
    el.innerHTML = `<div class="agent-thinking"><div class="agent-dots"><span>●</span><span>●</span><span>●</span></div>Reading governance flags…</div>`;
    try {
      const db   = firebase.firestore();
      // Firestore rules: operator-only read on governance_flags
      const snap = await db.collection('governance_flags')
        .orderBy('flaggedAt', 'desc')
        .limit(200)
        .get();

      // Advisor name lookup — pull BOTH operator_presence AND advisor_pool
      // operator_presence has email/displayName (set on login)
      // advisor_pool has firmName (set at provisioning) — more reliable for SLA table
      const [presSnap, poolSnap] = await Promise.all([
        db.collection('operator_presence').get(),
        db.collection('advisor_pool').get(),
      ]);
      const nameMap  = {};
      presSnap.docs.forEach(d => {
        const p = d.data();
        nameMap[d.id] = p.displayName || p.email?.split('@')[0] || d.id.slice(0,8);
      });
      // advisor_pool firmName wins over presence displayName
      poolSnap.docs.forEach(d => {
        const p = d.data();
        if (p.firmName) nameMap[d.id] = p.firmName;
      });

      _govFlagsCache = snap.docs.map(d => ({ id: d.id, ...d.data(), _nameMap: nameMap }));
    } catch(e) {
      el.innerHTML = `<div class="empty-state" style="padding:24px"><div class="empty-state-icon">⚠️</div><div class="empty-state-title">Could not load flags</div><div class="empty-state-sub">${e.message}</div></div>`;
      return;
    }
  }

  // Filter: only active (unresolved) flags
  const active     = _govFlagsCache.filter(f => !f.resolvedAt);
  const slaFlags   = active.filter(f => f.reason === 'sla_breach');
  const capFlags   = active.filter(f => f.reason === 'approaching_cap');
  const nameMap    = _govFlagsCache[0]?._nameMap || {};

  if (metaEl) {
    const total    = _govFlagsCache.length;
    const resolved = total - active.length;
    const parts = [];
    if (slaFlags.length)  parts.push(`⏰ ${slaFlags.length} SLA breach${slaFlags.length !== 1 ? 'es' : ''}`);
    if (capFlags.length)  parts.push(`⚡ ${capFlags.length} at-cap warning${capFlags.length !== 1 ? 's' : ''}`);
    metaEl.textContent = active.length === 0
      ? `✅ No active flags · ${resolved} resolved · Updated ${new Date().toLocaleTimeString()}`
      : `${parts.join(' · ')} · ${resolved} resolved · Updated ${new Date().toLocaleTimeString()}`;
  }

  if (!active.length) {
    el.innerHTML = `
      <div class="empty-state" style="padding:32px 0">
        <div class="empty-state-icon">✅</div>
        <div class="empty-state-title">No active governance flags</div>
        <div class="empty-state-sub">All leads within SLA window. All advisors below cap threshold. Governance runs every 24h.</div>
      </div>`;
    return;
  }

  // ── Shared helpers ────────────────────────────────────────────────────
  const makeResolveBtn = (id) => {
    const safeId = id.replace(/'/g, "\\'");
    return `<button
      id="resolve-btn-${id}"
      onclick="resolveGovernanceFlag('${safeId}')"
      style="font-size:10px;font-weight:700;padding:4px 10px;border-radius:8px;border:none;
             background:rgba(52,211,153,0.12);color:var(--emerald);cursor:pointer;
             transition:background .15s"
      onmouseover="this.style.background='rgba(52,211,153,0.24)'"
      onmouseout="this.style.background='rgba(52,211,153,0.12)'"
      title="Write resolvedAt to governance_flags/${id}">
      ✓ Resolve
    </button>`;
  };

  // ── SLA Breach rows (red ⏰) ───────────────────────────────────────
  const slaRows = slaFlags.map(f => {
    const advisor  = f.firmName || nameMap[f.ownerUid] || f.ownerUid?.slice(0,10) || '—';
    const age      = f.flaggedAt  ? _relativeTime(f.flaggedAt)  : '—';
    const assigned = f.assignedAt ? _relativeTime(f.assignedAt) : '—';
    return `
    <tr id="gov-flag-row-${f.id}" style="border-bottom:1px solid var(--border-subtle);transition:background .15s"
        onmouseover="this.style.background='rgba(251,113,133,0.04)'" onmouseout="this.style.background=''">
      <td style="padding:10px 14px">
        <div style="font-size:12px;font-weight:700;color:var(--text-primary)">${advisor}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${f.id?.slice(0,26) || '—'}…</div>
      </td>
      <td style="padding:10px 14px">
        <span style="font-size:10px;font-weight:700;color:#f87171;background:rgba(248,113,113,0.1);padding:2px 8px;border-radius:8px">⏰ SLA Breach</span>
      </td>
      <td style="padding:10px 14px;font-size:11px;color:var(--text-muted)">${assigned}</td>
      <td style="padding:10px 14px;font-size:11px;color:#f87171;font-weight:600">${age}</td>
      <td style="padding:10px 14px">${makeResolveBtn(f.id)}</td>
    </tr>`;
  }).join('');

  // ── Cap Warning rows (yellow ⚡) ───────────────────────────────────
  const capRows = capFlags.map(f => {
    const advisor  = f.firmName || nameMap[f.ownerUid] || f.ownerUid?.slice(0,10) || '—';
    const capLabel = f.totalActive != null ? `${f.totalActive}/${f.cap}` : '—';
    const pctLabel = f.pctFull    != null ? `${f.pctFull}%` : '—';
    const flaggedAgo = f.flaggedAt ? _relativeTime(f.flaggedAt) : '—';
    const policyBadge = f.capPolicy === 'soft'
      ? `<span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:6px;background:rgba(99,102,241,0.12);color:#818cf8">soft</span>`
      : `<span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:6px;background:rgba(251,113,133,0.12);color:#f87171">hard</span>`;
    return `
    <tr id="gov-flag-row-${f.id}" style="border-bottom:1px solid var(--border-subtle);transition:background .15s"
        onmouseover="this.style.background='rgba(251,191,36,0.04)'" onmouseout="this.style.background=''">
      <td style="padding:10px 14px">
        <div style="font-size:12px;font-weight:700;color:var(--text-primary)">${advisor} ${policyBadge}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${f.ownerUid?.slice(0,10) || '—'}…</div>
      </td>
      <td style="padding:10px 14px">
        <span style="font-size:10px;font-weight:700;color:var(--amber);background:rgba(251,191,36,0.1);padding:2px 8px;border-radius:8px">⚡ At-Cap Warning</span>
      </td>
      <td style="padding:10px 14px;font-size:11.5px;font-weight:700;color:var(--amber)">${capLabel} <span style="font-size:10px;font-weight:400;color:var(--text-muted)">(${pctLabel})</span></td>
      <td style="padding:10px 14px;font-size:11px;color:var(--text-muted)">${flaggedAgo}</td>
      <td style="padding:10px 14px">${makeResolveBtn(f.id)}</td>
    </tr>`;
  }).join('');

  // ── Shared Mark-All button (shown if ≥2 active flags total) ────────────
  const markAllBtn = active.length >= 2
    ? `<button onclick="resolveAllGovernanceFlags()" style="font-size:10px;font-weight:700;padding:4px 12px;border-radius:8px;border:none;background:rgba(52,211,153,0.12);color:var(--emerald);cursor:pointer;white-space:nowrap" title="Resolve all ${active.length} active flags at once">✓✓ Mark All Resolved</button>`
    : '';

  // ── SLA section (render only when there are SLA flags) ─────────────
  const slaSection = slaFlags.length ? `
  <div style="padding:8px 14px 4px;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#f87171;border-bottom:1px solid rgba(248,113,113,0.15);background:rgba(248,113,113,0.03)">⏰ SLA Breaches (${slaFlags.length})</div>
  <table style="width:100%;border-collapse:collapse">
    <thead><tr style="border-bottom:1px solid var(--border-subtle)">
      <th style="padding:7px 14px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted)">Advisor</th>
      <th style="padding:7px 14px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#f87171">Type</th>
      <th style="padding:7px 14px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted)">Assigned</th>
      <th style="padding:7px 14px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#f87171">Flagged</th>
      <th style="padding:7px 14px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--emerald)">Action</th>
    </tr></thead>
    <tbody>${slaRows}</tbody>
  </table>` : '';

  // ── Cap-warning section (render only when there are cap flags) ───────
  const capSection = capFlags.length ? `
  <div style="padding:8px 14px 4px;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--amber);border-top:1px solid var(--border-subtle);border-bottom:1px solid rgba(251,191,36,0.15);background:rgba(251,191,36,0.03)">⚡ At-Cap Warnings (${capFlags.length})</div>
  <table style="width:100%;border-collapse:collapse">
    <thead><tr style="border-bottom:1px solid var(--border-subtle)">
      <th style="padding:7px 14px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted)">Advisor</th>
      <th style="padding:7px 14px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--amber)">Type</th>
      <th style="padding:7px 14px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--amber)">Leads / Cap</th>
      <th style="padding:7px 14px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted)">Flagged</th>
      <th style="padding:7px 14px;text-align:left;font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--emerald)">Action</th>
    </tr></thead>
    <tbody>${capRows}</tbody>
  </table>` : '';

  el.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;border-bottom:1px solid var(--border-subtle);gap:12px;flex-wrap:wrap">
    <span style="font-size:11px;font-weight:600;color:var(--text-secondary)">
      ${slaFlags.length ? `<span style="color:#f87171">⏰ ${slaFlags.length} SLA breach${slaFlags.length !== 1 ? 'es' : ''}</span>` : ''}
      ${slaFlags.length && capFlags.length ? ' &nbsp;·&nbsp; ' : ''}
      ${capFlags.length ? `<span style="color:var(--amber)">⚡ ${capFlags.length} at-cap warning${capFlags.length !== 1 ? 's' : ''}</span>` : ''}
    </span>
    ${markAllBtn}
  </div>
  ${slaSection}
  ${capSection}`;
}

// ── Resolve Governance Flag (P1 — Mark Resolved) ─────────────────────────
// Writes resolvedAt + resolvedBy + resolution to governance_flags/{flagId}.
// Then clears the cache and re-renders the SLA Alerts card.
async function resolveGovernanceFlag(flagId) {
  const btn = document.getElementById(`resolve-btn-${flagId}`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Resolving…';
    btn.style.opacity = '0.6';
  }

  try {
    const db  = firebase.firestore();
    const uid = window._currentUser?.uid || 'operator';
    await db.collection('governance_flags').doc(flagId).update({
      resolvedAt:   new Date().toISOString(),
      resolvedBy:   window._currentUser?.email || 'operator',
      resolution:   'operator_resolved',
      resolvedByUid: uid,
    });

    // Animate row out
    const row = document.getElementById(`gov-flag-row-${flagId}`);
    if (row) {
      row.style.transition = 'opacity 0.3s, transform 0.3s';
      row.style.opacity = '0';
      row.style.transform = 'translateX(12px)';
      setTimeout(() => row.remove(), 320);
    }

    // Clear cache and re-render after animation
    setTimeout(() => {
      _govFlagsCache = null;
      renderGovernanceFlags(true);
    }, 380);

  } catch(e) {
    console.error('[admin.js] resolveGovernanceFlag failed:', e);
    if (btn) {
      btn.disabled = false;
      btn.textContent = '✗ Failed — retry';
      btn.style.background = 'rgba(251,113,133,0.15)';
      btn.style.color = 'var(--red, #f87171)';
      btn.style.opacity = '1';
    }
    alert(`Could not resolve flag:\n${e.message}`);
  }
}

// Bulk: resolve all currently active breaches in one pass
async function resolveAllGovernanceFlags() {
  if (!_govFlagsCache) return;
  const active = _govFlagsCache.filter(f => !f.resolvedAt);
  if (!active.length) return;
  if (!confirm(`Mark all ${active.length} active breach${active.length !== 1 ? 'es' : ''} as resolved?`)) return;

  // Disable all buttons immediately
  active.forEach(f => {
    const btn = document.getElementById(`resolve-btn-${f.id}`);
    if (btn) { btn.disabled = true; btn.textContent = 'Resolving…'; btn.style.opacity = '0.6'; }
  });

  try {
    const db  = firebase.firestore();
    const now = new Date().toISOString();
    const uid = window._currentUser?.uid   || 'operator';
    const email = window._currentUser?.email || 'operator';
    const batch = db.batch();
    active.forEach(f => {
      batch.update(db.collection('governance_flags').doc(f.id), {
        resolvedAt:    now,
        resolvedBy:    email,
        resolution:    'operator_resolved',
        resolvedByUid: uid,
      });
    });
    await batch.commit();
    _govFlagsCache = null;
    renderGovernanceFlags(true);
  } catch(e) {
    console.error('[admin.js] resolveAllGovernanceFlags failed:', e);
    alert(`Batch resolve failed:\n${e.message}`);
    _govFlagsCache = null;
    renderGovernanceFlags(true);
  }
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
