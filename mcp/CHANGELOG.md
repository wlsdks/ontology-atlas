# Changelog — oh-my-ontology-mcp

## 0.12.0 — 2026-05-14

### Added — `.omotignore` for materialize noise reduction

- vault 루트의 `.omotignore` 파일 (gitignore-style glob 패턴) 이 `growth_plan` / `maintenance_plan` 의 `materialize_external_element` 추천에서 매치되는 ref 를 제외. 의도된 외부 코드 (예: `src/**`, `cli/**`) 가 매번 80+ noise 로 surface 되던 paper cut 정정.
- 패턴 문법: `*` (디렉토리 안 모든 문자) · `**` (재귀) · `?` (단일 char) · `/`·이름 path. `#` 주석 + 빈 줄 skip. 부정 (`!`) 1차 미지원.
- 응답 투명성: `growth_plan` / `maintenance_plan` 의 summary 에 `externalElementRefsIgnored: N` 카운트 노출. 사용자가 "왜 추천이 줄었지" 분간 가능.
- `mcp/src/omot-ignore.mjs` (load + glob match) + 11 신규 단위 테스트.
- `createOntologyEngine(artifact, { omotIgnorePatterns })` 옵션 + `queryCompiledOntology(artifact, query, { omotIgnorePatterns })` chain. wrapper 가 `loadOmotIgnore(VAULT_ROOT)` 호출.

### Fixed — package tarball runtime files

- `package.json#files` now includes runtime-only imports `src/schema.mjs` and `src/omot-ignore.mjs`. Packed installs can boot `src/index.js` and run `compile_ontology` / `query_ontology` without source-checkout-only files.
- `package.json#files` now includes `scripts/json-rpc-lines.mjs`, the shared JSON-RPC line parser used by the installed `npm run verify` path.
- `package.json#files` now ships only the `src/parser.test.mjs` smoke fixture needed by installed `npm run verify`; full test files stay source-checkout-only so the published tarball remains lean.
- `npm run verify` now exercises the full first-contact diagnosis path: server boot, 23-tool inventory, `list_concepts`, `get_concepts`, `list_kinds`, `validate_vault`, `workspace_brief`, `health`, `compile_ontology`, `overview`, and `overview query_plan`.
- `npm run verify` now checks the `get_concepts` batch reader with slugs discovered from `list_concepts` plus one missing slug, so installed packages catch success-row / partial-row contract drift without assuming dogfood-specific vault slugs.
- `npm run verify` cross-checks `list_kinds` census totals against `list_concepts`, `validate_vault`, `compile_ontology`, and `overview`, so package installs catch kind-count drift before an agent trusts the vault summary.
- `npm run verify` now fails on blocking first-contact diagnosis problems: `list_concepts` vault warnings, `fail` health checks, or fail-severity `workspace_brief.nextActions` return exit 1, while advisory `needs_attention` states still print for starter vaults.
- `npm run verify` now treats missing or malformed first-contact diagnosis payloads (`workspace_brief.nextActions`, `workspace_brief.health.checks`, `health.checks`) as failures instead of clean vaults.
- `npm run verify` now requires every health check row to include an `id` and `status`, so coverage output cannot hide malformed checks as `unknown`.
- `npm run verify` now prints the validated `workspace_brief.health.checks` count in the `workspace_brief` success line, so first-contact output shows both next actions and health coverage.
- `npm run verify` now prints health check `id:status` coverage in the `health` success line, so a green install shows which graph-integrity checks actually ran.
- `npm run verify` prints non-blocking `workspace_brief.nextActions` as a compact advisory list, so starter vault users see what to clean up after MCP wiring is confirmed.
- `npm run verify` uses an 8s server wait window by default and supports `OMOT_VERIFY_TIMEOUT_MS` for larger/slower vaults.
- `OMOT_VERIFY_TIMEOUT_MS` is validated as a strict positive integer, so partial values like `1000ms` fail instead of being silently truncated.
- `npm run verify` now exits as soon as all first-contact JSON-RPC responses arrive, while true timeout failures name the missing response groups and suggest increasing `OMOT_VERIFY_TIMEOUT_MS`.
- `npm run verify` now distinguishes server startup failures before `initialize` from timeout failures, preserving stderr such as invalid `OMOT_VAULT` diagnostics.
- `npm run verify` now detects first-contact JSON-RPC error responses immediately and reports the failing step instead of waiting for timeout.

## 0.11.0 — 2026-05-14

### Added — `compile_ontology` summary + nodes/edges pagination

- **`summary: true` 옵션** — `nodes` / `edges` / `aliases` / `ambiguousAliases` / `canonicalizationActions` / `indexes` 배열 일괄 omit. `graphHash` + `maxMtime` + 카운트 (`nodeCount` / `edgeCount` / `aliasCount` / `ambiguousAliasCount` / `issueCount` / `canonicalizationActionCount` / `resolvedEdgeCount` / `externalEdgeCount` / `unresolvedEdgeCount`) + `byKind` / `byDomain` aggregate counts 만 반환. cache invalidation / graph-size 판단 / 변화 감지 용 cheap polling.
- **`nodesLimit` / `nodesOffset`** — nodes 배열 slice. 응답에 `nodesPagination: { offset, limit, total, returned, hasMore, nextOffset }` 메타 동봉.
- **`edgesLimit` / `edgesOffset`** — edges 배열 독립 slice + `edgesPagination`.
- 옵션 미지정 시 기존과 동일 (backward compat).
- 동기: dogfood 26 노드 vault 에서도 응답 64KB/1910 line → MCP 토큰 한도 초과. 100+ 노드 vault 에선 AI agent 가 도구 호출 자체를 못 함 → mission v3 의 AI-agent-primary 약속 깨짐.
- 신규 단위 테스트 5 (summary 형태 / hash 동일 / nodes slice / edges slice / no-meta backward compat).

## 0.10.0 — 2026-05-07 (R18/R20 — batch tools + vault health)

### Added

- **`validate_vault` (20번째 MCP 도구) — vault 전체 health 한 호출에.** 입력 없음, 출력 `{ scanned, problems: [{slug, issues: [{code, severity, message}]}], summary: { problemFiles, errorFiles, warningFiles, byCode: { code: { severity, count, files } } } }`. CLI `oh-my-ontology validate --json` 와 같은 shape. agent 가 `list_concepts` → per-doc `get_concept` 의 K-roundtrip 패턴 대신 1 round-trip 으로 vault 전체 health 받음. read tool 12 종 = list_concepts · get_concept · get_concepts · find_evidence · find_backlinks · find_path · list_kinds · find_orphans · query_concepts · **validate_vault** · analyze_repo_structure · infer_imports. 신규 integration test 2 건.
- **`add_relations` (19번째 MCP 도구) — 배치 edge writer.** 입력 `{relations: [{from, to, type}, ...]}` (max 50), 출력 `{relations: [{ok: true, from, to, type, alreadyExists?} | {ok: false, from, to, type, error}, ...]}`. 입력 순서 보존. 각 row 독립 + idempotent — 같은 edge 두번 → 두번째 `alreadyExists: true`. missing source/target slug / unknown type 은 row-level `ok:false`. atomic rollback 없음. add_concepts 의 edge 측 짝 — `analyze_repo_structure` (suggestedRelations) / `infer_imports` (moduleEdges) 출력을 한 호출에 land 가능. write tool 7 → 8. 신규 integration test 2 건 (배치 idempotent + partial / 빈 + cap).
- **`add_concepts` (18번째 MCP 도구) — 배치 writer.** 입력 `{concepts: [{slug, kind, title, ...}, ...]}` (max 50), 출력 `{concepts: [{slug, ok: true, filePath, warnings?} | {slug, ok: false, error}, ...]}`. 입력 순서 보존. 각 row 는 독립 처리 — 한 row 의 실패 (existing slug / invalid kind / missing required) 가 batch 를 abort 하지 않음, 그 row 만 `ok:false` 로 surface. 입력 *내* 중복 slug 도 사전 감지: 두번째 동일 slug 는 "duplicate slug in input batch" 로 명료한 에러. atomic rollback 없음 (필요하면 single add_concept). `get_concepts` 의 write 측 짝 — `/ontology-bootstrap` 흐름이 5~15 노드를 한 호출에 land 가능. write tool 6 → 7. 신규 integration test 2 건.
- **`get_concepts` (17번째 MCP 도구) — 배치 reader.** 입력 `{slugs: string[]}` (max 50), 출력 `{concepts: [{slug, ok: true, frontmatter, excerpt, neighbors, mtime, warnings?} | {slug, ok: false, error}, ...]}`. 입력 순서 보존. agent 가 `list_concepts` / `find_path` / `find_orphans` 결과의 K 개 slug 에 대해 full body+neighbors 가 필요할 때 K round-trip → 1 round-trip. partial result — missing slug 이 있어도 batch 가 abort 되지 않고 그 행만 `ok:false` 로. read tool 11 종 = list_concepts · get_concept · **get_concepts** · find_evidence · find_backlinks · find_path · list_kinds · find_orphans · query_concepts · analyze_repo_structure · infer_imports. write 6 = 변동 없음. 신규 integration test 2 건 (배치 read + partial / 빈 + cap).
- **`find_evidence` 매치 row 에 `domain` + `mtime` 추가.** 기존 row 는 `slug, kind, title, matchedIn, excerpt` 만 — domain/mtime 누락이라 read tool 5종 중 유일하게 일관성 갭. 추가하여 list_concepts · find_backlinks · find_orphans · query_concepts · find_evidence 모두 동일 shape (`slug, kind, title, domain, mtime, ...specific`). 기존 find_evidence 테스트에 mtime > 0 assertion 추가.
- **`query_concepts` 매치 row 에 `mtime` 추가.** 기존 row 는 `slug, kind, title, domain, capabilities, elements` 만 — `mtime` 누락이라 read tool 4종 중 유일하게 staleness 정보 없음. 추가하여 list_concepts · find_backlinks · find_orphans · query_concepts 모두 일관 shape. 신규 integration test 1건.
- **`find_orphans` orphan row 에 `domain` + `mtime` 포함.** `list_concepts` / `find_backlinks` 와 동일 shape — read tool 응답 일관성 완성. agent 가 orphans 받자마자 "old orphans in domain X" sort/filter 가능, 후속 `get_concept` 없이. 신규 integration test 1건.
- **`find_backlinks` 매치 row 에 `domain` + `mtime` 포함.** `list_concepts` 와 동일 shape. agent 가 backlinks 받자마자 "어느 도메인 referrer / 언제 변경" 파악 → sort/filter 가능, 후속 `get_concept` 없이. 신규 integration test 1건.
- **`list_concepts` `summary: true` opt-in** — 각 row 에 prose `summary` (max 200 chars, `extractSummaryExcerpt` helper 3rd consumer) 동봉. agent 가 한 호출로 vault 노드 list + 각 노드 무슨 내용인지 파악 가능 → 후속 N×`get_concept` 절약. default off (페이로드 부풀림 방지). 신규 integration test 1건 (default 미포함 / `summary:true` 시 prose 포함 검증).
- **`list_concepts` 응답 각 node 에 `mtime` (ms).** `get_concept` 의 `mtime` 과 같은 의미. AI agent 가 list 한 호출로 *어느 노드가 최근에 변경됐나* 파악 → sort/filter 가능, 후속 `get_concept` 없이. 외부 변경 감지 (예: `expected_mtime` 으로 patch 보호) 흐름에도 도움. 신규 integration test 1건 (모든 node.mtime 이 number > 0).
- **`list_concepts` `since` 옵션** — incremental sync 용 mtime 필터. 이전 list 응답의 max mtime 을 다음 호출에 since 로 패스 → 그 후 변경된 노드만. strict `mtime > since` 라 같은 max 재전송해도 double-fetch 없음. 큰 vault (수백 노드) 에서 polling agent 의 토큰/대역 절약. 신규 integration test 1건 (since=max → 0건, since=max-1 → 1+).

### Changed

- **`get_concept` excerpt 가 prose-aware.** 기존 `body.slice(0, 800)` 은 dogfood `capabilities/mcp-server.md` 같이 H1+표 위주 문서에선 800자 모두 markdown table syntax 만 채워져 agent token budget 낭비. 새 `extractSummaryExcerpt` helper 가 heading / 표 / 코드블록 / 리스트 / 인용을 skip 후 첫 prose 단락만 추출. 측정: dogfood `capabilities/mcp-server.md` excerpt **800 chars (table syntax) → 78 chars (clear prose summary)** — agent 가 받는 의미 밀도 ~10x ↑. block-only body 는 fallback 으로 원본 trim. 9 신규 unit test (prose / H1 skip / 표 skip / 코드블록 skip / multi-line / 빈 body / block-only / maxLen cap / 리스트).
- **`find_evidence` 응답 each match 에 `excerpt` (max 200 chars).** `get_concept` 의 `extractSummaryExcerpt` 와 같은 prose-aware 추출. agent 가 find_evidence 한 호출로 *어느 doc 이 reference 하는지* + *그 doc 자체 무슨 내용인지* 둘 다 받음 — 추가 get_concept 호출 없이. tool description 도 갱신. 1 신규 integration test (subdir fixture 도 함께 — `makeVault` helper 가 subdir slug 자동 mkdir 하도록 보강).

## 0.9.0 — 2026-05-06 (R17 — import graph → depends_on edges)

### Added

- **`infer_imports`** — TS/JS file import graph parser. side effect 0. Walks `src/` (또는 `lib/`/`app/`/`packages/` fallback) → regex parse static / dynamic / require / re-export / side-effect import → resolves relative paths → **collapses to module-level edges (capability A → B with import count)**. agent 가 moduleEdges 를 *depends_on* 후보로 검토 후 `add_relation` 호출.
- **path alias `@/*`** convention 지원 — `@/shared/api` → `src/shared/api/index.ts` 로 resolve. Next.js / FSD project 의 80%+ case cover. unresolved 면 `reason: 'alias-not-found'`.
- 8 unit test (relative / external / alias / dynamic·require·reexport / module collapse / unresolved / ignored folders / side-effect).

### Validated

- **Paravel real-codebase** (사용자 본인 React Native + Expo, 1.8 GB): 304 files / 837 edges / 506 external / 0 unresolved / **103 module edges**. FSD layering 정확 — `screens → shared (98)`, `app → screens (22)`, `features/* → entities/*` 패턴.

### Tools count

- **16 (10 read + 6 write)** — infer_imports 가 read (side effect 0).

## 0.8.0 — 2026-05-06 (R16 — autonomous bootstrap base)

### Added

- **`analyze_repo_structure`** — 새 도구. 사용자 한 줄 *"이 codebase 분석해줘"* 후 AI agent 가 호출할 deterministic 도구. **side effect 0** — vault frontmatter 절대 안 건드림, 후보만 return. 감지: `package.json` `name/description` → project 후보, `README.md` 첫 H1 → project title fallback, `README.md` H2 (Usage/Installation 등 generic skip) → domain 후보, `src/features|entities|widgets|views/*` (FSD) 또는 `src/*` (generic) → capability/element 후보. + `suggestedRelations` (project contains 각 capability).
- 사용자 검토 후 *명시 add_concept / add_relation* 만 vault 진입 — 단일 source of truth 보존.
- 7 unit test — FSD / generic / no package.json / generic README 섹션 skip / ignored folders / empty dir / suggested relations.

### Tools count

- **15 (9 read + 6 write)** — analyze_repo_structure 가 read (side effect 0).

## 0.7.1 — 2026-05-04

### Added

- **`instructions` field on initialize response** — 연결된 AI agent (Claude Code, Cursor, …) 가 항상 보는 시스템-prompt 수준 안내 추가. (1) kind 계층 (project → domain → capability → element) 의 의미, (2) 첫 연결 시 권장 호출 순서 (`list_kinds` → `list_concepts` → `get_concept` → `find_backlinks` …), (3) write 도구의 dry-run + `confirm: true` 패턴, (4) `expected_mtime` 충돌 가드 패턴, (5) 새 capability/element 발견 시 `add_concept` 으로 vault 동기화 책임. 14 tool description 만으로는 매 세션 agent 가 시행착오로 학습하던 부분을 단번에 해소. integration test (`initialize — instructions 필드`) 1 케이스 추가 — drift 즉시 회귀.

### Tools count

- 14 (8 read + 6 write) — 변동 없음 (instructions 는 기존 도구 보강).

## 0.7.0 — 2026-05-04

### Added (R11 라운드)

- **`rename_concept`** — atomic slug rename + backlink redirect (frontmatter array entries · inline string keys · body wikilinks `[[slug]]` · markdown links `(slug.md)`). dry-run default. tail-only references (`mcp-server` for `capabilities/mcp-server`) 도 새 tail 로 일관 갱신.
- **`merge_concepts`** — fold one node into another. fromSlug 의 모든 backlink 를 intoSlug 로 redirect 후 fromSlug.md 삭제. dry-run default.
- **mtime-based conflict guard** — `get_concept` 응답에 `mtime` (ms) 추가. 모든 write 도구 (`patch_concept` / `delete_concept` / `add_relation` / `rename_concept` / `merge_concepts`) 에 옵션 `expected_mtime` 인자. 외부 변경 감지 시 `VaultConflictError` throw — 사람 GUI · 외부 에디터 · 다른 AI MCP 가 같은 .md 동시 편집 시 silent overwrite 차단.
- **vault corruption surface** — `list_concepts` 응답에 `vaultWarnings: { errorCount, warningCount }` (vault-wide). `get_concept` 응답에 `warnings: [...]` (해당 doc 의 5 issue codes — unclosed-frontmatter / empty-kind / missing-kind / unknown-kind / parse-zero-keys). AI agent 가 vault 상태 인지 + 사용자 안내 가능.

### Tests

- `redirect-backlinks.test.mjs` — 7 단위 (helper level)
- `conflict-detection.test.mjs` — 8 단위 (mtime guard 흐름)
- `integration.test.mjs` — 9 통합 (spawn + stdio JSON-RPC + tmp vault)
- `validate.test.mjs` — 10 단위 (3 → 10, R11 #23 corruption codes)

### Tarball

- `package.json` 의 `files` 명시적 list 로 정밀화. test 6 개 제외 (verify smoke 의 parser.test.mjs 만 1 예외 포함). 28.5 KB / 9 files (이전 34.8 KB / 15 files, -18%).

### Tools count

- 12 (8 read + 4 write) → **14 (8 read + 6 write)**

## 0.6.0 — 2026-04 직전

- 12 tools (8 read + 4 write). `query_concepts` 추가 — typed filter DSL (kind=X AND has(Y) AND NOT ...).

## 0.5.0

- 7 read + 4 write. `find_orphans` 추가.

## 0.4.0

- 10 tools (6 read + 4 write). `delete_concept` 추가 — dry-run + backlinks 가드.

## 0.3.0

- 9 tools. `find_path` (BFS) + `list_kinds` (census) 추가.

## 0.2.0 / 0.1.0

- 7 / 5 tools 초기 셋.
