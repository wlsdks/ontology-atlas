---
slug: ontology-atlas
kind: project
title: ontology-atlas
display_ko: 온톨로지 아틀라스
description: 마크다운 폴더 하나로, 사람과 AI 에이전트가 같이 읽고 고치는 제품 지도를 만드는 도구입니다.
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
- **2 view**: topology (canvas-2D `topology-map-v2` — `/`, `/topology`, 문서함 INDEX 포함; `/ontology` 는 그 안으로 흡수되는 얇은 리다이렉트), workshop (나침 무대 `/ontology/studio` — 노드 의미 완성 + frontmatter 쓰기 표면; 구 xyflow ERD 빌더 `/ontology/edit` 는 2026-07-24 은퇴 → 공방으로 리다이렉트)
