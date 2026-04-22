/**
 * crossref_csuite_hennepin.js
 * Cross-references C-Suite + Aircraft Owner lead_assignments against the
 * Hennepin County Assessor GIS API using last-name search.
 *
 * For each lead missing propertyAddress, queries:
 *   UPPER(OWNER_NM) LIKE '%<LASTNAME>%'
 * Picks the highest-value residential match in the same city.
 * Writes propertyAddress + homeValue back to lead_assignments in Firestore.
 *
 * Usage:
 *   node scripts/crossref_csuite_hennepin.js              # Live run
 *   node scripts/crossref_csuite_hennepin.js --dry-run    # Preview only
 *   node scripts/crossref_csuite_hennepin.js --limit 50   # First N leads
 */
'use strict';

const admin  = require('firebase-admin');
const https  = require('https');
const args   = process.argv.slice(2);
const DRY    = args.includes('--dry-run');
const LIMIT  = parseInt(args[args.indexOf('--limit') + 1] || '500', 10);

admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();

// GIS endpoint
const GIS_BASE = 'https://gis.hennepin.us/arcgis/rest/services/HennepinData/LAND_PROPERTY/MapServer/1/query';

// Cities to accept as matches (Hennepin western suburbs)
const VALID_CITIES = new Set([
  'WAYZATA','MINNETONKA','ORONO','PLYMOUTH','DEEPHAVEN',
  'SHOREWOOD','EXCELSIOR','EDEN PRAIRIE','MINNEAPOLIS',
  'SAINT PAUL','BLOOMINGTON','EDINA','GOLDEN VALLEY',
  'SAINT CLOUD','ANOKA','HASTINGS'
]);

// ── GIS query by last name ─────────────────────────────────────
function queryByLastName(lastName) {
  return new Promise((resolve) => {
    const where  = `UPPER(OWNER_NM) LIKE '%${lastName.toUpperCase().replace(/'/g,"''")}%'`;
    const params = new URLSearchParams({
      where,
      outFields: 'OWNER_NM,HOUSE_NO,STREET_NM,MAILING_MUNIC_NM,ZIP_CD,MKT_VAL_TOT,HMSTD_CD1,SALE_PRICE',
      f:         'json',
      resultRecordCount: '10',
      orderByFields: 'MKT_VAL_TOT DESC',
    });
    const url = `${GIS_BASE}?${params}`;
    https.get(url, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const json     = JSON.parse(body);
          const features = (json.features || []).map(f => f.attributes);
          resolve(features);
        } catch { resolve([]); }
      });
    }).on('error', () => resolve([]));
  });
}

// ── Pick the best parcel match ─────────────────────────────────
function pickBest(features, lead) {
  const leadCity = (lead.city || '').toUpperCase().trim();

  // Priority 1: homestead parcel in same city
  let candidates = features.filter(f =>
    f.HMSTD_CD1 === 'H' &&
    (VALID_CITIES.has((f.MAILING_MUNIC_NM || '').trim()) || !leadCity)
  );

  // Priority 2: any parcel in same city
  if (!candidates.length) {
    candidates = features.filter(f =>
      (f.MAILING_MUNIC_NM || '').trim().includes(leadCity.split(' ')[0])
    );
  }

  // Priority 3: anything from valid cities
  if (!candidates.length) {
    candidates = features.filter(f => VALID_CITIES.has((f.MAILING_MUNIC_NM || '').trim()));
  }

  // Fall back to highest value feature
  if (!candidates.length) candidates = features;
  if (!candidates.length) return null;

  // Sort by market value descending, pick top
  candidates.sort((a, b) => (b.MKT_VAL_TOT || 0) - (a.MKT_VAL_TOT || 0));
  const best = candidates[0];

  const houseNo = (best.HOUSE_NO || '').toString().trim();
  const street  = (best.STREET_NM || '').trim();
  const addr    = `${houseNo} ${street}`.trim();
  const city    = (best.MAILING_MUNIC_NM || '').trim();
  const zip     = (best.ZIP_CD || '').toString().trim();
  const val     = best.MKT_VAL_TOT || 0;

  if (!addr || !val) return null;

  return {
    propertyAddress: addr,
    city:            city.charAt(0) + city.slice(1).toLowerCase(),
    state:           'MN',
    zip,
    homeValue:       val,
  };
}

// ── Rate limiter — 3 req/sec to avoid hammering GIS ───────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ───────────────────────────────────────────────────────
async function main() {
  console.log(`\n🏠 Hennepin GIS C-Suite Crossref ${DRY ? '[DRY RUN]' : '[LIVE]'}`);
  console.log(''.padEnd(50, '─'));

  // Load C-Suite + Aircraft assignments without property address
  const snap = await db.collection('lead_assignments')
    .where('ownerEmail', '==', 'kosal@fin-tegration.com')
    .get();

  const toProcess = snap.docs
    .filter(d => {
      const a = d.data();
      return (
        ['c-suite-executives', 'aircraft-owners'].includes(a.nicheId) &&
        !a.propertyAddress &&
        a.lastName &&
        a.lastName.length > 2
      );
    })
    .slice(0, LIMIT);

  console.log(`\nLeads to crossref: ${toProcess.length}`);

  let matched = 0, skipped = 0, errors = 0;
  const updates = [];

  for (let i = 0; i < toProcess.length; i++) {
    const doc = toProcess[i];
    const a   = doc.data();
    const lastName = (a.lastName || '').replace(/[^a-zA-Z\s]/g, '').trim().toUpperCase();

    if (!lastName || lastName.length < 3) { skipped++; continue; }

    try {
      const features = await queryByLastName(lastName);
      const best     = pickBest(features, a);

      if (best && best.homeValue >= 500000) {
        matched++;
        updates.push({ id: doc.id, firstName: a.firstName, lastName: a.lastName, ...best });
        console.log(
          `  ✅ [${i+1}/${toProcess.length}] ${a.firstName} ${a.lastName}` +
          ` → ${best.propertyAddress}, ${best.city} $${(best.homeValue/1000000).toFixed(1)}M`
        );
      } else {
        skipped++;
        if (i % 20 === 0)
          console.log(`  — [${i+1}/${toProcess.length}] ${a.firstName} ${a.lastName}: no match`);
      }
    } catch (e) {
      errors++;
      console.log(`  ⚠ [${i+1}] ${a.lastName}: ${e.message}`);
    }

    await sleep(340); // ~3 req/sec
  }

  console.log(`\n── Results ───────────────────────────────────────`);
  console.log(`  Matched:  ${matched}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Errors:   ${errors}`);

  if (!DRY && updates.length > 0) {
    console.log(`\nWriting ${updates.length} updates to Firestore…`);
    const BATCH = 400;
    for (let i = 0; i < updates.length; i += BATCH) {
      const chunk = updates.slice(i, i + BATCH);
      const batch = db.batch();
      chunk.forEach(u => {
        const ref = db.collection('lead_assignments').doc(u.id);
        batch.update(ref, {
          propertyAddress: u.propertyAddress,
          homeValue:       u.homeValue,
          city:            u.city,
          state:           u.state,
          zip:             u.zip,
        });
      });
      await batch.commit();
      console.log(`  Batch ${Math.ceil((i + BATCH) / BATCH)}: wrote ${Math.min(i + BATCH, updates.length)}/${updates.length}`);
    }
    console.log(`\n✅ Done. ${matched} C-Suite/Aircraft leads now have property data.`);
    console.log('They will appear in ✅ Ready on next cockpit hard refresh.');
  } else if (DRY) {
    console.log(`\n[Dry run] No writes made.`);
    if (updates.length) {
      console.log('Preview of updates:');
      updates.slice(0,10).forEach(u => console.log(` ${u.firstName} ${u.lastName} → ${u.propertyAddress} $${(u.homeValue/1000000).toFixed(1)}M`));
    }
  }

  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
