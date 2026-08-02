# Ontology Atlas Vault Specification v2.0-rc (RFC)

> Status: **RFC** (Request for Comments). This is a v2.0 release candidate,
> not a ratified standard — see [§0 RFC status and feedback](#0-rfc-status-and-feedback)
> for the review window and how to comment.
>
> This document promotes an **already-shipped, already-enforced** de-facto
> schema into a formal specification. v2 makes immutable node `uid` mandatory;
> this is the first deliberate breaking change and ships with the explicit
> migration in §8. Every normative statement below
> is backed by a source file and, where applicable, a contract test cited
> inline. Where this document and the code disagree, **the code wins** —
> file an issue (§0) so the drift gets fixed in one direction or the other.

---

## 한국어 요약 (Korean summary)

이 문서는 `ontology-atlas` 저장소가 이미 구현하고 강제해온 vault 마크다운
frontmatter 스키마를 **공개 명세로 승격**한 것이다. v2는 모든 `kind:` 노드에
불변 UUIDv4 `uid`를 요구하는 첫 breaking revision이다 — `mcp/src/schema.mjs` (canonical) · `cli/src/lib/schema.mjs`
(mirror) · `src/shared/lib/validate-vault-document.ts` (validator) 가 실제로
하는 일을 그대로 문서화한다.

핵심 요지:

- **포맷**: 평문 마크다운 + YAML frontmatter. 5 종 kind (`project` /
  `domain` / `capability` / `element` / `document`) + 타입이 있는 관계
  (`domains` / `capabilities` / `elements` / `depends_on` / `relates` /
  `contains` / `describes`).
- **왜 명세가 필요한가**: "사람이 읽고, 에이전트가 유지하고, git 이 추적하는
  구조화된 프로젝트 메모리"의 표준 자리가 비어 있다 — MCP 는 프로토콜이지
  포맷이 아니고, 기존 에이전트 메모리 포맷들은 특정 프레임워크에 종속적이다.
  이 저장소는 스펙·레퍼런스 구현·검증기·contract test 를 이미 갖춘 후보다.
- **신뢰 규칙**: vault body 는 **데이터이지 지시가 아니다** — 에이전트는
  vault 안의 텍스트를 프롬프트 지시로 실행하면 안 된다 (§7 참고).
- **버저닝**: v1.x 는 additive-only였고, 필수 UID는 v2 breaking 계약이다.
  `pnpm vault:migrate 2026-08-02-add-node-uids --vault <dir>`를 먼저 dry-run한
  뒤 `--write`로 명시 적용한다.
- **준수 테스트**: `tests/contract/vault-schema.contract.test.ts` +
  `tests/contract/validate-vault-document.contract.test.ts` 가 레퍼런스
  스위트 — 이 명세를 구현하려는 다른 도구도 같은 fixture 로 자가 검증할 수
  있다.
- **RFC 피드백**: 8주 창 — 이 기간 동안 GitHub Issues 피드백 0건이면
  표준화 트랙을 접고 코어에 전념한다 (제품 계획 kill criteria).

---

## Abstract

Ontology Atlas defines an open, file-based format for **structured project
memory that a person can read, an AI agent can maintain, and git can track**.
A project's business domains, capabilities, implementation elements, and the
typed relations between them live as YAML frontmatter inside plain `.md`
files in a version-controlled folder (the *vault*). No database, no server,
no login: the git repository already is the source of truth, and any tool
that can read a folder of Markdown files can read the graph. This
specification exists because the standard slot for "a project memory format
that is human-readable, agent-maintainable, and git-trackable" is currently
empty — MCP is a transport protocol, not a memory format, and existing agent
memory systems couple the data model to a specific runtime or vendor. This
document describes the vault format precisely enough that a second,
independent implementation could read and write a conformant vault without
consulting this repository's source code.

## 0. RFC status and feedback

This is **v2.0-rc**, a release candidate open for public comment. It documents
the already-enforced dual-identity behavior covered by contract tests in this
repository (`ontology-atlas`). The v1 RC never became a ratified compatibility
baseline, but v2 still names the UID requirement as breaking and provides an
explicit migration rather than silently rewriting a vault.

- **Where to comment**: open a GitHub issue on the `ontology-atlas` repository
  with the `spec` label, or start a discussion thread if the repository has
  GitHub Discussions enabled.
- **Feedback window**: 8 weeks from publication. This window matches this
  project's own kill-criteria commitment — the product plan
  (`docs/plans/PRODUCT-PLAN-2026-07.md`, §11) states that if the RFC receives zero
  outside feedback in 8 weeks, the standardization track is shelved in favor
  of the core local-first product, and the spec draft is not resurrected
  until a new signal (partner request, real adoption) appears.
- **What "v2.0" will mean**: once the window closes with real engagement,
  the RFC label is dropped and the version becomes the compatibility
  baseline for §8 below. Until then, treat every detail as subject to
  clarification. Any later breaking change still follows §8.

## 1. Conformance language

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY**
in this document are to be interpreted as in RFC 2119 / BCP 14: MUST /
MUST NOT are hard requirements a conformant reader or writer cannot violate;
SHOULD / SHOULD NOT are strong recommendations that a conformant
implementation can deviate from with a documented reason; MAY marks a true
option.

Two conformance levels are defined for implementations:

- **Level 1 — Reader**: parses `.md` files with YAML frontmatter, recognizes
  the `kind` values in §2, and resolves the relation keys in §5 into a graph.
  A Level 1 reader MUST NOT require write access to the vault.
- **Level 2 — Writer**: in addition to Level 1, creates or edits `.md` files
  such that the resulting frontmatter matches the per-kind shape in §3 (field
  presence, array-default emission, key ordering is a SHOULD not a MUST) and
  respects the uniqueness/containment rules in §4.

Any tool may implement Level 1 only (e.g. a static site generator that
renders the vault) or both levels (e.g. an MCP server or CLI that also
writes nodes). This repository's own `mcp/` package and `cli/` package are
both Level 2.

## 2. The five node kinds

Every ontology node is a single `.md` file whose YAML frontmatter includes a
`kind` key. The recognized values are defined by `VAULT_KINDS` in
`mcp/src/schema.mjs` (mirrored in `cli/src/lib/schema.mjs`):

```js
export const VAULT_KINDS = ['project', 'domain', 'capability', 'element', 'document'];
```

| kind | meaning | typical parent | typical children |
|---|---|---|---|
| `project` | top-level deliverable this vault describes | — (root) | `domain`, direct `capability`/`element` |
| `domain` | a functional grouping inside the project (auth, billing, search, …) | `project` | `capability` |
| `capability` | one user-visible or agent-visible unit of behavior inside a domain | `domain` | `element` |
| `element` | a distinct implementation role a capability uses — supported by a file/module path, library, or external dependency | `capability` or `domain` | — (leaf) |
| `document` | narrative or reference material tied to the graph but not itself a domain object (an ADR, a design doc, a README) | any | — |

A sixth value, `vault-readme`, appears in the runtime's `KNOWN_VAULT_KINDS`
enum (`src/shared/lib/validate-vault-document.ts`) but is **reserved for the
tool-generated vault README** — conformant writers MUST NOT set
`kind: vault-readme` on a hand- or agent-authored node.

Any frontmatter with a `kind` value outside these six is flagged by the
validator as `unknown-kind` (§6) — a warning, not a hard parse failure, so a
node with a typo'd or forward-looking kind still parses; it is simply
invisible to kind-aware queries until corrected.

## 3. Per-kind frontmatter shape

This section is a literal transcription of `VAULT_KIND_SCHEMA` in
`mcp/src/schema.mjs` — the canonical source, mirrored byte-for-byte in
`cli/src/lib/schema.mjs` and kept in lock-step by
`tests/contract/vault-schema.contract.test.ts`.

Every node, regardless of kind, MUST have:

- `uid` — immutable lowercase UUIDv4. The node's permanent identity for exact
  lookup, handoff/provenance, compiler indexes, and `urn:uuid:` interop.
- `slug` — string. The mutable, human-readable current address used inside the
  vault to reference it (see §4).
- `kind` — one of the six values in §2.
- `title` — string. Human-readable display name.

`merged_uids` is optional, merge-owned identity history. Generic writers and
manual patches MUST NOT create or alter it; `merge_concepts` may extend it with
the absorbed node's primary and prior merged UIDs.

Beyond that base, each kind adds:

### `project`

| field | category | notes |
|---|---|---|
| `domains` | array default `[]` | slugs of child `domain` nodes |
| `capabilities` | array default `[]` | slugs of directly-owned `capability` nodes (bypassing a domain) |
| `elements` | array default `[]` | slugs of directly-owned `element` nodes |
| `dependencies` | optional | external/project-level dependencies |
| `relates` | optional | non-hierarchical cross-references |
| `description` | optional | one-line summary |
| `status` | optional | free-text lifecycle marker |

No `requiredExtras` — a project node with only `slug`/`kind`/`title` is
already valid (SHOULD carry at least one of `domains`/`capabilities` in
practice, or it contains nothing).

### `domain`

| field | category | notes |
|---|---|---|
| `capabilities` | array default `[]` | slugs of child `capability` nodes |
| `depends_on` | optional | domain-level dependency edges |
| `relates` | optional | |
| `description` | optional | |

No `requiredExtras`.

### `capability`

| field | category | notes |
|---|---|---|
| `elements` | array default `[]` | slugs of child `element` nodes |
| `domain` | **strongly expected** (`requiredExtras: ['domain']`) | parent domain slug |
| `depends_on` | optional | |
| `relates` | optional | |
| `description` | optional | |

`domain` is not a hard MUST at parse time (a capability without it still
parses and writes), but it is the one field the validator treats as
*strongly expected* — see §6. Without it the capability cannot be reached
from the project→domain containment walk in §4 and shows up as an orphan in
tooling.

### `element`

| field | category | notes |
|---|---|---|
| `domain` | **strongly expected** (`requiredExtras: ['domain']`) | owning domain slug |
| `path` | optional | repo-relative source path this element documents |
| `depends_on` | optional | |
| `relates` | optional | |
| `description` | optional | |

Elements have no `arrayDefaults` — no array key is auto-emitted on creation.

**Element slug — one writer pattern** (from `mcp/src/construction-rules.mjs`):

| pattern | example | when to use |
|---|---|---|
| flat role slug | `mcp-sdk`, `file-system-access-api`, `jwt-signer` | always; the slug names the implementation role and its source location lives in `path:` |

A Level 2 writer MUST NOT emit a path-shaped element slug such as
`elements/src/features/auth`. This repository's writer rejects it because path
segments are evidence, not identity, and basename collisions can silently fold
different roles together. A Level 1 reader MAY parse a legacy path-shaped slug
for recovery, but MUST NOT treat that as permission to emit a new one.

### `document`

| field | category | notes |
|---|---|---|
| `describes` | optional | slugs of nodes this document explains |
| `relates` | optional | |

No `arrayDefaults`, no `requiredExtras` — the loosest kind, intended for
prose (ADRs, design docs) that references the graph without being a graph
object itself.

### Summary table (identical to `mcp/README.md`'s frontmatter table)

| kind | MUST have | always emitted on write | strongly expected |
|---|---|---|---|
| `project` | `uid`, `slug`, `kind`, `title` | `domains: []`, `capabilities: []`, `elements: []` | — |
| `domain` | `uid`, `slug`, `kind`, `title` | `capabilities: []` | — |
| `capability` | `uid`, `slug`, `kind`, `title` | `elements: []` | `domain` |
| `element` | `uid`, `slug`, `kind`, `title` | — | `domain` |
| `document` | `uid`, `slug`, `kind`, `title` | — | — |
| `vault-readme` | `uid`, `slug`, `kind`, `title` | — | — |

"Always emitted" fields are kept as empty arrays rather than omitted, so a
human editing the file by hand sees the slot even before it is filled.
"Strongly expected" fields never block a write; a Level 2 writer SHOULD
surface their absence back to the caller (this repo's `add_concept` returns
it as a `warnings` array entry) and a validator SHOULD flag it (§6,
`missing-expected-field`).

## 4. UID, slugs, uniqueness, and containment

- **Permanent identity**: `uid` MUST be a unique lowercase UUIDv4 across every
  primary and `merged_uids` claim in the vault. It is minted once locally,
  never derived from title/path/slug, and preserved by rename/reclassify.
  Conformant writers MUST NOT deliberately recycle a deleted UID. v2 keeps no
  tombstone ledger, so a current-vault validator cannot prove that a manually
  supplied UID was never used in deleted history; use merge rather than delete
  when old-UID resolution must survive.
- **Readable address**: `slug` MUST be unique across the vault. It is the
  identifier Markdown relations, wikilinks, inline `domain:`, files, URLs, and
  human-entered graph commands use. Rename changes this address and rewrites
  backlinks while preserving UID.
- **Slug vs. filename**: by convention a node's file path mirrors its slug
  under a per-kind folder (`domains/`, `capabilities/`, `elements/`; `project`
  and `document` are root-level, no folder prefix — see `folderForKind` in
  `mcp/src/schema.mjs`), but the frontmatter `slug:` value, not the filename,
  is the current address a Level 1 reader MUST trust for slug-based relations.
- **Aliases**: a reference to a node MAY use its full slug, a unique
  "tail" fragment (e.g. `mcp-server` resolving to `capabilities/mcp-server`
  when unambiguous), or an explicit alias captured on the target's own
  `slug:` key. Renaming a node (`rename_concept`) rewrites every backlink
  atomically so aliases do not silently dangle.
- **Project containment is implicit** — there is no `project:` key on
  domain/capability/element frontmatter. Containment is derived, not stated:
  the runtime walks the `contains` / `belongs_to` graph (in practice, the
  `domains` / `capabilities` / `elements` / `domain` keys described in §5)
  outward from every `kind: project` root via breadth-first search, and every
  descendant reachable from that walk is stamped with that project's slug as
  a `projectIds` entry (see `AGENTS.md`, "Project containment is implicit").
  Consequences a conformant implementation MUST respect:
  - Writing `kind: capability` with `domain: foo` is sufficient — the
    capability→domain→project chain resolves automatically through `contains`
    edges; no separate project-stamping step is required or expected.
  - A vault with zero `kind: project` documents is still valid — every node
    is simply an orphan in project-containment terms until a project node is
    added, at which point every existing descendant picks up `projectIds` on
    the next derive with **no migration** required.
  - Cross-project structural facts (per-project dashboards, cross-project
    edge counts) MUST be computed from this BFS, not from a hand-maintained
    field, so they cannot drift from the graph itself.

## 5. Relation types and their semantics

Relations are expressed two ways in frontmatter, both resolved into the same
canonical edge set by a Level 2 implementation's compiler:

1. **Array-valued containment/reference keys** — `domains`, `capabilities`,
   `elements`, `dependencies` (public name `depends_on`), `relates`,
   `contains`, `describes`. Each is a list of slugs (or aliases). These keys
   are the `GRAPH_ARRAY_KEYS` set recognized by both the schema
   (`mcp/src/schema.mjs`) and the validator
   (`src/shared/lib/validate-vault-document.ts`).
2. **Inline scalar parent key** — `domain` (a single slug, not an array) on
   `capability` and `element` nodes, expressing "this node's parent domain
   is X."

| key (frontmatter) | public/edge name | direction | typical use |
|---|---|---|---|
| `domains` | `contains` (project→domain) | outgoing | project owns these domains |
| `capabilities` | `contains` (domain→capability, or project→capability) | outgoing | parent owns these capabilities |
| `elements` | `contains` (capability→element) | outgoing | parent owns these elements |
| `domain` | `contains`, inverse direction | outgoing (single) | this capability/element's parent domain |
| `dependencies` | `depends_on` | outgoing | this node functionally depends on the target |
| `relates` | `relates` | non-directional / associative | loose cross-reference with no ownership or dependency implication |
| `contains` | `contains` | outgoing | generic containment when the more specific `domains`/`capabilities`/`elements` shape doesn't apply |
| `describes` | `describes` | outgoing | a `document` node explains/documents the target |

Notes a conformant implementation MUST honor:

- `depends_on` is the **public name**; the canonical frontmatter storage key
  is `dependencies`. A Level 2 writer accepting `depends_on` as an argument
  MUST normalize it to `dependencies` before writing frontmatter, and a
  reader exposing relation names to a human or agent SHOULD show `depends_on`
  even though the on-disk key is `dependencies` (this repo's `query_ontology`
  does exactly this dual-naming in `match_edges.relationType` /
  `node_profile` / `domain_matrix` outputs).
- All array-valued relation keys are stored as **canonical sets**: trimmed,
  deduplicated, and sorted (`localeCompare`, `'en'` locale) — see
  `normalizeGraphArray` in `mcp/src/schema.mjs`. A Level 2 writer MUST
  produce this canonical form on every write so that re-running the same
  logical edge set twice produces zero diff noise in git. A Level 1 reader
  MUST NOT assume order carries meaning even when it encounters a
  non-canonical (unsorted or duplicated) array — that is a documented,
  advisory-only drift state (§6, `non-canonical-graph-array`), not a parse
  error.
- Relation semantics are directional in intent (`depends_on`, `contains`,
  `describes` all express "A points at B") except `relates`, which is
  intentionally the loose, non-committal edge for "these are connected
  somehow" without asserting ownership or dependency.

## 6. Validation semantics — errors vs. advisory warnings

Validation is deliberately two-tier: a small **error** set that means "this
file is not a recognizable graph node," and a larger **warning** set that
means "this file is a graph node with a quality issue," so that a partially
malformed vault degrades gracefully rather than refusing to load.

Reference implementation: `src/shared/lib/validate-vault-document.ts`
(runtime + UI surface) and `mcp/src/validate.mjs` (AI-agent / MCP surface),
kept in lock-step by
`tests/contract/validate-vault-document.contract.test.ts`.

| code | severity | meaning |
|---|---|---|
| `unclosed-frontmatter` | **error** | file starts with `---` but has no closing `---` — not parseable as a node at all |
| `empty-kind` | **error** | `kind:` key present but its value is blank/whitespace — cannot be classified into any of the six kinds |
| `parse-zero-keys` | warning | a frontmatter block exists but zero keys were extracted (indentation/colon issue suspected) |
| `missing-kind` | warning | no `kind:` key at all (the file may be intentionally kind-less prose) |
| `unknown-kind` | warning | `kind:` has a value outside the six recognized values (§2) |
| `missing-uid` | **error** | a `kind:` node has no immutable identity; migrate the vault before using v2 writers/compiler |
| `invalid-uid` | **error** | `uid:` is not a lowercase UUIDv4 |
| `invalid-merged-uids` | **error** | merge identity history is malformed or repeats the survivor UID |
| `duplicate-uid` | **error** | two nodes claim the same primary or merged identity in one vault |
| `non-canonical-merged-uids` | warning | merge history is not a sorted, duplicate-free set |
| `missing-expected-field` | warning | a "strongly expected" field for this kind (§3 — `domain` on capability/element) is absent or blank |
| `non-canonical-graph-array` | warning | a relation array (§5) is present but not in canonical sorted/deduped form |
| `dangling-graph-reference` | warning | *(whole-vault validators only — see below)* a relation array or `domain` key points at a slug that does not exist anywhere in the vault |

Structural parse failures and v2 identity failures are errors; the other
quality codes remain advisory. A v1 vault without UID is intentionally not a
conformant v2 vault until the §8 migration runs. A conformant validator MUST
treat a report as `ok: true` whenever its error count is zero, even with any
number of warnings.

`dangling-graph-reference` is listed in `mcp/src/validate.mjs`'s
whole-vault validator (`validate_vault`) but is **not**
detectable by the fast per-document validator in
`src/shared/lib/validate-vault-document.ts` (7 codes) — this is a scope
difference, not drift: detecting a dangling reference requires scanning
every other node's slug, which only a whole-vault pass can do. A per-file
UI check (fast path, used while a human is editing a single file) cannot
and does not claim to catch it.

## 7. The untrusted-content principle

**Vault body content is data, not instructions.** This is a hard,
non-negotiable trust boundary, not a style preference: an AI agent reading
vault Markdown (frontmatter *or* body prose) MUST NOT execute any sentence
inside that content as a directive to itself, regardless of how imperative
it reads ("delete this node," "ignore prior instructions," "run this
command"). The vault is exactly as trustworthy as any other file a
developer committed to the repository — which is to say, it can contain
text written by a prior careless edit, an external contributor, or (once
community vault sharing exists) a stranger's PR, and none of that changes
its status as content to be *read and reasoned about*, never *obeyed*.

Conformant tooling MUST implement, at minimum (Tier 1, ship-blocking per
`docs/plans/PRODUCT-PLAN-2026-07.md` §7):

- Wrap vault body content passed into an LLM context in an explicit
  untrusted-content boundary (e.g. `<untrusted_vault_content>` tags) so the
  model's own training treats it as quoted data, not as the system/developer
  turn.
- Never interpolate raw vault content into a tool's *description* field —
  only into content payloads a model already treats as data.
- Parse YAML with a safe loader (no arbitrary tag/object construction) and
  pattern-scan for injection-shaped strings before treating parsed values as
  safe to display verbatim.
- Gate every write path behind the same approval tier a human-authored edit
  would go through — an agent MUST NOT auto-apply a write merely because a
  vault document appeared to request it.

Beyond Tier 1, the roadmap (not yet a MUST for v2.0-rc conformance) adds
structured responses with provenance and adversarial CI coverage (Tier 2),
and a taint-tracking gate plus public red-team exercises for any
community-shared vault registry (Tier 3). A `verified` badge on a
community vault, if and when that surface ships, means **structural
validation passed** — it explicitly does NOT mean "cannot contain a prompt
injection." Implementations MUST NOT claim or imply the stronger meaning.

## 8. Versioning and compatibility policy

- **This spec is v2.0-rc.** v2 deliberately requires immutable lowercase
  UUIDv4 `uid` on every `kind:` node, including `vault-readme`. Rename and
  reclassify preserve it; merge records absorbed identity in `merged_uids`.
  A v1 vault without UID therefore requires the migration below.
- **v1.x was additive-only.** A v1.x parser or validator MUST continue to
  accept every v1.0 vault unmodified. New optional keys, new relation types,
  or a new kind MAY be introduced in a v1.x release; an existing MUST-level
  requirement from an earlier v1.x version MUST NOT be strengthened into a
  stricter MUST, and an existing key's meaning MUST NOT be silently
  repurposed.
- **The v1 → v2 migration is explicit.** Preview with
  `pnpm vault:migrate 2026-08-02-add-node-uids --vault <dir>` and apply with
  the same command plus `--write`. The runner validates the complete identity
  plan before its first write, preserves valid UIDs, rejects malformed or
  duplicate primary/merged claims, defaults to dry-run, and refuses dirty
  Markdown in git vaults unless the owner explicitly passes `--force`.
- **Future breaking changes require a new major version and a migration
  path.** This repository's `scripts/migrate-vault.mjs` (invoked as
  `pnpm vault:migrate`) is the reference migration mechanism: it lists
  registered migrations (`--list`), defaults to a dry-run, and only writes
  to disk when the caller passes `--write` explicitly. Any future breaking
  schema change to this spec SHOULD ship with a corresponding migration in
  the same shape — list, dry-run default, explicit opt-in write — so a
  vault owner never loses data to a silent auto-migration.
- **Validator advisory codes (§6) may grow, but MUST NOT retroactively
  become errors** without another major version bump — promoting a warning to an
  error is itself a breaking change under this policy, since it can turn a
  previously-`ok` vault into a failing one.
- **This document's own versioning**: while status is RFC, clarifying edits
  (wording, added examples, cross-references) do not require a version bump;
  any substantive change to a MUST/SHOULD statement or table does, and MUST
  be recorded in `docs/CHANGELOG.md`.

## 9. Conformance test suite

There is no separate spec-only test suite — the reference suite *is* this
repository's existing contract-test layer, because the spec is a
transcription of already-tested behavior:

- **`tests/contract/vault-schema.contract.test.ts`** — verifies
  `mcp/src/schema.mjs` and `cli/src/lib/schema.mjs` produce byte-identical
  `buildFrontmatter` output, `missingExpectedFields` decisions, and
  `folderForKind` mappings for the same fixture matrix
  (`tests/fixtures/vault-schema-cases.mjs`), and additionally cross-checks
  that the UI's `KIND_EXPECTED_EXTRAS` dictionary agrees with the schema's
  `requiredExtras` for every kind. This is the direct test of §3 and §4
  (uniqueness/`requiredExtras` behavior) of this spec.
- **`tests/contract/validate-vault-document.contract.test.ts`** — runs the
  same 8-fixture matrix through both `src/shared/lib/validate-vault-document.ts`
  and `mcp/src/validate.mjs`, asserting they agree on issue *codes* and
  *structure* (exact message phrasing is allowed to differ). This is the
  direct test of §6 of this spec.
- **`tests/contract/parse-frontmatter.contract.test.ts`** — a 3-way parser
  contract (`src/shared/lib`, `mcp/src/parser.mjs`, `scripts/lib`) covering
  the underlying YAML-frontmatter-in-Markdown parsing this spec assumes in
  §2–§5.
- **`pnpm vault:validate`** — the CLI entry point a human or CI pipeline
  runs against a real vault directory; it is the whole-vault version of the
  validator described in §6 and is itself run in this repository's CI.

An independent implementation claiming conformance to this spec SHOULD run
its own reader/writer against the same fixture files
(`tests/fixtures/vault-schema-cases.mjs`) and produce matching results —
that is the practical meaning of "conformant" until a spec-only, package-
independent fixture bundle is published separately (not yet done as of
v2.0-rc; tracked as a possible N1+ follow-up, not a v2.0-rc requirement).

## 10. Non-goals of this specification

- This spec does not define a query language, an API transport, or an MCP
  tool surface — those are documented separately in `mcp/README.md` and are
  implementation choices layered on top of the vault format, not part of the
  format itself.
- This spec does not mandate a specific graph traversal algorithm,
  visualization, or UI. Any tool that can parse the frontmatter shape in §3
  and resolve the relations in §5 is a conformant reader regardless of what
  it does with that graph.
- This spec does not define authentication, multi-user collaboration, or
  conflict resolution across concurrent editors — the reference
  implementation is single-user/local-first by design (`.claude/rules/local-first.md`);
  a future collaboration layer would extend, not replace, this document.

---

*This document lives at `docs/ONTOLOGY-ATLAS-SPEC.md` in the
`ontology-atlas` repository. See `AGENTS.md` for contributor guidance and
`docs/plans/PRODUCT-PLAN-2026-07.md` for the roadmap context this RFC serves
(Network Track, N0).*
