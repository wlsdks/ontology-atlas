---
name: atlas-grow
description: The next step. Propose, with evidence, what would add the most to this vault. Writes nothing until a person picks. Use for "what should I fill in next" · "find the gaps" · "what's missing".
---

# /atlas-grow — where to fill in next

## One rule — the proposal step never writes

Only what a person picked lands in the vault. An invented node is the worst
thing this tool can produce: **a wrong map is worse than no map.** With no map
people go look for themselves; with a wrong one they decide on it.

1. **Where does this vault stand**

- `query_ontology({ operation: 'agent_brief' })` — the starting point and next action
- `query_ontology({ operation: 'growth_plan' })` — what is empty

2. **Filter candidates against evidence**

Do not relay the candidates as they arrive. Each one must survive three tests.

- **Does it exist** — is there evidence in code or docs, or does it merely
   sound plausible? Check with `find_evidence({ title })`. If a source folder is
   bound, `analyze_repo_structure` and `infer_imports` supply the evidence.
- **Is it already here** — search near-names first with
   `query_concepts({ filter })`. If it exists, do not create a second one; fill
   the existing node with `patch_concept` (pass `expected_mtime`).
- **Does it carry meaning** — an element needs a reason beyond its location.
   One node per file is not a map, it is a file listing.

3. **Show it to the person**

**Five at a time, at most.** Each line carries three things — ① what ② where it
attaches ③ why you believe it (the evidence). Do not ask "shall I create them
all?" Number them so the answer can be a selection.

4. **Write only what was approved — then verify**

- Nodes: `add_concepts` (chunks of 50 when there are many)
- **Only after every node succeeded**, relations: `add_relations`
- `validate_vault({})` → `query_ontology({ operation: 'health' })`

**A new domain does not attach itself to the project.** Skip
`add_relation('<project>', 'domains/<new domain>', 'domains')` and you have
built something the map will never show. Step 4's health check catches it.

## How this skill fails

- Invents plausible names with no evidence
- Misses an existing node and creates a near-duplicate beside it
- Writes without asking
- Creates nodes but no relations, so nothing it made is visible anywhere
- Skips verification, leaving the person to discover the breakage later
