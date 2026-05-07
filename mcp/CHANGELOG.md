# Changelog — oh-my-ontology-mcp

## Unreleased

### Changed

- **에러 메시지를 actionable 하게.** AI agent 가 다음 액션을 한 호출에 결정 가능:
  - `add_concept` 가 dup slug 만나면 `patch_concept` (업데이트) / `rename_concept` (이동) 사용 권장 + "delete-then-add 금지 — backlinks 유실" 명시.
  - 모든 not-found 에러 (deleteDoc / patchFrontmatter / updateDoc) 가 `list_concepts` / `find_evidence` 안내 + 같은 vault 안의 *비슷한 slug 후보* (substring / prefix 매치) 동봉.
  - `add_relation` 의 source/target 누락 시 비슷한 slug 후보 또는 `add_concept` 안내. AI agent 가 typo / hallucinated slug 를 받았을 때 즉시 자가 수정 가능.
- 새 export `suggestSimilarSlugs(rootPath, badSlug, limit=3)` — Levenshtein 없이 tail 정확/substring 양방향/prefix 3-tier 매칭. 큰 vault 에서도 가벼움.
- 7 신규 unit test (suggest 5 + actionable error 2).
- **`SERVER_INSTRUCTIONS` (initialize 응답) 갱신.** AI agent 가 첫 message 에 보는 system-prompt 수준 안내. stale 항목 (14 tool 표기, R16/R17 누락, find_path edges[via] 미언급) 보정. 추가 섹션:
  - **Tool inventory** — 16 tools = read 10 (analyze_repo_structure / infer_imports 포함) + write 6.
  - **Two starting workflows** — A) 기존 vault 오리엔트, B) 빈 vault 부트스트랩 (R16 analyze → R17 infer → review → add_*).
  - **find_path edges[via] 명시** — agent 가 *왜* 두 노드가 연결됐는지 한 호출에 안다.
  - **"When a tool throws — read the error suffix"** — actionable 에러 메시지가 다음 tool 을 직접 가리킨다는 사실을 안내.
- 헤더 코멘트 (도구 14종 → 16종) 동기화.

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
