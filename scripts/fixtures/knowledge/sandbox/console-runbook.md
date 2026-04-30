---
title: 샌드박스 콘솔 운영 런북
kind: runbook
projectIds:
  - sandbox-console
  - sandbox-observer
domain: operations
capabilities:
  - 운영 점검
  - 실패 추적
elements:
  - 운영 메모
  - 실패 목록
relates:
  - failed-extraction-policy
  - auth-workflow
---

# 운영자 점검 순서

1. 최근 실패한 추출 작업이 있는지 확인한다.
2. 현재 기준 버전이 최신인지 확인한다.
3. 실패한 항목이 있으면 운영 메모를 남긴다.

# 운영 원칙

- 같은 오류가 반복되면 새 작업을 다시 만들기 전에 원문 문서를 점검한다.
- 결과 상세는 운영자에게만 보이게 한다.

# 구성 요소

- 운영 메모
- 실패 목록
