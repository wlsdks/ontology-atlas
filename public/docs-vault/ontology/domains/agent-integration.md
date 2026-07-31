---
slug: domains/agent-integration
kind: domain
title: AI Agent Integration
display_ko: AI 에이전트 연동
display_en: AI Agent Integration
capabilities: [capabilities/vault-agent]
elements: [elements/agent-connect, elements/vault-agent-panel]
created_by: human
---

## 정의
AI 코딩 에이전트(Claude Code, Codex, Cursor)가 사람과 같은 온톨로지 볼트를 읽고 쓸 수 있게 하는 MCP 서버 표면과 앱 내 connect 플로우.

## 근거
- README.md — "Your agent reads and maintains it over MCP... one button writes your agent's config and proves the connection."
- AGENTS.md — "AI agent (Claude Code, Codex, Cursor) reads/writes the same .md files via the mcp/ MCP server (32 tools)"

## 포함 / 제외
- 포함: MCP 도구 32종, 앱 내 connect 버튼, 클라이언트 config 작성
- 제외: 그래프 스키마 자체(그건 graph-modeling 도메인)

## 확신도
high (0.9) — README + AGENTS.md 모두 직접 인용