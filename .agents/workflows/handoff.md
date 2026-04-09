---
description: Write a session handoff document and commit it to main
---

## Handoff Workflow

Run this when ending a session or when context guard reports YELLOW/RED.

// turbo
1. Find the latest HANDOFF file in the project root:
   ```bash
   ls /Users/kosalprum/Documents/AdvDiamondMining/HANDOFF_*.md | sort | tail -1
   ```

2. Write a new HANDOFF file named `HANDOFF_[PHASE].md` (e.g. `HANDOFF_C4.md`) in the project root following the template in `.agents/skills/context_guard/SKILL.md`. It must include:
   - What was built this session (every file, new and modified)
   - Firestore schema changes
   - Pipeline/architecture state
   - Pending next steps (prioritized)
   - Open decisions
   - Credentials/config
   - Last 5 git commits

// turbo
3. Commit and push:
   ```bash
   cd /Users/kosalprum/Documents/AdvDiamondMining && git add HANDOFF_*.md && git commit -m "docs: session handoff [phase]" && git push origin main
   ```

4. Confirm to the user:
   ```
   ✅ Handoff written: HANDOFF_[PHASE].md
   ✅ Committed to main
   
   START YOUR NEXT SESSION WITH:
   "Read HANDOFF_[PHASE].md first, then we'll continue from [next priority item]"
   ```
