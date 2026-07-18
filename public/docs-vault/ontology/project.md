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

**정체성 (2026-07): agent-native, human-sovereign.** 에이전트를 *위한* 메모리가
아니라 **에이전트가 1급 사용자인 공유 의미 계층** — 에이전트는 MCP/CLI 로
신선도를 유지하는 엔진이자 최대 소비자, 사람은 평문 마크다운·git diff·로컬
디스크 진실원을 통한 의미의 최종 결정권자. 훅은 에이전트 통증("코드베이스
장기 구조를 까먹는다"), 본질은 공유 계층.

이 프로젝트의 ontology 는 비즈니스 핵심과 구현 근거를 한 그래프에서 연결하는 의미
계층을 표현한다. business term 은 product intent, domain language, decision path,
capability boundary 를 설명할 때 들어오고, source artifact 는 그 의미를 구현하거나
검증하는 element 로 들어온다.

## 핵심 약속

- **md 가 진실원**: vault 의 frontmatter 가 ontology 그대로
- **local-first**: 사용자 디스크 (vault) 가 단일 진실원. 인증 / 백엔드 의존 0.
- **AI agent partner**: MCP 서버를 통해 Claude Code 등이 ontology 를 read/write
- **3 view**: topology (Sigma), tree (`/ontology`), builder (xyflow ERD)
