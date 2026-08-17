---
slug: domains/example-domain
kind: domain
title: Example domain
display_ko: 예시 영역
display_en: Example domain
capabilities:
  - capabilities/example-capability
elements:
  - elements/example-element
---

# 예시 영역

*도메인*은 구현을 다시 써도 남을 만큼 지속적인 책임·문제·어휘·소유권 경계이며,
서로 응집된 역량을 묶습니다. 소스/패키지 폴더, 팀, 기술, 생명주기 단계, 워크플로
이름은 조사할 근거일 뿐 그 자체로 도메인이 아닙니다.

kind와 관계 정본:
https://github.com/wlsdks/ontology-atlas/blob/main/docs/ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind

## 어떻게 채우나

- 이 도메인이 맡는 책임, 경계 안과 밖, 그 의미를 뒷받침하는 근거를 적습니다.
- 이 판별을 통과한 뒤에만 실제 도메인 이름으로 바꿉니다
  (`domains/identity.md`, `domains/billing.md`, …).
- 본문에서 다른 도메인/역량으로 거는 마크다운 링크는 자동으로 역참조(backlink)
  로 잡힙니다.
- frontmatter 키:
  - `capabilities: [...]` — 이 도메인이 가진 역량의 slug
  - `depends_on: [...]` — 이 도메인이 기대는 다른 도메인이나 외부 시스템
  - `relates: [...]` — 느슨한 연관 참조(선택)

## 남길까, 지울까?

- 남긴다: 위 안내대로 채웁니다.
- 필요 없다: 그냥 이 파일을 지우세요 — 스타터일 뿐입니다.
