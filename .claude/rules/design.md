# Design system rules

> Auto-loaded. Single source of truth for tokens / motion / forbidden visual patterns: `@docs/DESIGN-SYSTEM.md`.

## 디자인 헌장 (요약)

- **Linear 베이스**. 무채색 + 단일 인디고 (`#5e6ad2`) 라는 극단적 제약으로 AI 생성 UI 클리셰 차단.
- 채색은 **인디고 하나**. 신호 톤 (경고 amber `rgba(255,179,71,*)`, 에러 red `rgba(229,72,77,*)`) 만 예외.
- Hub 노드와 Layer 0 컨테이너에만 보조 톤 (앰버 `#d4b478`) 허용. Hub 와 Container 는 같은 뷰에 동시에 나오지 않는다.
- ontology kind 색상은 예외적으로 허용하지만 data mark 로만 쓴다. graph fill 은 작은 점의 3:1 대비를 위해 선명할 수 있고, panel/card 에서는 neutral surface + compact marker/swatch + label/icon 으로 낮춘다. detail card 내부의 full-height colored rail 은 AI SaaS callout 처럼 읽히므로 금지한다.
- 카테고리 구분은 **색이 아닌 보더 스타일** (작업중: 인디고 underline, 예정: dashed).

## 절대 하지 말 것

- 보라 → 핑크 그라디언트
- glassmorphism / `backdrop-blur`
- glow pulse · neon
- glow-like `boxShadow: \`0 0 ...\`` ring
- 움직이는 그라디언트 배경 · 오로라
- scale 기반 hover (`hover:scale-*`)
- 둘 이상의 채색 시스템

## 토큰 사용

- 모든 색은 CSS 변수 (`--color-canvas`, `--color-panel`, `--color-divider` …) 를 통해 참조. hardcoded hex 금지.
- 배경 / 텍스트 / 보더는 다음 5단계 안에서만:
  - `var(--color-canvas)` · `var(--color-panel)` · `var(--color-elevated)` · `var(--color-secondary-surface)`
  - 텍스트: `--color-text-primary` ↘ `quaternary`
- alpha 는 `--color-overlay-1/2/3`, `--color-divider`, `--color-border-soft/strong` 로 받는다.

## 모션

- transition 은 `transition-colors`, `transition-opacity` 위주. transform 은 최소.
- duration 200ms 미만이 default. 더 길어야 하면 의도가 분명해야.
- `prefers-reduced-motion` 사용자 존중 — `app/globals.css` 의 base layer 에 이미 처리.

## 라이트 / 다크 모드

- `html[data-theme="light"]` 토글로 전환. 기본 다크.
- 토큰은 양쪽 호환. light 전용 분기 코드 새로 만들지 말 것.
- 라이트 모드 작업은 한 사이클에 한 번에 — 부분 마이그레이션이 alpha 토큰 회귀를 만들어왔다.

## 토큰 정의 위치

`app/globals.css` 의 `@theme` + `:root` 블록. Tailwind v4 가 alpha 토큰을 utility 만 만들고 `:root` 에 emit 안 하는 경우가 있어 alpha 토큰은 `:root` 에도 명시 선언.
