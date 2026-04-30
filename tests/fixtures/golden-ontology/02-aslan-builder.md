---
id: aslan-builder
kind: project
project: aslan-builder
title: Aslan Builder
version: 1
---

# Aslan Builder

Drag-and-drop visual AI agent builder. 사용자가 canvas 에서 노드를 조합해
AI workflow 를 만들고, 호스팅 워크플로우 또는 API endpoint 로 실행하는
SaaS 제품. Commercial closed-source-capable.

## 도메인 (Domain)

### 워크플로우 (Workflow)

DAG 기반 실행 단위. canvas 에서 노드들을 잇고 trigger 를 걸면 한 endpoint
로 노출. version 관리 + 환경 분리 + 실행 history.

### 에이전트 빌더 (Agent Builder)

LLM agent 의 tool / 메모리 / 라우팅을 시각적으로 구성. Wizard 가 자연어
프롬프트로 초안을 생성, 사용자가 canvas 에서 다듬는 흐름.

### 실행 런타임 (Execution Runtime)

워커가 DAG 를 받아 노드 단위로 실행. sandbox (isolated-vm / Firecracker)
안에서 사용자 코드 실행. queue 로 격리.

## 기능 (Capability)

### 캔버스 에디터 (Canvas Editor)

@xyflow/react 기반 drag-and-drop 노드 편집 UI. zoom / pan / multi-select
/ 노드 라이브러리 패널.

### 위저드 (AI Wizard)

자연어 프롬프트 → Vercel AI SDK SSE 스트리밍 → tool-call 로 canvas 에
노드/엣지 자동 추가. `apps/api/wizard` 에서 도구 호출 reducer.

### DAG 실행기 (DAG Executor)

자체 구현 (LangChain / LlamaIndex 사용 금지). 토폴로지 정렬 + 병렬
브랜치 + retry + 실패 시 재개 지점 (replay) 지원.

### LLM 프로바이더 추상화 (LLM Provider Abstraction)

`packages/llm` 단일 진입. OpenAI / Anthropic / Vercel AI SDK 모두 같은
tool-call 채널로 통합. 직접 `openai` / `@anthropic-ai/sdk` import 금지.

### 노드 레지스트리 (Node Registry)

내장 노드 + 향후 plugin 노드. 각 노드 schema 는 version 별 immutable —
기존 워크플로우가 깨지지 않게.

### 샌드박스 (Sandbox)

`packages/sandbox` 가 isolated-vm (JS) 와 Firecracker (arbitrary lang)
두 modes wrap. user code 는 `apps/web` 에서 절대 실행 안 함.

## 핵심 요소 (Element)

### Better Auth

`packages/auth` 가 Better Auth + RBAC 위에 워크플로우 권한 모델 구축.

### PostgreSQL + pgvector

`packages/db` Drizzle ORM. workflow / version / run / 임베딩 동거.

### BullMQ + Valkey

`packages/queue` 가 BullMQ wrap. Redis 7.4+ SSPL 라 Valkey 또는 Redis
7.2.x 핀.

### Turbo monorepo

apps + packages + plugins 단일 pnpm workspace. dep cruise 로 boundary
강제.

## 아키텍처 경계 (Architecture)

`apps → packages → types` 단방향 dependency. `packages/*` 는 `apps/*`
import 금지. `apps/web` 은 `db / executor / llm / sandbox` 직접 import
금지 (오직 `apps/api` 통해서).
