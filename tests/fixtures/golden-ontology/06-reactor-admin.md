---
id: reactor-admin
kind: project
project: reactor-admin
title: Reactor Admin
version: 1
---

# Reactor Admin

Arc Reactor 의 operator / developer 콘솔. React 19 + Vite 7 + TypeScript
5.9 SPA. 한국어 우선 UI + 다크모드 네이티브 "Quiet Authority" 디자인.

## 도메인 (Domain)

### 운영 (Operations)

런타임 모니터링 + 진단. 헬스 / 트레이스 / 감사 / 토큰 비용 / 사용량.

### 구성 (Configuration)

페르소나 / RAG / MCP / Safety/Output Guard / 프롬프트 / 스케줄러 등
런타임 행동 정의.

### 거버넌스 (Governance)

승인 큐 / RBAC / Tool Policy / 채널별 정책 / 테넌트 관리.

### 분석 (Analytics)

RAG 분석 / 토큰 비용 / 사용량 / 세션 분석 / 슬랙 활동.

## 기능 (Capability)

### 대시보드 (Dashboard)

`features/dashboard` — 운영 첫 화면.

### 헬스 / 트레이스 / 감사 (Health, Traces, Audit)

`features/health` / `features/traces` / `features/audit`. 런타임 진단.

### 페르소나 관리 (Personas)

`features/personas` — agent persona 정의 / 버전.

### RAG 관리 (RAG)

`features/rag-analytics` / `features/rag-cache` — 검색 품질 / 캐시.

### MCP 등록 (MCP)

`features/capabilities` — MCP 서버 동적 등록 + 정책.

### 프롬프트 관리 (Prompt Lab / Studio / Prompts)

`features/prompt-lab` / `features/prompt-studio` / `features/prompts`.
버전 관리 + LLM Judge 평가.

### 승인 큐 (Approvals)

`features/approvals` — Human-in-the-Loop 승인.

### Tool 정책 / 통계 (Tool Policy, Tool Stats)

`features/tool-policy` / `features/tool-stats`. 채널별 거버넌스 + 통계.

### 세션 / 디버그 / 챗 인스펙터 (Sessions, Debug Replay, Chat Inspector)

`features/sessions` / `features/debug-replay` / `features/chat-inspector`.
대화 재현 / 디버그.

### 스케줄러 / 보존 (Scheduler, Retention)

`features/scheduler` / `features/retention`. 작업 / 데이터 수명.

### 슬랙 통합 (Slack Activity / Slack Bots / Slack FAQ)

`features/slack-*`. 채널 통합 관리.

### 테넌트 / RBAC (Tenant Admin, RBAC)

`features/tenant-admin` / `features/rbac`. 권한 + 멀티테넌트.

## 핵심 요소 (Element)

### React 19

UI 런타임.

### Vite 7

build / dev server. main chunk budget 500 kB.

### TypeScript 5.9

strict 모드.

### Tailwind / Quiet Authority 디자인 시스템

DESIGN.md 의 토큰 / 타이포 / chart palette.

### Playwright

E2E. live operator stack 대상 smoke 가능.

### Vitest

단위. coverage line ≥ 90% / branches ≥ 75%.

## 의존 (Dependencies)

reactor 의 admin API 를 소비. swagger-mcp-server / atlassian-mcp-server
와 함께 live operator stack 구성.
