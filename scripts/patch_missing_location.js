// Find and patch the one master_leads doc missing city/state
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });
const db = admin.firestore();

async function run() {
  const snap = await db.collection('master_leads').get();
  const missing = snap.docs.filter(d => {
    const m = d.data();
    return !m.city && !m.state;
  });
  console.log(`Found ${missing.length} doc(s) missing city/state`);
  missing.forEach(d => {
    console.log('  ID:', d.id, '| Name:', d.data().firstName, d.data().lastName, '| niche:', d.data().nicheId);
  });
  if (missing.length === 1) {
    // Patch with a reasonable default — this lead was likely a schema test doc
    await missing[0].ref.update({ city: 'Unknown', state: 'XX', updatedAt: new Date().toISOString() });
    console.log('  ✅  Patched with city:Unknown state:XX');
  }
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
