---
slug: elements/ontology-graph-proof-rail
kind: element
title: Ontology Graph Proof Rail
domain: views
relates: [elements/insights-query-cockpit]
---

~~`src/views/ontology-view/lib/graph-proof-rail.ts` 가 `/ontology` 상단에 렌더하던 graph-DB proof 레일~~ — **A1(2026-05-30) 밀도 정리에서 제거됨.**

`/ontology` 가 browse 허브로 가벼워지면서 무거운 graph-DB proof 레일(코드 스니펫 + Copy MCP/CLI/runtime/sync + metrics)을 걷어냈다. 그 기능(에이전트 query pack 복사·실행 증거)은 중복 없이 이미 두 곳에 있다:

- `/ontology` 헤더의 **"Prime your AI agent"** ([[agent-onboarding-brief]]) — 완전 브리핑(query pack·guardrails·CLI fallback 포함) 1-paste.
- `/ontology/insights` 의 query cockpit ([[agent-graph-readiness]]).

PRODUCT-DIRECTION 정합: graph-DB proof 는 insights 의 역할, /ontology 는 browse. 이 노드는 *제거된 surface 의 개념 기록* 으로 남긴다(코드 파일·UI 없음).