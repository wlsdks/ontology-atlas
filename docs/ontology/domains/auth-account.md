---
slug: domains/auth-account
kind: domain
title: Auth & Account (Optional)
capabilities:
  - firebase-email-password
  - firebase-google-oauth
  - account-settings
  - password-reset
elements:
  - src/features/user-auth
  - src/views/login
  - src/views/signup
  - src/views/password-reset
  - src/views/account-settings
relates:
  - domains/mode-aware-adapters
---

# Auth & Account

옵션 layer. Firebase Auth (email/password + Google OAuth) 만. cloud 모드 전환 또는
sync 가 필요할 때만 사용. local-first 흐름은 비로그인 default. 자세한 룰:
`.claude/rules/auth.md`.
