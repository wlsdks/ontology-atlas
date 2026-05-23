---
slug: capabilities/agent-config-onboarding
kind: capability
title: Agent Config Onboarding
domain: ai-agent-partner
dependencies:
  - capabilities/mcp-server
  - capabilities/vault-live-updates
elements:
  - src/features/docs-vault-local/lib/ontology-starter.ts
  - src/features/docs-vault-local/model/use-local-vault.ts
  - src/features/docs-vault-local/ui/OntologyStarterCta.tsx
  - src/views/docs-vault/ui/DocsVaultPage.tsx
  - src/widgets/docs-vault/ui/VaultToolsMenu.tsx
relates:
  - domains/ai-agent-partner
  - domains/onboarding-ux
---

# Agent Config Onboarding

로컬 vault 를 Claude Code / Cursor / Codex 에 붙이는 설정 파일을 사람이 확인하고
복구할 수 있게 하는 onboarding surface. web starter 와 CLI init 은 `.mcp.json`,
`.codex/config.toml`, `.mcp.json.example` 을 생성하고, Docs vault tools menu 는
현재 로컬 폴더에 이 파일들이 있는지 별도 agent setup 상태로 보여준다.

기존 vault 에서는 starter markdown 을 추가하지 않아도 누락된 agent 설정 파일만
생성할 수 있다. 이 repair action 은 이미 사용자가 작성한 ontology 파일을 건드리지
않고, agent 연결에 필요한 config surface 만 채운다.

같은 화면은 read-first 검증 prompt, 설치된 CLI fallback 검증 명령, codebase-root
세션용 `.mcp.json.example` 템플릿, Codex `.codex/config.toml` 템플릿도 복사 가능하게
유지한다. 설정 상태 확인, 누락 config 생성, 검증 액션 그룹의 MCP prompt / 터미널
검증 명령 복사, 별도 codebase root 연결 그룹의 MCP JSON / Codex TOML 복사가 한 패널
안에 있어 비개발자도 Claude Code / Codex 를 열기 전에 필요한 다음 행동을 놓치지 않는다.
새 agent 세션은 `validate_vault`,
`workspace_brief`, `agent_brief` 를 먼저 실행해 vault 가 읽히고 write tools 가
노출되는지 보고한 뒤 변경을 제안한다. MCP 가 아직 붙지 않았고 CLI 가 설치된 환경에서는
`oh-my-ontology validate .`, `workspace-brief .`, `agent-brief . --prompt`,
`mcp-verify . --timeout-ms 15000` 순서로 같은 증거를 터미널에서 확인한다.
