# Benchmark tasks

> 10 tasks across 4 categories. Each has a known correct answer (verifiable
> by human against the current `docs/ontology/` vault, code, and PR history)
> so we can grade independent of the AI's confidence.
>
> **Paste the prompt verbatim into a fresh agent session.** No follow-ups.

---

## Category A — cross-cutting graph questions

> Questions where the answer requires reasoning over multiple nodes / edges
> in the ontology. We expect the MCP-on mode to show a clear advantage:
> single MCP tool calls return the whole picture, while MCP-off has to
> grep through markdown files file-by-file and stitch the answer together.

### A1 — Domain composition

**Prompt:**
> List the capabilities and elements under the `local-vault-management` domain in this repo's ontology vault. Include a one-line description of the domain itself.

**Correct answer (verify against `docs/ontology/`):**
- The agent should list the domain's `capabilities: [...]` array. Verify against the actual file at measurement time.
- Plus elements that have `domain: domains/local-vault-management` in their frontmatter.

> **Retargeted 2026-08-25.** This task named `vault-local-first`, a domain that no
> longer exists. It had been asking both modes about nothing since the rename, and
> nobody noticed because the benchmark had not run since May. A stale benchmark
> reports zero effect and looks like a measurement.
- Plus the domain's title / one-line description from its `.md` body.

**Score axis emphasis:** correctness, tool-call efficiency.

### A2 — Stub / unfinished detection

**Prompt:**
> Find nodes in this repo's ontology with `kind: capability` but empty `elements` arrays (= potential incomplete items).

**Correct answer:**
- Verifiable via `query_concepts({ filter: "kind=capability AND NOT has(elements)" })` (MCP-on) or by grepping all capability `.md` files (MCP-off).
- The agent should produce the actual list of slugs, not a heuristic guess.

**Score axis emphasis:** hallucinations (any non-existent slug = -1 per item), correctness.

### A3 — Reference graph for a specific node

**Prompt:**
> List all nodes referencing `capabilities/mcp-server` in frontmatter, categorized by kind.

**Correct answer:**
- All nodes whose frontmatter array key (`capabilities`, `elements`, `dependencies`, `relates`, `contains`, `describes`) or inline string key (`domain`) contains `capabilities/mcp-server`.
- MCP-on: one `find_backlinks` call returns this with `matchedKeys`.
- MCP-off: must grep recursively and parse YAML mentally.

**Score axis emphasis:** correctness, hallucinations, time-to-answer.

---

## Category B — semantic / design questions

> Questions where the answer is partially in code, partially in docs,
> partially in the ontology body text. We expect a graded response —
> MCP-on should help if the ontology covers the question, otherwise neutral.

### B1 — Capability boundary (decision, not description)

**Prompt:**
> Explain what the ontology-atlas ACP runtime capability explicitly includes and excludes, together with the reason the boundary was drawn there.

**Correct answer:**
- `capabilities/acp-runtime` carries `## Boundaries`, and that section is the only place the reason lives.
- An MCP-off agent can read `src/features/**` and describe what the code does, but the *reason* for the boundary is not in the source.

> **Replaced 2026-08-25.** The old B1 asked for the five validator issue codes,
> and the May run scored MCP-on 3/3 because `capabilities/vault-validator` listed
> them verbatim in its body. That node is gone, and the codes now live only in
> `src/shared/lib/validate-vault-document.ts`.
>
> The removal was correct and the task was the problem. It measured the vault as a
> documentation cache: a second copy of something the source already owned, which
> is exactly the content that goes stale. The replacement asks for a decision the
> source cannot answer, which is the only claim this product actually makes.

**Score axis emphasis:** correctness (both sides of the boundary plus the reason), hallucinations (an invented rationale).

### B2 — Conflict guard mechanism

**Prompt:**
> Explain how ontology-atlas MCP's write tools detect external editor changes by users, and what arguments each tool accepts.

**Correct answer:**
- mtime-based — `get_concept` returns `mtime` (ms), all write tools (`patch_concept` / `delete_concept` / `add_relation` / `rename_concept` / `merge_concepts`) accept optional `expected_mtime`.
- Mismatch throws `VaultConflictError`.
- Documented in `mcp/CHANGELOG.md` (R11) and `capabilities/mcp-conflict-guard`.

**Score axis emphasis:** correctness (lists all 5 write tools, names mtime mechanism), subjective utility.

---

## Category C — negative control (raw grep / read sufficient)

> Questions answerable by simple file-reading. MCP-on should NOT show a
> meaningful advantage here. If MCP-on dramatically underperforms, it
> means the ontology is steering the agent toward irrelevant context.

## Category D — meaning (the claim this product actually makes)

A, B and C measure retrieval. None of them measure whether a change lands in the
right place, so none of them can confirm or refute the product's own claim.

Each D task is phrased the way a person brings a request. The graded answer is not
"did it find the node" but "did it name the boundary, cite where the boundary
lives, and stop where the boundary stops". The reason is in the vault body and
nowhere in the source, so an agent that only greps has to invent one. Score with
the D-only axes in [`rubric.md`](rubric.md).

### D1 — Documented exclusion

**Prompt:**
> A request came in to make our MCP server do code symbol search too. Should that be built inside the `mcp-server` capability? Give the grounds either way.

**Correct answer:**
- No. `capabilities/mcp-server` `## Inclusions / Exclusions` excludes an AST/source search engine in as many words, alongside embedding stores, model selection, and backends.
- The answer must name that exclusion and say the request falls outside it. Agreeing scores 0 on boundary fidelity however well argued.
- A strong answer also notes the vault records no home for it yet, so placing it is a decision, not a lookup.

### D2 — Impact boundary before a change

**Prompt:**
> I want to change the ontology vault schema. What can break, and why does it break? Not a guess: say where the reason is written.

**Correct answer:**
- `capabilities/mcp-server` declares `dependencies: [capabilities/vault-ontology]`, and its `relation_notes` states the reason: a schema change alters the agent-facing read and write contract.
- The reason lives in frontmatter written by a person. No amount of reading `mcp/src/` recovers it.

### D3 — Verification path and disclaimed scope

**Prompt:**
> I changed the ACP runtime code. What do I have to check before calling it done? And what does this capability explicitly not take responsibility for?

**Correct answer:**
- `capabilities/acp-runtime` `## Boundaries` disclaims Windows Job Object process-tree ownership, browser process launching, and in-app chat for runtimes without an app-owned permission gate.
- An answer that promises the capability covers Windows process trees has invented a rationale: the vault says the opposite.

### C1 — Function exports

**Prompt:**
> List all functions exported from `src/shared/lib/validate-vault-document.ts`.

**Correct answer:**
- Verifiable by reading the file. Currently exports `validateVaultDocument`, `validateVaultDocFrontmatter`, `summarizeVaultValidation` (verify at measurement time).
- This is a pure-grep task — no graph reasoning needed.

**Score axis emphasis:** correctness, tool-call efficiency (should be 1-2 reads). MCP-on should not over-use ontology tools here.

### C2 — package.json scripts

**Prompt:**
> List all commands defined in the `scripts:` object of this repo's `package.json`.

**Correct answer:**
- Read `package.json`, list all keys in `scripts`; derive the count at measurement time instead of trusting this doc. Current examples include `dev`, `build`, `lint`, `test`, `test:run`, `vault:validate`, `test:vault:validate`, `vault:audit`, `vault:migrate`, `package:check`, `dogfood:walk`, and the focused `test:mcp:*` scripts.
- Pure file-read.

**Score axis emphasis:** efficiency, no-MCP-overhead.

---

## How tasks were chosen

- **Cat A (3 tasks)** — designed to play to the ontology's strengths. If MCP-on doesn't win here, the product premise is in trouble.
- **Cat B (2 tasks)** — semantic questions where the body text and frontmatter both hold partial answers. Tests whether the agent navigates the graph or wanders.
- **Cat C (2 tasks)** — negative control. If we don't see neutrality here, the test is bias-confounded.
- **Cat D (3 tasks)** — meaning questions about boundaries, impact, and verification; these are the product claim, not ordinary lookup.

The 3:2:2:3 ratio biases the bench *toward* showing a positive effect — by design, because that's the hypothesis we're trying to falsify. If the bench leans MCP-on and we still see no effect, the negative result is stronger.
