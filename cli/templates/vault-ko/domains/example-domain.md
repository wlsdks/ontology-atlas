---
slug: domains/example-domain
kind: domain
title: Example domain
display_ko: 예시 영역
display_en: Example domain
capabilities:
  - capabilities/example-capability
---

# 예시 영역

*도메인*은 프로젝트의 큰 영역입니다(인증, 결제, 빌더, 실시간, 검색 같은
하위 시스템). 이 파일을 실제 도메인 이름으로 바꾸고
(`domains/auth.md`, `domains/billing.md`, …) 위 frontmatter 의
`capabilities:` 에 이 도메인이 가진 역량을 적으세요.

## 어떻게 채우나

- 본문 한두 문단으로 *이 도메인이 무엇인지* 설명합니다.
- 본문에서 다른 도메인/역량으로 거는 마크다운 링크는 자동으로 역참조(backlink)
  로 잡힙니다.
- frontmatter 키:
  - `capabilities: [...]` — 이 도메인이 가진 역량의 slug
  - `depends_on: [...]` — 이 도메인이 기대는 다른 도메인이나 외부 시스템
  - `relates: [...]` — 느슨한 연관 참조(선택)

## 남길까, 지울까?

- 남긴다: 위 안내대로 채웁니다.
- 필요 없다: 그냥 이 파일을 지우세요 — 스타터일 뿐입니다.
