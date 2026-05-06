const PDLJS = require('peopledatalabs');
const fs = require('fs'), path = require('path');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname,'config','pdl.json'),'utf8'));
const pdl = new PDLJS({ apiKey: cfg.apiKey });

async function test() {
  // Extract just the LinkedIn slug from a URL
  function extractSlug(url) {
    if (!url) return null;
    return url.replace(/^(https?:\/\/)?(www\.)?linkedin\.com\/in\//i, '').replace(/\/+$/, '');
  }

  // Test 1: lid param (LinkedIn ID slug) — what PDL actually uses
  console.log('\n── Test 1: lid param (LinkedIn slug only) ──');
  try {
    const slug = extractSlug('linkedin.com/in/bill-george-7a9b1718');
    console.log('  lid:', slug);
    const r = await pdl.person.enrichment({ lid: slug, min_likelihood: 2 });
    console.log('  status:', r.status, '| likelihood:', r.data?.likelihood, '| emails:', r.data?.emails?.length ?? 0);
  } catch(e) { console.log('  Error:', e.message); }

  await new Promise(r => setTimeout(r, 1200));

  // Test 2: profile as a string (not array)
  console.log('\n── Test 2: profile as string ──');
  try {
    const r = await pdl.person.enrichment({
      profile: 'linkedin.com/in/bill-george-7a9b1718',
      min_likelihood: 2,
    });
    console.log('  status:', r.status, '| likelihood:', r.data?.likelihood, '| emails:', r.data?.emails?.length ?? 0);
  } catch(e) { console.log('  Error:', e.message); }

  await new Promise(r => setTimeout(r, 1200));

  // Test 3: first_name + last_name + company (no LinkedIn at all) — should work on Pro
  console.log('\n── Test 3: Bill George - Medtronic (name+company) ──');
  try {
    const r = await pdl.person.enrichment({
      first_name: 'Bill',
      last_name: 'George',
      company: 'Medtronic',
      min_likelihood: 5,
    });
    console.log('  status:', r.status, '| likelihood:', r.data?.likelihood, '| emails:', r.data?.emails?.length ?? 0);
  } catch(e) { console.log('  Error:', e.message); }

  await new Promise(r => setTimeout(r, 1200));

  // Test 4: Stephen Sigmond + c-suite (our actual lead)
  console.log('\n── Test 4: Stephen Sigmond (our lead, name+location) ──');
  try {
    const r = await pdl.person.enrichment({
      first_name: 'Stephen',
      last_name: 'Sigmond',
      location: 'Minneapolis, MN',
      min_likelihood: 3,
    });
    console.log('  status:', r.status, '| likelihood:', r.data?.likelihood, '| emails:', r.data?.emails?.length ?? 0, '| phones:', r.data?.phone_numbers?.length ?? 0);
  } catch(e) { console.log('  Error:', e.message); }

  process.exit(0);
}
test().catch(e => { console.error(e); process.exit(1); });
