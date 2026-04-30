---
title: 샌드박스 문서 랩 구조 결정
kind: adr
projectIds:
  - sandbox-docs-lab
  - sandbox-core
domain: knowledge
capabilities:
  - 문서 저장
  - 추출 재생성
elements:
  - 스토리지 원문
  - 버전 메타
  - 추출 결과
relates:
  - agent-runtime-spec
  - console-runbook
---

# 결정

문서 랩은 raw markdown를 스토리지에 저장하고, Firestore에는 기준 버전과 추출 상태만 둔다.

# 이유

- 버전 비교 비용을 낮출 수 있다.
- 큰 문서를 다룰 때 Firestore 크기 제한을 피할 수 있다.
- 추후 관계형 저장소로 옮겨도 문서 원문 경계가 유지된다.

# 결과

- 문서 메타와 결과 데이터는 분리 저장한다.
- 추출 결과는 재생성 가능해야 한다.

# 구성 요소

- 스토리지 원문
- 버전 메타
- 추출 결과
