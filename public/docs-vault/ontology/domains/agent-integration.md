---
uid: 0f1364a5-7d0f-4fa5-b913-454d47b33cca
slug: domains/agent-integration
kind: domain
title: AI Agent Integration
display_ko: AI 에이전트 연동
display_en: AI Agent Integration
capabilities: [capabilities/acp-runtime, capabilities/cli-developer-entry, capabilities/mcp-server, capabilities/skill-process-handoff, capabilities/vault-agent]
elements: [elements/agent-connect, elements/agent-skill-process-contract, elements/vault-agent-panel]
created_by: human
relation_notes: { capabilities/acp-runtime: "Agent integration owns launching the user's already-installed coding agent inside the app over ACP with an isolated config and a vault-scoped permission gate.", capabilities/skill-process-handoff: Agent integration owns source-bound skill procedure inspection and explicit handoff to a fresh agent., elements/agent-skill-process-contract: The domain exposes the source-bound process contract as a concrete implementation role shared by the human workbench and agent handoff. }
---

## 정의
AI 코딩 에이전트(Claude Code, Codex, Cursor)와 개발자가 사람과 같은 온톨로지 볼트를 읽고 쓸 수 있게 하는 표면들: MCP 서버, 터미널 CLI, 앱 내 connect 플로우, 그리고 사용자가 이미 설치해 둔 코딩 에이전트를 앱이 직접 띄우는 ACP 실행기 층.

## 근거
- README.md: "Your agent reads and maintains it over MCP... one button writes your agent's config and proves the connection."
- mcp/src/index.js · mcp/src/tool-inventory.mjs: 활성 registry에서 `tools/list`와
  full/read-only initialize 인벤토리를 함께 파생하는 결합 경계
- cli/src/commands/agent-brief.mjs: `--project`를 MCP `agent_brief.project`와 같은
  명시적 project 선택자로 전달

## 포함 / 제외
- 포함: 실행 시 현재 목록을 광고하는 MCP read/write 도구(`mcp/`), 로컬 CLI,
  앱 내 connect 버튼, 클라이언트 config 작성과 `mcp-verify` 연결 증명,
  ACP 로 실행기를 탐지하고 격리된 설정으로 띄우는 앱 안 실행 층
  (`capabilities/acp-runtime`)
- 제외: 그래프 스키마 자체(그건 graph-modeling 도메인)

## 프로젝트 의미 인계

`finalize_project_meaning`은 graph write·vault 검증·project compile 뒤 사람이 읽는
project Markdown의 competency 답을 body digest와 graph/source provenance에 묶는다.
sidecar에는 원시 답변·raw witness·private source root/remote를 저장하지 않는다.
이후 새 MCP 프로세스의 `agent_brief.meaningAssessment`가 현재 Markdown과 inventory를
다시 검증하며, source currentness를 확인할 수 없으면 저장된 receipt가 있어도
`review_required`로 닫는다.

CLI `agent-brief --project <slug>`는 여러 project의 결과를 합치는 옵션이 아니라,
하나의 project containment tree를 명시해 같은 MCP `agent_brief`를 읽는 선택자다.

## 확신도
high (0.9): MCP registry와 CLI integration test가 현재 계약을 직접 검증
