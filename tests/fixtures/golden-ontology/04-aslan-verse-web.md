---
id: aslan-verse-web
kind: project
project: aslan-verse-web
title: Aslan Verse Web
version: 1
---

# Aslan Verse Web

Aslan 플랫폼의 웹 프론트엔드 — Vite + React 19 + xyflow 기반 워크스페이스
시각화. 사용자가 랜딩에서 진입해 워크스페이스 목록 → 워크스페이스 상세
(노드 그래프) 로 drill-in 하는 SaaS 시각화 앱.

## 도메인 (Domain)

### 랜딩 (Landing)

비로그인 visitor 진입점. 제품 소개 + 로그인 / 회원가입 CTA.

### 워크스페이스 (Workspace)

로그인 후 핵심 surface. 워크스페이스 목록 → 워크스페이스 상세 (xyflow
canvas) 로 drill-in. 노드/엣지 편집.

### 대시보드 (Dashboard)

사용자별 워크스페이스 활동 / 알림 / 최근 변경 요약.

## 기능 (Capability)

### 랜딩 페이지 (Landing Page)

`features/landing/LandingPage.tsx`. 비로그인 visitor 첫 화면.

### 워크스페이스 목록 (Workspace List)

`features/workspace/WorkspaceListPage.tsx`. 사용자 소속 워크스페이스
나열 + 새 워크스페이스 진입.

### 워크스페이스 캔버스 (Workspace Canvas)

`features/workspace/WorkspacePage.tsx`. xyflow 기반 노드 그래프 편집기.

### 대시보드 페이지 (Dashboard Page)

`features/dashboard/DashboardPage.tsx`. 사용자 홈.

### 인증 흐름 (Auth Flow)

aslan-iam 의 JWT 발급 → 로컬 검증 + Bearer 헤더. ky HTTP client +
react-query.

### 서버 상태 관리 (Server State)

`@tanstack/react-query` + ky. URL 상태는 nuqs (URL search params 동기화).

## 핵심 요소 (Element)

### Vite

build / dev server. tsc -b 로 빌드.

### React 19

UI 런타임.

### xyflow/react

워크스페이스 캔버스의 그래프 라이브러리.

### react-router 7

`app/router.tsx` 의 라우팅.

### Tailwind v4

`@tailwindcss/vite` 빌드 통합.

### Lion UI

`@lion/ui` (디자인 시스템) — 모노레포 file: 의존.

### react-hook-form + zod

폼 + 스키마 검증.

## 의존 (Dependencies)

aslan-iam 의 JWT 토큰 + 공개키. 서버 API 는 별도 백엔드 (가정 —
aslan-builder API 또는 별도 서비스). 디자인 시스템은 lion-ui 모노레포.
