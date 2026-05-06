# Changelog — oh-my-ontology (CLI)

## 0.5.0 — 2026-05-06 (R17 — import graph → depends_on)

### Added — `infer-imports` command (13th, mcp v0.9.0 spawn wrapper)

- `oh-my-ontology infer-imports [rootPath]` — TS/JS import graph → file-level edges + module-level depends_on candidates. `--max-files N` / `--json`.
- side effect 0 — vault NOT modified. moduleEdges 가 사용자 / AI agent 의 *명시 add_relation depends_on* 후보.
- 본인 codebase 의 *진짜 의존 관계* 자동 추출. analyze (heuristic) 의 강력한 짝 — 둘 다 *기가막히게* 의 base.

## 0.4.0 — 2026-05-06 (R16 — autonomous ingest base)

### Added — `analyze` command (12th, mcp v0.8.0 spawn wrapper)

- `oh-my-ontology analyze [rootPath]` — code repo (default cwd) walk, propose ontology node candidates. **side effect 0** — vault NOT modified. Detects FSD vs generic layout, package.json name → project, README H2 → domains.
- `--json` / `--max-depth N` flags.
- 사용자가 결과 검토 후 `oh-my-ontology add` 또는 AI agent `add_concept` 으로 명시 진입.

## 0.3.0 — 2026-05-06 (R15 follow-up — graph-level commands)

### Added — 5 graph-level commands (Concern 4 fix)

post-publish architectural audit 발견 — CLI 6 vs MCP 14 ergonomic asymmetry. 개발자가 *위험한-그러나-필수* 작업 (rename / merge / delete) 을 *AI agent 통해서만* 할 수 있어 mission *"developer + AI agent grow together"* inversion. 이 PR 이 fix.

- **`backlinks <slug>`** — find every node referencing the target. wraps MCP `find_backlinks`. `--json` for raw output.
- **`query "<filter>"`** — typed filter DSL. wraps MCP `query_concepts`. `kind=X AND has(Y) AND NOT domain=Z`, parens / OR / NOT.
- **`rename <oldSlug> <newSlug>`** — atomic rename. wraps MCP `rename_concept`. dry-run by default, `--confirm` to apply.
- **`merge <fromSlug> <intoSlug>`** — atomic merge. wraps MCP `merge_concepts`. dry-run by default, `--confirm` to apply.
- **`delete <slug>`** — permanent delete. wraps MCP `delete_concept`. dry-run by default, `--confirm` to apply, `--force` to ignore backlinks.

### Implementation — `cli/src/lib/mcp-call.mjs` (single source of truth via spawn)

새 명령들은 MCP server child_process spawn + JSON-RPC 로 호출. mcp 가 *진실원*, cli 는 thin wrapper. drift surface 0 (logic 복제 안 함). spawn overhead ~50-100ms per call — 한 번씩 호출이라 acceptable.

- mcp entry resolution: `OMOT_MCP_PATH` env → `require.resolve('oh-my-ontology-mcp/src/index.js')` → monorepo dev fallback (`../../../mcp/src/index.js`)
- cli/package.json 에 `oh-my-ontology-mcp ^0.7.1` dependency 명시 — `npm install` 시 mcp 자동 설치

### Tests

cli integration 24 → **32** (+8 new):
- backlinks (color + JSON)
- query (DSL filter)
- rename (dry-run + confirm + backlink redirect 검증)
- delete (backlinks 가드 + force)
- merge (dry-run preview)

## Unreleased — 2026-05-06 (R15)

### Changed — `init` 의 mcp 등록 마찰 1 step 제거

- `init` 이 `.mcp.json.example` 대신 **`.mcp.json` 자체를 직접 생성**. 사용자가 vault 폴더를 AI agent (Claude Code, Cursor) 에서 열면 *cp 단계 없이* 14 tools 즉시 등록.
- 기존 `.mcp.json` 있으면 보존 + `.mcp.json.example` 별도 작성 (수동 merge 가능).
- `OMOT_VAULT` 환경변수가 absolute path → **relative `.`** 로 변경. vault 폴더 어디로 옮겨도 그대로 작동 (portability).
- Next steps step 4 안내 — *"Copy .mcp.json.example to your agent's MCP config"* → *"Open this folder in an AI agent — `.mcp.json` already wired"*.

## 0.2.0 — 2026-05-04 (R12)

### Added — 4 new commands (developer-primary daily entry points)

- **`list [vault]`** — list ontology nodes (color table). `--kind X` filter, `--json` machine-readable.
- **`validate [vault]`** — frontmatter integrity check, 5 issue codes (unclosed-frontmatter / empty-kind / missing-kind / unknown-kind / parse-zero-keys). `exit 1` on errors — usable as a CI gate.
- **`add <kind> <slug> --title="..." [--domain X] [--body "..."] [--vault path]`** — scaffold a new ontology node. `kind` enum (project / domain / capability / element / document). Throws on duplicate slug. `mcp add_concept` 과 같은 contract.
- **`find <query> [vault] [--kind X] [--json]`** — search slug + title (case-insensitive). Yellow highlight on the matching span. Empty match = `exit 0` (정상).

### Internals

- `cli/src/lib/parse-frontmatter.mjs` — copy of `mcp/src/parser.mjs` (read + serialize). cli 가 별도 npm package 라 cross-import 불가능 → contract test 로 drift 차단:
  - `tests/contract/parse-frontmatter.contract.test.ts` 4-way (src/shared · mcp · scripts/lib · cli)
  - `tests/contract/validate-vault-document.contract.test.ts` 3-way (src/shared · mcp · cli)
- `cli/src/lib/walk-vault.mjs` — fs walk + slug 변환.
- `cli/src/lib/validate.mjs` — vault frontmatter validator.
- `cli/src/lib/write-vault.mjs` — `slugToPath` (vault root sandbox) + `writeDoc`.
- `cli/src/integration.test.mjs` — 11 spawn-based integration cases (영구 회귀 가드).

### Onboarding flow

`init` 의 next-steps 갱신 (R12 #36):
1. Explore — cd + `list` + `validate`
2. Add first node — `add capability ... --title=...` + `find token`
3. Edit project.md
4. Wire AI agent (`.mcp.json.example`, 14 tools 명시)
5. See graph (web UI)

### Tarball

- `files` 에 `CHANGELOG.md` 추가.

## 0.1.0 — initial

- `init [folder]` — scaffold vault (project / domain / capability / element starter .md + `.mcp.json.example`).
