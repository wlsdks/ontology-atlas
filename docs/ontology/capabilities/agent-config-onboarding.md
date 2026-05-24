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
현재 로컬 폴더에 이 파일들이 있는지, 그리고 각 파일이 실제 `oh-my-ontology`
MCP 서버와 `OMOT_VAULT` 를 가리키는지 별도 agent setup 상태로 보여준다.
상태 헤더는 준비된 setup 파일 수와 첫 누락 config 경로를 함께 보여주며, 파일이
있더라도 stale / 다른 MCP 설정이면 `점검 필요` 로 분리한다. 그래서 사용자는
존재만 하는 `.mcp.json` / `.codex/config.toml` 을 agent-ready 로 오인하지 않고,
파일별 체크리스트를 읽기 전에 다음에 만들어야 할 파일 또는 검토해야 할 설정을
바로 판단할 수 있다.

기존 vault 에서는 starter markdown 을 추가하지 않아도 누락된 agent 설정 파일만
생성할 수 있다. 이 repair action 은 이미 사용자가 작성한 ontology 파일을 건드리지
않고, agent 연결에 필요한 config surface 만 채운다.

빈 vault starter CTA 는 생성 전에 `local` / `graph proof` / `agent loop` 보증을
짧은 카드로 먼저 보여준다. 비개발자는 이 폴더의 markdown 이 서버 없는 local DB
역할을 한다는 점, `workspace_brief` / `agent_brief` 로 graph health 와 handoff 순서를
증명한다는 점, Claude Code / Cursor / Codex 가 같은 vault 를 수정 전 read-first 로
확인한다는 점을 starter 생성 버튼을 누르기 전에 이해할 수 있다.

같은 화면은 전체 setup packet, read-first 검증 prompt, 설치된 CLI graph runbook,
자동화용 JSON setup gate,
codebase-root 세션용 `.mcp.json.example` 템플릿, Codex `.codex/config.toml` 템플릿,
그리고 `codex mcp add ...` 한 줄 등록 명령도 복사 가능하게 유지한다. setup packet 은
MCP/Codex 템플릿, 재시작 안내, 검증 prompt, CLI fallback, machine-readable JSON gate 를 한 번에 묶어 별도 root 에서
agent 를 여는 사용자가 순서를 조립하지 않아도 되게 한다. 설정 상태 확인, 누락 config 생성,
검증 액션 그룹의 setup packet / MCP prompt / 터미널 graph runbook / JSON gate 복사, 별도 codebase root
연결 그룹의 MCP JSON / Codex TOML / Codex CLI 등록 명령 복사가 한 패널 안에 있어
비개발자도 Claude Code / Codex 를 열기 전에 필요한 다음 행동을 놓치지 않는다.
starter CTA 자체도 agent 검증 프롬프트와 `oh-my-ontology validate .`,
`workspace-brief .`, `agent-brief . --prompt`, `agent-brief . --graph-db-pack`,
`agent-brief . --verify-fallbacks`, `mcp-verify . --timeout-ms 15000`
CLI proof packet 을 각각 복사할 수 있어, MCP connector 가 아직 없는 세션과 agent 없는
터미널 검증이 같은 first-contact 계약을 공유한다.
자동화 gate 는 `oh-my-ontology agent-brief . --verify-fallbacks --json --fallback-timeout-ms 15000`
단일 명령을 보여주고 복사한다. Claude Code / Codex 세션은 이 JSON 의 `ok`, `failed`,
`timeoutMs`, `commands[].timedOut` 을 바로 파싱해 connector-less setup check 를 진행할 수
있고, 사람은 같은 패널에서 human runbook 을 선택할 수 있다.
새 agent 세션은 `validate_vault`,
`workspace_brief`, `agent_brief` 를 먼저 실행해 vault 가 읽히고 write tools 가
노출되는지 보고한 뒤 변경을 제안한다. MCP 가 아직 붙지 않았고 CLI 가 설치된 환경에서는
`oh-my-ontology validate .`, `workspace-brief .`, `agent-brief . --prompt`,
`agent-brief . --graph-db-pack`, `agent-brief . --verify-fallbacks`,
`hubs . --plan --limit 10 --types depends_on,relates`, `hubs . --limit 10 --types depends_on,relates`,
`mcp-verify . --timeout-ms 15000` 순서로 같은 증거와 첫 graph traversal 후보를 터미널에서 확인한다.
