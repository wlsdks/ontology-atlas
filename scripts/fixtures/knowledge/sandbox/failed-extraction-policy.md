---
title: 샌드박스 실패 추출 대응 정책
kind: policy
projectIds:
  - sandbox-observer
  - sandbox-agent-runner
domain: operations
capabilities:
  - 실패 대응
  - 원인 분석
elements:
  - 실패 코드
  - 실패 메시지
  - 운영자 메모
relates:
  - console-runbook
  - agent-runtime-spec
---

# 정책

실패한 추출은 즉시 다시 실행하지 않고, 원문 문서와 최근 변경 내역을 먼저 검토한다.

# 강제 실패 테스트

<!-- fail-extraction -->

# 점검 항목

- 실패 코드
- 실패 메시지
- 최근 버전 해시
- 운영자 메모
