---
slug: capabilities/example-capability
kind: capability
title: Example capability
display_ko: 예시 기능
display_en: Example capability
domain: domains/example-domain
elements:
  - elements/example-element
---

# 예시 기능

*역량*은 현재 모듈이나 프레임워크를 전제로 하지 않고 제품·운영자·에이전트·의존
시스템이 수행할 수 있는 관찰 가능한 능력입니다. 컴포넌트, 패키지, UI 화면,
명령, 워크플로 단계, README 제목은 독립된 능력 주장이 없으면 역량이 아닙니다.

kind와 관계 정본:
https://github.com/wlsdks/ontology-atlas/blob/main/docs/ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind

## 어떻게 채우나

- 관찰 가능한 결과와 경계, 수용 시나리오 한두 개를 적은 뒤 파일 이름과
  `domain:` / `elements:`를 고칩니다.
- frontmatter 키:
  - `domain: <slug>` — 상위 도메인 하나
  - `elements: [...]` — 이 역량이 쓰는 요소의 slug
  - `depends_on: [...]` — 이 역량이 기대는 다른 역량
  - `relates: [...]` — 느슨한 연관 참조(선택)
