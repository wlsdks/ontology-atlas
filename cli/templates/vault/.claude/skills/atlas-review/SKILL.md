---
name: atlas-review
description: Review this vault. Find what is broken or disconnected, report it in plain language, and give the exact call that fixes each one. Writes nothing. Use for "what's wrong here" · "check the vault" · "is this healthy".
---

# /atlas-review — is this vault sound right now

**This skill writes nothing.** What it produces is one page: what is off, and
what call fixes it. Fixing happens after a person has read it and decided.

1. **Two calls**

- `validate_vault({})` — frontmatter and relation references
- `query_ontology({ operation: 'health' })` — the graph integrity checks

Do not `grep` or `sed` the frontmatter directly. You get the same answer more
slowly, without relation resolution or schema validation.

2. **Do not report what passed**

Listing healthy checks spends the reader's attention and buries the one thing
they need to act on. Report **only what needs a hand**. If everything is sound,
end in one line — "nothing to fix · N nodes · M relations".

3. **Three things per item**

| | |
|---|---|
| What happened | One plain sentence. Do not paste the check's identifier |
| Why it matters | What goes missing or renders wrong if it stays |
| The fix | One line the reader can copy and run |

The two you will see most:

- **Unreachable nodes** (`components`) — a node the project root cannot reach
  belongs to no project, so it never appears on the map. It exists and is invisible.
  → `add_relation('<project>', 'domains/<new domain>', 'domains')`
- **One-sided relations** (`relation_recommendations`) — a capability declares
  `domain: X` but `X` does not claim it back.
  → `add_relation('domains/X', 'capabilities/<capability>', 'capabilities')`

4. **If project meaning is yellow — stop here**

Never finalize `meaning_assessment` without human approval. The project's five
competency answers are a claim about what this project *is*, and an agent
cannot settle that on someone's behalf. Show what is missing and stop.

## How this skill fails

- Lists passing checks until the actionable one is buried
- Pastes the check identifier without translating what it means
- States the problem with no fix line — so the reader has to ask again
- Fixes things without asking
