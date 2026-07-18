---
title: Design System
tags: [design, ux, linear, circuit-constellation, overview]
---

# Design System

> This document is maintained based on Section 3 of the design spec. For the original Linear specification, see [`design-references/DESIGN-linear.md`](design-references/DESIGN-linear.md).
>
> **v2 (2026-07)**: topology-map-v2 에서 출하된 B2+ "Circuit × Constellation"
> 시각 언어가 페이지 롤아웃(랜딩 → docs/ontology 허브 → projects/insights →
> download)의 규범이 되었다 — 아래 *v2 — "Circuit × Constellation" (B2+) 시각
> 언어* 절 참조. v2 는 v1 헌장(무채색 + 단일 인디고 + 금지 패턴)을 **확장**하며
> 대체하지 않는다.

## Why this direction

`ontology-atlas` should feel like a compact graph workbench, not a documentation
portal with a graph attached. The visual direction is still restrained: dark or
light neutral surfaces, one indigo accent, dense but readable controls, and no
decorative gradients. The product value comes from moving between three modes
over the same local markdown graph:

- **Browse** — hierarchy, node detail, reachability, and ego graph.
- **Write** — builder canvas edits that write back to vault frontmatter.
- **Query** — graph DB-style scans, health checks, domain matrix, and path
  evidence.

The tree is therefore a browse mode, not the whole product identity. Headers,
cards, and navigation should point users from tree inspection into Builder and
Insights whenever the next action is writing or graph-level verification.

## v2 — "Circuit × Constellation" (B2+) 시각 언어

> 충실도 기준: `docs/prototypes/topology-b2plus.html` (owner 승인, 유일한
> fidelity source). 구현 기준: `src/widgets/topology-map-v2/` +
> `app/globals.css` 의 `--topology-v2-*` / `--topology-chrome-*` 토큰.
> 표현 아키텍처 전체는 [`TOPOLOGY-V2-DESIGN.md`](./TOPOLOGY-V2-DESIGN.md).
> 이 절은 그 언어를 topology 밖 페이지로 확장할 때의 **작업 규칙서**다 —
> 마케팅 산문이 아니다.

### v2 언어 정의 — 6개 축

1. **Machined surface (기계 가공 표면).** 모든 도형·카드는 1px 스트로크 +
   중립 fill tier 로 "깎아 만든 부품"처럼 읽힌다. 캔버스 노드는 monochrome
   세로 sheen(`--topology-v2-node-sheen-tint` + blend `0.6`) 하나만 허용 —
   far-field 에서 dissolve 되고, DOM 카드에는 sheen 을 흉내내지 않는다
   (장식 그라디언트 금지는 v1 그대로).
2. **Engraved mono numerals (음각 숫자).** 카운트·집계는 mono 서체로, 1px
   다크 그림자(`--topology-v2-numeral-shadow`) 위 밝은 면
   (`--topology-v2-numeral-face`) — 인쇄가 아니라 각인. 숫자는 항상 실제
   데이터(노드 수 · 관계 수 · census)를 가리킨다. 장식용 숫자 금지.
3. **Kind = shape, not color.** project=hex 플레이트 · domain=사각 칩
   (pin-tick) · capability=원 · element=pad+via(드릴 홀). kind 구분의 1차
   채널은 **형태**이고, 색은 fill/stroke 의 밝기 tier 차이만 미세하게 진다.
   panel/card 의 kind 미니어처는 캔버스와 같은 `--topology-v2-node-*` 토큰을
   재사용한다. 색으로 kind 를 구분하는 UI 로 되돌아가지 않는다.
4. **신호 = 상태 (전원/펄스).** 인디고는 "전원이 들어와 있음" — fresh 노드
   스트로크, powered dot(`--topology-v2-panel-power-on`), 활성 강조. comet
   pulse 는 "전류가 흐름" — `depends` 관계의 살아있는 traversal (ego 에서
   가속, `--topology-v2-edge-pulse-speed[-ego]`). stale 은 dashed 보더 +
   저채도 표면. 신호색이 상태를 설명하지 않으면 쓰지 않는다.
5. **Calm chrome / fluid canvas 경계.** 캔버스는 유체적 — 스프링 카메라,
   altitude crossfade(circuit ↔ constellation smoothstep), breathe. chrome
   (패널·레인·pill)은 정적 정밀 계기 — `--topology-chrome-*` 밀도(컨트롤
   32~36px, 아이콘 11~12px, 타이틀 12px, eyebrow 9px)로 1920 데스크톱에서
   터치 표면이 아니라 계측기로 읽힌다. 유체 모션은 캔버스 밖으로 새어나가지
   않는다.
6. **단일 인디고 + 단일 amber-hub 예외.** v1 헌장 그대로. amber
   (`--topology-v2-amber-hub`)는 허브 링 하나에만. cyan 등 제2 채색 도입은
   Guardian 반려 전례(cyan 제2채색 결함, TOPOLOGY-V2-DESIGN verdict a5)가
   있다 — 재시도 금지.

### v2 토큰 카탈로그 — tier 별

값의 진실원은 `app/globals.css` 하나. Canvas 2D 는 CSS 변수를 직접 못 읽으므로
`src/widgets/topology-map-v2/tokens/read-topology-v2-tokens.ts` 가
`getComputedStyle` 로 1회 해석·캐싱한다.

| Tier | 토큰 | 언제 쓰나 |
|---|---|---|
| **Surface (표면)** | `--topology-v2-canvas-bg-near/-far` · `--topology-v2-grid-minor/-major` · `--topology-v2-vignette-*-alpha` · `--topology-v2-node-fill-{project,domain,capability,element,dim,stale}` · `--topology-v2-node-hole-fill` · `--topology-v2-node-sheen-tint/-blend` · `--topology-v2-panel-surface/-border/-divider/-shadow/-row-hover/-metric-surface/-action-surface` | 배경·도형 몸통·패널 바탕. 새 표면이 필요하면 이 tier 에 토큰 추가 — JSX/캔버스에 hex 직접 금지 |
| **Stroke (스트로크)** | `--topology-v2-node-stroke-{project,domain,capability,element,dim,stale}` · `--topology-v2-edge-contains/-depends/-dim` · `--topology-v2-hull-stroke` · `--topology-v2-edge-contains-mark/-depends-mark` · `--topology-v2-panel-action-border` | 1px 기계 가공 윤곽 + 관계 trace 잉크. contains=실선, depends=점선 — 이 구분은 페이지 divider 에도 이식 가능 |
| **Text ladder (텍스트 사다리)** | `--topology-v2-label-{project,domain,capability,element}` · `--topology-v2-numeral-shadow/-face` · `--topology-v2-panel-text-{primary,secondary,tertiary,quaternary}` · `--topology-v2-panel-metric-text` | kind 가 낮을수록 어두워지는 4단 사다리. panel tertiary 는 10px AA 대비를 위해 `#868690` 로 넛지됨(Guardian follow-up #2) — 캔버스 값과 다른 이유가 있으니 임의 통일 금지 |
| **Signal (신호)** | `--topology-v2-indigo`(=`--color-indigo-brand`) · `--topology-v2-indigo-bright` · `--topology-v2-amber-hub` · `--topology-v2-panel-power-on/-off` | 전원/펄스/포커스/허브. 상태 설명 없는 신호색 금지 |
| **Density · geometry (밀도)** | `--topology-v2-radius-*` · `--topology-v2-layout-ring-*` · `--topology-v2-edge-bow/-blend-*` · `--topology-v2-star-count` · `--topology-v2-dust-area-per-point` · `--topology-v2-safe-inset-*` · `--topology-v2-panel-width/-pad/-gap/-radius/-row-radius` · `--topology-v2-label-max-width` | world-unit 숫자(단위 없음, canvas 소비)와 px(DOM 소비)가 섞여 있다 — 주석의 소비처 표기를 지켜라 |
| **INDEX 패널 geometry** (B3) | `--topology-index-width`(300px) · `--topology-index-tab-width`(26px) · `--topology-index-inset`(18px) · `--topology-index-top`(76px) | `TopologyIndexPanel`/`TopologyIndexTab` 전용 — px, DOM 전용(canvas 미소비). 표면/보더/그림자/패딩은 새로 만들지 않고 위 `--topology-v2-panel-*` (Surface tier) 재사용. `-top` 은 owner live-QA 결함 수정 — `topology-top-left-chrome-group` (Relief 브랜드 pill) 이 이미 top-32px 대를 쓰므로 INDEX/tab 은 그 아래(`TopologyAnalysisBar` 가 쓰던 동일 clearance)에서 시작 |
| **Motion** | `--topology-v2-camera-*`(spring/damping/momentum/flick/**-max-zoom-ratio**) · `--topology-v2-altitude-*-ratio` · `--topology-v2-overview-entry-ratio` · `--topology-v2-focus-*` · `--topology-v2-emphasis-*-tau` · `--topology-v2-ripple-stagger-ms` · `--topology-v2-breathe-*` · `--topology-v2-pulse-duration-ms` · `--topology-v2-tip-fade-ms` · `--topology-v2-edge-pulse-speed[-ego]` · `--topology-v2-drag-tug-1hop/-2hop` | 캔버스 유체성 전용. DOM chrome 은 기존 `--topology-motion-*` (180/420/720ms) 사용. `camera-max-zoom-ratio` 는 뷰포트-상대 실효 줌 상한(C1 A1), `drag-tug-1hop/-2hop` 은 노드 드래그 시 이웃 전파 계수(C1 B1). 다이브줌 fix: `camera-spring-angfreq` 가 `-interactive`(12, 휠 줌 스케일축+팬, 크리스프 0.40s)/`-transition`(4.7, 포커스 다이브·해제·재배치·fit-view, 시네마틱 1.0s)로 분리 — 이전 단일값(2.941)은 휠 줌마저 다이브만큼 느리게 느껴지게 했다. `focus-bbox-margin` 은 이제 곱셈 비율(1.15, 이전엔 고정 70px) — 다이브가 ego bbox 전체를 필요 이상으로 깊게 확대하던 문제(owner: 과확대·라벨 충돌)를 고쳤다 |
| **Chrome density (전역)** | `--topology-chrome-control-height[-compact]` · `--topology-chrome-badge-size[-compact]` · `--topology-chrome-icon-size[-sm]` · `--topology-chrome-gap/-radius/-title-size/-eyebrow-size/-shadow` (+ `--topology-utility-lane-*` alias) | 계기 밀도의 단일 기준. 새 페이지의 데스크톱 컨트롤 클러스터는 이 값을 상속 — 터치 크기 인플레이션 재도입 금지 |

**스코프 주의**:

- `--topology-v2-*` 는 **feature flag `topology-map-v2` 뒤에서만 소비**되는
  패밀리다. P6 구엔진 삭제 시 `--topology-v2-` grep 한 번으로 신구 교체
  범위가 나오도록 유지한다 — 다른 페이지가 이 패밀리를 직접 참조하면 그
  계약이 깨진다. 페이지 롤아웃에서 같은 값이 필요하면 **전역 토큰으로 승격**
  (이름 재부여 + 이 문서 갱신)이 먼저다.
- `--topology-chrome-*` 는 이미 전역이다(HomePage 가 렌더 엔진 밖에서 그려
  map-v2 가 상속; 구 map-canvas/sigma-graph 엔진은 #344 로 삭제됨). 페이지
  롤아웃의 chrome 밀도는 이 패밀리를 바로 쓴다.
- 라이트 모드 값은 **의도적으로 아직 없다** — 라이트 테마도 다크 값을 그대로
  상속한다. "v2 canvas light-mode" 패스는 Design Guardian 리뷰로 확정 전까지
  보류 상태다 (아래 가드 참조).

### 페이지 롤아웃 적용 규칙

롤아웃 순서: 랜딩 → docs(`/docs` Source Vault)/ontology 허브(`/ontology`) →
projects(`/projects`, `/project/[slug]`)/insights(`/ontology/insights`) →
download(`/download`).

**페이지로 가져가는 것** (전역 언어):

- 계기 밀도 — `--topology-chrome-*` 컨트롤 클러스터 밀도.
- 음각 mono 숫자 — census/카운트/집계 표기 (`numeral` 각인 패턴, mono +
  1px 그림자).
- machined 카드 — `--color-panel` 표면 + 1px `border-soft` 윤곽 + 컴팩트
  radius. 두꺼운 보더·이중 보더·글로우 링 금지.
- trace divider — hairline 1px 구분선. 관계 의미가 있을 때만 실선(contains
  계열)/점선(depends·stale 계열) 구분을 이식.
- kind 미니어처 — hex/사각 칩/원/pad 글리프를 범례·리스트 마커로 재사용
  (형태가 kind, 색은 밝기 tier).
- powered dot — 인디고 상태 점(fresh/활성). 상태 없는 장식 점 금지.

**topology 캔버스에만 남는 것** (페이지로 이식 금지):

- 실물 크기 캔버스 노드 도형(모핑 포함), comet signal pulse, 4-point
  diffraction spike, star dust, blueprint grid, vignette, altitude
  crossfade, breathe, amber hub 링, domain hull.
- 이것들을 DOM/CSS 로 흉내내는 순간 "AI 데모 배경"이 된다 — 랜딩 히어로에
  constellation 배경을 깔고 싶다는 충동이 대표적 반례다.

**전역 승격 완료 토큰** (랜딩 롤아웃, 2026-07-18 — `app/globals.css`):

- `--engraved-numeral-face` / `--engraved-numeral-text-shadow` — 음각 mono
  숫자. 다크 값은 v2 numeral 값 복사, 라이트 값은 레터프레스(어두운 면 +
  밝은 아래 그림자)로 신규 정의.
- `--kind-glyph-stroke-{project,domain,capability,element}` /
  `--kind-glyph-fill-{project,domain,capability,element}` /
  `--kind-glyph-edge-contains` / `--kind-glyph-edge-relates` — kind 글리프
  미니어처(hex/칩/원/pad)와 trace 잉크. 다크 값은 v2 node/edge-mark 값
  **복사** (var() 참조 아님 — P6 `--topology-v2-` grep 계약 유지), 라이트
  값 신규. 소비처: `src/views/landing/ui/LandingPage.tsx`
  (마커 `data-token="engraved-numeral"` / `data-token="kind-glyph"`).
- 랜딩 히어로 census 숫자의 진실원:
  `src/views/landing/model/dogfood-census.generated.ts` —
  `scripts/build-docs-vault.mjs` 가 dogfood vault frontmatter 에서 생성.

**Surface class 별 do / don't**:

| Surface | Do | Don't |
|---|---|---|
| Hero (랜딩) | 실제 dogfood vault 를 그리는 topology 미니어처 1개를 증거로 배치 (live 또는 정적 캡처). 카피는 Korean h1 + 영문 caption 패턴 | 장식용 constellation/grid 배경, 오로라, 움직이는 배경, 스크롤 연동 캔버스 애니메이션 |
| Card grid (projects/허브) | machined 카드 + kind 글리프 + 음각 mono 카운트. hover 는 보더 밝기 상승만 | kind 별 채색 카드 배경, full-height colored rail, scale hover, 카드 내 그라디언트 |
| Data table (insights) | hairline divider, mono 숫자 우측 정렬, 관계 의미가 있는 실선/점선 구분, 신호는 인디고 dot/bar 하나 | zebra 줄무늬 틴트, 셀 배경 채색, 상태별 다색 뱃지 시스템 |
| Nav / chrome | `--topology-chrome-*` 밀도 상속. 데스크톱은 정밀 계기(32~36px 컨트롤), 터치 브레이크포인트에서만 확대 | 데스크톱에 터치 밀도(48px+) chrome, 페이지마다 다른 컨트롤 높이/radius 임의 정의 |
| Download | 설치 산출물(DMG 크기·버전·체크섬)을 음각 mono 로 — 계기판처럼 사실 나열 | 마케팅 배지 그라디언트, 스토어 스타일 별점/글로우 CTA |

### 금지 재확인 (v2)

v1 의 [Absolute rules](#absolute-rules-donts) 전부 그대로 유효하다. 페이지
롤아웃에서 추가로 반려되는 v2 특정 패턴 (Guardian verdict 전례 기반):

- ❌ detail card 안 full-height colored rail (AI SaaS callout 클리셰 — v1
  Anti-AI 절에도 명시, 재확인)
- ❌ white-slab-on-dark-canvas — 다크 캔버스 위에 라이트 톤 패널 슬랩을 띄워
  두 세계가 충돌하는 배치. 캔버스 위 chrome 은 반드시 다크 패널 토큰
- ❌ JSX 안 tokenless `clamp(...)` / shadow / easing — 토큰 + 마커 없이 시각
  값 추가 금지 (v1 Tokenization Contract 의 페이지 확장)
- ❌ 데스크톱에 touch-density chrome — 48px+ 컨트롤, 터치용 여백 인플레이션
- ❌ ego-focus dim 을 저알파로 — dim 은 불투명 토큰
  (`--topology-v2-node-fill/stroke-dim`)만. 알파는 전체 대기층 crossfade
  (grid/dust/vignette/힌트류)에만 허용 (WebGL 저알파 불투명 합성 결함 전례)
- ❌ `--topology-v2-*` 를 topology 밖 페이지에서 직접 참조 (전역 승격 먼저)
- ❌ 제2 채색(cyan 등) — data mark 명분이라도 Guardian 전례상 반려

### 가드 (페이지 롤아웃 프로세스)

- **페이지 PR 마다 Design Guardian verdict 필수.** 최소 verdict 는 attention
  winner · typed fact · token contract · motion state · 스크린샷/WebView
  증거 · installed-app proof 필요 여부를 포함한다 (`.claude/rules/design.md`).
- **before/after 스크린샷은 다크+라이트 양쪽** 첨부 (git.md PR 규칙).
- **라이트 모드 작업은 한 사이클에 한 번에** — 부분 마이그레이션이 alpha 토큰
  회귀를 만들어왔다. 특히 **"v2 canvas light-mode" 패스는 아직 미실행**
  (v2 토큰은 다크 전용, 라이트가 다크 값 상속 중) — 페이지 롤아웃 중 라이트
  변주가 필요해지면 부분 수정하지 말고 해당 패스를 통째로 계획하라.
- 새 토큰은 v1 Tokenization Contract 그대로: product reason · state/layer ·
  responsive fallback · WebView/test marker 4종 명시.
- v2 위젯 회귀 게이트: `pnpm exec vitest run src/widgets/topology-map-v2`.

### 부채 — 토큰 drift 감사 (2026-07-18)

토큰 패밀리를 우회하는 hardcode 목록. **이 패스에서는 기록만 하고 고치지
않는다** — 각 항목은 후속 사이클에서 토큰 승격 또는 의도 문서화로 해소한다.

`src/widgets/topology-map-v2/`:

- `render/starfield.ts:75` — star-dust 잉크 `rgba(236,236,240,…)` 리터럴
  (알파만 farT 연동, 잉크색 미토큰).
- `render/grid.ts:147-148` — vignette 잉크 `rgba(3,3,4,…)` 리터럴 (alpha 는
  `--topology-v2-vignette-*-alpha` 토큰, 색 자체는 미토큰).
- `render/labels.ts:50-53` — kind 별 라벨 폰트 스택/크기 hardcode
  (`"600 13px -apple-system, 'SF Pro Text', …"` 등 4종). 프로토타입 충실
  복사이지만 앱 본문 서체(Inter Variable)와 불일치 — 의도인지 drift 인지
  후속 결정 필요.
- `render/node-shapes.ts:201` — 음각 숫자 폰트 `600 ${size}px ui-monospace…`
  패밀리/웨이트 hardcode.
- `ui/TopologyV2DetailPanel.tsx` — 색은 전부 `--topology-v2-panel-*` 토큰
  기반이나 **타입 사다리가 미토큰**: `text-[10px]`~`text-[13.5px]` ·
  `tracking-[0.12em]` · `pl-[30px]` · `h-[6px]` 등 arbitrary 값 다수. 구
  node-popover 패밀리는 compact 타입 토큰이 있었으므로 v2 패널도 승격 대상.

`src/views/home/ui/HomePage.tsx` (topology chrome, 페이지 롤아웃 시 공유될
표면):

- `:63,68` — 로딩 status 카드: `rgba(139,151,255,0.24)` 보더 ·
  `rgba(13,15,21,0.92)` 표면 · `shadow-[0_16px_36px_rgba(0,0,0,0.34)]` ·
  `rgba(199,205,255,0.92)` 텍스트.
- `:1949,1961` — drawer 액션: focus ring `rgba(94,106,210,0.46)` · accent
  surface `rgba(94,106,210,0.16/0.24)` (기존 `--topology-utility-lane-*`
  토큰과 같은 값이나 직접 리터럴).
- `:2647` — 단축키 버튼 hover 보더 `rgba(139,151,255,0.35)`.
- `:2664` — 상태 pill: 보더 `rgba(139,151,255,0.32)` +
  `shadow-[0_8px_24px_rgba(0,0,0,0.35)]` + `top-[96px]` 위치.
- `:2708` — 필터 컨텍스트 칩: `rgba(139,151,255,0.28/0.9)` +
  `left-[220px]` 계단식 위치값.
- `:2723,2725` — 에러 토스트: `rgba(236,116,116,*)` — **헌장의 에러 red
  `rgba(229,72,77,*)` 와도 불일치**하는 미등록 적색 + `rgba(18,20,26,0.98)`
  표면 + `shadow-[0_12px_28px_rgba(0,0,0,0.45)]` + `top-[52px]`.

프로토타입 ↔ 출하 코드의 **의도된** 편차 (drift 아님, 참고):

- 기본 overview 가 프로토타입은 tight-fit(성도 쪽), 출하는
  `--topology-v2-overview-entry-ratio: 0.95` 로 circuit 쪽에서 진입.
- `--topology-v2-edge-pulse-speed-ego`(0.2) 는 프로토타입에 없던 lead spec
  추가분 ("선택 노드엔 전류가 더 흐른다").
- `--topology-v2-safe-inset-*` 는 패널 없는 프로토타입엔 없던 개념 — 출하
  환경의 분석 패널/팝오버 레일이 캔버스를 덮는 폭 보정.
- 데이터시트 패널(`TopologyV2DetailPanel`) 자체가 프로토타입(tip 만 존재)
  이후 추가된 표면 — instrument 밀도 계약은 §2.6 토큰 블록이 진실원.
- panel tertiary 텍스트 `#868690` 는 프로토타입 `#77777f` 의 AA 대비 넛지
  (Guardian follow-up #2).

## Cited lineage — where these rules come from

These rules are an applied reading of public, citable design thinking, not arbitrary taste.
Full grounding + verified links in [`FOUNDATIONS.md` §4](./FOUNDATIONS.md#4-design-lineage--restraint-as-craft-cited).

| Our rule | Descends from |
|---|---|
| Neutral greys + single indigo; ban glow/neon/gradients/glassmorphism | **Dieter Rams**, *Ten Principles* — "unobtrusive / honest / as little design as possible" ("Less, but better") |
| Topology & insights = maximal signal, minimal chrome; honest, proportional relation rendering | **Edward Tufte** — data-ink ratio + graphical integrity |
| `@theme` token scale; constrained spacing; "no second coloring system"; hierarchy by de-emphasis | **Wathan & Schoger**, *Refactoring UI* (also the Tailwind authors) |
| Kind hierarchy + typed relations as the organizing device; lean high-signal vault | **John Maeda**, *Laws of Simplicity* — Reduce / Organize; "subtract the obvious, add the meaningful" |
| Restraint as a *quality* decision (not decoration) that wins against AI-UI clichés | **Karri Saarinen / Linear**, "Why is quality so rare?" |
| Invisible-detail polish (hover/focus/transition feel) without flashy patterns | **Rauno Freiberg**, "Craft" |
| Motion: `transition-colors`/opacity, sub-200ms, minimal transform, `prefers-reduced-motion`; state-conveying not decorative | **Emil Kowalski**, "Great animations" |
| Native-feeling motion that explains status, feedback, and continuity without overwhelming the task | **Apple Human Interface Guidelines**, Motion |
| Design-system quality as a shared language for designers, developers, and product work; interaction detail as part of product finish | **Toss Tech** design-system writing and public Toss docs as principle sources only; do not copy Apps-in-Toss TDS/Figma UI Kit assets, components, styles, logos, or restricted UI patterns |
| Unstyled accessible primitives + our own theming; mono for code/diagrams | **Radix Primitives**, **Vercel Geist** |
| Topology: overview first, ego-focus + details-on-demand popover (never fullscreen on click); start focused as the graph scales | **Ben Shneiderman**, *The Eyes Have It* (1996) — "overview first, zoom and filter, details-on-demand"; **Cambridge Intelligence / yFiles** large-graph guidance |

When proposing a design change, name which row it serves — or argue explicitly why it diverges.

## Top-tier Quality Bar

Ontology Atlas should feel like a designer-grade macOS workbench for a local
ontology, not a web dashboard that happens to run in a desktop shell. The target
is **Apple-level clarity and continuity** plus **Toss-level product finish**:
every action should feel calm, direct, and obviously useful, while still keeping
the restrained graph-workbench language that makes the product trustworthy for
developers and AI agents.

This bar changes how we judge UI work:

- **Action quality** — every primary control should answer "what happens next?"
  in the label, tooltip, aria label, and resulting state change. If a command
  writes or validates the graph, the next proof surface should be one click
  away.
- **Motion quality** — motion is a semantic contract, not decoration. Use it to
  confirm command feedback, preserve continuity between focused nodes, reveal
  staged changes, or explain graph-state transitions. Keep it fast,
  interruptible, transform/opacity-based, and fully compatible with
  `prefers-reduced-motion`.
- **Ontology expression** — visible UI should name the ontology handle it is
  operating on: kind, slug, relation type, proof target, path, or graph query
  contract. Avoid hiding the ontology behind generic document/editor language.
- **Agent usability** — screens that change the graph should expose copyable
  MCP/CLI proof packets or direct handoffs so Claude Code/Codex can verify the
  same state the human just changed.
- **Performance honesty** — graph DB-style affordances must show result
  contracts, limits, partial evidence, and cache/query readiness. A pretty graph
  without query evidence is not enough.

Reference anchors for this bar:

- Apple HIG Motion: https://developer.apple.com/design/human-interface-guidelines/motion
- Toss Design System overview: https://developers-apps-in-toss.toss.im/design/components.html (principle reference only; not a license to copy TDS assets or components)
- Toss design-system article: https://toss.tech/article/toss-design-system
- Toss / Apps-in-Toss Figma UI Kit license: https://developers-apps-in-toss.toss.im/design/prepare/figma-ui-license.html
- Toss Slash MIT repo: https://github.com/toss/slash

## Design tokens

Defined via Tailwind 4's CSS-based `@theme`. See `app/globals.css` for the actual implementation.

### Backgrounds

- `--color-canvas`: `#08090a`
- `--color-panel`: `#0f1011`
- `--color-elevated`: `#191a1b`
- `--color-secondary-surface`: `#28282c`

### Text

- `--color-text-primary`: `#f7f8f8`
- `--color-text-secondary`: `#d0d6e0`
- `--color-text-tertiary`: `#8a8f98`
- `--color-text-quaternary`: `#62666d`

### Accent (the only color)

- `--color-indigo-brand`: `#5e6ad2`
- `--color-indigo-accent`: `#7170ff`
- `--color-indigo-hover`: `#828fff`

### Borders

- `rgba(255,255,255,0.05)` — subtle
- `rgba(255,255,255,0.08)` — default
- `rgba(255,255,255,0.12)` — strong

### Typography

- Primary: `Inter Variable` (OpenType `"cv01", "ss03"` applied globally)
- Signature weight: `510` (Linear's signature)
- Mono: `JetBrains Mono`

### Relief/Topology layout tokens

Relief/Topology layout tokens live in `app/globals.css` under `:root` because
they are runtime workbench contracts, not Tailwind-only decoration. Use token
names in component data markers and tests whenever a surface depends on
14-inch fullscreen geometry.

- **[삭제, 2026-07-18]** `--topology-graph-edge-hairline` / `-spoke` (구
  SigmaTopology graph 모드 전용 엣지 잉크, WebGL 저알파 합성 결함 우회용) 는
  #344 (retire-sigma-topology) 이후 consumer 0 으로 `app/globals.css` 에서
  제거됨. topology-map-v2 는 자체 `--topology-v2-edge-*` 패밀리를 쓴다.
- `--topology-panel-selected-rail-width`: selected node support rail.
- `--topology-panel-overview-rail-width`: overview left support rail.
- `--topology-panel-overview-reserved-width`: overview rail when a right-side
  inspector reserves map space.
- `--topology-panel-path-rail-width`: path mode support rail; the path prompt
  must not become a second large panel.
- `--topology-panel-standard-width`: non-overview/non-path analysis panel.
- `--topology-panel-standard-reserved-width`: standard panel with reserved
  right-side inspector space.
- `--topology-panel-compact-width`: compact fallback when header alignment is
  unavailable.
- `--topology-panel-graph-width`: Graph 모드(살아있는 그래프) 레일 —
  프롬프트 1줄 + 카운트만 담는 최소 폭. 캔버스가 주인공인 뷰라 overview 계열
  폭을 물려받지 않는다.
- `--topology-panel-compact-reserved-width`: compact fallback with reserved
  right-side inspector space.
- `--topology-chrome-control-height` (+ `-compact`) / `--topology-chrome-badge-size`
  (+ `-compact`) / `--topology-chrome-icon-size` (+ `-sm`) / `--topology-chrome-gap` /
  `--topology-chrome-radius` / `--topology-chrome-title-size` /
  `--topology-chrome-eyebrow-size` / `--topology-chrome-shadow`: 지도 chrome 밀도
  토큰. 브랜드 pill(HeroCollapsed) · 상단 검색/정렬 HUD lane · 우측 액션 lane 이
  하나의 machined 컨트롤 클러스터로 이 값을 공유한다. 1920 데스크톱에서 chrome 이
  터치 크기가 아니라 정밀 도구로 읽히도록 컨트롤 높이/아이콘/타입을 한 단계
  좁혔다(높이 48→36, 아이콘 15→12/14→11, 타이틀 13→12, census 는 legible 9px 유지).
  chrome 클러스터는 render 엔진 밖 HomePage 에서 그려지므로 map-v2 가 그대로
  물려받고, 캔버스는 별도 `--topology-ui-scale-factor` 를 써서 이 토큰에
  영향받지 않는다. `--topology-utility-lane-height/-gap/-radius/-compact-width`
  는 이 chrome 토큰을 참조해 HUD/액션 lane 밀도를 단일 기준으로 맞춘다.
- `--topology-card-selected-focus-max-width`: selected focus map card width;
  keeps the current node title readable before secondary subtree count metadata
  while the direct relation facts chip stays visible.
- `--topology-card-selected-quiet-border` /
  `--topology-card-selected-quiet-wash`: selected focus map card treatment.
  Click focus should read as the current ontology fact, not as another panel or
  hull box; drag and selected relation states keep their stronger tokens.
- `--topology-map-dim-anchor-opacity` /
  `--topology-map-dim-context-opacity`: selected focus background map opacity;
  keeps product/domain landmarks as quiet orientation anchors while unrelated
  capability/evidence cards become non-interactive context silhouettes.
- `--topology-selected-relation-card-width` /
  `--topology-selected-relation-card-max-height`: compact selected relation
  inspector geometry; keeps MCP/CLI handoff visible without turning the card
  into a central map panel or a tall relation drawer.
- `--topology-selected-relation-card-inset`: selected relation right-rail inset
  that keeps the inspector out of the central relation path.
- `--topology-selected-relation-card-top`: selected relation top offset that
  clears the first-row workspace chrome.
- `--topology-selected-relation-action-min-width`: selected relation copy
  action minimum width; keeps the recommended MCP/CLI action readable without
  widening the inspector.
- `--topology-selected-relation-copy-payload-min-height`: selected relation
  payload strip minimum height; keeps the handoff command visible as one
  compact proof row.
- `--topology-selected-relation-next-action-surface` /
  `--topology-selected-relation-next-action-border`: selected relation
  next-action rail. The primary MCP action must read first, with payload and
  CLI fallback evidence inside the same rail instead of floating as separate
  proof fragments.
- `--topology-selected-relation-accent-text` /
  `--topology-selected-relation-accent-muted` /
  `--topology-selected-relation-focus-ring` /
  `--topology-selected-relation-copy-primary-shadow`: selected relation
  inspector action accent system. The title, relation direction, recommended
  action label, payload label, focus rings, and primary copy elevation must use
  one token-backed accent language instead of scattered RGBA values.
- `--topology-selected-relation-claim-*` /
  `--topology-selected-relation-quality-*` /
  `--topology-selected-relation-gate-*` /
  `--topology-selected-relation-copy-*`: selected relation fact tones for
  quality, evidence readiness, agent gate, and copy priority. Relation color may
  communicate ontology quality, but the decisions must stay token-backed so
  graph fact semantics can be tuned without editing component classes.
- `--topology-selected-relation-route-step-min-width`: selected relation
  fact/evidence/gate/action step minimum width; prevents cramped ontology
  proof cells inside the compact inspector.
- `--topology-relation-label-card-clearance`: minimum distance between
  scan-level relation labels and visible map cards; keeps the label readable as
  a topology annotation instead of a clipped card badge.
- `--topology-relation-label-surface` / `--topology-relation-label-border` /
  `--topology-relation-label-shadow` /
  `--topology-relation-label-focus-ring` /
  `--topology-relation-label-hit-min-height` /
  `--topology-relation-label-badge-height` /
  `--topology-relation-label-padding-x` /
  `--topology-relation-label-radius` /
  `--topology-relation-label-text-size` /
  `--topology-relation-label-svg-text-size` /
  `--topology-relation-label-text` /
  `--topology-relation-label-svg-text`: scan-level relation label treatment
  that separates typed relation facts from selected-card surfaces. The label
  should read as a quiet map annotation, not a floating panel. The HTML hit
  target, visible badge, and SVG fallback text expose the same token contract so
  screen proof can verify the clickable graph mark, not only its inner badge.
- `--topology-relation-label-selected-surface` /
  `--topology-relation-label-selected-border` /
  `--topology-relation-label-selected-shadow` /
  `--topology-relation-label-selected-text`: focus-level selected relation
  label treatment. A selected relation is the active ontology fact on the map,
  so its halo must be token-backed instead of embedded RGBA in the renderer.
- `--topology-relation-stroke-*`: SVG relation line ink and width for selected,
  strong, supported, weak, and review relations. Relation strokes are topology
  facts, not ambient decoration; tune their contrast with tokens so the map can
  become more legible without touching renderer logic.
- `--topology-focus-hull-*`: drag cluster hull treatment plus click-focus
  measurement markers. Click focus must not render a box or dashed panel; it
  keeps the DOM hull only for clearance/overlap proof while dimmed context,
  ego connectors, and relation labels carry the visible relationship meaning.
  Active drag may render the token-backed hull because it is a movement state.
  The selected focus camera and selected DOM anchor share the same desktop
  reading center, slightly above mathematical center, so the whole ego cluster
  stays in the first scan band while the right inspector is open.
  Selected focus dock companions use a stricter bottom inset than drag docking
  so the focus cluster stays in the first reading band on 14-inch and 16:9
  desktop viewports.
  At the 1280px compact-focus rail, the selected map anchor is hidden by an
  explicit visibility contract so the support rail owns the selected fact.
- `--topology-card-drag-*`: drag, active drag, and settle feedback for map
  cards. Drag motion is an interaction state in the topology grammar, so the
  wash/glow tokens must stay separate from generic selected-card elevation.
- `--topology-relation-quality-*-dot` /
  `--topology-relation-quality-*-glow`: relation quality dots inside map labels.
  Strong, supported, weak, and review states may be visible as semantic graph
  marks on map relation labels, but selected-node list rows keep that state in
  aria/data attributes so the row reads as title + typed relation, not a status
  chip strip.
- `--topology-relation-gate-*-surface` /
  `--topology-relation-gate-*-border` /
  `--topology-relation-gate-*-text`: relation label gate chips for MCP/CLI,
  preflight, and review flows. Gate color is agent handoff state, not
  decorative status color. The gate chip is visible on scan-level and selected
  map relation labels so a user can see the handoff action before opening the
  relation inspector; selected labels keep the same chip in the active fact
  route.
- `--topology-path-endpoint-surface` /
  `--topology-path-endpoint-border` /
  `--topology-path-endpoint-text`: Path mode A/B endpoint badges on map cards.
  They mark source and target anchors for path verification, so they must stay
  token-backed on both desktop and compact WebView layouts.
- `--topology-relation-evidence-chip-surface` /
  `--topology-relation-evidence-chip-border` /
  `--topology-relation-evidence-chip-text`: compact evidence glyph inside a
  map relation label (`S#`, `A`, `R`). It must read as a proof-state chip, not
  loose helper text, so source-backed/authored/review status remains visible
  while scanning relations.
- `--topology-edge-tooltip-surface` / `--topology-edge-tooltip-border` /
  `--topology-edge-tooltip-shadow`: hover relation tooltip treatment. It must
  stay a compact relation fact with `source -> target`, relation type, and
  evidence state; longer MCP/CLI handoff grammar belongs in the selected
  relation inspector.
- `--topology-node-popover-relation-list-min-height`: selected node inspector
  relation-list reading budget. On phone expanded detail it must show at least
  one complete relation row before scrolling, so a user can read the first
  fact/evidence/gate/action handoff without hunting inside the scroll region.
- `--topology-node-popover-relation-section-min-height`: selected node
  inspector section budget that keeps the relation lenses, the first full row,
  and the fixed footer from competing for the same vertical layer.
- `--topology-node-popover-relation-list-surface` /
  `--topology-node-popover-relation-list-border` /
  `--topology-node-popover-relation-row-divider` /
  `--topology-node-popover-relation-row-hover-surface` /
  `--topology-node-popover-relation-row-focus-surface` /
  `--topology-node-popover-relation-row-focus-border` /
  `--topology-node-popover-relation-row-focus-ring` /
  `--topology-node-popover-relation-row-title-text` /
  `--topology-node-popover-relation-row-meta-text`: selected node
  inspector relation list chrome. These keep row separators and hover feedback
  in the same token family as the fixed footer, while focus tokens make keyboard
  selection visible without adding a competing panel. The row title marks the
  clicked ontology target and the row meta text keeps direction and kind as
  secondary reading context. `--topology-node-popover-row-chip-height` /
  `--topology-node-popover-row-chip-padding-x` /
  `--topology-node-popover-row-chip-text-size` define the only visible row
  microchips: one proof chip and one agent-action chip. Relation rows should
  remain a readable handoff list instead of ad hoc translucent bands, proof
  glows, large badges, or generic page/helper text.
- `--topology-node-popover-action-*` /
  `--topology-node-popover-context-surface` /
  `--topology-node-popover-context-border` /
  `--topology-node-popover-count-text` /
  `--topology-node-popover-summary-text` /
  `--topology-node-popover-significance-context-text` /
  `--topology-node-popover-significance-detail-text` /
  `--topology-node-popover-context-text` /
  `--topology-node-popover-empty-text`: selected node inspector support
  rail accents. Compact MCP/CLI actions, footer actions, and map-visible
  relation summaries must use node-popover tokens so the support rail stays
  visually related to the active focus state without becoming another primary
  relation inspector. Count, summary, significance helper, context note, and
  empty-state copy must also stay token-backed so the selected-node reading
  layer can be tuned independently from generic page helper text. Action text
  and hover text must stay token-backed so the footer's next actions do not
  drift into generic button chrome.
- `--topology-node-popover-footer-action-*` /
  `--topology-node-popover-footer-count-*`: selected node inspector fixed
  footer navigation tokens. Use these for `Map view`, `Full detail`, and hidden
  relation count pills so the bottom edge remains a stable state-transition
  rail, not generic page chrome.
- `--topology-node-popover-footer-border`: selected node inspector fixed
  handoff rail boundary token. Use it for the footer divider; the `Agent
  Handoff` label is preserved as screen-reader context so the visible rail can
  stay focused on executable MCP/CLI actions.
- `--topology-node-popover-chrome-action-*`: selected node inspector utility
  chrome tokens. Use these for close and compact expand controls so utility
  actions stay subdued inside the node inspector layer and do not borrow generic
  page-button color while relation facts, evidence, and handoff actions remain
  the primary scan targets.
- `--topology-node-popover-compact-*`: collapsed selected-node popover sizing
  and typography tokens. Use these for compact kind label, title
  size/leading, count text, relation fact pill text, action gap, action size,
  primary handoff action width/label size, and quiet chrome label size. The
  collapsed state must read as one compact support rail: ontology title first,
  typed facts second, executable `Brief` action third, with expand/close
  treated as quiet utility chrome. Do not reintroduce raw `text-[Npx]`,
  `leading-N`, or ad hoc `gap-*` values in this layer.
- `--topology-node-popover-metric-*`: selected node inspector metric cards for
  `Used by` and `Depends on`. Use these for the first read of ontology
  directionality above the relation list; the cards should read as quiet
  node-context facts, not generic overlay panels.
- `--topology-node-popover-kind-text`: selected node inspector kind eyebrow
  above the title. Use this for the first ontology hierarchy cue (`Project`,
  `Domain`, `Capability`, `Element`) so the selected node header stays in the
  topology inspector token family instead of borrowing generic muted text.
- `--topology-node-popover-title-text`: selected node inspector title text.
  Use this for the active ontology object name so the primary header remains
  token-backed across collapsed and expanded focus states instead of borrowing
  generic page heading text.
- `--topology-node-popover-significance-core-text` /
  `--topology-node-popover-significance-support-text`: selected node
  inspector plain-language importance line. Use these for the visible "so
  what" sentence below the title so core hubs stay prominent while supporting
  nodes remain secondary, without borrowing generic page text colors.
- `--topology-node-popover-relation-section-*`: selected node inspector
  relation-section boundary and heading tokens. Use these for the divider,
  `Connections` title, and typed-fact summary lens so the transition from node
  metrics to relation rows remains part of the inspector grammar, not a generic
  panel divider.
- `--topology-node-popover-remainder-text`: selected node inspector hidden
  relation remainder text (`+N more`) below the capped preview list. Use this
  for inline relation overflow facts so folded relation count remains tied to
  the relation list, separate from the footer's drill-down count pill.
- `--topology-node-popover-route-*`: compact relation-row handoff route rail
  inside the selected node inspector. Use these for fact/evidence/gate/action
  chips and their text so row-level MCP/CLI payloads scan as structured proof,
  not loose monospace helper text.
- `--topology-node-popover-direction-*`: selected node inspector relation-row
  direction marker. It encodes incoming/outgoing orientation before the typed
  fact chip, so it must expose `data-direction-*-token` markers and stay tied
  to the row hover state instead of generic icon chrome.
- `--topology-node-popover-fact-type-*`: selected node inspector relation type
  chip, the first scan target in a relation row. It must stay token-backed and
  expose `data-fact-type-*-token` markers so the typed fact reads as the start
  of the handoff grammar before quality, evidence, gate, and payload.
- `--topology-node-popover-endpoint-*`: selected node inspector endpoint route
  (`source > target`) text. This is the visible from/to proof for MCP/CLI
  payloads, so it must expose `data-endpoint-*-token` markers and remain tied
  to the relation row instead of generic helper text.
- `--topology-node-popover-evidence-*`: selected node inspector relation
  evidence states (`source`, `authored`, `review`). Use these for the visible
  row proof microchip and its data markers; the long evidence route and machine
  payload still stay in the hidden handoff rail.
- `--topology-selected-relation-quality-*` and
  `--topology-relation-quality-*-dot` / `*-glow`: selected relation labels and
  map labels reuse the same semantic quality token family. Selected-node list
  rows preserve quality as aria/data state rather than a visible dot/glow. Do
  not reintroduce raw Tailwind hue classes for strong/supported/weak/review
  states; tests should assert the token names through `data-relation-quality-*`
  markers.
- `--topology-node-popover-agent-*` /
  `--topology-node-popover-gate-*`: selected node inspector agent readiness
  and row gate chips. These encode MCP/CLI handoff readiness, preflight-first,
  and review-first states as ontology workflow facts, not decorative status
  colors. New readiness or gate treatments must expose `data-agent-*-token`
  markers so phone WebView checks can prove the token contract.
- `--topology-bottom-tab-surface` / `--topology-bottom-tab-border`: mobile
  topology navigation surface. It must be opaque enough that map cards and
  relation labels cannot bleed through tab icons or labels.
- `--topology-analysis-panel-compact-scroll-end-reserve`: compact analysis
  panel end padding. It keeps overview/focus/path proof content scrollable
  above the fixed mobile bottom tab instead of letting support evidence hide
  under primary navigation.
- `--topology-analysis-mode-rail-surface` /
  `--topology-analysis-mode-active-surface` /
  `--topology-analysis-mode-active-border` /
  `--topology-analysis-mode-active-text` /
  `--topology-analysis-mode-idle-text` /
  `--topology-analysis-mode-hover-surface` /
  `--topology-analysis-mode-focus-ring`: Relief analysis mode rail. The
  Overview/Focus/Path/Health tabs stay icon-only and tooltip-labeled, while
  active, idle, hover, and keyboard focus states remain token-backed so mode
  switching reads consistently across compact and desktop support panels.
- `--topology-analysis-panel-prompt-text` /
  `--topology-analysis-panel-metric-label-text` /
  `--topology-analysis-panel-metric-value-text` /
  `--topology-analysis-panel-notice-text`: Relief analysis panel support copy.
  Prompt copy, compact metrics, and path visibility notices must stay visually
  below the map/focus layer while remaining readable in the macOS WebView and
  phone sheet; do not reuse generic `--color-text-*` tokens directly in this
  support rail.
- `--topology-utility-lane-surface` / `--topology-utility-lane-border` /
  `--topology-utility-lane-shadow`: top utility chrome for search, auto
  arrange, docs, create, and review actions. These controls are support layer,
  so they use a quieter shared surface than selected-node or relation proof
  inspectors. Individual utility actions must expose the same surface, border,
  hover, active, shadow, and focus-ring token contract so top chrome reads as
  one workbench control family.
- `--topology-utility-lane-accent-surface` /
  `--topology-utility-lane-accent-border`: utility-lane accent actions such as
  create or review. They may signal actionability but must stay in the same
  compact lane geometry as non-primary utility controls.
- `--topology-utility-lane-focus-ring` /
  `--topology-utility-lane-count-surface` /
  `--topology-utility-lane-count-text`: support-action keyboard focus and
  compact count badge accents. Utility chrome is not the primary graph fact, but
  it must remain keyboard-readable and token-backed in compact WebView layouts.
- `--topology-blocking-backdrop-surface` /
  `--topology-blocking-map-opacity` / `--topology-blocking-map-filter`: blocking
  edit layer contract. When Add Concept or another graph mutation composer is
  open, the map remains visible as context but becomes visibly demoted and
  pointer-suppressed instead of reading as an active graph surface.
- `--topology-blocking-composer-top` /
  `--topology-blocking-composer-width` /
  `--topology-blocking-composer-max-height`: blocking composer geometry. The
  composer owns attention at 14-inch fullscreen and compact WebView sizes
  without drifting into the top utility lane or mobile bottom reserve.
- `--topology-blocking-composer-surface` /
  `--topology-blocking-composer-border` /
  `--topology-blocking-composer-shadow`: blocking composer visual contract. The
  form must read as the sole active write surface over the dimmed topology map,
  using token-backed elevation rather than ad hoc glow or hard-coded colors.
- `--topology-path-route-surface` / `--topology-path-route-border` /
  `--topology-path-route-chip-surface` /
  `--topology-path-route-chip-border` /
  `--topology-path-route-chip-text` /
  `--topology-path-route-arrow-text` /
  `--topology-path-route-source-*` /
  `--topology-path-route-target-*` /
  `--topology-path-route-endpoint-marker-*`: path result route rail. When both
  source and target endpoints are selected, the analysis rail must expose the
  current source-to-target route before the proof disclosure so users and agents
  can read the active graph question without opening secondary evidence.
  Source/target tones and A/B endpoint markers make direction visible in the
  14-inch rail and compact phone panel without adding a second path surface. The
  same base route tokens also govern the proof disclosure route recap and
  source/target ontology or Builder exits, so route evidence stays visually tied
  to the selected path instead of generic panel chrome.
- `--topology-path-proof-step-surface` /
  `--topology-path-proof-step-border` /
  `--topology-path-proof-kicker-text` /
  `--topology-path-proof-desc-text` /
  `--topology-path-proof-action-text` /
  `--topology-path-proof-action-hover-text` /
  `--topology-path-proof-summary-surface` /
  `--topology-path-proof-summary-border` /
  `--topology-path-proof-summary-text` /
  `--topology-path-proof-summary-hover-surface` /
  `--topology-path-proof-summary-hover-border` /
  `--topology-path-proof-summary-hover-text` /
  `--topology-path-check-summary-text` /
  `--topology-path-check-summary-hover-text` /
  `--topology-path-proof-ready-surface` /
  `--topology-path-proof-ready-border` /
  `--topology-path-proof-ready-text` /
  `--topology-path-proof-required-surface` /
  `--topology-path-proof-required-border` /
  `--topology-path-proof-required-text` /
  `--topology-path-proof-after-write-surface` /
  `--topology-path-proof-after-write-border` /
  `--topology-path-proof-after-write-text`: path proof disclosure, checklist
  rows, and status chips. The collapsed disclosure must read as an available
  proof control, not empty panel text, while ready / required / after-write
  evidence stays in the same route-sharing language as the primary path action.
- `--topology-path-candidate-visibility-surface` /
  `--topology-path-candidate-visibility-border`: path candidate coverage strip.
  It explains how many map cards remain visible after panel-clearance hiding,
  so the user can trust whether the current source/target selection is being
  made from the full visible candidate set or a collision-managed subset.
- `--topology-path-primary-evidence-surface` /
  `--topology-path-primary-evidence-border` /
  `--topology-path-primary-evidence-text` /
  `--topology-path-primary-evidence-hover-surface` /
  `--topology-path-primary-evidence-hover-border` /
  `--topology-path-primary-evidence-hover-text`: path result primary route-share
  action. When a source and target are selected, `Copy path evidence` must read
  as the first actionable proof step inside the route-sharing rail, before MCP
  and CLI fallback chips and before the secondary proof disclosure.
- `--topology-path-handoff-text` /
  `--topology-path-handoff-label-text`: path route-share rail copy. The rail label
  and ambient text are support copy for the selected path, so they stay quieter
  than selected endpoint cards while still framing the copyable proof action.
- `--topology-path-handoff-mcp-surface` /
  `--topology-path-handoff-mcp-border` /
  `--topology-path-handoff-mcp-text` /
  `--topology-path-handoff-cli-surface` /
  `--topology-path-handoff-cli-border` /
  `--topology-path-handoff-cli-text`: path handoff fallback chips. The MCP chip
  remains the stronger command target, while the CLI fallback stays visible but
  quieter in the same compact rail. The same family covers the disclosed path
  checks rail (`path`, `relation_check`, `explain_relation`, `all_paths` plan,
  and `all_paths` run) so graph-evidence copy tools read as one sequence rather
  than unrelated compact buttons.
- `--topology-overview-signal-grid-surface` /
  `--topology-overview-signal-grid-border` /
  `--topology-overview-notice-surface` /
  `--topology-overview-notice-border`: overview first-read signal stack. These
  tokens keep relation progress, provenance, readiness, and the level-of-detail
  notice in one compact reading surface without hard-coded theme exceptions.
- `--topology-overview-signal-neutral-surface` /
  `--topology-overview-signal-neutral-border` /
  `--topology-overview-signal-indigo-surface` /
  `--topology-overview-signal-indigo-border` /
  `--topology-overview-signal-cyan-surface` /
  `--topology-overview-signal-cyan-border`: overview metric/provenance signal
  card tones. Neutral is for quantitative progress, indigo for ontology/agent
  command context, and cyan for supportive semantic facts.
- `--topology-overview-handoff-divider` /
  `--topology-overview-handoff-primary-surface` /
  `--topology-overview-handoff-primary-border` /
  `--topology-overview-handoff-secondary-surface` /
  `--topology-overview-handoff-secondary-border`: overview share rail.
  The map brief remains the primary action; reanalysis and sync checks stay
  quieter inside the disclosure while sharing the same responsive token
  contract.
- `--topology-overview-quality-surface` /
  `--topology-overview-quality-border` /
  `--topology-overview-readiness-surface` /
  `--topology-overview-readiness-border`: overview proof cards for relation
  quality and share readiness. They are scan facts, not nested cards, and must
  keep the first-read stack visually flat.
- `--topology-overview-proof-cell-divider` /
  `--topology-overview-proof-strong-text` /
  `--topology-overview-proof-supported-text` /
  `--topology-overview-proof-warning-text` /
  `--topology-overview-proof-review-text`: shared proof-cell divider and
  semantic text tones used by relation quality and readiness chips.
- `--topology-health-repair-primary-surface` /
  `--topology-health-repair-primary-border` /
  `--topology-health-repair-primary-hover-surface` /
  `--topology-health-repair-secondary-surface` /
  `--topology-health-repair-secondary-border` /
  `--topology-health-repair-secondary-hover-surface`: health repair action
  hierarchy. Builder repair is the primary action; MCP and ontology handoff
  remain compact secondary actions without inventing one-off button colors.
- `--topology-overview-readiness-meter-surface` /
  `--topology-overview-readiness-meter-border` /
  `--topology-overview-readiness-ready-meter` /
  `--topology-overview-readiness-preflight-meter` /
  `--topology-overview-readiness-review-meter`: readiness meter track and
  segment fills. These tokens keep the handoff-ready/preflight/review balance
  mode-aware without hard-coded gradient exceptions in the component.
- **[stale, 2026-07-18]** `--topology-minimap-surface` is the sole survivor of
  a larger minimap token family (`-border` / `-shadow` / `-active-*` /
  `-grid-glow`) that backed a `topology-minimap` testid support chrome. No
  component currently renders that testid or the `data-minimap-*` contracts
  described below — the minimap UI appears to have been retired alongside
  #344 (retire-sigma-topology) without a matching doc/test cleanup.
  `tests/e2e/topology-overlap.spec.ts` still asserts on it and fails against
  the current app; needs an owner decision (rebuild the minimap for
  `topology-map-v2`, or delete the dead spec + token).
- `--topology-floating-panel-surface` / `--topology-floating-panel-border` /
  `--topology-floating-panel-shadow`: expanded map-control sheet. It must read
  as one support surface with internal divider rows, not a stack of separate
  cards competing with the analysis panel or selected-node inspector.
- `--topology-command-step-surface` / `--topology-command-step-border`:
  selected-focus review order rail. Use one flat numbered rail with divider
  rows, not separate nested cards, so the support panel stays visually lighter
  than the map and selected-node inspector.
- `--topology-command-secondary-surface` /
  `--topology-command-secondary-border` /
  `--topology-command-secondary-hover-border`: selected-focus secondary exits
  and proof-copy actions. Ontology, Builder, MCP, impact, sync-gate, and
  strengthen-command handoffs must stay secondary to the focus brief primary
  action while remaining visible on compact widths.

Selected node expanded detail uses
`data-body-scroll-contract="content-scrolls-above-fixed-footer"` and
`data-footer-position-contract="anchored-bottom-visible"` on phone-sized
surfaces. The body may scroll, but the MCP/CLI action rail must remain inside
the visible popover frame while the relation list still exposes one complete
fact/evidence/gate/action row. Phone density markers may hide explanatory copy
before the first row, but must not hide the relation quality/readiness chips or
row-level handoff facts.

Selected node relation rows use
`data-row-surface-contract="flat-divider-rail"` on the list,
`data-row-surface-contract="flat-divider-row"` on each clickable relation, and
`data-relation-payload-layout="flat-inline-payload-rail"` on the payload route.
This keeps relation facts machine-readable and tappable without repeating
card-like surfaces inside the inspector.

On phone-width selected node detail, explanatory copy before the relation list
must yield to the first readable relation row. Keep the primary meaning line,
but hide technical summary/explainer/map-context copy with phone density
markers such as `data-phone-density-contract="hide-summary-before-readable-row"`
and `data-phone-density-contract="hide-explainer-before-readable-row"`.

Do not introduce a new panel width by writing a one-off `clamp(...)` in JSX.
First name the product reason, add or reuse a `--topology-*` token, and update
the WebView/test marker that proves the token is active.

### Relief/Topology motion tokens

Motion is product feedback. Use these tokens for click focus, camera movement,
panel entry, drag settle, and focus confirmation before adding bespoke easing:

- `--topology-motion-focus-duration`: short focus confirmation.
- `--topology-motion-panel-duration`: panel/support chrome entry.
- `--topology-motion-camera-duration`: camera pan/zoom continuity.
- `--topology-motion-drag-settle-duration`: post-drag settle.
- `--topology-motion-ease-standard`: default topology state transition.
- `--topology-motion-ease-out`: landing/settle transition.

New motion must name what it explains: selection, camera relocation, drag
movement, path construction, composer blocking, or command feedback. Motion
that only makes the screen feel busy fails the design system.

### Tokenization Contract For Relief/Topology

Relief/Topology is not allowed to rely on "looks better" CSS. A visual value is
valid only when it is a named workbench decision, an ontology-reading decision,
or a verified interaction decision.

Use named `--topology-*` tokens or add a documented token before changing:

- panel width, reserved map space, padding, radius, border, surface, shadow, and
  z-order intent;
- relation label width, selected relation card density, chip rhythm, footer
  height, disclosure thresholds, and proof row layout;
- dim/scrim treatment for a blocking composer, modal, destructive confirm, or
  write surface;
- camera, focus, panel, drag, path, composer, and reduced-motion durations or
  easing;
- MCP/CLI handoff markers that prove the selected fact, evidence, quality, and
  next action stay visible.

Relation-label handoff state is aggregated on the skeleton-cards root with
`data-relation-label-handoff-contract="label-level-mcp-cli-fallback"`. Every map
label hit target must expose its gate, primary MCP action, CLI fallback command,
fact route, quality, and evidence; when a map label is selected, the root also
mirrors the selected label's handoff state so installed-app WebView evidence can
prove the label is an actionable ontology fact, not just a decorative badge.

Relation-label geometry is also a frame-level contract. The skeleton-cards root
must expose `data-relation-label-geometry-contract="frame-positioned-hit-targets"`
with after-render expected/ready/pending counts, so a visible scan label is
proved to have real viewport-clamped hit-target geometry before the user opens a
relation card.

Each new topology token needs:

- **product reason**: the user problem it reduces, such as overlap, unclear
  current action, unreadable relation evidence, or untrustworthy handoff;
- **state/layer**: map, support panel, focus/path, transient, blocking
  composer, or utility chrome;
- **responsive fallback**: compact, 14-inch fullscreen, 1920x1080, and
  2560x1440 behavior;
- **WebView/test marker**: deterministic evidence that the token is active and
  the relevant overlap/transient count remains acceptable.

Treat W3C/DTCG-style design tokens as the principle: design decisions should be
portable, named, inspectable, and testable across tools. This repo does not
copy third-party component skins, palettes, layouts, screenshots, assets, or
animation signatures.

## Category differentiation strategy

Differentiate by **border style**, not color — the only color (indigo) is reserved for hub nodes:

| Category           | Marker                                    |
| ------------------ | ----------------------------------------- |
| In progress        | Indigo underline                          |
| Planned            | Dashed border                             |
| Hub (IAM/Reactor)  | Indigo background and border (only color) |

## Product Surface Hierarchy

Operational pages should expose intent before visual flourish:

1. **Primary task** — what the user can do on this screen now.
2. **Graph evidence** — node count, relation count, warnings, health, or query
   packet readiness.
3. **Next graph action** — Builder for writes, Insights for graph DB-style
   queries, Topology for spatial/path inspection.

Avoid making large explanatory panels the first thing users read. Prefer compact
action strips with labels that name the mode (`Browse`, `Write`, `Query`) and a
short reason to click.

Tree surfaces should explain their boundary instead of pretending to be the
whole ontology. Use a single-line role/status strip, not a row of cards, to show
that the tree is the hierarchy index, relation counts come from frontmatter
refs, document nodes remain evidence outside the concept tree, and projection
notes are available on demand. Node-detail handoffs should always keep the three
workbench exits visible: Topology for visual focus, Builder for
frontmatter-backed edits, and Insights for graph DB-style validation. The
selected-node panel should repeat that as a
small Browse / Write / Query rail before longer review content, so choosing a
tree node immediately offers visual focus, builder focus, and node proof without
requiring the user to parse the whole collaborator brief.
When a tree row is selected, repeat the active canonical slug near the
Browse/Write/Query summary; the tree is choosing the graph handle the next
write and query will keep, not just highlighting a row. Tree rows themselves
should also name the graph handle they select: the row button label should
include the slug handoff, and the selected row should show a compact handle
chip so keyboard focus, the detail panel, Builder, and Insights are visibly
using the same concept id.
When no node is selected yet, the tree area should still expose a small
selection hint that names the same Browse / Write / Query outcome. This makes
row selection feel like the entrance to the workbench loop, not just a file-tree
click.
The `/ontology` Browse / Write / Query cards should live behind the work overview
disclosure and carry compact proof chips (`tree projection`, `frontmatter write`,
`dogfood:graph-db`) so users can inspect the runtime contract without making the
cards permanent chrome. Treat them as an ordered workbench loop: show `01` /
`02` / `03` execution markers and one short loop-action line per card so Browse
reads as selecting the slug, Write as editing that same slug, and Query as
proving the graph after the change.

Tree projection warnings should be named as projection notes, not generic data
errors. The tree can only show one readable hierarchy, while the same
frontmatter graph may contain valid multi-parent or cyclic semantic relations.
When projection notes exist, the card should expand into a concrete warning
list and hand off to Insights for graph scans or Builder for relation review.
The graph DB proof rail on `/ontology` is a compact execution strip, not a
second hero card. Keep the single-line hierarchy status above it so the browse
surface first explains why the hierarchy exists and where its boundary is; then
show the MCP/CLI pack counts and representative query intents as proof that the
same markdown graph is queryable. The rail should also expose
the graph DB runtime gate plus the shared post-change sync gate, so browse can
prove the graph now and close a write without making the user find a deeper
panel first. The runtime gate copy should name the replay shape directly:
setup self-check, `health --json`, focused `blast_radius`, scan follow-ups,
public relation-name parity (`relation_name_parity`), `pattern_walk` /
`project_map` containment replay, bounded `all_paths` evidence, and
`relation_check`. Keep local frontmatter compile proof below the tree; it is
source evidence, not the primary browse entry.

Builder write surfaces should keep the canvas as the default first task. The
large page title and `Source` / `Draft` / `Guard` / `Proof` rail should not
always consume the first viewport. Keep a compact `Write status` disclosure
near the canvas controls; opening it reveals the ordered cells that distinguish
local writable vaults from sample read-only data, unsaved canvas work from
persisted graph data, preview/preflight checks from direct frontmatter writes,
and the MCP/CLI proof packets that close a graph mutation after it lands. The
`Guard` cell should expose a copyable relation guard packet with path planning,
relation_check, explain_relation, and post-change sync instructions; this keeps
preflight usable before the relation modal is open. The `Proof` cell should
hand off to the query cockpit so a builder write naturally flows into graph
DB-style verification instead of ending as a canvas-only action. The copied
proof packet should start with the same setup self-check, graph DB pack, and
`pnpm dogfood:graph-db` runtime replay exposed elsewhere in the workbench. The
replay also needs to name structural containment checks (`pattern_walk` /
`project_map`) so Builder proof is visibly stronger than a path-only guard.
When expanded, each cell should expose a compact proof chip (`local markdown`,
`canvas draft`, `relation guard`, `graph db + health`) and the visible execution
order; when collapsed, the canvas remains visually dominant.
The canvas entry rail should then pick up that same loop at the graph level:
name the rail as saved node entrypoints, show the node/ref counts, and add
a compact `pick focus node` chip plus hover hint that users should choose a
saved node before drawing so the details panel and proof handoffs keep the same
slug. When a saved node is focused, repeat that active slug in the rail and
visually mark the matching node button; the builder should always make the
current write/proof handle explicit before a relation is drawn. The rail is a
real operation control, not decoration: expose it as a labelled region, give
each saved node a direct focus label, and make the active focus slug readable
to keyboard and assistive-technology users.

Query surfaces should expose the executable query pack before deeper charts.
Use a compact cockpit with readiness, pack size, MCP call count, CLI fallback
count, representative `MATCH ...` intents, first-operation badges, per-intent
payload/fallback counts, scan/path result contracts, and the self-check plus
health gate. The setup self-check and `dogfood:graph-db` runtime gate should be
copyable from the first viewport so the query surface is executable, not just
descriptive.
Deeper panels can explain contracts, but the first viewport should make it
clear that the local markdown graph can be scanned like a small graph database
without treating raw rows or partial paths as proof.

Source/setup surfaces should expose the vault execution contract before setup
actions. Use compact `Files` / `Graph` / `Agent` cells to show that local
markdown remains the source of truth, frontmatter compiles into graph/query
surfaces, and MCP agents read the same vault. Action cards can follow, but the
first native-app entry must make the ontology workbench contract clearer than
the document-editor mechanics. The `Agent` cell should expose a copyable graph
DB runtime gate, so Source Vault can prove the same read-first agent loop
without sending the user to a deeper panel first. Its visible replay markers
should name `relation_name_parity` and `pattern_walk` / `project_map`, so the
source route reads as the start of graph verification rather than a document
reader with an agent button.
The global entry label and page header for `/docs` should say `Source` /
`Source Vault`, not `Docs`, because that route is the local markdown source and
agent setup surface for the graph. First-viewport counts and vault badges should
say `source records` / `records`, not `docs`. Keep `document` language for
individual markdown files and evidence rows, but avoid making the route identity
read like a documentation portal. Palette groups, search sections, empty-state
prompts, and tree navigation labels should say `Source records` / `Source tree`
when they name the surface rather than one specific markdown file.

## Topology node focus & scale (ego popover)

Full spec + cited references: [`TOPOLOGY-FOCUS-AND-SCALE.md`](./TOPOLOGY-FOCUS-AND-SCALE.md).
The graph view obeys the infovis mantra *overview first, zoom and filter, then
details-on-demand* — not the inverse (everything-at-once + fullscreen-on-click).

- **Click = ego focus + compact popover, not a fullscreen modal.** Clicking a
  node keeps the node and its direct neighbors (its `ego` subgraph) at full
  opacity and dims/hides the rest via Sigma `nodeReducer` / `edgeReducer` (the
  underlying graphology instance is not mutated). A content-sized popover
  anchors near the node and lists the connected nodes (each a click target for
  an incremental ego walk). The large `NodeDetailPanel` becomes an opt-in
  `전체 상세 →` drill, not the click default.
- **Card count chips are topology marks.** `--topology-card-count-surface` /
  `--topology-card-count-border` / `--topology-card-count-text` make each
  visible skeleton card's count read as node scale, not incidental metadata.
  Keep the chip compact and token-backed so card width remains stable while
  important anchors expose why they matter on the map.
- **Default view is an overview, not the full graph.** Show `project` + `domain`
  + hub nodes at level 0; reveal a domain's members on demand (semantic zoom).
  Never drop the full 2–3k-node hairball on the user uninvited.
- **Plain language over graph jargon.** `영향받음 N` → "이 노드를 쓰는 곳 N";
  `의존 N` → "이 노드가 기대는 곳 N". No duplicated labels (`개념 정보` ×3).
- **Scale path (≈2–3k → 10k+).** Sigma/WebGL renders ~10k nodes; the costs are
  labels, edges, and live layout. Mitigate in order: precompute + cache the
  ForceAtlas2 layout, level-of-detail labels (`hideLabelsOnMove` /
  `hideEdgesOnMove`), keep representative-edge culling, then domain clustering
  above ~5k.
- **WebGL palette tokens.** **[stale, 2026-07-18]** This bullet described
  `src/widgets/topology-map-sigma/lib/topology-palette.ts` as the map-layer
  token source; that file no longer exists (deleted alongside #344
  retire-sigma-topology — `topology-map-sigma/` now only holds
  `SigmaControls`/`SigmaHubRail`/`TopologyEmptyState` chrome, no palette
  module). `topology-map-v2` reads its palette via
  `src/widgets/topology-map-v2/tokens/read-topology-v2-tokens.ts` instead. Dark
  overview edges must stay quiet enough for dense vaults, but still visible as
  topology context before focus/path highlighting promotes selected relations.
  Treat base / containment / dependency / dim edges as semantic layers, not
  incidental RGBA literals.

This serves the new "topology" row in the cited-lineage table above.

## Anti-AI Design Criteria

Anti-AI design does not mean colorless UI. It means every visual decision has a
job that a local-first ontology workbench needs, and nothing is added just to
look generated, glossy, or broadly SaaS-like.

Apply these checks before shipping ontology surfaces:

- **Color is a keyed data mark, not atmosphere.** Kind color may identify
  `project` / `domain` / `capability` / `element` / `unknown`, but the surface
  must also show a label, icon, size, position, or legend. This follows WCAG
  2.2 SC 1.4.1 and Apple HIG color guidance: do not rely on color alone.
- **Color area stays proportional to evidence value.** Graph marks can use
  high-contrast fills because they are small data points; panels and cards use
  neutral surfaces, compact swatches / markers, and low-alpha borders. Avoid
  full-height colored rails inside detail cards; they read as decorative
  generated-callout chrome before they explain the data.
- **Qualitative, not theatrical.** Kind colors are nominal categories, so they
  use a quiet qualitative palette in the ColorBrewer sense. Avoid neon yellow,
  magenta, or over-saturated "AI dashboard" tones when label/icon/shape can do
  the separation work.
- **No generated-gloss signals.** Decorative gradients, glass blur, glow rings,
  aurora backgrounds, oversized rounded cards, and scale-hover motion are
  regressions unless a specific native-system state requires them.
- **Craft is verified in small contracts.** The design drift guard must catch
  forbidden patterns, focused tests must lock role labels and tone attributes,
  and browser/native verification must prove the UI reads as a workbench rather
  than a decorative demo.
- **No floating-box soup.** A screen with several unrelated cards, popovers,
  prompts, minimaps, HUD buttons, and inspectors visible at the same visual
  weight is not "rich"; it is an attention failure. One surface owns the
  current action, support surfaces stay visibly weaker, and blocking surfaces
  dim or suppress the rest.
- **No stacked transient UI.** Popovers, context menus, hover previews, and
  selected cards may not cascade as unrelated layers. Opening a new transient
  surface closes the previous unrelated one; opening a composer/modal demotes
  or closes transient surfaces and blocks parent-map interaction.
- **No tokenless positioning.** Panel width, radius, padding, shadow, elevation,
  z-order intent, and topology motion must use named tokens or marker-backed
  contracts. One-off `clamp(...)`, shadow, or easing values in JSX are treated
  as design debt unless the same change adds a token and verifier.
- **No modal without modality.** A write composer, destructive confirm, or
  decision dialog must visibly separate itself from the map through a dim,
  scrim, or blocked interaction state. If the background still appears equally
  actionable, the modal/composer fails.
- **No elevation noise.** More shadow does not mean more hierarchy. Elevation
  must describe map/support/focus/transient/blocking layer order and be
  consistent across dark/light themes.

Reference anchors:

- Apple HIG Color: https://developer.apple.com/design/human-interface-guidelines/color
- Apple HIG Modality: https://developer.apple.com/design/human-interface-guidelines/modality
- Apple HIG Sheets: https://developer.apple.com/design/human-interface-guidelines/sheets
- Apple HIG Layout: https://developer.apple.com/design/human-interface-guidelines/layout
- Fluent 2 Layout: https://fluent2.microsoft.design/layout
- Fluent 2 Design Tokens: https://fluent2.microsoft.design/design-tokens
- Material Design Dialogs: https://m2.material.io/components/dialogs
- WCAG 2.2 SC 1.4.1 / 1.4.11: https://www.w3.org/TR/WCAG22/
- W3C Understanding SC 1.4.11: https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast
- ColorBrewer scheme types: https://colorbrewer2.org/learnmore/schemes_full.html
- Linear, "Why is quality so rare?": https://linear.app/now/why-is-quality-so-rare

## Absolute rules (Don'ts)

- ❌ Purple → pink gradients
- ❌ Glassmorphism (`backdrop-blur`)
- ❌ Glow pulse / neon effects
- ❌ Glow-like `boxShadow: \`0 0 ...\`` rings on ontology operation surfaces
- ❌ Animated gradient backgrounds / aurora
- ❌ Scale-based hover effects
- ❌ More than one color system
- ❌ Floating-box soup: unrelated panels/popovers/HUD/minimap/cards at equal
  visual weight
- ❌ Stacked popovers or popover-over-modal without closing/dimming the previous
  surface
- ❌ Blocking composer/modal without dim, scrim, or suppressed parent
  interaction
- ❌ One-off topology `clamp(...)`, shadow, radius, z-order, easing, or duration
  without a `--topology-*` token and verifier marker
- ❌ Overlap tolerated because the surface "mostly still works"; overlap count
  must be `0` for fixed/card surfaces in the tested state

## Motion principles

- Initial load: `opacity 0 → 1` + `translateY 8px → 0` (spring)
- Hover: border opacity rises, connected edges brighten — no scale or glow
- Drawer: right-side `x: 100% → 0` spring
- Filter toggle: deselected categories fade to `opacity 0.15`
- Background: fully static
- Respect `prefers-reduced-motion`

## Page header — English caption + Korean h1

The header on each operations page (currently `/ontology/edit` and `/ontology/insights`) follows a **two-line pattern**. The user-facing Korean title is the primary heading, and the English category caption serves as a micro identifier that yields one step in the visual hierarchy.

### Pattern

```
[English category caption — 9~10px / mono / uppercase / tracking 0.14em / quaternary color]
[Korean h1 — text-2xl / signature weight / primary color]
[Subtitle — Korean / sm / secondary color (optional)]
```

Example: `/ontology` page

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

### Intent

- **English caption** — A category-area identifier for the page. The mono + uppercase + spacing combo enables fast visual recognition of "where you are," but stays weaker than the main heading so the Korean h1 reads first.
- **Korean h1** — The name users actually call it. Korean is the primary heading, so all body copy / descriptions / CTAs maintain a consistent Korean tone.
- **Two-line separation** — Mixing English and Korean on a single line (e.g. "온톨로지 Ontology") is forbidden. Each line stays in a single language with a single tone.

### Legitimate English caption examples

- Page categories: `Ontology`, `Workspace`, `Manual node`, `Get started`.
- System metadata: `ID 추천`, `Beta`, etc. — only intentional English identifiers. Sentence-style English is forbidden (translate to Korean).

### Consistency rules

- Caption font size stays in the `9px ~ 10px` range. Tracking ranges from `0.10em ~ 0.18em`.
- Within a single page, keep caption tokens consistent (mono / uppercase / tracking / color). System tokens will eventually be unified under a CSS var like `--font-caption-mono`.
- Use the English caption only once per page (top header). Don't repeat English category labels in the body — avoid duplicating the visual hierarchy.

### Surfaces where this applies (current)

`/ontology/edit`, `/ontology/insights` — all follow the same pattern.

The public surfaces `/`, `/topology`, `/docs`, `/projects`, `/project/[slug]` use the standalone Korean h1 pattern (without an English eyebrow caption) — these are the browse surfaces, not the operations surfaces.

## Changelog

- 2026-07-18: v2 — B2+ "Circuit × Constellation" 언어를 페이지 롤아웃 규범으로 승격 (언어 6축 · 토큰 tier 카탈로그 · surface class 별 do/don't · v2 금지 추가 · 롤아웃 가드 · 토큰 drift 부채 감사); see [`TOPOLOGY-V2-DESIGN.md`](./TOPOLOGY-V2-DESIGN.md)
- 2026-06-08: Added topology node-focus & scale pattern (ego popover, overview-first, plain-language counts, LOD perf path); see [`TOPOLOGY-FOCUS-AND-SCALE.md`](./TOPOLOGY-FOCUS-AND-SCALE.md)
- 2026-04-13: Removed the consulting category
- 2026-04-12: Initial draft (Phase 0)
