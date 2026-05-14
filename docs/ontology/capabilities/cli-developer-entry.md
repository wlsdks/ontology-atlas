---
slug: capabilities/cli-developer-entry
kind: capability
title: CLI Developer Entry (24 commands — vault + graph deep dive)
domain: onboarding-ux
elements: [cli/src/commands/add.mjs, cli/src/commands/analyze.mjs, cli/src/commands/backlinks.mjs, cli/src/commands/blast-radius.mjs, cli/src/commands/bootstrap.mjs, cli/src/commands/cycles.mjs, cli/src/commands/delete.mjs, cli/src/commands/find.mjs, cli/src/commands/health.mjs, cli/src/commands/hubs.mjs, cli/src/commands/import.mjs, cli/src/commands/infer-imports.mjs, cli/src/commands/list.mjs, cli/src/commands/merge.mjs, cli/src/commands/node-profile.mjs, cli/src/commands/orphans.mjs, cli/src/commands/overview.mjs, cli/src/commands/path.mjs, cli/src/commands/query.mjs, cli/src/commands/rename.mjs, cli/src/commands/similar.mjs, cli/src/commands/validate.mjs, cli/src/commands/workspace-brief.mjs, cli/src/index.mjs, cli/src/lib/mcp-call.mjs, cli/src/lib/resolve-vault.mjs]
relates: [capabilities/mcp-server, capabilities/vault-validator, domains/onboarding-ux]
---

# CLI Developer Entry

R12 (2026-05-04) 에 도입된 *developer-primary* 진입점. R14 에서 `import`, R15 follow-up 에서 graph-level 5 명령, R16-R17 에서 `analyze` / `infer-imports`, R+ cycle 에서 `path` / `orphans` + 두 `--apply` 플래그 + `bootstrap` 합본 명령 추가 — **총 16 명령**. 사용자가 vault 만든 후 *터미널 즉시* ontology 작업 가능 — 웹 UI / MCP 등록 불필요.

## Local commands (R12 + R14 — vault scaffold + frontmatter)

| Command | What it does |
|---|---|
| `oh-my-ontology init [folder]` | Scaffold vault (5 starter .md + `.mcp.json` cwd + vault). Source checkout 에서는 npm 404 없이 바로 붙도록 local `mcp/src/index.js` 를 가리킴. Codex 는 project `.mcp.json` 을 자동으로 읽지 않으므로 exact `codex mcp add ...` 명령도 출력. repo root 기준 copy-paste bootstrap 명령 (`analyze . --vault ./ontology`, `bootstrap . --vault ./ontology`) 도 함께 출력. |
| `oh-my-ontology list [vault]` | List ontology nodes (color table, `--kind X` filter, `--json`) |
| `oh-my-ontology validate [vault]` | Frontmatter integrity + graph array drift check (CI gate via exit 1, R+ grouped-by-code 요약) |
| `oh-my-ontology add <kind> <slug> --title="..."` | Scaffold new node (duplicate throw, `--domain --body --vault`, R15 `--auto-prefix` default on, `--raw-slug` opt-out) |
| `oh-my-ontology find <query> [vault]` | Search slug + title with yellow highlight (`--kind --json`) |
| `oh-my-ontology import <path...>` | **R14** Import external `.md` (frontmatter normalize + `--auto-prefix` / `--rename` / `--dry-run`) |

## Repo analysis commands (R16-R17 + R+ — codebase → ontology)

| Command | What it does |
|---|---|
| `oh-my-ontology bootstrap [rootPath]` | **R+** 1줄 full bootstrap 적용 명령. analyze --apply (노드 + suggested relations) + infer-imports --apply (depends_on edges) 합본. fresh `init` vault 에서는 untouched starter 예시를 실제 후보 land 직전에 prune, 사용자가 편집한 starter 는 보존. 단일 파일 feature 구조처럼 analyze 가 capability 후보를 못 만든 경우에도 import graph endpoint 를 먼저 생성하고 project→domain→capability containment 로 붙인 뒤 depends_on 을 land 한다. R+ follow-up: `src/features/*.js` 는 capability 로 유지하되 `src/domain`, `src/storage`, `src/integrations`, `src/reports`, `src/shared`, `src/app` 같은 support layer 파일은 element 로 land 해서 `capabilities/domain` 같은 폴더명 잡음 노드를 만들지 않는다. `--threshold N` (약한 import 차단), `--skip-imports` (1단계만), `--json`. agent-less 흐름의 가장 짧은 path. |
| `oh-my-ontology analyze [rootPath]` | **R16** Walk `package.json` / `README.md` H2 / `src/` → ontology 노드 후보. side effect 0 (default). 후보 slug 는 starter/CLI add 와 같은 `domains/*`, `capabilities/*`, `elements/src/...` shape. **R+ `--apply`**: 후보를 `add_concepts` + `add_relations` 배치로 land 하며 untouched starter 예시를 prune. |
| `oh-my-ontology infer-imports [rootPath]` | **R17** TS/JS import graph → moduleEdges. side effect 0 (default). moduleEdges 역시 folder-prefixed slug 로 analyze 후보와 바로 매치. Single-file layered repo 에서는 `features/*` 만 capability 로 접고 support layer 파일은 `elements/src/...` 로 보존한다. **R+ `--apply`**: moduleEdges 를 `depends_on` 관계로 batch land (50-row chunk). **R+ `--threshold N`**: count < N 약한 edge 필터. |

## Graph-level commands (R15 follow-up — Concern 4 fix + R+ extras)

post-publish architectural audit 발견 — *위험한-그러나-필수* 작업 (rename/merge/delete) 이 MCP-only 라 mission inversion. 5 명령 추가로 동등. R+ cycle 에서 path / orphans 추가.

| Command | What it does |
|---|---|
| `oh-my-ontology backlinks <slug>` | MCP `find_backlinks` — every node referencing the target |
| `oh-my-ontology query "<filter>"` | MCP `query_concepts` — typed filter DSL (kind/domain/has/AND/OR/NOT/parens) |
| `oh-my-ontology rename <old> <new>` | MCP `rename_concept` — atomic, dry-run default, `--confirm` to apply |
| `oh-my-ontology merge <from> <into>` | MCP `merge_concepts` — atomic redirect + delete from, dry-run default |
| `oh-my-ontology delete <slug>` | MCP `delete_concept` — refuses if backlinks remain (`--force` overrides) |
| `oh-my-ontology path <from> <to>` | **R+** MCP `find_path` — BFS 최단 경로, `edges[via]` 로 *왜* 연결됐는지 표시 |
| `oh-my-ontology orphans` | **R+** MCP `find_orphans` — 어디서도 link 안 받는 고립 노드 (kind 필터, vault-readme 자동 제외) |

## 구현 단일 진실원

local commands 는 *cli 안* 구현 (4-way parser/3-way validator contract). graph-level + analyze/infer-imports + bootstrap + `--apply` 흐름은 *MCP server child_process spawn + JSON-RPC* — `cli/src/lib/mcp-call.mjs` 의 thin wrapper. drift surface 0 (logic 복제 안 함). spawn ~50-100ms per call — bootstrap 은 3-4 회 호출이라 ~200-400ms 정도.

cli 가 별도 npm package — `oh-my-ontology` binary. cli/package.json 의 `dependencies: oh-my-ontology-mcp` 가 graph-level + apply + bootstrap 흐름 자동 활성.

## 회귀 차단

cli/src/integration.test.mjs — **82 spawn-based** integration test. 매 PR 마다 help 출력의 setup contract, init MCP config + copy-paste bootstrap 명령, graph-level 명령의 dry-run/confirm 경로, backlink redirect, analyze/infer-imports/bootstrap apply 경로, fresh init starter prune/preserve/replace 경로, single-file layered repo 의 bootstrap endpoint 자동 생성 경로를 검증.

src/features/docs-vault-local/lib/ontology-starter.test.ts — web workbench starter 의 5개
파일이 `cli/templates/vault/` 와 byte-for-byte 동일한지 검증. starter README 안에
Claude Code/Cursor `.mcp.json` 경로와 Codex `codex mcp add ...` 경로가 모두 남아있는지도
확인해 CLI/Web onboarding drift 를 차단한다.

scripts/smoke-clean-onboarding.mjs — fresh user smoke. 임시 `HOME` / `CODEX_HOME` 과 새 프로젝트를 만들고 `init → bootstrap → validate` 부터 Claude project `.mcp.json` health, Codex `mcp add` 등록까지 clean-room 으로 검증.
