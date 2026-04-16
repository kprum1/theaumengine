// ============================================================
// THE AUM ENGINE — SECURITY SENTINEL MODULE v1.0 (Sprint 1)
// js/sentinel.js
//
// Self-contained module. No imports from existing AUM Engine
// files. All Firestore reads are try/catch guarded. If this
// file fails to load, pageSentinelDashboard() in pages.js
// renders a graceful fallback. Kill switch lives in Firestore:
// sentinel_config/default.sentinel_kill_switch = true.
//
// Loaded in index.html BEFORE app.js.
// window.SENTINEL_ENABLED is set by loadSentinelConfig().
// ============================================================

'use strict';

// ── Constants ────────────────────────────────────────────────
const SENTINEL_ORG_ID   = 'org_theaumengine_internal';
const SENTINEL_CONFIG_ID = 'default';

// ── Internal state ───────────────────────────────────────────
let _sentinelTab = 'overview'; // 'overview' | 'findings' | 'tasks'

// ── Feature flag loader ──────────────────────────────────────
// Called from initWithUserData in app.js (non-blocking).
// Sets window.SENTINEL_ENABLED so auth.js can reveal the nav.
async function loadSentinelConfig() {
  try {
    const db = _getSentinelDB();
    if (!db) return;
    const snap = await db.collection('sentinel_config').doc(SENTINEL_CONFIG_ID).get();
    if (!snap.exists) {
      window.SENTINEL_ENABLED = false;
      return;
    }
    const cfg = snap.data();
    window.SENTINEL_CONFIG   = cfg;
    window.SENTINEL_ENABLED  = cfg.sentinel_enabled === true && cfg.sentinel_kill_switch !== true;
    console.info('[Sentinel] Config loaded. Enabled:', window.SENTINEL_ENABLED);
  } catch(e) {
    window.SENTINEL_ENABLED = false;
    console.warn('[Sentinel] Config load failed (non-blocking):', e.message);
  }
}

// ── DB helper (uses existing Firebase compat instance) ───────
function _getSentinelDB() {
  // firebase is loaded via CDN compat in index.html
  // firebase.app() returns the default initialized app
  try {
    return firebase.firestore();
  } catch(e) {
    console.warn('[Sentinel] Firestore not available:', e.message);
    return null;
  }
}

// ── Data loaders ─────────────────────────────────────────────
async function loadSentinelOrg(orgId) {
  try {
    const db  = _getSentinelDB();
    if (!db) return _emptySentinelOrg(orgId);
    const doc = await db.collection('sentinel_orgs').doc(orgId).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : _emptySentinelOrg(orgId);
  } catch(e) {
    console.warn('[Sentinel] loadSentinelOrg failed:', e.message);
    return _emptySentinelOrg(orgId);
  }
}

async function loadSentinelFindings(orgId) {
  try {
    const db   = _getSentinelDB();
    if (!db) return [];
    const snap = await db.collection('sentinel_findings')
      .where('org_id', '==', orgId)
      .where('status', '==', 'open')
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) {
    console.warn('[Sentinel] loadSentinelFindings failed:', e.message);
    return [];
  }
}

async function loadSentinelTasks(orgId) {
  try {
    const db   = _getSentinelDB();
    if (!db) return [];
    const snap = await db.collection('sentinel_tasks')
      .where('org_id', '==', orgId)
      .where('status', 'in', ['open', 'in_progress'])
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) {
    console.warn('[Sentinel] loadSentinelTasks failed:', e.message);
    return [];
  }
}

async function loadSentinelAssets(orgId) {
  try {
    const db   = _getSentinelDB();
    if (!db) return [];
    const snap = await db.collection('sentinel_assets')
      .where('org_id', '==', orgId)
      .where('status', '==', 'active')
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) {
    console.warn('[Sentinel] loadSentinelAssets failed:', e.message);
    return [];
  }
}

// ── Empty state fallbacks ────────────────────────────────────
function _emptySentinelOrg(orgId) {
  return {
    id:           orgId,
    org_name:     'The AUM Engine',
    risk_score:   null,
    risk_level:   null,
    last_scan_at: null,
  };
}

// ── Risk score helpers ───────────────────────────────────────
function _scoreColor(score) {
  if (score === null || score === undefined) return 'var(--text-muted)';
  if (score >= 85) return '#34d399';  // emerald — strong
  if (score >= 70) return '#fbbf24';  // amber   — moderate
  if (score >= 50) return '#f97316';  // orange  — elevated
  return '#f43f5e';                   // rose    — high risk
}

function _scoreBand(score) {
  if (score === null || score === undefined) return { label: 'Not Scored', color: 'var(--text-muted)' };
  if (score >= 85) return { label: 'Strong',   color: '#34d399' };
  if (score >= 70) return { label: 'Moderate', color: '#fbbf24' };
  if (score >= 50) return { label: 'Elevated', color: '#f97316' };
  return { label: 'High Risk', color: '#f43f5e' };
}

function _severityColor(sev) {
  const m = { high:'#f43f5e', medium:'#fbbf24', low:'#34d399', info:'#60a5fa' };
  return m[(sev||'').toLowerCase()] || 'var(--text-muted)';
}

function _severityIcon(sev) {
  const m = { high:'🔴', medium:'🟡', low:'🟢', info:'🔵' };
  return m[(sev||'').toLowerCase()] || '⚪';
}

function _priorityColor(pri) {
  const m = { high:'#f43f5e', medium:'#fbbf24', low:'#34d399' };
  return m[(pri||'').toLowerCase()] || 'var(--text-muted)';
}

function _statusBadge(status) {
  const styles = {
    open:        'background:rgba(244,63,94,0.12);color:#f43f5e',
    in_progress: 'background:rgba(251,191,36,0.12);color:#fbbf24',
    resolved:    'background:rgba(52,211,153,0.12);color:#34d399',
    closed:      'background:rgba(100,116,139,0.12);color:#64748b',
  };
  const labels = { open:'Open', in_progress:'In Progress', resolved:'Resolved', closed:'Closed' };
  const s = (status||'open').toLowerCase();
  return `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;${styles[s]||styles.open}">${labels[s]||status}</span>`;
}

function _relativeDate(isoStr) {
  if (!isoStr) return '—';
  try {
    const diff = Date.now() - new Date(isoStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return '1d ago';
    if (days < 30)  return `${days}d ago`;
    return new Date(isoStr).toLocaleDateString('en-US', { month:'short', day:'numeric' });
  } catch { return '—'; }
}

// ── Tab switcher ─────────────────────────────────────────────
function sentinelSwitchTab(tab) {
  _sentinelTab = tab;
  document.querySelectorAll('.sentinel-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  document.querySelectorAll('.sentinel-tab-panel').forEach(el => {
    el.style.display = el.dataset.panel === tab ? '' : 'none';
  });
}
window.sentinelSwitchTab = sentinelSwitchTab;

// ── Main page renderer ────────────────────────────────────────
// Called by pageSentinelDashboard() in pages.js.
// Returns an HTML string synchronously (with loading states),
// then re-renders with real data after async loads complete.
function renderSentinelPage() {
  // Kill switch check
  const cfg = window.SENTINEL_CONFIG || {};
  if (cfg.sentinel_kill_switch === true) {
    return _renderKillSwitchState();
  }

  // Render shell immediately, then hydrate async
  const shell = _renderShell();
  // Kick off async hydration after DOM is ready
  requestAnimationFrame(() => _hydrateSentinelDashboard());
  return shell;
}
window.renderSentinelPage = renderSentinelPage;

// Async hydration — loads real data and patches the DOM
async function _hydrateSentinelDashboard() {
  const container = document.getElementById('sentinel-dashboard-root');
  if (!container) return;

  try {
    const [org, findings, tasks] = await Promise.all([
      loadSentinelOrg(SENTINEL_ORG_ID),
      loadSentinelFindings(SENTINEL_ORG_ID),
      loadSentinelTasks(SENTINEL_ORG_ID),
    ]);

    const overdue = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date());
    const critical = findings.filter(f => (f.severity||'').toLowerCase() === 'high');

    // Patch score ring
    const scoreEl = document.getElementById('sentinel-score-ring');
    if (scoreEl && org.risk_score !== null) {
      const band = _scoreBand(org.risk_score);
      scoreEl.innerHTML = `
        <div style="text-align:center">
          <div style="font-size:52px;font-weight:900;color:${band.color};line-height:1;letter-spacing:-2px">${org.risk_score}</div>
          <div style="font-size:11px;font-weight:700;color:${band.color};text-transform:uppercase;letter-spacing:0.08em;margin-top:4px">${band.label}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:6px">Security Score</div>
        </div>`;
    }

    // Patch KPI strip
    const kpiEl = document.getElementById('sentinel-kpi-strip');
    if (kpiEl) {
      kpiEl.innerHTML = _renderKPIStrip(findings.length, tasks.length, overdue.length, critical.length);
    }

    // Patch Overview tab
    const overviewEl = document.getElementById('sentinel-panel-overview');
    if (overviewEl) {
      overviewEl.innerHTML = _renderOverviewContent(org, findings, tasks, overdue);
    }

    // Patch Findings tab
    const findingsEl = document.getElementById('sentinel-panel-findings');
    if (findingsEl) {
      findingsEl.innerHTML = _renderFindingsContent(findings);
    }

    // Patch Tasks tab
    const tasksEl = document.getElementById('sentinel-panel-tasks');
    if (tasksEl) {
      tasksEl.innerHTML = _renderTasksContent(tasks, overdue);
    }

    // Update last scan timestamp
    const scanEl = document.getElementById('sentinel-last-scan');
    if (scanEl && org.last_scan_at) {
      scanEl.textContent = 'Last scan: ' + _relativeDate(org.last_scan_at);
    } else if (scanEl) {
      scanEl.textContent = 'Last scan: just now';
    }

    // ✅ Dismiss the loading message now that data is live
    const loadingEl = document.getElementById('sentinel-loading-msg');
    if (loadingEl) loadingEl.remove();

    console.info(`[Sentinel] Dashboard hydrated — ${findings.length} findings, ${tasks.length} tasks`);

  } catch(e) {
    console.warn('[Sentinel] Dashboard hydration failed:', e.message);
    if (container) {
      const errEl = document.getElementById('sentinel-loading-msg');
      if (errEl) errEl.innerHTML = '<span style="color:var(--rose)">⚠️ Failed to load Sentinel data. Check Firestore connection.</span>';
    }
  }
}

// ── Shell (rendered synchronously) ───────────────────────────
function _renderShell() {
  return `
  <div id="sentinel-dashboard-root" style="min-height:100%">
    <div class="page-header">
      <div class="page-header-left">
        <div class="page-title">🛡️ Security Sentinel</div>
        <div class="page-subtitle">Trust &amp; exposure monitoring — <span style="font-size:10px;padding:2px 8px;background:rgba(99,102,241,0.12);color:var(--violet);border-radius:20px;font-weight:700">Internal Only</span></div>
      </div>
      <div class="page-actions">
        <span id="sentinel-last-scan" style="font-size:11px;color:var(--text-muted);padding:6px 12px">Loading…</span>
        <button class="btn btn-secondary" onclick="window.sentinelRunCheck && sentinelRunCheck()" style="opacity:0.6;cursor:not-allowed" disabled title="Live checks available in Sprint 2">Run Check</button>
      </div>
    </div>

    <!-- What is Security Sentinel — description banner -->
    <div style="border:1px solid rgba(99,102,241,0.2);border-radius:14px;background:linear-gradient(135deg,rgba(99,102,241,0.06),rgba(139,92,246,0.04));padding:20px 24px;margin-bottom:20px;position:relative;overflow:hidden">
      <!-- Background glow -->
      <div style="position:absolute;top:-30px;right:-30px;width:120px;height:120px;border-radius:50%;background:radial-gradient(circle,rgba(139,92,246,0.15),transparent 70%);pointer-events:none"></div>

      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:20px;flex-wrap:wrap">
        <!-- Left: what it is -->
        <div style="flex:2;min-width:260px">
          <div style="font-size:11px;font-weight:700;color:var(--violet);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px">What is Security Sentinel?</div>
          <div style="font-size:13.5px;font-weight:700;color:var(--text-primary);margin-bottom:8px;line-height:1.4">
            Your firm's always-on trust and exposure watchdog.
          </div>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.75">
            Security Sentinel monitors your advisory firm's digital footprint — domain health, email authentication, admin access, credential exposure, and vendor risk — and turns every finding into a scored, prioritized task your team can actually act on.
          </div>
        </div>

        <!-- Divider -->
        <div style="width:1px;background:rgba(99,102,241,0.2);align-self:stretch;flex-shrink:0;display:none" class="sentinel-divider"></div>

        <!-- Right: what it does -->
        <div style="flex:2;min-width:260px;padding-right:12px">
          <div style="font-size:11px;font-weight:700;color:var(--violet);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px">What it does</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px">
            ${[
              ['🔍','Scans DNS, SSL, and domain posture'],
              ['👤','Audits admin access and ownership gaps'],
              ['📧','Checks SPF, DKIM, and DMARC email auth'],
              ['🔑','Flags credential and config exposure'],
              ['📋','Generates prioritized remediation tasks'],
              ['📊','Tracks a live trust score (0–100)'],
            ].map(([icon, text]) => `
            <div style="display:flex;align-items:flex-start;gap:7px;padding:4px 0">
              <span style="font-size:13px;flex-shrink:0;margin-top:1px">${icon}</span>
              <span style="font-size:11.5px;color:var(--text-secondary);line-height:1.5">${text}</span>
            </div>`).join('')}
          </div>
        </div>
      </div>

      <!-- Mythos callout -->
      <div style="margin-top:16px;padding-top:14px;border-top:1px solid rgba(99,102,241,0.15);display:flex;align-items:center;gap:10px">
        <div style="width:6px;height:6px;border-radius:50%;background:var(--violet);box-shadow:0 0 8px var(--violet);animation:pulse 2s infinite;flex-shrink:0"></div>
        <span style="font-size:11.5px;color:var(--text-muted)">
          This dashboard is read-only intelligence. Active threat remediation, behavioral anomaly detection, and automated policy enforcement are coming in a future sprint via <strong style="color:var(--violet)">Mythos</strong> — the platform's active security layer.
        </span>
        <span style="margin-left:auto;font-size:9px;font-weight:700;padding:2px 8px;border-radius:20px;background:rgba(139,92,246,0.12);color:var(--violet);white-space:nowrap;flex-shrink:0" title="Mythos is the AUM Engine's active remediation engine — automated policy enforcement, anomaly detection, and zero-trust controls. Expected Sprint 3.">Mythos · Sprint 3</span>
      </div>
    </div>

    <!-- Score + KPI header -->
    <div style="display:flex;gap:16px;margin-bottom:20px;align-items:stretch">
      <!-- Score ring -->
      <div class="card" style="padding:28px 32px;display:flex;align-items:center;justify-content:center;min-width:160px">
        <div id="sentinel-score-ring">
          <div style="text-align:center">
            <div style="font-size:36px;color:var(--text-muted)">…</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:6px">Loading</div>
          </div>
        </div>
      </div>
      <!-- KPI cards -->
      <div id="sentinel-kpi-strip" style="flex:1;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;align-content:start">
        ${_renderKPIStrip('…','…','…','…')}
      </div>
    </div>

    <!-- Loading message (replaced by hydration) -->
    <div id="sentinel-loading-msg" style="font-size:12px;color:var(--text-muted);margin-bottom:12px;padding-left:2px">
      Loading security data…
    </div>

    <!-- Tab bar -->
    <div style="display:flex;gap:4px;margin-bottom:16px;border-bottom:1px solid var(--border-subtle);padding-bottom:0">
      ${[['overview','Overview'],['findings','Findings'],['tasks','Tasks']].map(([key,label]) => `
      <button class="sentinel-tab${key === _sentinelTab ? ' active' : ''}" data-tab="${key}"
        onclick="sentinelSwitchTab('${key}')"
        style="background:none;border:none;padding:8px 16px;font-size:12.5px;font-weight:600;
        cursor:pointer;font-family:inherit;color:${key === _sentinelTab ? 'var(--blue)' : 'var(--text-muted)'};
        border-bottom:2px solid ${key === _sentinelTab ? 'var(--blue)' : 'transparent'};
        margin-bottom:-1px;transition:all 0.15s ease">
        ${label}
      </button>`).join('')}
    </div>

    <!-- Tab panels -->
    <div id="sentinel-panel-overview" class="sentinel-tab-panel" data-panel="overview"
         style="display:${_sentinelTab === 'overview' ? '' : 'none'}">
      <div style="color:var(--text-muted);font-size:12px;padding:20px 0">Loading overview…</div>
    </div>
    <div id="sentinel-panel-findings" class="sentinel-tab-panel" data-panel="findings"
         style="display:${_sentinelTab === 'findings' ? '' : 'none'}">
      <div style="color:var(--text-muted);font-size:12px;padding:20px 0">Loading findings…</div>
    </div>
    <div id="sentinel-panel-tasks" class="sentinel-tab-panel" data-panel="tasks"
         style="display:${_sentinelTab === 'tasks' ? '' : 'none'}">
      <div style="color:var(--text-muted);font-size:12px;padding:20px 0">Loading tasks…</div>
    </div>
  </div>`;
}

// ── KPI strip ─────────────────────────────────────────────────
function _renderKPIStrip(findings, tasks, overdue, critical) {
  const kpis = [
    { label:'Open Findings',   value:findings, color:'#f43f5e', icon:'🔍' },
    { label:'Open Tasks',      value:tasks,    color:'#fbbf24', icon:'📋' },
    { label:'Overdue',         value:overdue,  color:'#f97316', icon:'⏰' },
    { label:'Critical Issues', value:critical, color:'#a78bfa', icon:'🚨' },
  ];
  return kpis.map(k => `
  <div class="card" style="padding:16px 18px">
    <div style="font-size:22px;margin-bottom:6px">${k.icon}</div>
    <div style="font-size:26px;font-weight:900;color:${k.color};line-height:1">${k.value}</div>
    <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.07em;margin-top:4px">${k.label}</div>
  </div>`).join('');
}

// ── Overview tab content ──────────────────────────────────────
function _renderOverviewContent(org, findings, tasks, overdue) {
  // Sort findings by severity: high → medium → low
  const severityOrder = { high:0, medium:1, low:2, info:3 };
  const sorted = [...findings].sort((a,b) =>
    (severityOrder[(a.severity||'').toLowerCase()]||3) -
    (severityOrder[(b.severity||'').toLowerCase()]||3)
  );

  const topRisks = sorted.slice(0, 5);
  const openTasks = tasks.filter(t => t.status === 'open' || t.status === 'in_progress').slice(0, 5);

  // Category groupings for exposure summary
  const exposure  = findings.filter(f => f.category === 'exposure');
  const ownership = findings.filter(f => f.category === 'ownership' || f.category === 'access');
  const config    = findings.filter(f => f.category === 'configuration');

  return `
  <div class="grid-2" style="gap:16px">
    <!-- Top Risks -->
    <div>
      <div class="section-header"><div class="section-title"><div class="section-title-dot" style="background:#f43f5e"></div>Top Risk Findings</div></div>
      ${topRisks.length === 0
        ? `<div class="card" style="text-align:center;padding:28px"><div style="font-size:28px;margin-bottom:8px">✅</div><div style="font-size:13px;font-weight:700;color:var(--text-primary)">No open findings</div><div style="font-size:11px;color:var(--text-muted);margin-top:4px">Security posture looks clean.</div></div>`
        : topRisks.map(f => `
      <div class="card" style="margin-bottom:8px;padding:14px 16px">
        <div style="display:flex;align-items:flex-start;gap:10px">
          <span style="font-size:16px;flex-shrink:0">${_severityIcon(f.severity)}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:12.5px;font-weight:700;color:var(--text-primary);margin-bottom:2px">${f.title || f.finding_type}</div>
            <div style="font-size:11px;color:var(--text-muted);line-height:1.5">${f.summary || ''}</div>
            ${f.recommended_action ? `<div style="font-size:10.5px;color:var(--blue);margin-top:6px;font-weight:600">→ ${f.recommended_action}</div>` : ''}
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:10px;font-weight:700;color:${_severityColor(f.severity)};text-transform:uppercase">${f.severity}</div>
            ${f.score_impact ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px">${f.score_impact > 0 ? '+' : ''}${f.score_impact} pts</div>` : ''}
          </div>
        </div>
      </div>`).join('')}
    </div>

    <!-- Task Queue + Exposure Summary -->
    <div>
      <div class="section-header"><div class="section-title"><div class="section-title-dot" style="background:#fbbf24"></div>Remediation Queue</div></div>
      ${openTasks.length === 0
        ? `<div class="card" style="text-align:center;padding:28px"><div style="font-size:28px;margin-bottom:8px">📋</div><div style="font-size:13px;font-weight:700;color:var(--text-primary)">No open tasks</div></div>`
        : openTasks.map(t => {
          const isOverdue = t.due_date && new Date(t.due_date) < new Date();
          return `
      <div class="card" style="margin-bottom:8px;padding:14px 16px;${isOverdue ? 'border-color:rgba(249,115,22,0.35)' : ''}">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="flex:1;min-width:0">
            <div style="font-size:12.5px;font-weight:700;color:var(--text-primary)">${t.title}</div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px">
              ${t.assigned_role ? `${t.assigned_role} · ` : ''}${t.due_date ? `Due ${t.due_date}` : 'No due date'}
              ${isOverdue ? '<span style="color:#f97316;font-weight:700;margin-left:6px">OVERDUE</span>' : ''}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
            ${_statusBadge(t.status)}
            <span style="font-size:9px;font-weight:700;color:${_priorityColor(t.priority)};text-transform:uppercase">${t.priority || 'medium'}</span>
          </div>
        </div>
      </div>`;}).join('')}

      <!-- Exposure Summary -->
      <div class="section-header" style="margin-top:16px"><div class="section-title"><div class="section-title-dot" style="background:var(--violet)"></div>Exposure Summary</div></div>
      <div class="card" style="padding:16px 18px">
        ${[
          ['🌐 External Exposure', exposure.length,  exposure.length > 0 ? '#fbbf24' : '#34d399'],
          ['👤 Access & Ownership', ownership.length, ownership.length > 0 ? '#fbbf24' : '#34d399'],
          ['⚙️ Configuration',     config.length,    config.length > 0 ? '#fbbf24' : '#34d399'],
        ].map(([label, count, color]) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border-subtle)">
          <span style="font-size:12px;color:var(--text-secondary)">${label}</span>
          <span style="font-size:12px;font-weight:700;color:${color}">${count > 0 ? count + ' issue' + (count > 1 ? 's' : '') : '✓ Clear'}</span>
        </div>`).join('')}
        <div style="padding-top:10px">
          <div style="font-size:10px;color:var(--text-muted)">Last checked: ${_relativeDate(org.last_scan_at)}</div>
        </div>
      </div>
    </div>
  </div>`;
}

// ── Findings tab ──────────────────────────────────────────────
function _renderFindingsContent(findings) {
  if (findings.length === 0) {
    return `<div class="empty-state"><div class="empty-state-icon">🛡️</div><div class="empty-state-title">No open findings</div><div class="empty-state-sub">All checks are passing. Run a scan to refresh.</div></div>`;
  }

  const severityOrder = { high:0, medium:1, low:2, info:3 };
  const sorted = [...findings].sort((a,b) =>
    (severityOrder[(a.severity||'').toLowerCase()]||3) -
    (severityOrder[(b.severity||'').toLowerCase()]||3)
  );

  return `
  <div class="table-wrap">
    <table class="data-table">
      <thead><tr>
        <th>Severity</th>
        <th>Finding</th>
        <th>Category</th>
        <th>Score Impact</th>
        <th>Detected</th>
        <th>Status</th>
      </tr></thead>
      <tbody>
        ${sorted.map(f => `
        <tr>
          <td><span style="font-size:14px">${_severityIcon(f.severity)}</span> <span style="font-size:10px;font-weight:700;color:${_severityColor(f.severity)};text-transform:uppercase">${f.severity}</span></td>
          <td>
            <div style="font-weight:600;color:var(--text-primary);font-size:12.5px">${f.title}</div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px">${f.summary || ''}</div>
          </td>
          <td><span class="tag" style="text-transform:capitalize">${f.category || '—'}</span></td>
          <td style="font-weight:700;color:${f.score_impact < 0 ? '#f43f5e' : '#34d399'}">${f.score_impact !== undefined ? (f.score_impact > 0 ? '+' : '') + f.score_impact : '—'}</td>
          <td style="font-size:11px;color:var(--text-muted)">${_relativeDate(f.detected_at || f.created_at)}</td>
          <td>${_statusBadge(f.status)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

// ── Tasks tab ─────────────────────────────────────────────────
function _renderTasksContent(tasks, overdue) {
  if (tasks.length === 0) {
    return `<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-title">No open tasks</div><div class="empty-state-sub">Create tasks from findings to track remediation work.</div></div>`;
  }

  return `
  <div class="table-wrap">
    <table class="data-table">
      <thead><tr>
        <th>Priority</th>
        <th>Task</th>
        <th>Assigned To</th>
        <th>Due Date</th>
        <th>Retest</th>
        <th>Status</th>
      </tr></thead>
      <tbody>
        ${tasks.map(t => {
          const isOverdue = t.due_date && new Date(t.due_date) < new Date();
          return `
        <tr style="${isOverdue ? 'background:rgba(249,115,22,0.04)' : ''}">
          <td><span style="font-size:10px;font-weight:700;color:${_priorityColor(t.priority)};text-transform:uppercase">${t.priority || 'medium'}</span></td>
          <td>
            <div style="font-weight:600;color:var(--text-primary);font-size:12.5px">${t.title}</div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:1px">${t.description || ''}</div>
            ${t.notes ? `<div style="font-size:10px;color:var(--blue);margin-top:3px">📌 ${t.notes}</div>` : ''}
          </td>
          <td style="font-size:11px;color:var(--text-muted)">${t.assigned_role || t.assigned_to || '—'}</td>
          <td>
            <span style="font-size:11px;font-weight:${isOverdue ? '700' : '400'};color:${isOverdue ? '#f97316' : 'var(--text-muted)'}">
              ${t.due_date || '—'}${isOverdue ? ' ⏰' : ''}
            </span>
          </td>
          <td><span style="font-size:10px;color:${t.retest_required ? 'var(--amber)' : 'var(--text-muted)'}">${t.retest_required ? '🔄 Required' : '—'}</span></td>
          <td>${_statusBadge(t.status)}</td>
        </tr>`;}).join('')}
      </tbody>
    </table>
  </div>`;
}

// ── Kill switch state ─────────────────────────────────────────
function _renderKillSwitchState() {
  console.info('[Sentinel] Kill switch is active — module offline.');
  return `
  <div class="page-header">
    <div class="page-header-left">
      <div class="page-title">🛡️ Security Sentinel</div>
      <div class="page-subtitle">Trust &amp; exposure monitoring</div>
    </div>
  </div>
  <div class="empty-state">
    <div class="empty-state-icon">🔒</div>
    <div class="empty-state-title">Sentinel is temporarily offline</div>
    <div class="empty-state-sub">The Security Sentinel module has been paused by the operator. No data is being collected or displayed.<br>Contact your operator to re-enable.</div>
  </div>`;
}

// ── Expose public API ─────────────────────────────────────────
window.loadSentinelConfig   = loadSentinelConfig;
window.renderSentinelPage   = renderSentinelPage;
window.sentinelSwitchTab    = sentinelSwitchTab;
