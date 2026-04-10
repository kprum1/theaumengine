// ============================================================
// AUM ENGINE — SEED SENTINEL FIRESTORE DATA
// scripts/seed_sentinel.js
//
// Usage:
//   node scripts/seed_sentinel.js --dry-run   (preview only)
//   node scripts/seed_sentinel.js             (write to Firestore)
//
// Safe to re-run — uses set() with merge:true so existing docs
// are updated, not duplicated.
//
// This seeds the following collections:
//   sentinel_config, sentinel_orgs, sentinel_assets,
//   sentinel_findings, sentinel_tasks, sentinel_runs,
//   sentinel_reports
//
// sentinel_config/default.sentinel_enabled starts as FALSE.
// Flip it to true in the Firestore Console to reveal the nav.
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
const db = admin.firestore();

const DRY_RUN = process.argv.includes('--dry-run');
const NOW     = new Date().toISOString();
const ORG_ID  = 'org_theaumengine_internal';

// ── Seed data ───────────────────────────────────────────────

const SENTINEL_CONFIG = {
  config_id:                     'default',
  sentinel_enabled:              false,  // ← flip to true in Firestore Console when ready
  sentinel_internal_only:        true,
  sentinel_allow_reports:        true,
  sentinel_allow_tasks:          true,
  sentinel_allow_external_checks: true,
  sentinel_allow_workspace_checks: false,
  sentinel_kill_switch:          false,
  updated_at:                    NOW,
};

const SENTINEL_ORG = {
  org_id:         ORG_ID,
  org_name:       'The AUM Engine (Internal)',
  custodian:      'firebase',
  industry:       'fintech_saas',
  sentinel_enabled: false,
  sentinel_mode:  'internal',
  risk_score:     66,
  risk_level:     'elevated',
  last_scan_at:   NOW,
  created_at:     NOW,
  updated_at:     NOW,
};

const SENTINEL_ASSETS = [
  {
    asset_id:       'asset_domain_001',
    org_id:         ORG_ID,
    asset_type:     'domain',
    asset_name:     'theaumengine.web.app',
    asset_value:    'https://theaumengine.web.app',
    owner_type:     'platform',
    owner_id:       'system',
    criticality:    'high',
    status:         'active',
    last_checked_at: NOW,
    created_at:     NOW,
    updated_at:     NOW,
  },
  {
    asset_id:       'asset_domain_002',
    org_id:         ORG_ID,
    asset_type:     'domain',
    asset_name:     'fin-tegration.com',
    asset_value:    'https://fin-tegration.com',
    owner_type:     'operator',
    owner_id:       'kosal@fin-tegration.com',
    criticality:    'high',
    status:         'active',
    last_checked_at: NOW,
    created_at:     NOW,
    updated_at:     NOW,
  },
  {
    asset_id:       'asset_admin_001',
    org_id:         ORG_ID,
    asset_type:     'admin_account',
    asset_name:     'Firebase Console — theaumengine',
    asset_value:    'https://console.firebase.google.com/project/theaumengine',
    owner_type:     'operator',
    owner_id:       'kosal@fin-tegration.com',
    criticality:    'critical',
    status:         'active',
    last_checked_at: NOW,
    created_at:     NOW,
    updated_at:     NOW,
  },
  {
    asset_id:       'asset_integration_001',
    org_id:         ORG_ID,
    asset_type:     'integration',
    asset_name:     'Gmail SMTP (Nodemailer digest)',
    asset_value:    'gmail://kosal@fin-tegration.com',
    owner_type:     'operator',
    owner_id:       'kosal@fin-tegration.com',
    criticality:    'medium',
    status:         'active',
    last_checked_at: NOW,
    created_at:     NOW,
    updated_at:     NOW,
  },
  {
    asset_id:       'asset_workspace_001',
    org_id:         ORG_ID,
    asset_type:     'workspace',
    asset_name:     'Firestore Database',
    asset_value:    'firestore://theaumengine',
    owner_type:     'platform',
    owner_id:       'system',
    criticality:    'critical',
    status:         'active',
    last_checked_at: NOW,
    created_at:     NOW,
    updated_at:     NOW,
  },
];

const SENTINEL_FINDINGS = [
  {
    finding_id:   'finding_001',
    org_id:       ORG_ID,
    asset_id:     'asset_domain_002',
    finding_type: 'missing_dmarc',
    category:     'exposure',
    title:        'Missing DMARC policy on fin-tegration.com',
    summary:      'No DMARC DNS record found. Advisors may receive spoofed emails from this domain, and email deliverability is at risk.',
    severity:     'high',
    status:       'open',
    confidence:   'high',
    score_impact: -15,
    evidence: {
      source: 'dns_check',
      value:  'No _dmarc TXT record found',
    },
    recommended_action: 'Add a DMARC TXT record to fin-tegration.com DNS (e.g. v=DMARC1; p=quarantine; rua=mailto:dmarc@fin-tegration.com)',
    owner_type:   'ops',
    owner_id:     'kosal@fin-tegration.com',
    detected_at:  NOW,
    last_seen_at: NOW,
    created_at:   NOW,
    updated_at:   NOW,
  },
  {
    finding_id:   'finding_002',
    org_id:       ORG_ID,
    asset_id:     'asset_admin_001',
    finding_type: 'too_many_admins',
    category:     'access',
    title:        'Multiple unreviewed admin accounts in Firebase project',
    summary:      'Firebase project has more than 2 admin-level users. Unreviewed admin access increases blast radius on compromise.',
    severity:     'medium',
    status:       'open',
    confidence:   'medium',
    score_impact: -8,
    evidence: {
      source: 'ownership_audit',
      value:  'admin_count=4 (target: ≤2)',
    },
    recommended_action: 'Review all Firebase IAM members. Remove or downscope any accounts not actively needed.',
    owner_type:   'ops',
    owner_id:     'kosal@fin-tegration.com',
    detected_at:  NOW,
    last_seen_at: NOW,
    created_at:   NOW,
    updated_at:   NOW,
  },
  {
    finding_id:   'finding_003',
    org_id:       ORG_ID,
    asset_id:     'asset_integration_001',
    finding_type: 'shared_credentials_risk',
    category:     'configuration',
    title:        'Gmail App Password stored in Cloud Functions environment',
    summary:      'GMAIL_APP_PASSWORD is stored as a plain environment variable in functions/.env. If this file leaks or the environment is compromised, full Gmail access is exposed.',
    severity:     'medium',
    status:       'open',
    confidence:   'high',
    score_impact: -8,
    evidence: {
      source: 'config_audit',
      value:  'GMAIL_APP_PASSWORD found in functions/.env',
    },
    recommended_action: 'Migrate to Google Secret Manager or rotate to a dedicated SendGrid API key scoped to send-only.',
    owner_type:   'ops',
    owner_id:     'kosal@fin-tegration.com',
    detected_at:  NOW,
    last_seen_at: NOW,
    created_at:   NOW,
    updated_at:   NOW,
  },
  {
    finding_id:   'finding_004',
    org_id:       ORG_ID,
    asset_id:     'asset_workspace_001',
    finding_type: 'missing_mfa_policy',
    category:     'access',
    title:        'No MFA enforcement for pilot advisor logins',
    summary:      'Pilot advisors use email/password auth with no multi-factor requirement. A compromised advisor account exposes all their assigned leads and outreach history.',
    severity:     'low',
    status:       'open',
    confidence:   'high',
    score_impact: -3,
    evidence: {
      source: 'auth_audit',
      value:  'Firebase Auth MFA enforcement: disabled',
    },
    recommended_action: 'Enable Firebase MFA enforcement or require Google Sign-In (which inherits Google account MFA policy).',
    owner_type:   'ops',
    owner_id:     'kosal@fin-tegration.com',
    detected_at:  NOW,
    last_seen_at: NOW,
    created_at:   NOW,
    updated_at:   NOW,
  },
  {
    finding_id:   'finding_005',
    org_id:       ORG_ID,
    asset_id:     'asset_domain_001',
    finding_type: 'public_admin_surface',
    category:     'exposure',
    title:        'Operator email exposed in public-facing HTML',
    summary:      'kosal@fin-tegration.com is visible in the public landing page footer and auth modal. This is a minor exposure risk if email-to-OSINT is a concern.',
    severity:     'low',
    status:       'open',
    confidence:   'high',
    score_impact: -3,
    evidence: {
      source: 'html_scan',
      value:  'email visible in index.html footer and auth modal',
    },
    recommended_action: 'Replace operator email in public HTML with a role address (e.g. hello@theaumengine.com) and keep personal email internal.',
    owner_type:   'ops',
    owner_id:     'kosal@fin-tegration.com',
    detected_at:  NOW,
    last_seen_at: NOW,
    created_at:   NOW,
    updated_at:   NOW,
  },
];

const SENTINEL_TASKS = [
  {
    task_id:         'task_001',
    org_id:          ORG_ID,
    finding_id:      'finding_001',
    title:           'Add DMARC policy to fin-tegration.com DNS',
    description:     'Log into GoDaddy/Cloudflare DNS and add a _dmarc TXT record with p=quarantine policy.',
    assigned_to:     'kosal@fin-tegration.com',
    assigned_role:   'ops_admin',
    priority:        'high',
    status:          'open',
    due_date:        _addDays(NOW, 7),
    retest_required: true,
    retest_status:   'pending',
    notes:           'Check GoDaddy DNS panel or Cloudflare. Use Google Admin Toolbox to verify after adding.',
    created_at:      NOW,
    updated_at:      NOW,
  },
  {
    task_id:         'task_002',
    org_id:          ORG_ID,
    finding_id:      'finding_002',
    title:           'Audit and reduce Firebase IAM admin accounts',
    description:     'Review all members in the Firebase Console IAM panel for the theaumengine project. Remove or downscope any accounts not actively needed for daily ops.',
    assigned_to:     'kosal@fin-tegration.com',
    assigned_role:   'ops_admin',
    priority:        'medium',
    status:          'open',
    due_date:        _addDays(NOW, 14),
    retest_required: true,
    retest_status:   'pending',
    notes:           'Firebase Console → theaumengine → IAM & Admin → IAM.',
    created_at:      NOW,
    updated_at:      NOW,
  },
  {
    task_id:         'task_003',
    org_id:          ORG_ID,
    finding_id:      'finding_003',
    title:           'Migrate digest email to SendGrid API key',
    description:     'Replace Gmail SMTP in functions/.env with a SendGrid API key scoped to send-only. Update functions/index.js sendDailyDigest to use SendGrid SDK.',
    assigned_to:     'kosal@fin-tegration.com',
    assigned_role:   'ops_admin',
    priority:        'medium',
    status:          'open',
    due_date:        _addDays(NOW, 30),
    retest_required: true,
    retest_status:   'pending',
    notes:           'New sender: noreply@theaumengine.com. Confirm SPF for theaumengine.com after setup.',
    created_at:      NOW,
    updated_at:      NOW,
  },
];

const SENTINEL_RUNS = [
  {
    run_id:            'run_001',
    org_id:            ORG_ID,
    run_type:          'initial_seed',
    status:            'completed',
    checks_run:        ['ownership_audit', 'config_audit', 'html_scan', 'dns_stub'],
    findings_created:  5,
    findings_updated:  0,
    started_at:        NOW,
    completed_at:      NOW,
    triggered_by:      'system_seed',
  },
];

const SENTINEL_REPORTS = [
  {
    report_id:       'report_2026_04',
    org_id:          ORG_ID,
    report_month:    '2026-04',
    risk_score:      66,
    open_findings:   5,
    closed_findings: 0,
    overdue_tasks:   0,
    top_risks: [
      'Missing DMARC policy on fin-tegration.com',
      'Multiple unreviewed admin accounts in Firebase',
      'Gmail App Password in Cloud Functions env',
    ],
    generated_at:    NOW,
  },
];

// ── Helper ───────────────────────────────────────────────────
function _addDays(isoStr, days) {
  const d = new Date(isoStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0,10);
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  AUM ENGINE — SEED SENTINEL DATA              ║');
  console.log(DRY_RUN
    ? '║  MODE: DRY RUN (no writes)                    ║'
    : '║  MODE: LIVE (writing to Firestore)            ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const writes = [];

  // sentinel_config/default
  writes.push({ col:'sentinel_config', id:'default', data:SENTINEL_CONFIG });

  // sentinel_orgs/org_theaumengine_internal
  writes.push({ col:'sentinel_orgs', id:ORG_ID, data:SENTINEL_ORG });

  // sentinel_assets
  for (const asset of SENTINEL_ASSETS) {
    writes.push({ col:'sentinel_assets', id:asset.asset_id, data:asset });
  }

  // sentinel_findings
  for (const finding of SENTINEL_FINDINGS) {
    writes.push({ col:'sentinel_findings', id:finding.finding_id, data:finding });
  }

  // sentinel_tasks
  for (const task of SENTINEL_TASKS) {
    writes.push({ col:'sentinel_tasks', id:task.task_id, data:task });
  }

  // sentinel_runs
  for (const run of SENTINEL_RUNS) {
    writes.push({ col:'sentinel_runs', id:run.run_id, data:run });
  }

  // sentinel_reports
  for (const report of SENTINEL_REPORTS) {
    writes.push({ col:'sentinel_reports', id:report.report_id, data:report });
  }

  console.log(`  Total documents to write: ${writes.length}\n`);

  for (const w of writes) {
    if (DRY_RUN) {
      console.log(`  📋 DRY — ${w.col}/${w.id}`);
      console.log(`     ${JSON.stringify(w.data).slice(0, 90)}…`);
    } else {
      await db.collection(w.col).doc(w.id).set(w.data, { merge: true });
      console.log(`  ✅ ${w.col}/${w.id}`);
    }
  }

  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║  SEED COMPLETE                                ║');
  if (!DRY_RUN) {
    console.log('║                                               ║');
    console.log('║  ⚠️  sentinel_enabled = FALSE by default.    ║');
    console.log('║  To enable the UI:                           ║');
    console.log('║  Firestore → sentinel_config/default         ║');
    console.log('║  → sentinel_enabled = true                   ║');
  }
  console.log('╚════════════════════════════════════════════════╝\n');

  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ seed_sentinel.js failed:', err.message || err);
  process.exit(1);
});
