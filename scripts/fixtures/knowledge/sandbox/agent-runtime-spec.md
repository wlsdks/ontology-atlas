---
title: 샌드박스 에이전트 러너 명세
kind: spec
projectIds:
  - sandbox-agent-runner
  - sandbox-docs-lab
domain: execution
capabilities:
  - 작업 실행
  - 상태 기록
elements:
  - 내부 큐
  - 실행 워커
  - 결과 기록기
relates:
  - sandbox-auth-gateway
  - sandbox-observer
---

# 개요

샌드박스 에이전트 러너는 문서 기반 작업을 받아 내부 큐로 전달하고, 처리 상태를 다시 운영 화면에 기록한다.

# 입력

- 문서 ID
- 버전 ID
- 실행자 이메일

# 기능

- 작업 실행
- 상태 기록

# 구성 요소

- 내부 큐
- 실행 워커
- 결과 기록기

# 출력

- 처리 결과 요약
- 노드 수
- 연결 수
- 경고 수

# 구현 메모

- 인증 게이트웨이가 유효하지 않으면 작업을 시작하지 않는다.
- 실패한 작업은 원인을 남기고 재시도 가능 여부를 같이 기록한다.
