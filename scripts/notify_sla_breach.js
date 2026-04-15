// AUM ENGINE — SLA Breach Notifier
// Sends targeted email alerts to each advisor with breached leads.
// Run: node scripts/notify_sla_breach.js [--dry-run]
'use strict';

const admin  = require('firebase-admin');
// Resolve @sendgrid/mail from functions/ since it's not installed in scripts/
const sgMail = require(require.resolve('@sendgrid/mail', { paths: [require('path').join(__dirname, '../functions')] }));
const fs     = require('fs');
const path   = require('path');

admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();

// Load .env from functions/.env
const envPath = path.join(__dirname, '../functions/.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && !k.startsWith('#') && !process.env[k.trim()]) {
      process.env[k.trim()] = v.join('=').trim();
    }
  });
}

const DRY_RUN   = process.argv.includes('--dry-run');
const SG_KEY    = process.env.SENDGRID_API_KEY;
const CAN_SEND  = SG_KEY && !SG_KEY.includes('YOUR_SENDGRID');
const FROM_EMAIL = 'hello@theaumengine.com';
const FROM_NAME  = 'The AUM Engine';
const SLA_DAYS   = 7;

if (CAN_SEND) sgMail.setApiKey(SG_KEY);

// ── Build the HTML alert email ──────────────────────────────────────────────
function buildAlertHTML(advisorName, leads) {
  const rows = leads.map(l => `
    <tr>
      <td style="padding:8px 14px;border-bottom:1px solid #1e293b;color:#cbd5e1;font-size:13px;">${l.leadId.slice(0,10)}…</td>
      <td style="padding:8px 14px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:13px;">${l.assignedDaysAgo}d ago</td>
      <td style="padding:8px 14px;border-bottom:1px solid #1e293b;font-size:13px;">
        <span style="color:#f87171;font-weight:700;background:rgba(248,113,113,0.1);padding:2px 8px;border-radius:6px;">⏰ ${SLA_DAYS}d SLA</span>
      </td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>SLA Breach Alert — AUM Engine</title></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e2e8f0;">
  <div style="max-width:580px;margin:0 auto;padding:40px 20px;">

    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:8px;padding:6px 16px;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-weight:700;color:#fff;margin-bottom:14px;">THE AUM ENGINE</div>
      <h1 style="margin:0;font-size:24px;font-weight:700;color:#f1f5f9;">Action Required</h1>
      <p style="margin:8px 0 0;color:#64748b;font-size:14px;">SLA Breach Alert</p>
    </div>

    <div style="background:#1e293b;border:1px solid rgba(248,113,113,0.3);border-radius:12px;padding:20px 24px;margin-bottom:24px;">
      <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#f87171;margin-bottom:10px;font-weight:700;">⏰ Leads Requiring Immediate Attention</div>
      <p style="color:#94a3b8;font-size:14px;margin:0 0 16px;line-height:1.6;">
        Hi <strong style="color:#e2e8f0;">${advisorName}</strong>, you have <strong style="color:#f87171;">${leads.length} lead${leads.length !== 1 ? 's' : ''}</strong> that ${leads.length !== 1 ? 'have' : 'has'} not been contacted within the <strong style="color:#f1f5f9;">${SLA_DAYS}-day SLA window</strong>. Please log in and initiate outreach today.
      </p>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:rgba(248,113,113,0.06);">
            <th style="padding:8px 14px;text-align:left;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;font-weight:600;">Lead</th>
            <th style="padding:8px 14px;text-align:left;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;font-weight:600;">Assigned</th>
            <th style="padding:8px 14px;text-align:left;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;font-weight:600;">Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div style="text-align:center;margin-bottom:32px;">
      <a href="https://theaumengine.web.app"
         style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;padding:14px 40px;border-radius:8px;font-weight:600;font-size:15px;">
        Open My Pipeline →
      </a>
    </div>

    <div style="text-align:center;color:#475569;font-size:12px;border-top:1px solid #1e293b;padding-top:20px;line-height:1.8;">
      <p style="margin:0;">Sent by <a href="https://theaumengine.web.app" style="color:#6366f1;text-decoration:none;font-weight:600;">The AUM Engine</a></p>
      <p style="margin:4px 0 0;">You're receiving this because you're an active AUM Engine pilot advisor.</p>
    </div>
  </div>
</body></html>`;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function run() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   AUM ENGINE — SLA Breach Notifier                      ║');
  console.log('║   ' + new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }) + ' CT');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Mode: ${DRY_RUN ? '🔵 DRY RUN (no emails sent)' : CAN_SEND ? '🟢 LIVE (SendGrid)' : '🟡 DRY RUN — SendGrid key not set'}\n`);

  // ── 1. Fetch all routing_logs for SLA breaches ──────────────────────────
  const logsSnap = await db.collection('routing_logs')
    .orderBy('timestamp', 'desc')
    .limit(100)
    .get();

  const breachedDocIds = new Set();
  logsSnap.docs
    .filter(d => d.data().event === 'sla_breach_flagged')
    .forEach(d => {
      const docRef = (d.data().detail || '').split('/').pop() || d.data().leadId;
      if (docRef) breachedDocIds.add(docRef);
    });

  if (!breachedDocIds.size) {
    console.log('  ✅ No SLA breaches found — nothing to notify.\n');
    process.exit(0);
  }
  console.log(`  Found ${breachedDocIds.size} breached lead doc(s). Grouping by advisor…\n`);

  // ── 2. Fetch each lead doc + group by ownerUid ──────────────────────────
  const byAdvisor = {}; // uid → [{ leadId, assignedAt, assignedDaysAgo }]
  const now = Date.now();

  for (const docId of breachedDocIds) {
    const doc = await db.collection('lead_assignments').doc(docId).get();
    if (!doc.exists) continue;
    const data = doc.data();
    const uid  = data.ownerUid;
    if (!uid) continue;
    const assignedAt     = data.assignedAt ? new Date(data.assignedAt).getTime() : 0;
    const assignedDaysAgo = Math.floor((now - assignedAt) / (1000 * 60 * 60 * 24));
    if (!byAdvisor[uid]) byAdvisor[uid] = [];
    byAdvisor[uid].push({ leadId: docId, assignedAt: data.assignedAt, assignedDaysAgo });
  }

  // ── 3. Resolve emails from Firebase Auth and send ───────────────────────
  const uids = Object.keys(byAdvisor);
  console.log(`── Sending alerts to ${uids.length} advisor(s) ──────────────────────────`);

  let sent = 0, skipped = 0, failed = 0;
  const notifLog = [];

  for (const uid of uids) {
    const leads = byAdvisor[uid];
    let email, displayName;
    try {
      const user  = await admin.auth().getUser(uid);
      email       = user.email;
      displayName = user.displayName || email.split('@')[0];
    } catch (e) {
      console.log(`  ⚠️  Could not resolve uid ${uid.slice(0,12)}… — ${e.message}`);
      failed++;
      continue;
    }

    const subject = `⏰ Action Required: ${leads.length} Lead${leads.length !== 1 ? 's' : ''} Past SLA — AUM Engine`;
    const html    = buildAlertHTML(displayName, leads);
    const text    = [
      `Hi ${displayName},`,
      '',
      `You have ${leads.length} lead(s) that have not been contacted within the ${SLA_DAYS}-day SLA window:`,
      '',
      ...leads.map(l => `  • Lead ${l.leadId.slice(0,10)}… — assigned ${l.assignedDaysAgo}d ago`),
      '',
      'Please log in and initiate outreach today:',
      'https://theaumengine.web.app',
      '',
      '— The AUM Engine',
    ].join('\n');

    if (DRY_RUN || !CAN_SEND) {
      console.log(`  📧 [DRY RUN] Would send to: ${email} (${leads.length} leads)`);
      skipped++;
    } else {
      try {
        await sgMail.send({ from: { name: FROM_NAME, email: FROM_EMAIL }, to: email, subject, text, html });
        console.log(`  ✅ Sent → ${email} (${leads.length} breach${leads.length !== 1 ? 'es' : ''})`);
        sent++;
      } catch (e) {
        console.log(`  ❌ Failed → ${email}: ${e.message}`);
        failed++;
      }
    }

    notifLog.push({ uid, email, leadCount: leads.length, leads: leads.map(l => l.leadId) });
  }

  // ── 4. Write notification log to Firestore ──────────────────────────────
  if (!DRY_RUN) {
    await db.collection('routing_logs').add({
      event:     'sla_breach_notifications_sent',
      agentId:   'notify_sla_breach_v1',
      sent, failed, skipped,
      advisors:  notifLog,
      timestamp: new Date().toISOString(),
    });
  }

  // ── 5. Summary ──────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   SUMMARY                                               ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  if (CAN_SEND && !DRY_RUN) {
    console.log(`  ✅ Sent:    ${sent}`);
    console.log(`  ❌ Failed:  ${failed}`);
  } else {
    console.log(`  🔵 DRY RUN — ${skipped} email(s) would have been sent`);
    console.log(`  ⚠️  To send for real: set SENDGRID_API_KEY in functions/.env then re-run without --dry-run`);
  }
  console.log('');
  process.exit(0);
}

run().catch(e => { console.error('[ERROR]', e.message); process.exit(1); });
