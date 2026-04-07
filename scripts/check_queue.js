const admin = require('firebase-admin');
const sa = require('./serviceAccountKey.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

db.collection('routing_queue').get().then(snap => {
  const statuses = {};
  snap.docs.forEach(d => { const s = d.data().status; statuses[s] = (statuses[s]||0)+1; });
  console.log('routing_queue statuses:', JSON.stringify(statuses));
  console.log('total docs:', snap.size);
  const sample = snap.docs.slice(0,4).map(d => ({
    id: d.id.slice(0,8),
    status: d.data().status,
    name: d.data().fullName || d.data().idempotencyKey || '?'
  }));
  console.log('sample:', JSON.stringify(sample, null, 2));
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
