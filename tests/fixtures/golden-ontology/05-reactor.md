---
id: reactor
kind: project
project: reactor
title: Arc Reactor
version: 1
---

# Arc Reactor

Spring AI 기반 엔터프라이즈 AI Agent 런타임. ReAct 루프 (Reasoning +
Acting) + 거버넌스 + 멀티채널 통합. Fork → 커스터마이즈 → 배포 모델.

## 도메인 (Domain)

### 에이전트 런타임 (Agent Runtime)

ReAct 루프 엔진 — LLM 이 Tool 호출 결정 → 실행 → 관찰 → 최종 답변
까지 반복. 컨텍스트 트리밍 / 구조화 출력 / 자동 복구 포함.

### 거버넌스 (Governance)

Guard 파이프라인 (5단계 fail-close 입력 검증) + Hook 생애주기 (4 종) +
Tool 정책 + Human-in-the-Loop 승인.

### 멀티채널 (Multi-Channel)

Web / Slack / Discord / Teams / Line / Google 진입점. 각 채널별 정책
독립.

### 도구 시스템 (Tool System)

MCP (Model Context Protocol) 동적 등록 + Tool 정책 엔진 + 승인 큐.

## 기능 (Capability)

### ReAct 엔진 (ReAct Engine)

`arc-core` 의 핵심. 제한된 Tool 호출 반복, 재시도, 자동 컨텍스트 트리밍.

### Guard 파이프라인 (Guard Pipeline)

5 단계 — Rate limit / Input length / Unicode 정규화 / 분류 / Canary
Token 감지. 실패 시 fail-close.

### Hook 생애주기 (Hook Lifecycle)

BeforeAgentStart / BeforeToolCall / AfterToolCall / AfterAgentComplete.
감사 로깅 / 과금 / 정책 적용 진입점.

### MCP Registry

REST API 로 재시작 없이 런타임에 MCP 서버 (STDIO / SSE) 등록 + 서버별
접근 정책.

### Human-in-the-Loop 승인

Tool 실행 전 사람 검토 큐.

### Tool 정책 엔진 (Tool Policy Engine)

채널별 쓰기 Tool 거버넌스. 채널별 허용 / 차단 목록.

### Prompt Lab

프롬프트 템플릿 버전 관리 + LLM Judge 자동 평가.

### RAG 파이프라인 (RAG Pipeline)

쿼리 변환 + PGVector 검색 + 리랭킹 + 컨텍스트 주입. API 동적 수집 거버넌스.

### Supervisor Multi-Agent

`SupervisorAgent` 가 Slack / Web 요청 자동 경유. `independentExecution=
true` 시 병렬 fan-out (coroutineScope + async + awaitAll).

### Context 관찰성 (Context Observability)

Micrometer counter — `arc.context.trim.*` / `arc.context.summary.*`.
multi-round compaction 의 summary 누적 보존.

## 핵심 요소 (Element)

### Spring Boot 3.5

런타임 프레임워크.

### Spring AI 1.1

LLM 추상화 (Anthropic / Gemini / OpenAI). cache hit rate 태그 분리.

### Kotlin 2.3

언어. coroutine 기반 병렬.

### PGVector

RAG 의 벡터 저장.

### Micrometer

관찰성 — 모든 counter 노출.

## 모듈 (Element — 모듈)

### arc-core

ReAct 엔진 / Guard / Hook 코어.

### arc-app

Spring Boot application 진입점.

### arc-admin

관리 API.

### arc-web

웹 채널 통합.

### arc-slack / arc-discord / arc-teams / arc-line / arc-google

각 채널 통합 어댑터.

### arc-error-report

에러 진단 UX (R704) — 친절한 해결 힌트 자동 생성.
