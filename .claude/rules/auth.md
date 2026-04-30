# Authentication rules

> Auto-loaded.

## 허용된 인증 수단

오직 두 가지:

1. **Firebase Auth — email / password**
2. **Firebase Auth — Google OAuth (popup)**

이 두 가지만 코드에 존재하고, 그 외 인증 흐름은 모두 제거됐다.

## 명시적으로 금지

- 외부 IAM 연동 (자체 호스팅 IAM 서버, JWT 발급기관 등) — `NEXT_PUBLIC_IAM_BASE_URL` 같은 env 변수 도입 금지.
- Magic link / OTP / SMS — v2 협업 단계 전엔 도입하지 않는다.
- 데모 viewer 자동 로그인 — 기능적으로 유지하되 새 데모 모드 추가 금지.

## 정책

- **로그인은 옵션**. 로컬-first 원칙 (`@.claude/rules/local-first.md`) 에 따라 비로그인 흐름이 default. 로그인은 server sync / 공유 / 협업이 필요할 때만 요구.
- 사용자 데이터는 최소만 저장 — email · displayName · uid · createdAt · 로그인 provider. 그 외 프로필 데이터는 v2 까지 미룬다.
- 로그인된 사용자도 자기 데이터만 만진다. cross-account 권한 모델은 단순 `accounts/{aid}/members/{uid}` membership 외 도입 금지.

## 보안 가드

- API key / service account 는 서버 (`functions/`) 에서만 사용. client 코드에 노출 금지.
- Firestore rules 가 1차 권한 게이트. client-only 권한 체크는 UX 보조 — 서버 측 룰을 항상 같이 기르라.
- 비밀번호 재설정 / 변경은 Firebase Auth API 로만. 자체 password 저장 금지.
- session token 은 Firebase Auth 의 ID token 만. localStorage 에 jwt 저장 금지 (Firebase SDK 가 알아서 안전하게 처리).

## 코드 위치

- `src/features/user-auth/` — Firebase Auth wrapper (signIn, signUp, signOut, getCurrentAuthProfile, getPasswordSupportState)
- `src/views/login`, `src/views/signup`, `src/views/password-reset`, `src/views/account-settings` — 인증 surface
- `app/login`, `app/signup`, `app/reset-password`, `app/account` — 라우트
- `functions/` — 서버 측 권한 검증

새 인증 흐름을 추가할 때는 위 위치 외에 새로 만들지 말고, 기존 모듈을 확장하라.
