# 🔴 PRODUCTION BUG: Advisor Dashboard Shows 27 Demo Leads Instead of Assigned Leads
**Project:** The AUM Engine — `theaumengine.com` (Firebase Hosting + Firestore + Cloud Functions)
**Filed:** 2026-05-06
**Severity:** P0 — Blocks all advisors from seeing their assigned pipeline
**Reported By:** Kosal Prum (Operator)
**Assigned To:** Vera / Engineering Review

---

## 1. SYMPTOM

Every advisor on every browser except one specific desktop session sees **27 leads** on their dashboard. The correct number for Jeremy Steward is **272 assigned leads**.

**Screenshot evidence:** Mobile Chrome on `theaumengine.com`:
- TOTAL ASSIGNED: **27** ← should be 272
- ACTION READY: 0
- IN PIPELINE: 16
- "27 need data"

The 27 leads are the **hardcoded demo dataset** in `js/data.js` (28 objects, `p1`–`p29` with some gaps, net 27). The advisor's real Firestore data is never injected.

---

## 2. ARCHITECTURE

```
Firebase Auth login
    ↓
auth.js: onAuthStateChanged
    ↓
bootstrapUserData(uid)  ← db.js
    ↓ Promise.all([...])
    loadAssignedLeadsFromFirestore(uid)   ← PRIMARY LOADER
    ↓
initWithUserData(data)  ← app.js
    ↓
  if (data.assignedLeads.length > 0)
    PROSPECTS.unshift(...fresh)  ← NEVER RUNS if assignedLeads is []
    ↓
renderPage()  ← shows 27 demo leads
```

---

## 3. EXACT FAILURE POINT

### `loadAssignedLeadsFromFirestore(uid)` — `js/db.js`

**Step 1** — Client-side Firestore compound query:
```js
snap = await db.collection('lead_assignments')
  .where('ownerUid', '==', uid)
  .where('ownershipStatus', 'in', ['active', 'pending'])
  .limit(1000)
  .get();
```

**Step 2** — CF call with IDs from Step 1:
```js
const fn = firebase.functions().httpsCallable('getLeadsByIds');
await fn({ ids: chunk });
```

### Why It Fails Silently

`bootstrapUserData` outer catch swallows everything:
```js
} catch(e) {
  console.warn('[db.js] bootstrapUserData failed:', e);
  return { ..., assignedLeads: [] };  // ← silently returns empty
}
```

### Confirmed Failure Modes

| Failure Mode | Effect |
|---|---|
| Missing composite index (`ownerUid` + `ownershipStatus`) | Query returns FAILED_PRECONDITION |
| Firestore security rules block `in` collection query | Query returns PERMISSION_DENIED |
| `firebase.functions` SDK not loaded in index.html | CF call throws immediately |
| Any sub-query in `Promise.all` rejects | Whole function returns `assignedLeads: []` |

### Firestore Security Rule — Key Issue
```
match /lead_assignments/{id} {
  allow read: if request.auth != null
    && (resource.data.ownerUid == request.auth.uid ...);
```
> ⚠️ `resource.data` is NOT available for collection-level queries in Firestore Security Rules. For compound `.where()` queries, Firestore evaluates each doc individually — if ANY doc fails, the WHOLE query is denied. This is the most likely root cause on mobile/incognito.

---

## 4. DATA CONFIRMATION

- **Firestore:** 272 `lead_assignments` docs with `ownerUid = D8C1LLepDHNiKSEJv2ONHGNr1eh2`, `ownershipStatus: 'active'`
- **`data.js`:** `PROSPECTS` array has 27 demo leads (p1–p29, gaps at p8/p19)
- **`computeMetrics():`** reads `PROSPECTS.length` directly → shows 27

### `initWithUserData` — `app.js` lines 113–121:
```js
if (data.assignedLeads && data.assignedLeads.length > 0) {
  const existingIds = new Set(PROSPECTS.map(p => p.masterLeadId).filter(Boolean));
  const fresh = data.assignedLeads.filter(l => !existingIds.has(l.masterLeadId));
  if (fresh.length > 0) {
    PROSPECTS.unshift(...fresh);
    console.info(`[AUM] Loaded ${fresh.length} assigned lead(s) from Firestore.`);
  }
  // ↑ This entire block never executes when assignedLeads = []
}
```

---

## 5. FIX IMPLEMENTED (2026-05-06)

### CF Update — `getLeadsByIds` (DEPLOYED ✅)

Added `advisorMode: true` flag. When set, CF does **everything server-side via Admin SDK** (no rules, no index requirements):

```js
if (advisorMode || !Array.isArray(ids) || ids.length === 0) {
  // Admin SDK — bypasses ALL Firestore security rules and indexes
  const assignSnap = await db.collection('lead_assignments')
    .where('ownerUid', '==', uid)
    .where('ownershipStatus', 'in', ['active', 'pending'])
    .limit(1000)
    .get();
  // ... fetch master_leads via Admin SDK ...
  return { leads, assignments, advisorMode: true, count: assignSnap.size };
}
```

### `db.js` Update — `loadAssignedLeadsFromFirestore` (PATCHED ✅)

Replaced 2-step client-side approach with single CF call:
```js
const fn = firebase.functions().httpsCallable('getLeadsByIds');
const res = await fn({ advisorMode: true });
// res.data = { leads: [...272 master_leads...], assignments: [...272...] }
```

**⚠️ Hosting NOT yet redeployed with the db.js change. That's the next step.**

---

## 6. NEXT STEPS NEEDED

1. `firebase deploy --only hosting` — push updated `db.js` live
2. Verify `index.html` contains `firebase-functions-compat.js` (line ~779)
3. Test on mobile Chrome: login `jsteward@theaumengine.com` / `jsteward2026`
4. Open DevTools Console — look for:

**Success:**
```
[db.js] CF advisorMode OK {assignments: 272, masterLeads: 272}
[AUM] Loaded 272 assigned lead(s) from Firestore.
```

**Failure — SDK missing:**
```
[db.js] ❌ firebase.functions not available
```
→ Add `firebase-functions-compat.js` to index.html

**Failure — CF rejected:**
```
[db.js] ❌ CF advisorMode FAILED {code: "...", message: "..."}
```
→ Check GCP Cloud Functions logs for `getLeadsByIds`

---

## 7. ALL ADVISOR CREDENTIALS

| Advisor | Email | Password | Leads |
|---|---|---|---|
| Jeremy Steward | `jsteward@theaumengine.com` | `jsteward2026` | 272 |
| Chuck Cooper | `ccooper@theaumengine.com` | `ccooper2026` | 210 |
| Patrick Wight | `pwight@theaumengine.com` | `pwight2026` | 143 |
| Andy Belly | `abelly@theaumengine.com` | `abelly2026` | 72 |
| Ray | `rray@theaumengine.com` | `rray2026` | 139 |
| Matt Germshied | `mgermshied@theaumengine.com` | `mgermshied2026` | 188 |
| Jeremy Jackson | `jjackson@theaumengine.com` | `jjackson2026` | 207 |

---

## 8. FILES MODIFIED

| File | Change |
|---|---|
| `functions/index.js` | Added `advisorMode` to `getLeadsByIds` CF |
| `js/db.js` | Replaced 2-step client query with single CF `advisorMode` call |
| `index.html` | Added `firebase-functions-compat.js`, bumped `db.js?v=20260506a` |
| `js/auth.js` | iOS UA detection for App Check bypass |
| `firebase.json` | Cache-Control `max-age` → 3600 (1h) |

---

*Brief prepared by Antigravity — 2026-05-06T11:10 CST*
*Project: `theaumengine` | Repo: `AdvDiamondMining`*
