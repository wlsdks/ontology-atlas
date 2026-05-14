# Changelog — oh-my-ontology (CLI)

## 0.10.0 — 2026-05-14

### Added — `similar` 명령 (24th, query_ontology similar_nodes wrap)

- `oh-my-ontology similar "<title>" [vault] [--slug X] [--kind K] [--limit N] [--json]` — vault 에서 비슷한 노드 찾기. MCP `query_ontology({operation: 'similar_nodes'})` thin wrapper.
- 두 입력 모드: 자연어 title 또는 `--slug` (둘 다도 가능 — slug-similarity + title-similarity 둘 다 계산).
- 출력: score (red ≥ 0.5 / yellow 0.25-0.5 / dim < 0.25) + signal breakdown (slug / title / kind / domain / neighbors 어디서 매치) + shared neighbors + 행동 가이드 한 줄 (top score 별 patch vs add 권장).
- `/ontology-extract` skill 의 핵심 cross-check (duplicate 회피) 가 CLI 에서도 1 줄. dev 가 "내 머리 속 개념이 vault 에 이미 있나" 즉시 확인.
- 신규 integration test 3건 (title 매치 / --json / usage).

## 0.9.0 — 2026-05-14

### Added — `node` 명령 (23rd, query_ontology node_profile wrap)

- `oh-my-ontology node <slug> [vault] [--json]` — 한 노드 전체 deep dive. MCP `query_ontology({operation: 'node_profile'})` thin wrapper.
- 출력: header (kind · title · slug · domain · degree · aliases) + LINEAGE chain (project → domain → ... → 이 노드) + INCOMING/OUTGOING edges (relation 별 그룹, peer 노드 title 동봉, external 마크).
- 기존 `backlinks` 가 incoming 만, `path` 가 두 노드 사이만 보여줬다면 `node` 는 *한 노드 둘레의 전부* — dev 가 모르는 노드 만났을 때 첫 호출.
- 신규 integration test 3건 (counts / --json / slug 누락 usage).

## 0.8.0 — 2026-05-14

### Added — 5 graph commands (18–22, query_ontology operations)

mission v3 의 *dev primary surface* (CLI) 와 *AI agent primary surface* (MCP) 의 권한 격차 추가 축소. `overview` (0.7.0) 에 이어 `query_ontology` 의 5 operation 직접 노출.

- `oh-my-ontology hubs [vault] [--limit N]` — centrality 4 rankings (PageRank / Bridges / Authorities / Hubs)
- `oh-my-ontology blast-radius <slug> [--depth N] [--direction incoming|outgoing|both]` — 이 노드 변경 시 영향받는 노드/관계 (refactor safety). risk low/medium/high + byKind/byDomain breakdown
- `oh-my-ontology cycles [vault] [--max-hops N]` — depends_on dependency cycle 검출. 0 cycle 시 그린 "graph clean ✓", 그 외 cycle 별 슬러그 chain 출력
- `oh-my-ontology health [vault]` — 5 graph 무결성 check (compile / unresolved / cycles / relation recommendations / components). exit 0 만 healthy
- `oh-my-ontology workspace-brief [vault]` — status + hotspots top 5 + project 별 노드 수 + next actions 한 화면

전부 `--json` 옵션으로 raw query_ontology 응답 pass-through.

## 0.7.0 — 2026-05-14

### Added — `overview` command (17th, query_ontology wrap)

- `oh-my-ontology overview [vault] [--limit N] [--json]` — vault first-contact dashboard. MCP `query_ontology({operation: 'overview'})` thin wrapper.
- 출력 4 섹션: header 한 줄 (총 노드/관계 카운트 + resolved/external/unresolved 분해), **KIND 분포** (kind 별 count + 색깔 막대 그래프), **관계 종류 분포** (frontmatter key 별 비율), **도메인 분포** (도메인 별 노드 수), **허브 노드 top N** (degree 상위, document/project 제외).
- 신규 사용자가 모르는 vault 를 처음 열었을 때 — `oh-my-ontology overview` 한 줄로 *어떤 vault 인지* 즉시 파악. AI agent 의 MCP overview 호출과 같은 권한.
- 옵션: `--limit N` (허브 N 개, 기본 10), `--json` (raw query_ontology 응답 pass-through), `--vault path` (auto-detect override).
- 신규 integration test 3건 (counts / --json / --limit).

## 0.6.0 — 2026-05-14

### Fixed — graph-level 명령 vault 자동 감지

- `list / query / path / orphans / backlinks / find / validate` 가 vault 인자 미지정 시 cwd 전체를 walk 하던 paper cut 정정. self-dogfood (이 repo 안에서 CLI 사용) 시 `public/docs-vault/` (build 미러) 와 `cli/templates/vault/` 까지 잡혀 노드 수가 2 배로 보임.
- 신규 `cli/src/lib/resolve-vault.mjs` — 우선순위: 1) 명시 인자 → 2) `OMOT_VAULT` env → 3) cwd 의 `docs/ontology/` 자동 감지 → 4) cwd fallback. MCP 서버 `OMOT_VAULT` 규약과 동일.
- 신규 단위 테스트 6 (`resolve-vault.test.mjs`) — explicit 우선 / env / 자동 감지 / cwd fallback / 빈 문자열 default / macOS realpath symlink.
- add / import / init 등 *생성* 명령은 그대로 (명시 destination 필요).

### Added — `path` command (16th, mcp find_path wrapper) — 회귀 fix

- `oh-my-ontology path <from> <to> [vault]` — 두 slug 사이 최단 경로 (BFS, 무방향). MCP `find_path` thin wrapper.
- 각 hop 사이에 `via` (frontmatter 키 = relation type) 를 ↓ 화살표와 함께 한 줄로 표시 — `capabilities` / `elements` / `dependencies` / `relates` / `contains` / `describes`. AI agent 가 path 를 받아 *왜* A 와 B 가 연결됐는지 한 호출에 본다.
- 옵션: `--max-hops N` (기본 5), `--json` (raw 응답).
- trivial path (`from === to`) 는 0 hops 안내. 누락 인자 시 usage + exit 1.
- 신규 integration test 4건.
- *회귀 fix*: 과거 PR #177 가 머지 안 되고 닫혀 main 에 누락됐던 명령. find_path edges[] (PR #175) 의 CLI 노출 다시 도입.

### Added — `orphans` command (15th, mcp find_orphans wrapper)

- `oh-my-ontology orphans [vault]` — vault 의 *고립 노드* (어디서도 frontmatter 로 reference 안 받는 doc) 한 줄 명령. mcp `find_orphans` thin spawn wrapper.
- 옵션: `--kind X` (filter), `--exclude-kinds A,B` (skip; default `vault-readme`), `--vault path`, `--json`.
- 0 orphan 이면 "vault clean ✓" 그린 메시지 → CI gate-friendly.
- 신규 integration test 3건 (default / --json / --kind 필터).
- graph-level 명령 set 에 `find_orphans` 만 빠져 있던 일관성 회복.

### Changed — `validate` 출력 grouped summary

- 같은 issue code 가 2+ file 에서 등장하면 per-file 출력 끝에 *grouped by code* 요약 섹션 자동 부착. `<severity> <code> — <count> occurrences\n     file1, file2, file3 (+N more)` 형식으로 *어느 종류 경고가 얼마나 많은지* 한눈에. error 우선, count 내림차순.
- 1 회짜리 code 는 per-file 출력만으로 충분 — grouped 섹션에 노출 안 함 (노이즈 회피).
- per-file detail / exit code 는 변동 없음 (CI 회귀 0).
- 신규 integration test 2건 (3 capability missing-domain → grouped 등장 / 단일 empty-kind → grouped 안 뜸).

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
