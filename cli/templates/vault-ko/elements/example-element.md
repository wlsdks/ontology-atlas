---
slug: elements/example-element
kind: element
title: Example element
display_ko: 예시 구성요소
display_en: Example element
domain: domains/example-domain
---

# 예시 구성요소

*요소*는 역량이 쓰는 더 작은 단위입니다(jwt-token, otp-store,
indexeddb-adapter, sigma-canvas, …). 이 파일을 실제 요소 이름으로 바꾸고
(`elements/jwt-token.md`) `domain:` 을 알맞은 상위로 지정하세요.

## 어떻게 채우나

- 본문 한두 문단으로 *무엇을 / 왜 / 어떤 인터페이스인지* 를 적습니다.
- frontmatter 키:
  - `domain: <slug>` — 상위 도메인 하나
  - `path: <src/...>` — 이 요소가 대응하는 코드 경로(선택)
  - `depends_on: [...]` — 이 요소가 기대는 다른 요소/역량
  - `relates: [...]` — 느슨한 연관 참조(선택)
