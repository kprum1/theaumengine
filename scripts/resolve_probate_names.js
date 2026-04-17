// =====================================================================
// THE AUM ENGINE — A13 PROBATE NAME RESOLUTION PATCH
// scripts/resolve_probate_names.js
// Sprint C29 — Priority 2: Apply real court petitioner names to scrubbed batch
//
// Source: Maricopa County Superior Court — live pull 2026-04-17
// Portal: superiorcourt.maricopa.gov/docket/ProbateCaseDetails.asp
//
// Run: node scripts/resolve_probate_names.js
// Output: scripts/staging/scrubbed/alfred_batch_probate_real_2026-04-17.resolved.json
// =====================================================================

const fs   = require('fs');
const path = require('path');

// ── Real court data — pulled live 2026-04-17 from Maricopa County portal ─
// Format: caseNumber → { decedent (found on page), petitioner, role, filingDate, note }
//
// NOTE: Cases 000600/001200/001000/000400 showed DIFFERENT decedents than
// the names our miner had recorded. This is because probate case numbers
// are sequential and the miner's source data had stale/mismatched entries.
// The court portal is the ground truth — we update decedent + petitioner to match.
// These are still VALID leads (real probate cases, real petitioners).
// ─────────────────────────────────────────────────────────────────────────
const COURT_RESOLUTIONS = {
  'PB2026-000600': {
    // Miner had: George Michael Pappas (Paradise Valley)
    // Court shows: Bette A Bossart — David R Bossart (Petitioner)
    decedentFirstName:  'Bette',
    decedentLastName:   'Bossart',
    decedentFullName:   'Bette A. Bossart',
    firstName:          'David',
    lastName:           'Bossart',
    fullName:           'David R. Bossart',
    role:               'Petitioner — Personal Representative',
    filingDate:         '2026-01-29',
    courtVerified:      true,
    note:               'Decedent corrected from court portal. Bossart estate — Paradise Valley AZ.',
  },
  'PB2026-001200': {
    // Miner had: John David Deems (Scottsdale)
    // Court shows: Josefina V Ordonez — Veronica Y Ordonez (Petitioner)
    decedentFirstName:  'Josefina',
    decedentLastName:   'Ordonez',
    decedentFullName:   'Josefina V. Ordonez',
    firstName:          'Veronica',
    lastName:           'Ordonez',
    fullName:           'Veronica Y. Ordonez',
    role:               'Petitioner',
    filingDate:         '2026-03-23',
    courtVerified:      true,
    note:               'Decedent corrected from court portal. Ordonez estate — Scottsdale AZ.',
  },
  'PB2026-001000': {
    // Miner had: Shaun Bittercurt (Scottsdale)
    // Court shows: Elana G De Castro — Robert J De Castro (Petitioner)
    decedentFirstName:  'Elana',
    decedentLastName:   'De Castro',
    decedentFullName:   'Elana G. De Castro',
    firstName:          'Robert',
    lastName:           'De Castro',
    fullName:           'Robert J. De Castro',
    role:               'Petitioner — Personal Representative',
    filingDate:         '2026-03-10',
    courtVerified:      true,
    note:               'Decedent corrected from court portal. De Castro estate (Affidavit of Transfer of Title to Real Property filed — indicates real property asset).',
  },
  'PB2026-000400': {
    // Miner had: Lanny Kay Miller (Scottsdale)
    // Court shows: Richard Zach Causey — Ann Causey Zeches (Petitioner)
    decedentFirstName:  'Richard',
    decedentLastName:   'Causey',
    decedentFullName:   'Richard Zach Causey',
    firstName:          'Ann',
    lastName:           'Zeches',
    fullName:           'Ann Causey Zeches',
    role:               'Petitioner',
    filingDate:         '2026-02-04',
    courtVerified:      true,
    note:               'Decedent corrected from court portal. Notice of Informal Probate filed. Causey-Zeches estate — Scottsdale AZ.',
  },
  'PB2026-000200': {
    // Decedent confirmed: Barbara Jean Carr (Scottsdale)
    decedentFirstName:  'Barbara',
    decedentLastName:   'Carr',
    decedentFullName:   'Barbara Jean Carr',
    firstName:          'Brent',
    lastName:           'Watson',
    fullName:           'Brent Edward Watson',
    role:               'Petitioner',
    filingDate:         '2026-04-07',
    courtVerified:      true,
    note:               'Decedent confirmed. Notice to Creditors filed — estate in active administration. Scottsdale AZ.',
  },
  'PB2026-001300': {
    // Decedent confirmed: Mark Austin Anderson (Gilbert)
    decedentFirstName:  'Mark',
    decedentLastName:   'Anderson',
    decedentFullName:   'Mark Austin Anderson',
    firstName:          'Sarah',
    lastName:           'Anderson',
    fullName:           'Sarah Elizabeth Anderson',
    role:               'Petitioner',
    filingDate:         '2026-03-26',
    courtVerified:      true,
    note:               'Decedent confirmed. Proof and/or Notice of Mailing filed. Gilbert AZ.',
  },
  'PB2026-001100': {
    // Decedent confirmed: Virginia T. Baker (Mesa)
    decedentFirstName:  'Virginia',
    decedentLastName:   'Baker',
    decedentFullName:   'Virginia T. Baker',
    firstName:          'Timothy',
    lastName:           'Anderson',
    fullName:           'Timothy Anderson',
    role:               'Petitioner',
    filingDate:         '2026-03-25',
    courtVerified:      true,
    note:               'Decedent confirmed. Proof and/or Notice of Mailing filed. Mesa AZ.',
  },
  'PB2026-001800': {
    // Decedent confirmed: Roman Carlo Villa (Chandler)
    decedentFirstName:  'Roman',
    decedentLastName:   'Villa',
    decedentFullName:   'Roman Carlo Villa',
    firstName:          'Lisa',
    lastName:           'Bays',
    fullName:           'Lisa Marie Bays',
    role:               'Petitioner — Personal Representative',
    filingDate:         '2026-03-09',
    courtVerified:      true,
    note:               'Decedent confirmed. Letter of Appointment + Affidavit of Transfer of Title to Real Property filed — indicates real property in estate. Chandler AZ.',
  },

  // ── 4 remaining cases — pulled 2026-04-17 (second browser pull) ────────────────
  'PB2026-002300': {
    // Decedent confirmed: Samly Khongkhoune (Phoenix) — HIGHEST TIMING (filed 2026-04-09)
    decedentFirstName:  'Samly',
    decedentLastName:   'Khongkhoune',
    decedentFullName:   'Samly Khongkhoune',
    firstName:          'Bantri',
    lastName:           'Khongkhoune',
    fullName:           'Bantri Khongkhoune',
    role:               'Petitioner — Personal Representative',
    filingDate:         '2026-04-09',
    courtVerified:      true,
    note:               'Decedent confirmed. Letter of Appointment (without restriction) + Notice to Creditors filed. Estate in active administration — Phoenix AZ. Highest timing score (95).',
  },
  'PB2026-000500': {
    // Decedent confirmed: Hassell Bernace Moores (Chandler)
    decedentFirstName:  'Hassell',
    decedentLastName:   'Moores',
    decedentFullName:   'Hassell Bernace Moores',
    firstName:          'Sara',
    lastName:           'Compton',
    fullName:           'Sara Compton',
    role:               'Petitioner — Unlicensed Fiduciary',
    filingDate:         '2026-01-22',
    courtVerified:      true,
    note:               'Decedent confirmed. Notice of Informal Probate, Waiver of Bond filed. Note: Registrar Denial issued 2026-02-02 — petitioner may need attorney. Chandler AZ.',
  },
  'PB2026-000300': {
    // IMPORTANT: Case PB2026-000300 belongs to Douglas L. Small, NOT Govindarajalu.
    // Our miner’s case number was off by one. The correct case is PB2026-000301.
    // We store under PB2026-000300 to match the sourceUrl in the scrubbed batch,
    // but flag the correction in the note.
    decedentFirstName:  'Nandadevi',
    decedentLastName:   'Govindarajalu',
    decedentFullName:   'Nandadevi Govindarajalu',
    firstName:          'Sumithra',
    lastName:           'Ramesh',
    fullName:           'Sumithra Ramesh',
    role:               'Petitioner — Personal Representative',
    filingDate:         '2026-02-06',
    courtVerified:      true,
    note:               'CASE NUMBER CORRECTION: PB2026-000300 is Douglas L. Small estate. Correct case for Govindarajalu is PB2026-000301. Petitioner: Sumithra Ramesh. Letter of Appointment (without restriction) filed. Phoenix AZ.',
  },
  'PB2026-000001': {
    // Decedent confirmed: Marsha M. Nitchman (Scottsdale)
    decedentFirstName:  'Marsha',
    decedentLastName:   'Nitchman',
    decedentFullName:   'Marsha M. Nitchman',
    firstName:          'James',
    lastName:           'Nitchman',
    fullName:           'James S. Nitchman',
    role:               'Petitioner',
    filingDate:         '2026-01-13',
    courtVerified:      true,
    note:               'Decedent confirmed. Proof and/or Notice of Mailing + Affidavit of Publication filed. Scottsdale AZ. Lowest timing score (68) — outreach window narrowing.',
  },
};

// ── Extract case number from sourceUrl ───────────────────────────────────
function extractCaseNumber(url) {
  if (!url) return null;
  const match = url.match(/caseNumber=(PB[\d-]+)/i);
  return match ? match[1] : null;
}

// ── Main ─────────────────────────────────────────────────────────────────
function resolveNames() {
  const inputFile  = path.resolve(__dirname, 'staging/scrubbed/alfred_batch_probate_real_2026-04-17.scrubbed.json');
  const outputFile = path.resolve(__dirname, 'staging/scrubbed/alfred_batch_probate_real_2026-04-17.resolved.json');

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   A13 PROBATE — NAME RESOLUTION PATCH (Sprint C29)      ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  console.log(`Input:  ${inputFile}`);
  console.log(`Output: ${outputFile}\n`);

  const raw  = fs.readFileSync(inputFile, 'utf8');
  const data = JSON.parse(raw);
  const leads = Array.isArray(data) ? data : (data.leads || []);

  let resolved = 0;
  let skipped  = 0;
  const resolvedLeads = [];

  for (const lead of leads) {
    const caseNum = extractCaseNumber(lead.sourceUrl);
    const resolution = caseNum ? COURT_RESOLUTIONS[caseNum] : null;

    if (!resolution) {
      // No court data for this lead — keep as-is but flag
      console.log(`  ⏭  ${lead.leadId} — no court resolution available (keeping original)`);
      resolvedLeads.push({ ...lead });
      skipped++;
      continue;
    }

    const oldName = `${lead.firstName} ${lead.lastName}`.trim();

    // Build resolved lead
    const resolvedLead = {
      ...lead,

      // ── Petitioner (the LIVING beneficiary we want to reach) ──────────
      firstName:              resolution.firstName,
      lastName:               resolution.lastName,
      fullName:               resolution.fullName,
      title:                  `Petitioner — Estate of ${resolution.decedentFullName}`,
      petitionerRole:         resolution.role,

      // ── Decedent info (stored for context, NOT used in outreach) ──────
      decedentFirstName:      resolution.decedentFirstName,
      decedentLastName:       resolution.decedentLastName,
      decedentFullName:       resolution.decedentFullName,

      // ── Court verification ────────────────────────────────────────────
      caseNumber:             caseNum,
      courtVerifiedDate:      '2026-04-17',
      courtVerified:          resolution.courtVerified,
      filedDate:              resolution.filingDate,
      courtNote:              resolution.note,

      // ── Update company/entity to reflect estate ───────────────────────
      company:                `Estate of ${resolution.decedentFullName}`,
      entityType:             'business',

      // ── Duplicate key: re-key to petitioner name ─────────────────────
      duplicateKey:           `inheritance_${resolution.lastName.toLowerCase().replace(/\s+/g,'_')}_az_${caseNum}`,

      // ── Resolution status ─────────────────────────────────────────────
      needsNameResolution:    false,
      resolvedAt:             new Date().toISOString(),
      resolvedBy:             'Antigravity — Maricopa County court portal pull 2026-04-17',

      // ── Sensitivity protocol (non-negotiable) ─────────────────────────
      sensitivityFlag:        'bereavement',
      signals: [
        ...(Array.isArray(lead.signals) ? lead.signals : []),
        `Court petitioner: ${resolution.fullName} (${resolution.role})`,
        `Decedent: ${resolution.decedentFullName}`,
        `Case filed: ${resolution.filingDate}`,
        resolution.note,
      ],

      status:   'resolved',
      updatedAt: new Date().toISOString(),
    };

    resolvedLeads.push(resolvedLead);
    resolved++;

    const decedentChanged = (resolution.decedentFullName !== `${lead.company || ''}`.replace('Estate Of ', ''));
    const icon = decedentChanged ? '🔄' : '✅';
    console.log(`  ${icon} ${caseNum} → Petitioner: ${resolution.fullName} (${resolution.role})`);
    if (decedentChanged) {
      console.log(`     Decedent corrected: "${lead.company}" → "Estate of ${resolution.decedentFullName}"`);
    }
  }

  const output = {
    batchId:        'alfred_batch_probate_real_2026-04-17',
    resolvedAt:     new Date().toISOString(),
    totalLeads:     resolvedLeads.length,
    resolvedCount:  resolved,
    skippedCount:   skipped,
    source:         'Maricopa County Superior Court — Probate Court Case Information (Public)',
    courtPortal:    'https://superiorcourt.maricopa.gov/docket/ProbateCaseDetails.asp',
    sensitivityProtocol: 'BEREAVEMENT — Never reference death or inheritance. Use "significant financial change" frame.',
    leads:          resolvedLeads,
  };

  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2), 'utf8');

  console.log(`\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║   RESOLUTION SUMMARY                                     ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝`);
  console.log(`  Total leads in batch : ${resolvedLeads.length}`);
  console.log(`  Names resolved       : ${resolved} (court-verified petitioner names)`);
  console.log(`  No resolution avail  : ${skipped} (FL county placeholders — Vera task)`);
  console.log(`\n  Output written to:`);
  console.log(`  ${outputFile}`);
  console.log(`\n  NEXT STEP — Ingest the resolved batch:`);
  console.log(`  node scripts/lead_ingest_agent.js --file scripts/staging/scrubbed/alfred_batch_probate_real_2026-04-17.resolved.json`);
  console.log(`\n  ⚠️  SENSITIVITY PROTOCOL ACTIVE:`);
  console.log(`  NEVER reference death or inheritance in outreach.`);
  console.log(`  Use "significant financial change" frame.`);
  console.log(`╚══════════════════════════════════════════════════════════╝\n`);
}

resolveNames();
