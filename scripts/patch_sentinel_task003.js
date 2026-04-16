// ============================================================
// AUM ENGINE — PATCH SENTINEL TASK_003 (C23)
// scripts/patch_sentinel_task003.js
//
// Fixes stale Sentinel finding: task_003 still says
// "Migrate to SendGrid" but C22 already migrated to Resend.
//
// Usage:
//   export PATH="/opt/homebrew/bin:$PATH"
//   node scripts/patch_sentinel_task003.js
// ============================================================

const admin = require('firebase-admin');
const path  = require('path');
const fs    = require('fs');

const SA_PATH = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(SA_PATH)) {
  console.error('❌ Missing scripts/serviceAccountKey.json');
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(require(SA_PATH)) });
const db  = admin.firestore();
const NOW = new Date().toISOString();

async function main() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  AUM ENGINE — PATCH SENTINEL C23              ║');
  console.log('║  Fixing stale SendGrid finding → Resend       ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  // 1. Mark task_003 (the stale "Migrate to SendGrid" task) as resolved
  //    C22 completed this — migrated from Gmail SMTP → Resend API key
  await db.collection('sentinel_tasks').doc('task_003').set({
    title:           'Migrate digest email to Resend API key',
    description:     'Completed in C22: replaced Gmail SMTP with Resend SDK. functions/.env now contains RESEND_API_KEY. sendDailyDigest and notify_sla_breach.js both use Resend.',
    status:          'resolved',
    resolved_at:     NOW,
    resolved_by:     'antigravity_c22',
    resolution_note: 'Migration completed: Gmail SMTP → Resend (re_6Bxb8kS1_*). Daily digest fires via Resend at 7 AM CT. DNS verified on Resend dashboard.',
    updated_at:      NOW,
  }, { merge: true });
  console.log('  ✅ sentinel_tasks/task_003 — marked resolved');

  // 2. Update finding_003 recommended_action to reflect Resend (not SendGrid)
  await db.collection('sentinel_findings').doc('finding_003').set({
    title:              'Gmail App Password stored in Cloud Functions environment',
    summary:            'GMAIL_APP_PASSWORD may still be present in functions/.env. C22 migrated digest email to Resend (RESEND_API_KEY). Confirm GMAIL_APP_PASSWORD is removed or rotated.',
    recommended_action: 'Verify GMAIL_APP_PASSWORD is removed from functions/.env now that Resend handles all email dispatch. Rotate or delete the Gmail App Password entirely.',
    status:             'in_review',
    updated_at:         NOW,
  }, { merge: true });
  console.log('  ✅ sentinel_findings/finding_003 — updated to reflect Resend migration');

  // 3. Also update the integration asset to reflect Resend (not Gmail)
  await db.collection('sentinel_assets').doc('asset_integration_001').set({
    asset_name:     'Resend Email API (digest + SLA breach)',
    asset_value:    'resend://re_6Bxb8kS1_*',
    status:         'active',
    updated_at:     NOW,
    last_checked_at: NOW,
  }, { merge: true });
  console.log('  ✅ sentinel_assets/asset_integration_001 — updated to Resend');

  console.log('\n  Done. Refresh the Sentinel dashboard to see updated findings.\n');
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ patch_sentinel_task003.js failed:', err.message || err);
  process.exit(1);
});
