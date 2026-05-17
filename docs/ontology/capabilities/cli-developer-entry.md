---
slug: capabilities/cli-developer-entry
kind: capability
title: CLI Developer Entry (26 commands — vault + MCP verify + graph deep dive)
domain: onboarding-ux
elements: [cli/src/commands/add.mjs, cli/src/commands/analyze.mjs, cli/src/commands/backlinks.mjs, cli/src/commands/blast-radius.mjs, cli/src/commands/bootstrap.mjs, cli/src/commands/compile.mjs, cli/src/commands/cycles.mjs, cli/src/commands/delete.mjs, cli/src/commands/find.mjs, cli/src/commands/health.mjs, cli/src/commands/hubs.mjs, cli/src/commands/import.mjs, cli/src/commands/infer-imports.mjs, cli/src/commands/list.mjs, cli/src/commands/mcp-verify.mjs, cli/src/commands/merge.mjs, cli/src/commands/node-profile.mjs, cli/src/commands/orphans.mjs, cli/src/commands/overview.mjs, cli/src/commands/path.mjs, cli/src/commands/query.mjs, cli/src/commands/rename.mjs, cli/src/commands/similar.mjs, cli/src/commands/validate.mjs, cli/src/commands/workspace-brief.mjs, cli/src/index.mjs, cli/src/lib/cli-args.mjs, cli/src/lib/cli-commands.mjs, cli/src/lib/mcp-call.mjs, cli/src/lib/mcp-metadata.mjs, cli/src/lib/query-result-contract.mjs, cli/src/lib/resolve-vault.mjs, scripts/check-package-contracts.mjs, scripts/check-package-contracts.test.mjs, scripts/lib/test-name-pattern.mjs, scripts/lib/test-name-pattern.test.mjs, scripts/smoke-clean-onboarding.mjs, scripts/smoke-packed-cli.mjs]
relates: [capabilities/mcp-server, capabilities/vault-validator, domains/onboarding-ux]
---

# CLI Developer Entry

R12 (2026-05-04) 에 도입된 *developer-primary* 진입점. R14 에서 `import`, R15 follow-up 에서 graph-level 5 명령, R16-R17 에서 `analyze` / `infer-imports`, R+ cycle 에서 `path` / `orphans` + 두 `--apply` 플래그 + `bootstrap` 합본 명령, `compile`, 그리고 설치된 MCP surface 를 확인하는 `mcp-verify` 명령 추가 — **총 26 명령**. 사용자가 vault 만든 후 *터미널 즉시* ontology 작업 가능 — 웹 UI / MCP 등록 불필요.

## Local commands (R12 + R14 — vault scaffold + frontmatter)

| Command | What it does |
|---|---|
| `oh-my-ontology init [folder]` | Scaffold vault (5 starter .md + `.mcp.json` cwd + vault). Source checkout 에서는 npm 404 없이 바로 붙도록 local `mcp/src/index.js` 를 가리킴. Codex 는 project `.mcp.json` 을 자동으로 읽지 않으므로 exact `codex mcp add ...` 명령도 출력. repo root 기준 copy-paste bootstrap 명령 (`analyze . --vault ./ontology`, `bootstrap . --vault ./ontology`) 도 함께 출력. MCP tool count / read-write split 안내는 `oh-my-ontology-mcp/package.json` metadata 를 읽고, source checkout 에서는 monorepo `mcp/package.json` 으로 fallback 해서 stale hardcode 를 피한다. unknown flag / 초과 positional 은 파일 쓰기 전에 거부하고 `init --help` 는 폴더를 만들지 않고 usage 만 출력한다. |
| `oh-my-ontology list [vault]` | List ontology nodes (color table, `--kind X` filter, `--json`). `--kind` 값을 vault 로 오해하지 않도록 flag/value parsing 을 분리하고 빈 `--vault` / 중복 vault 입력을 거부한다. |
| `oh-my-ontology validate [vault]` | Frontmatter integrity + graph array drift check (CI gate via exit 1, R+ grouped-by-code 요약). `--fail-on` 값을 vault 로 오해하지 않도록 flag/value parsing 을 분리하고 빈 `--vault` / 중복 vault 입력을 거부한다. |
| `oh-my-ontology mcp-verify [vault]` | Installed MCP verify wrapper — parser smoke, server boot, 23-tool inventory, strict schema/runtime unknown-argument and invalid-enum rejection, `add_concepts` / `add_relations` row-isolation runtime smoke, write-tool `postWriteMaintenance` `score` / executable `proposedAction` / current-page next-action guidance, ready `maintenance_plan` cursor + missing `maintenance_plan.afterActionId` cursor smoke, maintenance bucket / current-page next-action summaries, `list_concepts`, project-node `list_concepts` probe, `get_concept`, `get_concepts`, `find_evidence`, `find_backlinks`, `query_concepts`, limited `query_concepts`, `analyze_repo_structure`, `infer_imports`, `find_neighbors`, `find_path`, `find_orphans`, `list_kinds`, `validate_vault`, `workspace_brief`, tuned `workspace_brief`, `health`, tuned `health`, `compile_ontology`, `overview`, `overview`/`project_map` query_plan, 실제 `neighbors` / node→project `path` / `project_scope` graph smoke 를 resolved vault 에서 실행. ready cursor smoke 는 `cursor.found=true`, `cursor.reason=null`, `startIndex=0`, `remainingActions`, `nextAfterActionId`/`hasMore` page-state alignment, next-action pointer shape 와 첫 executable/review page action alignment 를 확인하고, 성공 출력은 bucket 요약과 current-page executable/review next-action 요약까지 함께 보여준다. ready cursor 에 action 이 있으면 첫 action id 로 유효한 `afterActionId` resume 요청을 추가로 보내고, resumed page 가 그 cursor action 을 반복하거나 `remainingActions` 를 전진시키지 못하면 실패한다. missing cursor smoke 는 `cursor.found=false`, cursor miss reason, empty page, `nextAfterActionId=null`, `hasMore=false` 를 확인한다. project probe 로 project 노드가 첫 `list_concepts` sample 밖에 있어도 `project_scope` hard gate 를 놓치지 않는다. `get_concept` 는 `list_concepts` 로 발견한 실제 slug 하나의 single-node detail 계약을 확인하고, `get_concepts` 는 실제 slug 와 missing slug 를 섞어 batch success / partial row 계약을 확인한다. `find_evidence` / `find_backlinks` / `query_concepts` 와 별도 limited `query_concepts`, `analyze_repo_structure`, `infer_imports`, direct `find_neighbors` / `find_path` / `find_orphans` smoke 는 live vault / repo 결과로 search / backlink / typed-filter / `slug!=project, limit=1` semantics / bootstrap-candidate / import-graph / local-neighborhood / shortest-path / orphan-cleanup row shape 와 `structuredContent` drift 를 잡는다. row-isolation smoke 는 batch writer 에 non-object row 와 unknown row field 를 넣어 top-level tool error 가 아니라 row-level `ok:false` 로 격리되는지 확인하고, invalid-only smoke 에 `postWriteMaintenance` 가 없는지도 확인한다. `project_map` query_plan 은 widened `targetOperation` enum 이 설치 경로에서도 실제 동작함을 확인한다. project-less vault 는 containment-specific `project_scope` 만 skip 하고, empty vault 는 node-targeted graph smoke 를 skip 하되 boot / inventory / validation / diagnosis / compile / overview / query planning 은 계속 hard gate 로 검증한다. `validate_vault.scanned` 는 file-level health 로 두고, `list_kinds.total/byKind` 는 `list_concepts` / `compile_ontology` / `overview` node census 와 교차 확인한다. `--help` / `-h` 는 같은 graph-query smoke contract 와 strict argument/enum smoke, batch writer row-isolation smoke, write-tool post-write guidance, `maintenance_plan.phases` / `maintenance_plan.severities` / `maintenance_plan.kinds` enum filter, ready cursor 의 `cursor.found=true` / `cursor.reason=null` / next-action pointer alignment 와 missing cursor 의 `cursor.found=false` / `cursor.reason` / zero remaining actions 계약, 성공 maintenance cursor line 의 bucket / current-page next-action summary 출력까지 stdout usage 로 설명해 잘못된 flag 경로에서도 검증 범위가 숨지 않게 한다. fail severity nextAction 은 차단하고 warn/info nextAction 은 advisory 로 출력해 fresh starter vault 도 wiring 확인 후 cleanup 할 수 있게 한다. `--timeout-ms N` 으로 큰/느린 vault wait 조절. |
| `oh-my-ontology add <kind> <slug> --title="..."` | Scaffold new node (duplicate throw, `--domain --body --vault`, R15 `--auto-prefix` default on, `--raw-slug` opt-out). `slug` / `--title` / `--domain` 은 leading/trailing whitespace 없는 non-empty string 이어야 하며, 잘못된 scalar input 은 디스크 쓰기 전에 거부한다. `--body` 생략 시에만 기본 본문을 만들고 `--body=` 는 명시적 빈 본문으로 보존한다. 값 필요한 flag 의 누락 / 다음 flag 포획 / 초과 positional 을 디스크 쓰기 전에 거부한다. |
| `oh-my-ontology find <query> [vault]` | Search slug + title with yellow highlight (`--kind --json`). positional vault 와 `--vault` 중복 / 빈 `--vault` / 초과 positional 을 scan 전에 거부한다. |
| `oh-my-ontology import <path...>` | **R14** Import external `.md` (frontmatter normalize + `--auto-prefix` / `--rename` / `--dry-run`). `--vault` / `--kind` 값 누락을 디스크 쓰기 전에 거부한다. |

## Repo analysis commands (R16-R17 + R+ — codebase → ontology)

| Command | What it does |
|---|---|
| `oh-my-ontology bootstrap [rootPath]` | **R+** 1줄 full bootstrap 적용 명령. analyze --apply (노드 + suggested relations) + infer-imports --apply (depends_on edges) 합본. fresh `init` vault 에서는 untouched starter 예시를 실제 후보 land 직전에 prune, 사용자가 편집한 starter 는 보존. 단일 파일 feature 구조처럼 analyze 가 capability 후보를 못 만든 경우에도 import graph endpoint 를 먼저 생성하고 project→domain→capability containment 로 붙인 뒤 depends_on 을 land 한다. R+ follow-up: `src/features/*.js` 는 capability 로 유지하되 `src/domain`, `src/storage`, `src/integrations`, `src/reports`, `src/shared`, `src/app` 같은 support layer 파일은 element 로 land 해서 `capabilities/domain` 같은 폴더명 잡음 노드를 만들지 않는다. `--threshold N` (약한 import 차단), `--skip-imports` (1단계만), `--json`. 빈 `--vault`, 2개 이상 root positional, 잘못된 numeric option 을 MCP 호출 전에 거부한다. agent-less 흐름의 가장 짧은 path. |
| `oh-my-ontology analyze [rootPath]` | **R16** Walk `package.json` / `README.md` H2 / `src/` → ontology 노드 후보. side effect 0 (default). 후보 slug 는 starter/CLI add 와 같은 `domains/*`, `capabilities/*`, `elements/src/...` shape. **R+ `--apply`**: 후보를 `add_concepts` + `add_relations` 배치로 land 하며 untouched starter 예시를 prune. 빈 `--vault`, 2개 이상 root positional, 잘못된 `--max-depth` 값을 MCP 호출 전에 거부한다. |
| `oh-my-ontology infer-imports [rootPath]` | **R17** TS/JS import graph → moduleEdges. side effect 0 (default). moduleEdges 역시 folder-prefixed slug 로 analyze 후보와 바로 매치. Single-file layered repo 에서는 `features/*` 만 capability 로 접고 support layer 파일은 `elements/src/...` 로 보존한다. **R+ `--apply`**: moduleEdges 를 `depends_on` 관계로 batch land (50-row chunk). **R+ `--threshold N`**: count < N 약한 edge 필터. 빈 `--vault`, 2개 이상 root positional, 잘못된 `--max-files` / `--threshold` 값을 MCP 호출 전에 거부한다. |
| `oh-my-ontology compile [vault]` | **R+** MCP `compile_ontology` wrapper. deterministic graphHash / node-edge counts / unresolved issue counts 를 터미널에서 확인하고, compiler issue 또는 unresolved edge 가 있으면 `--json` 과 일반 출력 모두 exit 1 로 반환해 agent-less 검증에서 깨진 graph state 를 놓치지 않는다. `--fix` 로 compiler 의 `canonicalizationActions` 를 `patch_concept` 경로로 적용해 relation 배열을 trim/dedupe/sort 한다. `--help` / `-h` 는 MCP 호출 없이 stdout usage 와 exit 0 으로 끝나 스크립트와 agent 가 compile 도움말 조회를 실패로 오인하지 않는다. `--nodes-limit` / `--edges-limit` 는 1 이상 양수만 허용하고 offset 만 0 이상을 허용해 page cursor 가 항상 전진하게 한다. `--vault` 와 positional vault 를 동시에 받지 않고 빈 `--vault` 도 거부해 재정렬 대상 vault 를 모호하게 선택하지 않는다. bootstrap 이후 ontology 구축 결과를 재정렬하는 agent-less path. |

## Graph-level commands (R15 follow-up — Concern 4 fix + R+ extras)

post-publish architectural audit 발견 — *위험한-그러나-필수* 작업 (rename/merge/delete) 이 MCP-only 라 mission inversion. 5 명령 추가로 동등. R+ cycle 에서 path / orphans 추가.

| Command | What it does |
|---|---|
| `oh-my-ontology backlinks <slug>` | MCP `find_backlinks` — every node referencing the target. positional vault 와 `--vault` 중복 / 빈 `--vault` / 초과 positional 을 MCP 호출 전에 거부한다. |
| `oh-my-ontology query "<filter>"` | MCP `query_concepts` — typed filter DSL (kind/domain/has/AND/OR/NOT/parens). positional vault 와 `--vault` 중복 / 빈 `--vault` / 초과 positional 을 MCP 호출 전에 거부한다. |
| `oh-my-ontology compile [vault]` | MCP `compile_ontology` — deterministic compile artifact + optional `--fix` canonicalization apply |
| `oh-my-ontology rename <old> <new>` | MCP `rename_concept` — atomic, dry-run default, `--confirm` to apply. existing target 은 기본 거부하고 `--overwrite` 로만 대체한다. positional vault 와 `--vault` 중복 / 빈 `--vault` / 초과 positional 을 MCP 호출 전에 거부한다. |
| `oh-my-ontology merge <from> <into>` | MCP `merge_concepts` — atomic redirect + delete from, dry-run default. positional vault 와 `--vault` 중복 / 빈 `--vault` / 초과 positional 을 MCP 호출 전에 거부한다. |
| `oh-my-ontology delete <slug>` | MCP `delete_concept` — refuses if backlinks remain (`--force` overrides). positional vault 와 `--vault` 중복 / 빈 `--vault` / 초과 positional 을 MCP 호출 전에 거부한다. |
| `oh-my-ontology path <from> <to>` | **R+** MCP `find_path` — BFS 최단 경로, `edges[via]` 로 *왜* 연결됐는지 표시. `found:false` 는 `--json` 과 일반 출력 모두 exit 1 로 반환해 shell script / agent verification 에서 기대 relation 부재를 조용히 통과시키지 않는다. positional vault 와 `--vault` 중복 / 빈 `--vault` / 초과 positional 을 MCP 호출 전에 거부한다. |
| `oh-my-ontology orphans` | **R+** MCP `find_orphans` — 어디서도 link 안 받는 고립 노드 (kind 필터, project/vault-readme 루트 문서는 기본 cleanup 후보에서 제외). positional vault 와 `--vault` 중복 / 빈 `--vault` / 초과 positional 을 MCP 호출 전에 거부한다. |
| `oh-my-ontology workspace-brief` | MCP `query_ontology(workspace_brief)` — first-contact dashboard. warn/advisory nextAction 은 안내만 하고, fail severity nextAction 또는 failing health check 는 exit 1 로 반환해 shell script 가 깨진 graph state 를 놓치지 않게 한다. top-level diagnosis `status` 는 `healthy` / `needs_attention` 만 허용해 이상한 status 문자열을 clean vault 로 오인하지 않는다. |
| `oh-my-ontology cycles` | MCP `query_ontology(cycles)` — dependency cycle 검출. `--json` 과 일반 출력 모두 cycle 이 1개 이상이면 exit 1 로 반환해 shell script / agent verification 에서 순환 의존을 조용히 통과시키지 않는다. |

## 구현 단일 진실원

local commands 는 *cli 안* 구현 (4-way parser/3-way validator contract). graph-level + analyze/infer-imports + bootstrap + `--apply` 흐름은 *MCP server child_process spawn + JSON-RPC* — `cli/src/lib/mcp-call.mjs` 의 thin wrapper. drift surface 0 (logic 복제 안 함). spawn ~50-100ms per call — bootstrap 은 3-4 회 호출이라 ~200-400ms 정도. `OMOT_MCP_PATH` explicit override 는 존재하지 않거나 파일이 아니면 fallback 없이 exit 2 로 실패해 잘못된 MCP entry 설정을 Node stack trace 나 조용한 monorepo fallback 으로 숨기지 않는다.

cli 가 별도 npm package — `oh-my-ontology` binary. cli/package.json 의 `dependencies: oh-my-ontology-mcp` 가 graph-level + apply + bootstrap 흐름 자동 활성. `cli/src/lib/cli-commands.mjs` 는 CLI command inventory / module runner registry / package description 의 command count 를 한 곳에서 노출하고 `cli/src/index.mjs` 의 runtime dispatch 도 같은 registry 로 실행해 command 추가 시 help / dispatcher / package metadata drift 를 줄인다. 모든 subcommand `--help` / `-h` 는 런타임 MCP 호출이나 vault scan 없이 stdout usage 와 exit 0 으로 끝나 agent 가 도움말 조회를 실패나 쓰기 작업으로 오인하지 않는다. `cli/src/lib/mcp-metadata.mjs` 는 MCP package description 의 tool count / read-write split 을 한 번만 parse 해서 production `init` copy 와 source / packed smoke 의 기대값이 같은 해석을 공유하게 한다. `cli/src/lib/resolve-vault.mjs` 는 explicit vault 와 `OMOT_VAULT` 가 존재하는 디렉터리인지 확인하고, 잘못된 경로는 local/frontmatter 명령의 false clean 이나 MCP child-process error 로 흘리지 않고 exit 2 로 실패한다. `cli/src/lib/cli-args.mjs` 는 `--vault` 값 검증과 positional/flag vault 중복 거부, required flag value 검증, 단일 root positional 검증, positive / bounded-positive / non-negative integer flag 검증을 공유해 local/frontmatter/compile/mcp-verify/graph-write/graph-read/repo-analysis 명령의 argument contract 를 맞춘다. `infer-imports` / `bootstrap` 의 `--max-files` 는 MCP child process 를 띄우기 전에 CLI 에서도 max 50000 hard stop 으로 실패한다. `cli/src/lib/query-result-contract.mjs` 는 `compile` issue/unresolved edge, `cycles` total cycle, `path` found:false 와 hop/edge alignment, `health` / `workspace-brief` top-level diagnosis status, `workspace-brief` fail nextAction/health check 의 exit-code 판정을 한 곳에서 고정해 graph hard gate 가 명령별로 갈라지지 않게 한다. malformed `compile` / `cycles` / `path` / `health` / `workspace-brief` payload 도 clean vault 로 오인하지 않고 fail-closed 로 처리한다. graph diagnostic 명령의 `--limit` / `--max-hops` / `--depth` / `--direction` 도 잘못된 값을 조용히 기본값으로 바꾸지 않고 MCP 호출 전에 실패한다.

## 회귀 차단

cli/src/integration.test.mjs — spawn-based integration suite. 매 PR 마다 command inventory 와 package command count metadata, 모든 subcommand `--help` 의 clean exit/stdout usage 계약, help 출력의 setup contract, init MCP config + copy-paste bootstrap 명령, init flag/positional misuse 거부, MCP tool count metadata 기반 출력, local/frontmatter 명령의 vault/value argument 거부, `mcp-verify --help` 의 graph-query smoke contract 와 strict argument/enum smoke, maintenance filter enum / ready cursor / missing cursor 계약 표기, `add` 의 body omission/empty-body 계약과 slug/title/domain clean string 거부, compile `--fix` canonicalization 경로와 vault 인자 ambiguity 거부, compile unresolved reference non-zero exit, graph path found:false non-zero exit, graph-level 명령의 dry-run/confirm 경로와 write-command/read-command vault ambiguity 및 diagnostic option 값 거부, repo-analysis 명령의 vault/root/numeric argument 거부, backlink redirect, analyze/infer-imports/bootstrap apply 경로, fresh init starter prune/preserve/replace 경로, single-file layered repo 의 bootstrap endpoint 자동 생성 경로, `health --json` / `cycles --json` 의 unhealthy graph non-zero exit 계약을 검증. `pnpm integration:cli` 로 실행하고, `OMOT_TEST_NAME_PATTERN` 또는 Node `--test-name-pattern` 으로 spawn-heavy integration 중 수정 파트만 골라 실행할 수 있다. root shortcut `pnpm integration:cli:mcp-verify` 는 설치 검증 경로에 해당하는 `mcp-verify` subset 만 실행한다.

src/features/docs-vault-local/lib/ontology-starter.test.ts — web workbench starter 의 5개
파일이 `cli/templates/vault/` 와 byte-for-byte 동일한지 검증. starter README 안에
Claude Code/Cursor `.mcp.json` 경로와 Codex `codex mcp add ...` 경로가 모두 남아있는지도
확인해 CLI/Web onboarding drift 를 차단한다.

scripts/smoke-clean-onboarding.mjs — fresh user smoke. 임시 `HOME` / `CODEX_HOME` 과 새 프로젝트를 만들고 `init → bootstrap → validate` 부터 Claude project `.mcp.json` health, Codex `mcp add` 등록까지 clean-room 으로 검증.

scripts/smoke-packed-cli.mjs — packed install smoke. local MCP + CLI tarball 을 임시
프로젝트에 설치한 뒤 `init`, installed `mcp-verify`, MCP package `npm run verify`,
installed `mcp-verify --help`, invalid installed `OMOT_MCP_PATH` / vault root failures, `compile --summary`, blocking `workspace-brief --json`,
`cycles --json`, `compile --json`, `path --json` exit 를 실행하고 installed verify 의
health check count 출력과 `overview`/`project_map` query_plan / `neighbors` / `path` /
`project_scope` smoke 출력, project-less vault 의 `project_scope` skip, empty vault 의
node-targeted graph smoke skip, single and multi unknown-argument runtime rejection,
typoed `maintenance_plan.phases` / `maintenance_plan.severities` /
`maintenance_plan.kinds` runtime rejection, ready `maintenance_plan` cursor + missing `maintenance_plan.afterActionId` cursor smoke,
action-present `maintenance_plan` fixture 의 installed CLI wrapper / direct MCP package resume 검증,
installed help 의 strict argument/enum smoke 와 maintenance work-queue filter/cursor 계약,
batch writer row-isolation smoke, bucket / current-page next-action summary 설명을 확인해 source checkout 에서는 안 보이는 bin/package/files drift 를
잡는다. 통과 시 MCP/CLI tarball 의 파일 수와 압축/해제 크기 요약도 출력해 release
검토자가 publish 전 패키징 비대를 즉시 볼 수 있게 한다.

scripts/check-package-contracts.mjs — publish 전 package manifest gate. `mcp/` 와
`cli/` 의 bin / main / publish-runtime npm scripts 에서 도달 가능한 local import와
실행 파일이 `package.json#files` 에 포함되는지 검사한다. MCP package 의 `npm test` 는
tarball 에 포함되는 parser smoke 만 실행하고, source checkout 용 전체 suite 는
`test:all` 로 분리해 lean tarball 에서 빠진 test 파일을 참조하지 않게 한다. root
workspace 의 `pnpm test:mcp:package` 는 이 package-script/tarball 계약만 빠르게
재검증한다. 반대로 `files` 항목이 실제 package 파일/디렉토리/glob 과
매치되는지도 확인하고, CLI 의 `oh-my-ontology-mcp` dependency 가 현재 MCP package
version 을 추적하는지 본다. CLI runtime dispatcher 가 command registry 기반 dynamic
import 로 바뀌어도 `runner('*.mjs', 'runX')` registry 항목을 command module reachability
로 추적해 packaged CLI 에서 특정 명령 파일이 빠지는 회귀를 잡는다. source checkout 에서는
통과하지만 npm tarball 에서만 깨지는 release drift 를 차단한다. packed smoke 는
installed `mcp-verify --help` 가 graph-query smoke, direct read smoke set(`get_concept` / `get_concepts` / `find_evidence` / `find_backlinks` / `query_concepts` / limited `query_concepts` / `analyze_repo_structure` / `infer_imports` / `find_neighbors` / `find_path` / `find_orphans`), strict argument/enum smoke, batch writer row-isolation smoke, write-tool post-write guidance, maintenance filter enum, ready cursor / missing cursor 계약과 bucket / current-page next-action summary scope 를
계속 설명하는지도 확인한다. paired self-test 는 누락된
reachable import, 죽은 `files` glob, multiline/dynamic import parsing, command registry
reachability, test script 제외 규칙을 fixture 로 고정한다. CLI README 의
`mcp-verify --help` graph-query smoke / direct read smoke set(`get_concept`, `get_concepts`, `query_concepts`, limited `query_concepts`, `analyze_repo_structure`, `infer_imports`, `find_neighbors`, `find_path` 포함) / strict argument/enum smoke / batch writer row-isolation smoke / write-tool post-write guidance / maintenance filter enum / ready cursor / missing cursor scope 도 문서 계약으로 고정해 release smoke 와
사용자-facing 문서가 갈라지지 않게 한다. root README 의 release gate 섹션도
`smoke:packed-cli` 가 installed `mcp-verify --help` scope 를 검증한다고 명시하고,
package contract test 가 이를 고정한다.
