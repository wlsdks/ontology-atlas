---
id: aslan-iam
kind: project
project: aslan-iam
title: Aslan IAM
version: 1
---

# Aslan IAM

Aslan 플랫폼의 Identity & Access Management 서비스. JWT 토큰 발급의
유일한 권한, 타 서비스는 공개키로 로컬 검증만 수행. Kotlin + Spring
Boot 3.3 + 헥사고날 멀티모듈.

## 도메인 (Domain)

### 인증 (Authentication)

회원가입 / 로그인 / 토큰 갱신 / 로그아웃 / 비밀번호 변경. 공개 RSA
공개키 노출, 타 서비스 로컬 검증.

### 인가 (Authorization)

ROLE_ADMIN / ROLE_USER 권한 모델. 관리자 API (port 8081) 는 모두
ROLE_ADMIN + JWT 인증 필수.

### 다요소 인증 (2FA)

TOTP 기반 2FA 설정·활성화·비활성화. iam-infra 의 TOTP 어댑터.

## 기능 (Capability)

### 사용자 API (User API)

`iam-api` (port 8080). public 엔드포인트 (register / login / refresh /
public-key) + bearer 인증 (logout / change-password / 2FA).

### 관리자 API (Admin API)

`iam-admin-api` (port 8081). ROLE_ADMIN 만, RFC 7807 problem+json. 사용자
목록 / 상세 / 활성화 토글.

### JWT 발급기 (JWT Issuer)

iam-infra 의 RSA 키 페어 기반 토큰 발급. 만료 / refresh / blacklist.

### Refresh 토큰 저장소

iam-infra-redis. Redis 7 에 refresh token 저장 + rate limit.

### 헥사고날 어댑터 (Hexagonal Adapters)

iam-infra-rdb (JPA/PostgreSQL/Flyway), iam-infra-redis, iam-infra
(JWT/TOTP/BCrypt/AES) — 모두 도메인이 정의한 port 를 구현.

### 보안 필터 (JwtAuthenticationFilter)

iam-common/security 가 모든 인증 endpoint 의 JWT 헤더 검증.

## 핵심 요소 (Element)

### Spring Boot 3.3

iam-api / iam-admin-api 의 Spring Boot 멀티 모듈 부트.

### PostgreSQL 15

iam-infra-rdb 의 1 차 진실원 — 사용자 / role / 비밀번호 history.

### Redis 7

iam-infra-redis — refresh token + rate limit.

### Flyway

iam-infra-rdb 의 schema migration. version 별 immutable.

### BCrypt

iam-infra 의 PasswordEncoderAdapter. 비밀번호 hash + history 검증.

### TOTP

iam-infra 의 TOTP 어댑터 — 2FA 시드.

## 의존 (Dependencies)

iam-domain 은 외부 의존성 0. iam-application 은 iam-domain 만 의존.
infra 모듈들은 application 의 port 를 구현. iam-api 는 모든 모듈을
조립해 Spring Boot 진입.
