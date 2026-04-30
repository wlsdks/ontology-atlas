---
title: Design System
tags: [design, ux, linear, overview]
---

# Design System

> 이 문서는 설계 문서 섹션 3을 기반으로 유지된다. Linear 원본 사양은 [`design-references/DESIGN-linear.md`](design-references/DESIGN-linear.md)를 참고.

## 선택 이유

Linear의 "어둠에서 떠오르는 별빛" 미학이 토폴로지의 별자리 메타포와 정확히 일치. 흑백 + 단일 인디고 악센트라는 극단적 제약이 **AI 생성 클리셰를 배제하는 최상의 방어책**이다. 허브 노드(IAM/Reactor)를 인디고로 표현하면 시스템에서 유일한 채색이 되어 시각적 중심이 자연스럽게 형성된다.

## 디자인 토큰

Tailwind 4의 CSS 기반 `@theme`로 정의. 실제 구현은 `app/globals.css`를 본다.

### 배경

- `--color-canvas`: `#08090a`
- `--color-panel`: `#0f1011`
- `--color-elevated`: `#191a1b`
- `--color-secondary-surface`: `#28282c`

### 텍스트

- `--color-text-primary`: `#f7f8f8`
- `--color-text-secondary`: `#d0d6e0`
- `--color-text-tertiary`: `#8a8f98`
- `--color-text-quaternary`: `#62666d`

### 악센트 (유일한 채색)

- `--color-indigo-brand`: `#5e6ad2`
- `--color-indigo-accent`: `#7170ff`
- `--color-indigo-hover`: `#828fff`

### 보더

- `rgba(255,255,255,0.05)` — subtle
- `rgba(255,255,255,0.08)` — default
- `rgba(255,255,255,0.12)` — strong

### 타이포

- Primary: `Inter Variable` (OpenType `"cv01", "ss03"` 전역)
- Signature weight: `510` (Linear 고유)
- Mono: `JetBrains Mono`

## 카테고리 구분 전략

색이 아닌 **보더 스타일**로 구분 — 유일한 채색(인디고)은 허브 노드에 양보:

| 카테고리           | 표식                           |
| ------------------ | ------------------------------ |
| 작업중             | 인디고 언더라인                |
| 예정               | dashed 보더                    |
| 허브 (IAM/Reactor) | 인디고 배경·보더 (유일한 채색) |

## 절대 규칙 (Don'ts)

- ❌ 보라→핑크 그라디언트
- ❌ glassmorphism (`backdrop-blur`)
- ❌ glow pulse / neon 효과
- ❌ 움직이는 그라디언트 배경 / 오로라
- ❌ scale 기반 호버 효과
- ❌ 둘 이상의 채색 시스템

## 모션 원칙

- 초기 로드: `opacity 0 → 1` + `translateY 8px → 0` (스프링)
- 호버: 보더 opacity 상승, 연결 엣지 밝기 증가 — scale·glow 금지
- 드로어: 우측 `x: 100% → 0` 스프링
- 필터 토글: 비선택 카테고리 `opacity 0.15`
- 배경: 완전 정적
- `prefers-reduced-motion` 존중

## 페이지 헤더 — 영문 caption + 한글 h1

각 운영 페이지 (ontology / knowledge / review / settings 등) 의 헤더는
**두 라인 패턴**을 따른다. 사용자 facing 한글이 본 제목이고, 영문 카테고리
caption 은 micro 식별자로 시각 위계를 한 단계 양보한다.

### 패턴

```
[영문 카테고리 caption — 9~10px / mono / uppercase / tracking 0.14em / quaternary 색]
[한글 h1 — text-2xl / signature weight / primary 색]
[보조 설명 — 한글 / sm / secondary 색 (옵션)]
```

예: `/ontology` 페이지

```tsx
<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-text-quaternary)]">
  Ontology
</p>
<h1 className="text-2xl font-[var(--font-weight-signature)]">
  온톨로지 트리
</h1>
<p className="text-sm leading-7 text-[color:var(--color-text-secondary)]">
  승인된 노드와 관계를 …
</p>
```

### 의도

- **영문 caption** — 페이지의 카테고리 영역 식별자. 빠른 시선 인식 (모노+
  대문자+간격) 으로 "어디에 있는지" 알리되, 본 제목보다 약하게 표시해
  한국어 h1 이 가장 읽힘.
- **한글 h1** — 사용자가 실제로 부르는 이름. 한글이 본 제목이라 모든 본문
  / 설명 / CTA 가 한글 일관 톤.
- **두 라인 분리** — 한 줄에 영문/한글 섞기 (예: "온톨로지 Ontology") 는
  금지. 각 라인이 한 언어로 단일 톤을 유지.

### 합법 영문 caption 사례

- 페이지 카테고리: `Ontology`, `Knowledge`, `Review`, `Settings`,
  `Diagnostics`, `Account`, `Workspace`, `Manual node`, `Get started`.
- 시스템 메타: `ID 추천`, `Beta` 등 — 의도된 영문 식별자만. 문장형 영문은
  금지 (한글로 번역).

### 일관성 규칙

- caption 의 폰트 크기는 `9px ~ 10px` 범위. tracking 은 `0.10em ~ 0.18em`.
- 한 페이지 안에서 동일 caption 토큰 (mono / uppercase / tracking / 색) 을
  유지. 시스템 토큰은 추후 `--font-caption-mono` 같은 CSS var 로 통일 예정.
- 영문 caption 은 페이지 한 곳 (top header) 만 사용. 본문 안에 영문
  카테고리 라벨을 또 넣지 않는다 — 시각 위계 이중화 차단.

### 적용 surface (현재)

`/ontology`, `/ontology/insights`, `/ontology/relations`, `/knowledge`,
`/knowledge/documents`, `/knowledge/documents/new`, `/review/knowledge`,
`/settings/*`, `/diagnostics/insights`, `/account` — 모두 같은 패턴.

`/`, `/projects`, `/project/[slug]` 의 공개 surface 는 사용자가 한국어로
브라우징 — 영문 caption 없이 한글 h1 단독.

## 변경 이력

- 2026-04-13: 컨설팅 카테고리 제거
- 2026-04-12: 초기 작성 (Phase 0)
