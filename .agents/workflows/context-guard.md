---
description: Check context window health and warn if approaching limits
---

## Context Guard Check

Run this whenever the session feels long or you notice the AI acting confused.

1. Read `.agents/skills/context_guard/SKILL.md` for the full signal list

2. Assess the session:
   - Has a `**Earlier parts truncated**` banner appeared? → 🔴 RED
   - Built >8 major features this session? → 🔴 RED
   - Built 5-8 features or >90 minutes elapsed? → 🟡 YELLOW
   - Otherwise → 🟢 GREEN

3. Report status to the user:
   ```
   📊 Context Guard:
   Status: [🟢 GREEN / 🟡 YELLOW / 🔴 RED]
   Features built this session: ~[N]
   Truncation detected: [Yes/No]
   Recommendation: [Continue / Write handoff soon / Stop and handoff now]
   ```

4. If YELLOW or RED: immediately run the `/handoff` workflow
