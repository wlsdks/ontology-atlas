# Design system rules

> Auto-loaded. Single source of truth for tokens / motion / forbidden visual patterns: `@docs/DESIGN-SYSTEM.md`.

## 디자인 헌장 (요약)

- **Linear 베이스**. 무채색 + 단일 인디고 (`#5e6ad2`) 라는 극단적 제약으로 AI 생성 UI 클리셰 차단.
- 채색은 **인디고 하나**. 신호 톤 (경고 amber `rgba(255,179,71,*)`, 에러 red `rgba(229,72,77,*)`) 만 예외.
- Hub 노드와 Layer 0 컨테이너에만 보조 톤 (앰버 `#d4b478`) 허용. Hub 와 Container 는 같은 뷰에 동시에 나오지 않는다.
- ontology kind 색상은 예외적으로 허용하지만 data mark 로만 쓴다. graph fill 은 작은 점의 3:1 대비를 위해 선명할 수 있고, panel/card 에서는 neutral surface + compact marker/swatch + label/icon 으로 낮춘다. detail card 내부의 full-height colored rail 은 AI SaaS callout 처럼 읽히므로 금지한다.
- 카테고리 구분은 **색이 아닌 보더 스타일** (작업중: 인디고 underline, 예정: dashed).

## 토폴로지 노드 포커스 & 스케일

> 전체 설계 + 인용 출처: `@docs/TOPOLOGY-FOCUS-AND-SCALE.md`. 근거 원칙은
> Shneiderman 의 *overview first, zoom and filter, details-on-demand* (1996).

- **노드 클릭 = ego 포커스 + 컴팩트 팝오버.** 클릭 노드와 직접 이웃(ego)만
  full opacity, 나머지는 dim(`opacity 0.15`)/hide (Sigma `nodeReducer` /
  `edgeReducer`, 그래프 인스턴스는 미변경). 팝오버는 노드 옆에 앵커, 내용
  크기로만. **풀스크린/풀블리드 상세 모달은 클릭 default 로 쓰지 않는다** —
  기존 `NodeDetailPanel` 전체 상세는 팝오버의 `전체 상세 →` opt-in 으로만.
- **기본 뷰 = overview-first.** 전체 2~3k 노드를 한 번에 쏟지 않는다. level 0 =
  project + domain + hub 만, 나머지는 클릭 시 expand (semantic zoom).
- **전문용어는 평문으로.** `영향받음 N` → "이 노드를 쓰는 곳 N", `의존 N` →
  "이 노드가 기대는 곳 N". 라벨 중복(`개념 정보` 3회) 금지.
- **스케일 성능 순서:** 레이아웃 precompute/캐시 → LOD 라벨
  (`hideLabelsOnMove`/`hideEdgesOnMove`) → 엣지 컬링 유지 → 5k+ 도메인 클러스터링.

## 절대 하지 말 것

- 토폴로지 노드 클릭 → 풀스크린/풀블리드 상세 모달 (ego 팝오버 + focus 로 대체, 상세는 opt-in)
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
