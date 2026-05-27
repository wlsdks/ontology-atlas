# Benchmark tasks

> 7 tasks across 3 categories. Each has a known correct answer (verifiable
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
> 이 repo 의 ontology vault 에서 `vault-local-first` 도메인 아래에 어떤 capability 와 element 들이 있는지 정리해줘. 도메인 자체의 설명 한 줄도 포함.

**Correct answer (verify against `docs/ontology/`):**
- The agent should list the domain's `capabilities: [...]` array (currently includes `capabilities/scaffold-vault`, `capabilities/vault-validator`, etc — verify against the actual file at measurement time).
- Plus elements that have `domain: domains/vault-local-first` in their frontmatter.
- Plus the domain's title / one-line description from its `.md` body.

**Score axis emphasis:** correctness, tool-call efficiency.

### A2 — Stub / unfinished detection

**Prompt:**
> 이 repo 의 ontology 에서 `kind: capability` 인데 `elements` 배열이 비어 있는 노드들 (= 미완료 후보) 을 찾아줘.

**Correct answer:**
- Verifiable via `query_concepts({ filter: "kind=capability AND NOT has(elements)" })` (MCP-on) or by grepping all capability `.md` files (MCP-off).
- The agent should produce the actual list of slugs, not a heuristic guess.

**Score axis emphasis:** hallucinations (any non-existent slug = -1 per item), correctness.

### A3 — Reference graph for a specific node

**Prompt:**
> `capabilities/mcp-server` 를 frontmatter 에서 참조하고 있는 모든 노드를 찾아 kind 별로 분류해줘.

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

### B1 — Validator issue codes

**Prompt:**
> oh-my-ontology 의 vault validator 가 detect 하는 issue code 들을 모두 나열하고 각각의 의미를 한 줄씩 설명해줘.

**Correct answer:**
- 5 codes: `unclosed-frontmatter`, `empty-kind`, `missing-kind`, `unknown-kind`, `parse-zero-keys`.
- Defined in `src/shared/lib/validate-vault-document.ts` and `mcp/src/validate.mjs` (cross-package contract test enforces drift).
- The capability `capabilities/vault-validator` documents this in body — MCP-on agents may find it via `get_concept`.

**Score axis emphasis:** correctness (all 5 codes named), hallucinations (any extra invented codes).

### B2 — Conflict guard mechanism

**Prompt:**
> oh-my-ontology MCP 의 write 도구들이 사용자의 외부 에디터 변경을 어떻게 감지하는지, 어떤 도구가 어떤 인자를 받는지 설명해줘.

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

### C1 — Function exports

**Prompt:**
> `src/shared/lib/validate-vault-document.ts` 에서 export 되는 함수들을 모두 나열해줘.

**Correct answer:**
- Verifiable by reading the file. Currently exports `validateVaultDocument`, `validateVaultDocFrontmatter`, `summarizeVaultValidation` (verify at measurement time).
- This is a pure-grep task — no graph reasoning needed.

**Score axis emphasis:** correctness, tool-call efficiency (should be 1-2 reads). MCP-on should not over-use ontology tools here.

### C2 — package.json scripts

**Prompt:**
> 이 repo 의 `package.json` 의 `scripts:` 객체에 정의된 명령어들을 모두 나열해줘.

**Correct answer:**
- Read `package.json`, list all keys in `scripts`; derive the count at measurement time instead of trusting this doc. Current examples include `dev`, `build`, `lint`, `test`, `test:run`, `vault:validate`, `test:vault:validate`, `vault:audit`, `vault:migrate`, `bundle:check`, `package:check`, `dogfood:walk`, and the focused `test:mcp:*` scripts.
- Pure file-read.

**Score axis emphasis:** efficiency, no-MCP-overhead.

---

## How tasks were chosen

- **Cat A (3 tasks)** — designed to play to the ontology's strengths. If MCP-on doesn't win here, the product premise is in trouble.
- **Cat B (2 tasks)** — semantic questions where the body text and frontmatter both hold partial answers. Tests whether the agent navigates the graph or wanders.
- **Cat C (2 tasks)** — negative control. If we don't see neutrality here, the test is bias-confounded.

The 3:2:2 ratio biases the bench *toward* showing a positive effect — by design, because that's the hypothesis we're trying to falsify. If the bench leans MCP-on and we still see no effect, the negative result is robust.
