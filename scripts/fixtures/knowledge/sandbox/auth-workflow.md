---
title: 샌드박스 인증 워크플로 문서
kind: workflow
projectIds:
  - sandbox-core
  - sandbox-console
domain: authentication
capabilities:
  - 로그인
  - 세션 발급
elements:
  - 로그인 버튼
  - 인증 게이트웨이
  - 세션 검사기
relates:
  - sandbox-auth-gateway
  - console-runbook
---

# 목적

샌드박스 계정에서 로그인 이후 운영 화면으로 진입하는 최소 흐름을 정리한다.

# 흐름

1. 사용자는 로그인 버튼을 누른다.
2. 인증 게이트웨이는 세션을 발급한다.
3. 콘솔은 세션 상태를 확인하고 대시보드를 렌더링한다.

# 기능

- 로그인
- 세션 발급

# 구성 요소

- 로그인 버튼
- 인증 게이트웨이
- 세션 검사기

# 주의사항

- 실패 시 다시 로그인 화면으로 보낸다.
- 세션이 만료되면 관리자 안내 배너를 먼저 보여준다.
