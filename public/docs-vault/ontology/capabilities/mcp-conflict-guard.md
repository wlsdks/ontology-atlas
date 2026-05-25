---
slug: capabilities/mcp-conflict-guard
kind: capability
title: MCP Conflict Guard (mtime 기반 silent overwrite 차단)
domain: ai-agent-partner
elements:
  - mcp/src/index.js
  - mcp/src/vault.mjs
  - src/features/docs-vault-local/model/use-local-vault.ts
  - src/features/project-data-source/model/use-project-mutations.ts
  - src/views/ontology-edit/ui/OntologyEditPage.tsx
relates:
  - capabilities/mcp-server
  - domains/ai-agent-partner
---

# MCP Conflict Guard

같은 .md 가 사람 GUI · 외부 에디터 · 다른 AI MCP 에 의해 동시 편집될 때 silent
overwrite 차단. R11 #8 에서 MCP 측 도입, R+ 에서 local UI 의 본문 저장과
frontmatter patch 경로까지 확장.

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
- local UI `saveDoc` / `updateFrontmatter` — manifest `doc.mtime` 을
  `expectedMtime` 으로 넘기면 write 직전 같은 검증 수행
- `expectedMtime` 미지정 시 검증 skip — 기존 호출자 호환 및 drag-position
  같은 고빈도 best-effort write 허용

## 호환

mcp v0.7.0 부터. UI 본문 편집기와 ontology editor 의 title/domain/relation
frontmatter 저장은 같은 conflict guard 를 사용한다. Project edit 의
frontmatter 저장도 manifest mtime 을 넘긴다. create/delete/rename 과
drag-position 저장은 아직 best-effort 경로다.
