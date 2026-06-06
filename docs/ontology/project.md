---
slug: ontology-atlas
kind: project
title: ontology-atlas
domains:
  - ai-agent-partner
  - mode-aware-adapters
  - onboarding-ux
  - ontology-core
  - vault-local-first
  - views
---

# ontology-atlas

마크다운에서 자라는 오픈소스 온톨로지 워크벤치. 사람과 AI agent 가 같이 codebase 의
mental model 을 저작한다.

이 프로젝트의 ontology 는 비즈니스 glossary 와 raw code index 사이의 의미 계층을
표현한다. business term 은 코드의 domain/capability boundary 를 설명할 때 들어오고,
source artifact 는 그 의미를 구현하거나 검증하는 element 로 들어온다.

## 핵심 약속

- **md 가 진실원**: vault 의 frontmatter 가 ontology 그대로
- **local-first**: 사용자 디스크 (vault) 가 단일 진실원. 인증 / 백엔드 의존 0.
- **AI agent partner**: MCP 서버를 통해 Claude Code 등이 ontology 를 read/write
- **3 view**: topology (Sigma), tree (`/ontology`), builder (xyflow ERD)
