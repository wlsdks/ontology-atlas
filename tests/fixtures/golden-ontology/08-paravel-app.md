---
id: paravel-app
kind: project
project: paravel-app
title: Paravel App
version: 1
---

# Paravel App

aslan 이 만든 사내 커뮤니티 슈퍼앱. React Native 0.83 + Expo SDK 55 +
NativeWind v4 + GlueStack UI v3 + React 19.2. ISMS-P 준수 (JWT에 PII
없음).

## 도메인 (Domain)

### 피드 (Feed)

게시글 / 댓글 / 반응 중심의 메인 타임라인.

### 익명 (Anonymous)

익명 채널 / 익명 신고 / 익명 게시.

### 클럽 (Club)

소모임. 클럽별 게시글·멤버.

### 채용 (Flash Recruit)

번개 채용. 사내 즉시 매칭.

### 뱃지 / 친구 (Badge / Buddy)

업적 뱃지 + 동료 친구 관계.

### 알림 (Notification)

푸시 / 인앱 알림 + 사용자 preference.

### 인증·프로필 (Auth & Profile)

aslan-iam 의 RS256 JWT 기반 + 사용자 프로필.

## 기능 (Capability)

### 게시글 작성·편집 (Post Create/Edit)

`features/create-post` / `features/edit-post`. 미디어 업로드 동반.

### 미디어 업로드 (Media Upload)

`features/media-upload`. 이미지 / 동영상 첨부.

### 댓글 (Comment)

`features/comment`. 게시글 트리.

### 반응 (Reaction)

`features/reaction`. 좋아요 등 다중 반응.

### 투표 (Poll)

`features/poll`. 게시글 내 투표.

### 북마크 (Bookmark)

`features/bookmark`. 사용자 별 저장.

### 신고 / 차단 (Report / Block)

`features/report` + `entities/block`. 익명 신고 + 사용자 차단.

### 공유 (Share)

`features/share`. 외부 / 다른 사용자 공유.

### 프로필 (Profile)

`features/profile`. 사용자 프로필 편집 + 보기.

### 인증 (Auth)

`features/auth`. aslan-iam 토큰 발급 + 갱신.

## 핵심 요소 (Element)

### React Native 0.83

크로스 플랫폼 런타임 (iOS / Android).

### Expo SDK 55

번들링 + native module.

### React 19.2

UI 런타임.

### NativeWind v4

Tailwind for RN 스타일링.

### GlueStack UI v3

크로스 플랫폼 컴포넌트 라이브러리.

### Zustand 5

클라이언트 상태.

### TanStack Query 5

서버 상태.

### React Navigation 7

bottom-tabs + native-stack.

### React Hook Form + Zod

폼 + 검증.

### Socket.io-client

실시간 알림 / 채팅.

### Axios

HTTP client.

### @shopify/flash-list

대량 리스트 성능.

### Jest + Testing Library RN

단위 테스트.

## 의존 (Dependencies)

aslan-iam (RS256 JWT 발급) + Paravel-Backend (Spring Boot DDD 모듈러
모놀리스, 9 BC).
