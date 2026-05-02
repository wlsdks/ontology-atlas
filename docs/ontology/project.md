---
slug: oh-my-ontology
kind: project
title: oh-my-ontology
domain: workbench
capabilities:
  - frontmatter-to-ontology
  - mode-aware-adapter
  - ontology-hub-mode-aware
  - 3-view-rendering
  - ai-agent-partner
  - builder-vault-write
elements:
  - vault-local-first
  - ontology-core
  - views
  - ai-agent-partner
relates:
  - domains/vault-local-first
  - domains/ontology-core
  - domains/views
  - domains/ai-agent-partner
---

# oh-my-ontology

마크다운에서 자라는 오픈소스 온톨로지 워크벤치. 사람과 AI agent 가 같이 codebase 의
mental model 을 저작한다.

## 핵심 약속

- **md 가 진실원**: vault 의 frontmatter 가 ontology 그대로
- **local-first**: 사용자 디스크 (vault) 가 단일 진실원. 인증 / 백엔드 의존 0.
- **AI agent partner**: MCP 서버를 통해 Claude Code 등이 ontology 를 read/write
- **3 view**: topology (Sigma), tree (`/ontology`), builder (xyflow ERD)
