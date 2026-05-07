---
name: ontology-bootstrap
description: Bootstrap an empty (or near-empty) oh-my-ontology vault from the surrounding codebase — call analyze_repo_structure once, show the proposed candidates, and selectively land the accepted ones via add_concepts / add_relations (batch writers). Use when the user says "이 codebase 분석해줘" / "bootstrap the ontology" / "fill the vault from the code", or when you notice the vault has only the 5 starter nodes and the user has asked you to do anything ontology-related. Skip when the vault already has 20+ user-curated nodes — bootstrap is for the cold-start case only.
---

# /ontology-bootstrap — fill an empty vault from the code

Two facts make a fresh `oh-my-ontology` vault feel empty:

1. `oh-my-ontology init` only seeds 5 *example* nodes — they're meant to be
   replaced, not extended.
2. Hand-authoring the first 20–30 nodes is the heaviest friction in the
   onboarding path (measured: ~25 cli `add` calls in the Paravel real-codebase
   dogfood — `docs/dogfood-paravel-2026-05-06.md`).

This skill closes that gap with **3 MCP calls total** — one read
(`analyze_repo_structure`) plus two batch writes (`add_concepts` for the
nodes, `add_relations` for the edges). Down from ~25 round-trips. It is
the *cold-start* counterpart to `/ontology-sync` (which keeps an
already-grown vault in step with new code).

## When to run

**Run when** any of these are true:
- the user says "이 codebase 분석해줘" / "bootstrap the ontology" / "fill the vault from this repo" / similar.
- the user asked you to do anything ontology-related and `list_kinds` shows ≤ 5 nodes (only starters).
- the user just ran `oh-my-ontology init` and is asking what to do next.

**Skip when**:
- the vault already has 20+ user-curated nodes — at that point `/ontology-sync` (incremental) is the right tool.
- the user explicitly opted out (e.g. "I'll add nodes by hand") — respect it.
- there is no reachable repository (running in a non-code dogfood folder).

## Workflow

The MCP server (`oh-my-ontology-mcp`, R16 v0.8.0+) exposes
`analyze_repo_structure`. CLI wrapper: `oh-my-ontology analyze [rootPath]`.

### 1. Measure the cold-start (cheap)

```
list_kinds                                # confirm vault is near-empty
```

If `total > 20` and the kinds look user-curated (mix of capability/domain/element with non-`example` slugs), ask before proceeding — the user may want `/ontology-sync` instead.

### 2. Analyze the repo (one call, side effect 0)

```
analyze_repo_structure({ rootPath: "<repo root or '.'>", maxDepth: 2 })
```

The response shape:

```jsonc
{
  "rootPath": "/path/to/repo",
  "framework": "fsd" | "next" | "generic",
  "project":      { "slug": "...", "title": "..." },
  "domains":      [{ "slug", "title", "evidence": { "source": "README.md", "line": 7 } }, …],
  "capabilities": [{ "slug", "title", "evidence": { "source": "src/features/auth" } }, …],
  "elements":     [{ "slug", "title", "evidence": { "source": "src/widgets/header" } }, …],
  "suggestedRelations": [{ "from": "<project>", "to": "<cap>", "type": "contains" }, …],
  "skipped":      [{ "path": "...", "reason": "dotfile/ignore" }, …]
}
```

This call writes **nothing** — it's a pure read. The user is the only writer.

### 3. Show a compact summary to the user

Five lines max — the agent is the curator, not the encyclopedia. Group by kind, count, list the top 3 of each, point at evidence:

```
Detected framework: fsd
project:       my-app — Sample app
domains (3):   authentication · billing · notifications     ← README.md
capabilities (5): auth · billing · user · …                 ← src/features/* + src/entities/*
elements (2):  src/widgets/header · src/views/home          ← FSD widget/view dirs

Land all of these as the ontology bootstrap? (yes / pick / refine)
```

### 4. Hand control to the user

Three branches — all use the **batch writers** (R+: `add_concepts` cap 50, `add_relations` cap 50). Each batch is one round-trip; rows fail independently with `{ok: false, error}` so a stale slug or missing target doesn't abort the rest.

- **yes** — assemble one `concepts[]` array containing the project + every domain + every capability + every element. Call `add_concepts({ concepts })` once. Then build `relations[]` from `suggestedRelations` and call `add_relations({ relations })` once. 2 writes total.
- **pick** — list the candidates one kind at a time, let the user accept/reject per item, then build the filtered `concepts[]` / `relations[]` and run the same two batch calls. Drop relations whose endpoints didn't make the cut.
- **refine** — let the user rename slugs / titles inline before any write. Apply the rename to the candidate arrays *and* to the relations (`from` / `to`) so they still match. Then 2 batch calls as above.

If a batch exceeds 50 rows (rare but possible in monorepos), split into chunks of 50 — each chunk is still one round-trip. Whatever path is chosen, **the user (via your `add_concepts` / `add_relations` calls) is the only writer**. Single source of truth preserved.

### 5. Land + verify

After the writes, finish with one read so the user sees the result:

```
list_kinds                                # new census
list_concepts({ limit: 100 })             # the new vault contents
```

Show the kind census diff in the reply (e.g. *"Vault grew 5 → 18 nodes (+3 domains, +6 capabilities, +4 elements)"*).

## Failure modes

- **`add_concepts` row returns `ok: false` with "already exists"** — the starter `example` nodes (or a previous bootstrap) collided. Other rows still land (the batch is partial-success, not all-or-nothing). Inspect the failed rows; for each, either skip (already present is fine) or follow up with `patch_concept` to overwrite the body. Do *not* retry the whole batch — that just re-fails the same rows.
- **`add_concepts` row returns `ok: false` with "duplicate slug in input batch"** — your candidate array had the same slug twice. Pick one occurrence and re-submit only that row.
- **`missing-expected-field` warning on a per-row `warnings: [...]`** — a capability or element was added without `domain:`. Tolerable for bootstrap (vault still validates), but surface the warnings to the user so they can backfill.
- **`add_relations` row returns `ok: false` with "does not exist"** — an endpoint was rejected in the `add_concepts` step. Confirm and either drop the relation or add the missing concept first.
- **`add_relations` row returns `alreadyExists: true`** — that edge was already present (idempotent). Not an error; surface as informational only.
- **MCP unavailable in this session** — fall back to the CLI:
  - `oh-my-ontology analyze . --apply` lands every node candidate via the same `add_concepts` + `add_relations` batch (R+).
  - `oh-my-ontology infer-imports . --apply` then lands `depends_on` edges from the TS/JS import graph (50-row chunks).
  - Together these two commands give agent-less full bootstrap (nodes + import edges) without K-round-trip CLI loops.
  - For per-row picking, drop `--apply` and call `oh-my-ontology add <kind> <slug> --title=...` for accepted ones (K round-trips, but only when curating).
- **Repo too deep / monorepo** — pass `rootPath` for the relevant subdirectory, or run `analyze` per package and merge results.

## Reply discipline

Five lines or fewer per reply. Show what changed (counts, slugs), not how. Do not paste the full JSON response. The user is reading a chat thread, not API output.

## Cross-references

- **`/ontology-sync`** — the *incremental* counterpart for already-grown vaults.
- **`AGENTS.md` → "Working with the ontology while you code"** — the read-then-write discipline for non-bootstrap tasks.
- **`docs/dogfood-paravel-2026-05-06.md`** — the friction measurement that motivated this skill (25 manual `add` calls in a real codebase).
- **`mcp/README.md` → "Frontmatter shape per kind"** — what fields each kind needs.
