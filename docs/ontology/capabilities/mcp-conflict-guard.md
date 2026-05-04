---
slug: capabilities/mcp-conflict-guard
kind: capability
title: MCP Conflict Guard (mtime 기반 silent overwrite 차단)
domain: ai-agent-partner
elements:
  - mcp/src/vault.mjs
  - mcp/src/index.js
relates:
  - capabilities/mcp-server
  - domains/ai-agent-partner
---

# MCP Conflict Guard

같은 .md 가 사람 GUI · 외부 에디터 · 다른 AI MCP 에 의해 동시 편집될 때 silent
overwrite 차단. R11 #8 에서 mcp 측 도입 (UI 측은 후속 task #15).

## 흐름

1. AI agent 가 `get_concept` 호출 → 응답에 `mtime` (ms) 포함
2. agent 가 분석 / 수정 후 `patch_concept({ slug, frontmatter, expected_mtime: <prev mtime> })` 호출
3. write 직전 server 가 현재 mtime 과 비교
4. 다르면 `VaultConflictError(slug, expectedMtime, currentMtime)` throw
5. agent 가 알림 받고 re-read 후 재시도

## API

- `get_concept` — 응답 `mtime` (ms) 추가
- `patch_concept` — `expected_mtime` (number, optional)
- `delete_concept` — `expected_mtime` (number, optional)
- `expectedMtime` 미지정 시 검증 skip — 기존 호출자 호환

## 호환

mcp v0.7.0 부터. UI 측 동일 가드는 후속 task — 현재 사람 GUI save 흐름은
silent overwrite 가능.
