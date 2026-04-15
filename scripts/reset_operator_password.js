// Check operator account status + reset password if needed
'use strict';
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccountKey.json')) });

async function run() {
  const user = await admin.auth().getUserByEmail('kosal@fin-tegration.com');
  console.log('UID:      ', user.uid);
  console.log('Email:    ', user.email);
  console.log('Disabled: ', user.disabled);
  console.log('Providers:', user.providerData.map(p => p.providerId).join(', '));
  console.log('Created:  ', user.metadata.creationTime);
  console.log('Last sign-in:', user.metadata.lastSignInTime || 'never');
  
  // Reset password to AUM2026!
  await admin.auth().updateUser(user.uid, { password: 'AUM2026!' });
  console.log('\n✅ Password reset to AUM2026! — try logging in again.');
  process.exit(0);
}
run().catch(e => { console.error('Error:', e.message); process.exit(1); });
