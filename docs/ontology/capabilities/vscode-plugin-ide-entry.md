---
slug: capabilities/vscode-plugin-ide-entry
kind: capability
title: VSCode Plugin (IDE Entry, v0.5.0)
domain: onboarding-ux
elements:
  - vscode-plugin/src/extension.ts
  - vscode-plugin/src/walk-vault.ts
  - vscode-plugin/src/tree-provider.ts
  - vscode-plugin/src/parse-frontmatter.ts
  - vscode-plugin/src/code-match.ts
  - vscode-plugin/src/write-vault.ts
  - vscode-plugin/src/mcp-client.ts
  - vscode-plugin/src/backlinks-provider.ts
relates:
  - capabilities/cli-developer-entry
  - capabilities/mcp-server
  - capabilities/mcp-conflict-guard
  - domains/onboarding-ux
---

# VSCode Plugin (IDE Entry, v0.5.0)

R13 (2026-05-04) 에 도입된 *developer-primary IDE* 진입점. README 가
약속해 둔 "(planned) VSCode plugin" 의 first MVP 부터 v0.5.0 까지. CLI 가
터미널 진입, MCP 가 AI agent 진입이라면 이 plugin 은 **VSCode 안에서
직접 vault 노드 보고, 코드 ↔ ontology 점프하고, 새 노드 생성하고,
backlinks 탐색**.

## v0.5.0 의 4 surface

### 1. Ontology TreeView (v0.1.0)

- Activity Bar 좌측 entry — graph 모티브 SVG icon
- vault 노드 `kind` 별 그룹화 (project / domain / capability / element / document / vault-readme)
- 노드 클릭 → 해당 `.md` 열기 (`ohMyOntology.openNode`)
- workspace 의 `docs/ontology/` 자동 detect, 다른 폴더는 picker (`ohMyOntology.pickVault`)
- vault path 영속 (`globalState` + 설정 `oh-my-ontology.vaultPath`)

### 2. 코드 ↔ ontology 점프 (v0.2.0 + v0.5.0 self-match)

- 활성 editor 의 파일 path 와 vault 노드 매치 시 status bar (좌측) 에 노드 title 표시
- 매치 우선순위: self-match (활성 파일이 ontology .md 자체) > exact path > directory ancestor > capability.elements 배열
- status bar 클릭 → `ohMyOntology.openMatchedNode` → 해당 .md 열기

### 3. Add concept (v0.3.0 — write surface)

- Command Palette: `oh-my-ontology: Add concept` 또는 TreeView 헤더 `+` 버튼
- QuickPick (kind) → InputBox (slug) → InputBox (title) → optional domain
- KIND_FOLDER auto-prefix (`capabilities/foo`, `domains/foo`, `elements/foo`) — CLI `add` 와 동일 contract
- 기존 slug throw — silent overwrite 차단
- 작성 후 tree refresh + 새 .md 자동 열림

### 4. Backlinks panel (v0.4.0 — MCP server connect)

- 두 번째 TreeView 'Backlinks (current file)' — 활성 editor 매치 노드의 backlinks 표시
- v0.5.0: ontology .md 직접 열어도 자동 populate (self-match 가 트리거)
- 데이터 소스: `oh-my-ontology-mcp` 의 `find_backlinks` 도구 (plugin 이 spawn)
- MCP 실패 시 raw filesystem scan (`computeBacklinksLocally`) 으로 graceful fallback
- `useMcp` 설정으로 끄기 가능

## 5-way parser contract 편입

`vscode-plugin/src/parse-frontmatter.ts` 가 5-way 계약 5번째 진입점
(이전 4: src/shared, mcp, scripts/lib, cli). 12 fixture × 5 parser = 60
case 가 매 PR 마다 drift 차단. 동일 lenient 파서 = vault 호환성 보장.

## 4-layer 자동 검증

| Layer | 기법 | 무엇 검증 |
|---|---|---|
| 단위 logic | `node --test` × 27 case (code-match / write-vault / backlinks-local) | parser / matcher / writer / fallback logic |
| MCP integration | spawn `mcp/src/index.js` × 3 case (mcp-client.test.mjs) | wire protocol drift |
| VSCode integration | `@vscode/test-electron` × 5 case (extension.test.ts) | activation / commands / config / contributes |
| Marketplace 준비 | `vsce package` (CI step) | manifest / icon / files / contributes shape |

CI 매 PR 마다 1–4 자동 — plugin 깨지면 즉시 fail.

## Marketplace 미발행

사용자가 `code --install-extension oh-my-ontology-vscode-0.5.0.vsix` 로
본인 VSCode (또는 fork — Cursor / Antigravity 호환) 에 설치해 일상 사용.
Marketplace 발행 결정은 본인이 충분히 사용해본 후 명시 승인.
