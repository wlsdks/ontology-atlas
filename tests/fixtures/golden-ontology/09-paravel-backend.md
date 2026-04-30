---
id: paravel-backend
kind: project
project: paravel-backend
title: Paravel Backend
version: 1
---

# Paravel Backend

사내 커뮤니티 슈퍼앱 백엔드. Kotlin 2.2 + JDK 21 + Spring Boot 4.0 의
DDD 모듈러 모놀리스 (9 Bounded Context · 33 Aggregate Root · 31 Gradle
모듈).

## 도메인 (Domain) — 9 Bounded Contexts

### Community

실명 게시판. Feed / Comment / Poll / Flash Recruit / Bookmark 의 8 AR.

### Anonymous (BC)

익명 게시판. tokenHash 기반 신원 분리. 4 AR.

### Club (BC)

소모임. 클럽 / 멤버 / 게시글.

### Identity (BC)

사용자 신원 + 프로필. aslan-iam 의 sub 매핑.

### Moderation (BC)

신고 / 차단 / 검토 큐.

### Notification (BC)

푸시 / 인앱 알림 발송.

### Discovery (BC)

검색 / 트렌딩 / 추천 (Caffeine 캐시).

### Media (BC)

이미지 / 동영상 메타 + 업로드.

### Integration (BC)

외부 시스템 연동 + Anti-Corruption Layer (ACL).

## 기능 (Capability)

### Hexagonal Domain·Application 분리

각 BC 가 `-domain` (외부 의존 0) + `-application` (Use Cases) 모듈 쌍.

### Bootstrap 조립 (paravel-app)

REST Controller / Bean 조립 / Security / Swagger 진입점.

### JPA Persistence (paravel-infra-rdb)

JPA Entity / Repository 구현 / Flyway V1~V13 / Kotlin JDSL 3.5.

### iam-client (ACL)

aslan-iam 의 RS256 JWT 검증 + Anti-Corruption Layer. Resilience4j 회로
차단.

### Test 인프라

Kotest + MockK + Testcontainers + ArchUnit (모듈 boundary 강제).

### Cache

Caffeine — 피드 / 트렌딩.

## 핵심 요소 (Element)

### Kotlin 2.2

언어.

### JDK 21

런타임.

### Spring Boot 4.0

프레임워크.

### Spring Security

보안 + JWT 검증.

### PostgreSQL 17

1 차 진실원.

### Flyway V1~V13

schema migration.

### Kotlin JDSL 3.5

타입 세이프 JPQL DSL.

### Resilience4j

회로 차단 / 재시도.

### Caffeine

in-memory cache.

### Kotest

테스트 프레임워크.

### Testcontainers

통합 테스트 — 실 DB.

### ArchUnit

아키텍처 테스트.

### ktlint + detekt

린트.

### Gradle 8.14 (Kotlin DSL)

빌드.

## 의존 (Dependencies)

aslan-iam 의 RS256 JWT 발급 (iam-client ACL 로 격리). Paravel-App 의
백엔드.
