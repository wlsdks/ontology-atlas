# Design system rules

> Auto-loaded. Single source of truth for tokens / motion / forbidden visual patterns: `@docs/DESIGN-SYSTEM.md`.

## 스케일 고정 계약 (2026-07-24 소유자 확정 — 이탈은 결함)

- 크롬 필/타일 **36px**(`--chrome-tile-size`) · 크롬 라벨 **`text-label`(11px)**
- 레일 아이콘 **20px 단일**(`--app-nav-rail-icon-size`, 로고만 26)
- **≥1920 zoom 금지**(1:1), 2400+만 1.1 — 비정수 zoom 은 폰트 래스터 왜곡
- 본문 폰트 **Pretendard Variable** 셀프호스팅 (Inter 폐기 — latin 서브셋 한글 혼합 사고)
- 타입 램프 스텝을 새로 만들면 `src/shared/lib/cn.ts` 의 `TYPE_RAMP_STEPS` 에
  **반드시 등록** — 미등록 스텝은 tailwind-merge 가 색상으로 오분류해 크기를
  조용히 드롭한다 (2026-07-23 크롬 16px 렌더 사고, `cn.test.ts` 가드).
- 루트 16px 상속으로 렌더되는 텍스트 = 램프 미적용 결함. 상세 표:
  `docs/DESIGN-SYSTEM.md` "스케일 고정 계약" 절.

## 디자인 헌장 (요약)

- **Linear 베이스**. 무채색 + 단일 인디고 (`#5e6ad2`) 라는 극단적 제약으로 AI 생성 UI 클리셰 차단.
- 채색은 **인디고 하나**. **신호 톤은 3종이다: warning(amber) · error(red) · success(emerald)** — 각 신호는 solid dot + surface/border/text 알파 사다리를 대칭으로 갖는다 (Design Guardian verdict, `.qa-scratch/audit-2026-07/guardian-color-verdict.md` §①, 2026-07-20). success 는 "연결됨 / 쓰기 확인 / 완료" 같은 긍정 상태 신호에만 쓴다 — 확장 금지, 기존 리터럴 토큰화까지만. 장식적 green, 성공과 무관한 green 은 금지. 상세: `docs/DESIGN-SYSTEM.md` "Signal tones" 절.
- Hub 노드와 Layer 0 컨테이너에만 보조 톤 (앰버 `#d4b478`) 허용. v2 스파인
  뷰에서는 **단일 hub 링 + Layer 0 컨테이너 1개**의 공존까지가 승인 범위다
  (2026-07 소유자 라이브 테스트 + Guardian 검증 통과 설계 — 구 "동시 금지"
  문구는 v2 이전 뷰 기준이라 현행화). 그 외 노드/표면으로의 앰버 확장은
  여전히 금지 — 앰버가 셋 이상 보이면 결함이다. **명문화된 예외 2건**:
  ① 에이전트 포커스 링(W6 — heartbeat 실데이터 1노드), ② **최근 변경
  스포트라이트 렌즈 ON(`?recent=`) 동안 변경-노드 회전 파선 링**(소유자
  지시 2026-07-23 + Guardian 모션 검수 승인 — 명시적 모드 한정이라 상시
  앰버 확장이 아니며, 렌즈 off 시 램프로 소멸). 그 외 앰버는 여전히 결함. (docs 표면의 장식적 gold 악센트는 별개의 `--color-amber-docs-*` **quarantine 토큰** — 헌장 승인 아님, 확장 금지, 후속 강등 검토 대기.)
- ontology kind 색상은 예외적으로 허용하지만 data mark 로만 쓴다. graph fill 은 작은 점의 3:1 대비를 위해 선명할 수 있고, panel/card 에서는 neutral surface + compact marker/swatch + label/icon 으로 낮춘다. detail card 내부의 full-height colored rail 은 AI SaaS callout 처럼 읽히므로 금지한다.
- 카테고리 구분은 **색이 아닌 보더 스타일** (작업중: 인디고 underline, 예정: dashed).
- **선택 색 사다리**: 노드 선택 = 표준 인디고(#5e6ad2), 엣지 선택(페어
  포커스) = pale 인디고(`--topology-v2-edge-selected`, rgba(200,210,255)) —
  같은 인디고 1계열 안에서 값으로만 구분한다. 새 hue 로의 확장 금지.

## 토폴로지 노드 포커스 & 스케일

> 전체 설계 + 인용 출처: `@docs/TOPOLOGY-FOCUS-AND-SCALE.md`. 근거 원칙은
> Shneiderman 의 *overview first, zoom and filter, details-on-demand* (1996).

- **노드 클릭 = ego 포커스 + 컴팩트 팝오버.** 클릭 노드와 직접 이웃(ego)만
  full opacity, 나머지는 dim(`opacity 0.15`)/hide — 렌더러별 메커니즘 (캔버스
  엔진: per-frame alpha 재계산, SVG 엔진: ego state prop), 원본 그래프
  데이터는 미변경. 팝오버는 노드 옆에 앵커, 내용
  크기로만. **풀스크린/풀블리드 상세 모달은 클릭 default 로 쓰지 않는다** —
  기존 `NodeDetailPanel` 전체 상세는 팝오버의 `전체 상세 →` opt-in 으로만.
- **기본 뷰 = overview-first.** 전체 2~3k 노드를 한 번에 쏟지 않는다. level 0 =
  project + domain + hub 만, 나머지는 클릭 시 expand (semantic zoom).
- **전문용어는 평문으로.** `영향받음 N` → "이 노드를 쓰는 곳 N", `의존 N` →
  "이 노드가 기대는 곳 N". 라벨 중복(`개념 정보` 3회) 금지.
- **스케일 성능 순서:** 레이아웃 precompute/캐시 → LOD 라벨
  (`hideLabelsOnMove`/`hideEdgesOnMove`) → 엣지 컬링 유지 → 5k+ 도메인 클러스터링.

## [강등됨 2026-07-24] 구 온톨로지 스튜디오 게임 예외 — 폐기

`/ontology/studio` 는 한때 노드를 게임 아이템으로 다루며 glow·gradient·aura·
particle·rarity(gold)·shimmer 를 `--studio-*` 토큰 + `.studio-stage` 안에서
허용하는 **스코프 예외**였다. 이 예외는 **폐기됐다** — fable 판정 B + 소유자
확정(2026-07-24). "게임처럼 중독되게" 는 은유였지 사양이 아니었고, 절제가
정체성인 앱에서 게임 미학은 "완성된 게임" 이 아니라 "코스프레" 로 읽히며,
의사결정 자료(기획자·임원·개발자·에이전트가 보는)의 신뢰를 갉아먹었다.

- 스튜디오는 이제 절제된 **나침 무대(Compass Stage)** 다 — 관계 종류별 고정
  방위 + 라인아트 소켓 + 인디고 프로그레스 + 200ms opacity/color 확정 모션.
  **앱 전역과 동일한 헌장** (무채색 + 단일 인디고 + `--color-*` 토큰)만 쓴다.
- **glow/rarity/particle/gem 은 스튜디오에서도 금지.** `--studio-*` 게임 토큰
  블록은 `app/globals.css` 에서 제거됐다. amber 는 "빈(강하게 기대되는) 소켓"
  신호로만.
- design-guardian 은 이제 스튜디오 표면에서도 glow/rarity/particle 을 **반려**한다.
- 배경 + KEEP/KILL/BUILD: `[[ontology-studio-game-direction]]`. 중독은 파티클이
  아니라 루프(다음 할 일 → 즉시 반영 → 진전 누적)에서 온다.

## 절대 하지 말 것

> 아래 금지는 앱 전역에 유효하다 — **스튜디오 포함, 예외 없음** (구 게임 예외는
> 위에서 강등됨).

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
- Relief/Topology panel width, surface, border, shadow, radius, padding, camera/focus/panel/drag motion 은 `--topology-*` 토큰을 우선 사용한다. JSX 안에 새 `clamp(...)`, shadow, easing, duration 을 추가해야 한다면 먼저 token name, product reason, WebView/test marker 를 같이 만든다.
- **터치/태블릿 계약 (2026-07-23)** — 터치 타깃은 `@media (pointer: coarse)` + `--touch-target-min`(44px) 단일 출처로 승격한다(폭 브레이크포인트로 터치를 추정하지 말 것). BottomTabBar 가 있는 `<lg` 에서 하단 앵커/스크롤 끝 표면은 `--topology-mobile-bottom-tab-reserve` 를 반드시 계약 — "탭바 뒤로 가려짐"은 결함이다. 상세: `docs/DESIGN-SYSTEM.md` "Touch & tablet responsive contract".
- Relief/Topology 에서 stacked floating panels, popup soup, tokenless positioning, modal without modality, drag-only discovery 는 ship 금지. composer/modal 은 dim/scrim 또는 blocked interaction 을 증명해야 하고, transient surface 는 unrelated surface 를 닫거나 demote 해야 한다.
- Design Guardian verdict 없이 meaningful UI 변경을 ship 하지 않는다. 최소 verdict 는 attention winner, typed fact, token contract, motion state, screenshot/WebView evidence, installed-app proof 필요 여부를 포함한다.

## 모션

- transition 은 `transition-colors`, `transition-opacity` 위주. transform 은 최소.
- duration 200ms 미만이 default. 더 길어야 하면 의도가 분명해야.
- `prefers-reduced-motion` 사용자 존중 — `app/globals.css` 의 base layer 에 이미 처리.

## 다크 단일 (2026-07-19, 라이트 모드 전면 폐기)

- 앱은 **다크 단일**이다. 라이트 모드 토글, `data-theme` 속성, `theme-toggle`
  기능, 라이트 전용 토큰/CSS 분기는 모두 제거됐다 — 소유자 전략 결정.
- 새 UI 는 다크 값만 정의한다. `[data-theme="light"]` 셀렉터, light 전용
  분기 코드, 라이트 대비 검증을 새로 만들지 말 것.
- `prefers-color-scheme` 대응도 다크 고정 — 시스템 라이트 선호 사용자에게도
  다크를 보여준다 (`app/layout.tsx` `viewport.colorScheme: 'dark'`).

## 토큰 정의 위치

`app/globals.css` 의 `@theme` + `:root` 블록. Tailwind v4 가 alpha 토큰을 utility 만 만들고 `:root` 에 emit 안 하는 경우가 있어 alpha 토큰은 `:root` 에도 명시 선언.
