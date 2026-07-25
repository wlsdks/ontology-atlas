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

*역량*은 도메인 안에서 사용자가 할 수 있는 일 하나입니다(로그인, 가입, 결제,
검색, 빌더 캔버스, …). 이 파일을 실제 역량 이름으로 바꾸고
(`capabilities/login.md`, `capabilities/checkout.md`) 위의 `domain:` 과
`elements:` 키를 그에 맞게 고치세요.

## 어떻게 채우나

- 본문에 *이 역량이 무엇을 하는지* 와 사용자 시나리오 한두 개를 적습니다.
- frontmatter 키:
  - `domain: <slug>` — 상위 도메인 하나
  - `elements: [...]` — 이 역량이 쓰는 요소의 slug
  - `depends_on: [...]` — 이 역량이 기대는 다른 역량
  - `relates: [...]` — 느슨한 연관 참조(선택)
