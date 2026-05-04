# Changelog — oh-my-ontology-mcp

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
