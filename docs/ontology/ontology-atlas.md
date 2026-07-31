---
slug: ontology-atlas
kind: project
title: Ontology Atlas
display_ko: 온톨로지 아틀라스
display_en: Ontology Atlas
domains: []
capabilities: []
elements: []
contains: [domains/agent-integration, domains/graph-modeling, domains/local-vault-management, domains/onboarding-and-shell, domains/project-portfolio, domains/topology-navigation]
---

## 정의
로컬 마크다운 볼트의 frontmatter를 타입이 있는 계산 가능 그래프(도메인·능력·구현 증거·의존·영향)로 바꾸는 로컬-퍼스트 온톨로지 워크벤치. 개발자는 CLI/웹으로, AI 코딩 에이전트는 MCP로 같은 파일을 읽고 쓴다.

## 근거
- README.md — "Your AI coding agent forgets your codebase between sessions... turns the Markdown in your repository into a graph of your product"
- AGENTS.md — Project overview ("a local-first ontology workbench for understanding a product/system from business core to implementation evidence")

## 포함 / 제외
- 포함: 그래프 스키마·컴파일·쿼리, MCP/CLI 에이전트 연동, 로컬 볼트 관리, 토폴로지 탐색, 프로젝트 포트폴리오, 온보딩·배포·앱 셸
- 제외: 백엔드/인증/클라우드 협업 (R10에서 영구 제거, Layer 2로만 조건부 재도입)

## 확신도
high (README + AGENTS.md 직접 인용)