const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../js/app.js');
let src = fs.readFileSync(filePath, 'utf8');

// Find the exact function block using a regex so we don't need to worry about arrow encoding
const oldFnRegex = /function selectNiche\(id\) \{[\s\S]*?if \(el\) el\.classList\.add\('active'\);\n\}/;

if (!oldFnRegex.test(src)) {
  console.error('TARGET NOT FOUND — check selectNiche definition');
  process.exit(1);
}

const newCode = `function selectNiche(id) {
  activeNiche = id;
  document.querySelectorAll('.niche-card').forEach(c => c.classList.remove('active'));
  const el = document.getElementById('niche-' + id);
  if (el) el.classList.add('active');
  openNicheDrawer(id);
}

// ── Niche Prospect Drawer ──────────────────────────────────────
// Slide-in panel showing all prospects in a niche.
// Click any prospect → opens full detail drawer via openDrawer().
function openNicheDrawer(nicheId) {
  const niche = NICHES.find(n => n.id === nicheId);
  if (!niche) return;

  const prospects = PROSPECTS.filter(p => p.nicheId === nicheId)
    .sort((a, b) => b.priorityScore - a.priorityScore);

  // Tear down any existing instance
  document.getElementById('niche-prospect-drawer')?.remove();
  document.getElementById('niche-drawer-backdrop')?.remove();

  // Backdrop
  const backdrop = document.createElement('div');
  backdrop.id = 'niche-drawer-backdrop';
  backdrop.onclick = closeNicheDrawer;
  backdrop.style.cssText = [
    'position:fixed;inset:0;z-index:600;',
    'background:rgba(0,0,0,0.35);backdrop-filter:blur(2px);',
    'animation:nd-fade-in 0.2s ease;',
  ].join('');
  document.body.appendChild(backdrop);

  // Status color map
  const statusColors = {
    'New':'var(--blue)','Contacted':'var(--blue)','Engaged':'var(--emerald)',
    'Nurture':'var(--amber)','Meeting Requested':'#f59e0b','Booked':'var(--emerald)',
    'Dead':'var(--text-muted)','Snoozed':'var(--text-muted)',
  };

  const booked  = prospects.filter(p => p.status === 'Booked').length;
  const engaged = prospects.filter(p => ['Engaged','Meeting Requested','Booked'].includes(p.status)).length;

  const prospectsHTML = prospects.length === 0
    ? \`<div style="padding:32px 20px;text-align:center">
        <div style="font-size:28px;margin-bottom:10px">💎</div>
        <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:6px">No prospects mined yet</div>
        <div style="font-size:11.5px;color:var(--text-muted);line-height:1.6">Run the Prospect Mine Agent to generate leads for this niche.</div>
      </div>\`
    : prospects.map(p => {
        const color = statusColors[p.status] || 'var(--text-muted)';
        const initials = typeof getInitials === 'function' ? getInitials(p.firstName, p.lastName) : (p.firstName[0]+p.lastName[0]).toUpperCase();
        const avatarCls = typeof getAvatarClass === 'function' ? getAvatarClass(p.lastName) : 'av-blue';
        return \`<div class="nd-prospect-row" onclick="event.stopPropagation();closeNicheDrawer();openDrawer('\${p.id}')" id="nd-row-\${p.id}">
          <div class="nd-avatar \${avatarCls}">\${initials}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:12.5px;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">\${p.firstName} \${p.lastName}</div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">\${p.title || ''}\${p.company ? ' · ' + p.company : ''}</div>
            <div style="font-size:10px;margin-top:3px;font-weight:600;color:\${color}">\${p.status}</div>
          </div>
          <div style="text-align:right;flex-shrink:0;margin-left:8px">
            <div style="font-size:18px;font-weight:900;color:var(--blue);line-height:1">\${p.priorityScore}</div>
            <div style="font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-top:2px">Priority</div>
          </div>
        </div>\`;
      }).join('');

  // Drawer element
  const drawer = document.createElement('div');
  drawer.id = 'niche-prospect-drawer';
  drawer.style.cssText = [
    'position:fixed;top:0;right:0;bottom:0;z-index:700;',
    'width:340px;max-width:92vw;',
    'background:var(--bg-card);border-left:1px solid var(--border-default);',
    'display:flex;flex-direction:column;',
    'box-shadow:-8px 0 40px rgba(0,0,0,0.35);',
    'animation:nd-slide-in 0.25s cubic-bezier(.22,1,.36,1);',
  ].join('');

  drawer.innerHTML = \`
    <style>
      @keyframes nd-fade-in  { from{opacity:0}to{opacity:1} }
      @keyframes nd-slide-in { from{transform:translateX(100%)}to{transform:translateX(0)} }
      .nd-prospect-row {
        display:flex;align-items:center;gap:12px;
        padding:12px 18px;cursor:pointer;
        border-bottom:1px solid var(--border-subtle);
        transition:background .15s;
      }
      .nd-prospect-row:hover { background:rgba(96,165,250,0.06); }
      .nd-avatar {
        width:34px;height:34px;border-radius:8px;
        display:flex;align-items:center;justify-content:center;
        font-size:11px;font-weight:800;flex-shrink:0;
      }
    </style>

    <!-- Header -->
    <div style="padding:18px 18px 14px;border-bottom:1px solid var(--border-default)">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:22px">\${niche.icon}</span>
          <div>
            <div style="font-size:15px;font-weight:800;color:var(--text-primary)">\${niche.name}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">\${prospects.length} prospect\${prospects.length!==1?'s':''} · \${booked} booked · \${engaged} engaged</div>
          </div>
        </div>
        <button onclick="closeNicheDrawer()" title="Close"
          style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:18px;padding:4px 6px;border-radius:6px;line-height:1;transition:background .15s"
          onmouseover="this.style.background='var(--bg-elevated)'"
          onmouseout="this.style.background='none'">✕</button>
      </div>
      <!-- Stats strip -->
      <div style="display:flex;gap:10px;margin-top:12px">
        <div style="flex:1;background:var(--bg-elevated);border-radius:8px;padding:8px 10px;text-align:center">
          <div style="font-size:20px;font-weight:900;color:var(--blue)">\${prospects.length}</div>
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted)">Total</div>
        </div>
        <div style="flex:1;background:var(--bg-elevated);border-radius:8px;padding:8px 10px;text-align:center">
          <div style="font-size:20px;font-weight:900;color:var(--emerald)">\${engaged}</div>
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted)">Engaged</div>
        </div>
        <div style="flex:1;background:var(--bg-elevated);border-radius:8px;padding:8px 10px;text-align:center">
          <div style="font-size:20px;font-weight:900;color:var(--amber)">\${booked}</div>
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted)">Booked</div>
        </div>
      </div>
    </div>

    <!-- Subheader -->
    <div style="padding:8px 18px;border-bottom:1px solid var(--border-subtle);display:flex;align-items:center;justify-content:space-between">
      <div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted)">Prospects — ranked by priority</div>
      <button
        onclick="closeNicheDrawer();setFilter('niche','\${nicheId}');navigate('lead-scoreboard')"
        style="font-size:10px;font-weight:600;color:var(--blue);background:none;border:none;cursor:pointer;padding:3px 6px;border-radius:5px;transition:background .15s"
        onmouseover="this.style.background='rgba(96,165,250,0.1)'"
        onmouseout="this.style.background='none'">View All →</button>
    </div>

    <!-- Prospect list -->
    <div style="flex:1;overflow-y:auto">\${prospectsHTML}</div>

    <!-- Footer CTA -->
    <div style="padding:12px 18px;border-top:1px solid var(--border-subtle)">
      <button
        onclick="closeNicheDrawer();startMining()"
        style="width:100%;padding:10px;border-radius:9px;background:linear-gradient(135deg,var(--blue),var(--violet));border:none;color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:opacity .15s"
        onmouseover="this.style.opacity='.88'"
        onmouseout="this.style.opacity='1'">
        💎 Mine More \${niche.name} Prospects
      </button>
    </div>
  \`;

  document.body.appendChild(drawer);

  // Escape key closes drawer
  const keyHandler = e => {
    if (e.key === 'Escape') { closeNicheDrawer(); document.removeEventListener('keydown', keyHandler); }
  };
  document.addEventListener('keydown', keyHandler);
}

function closeNicheDrawer() {
  const drawer   = document.getElementById('niche-prospect-drawer');
  const backdrop = document.getElementById('niche-drawer-backdrop');
  if (drawer)   { drawer.style.transition = 'transform .2s ease'; drawer.style.transform = 'translateX(100%)'; setTimeout(() => drawer?.remove(), 200); }
  if (backdrop) { backdrop.style.transition = 'opacity .2s'; backdrop.style.opacity = '0'; setTimeout(() => backdrop?.remove(), 200); }
}`;

const updated = src.replace(oldFnRegex, newCode);
if (updated === src) {
  console.error('REPLACEMENT FAILED — regex matched but string unchanged');
  process.exit(1);
}

fs.writeFileSync(filePath, updated, 'utf8');
console.log('SUCCESS — niche drawer injected into app.js');
