---
slug: capabilities/vscode-plugin-ide-entry
kind: capability
title: VSCode Plugin (IDE Entry)
domain: onboarding-ux
elements:
  - vscode-plugin/src/extension.ts
  - vscode-plugin/src/walk-vault.ts
  - vscode-plugin/src/tree-provider.ts
  - vscode-plugin/src/parse-frontmatter.ts
relates:
  - capabilities/cli-developer-entry
  - capabilities/mcp-server
  - domains/onboarding-ux
---

# VSCode Plugin (IDE Entry)

R13 (2026-05-04) 에 도입된 *developer-primary IDE* 진입점. README 가
약속해 둔 "(planned) VSCode plugin" 의 first MVP. CLI 가 터미널 진입,
MCP 가 AI agent 진입이라면 이 plugin 은 **VSCode 안에서 직접 vault 노드
보고 .md 점프**.

## v0.1.0 MVP

- **Activity Bar entry** — 'oh-my-ontology' icon (graph 모티브 SVG)
- **TreeView** — vault 노드를 `kind` 별 그룹화 (project / domain / capability / element / document / vault-readme)
- **노드 클릭 → .md 열기** — \`ohMyOntology.openNode\` command
- **vault 자동 인식** — workspace 의 \`docs/ontology/\` 자동 detect, 다른 폴더는 picker 로 선택
- **vault path 영속** — \`globalState\` + 설정 \`oh-my-ontology.vaultPath\`

## 5-way parser contract 편입

\`vscode-plugin/src/parse-frontmatter.ts\` 가 5-way 계약 5번째 진입점
(이전 4: src/shared, mcp, scripts/lib, cli). 12 fixture × 5 parser = 60
case 가 매 PR 마다 drift 차단. 동일 lenient 파서 = vault 호환성 보장.

## 다음 단계 (이 MVP 외)

- 코드 ↔ ontology 점프 (현재 열린 source 의 element 매치 → side panel)
- Add concept inline command (write surface)
- MCP 서버 connect (mcp/src/index.js spawn)
- Marketplace publish

## 검증

\`pnpm test:run\` — 5-way contract test 60/60 통과 (\`tests/contract/parse-frontmatter.contract.test.ts\`).
\`vscode-plugin/\` 안에서 \`npm install && npm run compile\` → \`out/extension.js\` 생성.
F5 (Extension Development Host) 실행 시 dogfood vault 가 22 노드로 표시.
