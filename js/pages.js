// =====================================
// THE AUM ENGINE — PAGE RENDERERS
// =====================================

function pageCommandCenter() {
  const top = [...PROSPECTS].sort((a,b)=>b.priorityScore-a.priorityScore).slice(0,8);
  const M = computeMetrics();
  const NM = computeNicheMetrics();

  // ── CLIENT BRIEFS panel (ED/Al) ──────────────────────────────
  // Restore brief from sessionStorage if cleared by page reload
  if (!window._alCurrentBrief) {
    try {
      const stored = sessionStorage.getItem('alCurrentBrief');
      if (stored) {
        const parsed = JSON.parse(stored);
        window._alCurrentBrief      = parsed.brief      || null;
        window._alActiveSituationId = parsed.situationId || null;
      }
    } catch(e) {}
  }
  const situations  = window._edSituations  || [];
  const assignments = window._alAssignments || [];

  // Pending = situations with no brief yet
  const pending = situations.filter(s =>
    s.status === 'new' || s.status === 'pending'
  );

  // Active brief (currently selected)
  const activeBrief = window._alCurrentBrief || null;
  const activeSitId = window._alActiveSituationId || null;

  // Approved assignments (already accepted by advisor)
  const approved = assignments.filter(a => ['approved','pending_review','al_accepted'].includes(a.status)).slice(0, 5);

  const briefPanelHTML = (() => {
    // No situations at all
    if (!pending.length && !activeBrief && !approved.length) {
      return `
      <div class="card" style="padding:28px 24px;text-align:center;border:1px dashed var(--border-default)">
        <div style="font-size:32px;margin-bottom:12px">🧠</div>
        <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:6px">No client briefs yet</div>
        <div style="font-size:12px;color:var(--text-muted);line-height:1.7;margin-bottom:16px">Use Client Intake (ED) to capture a client's situation.<br>Al will generate a planning brief automatically.</div>
        <button class="btn btn-primary" onclick="navigate('ed-disclosure')" style="background:var(--color-ed);border-color:var(--color-ed);font-size:12px">
          + Start Client Intake
        </button>
      </div>`;
    }

    let html = '';

    // ── Active brief waiting for review ──────────────────────────
    if (activeBrief) {
      const band = activeBrief.band || { emoji: '🔵', label: 'Priority', color: 'var(--blue)' };
      html += `
      <div class="card" style="padding:20px 24px;margin-bottom:14px;border:1px solid var(--color-ed);background:rgba(217,119,6,0.04)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
          <div>
            <div style="font-size:11px;font-weight:700;color:var(--color-ed);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:4px">🧠 Al Planning Brief — Ready for Review</div>
            <div style="font-size:15px;font-weight:800;color:var(--text-primary)">${activeBrief.clientName}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${activeBrief.wealthTier} · ${activeBrief.lifeStage} · ${activeBrief.state || ''}</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
            <div style="font-size:20px;font-weight:900;color:${band.color}">${activeBrief.score}</div>
            <div style="font-size:10px;color:${band.color};font-weight:700">${band.emoji} ${band.label}</div>
          </div>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.7;margin-bottom:14px;padding:12px 14px;background:var(--bg-elevated);border-radius:8px;border-left:3px solid var(--color-ed)">
          ${activeBrief.brief}
        </div>
        ${activeBrief.questions?.length ? `
        <div style="margin-bottom:12px">
          <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px">💬 Al Discovery Questions</div>
          ${activeBrief.questions.slice(0,3).map(q => `<div style="font-size:11.5px;color:var(--text-secondary);padding:6px 0;border-bottom:1px solid var(--border-subtle);line-height:1.5">→ ${q}</div>`).join('')}
        </div>` : ''}
        ${activeBrief.nextActions?.length ? `
        <div style="margin-bottom:14px">
          <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px">⚡ Next Actions</div>
          ${activeBrief.nextActions.map(a => `<div style="font-size:11.5px;color:var(--text-secondary);padding:4px 0;line-height:1.5">• ${a}</div>`).join('')}
        </div>` : ''}
        <div style="font-size:9.5px;color:var(--text-muted);margin-bottom:12px;font-style:italic">${activeBrief.disclaimer}</div>
        <div style="display:flex;gap:10px">
          <button class="btn btn-primary" onclick="alAcceptSituation('${activeSitId}')"
            style="background:var(--color-ed);border-color:var(--color-ed);flex:1;font-size:12px">
            ✅ Approve & Add to Planning Queue
          </button>
          <button class="btn btn-ghost" onclick="alDeclineSituation('${activeSitId}')"
            style="font-size:12px">
            ↩ Return
          </button>
        </div>
      </div>`;
    }

    // ── Pending situations (need brief generated) ─────────────────
    if (pending.length) {
      html += `
      <div style="margin-bottom:12px">
        <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px">
          📋 Pending Intakes — ${pending.length} waiting
        </div>
        ${pending.map(s => {
          const name = s.fullName || [s.firstName, s.lastName].filter(Boolean).join(' ') || 'Client';
          const score = s.situationScore || s.opportunityScore || 0;
          const band  = (typeof PlanningAgent !== 'undefined' && PlanningAgent.getBand)
            ? PlanningAgent.getBand(score)
            : { emoji: '🔵', label: 'Priority', color: 'var(--blue)' };
          const wealthLabel = (typeof PlanningAgent !== 'undefined' && PlanningAgent.WEALTH_LABELS)
            ? (PlanningAgent.WEALTH_LABELS[s.wealthTier] || s.wealthTier || '—')
            : (s.wealthTier || '—');
          const date = s.savedAt?.toDate ? s.savedAt.toDate().toLocaleDateString('en-US',{month:'short',day:'numeric'}) : 'Today';
          return `
          <div class="card" style="padding:14px 16px;margin-bottom:8px;display:flex;align-items:center;gap:14px">
            <div style="font-size:22px;font-weight:900;color:${band.color};min-width:36px;text-align:center">${score}</div>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:700;color:var(--text-primary)">${name}</div>
              <div style="font-size:11px;color:var(--text-muted)">${(s.lifeStage||'').replace(/_/g,' ')} · ${wealthLabel} · ${date}</div>
            </div>
            <button class="btn btn-primary" onclick="alGenerateBrief('${s.id || s._firestoreId}')"
              style="background:var(--color-ed);border-color:var(--color-ed);font-size:11px;padding:6px 14px">
              Generate Brief →
            </button>
          </div>`;
        }).join('')}
      </div>`;
    }

    // ── Approved/saved briefs ─────────────────────────────────────
    if (approved.length) {
      html += `
      <div>
        <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px">
          ✅ Planning Queue — ${approved.length} active
        </div>
        ${approved.map(a => {
          const brief = a.brief || {};
          const band = brief.band || ((typeof PlanningAgent !== 'undefined' && PlanningAgent.getBand)
            ? PlanningAgent.getBand(brief.score || 0)
            : { emoji: '🔵', label: 'Priority', color: 'var(--blue)' });
          const date = a.acceptedAt ? new Date(a.acceptedAt).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
          return `
          <div class="card" style="padding:12px 16px;margin-bottom:8px;display:flex;align-items:center;gap:12px;opacity:0.85">
            <div style="font-size:18px;font-weight:900;color:${band.color};min-width:32px;text-align:center">${brief.score||'—'}</div>
            <div style="flex:1">
              <div style="font-size:12.5px;font-weight:700;color:var(--text-primary)">${brief.clientName||'Client'}</div>
              <div style="font-size:10.5px;color:var(--text-muted)">${brief.wealthTier||''} · Approved ${date}</div>
            </div>
            <span style="font-size:10px;padding:3px 8px;background:rgba(16,185,129,0.12);color:var(--emerald);border-radius:20px;font-weight:700">In Queue</span>
          </div>`;
        }).join('')}
      </div>`;
    }

    return html;
  })();

  return `
  <div class="page-header">
    <div class="page-header-left">
      <div class="page-title">Command Center</div>
      <div class="page-subtitle">Your growth cockpit — ${new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</div>
    </div>
    <div class="page-actions">
      <button class="btn btn-secondary" onclick="navigate('prospect-mine')">Mine Prospects</button>
      <button class="btn btn-primary" onclick="navigate('outreach-studio')">Create Outreach</button>
    </div>
  </div>
  <div class="kpi-strip">
    <div class="kpi-card" style="--kpi-color:linear-gradient(90deg,#60a5fa,#818cf8);cursor:pointer;transition:transform .15s,box-shadow .15s"
      onclick="navigate('lead-scoreboard')" title="View all prospects"
      onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(96,165,250,0.2)'"
      onmouseout="this.style.transform='';this.style.boxShadow=''">
      <div class="kpi-label">Total Prospects</div><div class="kpi-value">${M.total}</div>
      <div class="kpi-delta up">↑ ${M.newThisWeek || 0} new this week</div><div class="kpi-icon">💎</div>
    </div>
    <div class="kpi-card" style="--kpi-color:linear-gradient(90deg,#fb7185,#f43f5e);cursor:pointer;transition:transform .15s,box-shadow .15s"
      onclick="navigate('nurture-booking')" title="View pipeline board"
      onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(251,113,133,0.2)'"
      onmouseout="this.style.transform='';this.style.boxShadow=''">
      <div class="kpi-label">In Pipeline</div><div class="kpi-value">${M.contacted}</div>
      <div class="kpi-delta up">↑ Active stage</div><div class="kpi-icon">🔥</div>
    </div>
    <div class="kpi-card" style="--kpi-color:linear-gradient(90deg,#34d399,#10b981);cursor:pointer;transition:transform .15s,box-shadow .15s"
      onclick="navigate('meeting-prep')" title="Go to Meeting Prep"
      onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(52,211,153,0.2)'"
      onmouseout="this.style.transform='';this.style.boxShadow=''">
      <div class="kpi-label">Meetings Booked</div><div class="kpi-value">${M.booked}</div>
      <div class="kpi-delta up">↑ +2 this week</div><div class="kpi-icon">📅</div>
    </div>
    <div class="kpi-card" style="--kpi-color:linear-gradient(90deg,#fbbf24,#f59e0b);cursor:pointer;transition:transform .15s,box-shadow .15s"
      onclick="navigate('outreach-studio')" title="Go to Outreach Studio"
      onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(251,191,36,0.2)'"
      onmouseout="this.style.transform='';this.style.boxShadow=''">
      <div class="kpi-label">Contact Rate</div><div class="kpi-value">${M.contactRate}%</div>
      <div class="kpi-delta up">↑ +4% vs last mo.</div><div class="kpi-icon">✉️</div>
    </div>
    <div class="kpi-card" style="--kpi-color:linear-gradient(90deg,#a78bfa,#7c3aed);cursor:pointer;transition:transform .15s,box-shadow .15s"
      onclick="navigate('nurture-booking')" title="Go to Nurture &amp; Booking"
      onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(167,139,250,0.2)'"
      onmouseout="this.style.transform='';this.style.boxShadow=''">
      <div class="kpi-label">Reply Rate</div><div class="kpi-value">${M.replyRate}%</div>
      <div class="kpi-delta neutral">Industry avg: 8%</div><div class="kpi-icon">💬</div>
    </div>
  </div>

  <!-- My Activity — pre-populated from localStorage, overwritten by Firestore -->
  <div id="my-activity-strip" style="display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap">
    <div style="flex:1;min-width:110px;background:var(--bg-card);border:1px solid var(--border-default);border-radius:12px;padding:14px 16px;display:flex;align-items:center;gap:10px">
      <span style="font-size:20px">&#x2709;&#xFE0F;</span>
      <div><div style="font-size:22px;font-weight:900;color:var(--blue)" id="my-stat-sent">&#x2014;</div><div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-top:2px">Sent</div></div>
    </div>
    <div style="flex:1;min-width:110px;background:var(--bg-card);border:1px solid var(--border-default);border-radius:12px;padding:14px 16px;display:flex;align-items:center;gap:10px">
      <span style="font-size:20px">&#x1F4AC;</span>
      <div><div style="font-size:22px;font-weight:900;color:var(--emerald)" id="my-stat-replied">&#x2014;</div><div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-top:2px">Replies</div></div>
    </div>
    <div style="flex:1;min-width:110px;background:var(--bg-card);border:1px solid var(--border-default);border-radius:12px;padding:14px 16px;display:flex;align-items:center;gap:10px">
      <span style="font-size:20px">&#x1F4C5;</span>
      <div><div style="font-size:22px;font-weight:900;color:var(--amber)" id="my-stat-meetings">&#x2014;</div><div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-top:2px">Meetings</div></div>
    </div>
    <div style="flex:1;min-width:110px;background:var(--bg-card);border:1px solid var(--border-default);border-radius:12px;padding:14px 16px;display:flex;align-items:center;gap:10px">
      <span style="font-size:20px">&#x1F3AF;</span>
      <div><div style="font-size:22px;font-weight:900;color:var(--violet)" id="my-stat-rate">&#x2014;</div><div style="font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-top:2px">Contact Rate</div></div>
    </div>
  </div>
  <script>
  // Bug #6 fix — hydrate activity strip from localStorage immediately (no Firestore wait)
  (function _hydrateActivityStrip() {
    try {
      const log = JSON.parse(localStorage.getItem('aumOutreachLog') || '[]');
      const sent     = log.filter(e => e.sent).length;
      const replied  = log.filter(e => e.outcome && ['reply','positive','meeting'].includes(e.outcome)).length;
      const meetings = log.filter(e => e.outcome === 'meeting').length;
      const rate     = sent > 0 ? Math.round((replied / sent) * 100) : 0;
      const s = document.getElementById('my-stat-sent');
      const r = document.getElementById('my-stat-replied');
      const m = document.getElementById('my-stat-meetings');
      const c = document.getElementById('my-stat-rate');
      if (s) s.textContent = sent     > 0 ? sent     : '—';
      if (r) r.textContent = replied  > 0 ? replied  : '—';
      if (m) m.textContent = meetings > 0 ? meetings : '—';
      if (c) c.textContent = sent     > 0 ? rate + '%' : '—';
    } catch(e) { /* silently degrade */ }
  })();
  </script>

  <div class="section">
    <div class="grid-21" style="gap:16px">
      <div>
        <div class="section-header">
          <div class="section-title"><div class="section-title-dot"></div>Top 8 To Work Now</div>
          <a href="#" onclick="navigate('lead-scoreboard');return false" style="font-size:11px;color:var(--blue);text-decoration:none">View All &#x2192;</a>
        </div>
        <div class="top-queue">
          ${top.map((p,i)=>`
          <div class="queue-item" onclick="openContactCard('${p.id}')">
            <span class="queue-rank">#${i+1}</span>
            <div class="queue-avatar ${getAvatarClass(p.lastName || p.company || '')}">${getInitials(p.firstName,p.lastName,p.company)}</div>
            <div class="queue-info">
              <div class="queue-name">${getDisplayName(p)}</div>
              <div class="queue-meta">${p.niche} · ${p.city}, ${p.state}</div>
            </div>
            ${getStatusPill(p.status)}
            <span class="queue-score">${p.priorityScore}</span>
            <span class="queue-action" onclick="event.stopPropagation();setOutreachProspect('${p.id}');navigate('outreach-studio')">Draft</span>
          </div>`).join('')}
        </div>
      </div>
      <div>
        <div class="section-header"><div class="section-title"><div class="section-title-dot"></div>Alerts</div><span class="tag">${ALERTS.length} new</span></div>
        <div class="alert-queue">
          ${ALERTS.map(a=>{
            const dc={hot:'var(--rose)',reply:'var(--emerald)',booking:'var(--blue)',stale:'var(--amber)',new:'var(--violet)'}[a.type]||'var(--violet)';
            const onclk = a.prospectId ? `openContactCard('${a.prospectId}')` : `navigate('prospect-mine')`;
            return `<div class="alert-item" onclick="${onclk}" style="cursor:pointer;transition:background .15s" onmouseover="this.style.background='rgba(96,165,250,0.05)'" onmouseout="this.style.background=''">
              <div class="alert-dot" style="background:${dc};box-shadow:0 0 6px ${dc}"></div>
              <div class="alert-text"><div class="alert-title">${a.title}</div><div class="alert-sub">${a.sub}</div></div>
              <div class="alert-time">${a.time}</div>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>
  </div>
  <div class="section">
    <div class="section-header"><div class="section-title"><div class="section-title-dot"></div>Niche Performance</div></div>
    <div class="grid-3">
      ${NM.slice(0,3).map(n=>`
      <div class="card" style="cursor:pointer;transition:all .15s"
        onclick="openNicheDrawer('${n.id}')"
        onmouseover="this.style.borderColor='${n.color}';this.style.boxShadow='0 0 0 1px ${n.color}33'"
        onmouseout="this.style.borderColor='';this.style.boxShadow=''">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <span style="font-size:20px">${n.icon}</span>
          <div style="display:flex;gap:6px;align-items:center">
            <span class="tag" style="color:${n.color}">${n.total} prospects</span>
            ${n.booked ? `<span class="tag" style="color:var(--emerald)">${n.booked} booked</span>` : ''}
          </div>
        </div>
        <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:4px">${n.name}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">${n.desc}</div>
        <div class="perf-bar-wrap">
          <div class="perf-bar-item">
            <div class="perf-bar-label"><span class="perf-bar-label-name">Contact Rate</span><span class="perf-bar-label-val">${n.convPct}%</span></div>
            <div class="perf-bar-track"><div class="perf-bar-fill" style="width:${Math.min(n.convPct*1.5,100)}%;background:${n.color}"></div></div>
          </div>
        </div>
        <div style="margin-top:8px;font-size:10px;color:var(--text-muted);font-weight:600">View prospects →</div>
      </div>`).join('')}
    </div>
  </div>
  <div class="section">
    <div class="section-header">
      <div class="section-title"><div class="section-title-dot" style="background:var(--color-ed)"></div>🧠 Client Intelligence — Al Briefs</div>
      <button class="btn btn-ghost" onclick="navigate('ed-disclosure')" style="font-size:11px;padding:5px 12px">+ New Intake</button>
    </div>
    ${briefPanelHTML}
  </div>`;
}

function pageProspectMine() {
  return `
  <div class="page-header">
    <div class="page-header-left">
      <div class="page-title">Prospect Mine 💎</div>
      <div class="page-subtitle">AI-powered niche prospecting — find your next best client &nbsp;·&nbsp; <span data-tooltip="Alfred is the AUM Engine's AI prospecting agent — he researches, scores, and assembles curated households in your niche from public records and enrichment sources. He never contacts prospects directly; that's always you." style="color:var(--blue);font-weight:600;cursor:help;font-size:11px">Who is Alfred? ⓘ</span></div>
    </div>
    <div class="page-actions">
      <button class="btn btn-secondary" onclick="triggerCSVImport()">⬆ Import CSV</button>
      <input type="file" id="csv-file-input" accept=".csv" style="display:none" onchange="handleCSVImport(this)">
      <button class="btn btn-primary" onclick="startMining()">💎 Run Mine Agent</button>
    </div>
  </div>
  <div class="section">
    <div class="grid-12">
      <div>
        <div class="section-header"><div class="section-title"><div class="section-title-dot"></div>Select Niche</div></div>
        <div class="grid-2" style="gap:10px">
          ${NICHES.map(n=>`
          <div class="niche-card ${activeNiche===n.id?'active':''}" onclick="selectNiche('${n.id}')" id="niche-${n.id}">
            <span class="niche-card-icon">${n.icon}</span>
            <div class="niche-card-name">${n.name}</div>
            <div class="niche-card-desc">${n.desc}</div>
            <span class="niche-card-count" style="color:${n.color}">${PROSPECTS.filter(p=>p.nicheId===n.id).length}</span>
          </div>`).join('')}
        </div>
      </div>
      <div>
        <div class="section-header"><div class="section-title"><div class="section-title-dot"></div>Mine Parameters</div></div>
        <div class="card">
          <div class="form-group"><label class="form-label">Target Geography</label>
            <input class="form-input" id="mine-geo" value="${ICP_CONFIG.geography}"></div>
          <div class="form-group"><label class="form-label">Asset Minimum</label>
            <select class="form-select"><option>$500K+</option><option selected>$1M+</option><option>$2M+</option><option>$5M+</option></select></div>
          <div class="form-group"><label class="form-label">Age Range</label>
            <select class="form-select"><option>35–50</option><option selected>50–65</option><option>55–70</option><option>All</option></select></div>
          <div class="form-group"><label class="form-label">Life Event Signals</label>
            <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:4px">
              ${['Business Sale','Inheritance','Job Change','Home Purchase','Board Appointment','Divorce','Retirement'].map(ev=>
                `<div class="filter-chip ${['Business Sale','Inheritance','Board Appointment'].includes(ev)?'active':''}" onclick="this.classList.toggle('active')">${ev}</div>`
              ).join('')}
            </div>
          </div>
          <div class="form-group"><label class="form-label">Exclude Existing Clients</label>
            <select class="form-select"><option selected>Yes — exclude CRM contacts</option><option>No</option></select></div>
          <div id="mining-status" style="margin-bottom:10px"></div>
          <button class="btn btn-primary" style="width:100%" onclick="startMining()">Run Prospect Mine Agent</button>
        </div>
        <div style="margin-top:12px">
          <div class="section-header">
            <div class="section-title"><div class="section-title-dot"></div>Recent Cohorts</div>
            ${window._firestoreMetaUpdatedAt ? `<span style="font-size:10px;color:var(--text-muted)">Updated ${new Date(window._firestoreMetaUpdatedAt).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>` : ''}
          </div>
          ${(() => {
            // Build cohort list from Firestore pipeline_meta + in-memory PROSPECTS
            const breakdown = window._firestoreNicheBreakdown || null;
            const nicheList = typeof NICHES !== 'undefined' ? NICHES : [];

            // Merge: Firestore counts (authoritative total) + PROSPECTS contact rate
            const cohorts = nicheList.map(n => {
              const fs     = breakdown?.[n.id] || null;
              const total  = fs?.total || PROSPECTS.filter(p => p.nicheId === n.id).length;
              const inPipeline = PROSPECTS.filter(p => p.nicheId === n.id && !['New','Dead'].includes(p.status)).length;
              const contactRate = total ? Math.round(inPipeline / Math.min(total, PROSPECTS.filter(p=>p.nicheId===n.id).length || 1) * 100) : 0;
              const latestRaw  = fs?.latestIngest || null;
              const latestDate = latestRaw
                ? new Date(latestRaw).toLocaleDateString('en-US',{month:'short',day:'numeric'})
                : null;
              return { ...n, total, contactRate, latestDate };
            }).filter(c => c.total > 0).sort((a,b) => b.total - a.total);

            if (cohorts.length === 0) return `
              <div class="empty-state" style="padding:24px 16px">
                <div class="empty-state-icon" style="font-size:24px">💎</div>
                <div class="empty-state-title" style="font-size:12px">No cohorts yet</div>
                <div class="empty-state-sub" style="font-size:11px">Run the Mine Agent to build your first prospect cohort.</div>
              </div>`;

            return cohorts.map(c => `
              <div class="card" style="margin-bottom:8px;padding:12px 14px;display:flex;align-items:center;gap:10px;cursor:pointer;transition:box-shadow .15s"
                onclick="loadCohort('${c.id}')"
                onmouseover="this.style.boxShadow='0 4px 14px rgba(0,0,0,0.18)';this.querySelector('.cohort-load-btn').style.background='${c.color}';this.querySelector('.cohort-load-btn').style.color='#000'"
                onmouseout="this.style.boxShadow='';this.querySelector('.cohort-load-btn').style.background='';this.querySelector('.cohort-load-btn').style.color=''">
                <span style="font-size:20px;flex-shrink:0">${c.icon}</span>
                <div style="flex:1;min-width:0">
                  <div style="font-size:12.5px;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.name}</div>
                  <div style="font-size:10.5px;color:var(--text-muted);display:flex;gap:8px;align-items:center;margin-top:2px">
                    <span style="font-weight:700;color:${c.color}">${c.total.toLocaleString()}</span> prospects
                    ${c.latestDate ? `<span style="opacity:0.5">·</span><span>Latest: ${c.latestDate}</span>` : ''}
                    ${c.contactRate > 0 ? `<span style="opacity:0.5">·</span><span>${c.contactRate}% contact rate</span>` : ''}
                  </div>
                </div>
                <button class="btn btn-ghost cohort-load-btn" style="font-size:11px;padding:4px 12px;flex-shrink:0;transition:background .15s,color .15s" onclick="event.stopPropagation();loadCohort('${c.id}')">Load →</button>
              </div>`).join('');
          })()}
        </div>
      </div>
    </div>
  </div>`;
}

function pageLeadScoreboard() {
  let list = [...PROSPECTS];
  const isFiltered = activeFilters.status !== 'all' || activeFilters.niche !== 'all';
  if (activeFilters.status !== 'all') list = list.filter(p=>p.status===activeFilters.status);
  if (activeFilters.niche  !== 'all') list = list.filter(p=>p.nicheId===activeFilters.niche);
  list.sort((a,b)=>b.priorityScore-a.priorityScore);

  const dbTotal = window._firestoreLeadTotal || PROSPECTS.length;
  // When no filter: show full DB total. When filtered: show list.length of dbTotal.
  const showingCount = isFiltered ? list.length : dbTotal;

  const statuses = ['New','Contacted','Engaged','Nurture','Meeting Requested','Booked','Dead'];
  return `
  <div class="page-header">
    <div class="page-header-left">
      <div class="page-title">Lead Scoreboard</div>
      <div class="page-subtitle">${showingCount} of ${dbTotal} prospects ranked by AI fit + timing score</div>
    </div>
    <div class="page-actions">
      <button class="btn btn-secondary" onclick="triggerCSVImport()">⬆ Import CSV</button>
      <input type="file" id="csv-file-input2" accept=".csv" style="display:none" onchange="handleCSVImport(this)">
      <button class="btn btn-secondary" onclick="triggerEnrichmentImport()">🔬 Import Enrichment</button>
      <button class="btn btn-secondary" onclick="exportCSV()">⬇ Export Worked Leads</button>
      <button class="btn btn-primary" onclick="navigate('outreach-studio')">Batch Outreach</button>
    </div>
  </div>
  <div class="filters-bar">
    <div class="search-input-wrap">
      <svg viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.4"/><path d="M10.5 10.5L13 13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
      <input class="search-input" placeholder="Search prospects…" id="search-prospects" oninput="filterProspects(this.value)">
    </div>
    <div class="filter-chip ${activeFilters.status==='all'?'active':''}" onclick="setFilter('status','all');navigate('lead-scoreboard')">All (${window._firestoreLeadTotal || PROSPECTS.length})</div>
    ${statuses.map(s=>{
      const c=PROSPECTS.filter(p=>p.status===s).length;
      return `<div class="filter-chip ${activeFilters.status===s?'active':''}" onclick="setFilter('status','${s}');navigate('lead-scoreboard')">${s} ${c>0?`(${c})`:''}</div>`;
    }).join('')}
  </div>
  <div class="section">
    ${list.length===0?`
    <div class="empty-state">
      <div class="empty-state-icon">💎</div>
      <div class="empty-state-title">No prospects match this filter</div>
      <div class="empty-state-sub">Try selecting a different status or import new prospects via CSV.</div>
      <button class="btn btn-primary" style="margin-top:14px" onclick="setFilter('status','all');navigate('lead-scoreboard')">Clear Filter</button>
    </div>`:`
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Rank</th><th>Prospect</th><th>Niche</th><th>Signals</th><th>Fit</th><th>Timing</th><th>Priority</th><th>Status</th><th style="min-width:120px">Rep / Activity</th><th style="min-width:72px">Rate</th><th style="min-width:60px">Action</th></tr></thead>
        <tbody id="scoreboard-body">
          ${list.map((p,i)=>{
            const e    = getEnrichment(p.id);
            const sigs = getEnrichmentSignals(e);
            return `
          <tr onclick="openDrawer('${p.id}')">
            <td><span style="font-family:'JetBrains Mono',monospace;font-weight:800;color:var(--text-muted)">#${i+1}</span></td>
            <td><div style="display:flex;align-items:center;gap:8px">
              <div class="queue-avatar ${getAvatarClass(p.lastName || p.company || '')}" style="width:28px;height:28px;font-size:10px;border-radius:6px">${getInitials(p.firstName,p.lastName,p.company)}</div>
              <div><div style="font-weight:600;color:var(--text-primary);font-size:12.5px">${getDisplayName(p)}</div>
              <div style="font-size:10.5px;color:var(--text-muted)">${p.title}</div></div>
            </div></td>
            <td><span class="tag">${p.niche}</span></td>
            <td onclick="event.stopPropagation();openDrawer('${p.id}')">
              <div class="esig-grid" title="${sigs.count}/4 signals enriched">
                <span class="esig-dot-sm ${sigs.wealth    ? 'esig-wealth'    : 'esig-empty'}" title="💰 Wealth Score"></span>
                <span class="esig-dot-sm ${sigs.liquidity ? 'esig-liquidity' : 'esig-empty'}" title="⚡ Liquidity Event"></span>
                <span class="esig-dot-sm ${sigs.contact   ? 'esig-contact'   : 'esig-empty'}" title="📧 Personal Contact"></span>
                <span class="esig-dot-sm ${sigs.court     ? 'esig-court'     : 'esig-empty'}" title="⚖️ Court Signal"></span>
              </div>
            </td>
            <td>${getScoreBar(p.fitScore,'#60a5fa')}</td>
            <td>${getScoreBar(p.timingScore,'#a78bfa')}</td>
            <td>${getScoreBar(p.priorityScore,'#34d399')}</td>
            <td>${getStatusPill(p.status)}</td>
            <td style="font-size:10.5px;color:var(--text-muted);min-width:120px">
              <div style="font-weight:600;color:var(--text-secondary)">${p.assignedRep}</div>
              <div style="font-size:10px;margin-top:1px">${p.lastActivity}</div>
            </td>
            <td onclick="event.stopPropagation()" style="min-width:72px">
              <div class="fb-inline">
                <button class="fb-btn-sm ${(FEEDBACK_STORE[p.id]==='up')?'fb-active-up':''}" id="fb-up-${p.id}"
                  onclick="saveFeedback('${p.id}','up')" title="Quality lead">👍</button>
                <button class="fb-btn-sm ${(FEEDBACK_STORE[p.id]==='down')?'fb-active-down':''}" id="fb-down-${p.id}"
                  onclick="saveFeedback('${p.id}','down')" title="Poor fit">👎</button>
              </div>
            </td>
            <td><button class="btn btn-ghost" style="font-size:11px;padding:4px 9px" onclick="event.stopPropagation();openDrawer('${p.id}')">View</button></td>
          </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`}
  </div>`;
}

function pageOutreachStudio() {
  const prospect = PROSPECTS.find(p=>p.id===activeOutreachProspectId) || PROSPECTS[0];
  const types = [{id:'email',icon:'✉️',name:'Email',desc:'Personalized first-touch or follow-up email'},
                 {id:'call', icon:'📞',name:'Call Opener',desc:'Opening script for cold or warm calls'},
                 {id:'linkedin',icon:'💼',name:'LinkedIn Note',desc:'Connection request or InMail message'},
                 {id:'voicemail',icon:'📣',name:'Voicemail Script',desc:'Brief compelling voicemail'}];

  const priority = [...PROSPECTS].sort((a,b)=>b.priorityScore-a.priorityScore).slice(0,8);
  const curStage = window._outreachState?.stage || 'first_touch';

  // Auto-run agent stack after render
  setTimeout(() => { if (typeof osRunAgentStack === 'function') osRunAgentStack(); }, 300);

  return `
  <div class="page-header">
    <div class="page-header-left">
      <div class="page-title">Outreach Studio</div>
      <div class="page-subtitle">AI-drafted, compliance-aware outreach for every prospect</div>
    </div>
    <div class="page-actions">
      <button class="btn btn-secondary">Saved Templates</button>
      <button class="btn btn-primary" onclick="showToast('Outreach sequence saved!','✅')">Save Sequence</button>
    </div>
  </div>
  <div class="section">
    <div class="grid-12">
      <div>
        <div class="section-header"><div class="section-title"><div class="section-title-dot"></div>Select Prospect</div></div>
        ${priority.map(p=>`
        <div class="queue-item ${p.id===activeOutreachProspectId?'active-prospect':''}" style="margin-bottom:6px;${p.id===activeOutreachProspectId?'border-color:var(--blue);background:rgba(96,165,250,0.06)':''}" onclick="setOutreachProspect('${p.id}');navigate('outreach-studio')">
          <div class="queue-avatar ${getAvatarClass(p.lastName || p.company || '')}" style="width:28px;height:28px;font-size:10px;border-radius:6px">${getInitials(p.firstName,p.lastName,p.company)}</div>
          <div class="queue-info"><div class="queue-name">${getDisplayName(p)}</div>
          <div class="queue-meta">${p.niche} · Priority ${p.priorityScore}</div></div>
          ${getStatusPill(p.status)}
        </div>`).join('')}
        <div class="section-header" style="margin-top:16px"><div class="section-title"><div class="section-title-dot"></div>Channel</div></div>
        ${types.map(t=>`
        <button class="outreach-type-btn ${activeOutreachType===t.id?'active':''}" onclick="osSwitchChannel('${t.id}')">
          <span class="outreach-type-icon">${t.icon}</span>
          <div class="outreach-type-info"><div class="outreach-type-name">${t.name}</div><div class="outreach-type-desc">${t.desc}</div></div>
        </button>`).join('')}
        <div class="section-header" style="margin-top:16px"><div class="section-title"><div class="section-title-dot"></div>Stage</div></div>
        ${[['first_touch','\ud83d\udfe2','1st Touch'],['follow_up_1','\ud83d\udfe1','Follow-up 1'],['follow_up_2','\ud83d\udfe1','Follow-up 2'],['follow_up_3','\ud83d\udfe0','Follow-up 3'],['final','\ud83d\udd34','Final']].map(([val,dot,lbl])=>`
        <button class="outreach-type-btn ${curStage===val?'active':''}" style="padding:7px 10px;margin-bottom:3px" onclick="osSetStage('${val}')">
          <span class="outreach-type-icon" style="font-size:11px">${dot}</span>
          <div class="outreach-type-info"><div class="outreach-type-name" style="font-size:11.5px">${lbl}</div></div>
        </button>`).join('')}
      </div>
      <div>
        <div class="section-header">
          <div class="section-title"><div class="section-title-dot"></div>Draft — ${prospect.firstName} ${prospect.lastName}</div>
          <div class="agent-thinking" style="margin:0;padding:6px 10px;font-size:10.5px;gap:5px">
            <div class="agent-dots"><span>\ud83d\udd2c</span><span>\ud83c\udfaf</span><span>\u270d\ufe0f</span><span>\ud83d\udcc5</span></div>
            Research · Strategy · Draft · Cadence
          </div>
        </div>
        <!-- Prospect context card -->
        <div class="card" style="margin-bottom:10px;padding:10px 14px">
          <div style="display:flex;gap:14px;align-items:flex-start">
            <div style="flex:1"><div class="form-label">Prospect</div>
              <div style="font-size:12.5px;font-weight:600;color:var(--text-primary)">${prospect.firstName} ${prospect.lastName}</div>
              <div style="font-size:11px;color:var(--text-muted)">${prospect.title} \u00b7 ${prospect.city}, ${prospect.state}</div>
            </div>
            <div style="flex:1"><div class="form-label">Signals</div>
              ${(prospect.reasonCodes||[]).slice(0,2).map(r=>`<div class="reason-tag" style="margin:1px 0;font-size:9.5px">${r}</div>`).join('')}
            </div>
            <div style="flex:1"><div class="form-label">Trigger Event</div>
              <div style="font-size:11px;color:var(--amber);font-weight:500">${prospect.signals?.nextEvent||'\u2014'}</div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${prospect.signals?.relationship||'Cold'}</div>
            </div>
          </div>
        </div>
        <!-- Agent Action Row -->
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">
          <button id="agent-generate-btn" onclick="osRunAgentStack()" style="background:linear-gradient(135deg,var(--blue),#6366f1);color:#fff;border:none;border-radius:8px;padding:7px 16px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;box-shadow:0 2px 8px rgba(96,165,250,0.3)">\ud83d\udc8e Generate</button>
          <span id="channel-rec" style="margin-left:auto;font-size:10px;color:var(--blue);opacity:0;transition:opacity 0.4s;font-weight:500"></span>
        </div>
        <!-- Agent Metadata Bar -->
        <div class="agent-meta-bar" id="agent-meta-bar" style="margin-bottom:8px;padding:10px 14px;background:var(--card-bg);border:1px solid var(--border);border-radius:10px">
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            <div style="min-width:100px"><div style="font-size:9px;font-weight:700;color:var(--text-muted);letter-spacing:.08em;text-transform:uppercase;margin-bottom:3px">ANGLE</div>
              <div style="font-size:12px;font-weight:600;color:var(--text-secondary)">Press Generate \u2191</div></div>
            <div style="flex:2;min-width:180px"><div style="font-size:9px;font-weight:700;color:var(--text-muted);letter-spacing:.08em;text-transform:uppercase;margin-bottom:3px">WHY THIS ANGLE</div>
              <div style="font-size:11px;color:var(--text-muted);line-height:1.4">Research Agent will analyze context and choose best approach</div></div>
            <div style="min-width:80px"><div style="font-size:9px;font-weight:700;color:var(--text-muted);letter-spacing:.08em;text-transform:uppercase;margin-bottom:3px">WARMTH</div>
              <div style="font-size:12px;color:var(--text-muted)">\u2014</div></div>
            <div style="min-width:100px"><div style="font-size:9px;font-weight:700;color:var(--text-muted);letter-spacing:.08em;text-transform:uppercase;margin-bottom:3px">CTA</div>
              <div style="font-size:12px;color:var(--text-muted)">\u2014</div></div>
          </div>
        </div>
        <!-- Variant Tabs A/B/C -->
        <div class="variant-tabs" id="variant-tabs">
          ${[['A','Direct'],['B','Soft'],['C','Insight-Led']].map(([id,label],i)=>`
          <button class="variant-tab ${i===0?'active':''}" id="vtab-${id}" onclick="osSelectVariant('${id}')">
            <span class="variant-tab-badge">${id}</span>
            <span class="variant-tab-label">${label}</span>
          </button>`).join('')}
        </div>
        <!-- Message Editor -->
        <div class="message-editor">
          <div class="message-editor-toolbar">
            <span id="draft-subject" style="font-size:10.5px;font-style:italic;color:var(--text-muted);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Subject appears after generating\u2026</span>
            <button class="editor-tool-btn" onclick="copyDraft()">\ud83d\udccb Copy</button>
            <button class="editor-tool-btn" onclick="showToast('Compliance checked \u2713','\ud83d\udd12')">\ud83d\udd12 Check</button>
          </div>
          <div class="message-body" id="draft-body" contenteditable="true">${getDraft(prospect,activeOutreachType)}</div>
        </div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="btn btn-primary" style="flex:1" id="send-now-btn" onclick="showSendConfirmModal()">Send Now</button>
          <button class="btn btn-secondary" onclick="showToast('Added to cadence — follow up on schedule','📅')">Add to Sequence</button>
          <button class="btn btn-ghost" onclick="showToast('Template saved','✅')">Save Template</button>
        </div>
        <div id="reply-tapper-zone" style="margin-top:10px"></div>
        <div style="margin-top:20px">
          <div class="section-header"><div class="section-title"><div class="section-title-dot"></div>Outreach Cadence <span style="font-size:10px;color:var(--text-muted);font-weight:400">— AI-suggested multi-touch follow-up schedule · click Generate to build</span></div></div>
          <div id="cadence-sequence">
            ${[['Day 0','\u2709\ufe0f','First-touch email',true],['Day 3','\ud83d\udcbc','LinkedIn connection',false],
               ['Day 9','\u2709\ufe0f','Follow-up email \u2014 value add',false],['Day 16','\ud83d\udce3','Voicemail \u2014 brief and low-pressure',false],
               ['Day 23','\u2709\ufe0f','Final email \u2014 open door',false]]
             .map(([day,ch,theme,done])=>`<div class="signal-row">
               <span class="signal-label" style="min-width:52px;font-size:10px">${done?'<span style="color:var(--emerald)">&check;</span>':'\u25cb'} ${day}</span>
               <span style="flex:1;font-size:11px;color:${done?'var(--text-muted)':'var(--text-secondary)'}">${ch} ${theme}</span>
             </div>`).join('')}
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

function pageNurtureBooking() {
  const colMap = {};
  PIPELINE_COLUMNS.forEach(c=>{colMap[c]=[];});
  PROSPECTS.forEach(p=>{(colMap[p.status]||colMap['New']).push(p);});
  const upcoming = PROSPECTS.filter(p=>['Booked','Meeting Requested'].includes(p.status));

  return `
  <div class="page-header">
    <div class="page-header-left"><div class="page-title">Nurture & Booking</div>
      <div class="page-subtitle">Pipeline board — move prospects from contact to booked meeting</div></div>
    <div class="page-actions">
      <button class="btn btn-secondary" onclick="openNurtureBatch()">Run Nurture Batch</button>
      <button class="btn btn-primary" onclick="openBookingLinksBatch()">Send Booking Links</button>
    </div>
  </div>
  <div class="section">
    <div class="scroll-x">
      <div class="pipeline-board">
        ${PIPELINE_COLUMNS.filter(col => col !== 'Snoozed' || colMap['Snoozed'].length > 0).map(col=>`
        <div class="pipeline-col">
          <div class="pipeline-col-header">${col}<span class="pipeline-col-count">${colMap[col].length}</span></div>
          ${colMap[col].length===0?`<div style="padding:12px;text-align:center;font-size:10px;color:var(--text-muted)">No prospects</div>`:''}
          ${colMap[col].map(p=>{
            const NEXT = {
              New:'Contacted', Contacted:'Engaged', Engaged:'Nurture',
              Nurture:'Meeting Requested', 'Meeting Requested':'Booked'
            };
            const nextStatus = NEXT[p.status];
            const nextIcons = {
              Contacted:'📞', Engaged:'💬', Nurture:'🌱',
              'Meeting Requested':'📅', Booked:'🎉'
            };
            // Days remaining for snoozed leads
            let snoozeBadge = '';
            if (p.status === 'Snoozed' && p._snoozeUntil) {
              const daysLeft = Math.ceil((new Date(p._snoozeUntil) - Date.now()) / 86400000);
              const returnDate = new Date(p._snoozeUntil).toLocaleDateString('en-US', {month:'short',day:'numeric'});
              snoozeBadge = `Returns ${returnDate} · ${daysLeft}d`;
            }
            return `
          <div class="pipeline-item" onclick="openDrawer('${p.id}')">
            <div class="pipeline-item-name">${getDisplayName(p)}</div>
            <div class="pipeline-item-meta">${p.niche}</div>
            <div style="margin-top:6px;display:flex;align-items:center;justify-content:space-between">
              <span style="font-size:10px;color:var(--text-muted)">${p.lastActivity}</span>
              <span style="font-size:11px;font-weight:700;color:var(--blue)">${p.priorityScore}</span>
            </div>
            <div style="margin-top:8px;display:flex;gap:5px" onclick="event.stopPropagation()">
              ${nextStatus ? `
              <button onclick="setProspectStatus('${p.id}','${nextStatus}')"
                style="flex:1;font-size:10px;font-weight:700;padding:5px 6px;border-radius:7px;
                background:rgba(96,165,250,0.1);border:1px solid rgba(96,165,250,0.25);
                color:var(--blue);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                ${nextIcons[nextStatus]} ${nextStatus}
              </button>` : p.status === 'Dead' ? `
              <button onclick="showSnoozeModal('${p.id}')"
                style="flex:1;font-size:10px;font-weight:700;padding:5px 8px;border-radius:7px;
                background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.25);
                color:var(--amber);cursor:pointer">
                ♻️ Re-engage
              </button>` : p.status === 'Snoozed' ? `
              <span style="flex:1;font-size:9.5px;color:var(--amber);font-weight:600;
                padding:5px 0;display:flex;align-items:center;gap:4px">
                ⏰ ${snoozeBadge}
              </span>` : `
              <span style="flex:1;font-size:10px;color:var(--text-muted);padding:5px 0">
                ${p.status === 'Booked' ? '🎉 Booked!' : ''}
              </span>`}
              <button onclick="showStatusModal('${p.id}')"
                style="font-size:11px;padding:5px 8px;border-radius:7px;
                background:var(--bg-elevated);border:1px solid var(--border-subtle);
                color:var(--text-muted);cursor:pointer" title="Change status">⋯</button>
            </div>
          </div>`;
          }).join('')}
        </div>`).join('')}
      </div>
    </div>
    <div style="margin-top:20px">
      <div class="section-header"><div class="section-title"><div class="section-title-dot"></div>Upcoming Meetings (${upcoming.length})</div></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Prospect</th><th>Niche</th><th>Meeting Date</th><th>Rep</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            ${upcoming.map(p=>`<tr onclick="setActiveMeeting('${p.id}');navigate('meeting-prep')">
              <td><div style="font-weight:600;color:var(--text-primary)">${getDisplayName(p)}</div>
              <div style="font-size:10.5px;color:var(--text-muted)">${p.title} · ${p.city} ${p.state}</div></td>
              <td><span class="tag">${p.niche}</span></td>
              <td><span style="color:${p.status==='Booked'?'var(--emerald)':'var(--amber)'};font-weight:600">${p.signals.nextEvent}</span></td>
              <td>${p.assignedRep}</td>
              <td>${getStatusPill(p.status)}</td>
              <td><button class="btn btn-ghost" style="font-size:11px;padding:4px 9px" onclick="event.stopPropagation();setActiveMeeting('${p.id}');navigate('meeting-prep')">Prep</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

function pageMeetingPrep() {
  const p = activeMeetingProspect || PROSPECTS.find(x=>x.status==='Booked') || PROSPECTS[0];
  if (!p) return `<div class="empty-state"><div class="empty-state-icon">📅</div><div class="empty-state-title">No prospects loaded yet</div><div class="empty-state-sub">Your pipeline is hydrating — come back in a moment.</div></div>`;

  const signals       = (p.signals && typeof p.signals === 'object' && !Array.isArray(p.signals)) ? p.signals : {};
  const reasonCodes   = Array.isArray(p.reasonCodes) ? p.reasonCodes : [];
  const nextEvent     = signals.nextEvent     || p.lastActivity || 'Meeting scheduled';
  const estAssets     = signals.estimatedAssets || p.assets || p.estimatedAUM || 'Significant assets';
  const relationship  = signals.relationship  || 'New prospect';
  const niche         = p.niche || p.nicheId  || 'this niche';
  const title         = p.title   || '';
  const company       = p.company || '';
  const reason0       = reasonCodes[0]        || 'High-priority prospect matching your niche criteria';
  const priorityScore = p.priorityScore       || 72;
  const savedNote     = NOTES_STORE[p.id]     || '';
  const upcoming      = PROSPECTS.filter(x=>['Booked','Meeting Requested'].includes(x.status));

  const upcomingHTML = upcoming.map(x => {
    const xSig  = (x.signals && typeof x.signals === 'object') ? x.signals : {};
    const xNext = xSig.nextEvent || x.lastActivity || 'Meeting scheduled';
    return `<div class="queue-item" style="margin-bottom:6px;${x.id===p.id?'border-color:var(--blue);background:rgba(96,165,250,0.06)':''}" onclick="setActiveMeeting('${x.id}')">
      <div class="queue-avatar ${getAvatarClass(x.lastName || x.company || '')}" style="width:28px;height:28px;font-size:10px;border-radius:6px">${getInitials(x.firstName,x.lastName,x.company)}</div>
      <div class="queue-info"><div class="queue-name">${getDisplayName(x)}</div><div class="queue-meta">${xNext}</div></div>
      ${getStatusPill(x.status)}
    </div>`;
  }).join('');

  const reasonTagsHTML = reasonCodes.length
    ? reasonCodes.map(r=>`<span class="reason-tag">${r}</span>`).join('')
    : `<span class="reason-tag">High AUM Potential</span><span class="reason-tag">Niche Match</span><span class="reason-tag">Advisor-Ready</span>`;

  const discoveryQs = [
    'Where are you today with financial planning — does anyone coordinate the full picture for you?',
    'What does the next 3–5 years look like — any major transitions on the horizon?',
    'What would a successful outcome from a relationship like this look like for you?',
    `How are you currently thinking about ${reason0.length > 60 ? 'your financial priorities' : reason0}?`
  ].map((q,i)=>`<div style="padding:8px 10px;background:var(--bg-elevated);border-radius:6px;font-size:12px;color:var(--text-secondary);margin-bottom:5px;line-height:1.6">${i+1}. ${q}</div>`).join('');

  const planningGaps = ['No coordinated strategy across all asset classes','Unclear succession or transition timeline','Suboptimal tax positioning at this wealth level','Estate and legacy documentation incomplete']
    .map((g,i)=>`<div class="signal-row"><span class="signal-label">${i+1}.</span><span class="signal-value">${g}</span></div>`).join('');

  return `
  <div class="page-header">
    <div class="page-header-left"><div class="page-title">Meeting Prep</div>
      <div class="page-subtitle">AI-generated pre-meeting dossier — show up sharp</div></div>
    <div class="page-actions">
      <button class="btn btn-secondary" onclick="showToast('Dossier exported to PDF','📄')">Export PDF</button>
      <button class="btn btn-primary" onclick="showToast('Dossier sent to your email','✅')">Email to Self</button>
    </div>
  </div>
  <div class="section">
    <div class="grid-12">
      <div>
        <div class="section-header"><div class="section-title"><div class="section-title-dot"></div>Select Meeting (${upcoming.length})</div></div>
        ${upcoming.length===0 ? `<div class="empty-state"><div class="empty-state-icon">📅</div><div class="empty-state-title">No meetings booked yet</div><div class="empty-state-sub">Book meetings in Nurture &amp; Booking to prep here.</div></div>` : ''}
        ${upcomingHTML}
      </div>
      <div>
        <div class="agent-thinking" style="margin-bottom:12px">
          <div class="agent-dots"><span>💎</span><span>💎</span><span>💎</span></div>
          Meeting Prep Agent · Dossier ready for ${p.firstName || getDisplayName(p)}
        </div>
        <div class="dossier-card">
          <div class="dossier-header">
            <div class="dossier-avatar ${getAvatarClass(p.lastName || p.company || '')}">${getInitials(p.firstName,p.lastName,p.company)}</div>
            <div>
              <div style="font-size:15px;font-weight:800;color:var(--text-primary)">${getDisplayName(p)}</div>
              <div style="font-size:12px;color:var(--text-muted)">${[title,company].filter(Boolean).join(' · ') || niche}</div>
              <div style="font-size:12px;color:var(--blue);margin-top:2px">📅 ${nextEvent}</div>
            </div>
            <div style="margin-left:auto;text-align:right">
              <div style="font-size:22px;font-weight:900;color:var(--text-primary)">${priorityScore}</div>
              <div style="font-size:10px;color:var(--text-muted)">Priority Score</div>
            </div>
          </div>
          <div class="dossier-body">
            <div class="drawer-section-title">Why This Meeting Matters</div>
            <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.7;margin-bottom:14px">
              ${p.firstName || 'This prospect'} is in the ${niche.toLowerCase()} niche with estimated ${estAssets} in assets. ${reason0}. Relationship status: ${relationship}.
            </div>
            <div class="drawer-section-title">Key Signals</div>
            <div style="margin-bottom:14px">${reasonTagsHTML}</div>
            <div class="drawer-section-title">Likely Planning Gaps</div>
            <div style="margin-bottom:14px">${planningGaps}</div>
            <div class="drawer-section-title">Discovery Questions</div>
            <div style="margin-bottom:14px">${discoveryQs}</div>
            <div class="drawer-section-title">Pre-Meeting Notes</div>
            <textarea class="form-textarea" id="meeting-notes-${p.id}" placeholder="Add your notes before the meeting…">${savedNote}</textarea>
            <div style="display:flex;gap:8px;margin-top:10px">
              <button class="btn btn-primary" style="flex:1" onclick="saveNotes('${p.id}')">Save Notes</button>
              <button class="btn btn-secondary" onclick="setOutreachProspect('${p.id}');navigate('outreach-studio')">Post-Meeting Outreach</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}


function pageManagerConsole() {
  const M = computeMetrics();
  const NM = computeNicheMetrics();
  const sourceData = [
    {source:'Prospect Mine Agent', count:PROSPECTS.filter(p=>p.source==='Prospect Mine').length, conv:'22%', trend:'↑'},
    {source:'Referrals',           count:PROSPECTS.filter(p=>p.source.startsWith('Referral')).length, conv:'38%', trend:'↑'},
    {source:'Events / Forums',     count:PROSPECTS.filter(p=>p.source.startsWith('Event')).length, conv:'29%', trend:'→'},
    {source:'CSV Import',          count:PROSPECTS.filter(p=>p.source==='CSV Import').length, conv:'14%', trend:'→'},
    {source:'LinkedIn',            count:PROSPECTS.filter(p=>p.source==='LinkedIn').length, conv:'17%', trend:'↑'},
  ];

  return `
  <div class="page-header">
    <div class="page-header-left"><div class="page-title">Manager Console</div>
      <div class="page-subtitle">Team performance, pipeline velocity, and niche conversion intelligence</div></div>
    <div class="page-actions">
      <div class="tab-bar" id="period-tab">
        <button class="tab-btn active" onclick="switchTab(this,'period-tab')">This Month</button>
        <button class="tab-btn" onclick="switchTab(this,'period-tab')">Last 90 Days</button>
        <button class="tab-btn" onclick="switchTab(this,'period-tab')">YTD</button>
      </div>
    </div>
  </div>
  <div class="kpi-strip">
    <div class="gem-metric"><div class="gem-metric-label">Total Prospects</div><div class="gem-metric-value">${M.total}</div><div class="gem-metric-sub">↑ ${M.newThisWeek || 0} new this week</div></div>
    <div class="gem-metric"><div class="gem-metric-label">Meetings Booked</div><div class="gem-metric-value">${M.booked}</div><div class="gem-metric-sub">↑ +2 vs last month</div></div>
    <div class="gem-metric"><div class="gem-metric-label">Contact Rate</div><div class="gem-metric-value">${M.contactRate}%</div><div class="gem-metric-sub">Target: 50%</div></div>
    <div class="gem-metric"><div class="gem-metric-label">Reply Rate</div><div class="gem-metric-value">${M.replyRate}%</div><div class="gem-metric-sub">Industry avg: 8%</div></div>
    <div class="gem-metric"><div class="gem-metric-label">Mtg → Conv.</div><div class="gem-metric-value">${M.convRate}%</div><div class="gem-metric-sub">Industry avg: 15%</div></div>
    ${(()=>{
      const ups   = Object.values(FEEDBACK_STORE).filter(v=>v==='up').length;
      const downs = Object.values(FEEDBACK_STORE).filter(v=>v==='down').length;
      const total = ups + downs;
      return `<div class="gem-metric" style="border-color:rgba(52,211,153,0.2)">
        <div class="gem-metric-label">Pilot Quality Ratings</div>
        <div class="gem-metric-value" style="font-size:18px">👍 ${ups} &nbsp; 👎 ${downs}</div>
        <div class="gem-metric-sub">${total} of ${M.total} rated</div>
      </div>`;
    })()}
  </div>
  <div class="section">
    <div class="grid-2">
      <div>
        <div class="section-header"><div class="section-title"><div class="section-title-dot"></div>Rep Leaderboard</div></div>
        <div class="card">
          ${TEAM_REPS.map(r=>`<div class="rep-row">
            <div class="rep-row-avatar ${r.color}">${r.initials}</div>
            <div class="rep-row-info"><div class="rep-row-name">${r.name}</div><div class="rep-row-sub">${r.contacted} contacted · ${r.booked} booked</div></div>
            <div><div class="rep-row-stat">${r.booked}</div><div class="rep-row-stat-label">Meetings</div></div>
          </div>`).join('')}
        </div>
        <div class="section-header" style="margin-top:16px"><div class="section-title"><div class="section-title-dot"></div>Niche Conversion</div></div>
        <div class="card">
          <div class="perf-bar-wrap">
            ${NM.map(n=>`<div class="perf-bar-item">
              <div class="perf-bar-label"><span class="perf-bar-label-name">${n.icon} ${n.name}</span><span class="perf-bar-label-val">${n.convPct}%</span></div>
              <div class="perf-bar-track"><div class="perf-bar-fill" style="width:${Math.min(n.convPct*2,100)}%;background:${n.color}"></div></div>
            </div>`).join('')}
          </div>
        </div>
      </div>
      <div>
        <div class="section-header"><div class="section-title"><div class="section-title-dot"></div>Pipeline Velocity</div></div>
        <div class="card" style="margin-bottom:12px">
          ${PIPELINE_COLUMNS.slice(0,-1).map((col,i)=>{
            const cnt=PROSPECTS.filter(p=>p.status===col).length;
            const w=Math.max(10,cnt/PROSPECTS.length*100);
            return `<div style="margin-bottom:8px">
              <div class="perf-bar-label"><span class="perf-bar-label-name">${col}</span><span class="perf-bar-label-val">${cnt}</span></div>
              <div class="perf-bar-track" style="height:10px;border-radius:5px">
                <div class="perf-bar-fill" style="width:${w}%;background:linear-gradient(90deg,#60a5fa,#a78bfa);height:100%;border-radius:5px"></div>
              </div></div>`;
          }).join('')}
        </div>
        <div class="section-header"><div class="section-title"><div class="section-title-dot"></div>Source Quality</div></div>
        <div class="card">
          ${sourceData.filter(s=>s.count>0).map(s=>`<div class="signal-row">
            <span class="signal-label">${s.source}</span>
            <span style="font-size:11px;color:var(--text-muted)">${s.count} prospects</span>
            <span class="signal-value" style="color:${s.trend==='↑'?'var(--emerald)':s.trend==='↓'?'var(--rose)':'var(--amber)'}">${s.trend} ${s.conv}</span>
          </div>`).join('')}
        </div>
        <div class="section-header" style="margin-top:16px"><div class="section-title"><div class="section-title-dot"></div>Pilot Prospect Ratings</div></div>
        <div class="card">
          ${(()=>{
            const rated = PROSPECTS.filter(p => FEEDBACK_STORE[p.id]);
            if (!rated.length) return `<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:16px 0">
              No ratings yet — open any prospect and rate quality with 👍/👎</div>`;
            return rated.map(p => `<div class="signal-row">
              <span class="signal-label">${p.firstName} ${p.lastName}</span>
              <span style="font-size:10.5px;color:var(--text-muted)">${p.niche}</span>
              <span style="font-size:16px">${FEEDBACK_STORE[p.id]==='up'?'👍':'👎'}</span>
            </div>`).join('');
          })()}
        </div>
      </div>
    </div>
  </div>`;
}

// ==========================================
// NICHE MAPPING WIZARD — v2.1 (Macro→Preview→Meso→Micro→Results)
// ==========================================

function pageNicheMapping() {
  const saved  = loadSavedNicheProfile();
  const stage  = nicheWizardStage;
  const path   = nichePath;

  // Stage questions
  const macroQs = MACRO_QUESTIONS;
  const mesoQs  = path ? path.meso  : [];
  const microQs = path ? path.micro : [];

  // stage: 0=macro, 1=preview, 2=meso, 3=micro, 4=results
  const stageConfigs = [
    { qs: macroQs,  title: 'Macro Scan',        sub: '8 broad questions to establish your baseline.', pct: 20  },
    { qs: [],       title: 'Quick Preview',      sub: 'Your early niche read — based on 8 questions.', pct: 40  },
    { qs: mesoQs,   title: 'Cluster Refinement', sub: 'Adaptive questions narrowing your top niche clusters.', pct: 60  },
    { qs: microQs,  title: 'Niche Deep Dive',    sub: 'Final calibration — precision questions for your top candidates.', pct: 80  },
    { qs: [],       title: 'Results',             sub: '', pct: 100 },
  ];
  const sc = stageConfigs[Math.min(stage, 4)];
  const currentQs = sc.qs;

  const totalAnswered = Object.keys(nicheAnswers).length;

  const zoneColors = {
    fit: 'var(--blue)', focus: 'var(--violet)', market: 'var(--cyan)',
    access: 'var(--emerald)', service: 'var(--amber)'
  };

  function renderProgressBar() {
    const labels = ['Macro Scan','Quick Preview','Cluster Refinement','Niche Deep Dive','Results'];
    return `
    <div class="wizard-progress-wrap">
      <div class="wizard-progress-track">
        <div class="wizard-progress-fill" style="width:${sc.pct}%"></div>
      </div>
      <div class="wizard-progress-labels">
        ${labels.map((l,i) => `<span class="wizard-progress-label ${stage > i ? 'done' : stage === i ? 'active' : ''}">${l}</span>`).join('')}
      </div>
    </div>`;
  }

  function renderQuestion(q, idx, total) {
    const answered = nicheAnswers[q.id] !== undefined;
    return `
    <div class="wizard-question${answered ? ' answered' : ''}" id="wq-${q.id}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px">
        <span class="wizard-question-label">Q${idx + 1} of ${total}</span>
        <span class="zone-badge zone-${q.zone}">${NICHE_ZONE_CONFIG[q.zone].label}</span>
      </div>
      <div class="wizard-question-text">${q.text}</div>
      <div class="likert-group" id="lg-${q.id}">
        ${q.options.map((opt, i) => `
        <button class="likert-btn${nicheAnswers[q.id] === i ? ' selected' : ''}"
          onclick="selectNicheAnswer('${q.id}',${i})" id="lb-${q.id}-${i}">
          ${opt}
        </button>`).join('')}
      </div>
    </div>`;
  }

  function renderResultCards(profile) {
    const rankLabels = ['#1 Best Fit', '#2 Strong Match', '#3 Good Match'];
    const rankCls    = ['rank-1','rank-2','rank-3'];
    return profile.top3.map((n, i) => {
      const zoneData  = n.zoneBreakdown || {};
      const zoneOrder = ['fit','focus','market','access','service'];
      return `
      <div class="niche-result-card ${rankCls[i]}" style="--niche-color:${n.color}">
        <div class="nrc-header">
          <div class="nrc-left">
            <div class="nrc-icon">${n.icon}</div>
            <div>
              <div class="nrc-name">${n.name}</div>
              <div class="nrc-rank-badge">${rankLabels[i]}</div>
            </div>
          </div>
          <div class="match-ring-wrap">
            <div class="match-ring" style="--pct:${n.score};--niche-color:${n.color}">
              <div class="match-ring-val">${n.score}</div>
            </div>
            <div class="match-ring-label">Match</div>
          </div>
        </div>
        <div class="zone-breakdown">
          ${zoneOrder.map(z => `
          <div class="zone-breakdown-row">
            <span class="zone-breakdown-label">${NICHE_ZONE_CONFIG[z].label}</span>
            <div class="zone-breakdown-track">
              <div class="zone-breakdown-fill" style="width:${zoneData[z] || 0}%;background:${zoneColors[z]}"></div>
            </div>
            <span class="zone-breakdown-val">${zoneData[z] || 0}%</span>
          </div>`).join('')}
        </div>
        ${i === 0 ? `
        <div class="drawer-section-title" style="margin-top:14px">Recommended Messaging Angle</div>
        <div class="messaging-angle-block" style="--niche-color:${n.color}">${profile.messagingAngle}</div>` : ''}
      </div>`;
    }).join('');
  }

  function renderICPPreview(profile) {
    const icp = profile.icpBlock;
    return `
    <div class="icp-preview-block">
      <div class="icp-preview-title">Generated ICP Profile — Ready to Apply</div>
      <div class="icp-preview-row"><span class="icp-preview-key">Primary Niche</span><span class="icp-preview-val">${icp.primaryNiche}</span></div>
      <div class="icp-preview-row"><span class="icp-preview-key">Min Assets</span><span class="icp-preview-val">${icp.minAssets}</span></div>
      <div class="icp-preview-row"><span class="icp-preview-key">Professions</span><span class="icp-preview-val">${icp.professions}</span></div>
      <div class="icp-preview-row"><span class="icp-preview-key">Life Event Triggers</span><span class="icp-preview-val">${icp.lifeEventTriggers}</span></div>
      <div class="icp-preview-row"><span class="icp-preview-key">Messaging Angle</span><span class="icp-preview-val">${icp.messagingAngle.split('.')[0]}.</span></div>
    </div>`;
  }

  // ── STAGE 1: QUICK PREVIEW ────────────────────────────────────────────────
  if (stage === 1 && nichePreviewScores) {
    const ps = nichePreviewScores;
    const _previewAllRanked = Object.entries(ps.nicheScores)
      .sort((a,b) => b[1]-a[1])
      .map(([id,score]) => ({ id, score, ...NICHE_MAP[id] }));
    const _previewQualified = _previewAllRanked.filter(n => n.score >= (typeof NICHE_MIN_SCORE_THRESHOLD !== 'undefined' ? NICHE_MIN_SCORE_THRESHOLD : 15));
    const previewRanked = (_previewQualified.length >= 3 ? _previewQualified : _previewAllRanked).slice(0, 3);
    const zoneOrder = ['fit','focus','market','access','service'];
    const totalMesoMicro = (path ? path.meso.length + path.micro.length : 0);

    return `
    <div class="page-header">
      <div class="page-header-left">
        <div class="page-title">🧭 Your Early Niche Read</div>
        <div class="page-subtitle">Preliminary matches based on 8 macro questions — refine with ${totalMesoMicro} more to lock in precision scores</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-ghost" onclick="backNicheWizard()">← Back</button>
      </div>
    </div>
    <div class="wizard-shell" style="max-width:820px">
      ${renderProgressBar()}
      <div style="background:rgba(96,165,250,0.07);border:1px solid rgba(96,165,250,0.2);border-radius:14px;padding:16px 20px;margin-bottom:20px;display:flex;align-items:flex-start;gap:14px">
        <span style="font-size:24px">⚡</span>
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--blue);margin-bottom:4px">This is your early signal — not your final score</div>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.6">The engine has scored your macro answers across all 12 niches. Complete ${totalMesoMicro} more targeted questions to unlock precision scores, zone-by-zone breakdowns, and your generated ICP profile.</div>
        </div>
      </div>
      <div class="section-header" style="margin-bottom:14px"><div class="section-title"><div class="section-title-dot"></div>Preliminary Top 3 Niche Matches</div></div>
      ${previewRanked.map((n, i) => {
        const zs = ps.zoneScores[n.id] || {};
        const rankLabels = ['#1 Early Lead','#2 Strong Candidate','#3 Possible Fit'];
        const rankCls = ['rank-1','rank-2','rank-3'];
        return `
        <div class="niche-result-card ${rankCls[i]}" style="--niche-color:${n.color};opacity:${i===0?1:i===1?0.9:0.8}">
          <div class="nrc-header">
            <div class="nrc-left">
              <div class="nrc-icon">${n.icon}</div>
              <div>
                <div class="nrc-name">${n.name}</div>
                <div class="nrc-rank-badge">${rankLabels[i]}</div>
              </div>
            </div>
            <div class="match-ring-wrap">
              <div class="match-ring" style="--pct:${n.score};--niche-color:${n.color}">
                <div class="match-ring-val">${n.score}</div>
              </div>
              <div class="match-ring-label" style="color:var(--text-muted)">Early Est.</div>
            </div>
          </div>
          <div class="zone-breakdown">
            ${zoneOrder.map(z => `
            <div class="zone-breakdown-row">
              <span class="zone-breakdown-label">${NICHE_ZONE_CONFIG[z].label}</span>
              <div class="zone-breakdown-track">
                <div class="zone-breakdown-fill" style="width:${zs[z]||0}%;background:${zoneColors[z]};opacity:0.7"></div>
              </div>
              <span class="zone-breakdown-val" style="color:var(--text-muted)">${zs[z]||0}%*</span>
            </div>`).join('')}
          </div>
          ${i === 0 ? `<div style="margin-top:10px;font-size:11px;color:var(--text-muted)">* Scores will sharpen after ${totalMesoMicro} more questions</div>` : ''}
        </div>`;
      }).join('')}
      <div class="apply-cta" style="margin-top:20px">
        <div>
          <div class="apply-cta-text">Refine your scores to get precision results</div>
          <div class="apply-cta-sub">${totalMesoMicro} more targeted questions → zone-by-zone breakdown + generated ICP profile ready to apply.</div>
        </div>
        <div class="apply-cta-actions">
          <button class="btn btn-ghost" onclick="_computeAndShowResults()" title="Skip refinement and use these preliminary results">Use Early Results</button>
          <button class="btn btn-primary" onclick="advanceNicheWizard()">Refine My Results → (${totalMesoMicro} questions)</button>
        </div>
      </div>
    </div>`;
  }

  // ── STAGE 4: RESULTS ──────────────────────────────────────────────────────
  if (stage === 4 && nicheProfile) {
    const profile = nicheProfile;
    const totalQsShown = (path ? path.macro.length + path.meso.length + path.micro.length : macroQs.length);
    const completedDate = profile.completedAt ? new Date(profile.completedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '';
    return `
    <div class="page-header">
      <div class="page-header-left">
        <div class="page-title">🧭 Your Niche Profile</div>
        <div class="page-subtitle">Completed ${completedDate} · ${totalQsShown} questions · auto-saved to this device</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-ghost" onclick="resetNicheWizard()" title="Clear all answers and start over">↺ Retake</button>
        <button class="btn btn-ghost" onclick="downloadNicheProfile()" title="Download profile as JSON file">⬇ JSON</button>
        <button class="btn btn-secondary" onclick="printNicheProfile()">🖨️ Print / PDF</button>
        <button class="btn btn-primary" onclick="applyProfileToSettings()">✓ Apply to ICP</button>
      </div>
    </div>
    <div class="wizard-shell" style="max-width:820px">
      ${renderProgressBar()}
      <div class="results-intro">
        <div class="results-intro-icon">🏆</div>
        <div>
          <div class="results-intro-title">Top Match: ${profile.top3[0].icon} ${profile.top3[0].name}</div>
          <div class="results-intro-sub">
            Score: <strong>${profile.top3[0].score}/100</strong> — based on your background, market, access points, and service model.
            Your results are saved — you won't need to redo this unless you want to change niches.
          </div>
        </div>
      </div>
      <div class="saved-profile-banner" style="cursor:default;margin-bottom:16px">
        <span style="font-size:18px">💾</span>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:700;color:var(--emerald)">Profile saved to this device</div>
          <div style="font-size:11px;color:var(--text-muted)">Automatically restored on every visit · Click "Change Niche" to run a new assessment</div>
        </div>
        <button class="btn btn-ghost" style="font-size:11px;padding:4px 10px" onclick="resetNicheWizard()">Change Niche</button>
      </div>
      <div class="section-header" style="margin-bottom:14px"><div class="section-title"><div class="section-title-dot"></div>Your Niche Rankings</div></div>
      ${renderResultCards(profile)}
      ${renderICPPreview(profile)}
      <div class="apply-cta">
        <div>
          <div class="apply-cta-text">Ready to fire up the Prospect Mine?</div>
          <div class="apply-cta-sub">Apply your niche profile to Settings & ICP, then let the Mine Agent run your first cohort.</div>
        </div>
        <div class="apply-cta-actions">
          <button class="btn btn-secondary" onclick="navigate('prospect-mine')">Go to Mine →</button>
          <button class="btn btn-primary" onclick="applyProfileToSettings()">Apply ICP + Go to Settings</button>
        </div>
      </div>

    </div>`;
  }

  // ── STAGES 0, 2, 3: QUESTION STAGES ─────────────────────────────────────────────
  const answeredCount = currentQs.filter(q => nicheAnswers[q.id] !== undefined).length;
  const allAnswered   = answeredCount === currentQs.length && currentQs.length > 0;
  // isLastQStage: stage 3 (micro) OR stage 2 (meso) when no micro questions
  const isLastQStage  = (stage === 3) || (stage === 2 && (!path || path.micro.length === 0));

  const stagePageTitles = ['🧭 Niche Mapping Engine', '', '🧭 Cluster Refinement', '🧭 Niche Deep Dive'];
  const nextBtnText     = isLastQStage ? 'See My Results 🎯' : `Next: ${stageConfigs[stage + 1]?.title} →`;

  if (stage === 0) {
    return `
    <div class="page-header">
      <div class="page-header-left">
        <div class="page-title">🧭 Niche Mapping Engine</div>
        <div class="page-subtitle">Adaptive assessment → top 3 niche matches + generated ICP profile · ~5–7 minutes</div>
      </div>
      <div class="page-actions">
        ${totalAnswered > 0 ? `<button class="btn btn-ghost" onclick="_saveAnswersCache();nicheWizardStage=0;showToast('Progress saved — pick up right where you left off','💾');navigate('command-center')">💾 Save & Exit</button>` : ''}
        ${saved ? `<button class="btn btn-ghost" onclick="viewSavedProfile()">View Last Results</button>` : ''}
      </div>
    </div>
    <div class="wizard-shell">
      ${saved ? `
      <div class="saved-profile-banner" onclick="viewSavedProfile()">
        <span style="font-size:20px">📊</span>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:700;color:var(--emerald)">Previous results — ${saved.top3[0].icon} ${saved.top3[0].name} (${saved.top3[0].score}/100)</div>
          <div style="font-size:11px;color:var(--text-muted)">Completed ${new Date(saved.completedAt).toLocaleDateString()} · Click to view</div>
        </div>
        <span style="font-size:11px;color:var(--emerald);font-weight:600">View →</span>
      </div>` : ''}
      ${renderProgressBar()}
      <div class="wizard-stage">
        <div class="wizard-stage-header">
          <div class="wizard-stage-title">Stage 1 of 3 — Macro Scan</div>
          <div class="wizard-stage-sub">8 broad questions that calibrate your baseline across all 12 niches. The engine uses these to build your personalised path for Stages 2 and 3.</div>
        </div>
        ${macroQs.map((q, i) => renderQuestion(q, i, macroQs.length)).join('')}
        <div class="wizard-nav">
          <div class="wizard-nav-meta">${answeredCount} of ${macroQs.length} answered</div>
          <button class="btn btn-primary" onclick="advanceNicheWizard()" ${allAnswered ? '' : 'disabled style="opacity:0.5;cursor:not-allowed"'}>
            Next: Cluster Refinement →
          </button>
        </div>
      </div>
    </div>`;
  }

  // Stages 1 (meso) and 2 (micro) share same template
  return `
  <div class="page-header">
    <div class="page-header-left">
      <div class="page-title">${stagePageTitles[stage] || '🧭 Niche Mapping'}</div>
      <div class="page-subtitle">${sc.sub}</div>
    </div>
    <div class="page-actions">
      <button class="btn btn-ghost" onclick="backNicheWizard()">← Back</button>
      <button class="btn btn-ghost" onclick="_saveAnswersCache();nicheWizardStage=0;showToast('Progress saved — pick up right where you left off','💾');navigate('command-center')">💾 Save & Exit</button>
    </div>
  </div>
  <div class="wizard-shell">
    ${renderProgressBar()}
    <div class="wizard-stage">
      <div class="wizard-stage-header">
        <div class="wizard-stage-title">Stage ${stage + 1} of 3 — ${sc.title}</div>
        <div class="wizard-stage-sub">${sc.sub} Answer as honestly as possible — the engine rewards accuracy.</div>
      </div>
      ${currentQs.length === 0
        ? `<div style="padding:32px;text-align:center;color:var(--text-muted)">
             <div style="font-size:32px;margin-bottom:12px">⚡</div>
             <div style="font-weight:700;color:var(--text-primary)">Skipping this stage</div>
             <div style="font-size:12px;margin-top:6px">The engine didn't find relevant questions for this cluster based on your macro answers.</div>
           </div>`
        : currentQs.map((q, i) => renderQuestion(q, i, currentQs.length)).join('')
      }
      <div class="wizard-nav">
        <div class="wizard-nav-meta">${answeredCount} of ${currentQs.length} answered</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost" onclick="backNicheWizard()">← Back</button>
          <button class="btn btn-primary" onclick="${isLastQStage ? 'scoreAndShowResults' : 'advanceNicheWizard'}()"
            ${(allAnswered || currentQs.length === 0) ? '' : 'disabled style="opacity:0.5;cursor:not-allowed"'}>
            ${(allAnswered || currentQs.length === 0) ? nextBtnText : `${answeredCount}/${currentQs.length} Answered`}
          </button>
        </div>
      </div>
    </div>
  </div>`;
}

function pageSettings() {
  const cfg = ICP_CONFIG;
  const ap  = window._advisorProfile || {};
  return `
  <div class="page-header">
    <div class="page-header-left"><div class="page-title">Settings &amp; ICP</div>
      <div class="page-subtitle">Ideal Client Profile (ICP) — define who you serve best, and configure how the engine routes and mines leads for you</div></div>
    <div class="page-actions">
      <button class="btn btn-secondary" onclick="saveAdvisorProfile()">Save Profile</button>
      <button class="btn btn-primary" onclick="saveICP()">Save ICP</button>
    </div>
  </div>
  <div class="section">
    <div class="grid-2">
      <div>
        <div class="section-header"><div class="section-title"><div class="section-title-dot"></div>Ideal Client Profile</div></div>
        <div class="card">
          <div class="form-group"><label class="form-label">Primary Niche Focus</label>
            <select class="form-select" id="icp-niche">
              ${NICHES.map(n=>`<option ${cfg.primaryNiche===n.name?'selected':''}>${n.name}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">Minimum Investable Assets</label>
            <select class="form-select" id="icp-assets">
              ${['$500K','$1M','$2M','$5M'].map(v=>`<option ${cfg.minAssets===v?'selected':''}>${v}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">Target Geography</label>
            <input class="form-input" id="icp-geo" value="${cfg.geography}"></div>
          <div class="form-group"><label class="form-label">Professions / Affiliations</label>
            <input class="form-input" id="icp-prof" value="${cfg.professions}"></div>
          <div class="form-group"><label class="form-label">Life Event Triggers</label>
            <input class="form-input" id="icp-events" value="${cfg.lifeEventTriggers}"></div>
          <div class="form-group">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px">
              <label class="form-label" style="margin-bottom:0">Messaging Angle</label>
              <span id="icp-message-count" style="font-size:10.5px;color:var(--text-muted);font-variant-numeric:tabular-nums">
                ${(cfg.messagingAngle||'').length} / 150 chars
              </span>
            </div>
            <textarea class="form-textarea" id="icp-message"
              placeholder="e.g. 'Simplify your equity comp before IPO lock-up expires — keep more of what you've earned.'"
              oninput="(function(el){
                const len = el.value.length;
                const counter = document.getElementById('icp-message-count');
                if (counter) {
                  counter.textContent = len + ' / 150 chars';
                  counter.style.color = len > 300 ? 'var(--rose)' : len > 150 ? 'var(--amber)' : 'var(--text-muted)';
                }
              })(this)"
            >${cfg.messagingAngle}</textarea>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:5px;line-height:1.5">
              💡 Keep it under 150 chars — this drives your AI-generated outreach subject lines and opening hooks. One clear pain point or opportunity works best.
            </div>
          </div>
        </div>

        <div class="section-header" style="margin-top:20px"><div class="section-title"><div class="section-title-dot"></div>Advisor Routing Profile &nbsp;<span style="font-size:10px;color:var(--text-secondary);font-weight:600;letter-spacing:0.04em;background:rgba(96,165,250,0.1);padding:2px 8px;border-radius:20px" title="This profile tells the AUM Engine which leads to route to you based on your niche, geography, licensing, and capacity.">Lead Routing Config</span></div></div>
        <div class="card">
          <div style="font-size:11px;color:var(--text-muted);line-height:1.6;margin-bottom:16px;padding:10px 12px;background:rgba(96,165,250,0.06);border-radius:8px;border-left:3px solid var(--blue)">
            This profile powers the lead routing engine — it determines which leads you're eligible to receive based on your niche, geography, licensing, and capacity.
          </div>
          <div class="form-group"><label class="form-label">Advisor Type</label>
            <select class="form-select" id="ap-type">
              ${['Independent RIA','Wirehouse','Hybrid RIA','Broker-Dealer','Insurance-Based'].map(v=>`<option ${(ap.advisorType||'')===(v)?'selected':''}>${v}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">Licensed States (comma-separated, e.g. AZ, TX, KS)</label>
            <input class="form-input" id="ap-states" value="${(ap.licensedStates||[]).join(', ')}" placeholder="AZ, TX, KS"></div>
          <div class="form-group"><label class="form-label">Service Capabilities</label>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
              ${[['Retirement Income','retirement_income'],['Business Owner Liquidity','business_owner_liquidity'],['Equity Comp','equity_comp'],['Inheritance Planning','inheritance_planning'],['Estate Planning','estate_planning'],['Tax Planning','tax_planning']].map(([label,key])=>{
                const active = (ap.serviceCapabilities||[]).includes(key);
                return `<div class="filter-chip ${active?'active':''}" onclick="this.classList.toggle('active')" data-cap="${key}">${label}</div>`;
              }).join('')}
            </div></div>
          <div class="form-group"><label class="form-label">Target AUM Bands</label>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
              ${[['<500k','Under $500K'],['500k-1m','$500K–$1M'],['1m-5m','$1M–$5M'],['5m+','$5M+']].map(([key,label])=>{
                const active = (ap.targetAUMBands||[]).includes(key);
                return `<div class="filter-chip ${active?'active':''}" onclick="this.classList.toggle('active')" data-band="${key}">${label}</div>`;
              }).join('')}
            </div></div>
          <div class="grid-2" style="gap:12px">
            <div class="form-group"><label class="form-label">Max Active Leads</label>
              <input class="form-input" id="ap-lead-cap" type="number" value="${ap.activeLeadCap||25}" min="1" max="100"></div>
            <div class="form-group"><label class="form-label">Meetings/Week Available</label>
              <input class="form-input" id="ap-calendar" type="number" value="${ap.calendarCapacity||8}" min="1" max="40"></div>
          </div>
          <div class="form-group"><label class="form-label">Firm Name</label>
            <input class="form-input" id="ap-firm" value="${ap.firmName||''}"></div>
          <div class="form-group"><label class="form-label">Primary Office (City, State)</label>
            <input class="form-input" id="ap-office" value="${ap.officeLocations&&ap.officeLocations[0]?ap.officeLocations[0].city+', '+ap.officeLocations[0].state:''}" placeholder="Phoenix, AZ"></div>
          <div class="form-group">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px">
              <label class="form-label" style="margin-bottom:0">📅 Booking Link <span style="color:var(--rose);font-size:11px;font-weight:600">Required for outreach</span></label>
            </div>
            <input class="form-input" id="ap-booking-link"
              type="url"
              value="${ICP_CONFIG?.bookingLink || localStorage.getItem('aum_booking_link') || ''}"
              placeholder="https://calendly.com/yourname/30min"
              oninput="(function(el){\n                const warn = document.getElementById('ap-booking-link-warn');\n                if (warn) warn.style.display = el.value.trim() ? 'none' : 'block';\n              })(this)">
            <div id="ap-booking-link-warn" style="font-size:11px;color:var(--amber);margin-top:5px;${(ICP_CONFIG?.bookingLink || localStorage.getItem('aum_booking_link')) ? 'display:none' : ''}">
              ⚠️ Booking link not set — advisors cannot send outreach booking emails without this.
            </div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:4px">Calendly, Acuity, or any scheduling URL. Embedded in all outreach emails.</div>
          </div>
          <button class="btn btn-secondary" style="width:100%;margin-top:8px" onclick="(async function(){
            const bookLink = document.getElementById('ap-booking-link')?.value?.trim();
            if (bookLink && bookLink.startsWith('http')) {
              if (typeof ICP_CONFIG !== 'undefined') ICP_CONFIG.bookingLink = bookLink;
              try { localStorage.setItem('aum_booking_link', bookLink); } catch(e) {}
              if (typeof saveBookingLink === 'function' && typeof currentUID !== 'undefined' && currentUID) {
                await saveBookingLink(currentUID, bookLink).catch(()=>{});
              }
            }
            saveAdvisorProfile();
          })()">💾 Save Routing Profile</button>

        </div>
      </div>
      <div>
        <div class="section-header"><div class="section-title"><div class="section-title-dot"></div>Agent Configuration</div></div>
        <div class="card" style="margin-bottom:12px">
          ${[{name:'ICP Agent',desc:'Refines ideal client profile rules',status:'Active'},
             {name:'Prospect Miner Agent',desc:'Generates candidate lists from niche parameters',status:'Active'},
             {name:'Enrichment Agent',desc:'Appends context, relationship hints, timing signals',status:'Active'},
             {name:'Fit Score Agent',desc:'Creates priority score with reason codes',status:'Active'},
             {name:'Outreach Agent',desc:'Drafts personalized messaging per prospect',status:'Active'},
             {name:'Nurture Agent',desc:'Manages unready leads and reactivation logic',status:'Beta'},
             {name:'Meeting Prep Agent',desc:'Generates pre-meeting dossiers',status:'Active'},
             {name:'Manager Agent',desc:'Summarizes team performance and conversion insights',status:'Active'}]
            .map(a=>`<div class="signal-row">
              <div><div class="signal-value" style="font-size:12px;font-weight:600">${a.name}</div>
              <div style="font-size:10.5px;color:var(--text-muted)">${a.desc}</div></div>
              <span class="status-pill ${a.status==='Active'?'pill-booked':a.status==='Beta'?'pill-nurture':'pill-new'}">${a.status}</span>
            </div>`).join('')}
        </div>
        <div class="section-header"><div class="section-title"><div class="section-title-dot"></div>Team Members</div></div>
        <div class="card">
          ${TEAM_REPS.map(r=>`<div class="rep-row">
            <div class="rep-row-avatar ${r.color}">${r.initials}</div>
            <div class="rep-row-info"><div class="rep-row-name">${r.name}</div><div class="rep-row-sub">${r.role}</div></div>
            <button class="btn btn-ghost" style="font-size:11px;padding:4px 9px" onclick="showToast('Edit coming in Phase 2','💎')">Edit</button>
          </div>`).join('')}
          <button class="btn btn-secondary" style="width:100%;margin-top:10px" onclick="showToast('Team invite sent','✅')">+ Add Team Member</button>
        </div>
      </div>
    </div>
  </div>`;
}

// ================================================================
// CLIENT INTELLIGENCE — ED / Al Page Renderers
// Merged from EdAlTim — 2026-04-08 per Vera compliance plan
// ================================================================

// Expose on window so app.js navigate() can reset it when leaving the intake flow
window._edIntakeInitialized = false;

// ===== CLIENT INTAKE INBOX =====
function pageClientIntake() {
  const situations  = window._edSituations  || [];
  const uid         = (typeof currentUID !== 'undefined' && currentUID) ? currentUID : '';
  const intakeLink  = uid ? `${window.location.origin}/#ed-disclosure?ref=${uid}` : null;

  const _parseTs = (val) => {
    if (!val) return null;
    if (val?.toDate) return val.toDate();
    try { const d = new Date(val); return isNaN(d) ? null : d; } catch(e) { return null; }
  };
  const _fmt = (val) => {
    const d = _parseTs(val);
    return d ? d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
  };

  const wealthLabels = {
    under_500k:'Under $500K', '500k_1m':'$500K–$1M',
    '1m_3m':'$1M–$3M', '3m_10m':'$3M–$10M', over_10m:'$10M+'
  };
  const stageLabels = {
    liquidity_event:'Liquidity Event', recently_liquid:'Recently Liquid',
    transition:'Transition', accumulating:'Accumulating', preserving:'Preserving'
  };

  const statusBadge = (s) => {
    const map = {
      pending: ['var(--amber)', '⏳ Pending Review'],
      new:     ['var(--amber)', '⏳ Pending Review'],
      approved:['var(--emerald)','✅ In Planning Queue'],
      al_accepted:['var(--emerald)','✅ In Planning Queue'],
      pending_review:['var(--blue)','🔵 Brief Generated'],
      declined:['var(--rose)','↩ Returned'],
    };
    const [color, label] = map[s] || ['var(--text-muted)','— Unknown'];
    return `<span style="font-size:10px;font-weight:700;padding:3px 8px;background:${color}18;color:${color};border-radius:20px;white-space:nowrap">${label}</span>`;
  };

  const scoreColor = (n) => n >= 85 ? 'var(--rose)' : n >= 70 ? 'var(--amber)' : n >= 55 ? 'var(--blue)' : 'var(--emerald)';

  const rows = situations.length === 0 ? `
    <div class="empty-state" style="padding:48px 24px">
      <div class="empty-state-icon">🧠</div>
      <div class="empty-state-title">No client intakes yet</div>
      <div class="empty-state-sub" style="max-width:360px">
        Share your intake link with prospects — they complete 10 questions and Al generates a planning brief for your review.
      </div>
      <button class="btn btn-primary" style="margin-top:16px;background:var(--color-ed);border-color:var(--color-ed)" onclick="navigate('ed-disclosure')">
        + Start First Intake
      </button>
    </div>` : situations.map(s => {
    const name       = s.fullName || [s.firstName, s.lastName].filter(Boolean).join(' ') || 'Anonymous Client';
    const score      = s.situationScore || s.opportunityScore || s.score || 0;
    const wealth     = wealthLabels[s.wealthTier]  || s.wealthTier  || '—';
    const stage      = stageLabels[s.lifeStage]    || (s.lifeStage || '').replace(/_/g,' ') || '—';
    const date       = _fmt(s.savedAt);
    const id         = s.id || s._firestoreId || '';
    const hasBrief   = !!(s.brief || s.status === 'al_accepted' || s.status === 'pending_review' || s.status === 'approved');
    const professions = Array.isArray(s.profession) ? s.profession.map(p=>p.replace(/_/g,' ')).join(', ') : '';
    return `
    <div class="card" style="padding:18px 20px;margin-bottom:10px;display:flex;align-items:center;gap:16px;transition:box-shadow .15s"
      onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,0.15)'"
      onmouseout="this.style.boxShadow=''">
      <!-- Score -->
      <div style="min-width:52px;text-align:center;flex-shrink:0">
        <div style="font-size:24px;font-weight:900;color:${scoreColor(score)};line-height:1">${score}</div>
        <div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-top:2px">Score</div>
      </div>
      <!-- Info -->
      <div style="flex:1;min-width:0">
        <div style="font-size:13.5px;font-weight:800;color:var(--text-primary);margin-bottom:3px">${name}</div>
        <div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:4px">
          ${wealth}${stage !== '—' ? ' · ' + stage : ''}${professions ? ' · ' + professions : ''}
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          ${statusBadge(s.status || 'pending')}
          <span style="font-size:10.5px;color:var(--text-muted)">Submitted ${date}</span>
          ${s.referringAdvisorUid ? '' : '<span style="font-size:10px;color:var(--text-muted);font-style:italic">· Started from cockpit</span>'}
        </div>
      </div>
      <!-- Actions -->
      <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;align-items:flex-end">
        ${hasBrief
          ? `<button class="btn btn-primary" style="font-size:11px;padding:6px 14px;background:var(--color-ed);border-color:var(--color-ed)"
               onclick="alGenerateBrief('${id}')">View Brief →</button>`
          : `<button class="btn btn-primary" style="font-size:11px;padding:6px 14px;background:var(--color-ed);border-color:var(--color-ed)"
               onclick="alGenerateBrief('${id}')">Generate Brief →</button>`}
        <button class="btn btn-ghost" style="font-size:10.5px;padding:4px 10px"
          onclick="navigate('command-center')">View in CC</button>
      </div>
    </div>`;
  }).join('');

  return `
  <div class="page-header">
    <div class="page-header-left">
      <div class="page-title">🧠 Client Intake — ED</div>
      <div class="page-subtitle">Submissions inbox · ${situations.length} profile${situations.length !== 1 ? 's' : ''} received</div>
    </div>
    <div class="page-actions">
      <button class="btn btn-secondary" onclick="navigate('ed-disclosure')">+ New Intake (Self)</button>
    </div>
  </div>

  <!-- Shareable intake link card -->
  ${intakeLink ? `
  <div style="margin-bottom:18px;padding:14px 18px;background:rgba(217,119,6,0.06);border:1px solid rgba(217,119,6,0.2);border-radius:12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
    <div style="flex:1;min-width:200px">
      <div style="font-size:11px;font-weight:700;color:var(--amber);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">🔗 Your Prospect Intake Link</div>
      <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.5">
        Share this with any prospect — they complete 10 questions and Al generates a planning brief automatically.<br>
        <code style="font-size:10px;background:var(--bg-elevated);padding:2px 6px;border-radius:4px;color:var(--text-primary)">${intakeLink}</code>
      </div>
    </div>
    <button onclick="navigator.clipboard.writeText('${intakeLink}').then(()=>showToast('Intake link copied!','✅'))"
      style="background:var(--amber);color:#000;border:none;border-radius:8px;padding:8px 16px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">
      📋 Copy Link
    </button>
  </div>` : ''}

  <!-- Submissions list -->
  <div class="section">
    <div class="section-header">
      <div class="section-title"><div class="section-title-dot" style="background:var(--color-ed)"></div>Submissions (${situations.length})</div>
      ${situations.length > 0 ? `<span style="font-size:11px;color:var(--text-muted)">Sorted newest first · Click "Generate Brief" to create an Al planning brief</span>` : ''}
    </div>
    ${rows}
  </div>`;
}

function pageEdDisclosure() {

  const ref = (() => { try { return new URLSearchParams(window.location.search).get('ref'); } catch(e){return null;} })();
  return `
  <div class="page-header" style="border-bottom:1px solid var(--border-subtle);margin-bottom:0;padding-bottom:20px">
    <div class="page-header-left">
      <div class="page-title">🧠 Client Intake — ED</div>
      <div class="page-subtitle">Before we begin — a quick note on how your client's information is used</div>
    </div>
  </div>
  <div style="max-width:620px;margin:32px auto;padding:0 16px">
    <div class="card" style="padding:28px 32px;margin-bottom:20px">
      <div style="font-size:15px;font-weight:800;color:var(--text-primary);margin-bottom:16px;display:flex;align-items:center;gap:10px">
        <span style="font-size:22px">🔒</span> How Your Client's Information Is Used
      </div>
      <div style="display:flex;flex-direction:column;gap:14px;margin-bottom:24px">
        <div style="display:flex;gap:14px;align-items:flex-start"><span style="font-size:18px;flex-shrink:0">📋</span><div>
          <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:3px">What we collect</div>
          <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.7">Name, general wealth situation, planning priorities, and advisor preference. No SSN, account numbers, or sensitive documents.</div>
        </div></div>
        <div style="display:flex;gap:14px;align-items:flex-start"><span style="font-size:18px;flex-shrink:0">👤</span><div>
          <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:3px">Who sees it</div>
          <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.7">Only the advisor whose intake link is shared, and the platform operator (Fin-Tegration). Not shared with third parties or other advisors.</div>
        </div></div>
        <div style="display:flex;gap:14px;align-items:flex-start"><span style="font-size:18px;flex-shrink:0">🤖</span><div>
          <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:3px">How AI is used</div>
          <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.7">The platform generates a <strong>draft planning brief</strong> from answers for the advisor to review. This is a planning support tool — not financial advice.</div>
        </div></div>
        <div style="display:flex;gap:14px;align-items:flex-start"><span style="font-size:18px;flex-shrink:0">🗑️</span><div>
          <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:3px">Client rights</div>
          <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.7">Clients may request deletion at any time by emailing <a href="mailto:${(window._advisorProfile?.email || window._currentUser?.email || 'support@theaumengine.com')}" style="color:var(--blue)">${(window._advisorProfile?.email || window._currentUser?.email || 'your advisor')}</a>. Profiles are retained 90 days then purged.</div>
        </div></div>
      </div>
      <div style="background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:10px;padding:16px;margin-bottom:20px">
        <label style="display:flex;align-items:flex-start;gap:12px;cursor:pointer">
          <input type="checkbox" id="ed-consent-checkbox" onchange="edToggleConsentBtn(this)"
            style="margin-top:3px;width:18px;height:18px;cursor:pointer;accent-color:var(--color-ed)">
          <span style="font-size:12.5px;color:var(--text-primary);line-height:1.6">
            <strong>Client understands and agrees</strong> that their answers will be shared with their matched financial advisor to prepare for a first conversation.
          </span>
        </label>
      </div>
      <button id="ed-consent-btn" onclick="edGrantConsentAndStart('${ref || ''}')" disabled
        style="width:100%;padding:14px 20px;background:var(--color-ed);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;opacity:0.4;transition:opacity 0.2s">
        Start Client Profile — 10 Questions (~3 min) →
      </button>
      <div style="text-align:center;margin-top:12px;font-size:11px;color:var(--text-muted)">
        <a href="#" onclick="navigate('privacy');return false" style="color:var(--blue);text-decoration:underline;font-weight:600">Privacy Policy</a>
        &nbsp;·&nbsp; Responses are encrypted and stored securely.
      </div>
    </div>
    <div style="padding:12px 16px;background:rgba(217,119,6,0.08);border:1px solid rgba(217,119,6,0.2);border-radius:10px;font-size:11.5px;color:var(--text-secondary);line-height:1.6">
      <strong style="color:var(--amber)">🔗 Your intake link:</strong> Share this link with prospects — it already has your UID embedded.
      <div style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap">
        <code id="intake-link-code" style="background:var(--bg-elevated);padding:4px 8px;border-radius:4px;font-size:10.5px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${window.location.origin}/#ed-disclosure?ref=${typeof currentUID !== 'undefined' && currentUID ? currentUID : '(loading…)'}</code>
        <button onclick="(function(){
          const uid = typeof currentUID !== 'undefined' && currentUID ? currentUID : '';
          if (!uid) { if(typeof showToast==='function') showToast('Sign in first to get your link','⚠️'); return; }
          const link = window.location.origin + '/#ed-disclosure?ref=' + uid;
          navigator.clipboard ? navigator.clipboard.writeText(link).then(()=>{ if(typeof showToast==='function') showToast('Intake link copied!','✅'); }) : (document.getElementById('intake-link-code').select && document.getElementById('intake-link-code').select());
        })()" style="background:var(--blue);color:#fff;border:none;border-radius:6px;padding:4px 12px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap">📋 Copy Link</button>
      </div>
    </div>
  </div>`;
}

window.edToggleConsentBtn = function(checkbox) {
  const btn = document.getElementById('ed-consent-btn');
  if (!btn) return;
  btn.disabled = !checkbox.checked;
  btn.style.opacity = checkbox.checked ? '1' : '0.4';
  btn.style.cursor  = checkbox.checked ? 'pointer' : 'not-allowed';
};

window.edGrantConsentAndStart = async function(refUid) {
  // Clear any stale draft — prevents out-of-bounds currentIdx from a prior session
  try { localStorage.removeItem('edIntakeDraft'); } catch(e) {}
  if (!window._edIntakeInitialized) { EdIntakeEngine.init('lite'); window._edIntakeInitialized = true; }
  // If already initialized from a previous session that completed, reset for a fresh run
  if (EdIntakeEngine.isComplete) { EdIntakeEngine.init('lite'); }
  const sessionId = EdIntakeEngine._sessionId || `consent_${Date.now()}`;
  const consentRecord = {
    situationId:          sessionId,
    consentTimestamp:     new Date().toISOString(),
    disclosureVersion:    'v1.0',
    referringAdvisorUid:  refUid || EdIntakeEngine._referringAdvisorUid || (typeof currentUID !== 'undefined' ? currentUID : null),
    intakeMode:           'lite',
    consentGiven:         true,
    userAgent:            navigator?.userAgent || '',
  };
  if (typeof saveConsentToFirestore === 'function') {
    saveConsentToFirestore(consentRecord).catch(e => console.warn('consent log failed:', e));
  }
  try { localStorage.setItem('edConsentGiven', 'true'); } catch(e) {}
  navigate('ed-intake');
};

function pageEdIntake() {
  const consentGiven = (() => { try { return localStorage.getItem('edConsentGiven') === 'true'; } catch(e){return false;} })();
  if (!consentGiven) { navigate('ed-disclosure'); return '<div style="padding:40px;text-align:center;color:var(--text-muted)">Redirecting\u2026</div>'; }
  if (!window._edIntakeInitialized) { EdIntakeEngine.init('lite'); window._edIntakeInitialized = true; }
  if (EdIntakeEngine.isComplete && EdIntakeEngine._profile) return _renderEdCompletionScreen(EdIntakeEngine._profile);

  const engine = EdIntakeEngine, q = engine.currentQ, qIdx = engine._currentIdx;
  const total = engine.questions.length, pct = engine.progress, phase = q?.phaseLabel || 'Your Profile';
  if (!q) return '<div style="padding:40px;text-align:center;color:var(--text-muted)">Loading\u2026</div>';

  const renderOptions = (q) => {
    if (q.type === 'single') {
      const cur = engine._answers[q.field];
      return q.options.map((opt, i) => `<button class="ed-option ${cur === opt.value ? 'ed-option--selected' : ''}" id="ed-opt-${q.id}-${i}" onclick="edSelectAnswer('${q.id}','${opt.value}','single')">${opt.label}</button>`).join('');
    }
    if (q.type === 'multi') {
      const cur = engine._answers[q.field] || [];
      return `<div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">Select up to ${q.maxSelect}</div>${q.options.map((opt,i) => `<button class="ed-option ${cur.includes(opt.value)?'ed-option--selected':''}" id="ed-opt-${q.id}-${i}" onclick="edSelectAnswer('${q.id}','${opt.value}','multi',${q.maxSelect})">${opt.label}</button>`).join('')}`;
    }
    if (q.type === 'text' || q.type === 'email' || q.type === 'tel') {
      const cur = engine._answers[q.field] || '';
      return `<input class="form-input" id="ed-text-${q.id}" type="${q.type}" value="${cur}" placeholder="${q.placeholder||''}" oninput="edUpdateText('${q.id}','${q.field}')" style="width:100%;font-size:14px;padding:14px 16px;margin-top:4px"><div id="ed-text-err-${q.id}" style="font-size:11px;color:var(--rose);margin-top:6px;display:none">Please enter your ${q.field==='fullName'?'name':'answer'} to continue.</div>`;
    }
    return '';
  };

  const hasAnswer = (() => {
    const ans = engine._answers[q.field];
    if (q.type === 'multi') return Array.isArray(ans) && ans.length > 0;
    return ans !== undefined && ans !== null && ans !== '';
  })();

  return `
  <div style="max-width:600px;margin:0 auto;padding:24px 16px">
    <div style="margin-bottom:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:11px;font-weight:700;color:var(--color-ed);text-transform:uppercase;letter-spacing:0.08em">${phase}</span>
        <span style="font-size:11px;color:var(--text-muted)">Question ${qIdx+1} of ${total}</span>
      </div>
      <div style="height:4px;background:var(--border-subtle);border-radius:2px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:var(--color-ed);border-radius:2px;transition:width 0.4s ease"></div>
      </div>
    </div>
    <div class="card" style="padding:28px 28px 24px">
      <div style="font-size:16px;font-weight:700;color:var(--text-primary);line-height:1.5;margin-bottom:20px">${q.text}</div>
      <div id="ed-options-wrap" style="display:flex;flex-direction:column;gap:10px">${renderOptions(q)}</div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:20px">
      <button class="btn btn-ghost" onclick="edGoBack()" style="font-size:12px" ${qIdx===0?'disabled style="opacity:0.3"':''}>← Back</button>
      <button id="ed-next-btn" class="btn btn-primary" onclick="edAdvance('${q.id}','${q.type}','${q.field}')"
        style="background:var(--color-ed);border-color:var(--color-ed);min-width:120px;${hasAnswer?'':'opacity:0.5'}"
        ${(q.type==='single'||q.type==='multi')&&!hasAnswer?'disabled':''}>
        ${qIdx===total-1?'Submit \u2192':'Next \u2192'}
      </button>
    </div>
    <div style="text-align:center;margin-top:16px;font-size:10px;color:var(--text-muted)">🔒 Answers are encrypted. Only the matched advisor sees this profile.</div>
  </div>`;
}

window.edSelectAnswer = function(qId, value, type, maxSelect) {
  const engine = EdIntakeEngine, q = engine.questions.find(q => q.id === qId);
  if (!q) return;
  if (type === 'single') {
    engine._answers[q.field] = value;
    q.options.forEach((opt,i) => { const btn = document.getElementById(`ed-opt-${qId}-${i}`); if (btn) btn.classList.toggle('ed-option--selected', opt.value === value); });
    const nb = document.getElementById('ed-next-btn'); if (nb) { nb.disabled = false; nb.style.opacity = '1'; }
    engine._save();
  } else if (type === 'multi') {
    let cur = engine._answers[q.field] || []; if (typeof cur === 'string') cur = [cur];
    const idx = cur.indexOf(value);
    if (idx > -1) { cur = cur.filter(v => v !== value); } else { if (maxSelect && cur.length >= maxSelect) return; cur = [...cur, value]; }
    engine._answers[q.field] = cur;
    q.options.forEach((opt,i) => { const btn = document.getElementById(`ed-opt-${qId}-${i}`); if (btn) btn.classList.toggle('ed-option--selected', cur.includes(opt.value)); });
    const nb = document.getElementById('ed-next-btn'); if (nb) { nb.disabled = cur.length === 0; nb.style.opacity = cur.length > 0 ? '1' : '0.5'; }
    engine._save();
  }
};

window.edUpdateText = function(qId, field) {
  const val = document.getElementById('ed-text-' + qId)?.value || '';
  EdIntakeEngine._answers[field] = val;
  const nb = document.getElementById('ed-next-btn'); if (nb) { nb.disabled = !val.trim(); nb.style.opacity = val.trim() ? '1' : '0.5'; }
  EdIntakeEngine._save();
};

window.edAdvance = async function(qId, type, field) {
  const engine = EdIntakeEngine;
  if (type === 'text' || type === 'email' || type === 'tel') {
    const val = document.getElementById('ed-text-' + qId)?.value?.trim() || '';
    if (!val && field === 'fullName') { const err = document.getElementById('ed-text-err-' + qId); if (err) err.style.display = 'block'; return; }
    engine._answers[field] = document.getElementById('ed-text-' + qId)?.value || '';
    engine._save();
  }
  const result = engine.advance();
  if (result.done) {
    const profile = result.profile;
    // 1. Save situation to Firestore
    try { if (typeof saveEdSituationToFirestore === 'function') await saveEdSituationToFirestore({ ...profile, status: 'pending', savedAt: new Date().toISOString() }); } catch(e) {}
    // 2. Auto-generate Al brief and store globally + sessionStorage for Command Center
    try {
      if (window.PlanningAgent?.generateBrief) {
        const brief = window.PlanningAgent.generateBrief(profile);
        window._alCurrentBrief      = brief;
        window._alActiveSituationId = profile.id || profile._firestoreId;
        window._edSituations = window._edSituations || [];
        if (!window._edSituations.find(s => (s.id || s._firestoreId) === profile.id)) {
          window._edSituations.unshift({ ...profile, status: 'pending' });
        }
        // Persist to sessionStorage so brief survives navigate() + page reload
        try {
          sessionStorage.setItem('alCurrentBrief', JSON.stringify({
            brief,
            situationId: profile.id || profile._firestoreId,
            savedAt: new Date().toISOString(),
          }));
        } catch(ssErr) { console.warn('[edAdvance] sessionStorage write failed:', ssErr); }
        if (typeof showToast === 'function') showToast(`Al brief ready — Score: ${brief.score}`, '🧠');
      }
    } catch(e) { console.warn('[edAdvance] brief gen failed:', e); }
  }
  navigate('ed-intake');
};

window.edGoBack = function() { EdIntakeEngine.back(); navigate('ed-intake'); };

function _renderEdCompletionScreen(profile) {
  return `
  <div style="max-width:540px;margin:48px auto;padding:0 16px;text-align:center">
    <div style="font-size:52px;margin-bottom:16px">✅</div>
    <div style="font-size:22px;font-weight:900;color:var(--text-primary);margin-bottom:12px">Client profile ready.</div>
    <div style="font-size:14px;color:var(--text-secondary);line-height:1.8;margin-bottom:28px;max-width:400px;margin-left:auto;margin-right:auto">
      The planning brief is in your Command Center.<br>
      <strong>${profile.firstName || 'The client'}</strong> will hear from their advisor within <strong>24\u201348 hours</strong>.
    </div>
    <div class="card" style="padding:20px 24px;margin-bottom:20px;text-align:left;background:var(--bg-elevated)">
      <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px">What happens next</div>
      ${[['📬','Planning brief is ready','Al has analyzed the intake and generated advisor-ready notes.'],['📞','Advisor reviews and reaches out','Typically within 1\u20132 business days.'],['🤝','Informed first conversation','No rehashing the situation from scratch.']].map(([icon,title,sub]) => `
        <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:12px"><span style="font-size:18px">${icon}</span><div><div style="font-size:12.5px;font-weight:700;color:var(--text-primary)">${title}</div><div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">${sub}</div></div></div>`).join('')}
    </div>
    <button class="btn btn-primary" onclick="navigate('command-center')" style="min-width:180px">View in Command Center \u2192</button>
    <div style="font-size:10.5px;color:var(--text-muted);line-height:1.6;padding:12px 8px 0">
      Questions? <a href="mailto:${(window._advisorProfile?.email || window._currentUser?.email || 'support@theaumengine.com')}" style="color:var(--blue)">${(window._advisorProfile?.email || window._currentUser?.email || 'Contact your advisor')}</a>
    </div>
  </div>`;
}

function pagePrivacyPolicy() {
  return `
  <div class="page-header"><div class="page-header-left">
    <div class="page-title">🔒 Privacy Policy</div>
    <div class="page-subtitle">The AUM Engine \u00b7 A Fin-Tegration platform \u00b7 Last updated April 8, 2026</div>
  </div><div class="page-actions"><button class="btn btn-ghost" onclick="history.back()">← Back</button></div></div>
  <div style="max-width:720px;margin:0 auto;padding:0 0 48px">
    <div class="card" style="padding:32px 36px">
      <div style="font-size:13px;color:var(--text-secondary);line-height:1.8;margin-bottom:24px;padding:14px 18px;background:var(--bg-elevated);border-radius:8px;border-left:3px solid var(--color-ed)">
        The AUM Engine is a planning support platform. This policy explains what we collect during an ED intake, how we use it, and client rights.
      </div>
      ${[
        ['1. What We Collect','Name, general wealth tier, wealth source, life stage, planning priorities, advisor preference, and stated urgency. <strong>We do not collect</strong> SSNs, tax IDs, account numbers, passwords, or financial documents.'],
        ['2. How We Use It','Answers are used exclusively to generate a <strong>draft planning brief</strong> for the referring advisor. All advice is the advisor\'s sole responsibility.'],
        ['3. Who Can See It','Only the matched advisor (identified by <code>?ref=</code> URL) and the platform operator (Fin-Tegration). Not shared with third parties, advertisers, or other advisors.'],
        ['4. Consent Logging','When a prospect consents, we record the timestamp, disclosure version, and referring advisor UID. This record is write-once and cannot be altered.'],
        ['5. Data Retention','Profiles and consent logs are retained for <strong>90 days</strong> from submission, then permanently deleted.'],
        ['6. Client Rights','Clients may request <strong>deletion</strong> by emailing <a href="mailto:${window._advisorProfile?.email || window._currentUser?.email || \'support@theaumengine.com\'}" style="color:var(--blue)">${window._advisorProfile?.email || window._currentUser?.email || \'support@theaumengine.com\'}</a> with subject "Data Deletion Request." Confirmed within 5 business days.'],
        ['7. Security','All data is stored in Google Firestore with encryption at rest and in transit. Access is controlled by Firebase Auth and Firestore security rules scoped to the matched advisor.'],
        ['8. Contact',`Fin-Tegration \u00b7 <a href="mailto:${window._advisorProfile?.email || window._currentUser?.email || 'support@theaumengine.com'}" style="color:var(--blue)">${window._advisorProfile?.email || window._currentUser?.email || 'support@theaumengine.com'}</a> \u00b7 <a href="https://theaumengine.com" style="color:var(--blue)" target="_blank">theaumengine.com</a>`],
      ].map(([title,body]) => `<div style="margin-bottom:28px"><div style="font-size:14px;font-weight:800;color:var(--text-primary);margin-bottom:10px">${title}</div><div style="font-size:13px;color:var(--text-secondary);line-height:1.8">${body}</div></div>`).join('<hr style="border:none;border-top:1px solid var(--border-subtle);margin:0 0 28px">')}
    </div>
  </div>`;
}

// ── SECURITY SENTINEL (Sprint 1) ─────────────────────────────
// Thin wrapper — delegates to js/sentinel.js to keep pages.js
// clean. Registered in app.js pageMap as 'security-sentinel'.
// M4 FIX: Role-gated to operator only — advisors see access-denied.
function pageSentinelDashboard() {
  // Operator check — kosal@fin-tegration.com or admin flag in profile
  const userEmail = window._currentUser?.email || '';
  const isOp = userEmail === 'kosal@fin-tegration.com'
             || window._advisorProfile?.role === 'operator'
             || window._advisorProfile?.isOperator === true;
  if (!isOp) {
    return `
    <div class="page-header">
      <div class="page-header-left">
        <div class="page-title">🛡️ Security Sentinel</div>
        <div class="page-subtitle">Trust &amp; exposure monitoring</div>
      </div>
    </div>
    <div class="empty-state" style="margin-top:40px">
      <div class="empty-state-icon">🔒</div>
      <div class="empty-state-title">Operator Access Required</div>
      <div class="empty-state-sub">This module is restricted to platform operators.<br>Contact your operator if you need access.</div>
    </div>`;
  }
  if (typeof renderSentinelPage === 'function') {
    return renderSentinelPage();
  }
  // Fallback: sentinel.js failed to load
  return `
  <div class="page-header">
    <div class="page-header-left">
      <div class="page-title">🛡️ Security Sentinel</div>
      <div class="page-subtitle">Trust &amp; exposure monitoring</div>
    </div>
  </div>
  <div class="empty-state">
    <div class="empty-state-icon">🛡️</div>
    <div class="empty-state-title">Sentinel module not loaded</div>
    <div class="empty-state-sub">Check that sentinel.js is included in index.html before app.js.</div>
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVACY POLICY — v20260415g
// ─────────────────────────────────────────────────────────────────────────────
function pagePrivacyPolicy() {
  return `
  <div class="page-header">
    <div class="page-header-left">
      <div class="page-title">Privacy Policy</div>
      <div class="page-subtitle">How The AUM Engine collects, uses, and protects your information</div>
    </div>
    <div class="page-actions">
      <button class="btn btn-ghost" onclick="navigate('command-center')">← Back to Cockpit</button>
    </div>
  </div>
  <div class="section">
    <div class="card" style="max-width:760px;padding:32px 36px;line-height:1.8">
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:24px">Last updated: April 15, 2026 · Pilot Phase</div>

      <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:8px">Who We Are</div>
      <div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:20px">
        The AUM Engine is an advisor growth platform operated by Fin-Tegration Consulting, LLC
        (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;). We help independent Financial Professionals
        find, engage, and serve right-fit households in their chosen niches. Questions? Email us at
        <a href="mailto:hello@theaumengine.com" style="color:var(--blue)">hello@theaumengine.com</a>.
      </div>

      <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:8px">What We Collect</div>
      <div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:20px">
        <strong>Account data:</strong> Your name, email address, and authentication credentials, collected when you create an account.<br><br>
        <strong>Platform usage data:</strong> Prospect interaction logs, outreach drafts you generate or approve, pipeline status changes, and niche assessment responses. This data is stored in your account and used to power the cockpit and improve routing.<br><br>
        <strong>Prospect data:</strong> Information about households you prospect (names, titles, geography, estimated wealth signals) sourced from public records and enrichment providers. This data is used exclusively to power your advisory workflow — it is never sold or shared with third parties.<br><br>
        <strong>Technical data:</strong> Browser type, IP address, and session identifiers for security, fraud prevention, and platform diagnostics.
      </div>

      <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:8px">How We Use Your Data</div>
      <div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:20px">
        We use your data to:<br>
        &bull; Operate and improve The AUM Engine platform<br>
        &bull; Route qualified prospects to your account based on your niche and ICP settings<br>
        &bull; Generate AI-assisted outreach drafts tailored to each prospect<br>
        &bull; Provide security monitoring and account management<br>
        &bull; Communicate with you about your account, platform updates, and support requests<br><br>
        We do <strong>not</strong> sell your personal data or prospect data to third parties. We do not use your data for advertising.
      </div>

      <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:8px">Data Storage &amp; Security</div>
      <div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:20px">
        Your data is stored in Google Firebase (Firestore), protected by Google Cloud&rsquo;s enterprise-grade security infrastructure.
        Authentication uses Firebase Auth with email/password and Google OAuth. We enforce role-based access controls so advisor data is
        isolated per account. Platform operators have administrative access for routing and support purposes only.
      </div>

      <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:8px">Your Rights</div>
      <div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:20px">
        You may request a copy of your data, ask us to correct inaccurate information, or request deletion of your account and associated
        data at any time by emailing <a href="mailto:hello@theaumengine.com" style="color:var(--blue)">hello@theaumengine.com</a>.
        Data deletion requests are processed within 30 days.
      </div>

      <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:8px">Cookies &amp; Local Storage</div>
      <div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:20px">
        The AUM Engine uses browser localStorage to persist your preferences (theme, niche profile, ICP settings) and session state
        between logins. We do not use third-party tracking cookies. Firebase uses session cookies for authentication state only.
      </div>

      <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:8px">Changes to This Policy</div>
      <div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:20px">
        We&rsquo;ll notify pilot advisors of material changes to this policy by email at least 7 days before they take effect.
        Continued use of the platform after that date constitutes acceptance of the updated policy.
      </div>

      <div style="font-size:12px;color:var(--text-muted);border-top:1px solid var(--border-subtle);padding-top:20px;margin-top:8px">
        Questions? <a href="mailto:hello@theaumengine.com" style="color:var(--blue)">hello@theaumengine.com</a> &middot;
        The AUM Engine is operated by Fin-Tegration Consulting, LLC &middot; Pilot Phase &middot;
        <a href="#" onclick="navigate('terms');return false" style="color:var(--blue)">Terms of Service</a>
      </div>
    </div>
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TERMS OF SERVICE — v20260415g
// ─────────────────────────────────────────────────────────────────────────────
function pageTermsOfService() {
  return `
  <div class="page-header">
    <div class="page-header-left">
      <div class="page-title">Terms of Service</div>
      <div class="page-subtitle">Pilot phase terms governing your use of The AUM Engine</div>
    </div>
    <div class="page-actions">
      <button class="btn btn-ghost" onclick="navigate('command-center')">← Back to Cockpit</button>
    </div>
  </div>
  <div class="section">
    <div class="card" style="max-width:760px;padding:32px 36px;line-height:1.8">
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:24px">Last updated: April 15, 2026 · Pilot Phase</div>

      <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:8px">1. Acceptance of Terms</div>
      <div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:20px">
        By accessing or using The AUM Engine platform (&ldquo;the Platform&rdquo;), you agree to be bound by these Terms of Service.
        If you do not agree, do not access or use the Platform. The Platform is operated by Fin-Tegration Consulting, LLC.
      </div>

      <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:8px">2. Pilot Access</div>
      <div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:20px">
        The AUM Engine is currently in a gated pilot phase. Access is granted individually by the operator and may be revoked at any time.
        Pilot features, pricing, and terms are subject to change as the platform evolves. You will be notified of material changes
        with at least 7 days&rsquo; notice.
      </div>

      <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:8px">3. Use of the Platform</div>
      <div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:20px">
        You agree to use the Platform only for lawful business purposes consistent with applicable financial services regulations.
        You are solely responsible for:<br>
        &bull; Reviewing and approving all AI-generated outreach drafts before sending to any prospect<br>
        &bull; Ensuring your outreach and prospecting activities comply with FINRA, SEC, and state regulations applicable to your practice<br>
        &bull; Protecting your account credentials and not sharing access with unauthorized users<br>
        &bull; The accuracy of any ICP settings, niche selections, or prospect data you import<br><br>
        <strong>Nothing in the Platform sends outreach automatically.</strong> All messages require your explicit review and approval.
      </div>

      <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:8px">4. Prospect Data</div>
      <div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:20px">
        Prospect data provided through the Platform is sourced from publicly available records and enrichment services.
        This data is provided to support your prospecting workflow only. You agree not to misuse prospect data, share it
        with unauthorized parties, or use it in violation of applicable privacy laws (including CAN-SPAM, TCPA, and state equivalents).
      </div>

      <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:8px">5. No Guarantee of Results</div>
      <div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:20px">
        The AUM Engine provides tools and data to support your prospecting efforts — it does not guarantee specific outcomes,
        including prospect responses, meetings booked, or clients acquired. The 30-day &ldquo;first-meetings or we comp month two&rdquo;
        guarantee is available to founding-cohort advisors who engage with the system as designed and is subject to the conditions
        outlined in your individual pilot agreement.
      </div>

      <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:8px">6. Intellectual Property</div>
      <div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:20px">
        The Platform, including its design, architecture, AI systems, and prospect scoring methodology, is the exclusive property of
        Fin-Tegration Consulting, LLC. You receive a limited, non-transferable license to use the Platform during your active subscription.
        You may not copy, reverse-engineer, or redistribute any part of the Platform.
      </div>

      <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:8px">7. Limitation of Liability</div>
      <div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:20px">
        To the maximum extent permitted by law, Fin-Tegration Consulting, LLC shall not be liable for any indirect, incidental,
        or consequential damages arising from your use of the Platform. Our total liability to you shall not exceed the fees
        paid by you in the 3 months preceding the claim.
      </div>

      <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:8px">8. Termination</div>
      <div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:20px">
        Either party may terminate access to the Platform with 30 days&rsquo; written notice. We reserve the right to suspend or
        terminate access immediately for violation of these Terms or misuse of the Platform.
      </div>

      <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:8px">9. Governing Law</div>
      <div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:20px">
        These Terms are governed by the laws of the State of Kansas, without regard to conflict of law principles.
        Any disputes shall be resolved through binding arbitration in Johnson County, Kansas.
      </div>

      <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:8px">10. Contact</div>
      <div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:20px">
        Questions about these Terms? Email us at
        <a href="mailto:hello@theaumengine.com" style="color:var(--blue)">hello@theaumengine.com</a>.
      </div>

      <div style="font-size:12px;color:var(--text-muted);border-top:1px solid var(--border-subtle);padding-top:20px;margin-top:8px">
        The AUM Engine is operated by Fin-Tegration Consulting, LLC · Pilot Phase ·
        <a href="#" onclick="navigate('privacy');return false" style="color:var(--blue)">Privacy Policy</a>
      </div>
    </div>
  </div>`;
}
