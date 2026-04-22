/**
 * route_csuite_aircraft_to_master.js
 * Routes C-Suite Executives + Aircraft Owners from master_leads → lead_assignments
 * for kosal@fin-tegration.com (the Master Account).
 *
 * Skips leads already assigned. Uses same schema as route_production_to_master.js.
 */
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();

const OWNER = {
  uid:   'FvEWqsETjbU602nLfHaJUaUkWkS2',
  email: 'kosal@fin-tegration.com',
  name:  'Kosal Prum',
};

const TARGET_NICHES = ['c-suite-executives', 'aircraft-owners'];

// Score a lead based on available signals (0-100)
function scoreLeadFit(lead) {
  let score = 60; // base
  if (lead.email || lead.personalEmail)            score += 10; // has email
  if (lead.phone || lead.personalPhone)            score += 10; // has phone
  if (lead.homeValue >= 2000000)                   score += 10; // $2M+ home
  else if (lead.homeValue >= 1000000)              score +=  5; // $1M+ home
  if (lead.city && ['Wayzata','Edina','Minnetonka','Eden Prairie','Orono',
    'Plymouth','Deephaven','Shorewood','Excelsior'].includes(lead.city)) score += 5;
  if (lead.title && /CEO|CFO|COO|President|Partner|Director/i.test(lead.title)) score += 5;
  return Math.min(score, 98);
}

async function main() {
  // Load already-assigned masterLeadIds to avoid duplicates
  console.log('Loading existing assignments…');
  const assignedSnap = await db.collection('lead_assignments')
    .where('ownerEmail', '==', OWNER.email).get();
  const assignedIds = new Set(assignedSnap.docs.map(d => d.data().masterLeadId));
  console.log(`Already assigned: ${assignedIds.size}`);

  // Load target leads from master_leads
  let leads = [];
  for (const nicheId of TARGET_NICHES) {
    const snap = await db.collection('master_leads')
      .where('nicheId', '==', nicheId).get();
    snap.docs.forEach(d => {
      if (!assignedIds.has(d.id)) {
        leads.push({ masterLeadId: d.id, ...d.data() });
      }
    });
    console.log(`${nicheId}: ${snap.size} total, ${snap.docs.filter(d => !assignedIds.has(d.id)).length} unassigned`);
  }

  // Filter: must have a resolvable name (firstName OR fullName OR company)
  const before = leads.length;
  leads = leads.filter(l => l.firstName || l.fullName || l.company);
  console.log(`\nName filter: ${before} → ${leads.length} leads`);

  if (leads.length === 0) {
    console.log('Nothing to route. Exiting.');
    process.exit(0);
  }

  // Build assignment docs
  const now = new Date().toISOString();
  const batch_size = 400;
  let written = 0;

  for (let i = 0; i < leads.length; i += batch_size) {
    const chunk  = leads.slice(i, i + batch_size);
    const batch  = db.batch();

    chunk.forEach(lead => {
      const ref   = db.collection('lead_assignments').doc();
      const fit   = scoreLeadFit(lead);
      const firstName = lead.firstName || (lead.fullName || '').split(' ')[0] || lead.company || '';
      const lastName  = lead.lastName  || (lead.fullName || '').split(' ').slice(1).join(' ') || '';

      batch.set(ref, {
        // Ownership
        ownerUid:         OWNER.uid,
        ownerEmail:       OWNER.email,
        ownerName:        OWNER.name,
        ownershipStatus:  'active',
        source:           'AUM Engine',
        assignedAt:       now,

        // Lead identity (denormalized for fast reads without CF)
        masterLeadId:     lead.masterLeadId,
        firstName,
        lastName,
        fullName:         lead.fullName || `${firstName} ${lastName}`.trim(),

        // Role / context
        title:            lead.title || lead.jobTitle || '',
        company:          lead.company || lead.firmName || '',
        city:             lead.city  || '',
        state:            lead.state || '',
        zip:              lead.zip   || '',

        // Classification
        niche:            lead.niche    || nicheLabel(lead.nicheId),
        nicheId:          lead.nicheId  || 'n0',
        assets:           lead.estimatedAUM || lead.assets || '$1M+',

        // Contact — email now, phone/address pending enrichment
        email:            lead.email    || lead.personalEmail || '',
        phone:            lead.phone    || lead.personalPhone || '',
        linkedInUrl:      lead.linkedInUrl || lead.linkedin_url || lead.linkedin || '',

        // Property (blank until homestead crossref runs for non-NPI leads)
        propertyAddress:  lead.propertyAddress || '',
        homeValue:        lead.homeValue || 0,

        // Scores
        fitScore:         fit,
        timingScore:      65,
        priorityScore:    fit,

        // Pipeline state
        advisorStatus:    lead.advisorStatus || 'New',
        enrichmentStatus: lead.enrichmentStatus || 'pending',
      });
    });

    await batch.commit();
    written += chunk.length;
    console.log(`Batch ${Math.ceil((i + batch_size) / batch_size)}: wrote ${written}/${leads.length}`);
  }

  console.log(`\n✅ Done. ${written} leads routed to ${OWNER.email}`);
  console.log('Note: most will appear in ⏳ Needs Data until phone + address enrichment runs.');
  process.exit(0);
}

function nicheLabel(id) {
  const map = {
    'c-suite-executives': 'C-Suite Executive',
    'aircraft-owners':    'Aircraft Owner',
  };
  return map[id] || 'Executive';
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
