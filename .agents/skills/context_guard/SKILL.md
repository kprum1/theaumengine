---
name: context_guard
description: >
  Detects when an Antigravity conversation is approaching its memory/context limit.
  Triggers an automatic handoff document write and warns the user to start a new session.
  Run this skill at the start of any long coding session, or invoke /context-guard at any time.
---

# Context Guard Skill

## What This Solves

Antigravity (and all LLM-based AI assistants) have a **context window** — a hard limit on how much conversation text can be held in active memory at once. When a conversation exceeds this limit:

1. The **oldest messages are silently dropped** from the AI's view — the AI doesn't know this happened
2. The AI begins giving **inconsistent answers** (forgets decisions made earlier)
3. Code it wrote 2 hours ago becomes **invisible** to it, causing duplicate work or regressions
4. The AI **cannot warn you** — it has no self-awareness of its own truncation

This skill gives YOU the ability to catch this before it causes problems.

---

## Warning Signs (Human-Detectable)

Watch for these signals that context is getting full:

| Signal | What It Looks Like |
|---|---|
| 🔴 AI asks about files it already built | "Should I create `funnel_tracker.js`?" (it already did) |
| 🔴 AI re-explains things you already decided | Rehashing architectural decisions from earlier |
| 🔴 Checkpoint messages appear | The system summary banners (`**Earlier parts truncated**`) |
| 🟡 Conversation is >2 hours old | Most sessions hit limits around 2-3 hours of heavy coding |
| 🟡 You've built >5 major features | Each feature = significant context consumption |
| 🟡 AI response quality drops | Shorter, more generic, less project-specific answers |

**When you see any 🔴 signal: stop, run `/handoff`, start a new conversation.**

---

## The `/context-guard` Workflow

When you type `/context-guard` or ask "check context", the AI should:

1. Count the approximate features/files built in this session
2. Assess whether a Checkpoint summary banner has appeared
3. Write or update the handoff document
4. Tell you: GREEN (safe), YELLOW (caution), or RED (start new session now)

### Status Levels

```
🟢 GREEN  — Session is young. <5 major features. Continue working.

🟡 YELLOW — Session is large (5-10 features, 1-2 hours). 
            Write handoff now. Plan to start fresh within 1-2 more tasks.

🔴 RED    — Context truncation detected or likely. 
            Write handoff immediately. Start a new conversation.
            Paste the HANDOFF file as your first message in the new session.
```

---

## The `/handoff` Workflow

When you type `/handoff`, the AI should:

1. Write (or update) `HANDOFF_[PHASE].md` in the project root
2. The file must include ALL sections from the **Handoff Template** below
3. Commit it to `main` with: `git add HANDOFF_*.md && git commit -m "docs: session handoff" && git push`
4. Tell you: "✅ Handoff written. Safe to start a new conversation."

---

## Handoff Document Template

Every handoff file MUST contain these sections:

```markdown
# [PROJECT] — [Phase] Handoff
**Date:** [ISO date]
**Repo:** [GitHub URL]
**Live URL:** [production URL]

## ⚠️ RESUME INSTRUCTIONS
[What to paste/read first when starting the next session]

## 1. WHAT WAS BUILT THIS SESSION
[List every feature/file built, with file names]

## 2. COMPLETE FILE INVENTORY
### New Files
[table: file | purpose]
### Modified Files  
[table: file | what changed]

## 3. FIRESTORE / DATABASE SCHEMA
[Any new collections, fields, or indexes needed]

## 4. PIPELINE / ARCHITECTURE
[How data flows through the system end to end]

## 5. PENDING / NEXT STEPS
- [ ] High priority items
- [ ] Medium priority items

## 6. OPEN DECISIONS
[Any architecture choices still unresolved]

## 7. CREDENTIALS & CONFIG
[Where keys live, what env vars are needed]

## 8. GIT LOG (this session)
[Last 5 commits]
```

---

## Proactive Session Rules (AI Must Follow)

When this skill is active, the AI must:

1. **After every 3rd major feature built**, add this to its response:
   ```
   📊 Session gauge: ~[N] features built. [GREEN/YELLOW/RED] — [recommendation]
   ```

2. **When a Checkpoint truncation banner appears**, immediately say:
   ```
   ⚠️ CONTEXT WARNING: The system just truncated earlier conversation history. 
   I may have lost context from earlier in the session. 
   Recommend: run /handoff and start a new conversation for the next task.
   ```

3. **Never silently continue** after truncation is detected.

---

## Context Size Estimation

Rough heuristics for this project (AUM Engine):

| Activity | Approx. Context Used |
|---|---|
| Reading a 200-line file | ~1% |
| Writing a new 100-line file | ~2% |
| Building a major feature (300-500 lines) | ~5-8% |
| Long planning discussion | ~3-5% |
| Full admin.js rewrite | ~10% |
| **This conversation (April 9, 2026)** | **~95%+ — DO NOT CONTINUE** |

**Rule of thumb:** If you've been in a session for 2+ hours and built 5+ major features, assume you're at 70-80% and start wrapping up.

---

## Quick Reference Card

```
Start of session:   Tell AI to read HANDOFF_[latest].md first
Every ~45 minutes:  Type "session check" 
At first 🔴 signal: Type "/handoff" then start new conversation
New session opener: Paste HANDOFF file content as first message
```
