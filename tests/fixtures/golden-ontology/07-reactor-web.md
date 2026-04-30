---
id: reactor-web
kind: project
project: reactor-web
title: Reactor Web
version: 1
---

# Reactor Web

Arc Reactor AI Agent framework 의 웹 채팅 UI. React 19 + Vite 7 +
TypeScript 5.9. 실시간 SSE 스트리밍 + 세션 기반 대화 + i18n + 다크/라이트
테마.

## 도메인 (Domain)

### 채팅 (Chat)

사용자 ↔ AI agent 실시간 대화. SSE 스트리밍 + 세션 관리.

### 페르소나 (Persona)

agent persona 선택 / 변경 / 기본값 관리.

### 사용자 인증 (Auth)

선택적 JWT 인증 + 사용자별 데이터 격리.

### 관리 콘솔 (Admin Console)

MCP / Persona / Intent / Output Guard / Tool Policy / Scheduler /
Clipping 의 web-side 관리 surface.

## 기능 (Capability)

### SSE 채팅 스트리밍 (SSE Chat Streaming)

Server-Sent Events 로 토큰 단위 응답 스트리밍.

### 세션 관리 (Session Management)

대화 history 보존 / 새 세션 / 이전 세션 복귀.

### 마크다운 렌더링 (Markdown Rendering)

문법 강조 포함 마크다운 출력.

### 테마 토글 (Theme Toggle)

다크 / 라이트 모드 전환. 사용자 prefer 자동 감지.

### 다국어 (i18n)

i18next + react-i18next. 영어 / 한국어.

### 페르소나 CRUD

페르소나 생성 / 수정 / 삭제 / 기본값 지정.

### 관리자 대시보드 (Admin Dashboard)

MCP 서버 / 페르소나 / 인텐트 / Output Guard / Tool Policy / Scheduler
/ Clipping 의 web-side UI.

### 반응형 디자인 (Responsive 375~1440)

모바일 (375) ~ 데스크톱 (1440) 폭 지원.

## 핵심 요소 (Element)

### React 19

UI 런타임.

### Vite 7

build / dev server.

### TypeScript 5.9

언어.

### TanStack Query 5

서버 상태.

### Zustand 5

클라이언트 상태.

### react-router 7

라우팅.

### ky

HTTP client.

### react-hook-form + zod

폼 + 검증.

### i18next

다국어.

### Playwright

E2E.

## 의존 (Dependencies)

reactor 의 채팅 / persona / admin API. JWT 발급은 별도 인증 서버 또는
reactor-internal.
