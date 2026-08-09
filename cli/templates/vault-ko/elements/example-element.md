---
slug: elements/example-element
kind: element
title: Example element
display_ko: 예시 구성요소
display_en: Example element
domain: domains/example-domain
---

# 예시 구성요소

*요소*는 역량을 실현하거나 증명하며 누군가 열어볼 수 있는 근거가 있는 독립된
구현 역할입니다. 경로, import edge, 의존성 이름은 근거일 뿐 그 자체로 개념이
아닙니다. 역할을 이름으로 쓰고 정본 저장소 상대 진입점은 `path:`에 적습니다.

kind와 관계 정본:
https://github.com/wlsdks/ontology-atlas/blob/main/docs/ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind

## 어떻게 채우나

- 어떤 역할을 맡고 어느 역량을 실현하거나 증명하며, 어느 경로나 인터페이스로
  그 주장을 확인할 수 있는지 적습니다.
- frontmatter 키:
  - `domain: <slug>` — 상위 도메인 하나
  - `path: <src/...>` — 이 요소가 대응하는 코드 경로(선택)
  - `depends_on: [...]` — 이 요소가 기대는 다른 요소/역량
  - `relates: [...]` — 느슨한 연관 참조(선택)
