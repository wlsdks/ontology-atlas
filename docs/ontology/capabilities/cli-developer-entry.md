---
slug: capabilities/cli-developer-entry
kind: capability
title: CLI Developer Entry (init / list / validate / add / find)
domain: onboarding-ux
elements:
  - cli/src/index.mjs
  - cli/src/commands/list.mjs
  - cli/src/commands/validate.mjs
  - cli/src/commands/add.mjs
  - cli/src/commands/find.mjs
relates:
  - capabilities/mcp-server
  - capabilities/vault-validator
  - domains/onboarding-ux
---

# CLI Developer Entry

R12 (2026-05-04) 에 도입된 *developer-primary* 진입점. 5 명령으로 사용자가 vault 만든 후 *터미널 즉시* ontology 작업 가능 — 웹 UI / MCP 등록 불필요.

| Command | What it does |
|---|---|
| `oh-my-ontology init [folder]` | Scaffold vault (5 starter .md + `.mcp.json.example`) |
| `oh-my-ontology list [vault]` | List ontology nodes (color table, `--kind X` filter, `--json`) |
| `oh-my-ontology validate [vault]` | Frontmatter integrity check (5 issue codes; CI gate via exit 1) |
| `oh-my-ontology add <kind> <slug> --title="..."` | Scaffold new node (duplicate throw, `--domain --body --vault`) |
| `oh-my-ontology find <query> [vault]` | Search slug + title with yellow highlight (`--kind --json`) |

cli 가 별도 npm package (v0.2.0, R12 #41) — `oh-my-ontology` binary. mcp/ 가 14 도구로 같은 vault 를 read/write 하듯, cli 도 같은 .md 파일을 *동일 contract* 로 처리 (4-way parser contract + 3-way validator contract 강제).

11 spawn-based integration test (`cli/src/integration.test.mjs`, R12 #40) 가 회귀 차단.

5 명령의 onboarding flow: `init → list → validate → add → find` (R12 #36 walk-through audit 후 init next-steps 갱신).
