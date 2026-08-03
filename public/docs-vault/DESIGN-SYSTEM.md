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
decorative gradients. The product value comes from a stable task handoff over
the same local markdown graph:

- **Topology + INDEX** — overview, selection, path/focus, reachability, and
  source evidence.
- **Workshop** — one typed relation write at a time, backed by frontmatter or a
  read-only MCP packet.
- **Insights** — five maintenance questions with one active panel and a
  tab-scoped agent handoff.

The retired tree/ego hub and ERD Builder are not alternate modes. Headers,
cards, and navigation preserve the selected concept while moving between
Topology inspection, Workshop writing, Insights maintenance, and source docs.

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
| **선택·전개 사다리 (Selection ladder)** | `--topology-v2-indigo`(노드 선택, **실선**) · `--topology-v2-edge-selected`(엣지 페어 포커스, pale 인디고) · `--topology-v2-expanded-cohort`(전개 코호트, **탈채도 인디고 파선**) | 세 상태가 **같은 인디고 축** 안에서 채도·값·기하(실선/파선)로만 갈린다 — 새 hue 추가 금지. 전개 코호트 = 클러스터 칩(`+N`)으로 드러난 직속 자식의 소속 링(부모는 채도 있는 인디고 파선 오라로 주인공 유지). 소유자 요청 "확장한거는 선택 파란색과 다르게 구분" 의 헌장 내 답 |
| **Density · geometry (밀도)** | `--topology-v2-radius-*` · `--topology-v2-layout-ring-*` · `--topology-v2-edge-bow/-blend-*` · `--topology-v2-star-count` · `--topology-v2-dust-area-per-point` · `--topology-v2-safe-inset-*` · `--topology-v2-panel-width/-pad/-gap/-radius/-row-radius` · `--topology-v2-label-max-width` | world-unit 숫자(단위 없음, canvas 소비)와 px(DOM 소비)가 섞여 있다 — 주석의 소비처 표기를 지켜라 |
| **INDEX 패널 geometry** (B3) | `--topology-index-width`(300px) · `--topology-index-tab-width`(26px) · `--topology-index-inset`(= `--chrome-inset`, 24px) · `--topology-index-top`(84px) | `TopologyIndexPanel`/`TopologyIndexTab` 전용 — px, DOM 전용(canvas 미소비). 표면/보더/그림자/패딩은 새로 만들지 않고 위 `--topology-v2-panel-*` (Surface tier) 재사용. `-top` 은 owner live-QA 결함 수정 — `topology-top-left-chrome-group` (Relief 브랜드 pill) 이 이미 top-32px 대를 쓰므로 INDEX/tab 은 그 아래(`TopologyAnalysisBar` 가 쓰던 동일 clearance)에서 시작 |
| **Motion** | `--topology-v2-camera-*`(spring/damping/momentum/flick/**-max-zoom-ratio**) · `--topology-v2-altitude-*-ratio` · `--topology-v2-overview-entry-ratio` · `--topology-v2-focus-*` · `--topology-v2-emphasis-*-tau` · `--topology-v2-ripple-stagger-ms` · `--topology-v2-breathe-*` · `--topology-v2-pulse-duration-ms` · `--topology-v2-tip-fade-ms` · `--topology-v2-edge-pulse-speed[-ego]` · `--topology-v2-drag-tug-1hop/-2hop` | 캔버스 유체성 전용. DOM chrome 은 기존 `--topology-motion-*` (180/420/720ms) 사용. `camera-max-zoom-ratio` 는 뷰포트-상대 실효 줌 상한(C1 A1), `drag-tug-1hop/-2hop` 은 노드 드래그 시 이웃 전파 계수(C1 B1). 다이브줌 fix: `camera-spring-angfreq` 가 `-interactive`(15, 휠 줌 스케일축+팬, 크리스프)/`-transition`(4.7, 포커스 다이브·해제·재배치·fit-view, 시네마틱 1.0s)로 분리 — 이전 단일값(2.941)은 휠 줌마저 다이브만큼 느리게 느껴지게 했다. `focus-bbox-margin` 은 이제 곱셈 비율(1.15, 이전엔 고정 70px) — 다이브가 ego bbox 전체를 필요 이상으로 깊게 확대하던 문제(owner: 과확대·라벨 충돌)를 고쳤다. **`camera-pan-leash`**(2026-07-29)는 초점이 없을 때 카메라가 **핏에서** 벗어날 수 있는 월드 반경 — `0`(기본) = 꺼짐 = 종전 봉투(월드 bbox ± 320). 「지도 맞추기」 크롬이 없는 표면만 켠다(관문 `/download` = 220): 되돌릴 길 없는 화면에서 되돌릴 수 없는 팬을 허용하면 무대가 빈 채로 남는다(실측 2026-07-29: 왼쪽 한 번 세게 끌면 예약 컬럼 밴드의 잉크 +12.6%, 12초 뒤에도 감쇠 0 → 목줄 후 −0.09%). 기준점이 bbox 가 아니라 **핏 자체**라 볼트 크기와 무관하다 — `computeUnfocusedPanBounds` |
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
- 다크 단일 — 2026-07-19 라이트 모드 전면 폐기 결정 이후 이 패밀리는
  다크 값만 정의한다 (아래 가드 참조).

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
  숫자. v2 numeral 값을 그대로 복사한 다크 전용 값.
- `--kind-glyph-stroke-{project,domain,capability,element}` /
  `--kind-glyph-fill-{project,domain,capability,element}` /
  `--kind-glyph-edge-contains` / `--kind-glyph-edge-relates` — kind 글리프
  미니어처(hex/칩/원/pad)와 trace 잉크. v2 node/edge-mark 값을 **복사**
  (var() 참조 아님 — P6 `--topology-v2-` grep 계약 유지). 소비처:
  `src/views/download/ui/DownloadPage.tsx` 의 소개 섹션
  (구 LandingPage, root-first-open Slice 2 로 이관 — 마커
  `data-token="engraved-numeral"` / `data-token="kind-glyph"`).
- 소개 섹션 evidence 미니어처 census 숫자의 진실원:
  `src/views/download/model/dogfood-census.generated.ts` —
  `scripts/build-docs-vault.mjs` 가 dogfood vault frontmatter 에서 생성.
- **그림자 사다리 — 3단 + 도킹 2단 + 눌림 1단** (2026-07-28 재수렴 완료)

  | 토큰 | 역할 | 값 |
  |---|---|---|
  | `--shadow-elevation-1` | coach-mark — 캔버스 힌트 · 툴바 · 인라인 · 카드 호버 · 토스트 | `0 18px 40px` |
  | `--shadow-elevation-2` | popover — 앵커된 패널 · 팔레트 | `0 24px 72px` |
  | `--shadow-elevation-3` | dialog — 스크림 동반 중앙 모달 | `0 24px 80px` |
  | `--shadow-elevation-dock-bottom` | 화면 **하단**에 붙은 표면(탭바) | `0 -12px 32px` |
  | `--shadow-elevation-dock-side` | 화면 **측면**에 붙은 표면(서랍 · 사이드 패널) | `-20px 0 48px` |
  | `--shadow-control-press` | 눌린 컨트롤 — 떠 있는 정도가 아니라 다른 역할 | `0 5px 12px` |

  **도킹 단이 왜 예외가 아니라 층인가**: 위 3단은 전부 아래로 떨어지는
  그림자(y 양수)다. 화면 가장자리에 붙은 표면은 그 그림자가 화면 밖으로
  나가 가시 단서가 0 이라 그 전제가 성립하지 않는다. 그래서 손으로 두 번
  만들어졌고 **값이 서로 달랐다**(`0 -16px 36px` vs `-24px 0 60px`, 게다가
  오프셋 없는 `0 0 24px`·`0 0 48px` 변종까지). 등재되지 않은 6번째 층이었다.
  두 방향은 같은 blur·같은 알파를 쓴다 — 축만 다르고 층은 하나다.

  **재확산의 역사**: 이 사다리는 한 번 8종을 3단으로 수렴시켰다가 **23종으로
  다시 흩어졌다**. lint 가 값 안에 `var(` 가 있으면 통과시켜서 *색만 토큰이고
  기하는 자유*인 상태가 됐기 때문이다. 그 안에 광원 역전 2건과 계층 역전
  1건(blur 90 > dialog 80)이 있었다. 이제 게이트는 `var(` 유무가 아니라
  **어느 토큰인가**(기하 허용목록)를 본다 — 23 → 0.

  JSX 에 새 drop-shadow 를 손으로 적지 않는다. 새 역할이 정말 필요하면
  **토큰 신설 PR 을 먼저** 낸다.

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
- **before/after 스크린샷은 다크** 첨부 (git.md PR 규칙 — 앱은 다크 단일,
  2026-07-19 라이트 모드 전면 폐기).
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
- `render/node-shapes.ts` 의 `drawEngraved()` — 음각 숫자 폰트 `600 ${size}px ui-monospace…`
  패밀리/웨이트 hardcode(심볼 이름 참조, 2026-08-01 정정 — 이전엔 `:201` 행 번호를
  가리켰는데 코드가 옮겨지면 조용히 틀린 곳을 가리키게 된다).
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

## 노드 규격 (Node Spec, 2026-08-01)

> 토큰 **이름**(`--kind-glyph-*`, `--topology-v2-radius-*`)은 이미 있었다. 이
> 절이 채우는 건 그 이름이 **무엇을 뜻하는지** — 형태 매핑의 이유, 반지름이 왜
> 그 값인지, 크기가 왜 자식 수를 따르는지, 숫자가 언제 뜨는지. 소유자 지시
> (2026-08) "노드 규격이나 정보들도 다 디자인 시스템에 들어가야" 에 대한 답.
> 코드 참조는 **심볼 이름**으로 한다 — 행 번호는 코드가 한 줄만 옮겨도 조용히
> 틀린 곳을 가리킨다(바로 위 "부채" 절의 `node-shapes.ts:201` 참조가 그
> 실패 사례였고, 이 절을 쓰며 심볼 이름으로 고쳤다).

### 1. 형태 — kind 는 색이 아니라 도형

**채널 선택 자체가 규격이다.** 범주(kind)를 구분하는 시각 변수로 색 대신
형태를 쓴다. 이 저장소가 이미 인용해 온 Jacques Bertin, *Sémiologie
graphique* (1967) 의 논증대로 **색상(hue)은 순서를 표현하지 못한다**
(`.claude/agents/design-infoviz.md`). 이 앱은 hue 를 이미 두 가지 다른 뜻에
예약해 뒀다 — 명도/깊이 사다리로 **위계**(project ⊃ domain ⊃ capability ⊃
element, 아래 "지도 잉크 사다리" 절)를, 색 자체로 **상태**(신호 톤 3종 +
전원/펄스)를 나른다. kind 라는 순서 없는 범주 구분에 세 번째 hue 의미를
얹으면 이미 일하고 있는 두 채널이 오염된다 — 그래서 kind 는 형태로 나른다.

| kind | 형태 | 캔버스 소스 | DOM 소스 |
|---|---|---|---|
| `project` | 육각(hex) 플레이트 | `hexPoints()` → `bodyPoints()` (`render/node-shapes.ts`) | `<polygon>` (`shared/ui/topology-v2-kind-glyph.tsx`) |
| `domain` | 사각 칩 (pin-tick 다리 4개) | `squarePoints()` → `bodyPoints()` | `<rect>` |
| `capability` | 원 (형태 변형 없음) | `bodyPoints()` → `null`(이미 원) | `<circle>` |
| `element` | 사각 + 중앙 via-hole(드릴 홀) | `bodyPoints()` 바디 + `draw()` 안 별도 via 아크 | `<rect>` + 중앙 `<circle>` |

**두 게이트웨이가 반드시 같은 매핑을 그린다** — 표에 적는 것만으로는 안
지켜진다(§"규격은 lint 로 강제된다" 원칙 그대로). 각 파일은 자기 안에서만
일관성을 검증해 왔다(`node-shapes.test.ts`, `topology-v2-kind-glyph.test.tsx`)
— 두 파일이 **서로** 같은 매핑인지는 아무 것도 안 보고 있었다. 계약 테스트
`tests/contract/node-kind-shape-parity.contract.test.ts`(2026-08-01 신설)가 그
자리를 메운다: 프로브로 한쪽 매핑을 깨뜨려 실패를 확인했다(도메인 실루엣을
원으로 바꿔 그리게 만들면 즉시 적발).

형태는 `farT`(원거리 진행도)에 따라 원으로 수렴한다 — `FULL_CIRCLE_FAR_T =
0.985` 를 넘으면 무조건 원. 모서리 반지름은
`interpolateCornerRadius(minCornerRadius(kind, r), r, farT)` 로
`minCornerRadius`(kind 별 최소 모서리 비율 — 예: project 는 반지름의 14%)에서
`r`(완전한 원)까지 보간한다 — 실루엣 스왑이 아니라 연속 모프
(`docs/TOPOLOGY-V2-DESIGN.md` §3.1).

장식(pin-tick·via-hole·이중 헤어라인)은 실루엣이 아니라 재질 표현이고,
반지름·`farT` 게이트 아래서만 그려진다(원거리에서 소멸). 임계값은
`node-shapes.ts` 상단 상수 블록(`DOMAIN_PIN_MIN_HALF_EXTENT` 등)이 단일
출처다 — 이 문서에 값을 복제하지 않는다(복제는 드리프트의 시작, Carbon).

노드 아이콘 세트(기하/라인, 아래 "개인화" 절 #21)는 이 매핑을 절대 바꾸지
않는다 — 렌더 **스타일**(`glyphStyleDescriptor`)만 fill+sheen ↔ stroke-only
로 바뀐다.

### 2. 반지름 — 고정 사다리

| kind | 월드 반지름 | 토큰 |
|---|---|---|
| project | 30 | `--topology-v2-radius-project` |
| domain | 17 | `--topology-v2-radius-domain` |
| capability | 11 | `--topology-v2-radius-capability` |
| element | 7 | `--topology-v2-radius-element` |

`radiusForKind()`(`ui/topology-world.ts`)가 단일 조회 지점. 값 자체는 위계를
엄격한 전순서로 지키는 **디자인 결정**이라 lint/계약 테스트가 판정할 수
없다 — 바꾸려면 "지도 잉크 사다리" 절이 거친 것과 같은 근거 수준(45라운드
연구 + 체계석 판정)의 재수렴이 필요하다.

정사각형이 원보다 눈에 커 보이는 문제를 반지름 축소로 보정한다 —
`DOMAIN_HALF_EXTENT_RATIO = 0.86`(도형 반각 = 원 반지름의 86%), element 는
92%. 같은 `r` 값이어도 사각형의 코너 면적이 원보다 커서 광학적으로 부풀어
보이기 때문이다 — 광학 보정이라 램프가 아니라 상수로 남는다(spacing 광학
보정을 강제하지 않는 것과 같은 이유, §"규격은 lint 로 강제된다" "spacing 은
강제하지 않는다" 참고).

### 3. 크기 스케일 — magnitudeScale (자식 수가 크기가 된다)

`computeMagnitudeScale(kind, childCount, maxChildCount, k)`
(`ui/topology-world.ts`)가 단일 출처:

```
scale = clamp(1, 1.4, 1 + k × (√childCount − 1) / √maxChildCount)
```

- **domain·capability 만 스케일된다.** project 는 vault 당 보통 1~수 개라
  상대 크기 비교가 의미 없고, **element 는 정의상 항상 잎(leaf)이라
  `childCount` 가 늘 0** — 함수가 `kind !== "domain" && kind !== "capability"`
  를 먼저 걸러 `1`(base)을 즉시 반환한다. "잎은 왜 1.0인가"의 답은 이거다:
  잎에게는 나를 수 있는 자식 수 자체가 없다.
- **`childCount ≤ 1` 도 base(1.0)** — 구 로그 압축은 중앙값 미만 노드를
  base **아래로** 줄여 "작은 노드"라는 잘못된 신호를 만들었다. 지금은 항상
  base 이상이라 "이 노드가 유난히 크다"만 신호하고 "유난히 작다"는 신호하지
  않는다.
- **왜 √ 인가** — 로그보다 완만해 격차를 과하게 누르지 않으면서도 큰 차이는
  압축한다. 순위 단서("어디가 큰가")를 주는 것이 목적이지 막대그래프처럼
  비례를 주장하지 않는다(Shneiderman overview-first — 세부 비교는 클릭
  이후의 몫).

  ⚠️ **2026-08-01 실측 정정**: `app/globals.css` 의
  `--topology-v2-radius-magnitude-k` 토큰 주석이 이 절을 쓰기 직전까지 "로그
  압축"이라 적혀 있었다 — 실제 구현(`computeMagnitudeScale`)은 이미 **√
  (제곱근)** 압축으로 바뀐 뒤였고, 주석만 안 따라왔다. 같은 사실이 두 곳
  (코드 주석 + 이 문서가 될 뻔한 공백)에 적히면 한쪽만 고쳐지고 다른 쪽은
  조용히 틀린 채 남는다는 예시라 여기 남긴다. 주석은 이 발견과 함께
  고쳤다.
- **1.4 상한** — 원거리(overview)에서도 최대·최소가 같은 kind 사다리 안에
  머물게 한다(예: 아무리 커도 domain 이 project 보다 커 보이면 위계가
  뒤집힌다).
- `k = --topology-v2-radius-magnitude-k`(0.45, `app/globals.css`) — 스케일
  강도. 이 값을 바꾸면 모든 domain/capability 노드 크기가 재계산되므로 0.45
  자체는 시안 확정값(임의 조정 전 소유자 승인 필요).
- **뱃지 숫자(§4)와는 다른 채널이다** — 크기는 `childCount`(직속 자식만),
  숫자는 `descendantCount`(전체 후손). 같은 화면에서 "크다"와 "숫자가
  크다"가 다른 답을 줄 수 있다 — 의도된 이중 채널(사전주의 크기 + 판독
  숫자).
- 게이트: `ui/topology-world.test.ts` 의 `computeMagnitudeScale` describe
  블록 — project/element 불변(=1) · 클램프 상하한 · `childCount ≤ 1` 시
  base · `maxChildCount`/`k = 0` 방어.

### 4. 각인 숫자 — 언제, 무엇을 세나

`drawEngraved()`(`render/node-shapes.ts`)가 1px 다크 섀도 + 밝은 면으로
"각인"(인쇄가 아니라 눌러 새긴 것처럼) 그린다. 표시 조건은 **셋 다** 만족해야
한다:

1. **kind 가 project 또는 domain 뿐** — capability/element 는 절대 안 뜬다
   (`topology-frame-draw.ts` 의 `showCount`).
2. **화면 반지름이 `ENGRAVED_COUNT_MIN_RADIUS`(13px) 초과** — 원거리에서
   숫자가 글리프보다 커지는 것을 막는다.
3. **`farT < 0.9`** — 원거리(성도) 진입 시 소멸.

숫자 값은 `node.count = descendantCount`(전체 후손 수, §3 의 `childCount`
와 다른 채널) — `ui/topology-world.ts`. project 의 숫자는 amber(허브와 같은
Layer-0 톤)로, domain 은 중립 톤으로 그린다(`draw()` 안 `numeralTokens`
분기).

게이트: 표시 조건(kind·반지름·`farT`)은 `node-shapes.ts` 상수 +
`topology-frame-draw.ts` 의 `showCount` 조건문이 단일 출처. 리터럴 값(13,
0.9) 자체의 회귀를 잡는 계약 테스트는 **아직 없다** — 부채로 남긴다(후속:
`ENGRAVED_COUNT_MIN_RADIUS` 를 export 해 스냅샷하는 짧은 단위 테스트).

### 5. 브릿지 노드 — 자리 예약, 값 미정 (2026-08)

데이터 쪽이 **브릿지 노드**(두 프로젝트/도메인을 잇는 관계의 1급 표현)를
규격에 들이는 중이고, 시각 표현(소유자 요청 "빛나게 / 붉은 테두리")은 이
헌장 안에서 대안을 찾는 중 — **도해석(`design-infoviz`) 판정 대기**. glow 는
이미 금지 목록에 있고(`forbidden.md`), 붉은 테두리는 error 신호 톤과 겹쳐
오독을 만든다. 이 절이 지금 정하는 것은 **자리와 게이트**뿐, 값이 아니다:

- 형태 매핑 표(§1)에 다섯 번째 행이 필요할 수 있다 — 브릿지가 새 `kind`
  인지, 기존 kind 위의 부가 마커(예: 엣지 자체의 새 강조)인지는 데이터 쪽
  결정을 따른다.
- **값이 확정되면 이 절이 아니라 §1~§4 본문에 편입한다** — "브릿지 전용
  절"로 격리하지 않는다. 격리하면 다음 감사가 "왜 브릿지만 따로 있지"를
  또 묻는다.
- 게이트는 **`node-kind-shape-parity` 와 같은 패턴**(캔버스 게이트웨이 + DOM
  게이트웨이 동시 갱신 + parity 테스트 확장)을 따른다 — 한쪽만 고치고
  끝내면 지도와 INDEX/공방/팝오버가 갈라진다.
- 색을 새로 쓴다면(도해석이 승인한다면) 이미 넷으로 갈라진 amber 규율에
  **다섯 번째**를 더하는 것이다(`.claude/rules/design.md` "amber 는 네
  갈래" 절 — 허브 · 브랜드 마크 · kind tone · 발자국 트레일). 같은 PR 에서
  그 절과 아래 "Three ambers, three rules" 표(2026-08-01 기준 3행뿐 —
  발자국 트레일이 아직 이 표엔 없다, 별도 부채로 등재)를 함께 갱신한다.

## Brand mark — "헥사 별자리" (candidate A, confirmed 2026-07-18)

> 소스: `docs/prototypes/app-icon-concepts.html` (후보 A, 48px 마스터 + 20px
> 축소판). 구현: `src/shared/ui/brand-mark.tsx` (`BrandMark`).

The mark reuses the same shape vocabulary as the v2 kind glyph above instead of
inventing a new one: a **hexagon** (= project shape, §2.3 "kind = shape, not
color") with **six vertex nodes** (graph nodes) and **spokes** converging on a
**center hub** — the hub is stroked amber, the same single-exception amber
tone as the v2 hub ring (§2.3.6, `--color-status-warning` family /
`#d4b478`). Large it reads as a constellation graph; small it collapses to
the hexagon — the mark is never a separate pictogram bolted onto the product,
it's the same shape language shrunk to a badge.

**Two detail levels** (`BrandMarkProps.detail`):

- `"full"` (default) — spokes + six vertices + hexagon + amber hub. Use at
  ≥32px — nav rail avatars, in-app headers, marketing surfaces.
- `"compact"` — hexagon outline + amber hub only, spokes/vertices dropped.
  Use at ≤24px (favicon, macOS Dock at small sizes, dense chrome) where thin
  spokes would just be noise.

**Color contract**: lines and vertices use `currentColor` so a caller can tone
the mark via CSS `color` (e.g. dim it inside a disabled state) — this is the
one shared-UI SVG allowed to do that, because it is a monochrome brand glyph,
not a data mark. The amber hub is a fixed constant
(`BRAND_MARK_AMBER = '#d4b478'`) exported alongside the component, because it
carries fixed brand meaning (hub node) independent of surrounding text color.
Static, non-React SVG/PNG exports (`app/icon.svg`, macOS `.icns`/`.ico`) can't
inherit CSS `currentColor`, so those bake the same indigo (`#8b97ff`) +
`#d4b478` amber as literal fixed values — this is the one place hardcoded hex
is correct instead of a token reference, because the file has no DOM to read
tokens from.

**Where it ships**:

| Surface | Asset | Detail |
|---|---|---|
| In-app avatars/headers | `<BrandMark />` (`src/shared/ui/brand-mark.tsx`) | full/compact via prop |
| Browser favicon | `app/icon.svg` | compact, transparent background |
| iOS/PWA home-screen icon | `app/apple-icon.png` (180×180) | full, dark squircle ground |
| PWA manifest icon | `public/brand-icon-512.png` | full, dark squircle ground |
| macOS `.app` bundle icon | `src-tauri/icons/{32x32,64x64,128x128,128x128@2x,icon}.png` + `icon.icns` + `icon.ico` | compact ≤64px, full ≥128px — same dark squircle ground as the PWA/apple icon (app-icon special case, §"Absolute rules" 예외: 앱 아이콘은 vertical gradient 배경 허용) |

Generation pipeline for the raster/macOS set: render the HTML composition
(squircle + inline mark SVG) at each exact pixel size with a headless
browser, then `iconutil`/hand-rolled ICO packer assemble `.icns`/`.ico` from
the renders — no separate rasterizer script; the browser is the renderer of
record so every size stays crisp instead of being scaled down from one master
raster.

## Cited lineage — where these rules come from

These rules are an applied reading of public, citable design thinking, not arbitrary taste.
Full grounding + verified links in [`FOUNDATIONS.md` §4](./FOUNDATIONS.md#4-design-lineage--restraint-as-craft-cited).

| Our rule | Descends from |
|---|---|
| Neutral greys + single indigo; ban glow/neon/gradients/glassmorphism | **Dieter Rams**, *Ten Principles* — "unobtrusive / honest / as little design as possible" ("Less, but better") |
| Every visual mark encodes a typed fact and asserts no fact the data lacks | **Jock Mackinlay** (ACM TOG 1986) — expressiveness + effectiveness. This is the bench's rejection rule |
| Honest, proportional relation rendering; a legend means the mark cannot explain itself | **Edward Tufte** — graphical integrity + direct labelling. **Not** data-ink as a rule: Inbar 2007 and Bateman 2010 tested it and it did not hold ([FOUNDATIONS](FOUNDATIONS.md#4-design-lineage--restraint-as-craft-cited)) |
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

## 에이전트가 소비하는 층 — 이 문서를 누가 읽는가 (2026-08-01)

> 소유자 지시(2026-07-31 기준 최신 실천 조사) — "에이전트를 위한 디자인
> 시스템"이 이 제품의 정체성(`AGENTS.md` "agent-native, human-sovereign")과
> 직결된다는 지적. 아래는 웹 조사 결과를 이 저장소의 현재 상태에 **대입한**
> 격차 분석이다 — 남의 목차를 옮긴 게 아니라, 이미 있는 것 / 없는 것 / 필요
> 없는 것을 가른 결과다. 출처는 각 항목에 남긴다(공개 발행물만, 자산 모방
> 없음).

**이 절이 말하는 "에이전트"는 이 저장소를 파일시스템으로 직접 여는 코딩
에이전트(Claude Code · Codex)다.** Figma MCP·Astryx JSON 매니페스트가 상정하는
**저장소 밖에서 API 로만 접근하는 에이전트**와 전제가 다르다 — 그 차이가
아래 각 판단을 가른다.

### 이미 있다 (2026 업계가 "빠졌다"고 지적하는 것들)

| 업계가 지적하는 실패 패턴 | 이 저장소의 답 | 근거 |
|---|---|---|
| "문서·토큰·컴포넌트가 서로 다른 말을 해 에이전트가 뭐가 맞는지 못 가른다" | **단일 진실원 원칙 + lint 강제** — 토큰은 `app/globals.css` 한 곳, 이 문서는 값을 복제하지 않고 이름만 인용, `no-restricted-syntax` 가 하드코딩을 기계적으로 막는다 | `.claude/rules/design.md` "규격은 lint 로 강제된다"·Carbon 인용 |
| "에이전트는 프롬프트가 명시한 것만 가져오고 나머지(spacing·타이포·컬러 램프)는 추측으로 채운다" | **조건부 규칙 자동 로딩** — `src/**/*.tsx` · `app/**/*.css` 를 열면 `.claude/rules/design.md` 가 프롬프트가 요청 안 해도 세션에 자동으로 실린다 | `CLAUDE.md` 규칙 로딩 표, `tests/contract/rules-path-scope.contract.test.ts` |
| "문서 drift 를 감시되는 실패 모드로 다뤄야 한다" | **계약 테스트가 값이 아니라 관계(별칭·parity)를 감시한다** | `topology-ink-contrast.contract.test.ts`(별칭), `node-kind-shape-parity.contract.test.ts`(§"노드 규격") |

(2026-08-01 조사: [Design Tokens Community Group 표준 안정화](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/) · ["Your Design System Is Not Ready for AI Agents"](https://www.intodesignsystems.com/blog/design-system-not-ready-for-ai-agents) · [DESIGN.md 포맷](https://github.com/google-labs-code/design.md).)

### 새로 채웠다

- **캔버스는 DOM 이 없다 — 에이전트가 "보는" 유일한 창구는 `window.__atlasMap`**
  (`?e2e=1` 게이트, `ui/use-topology-loop.ts`). 노드 좌표·`draggable`·카메라·
  선택·클러스터 칩의 "주장 대 실제"를 typed 값으로 낸다. 2026 업계 논의는
  캔버스/WebGL 자동화를 대개 **화면 픽셀을 보는 컴퓨터 사용 에이전트**로
  우회하는데, 이 저장소는 소스에 직접 접근하는 에이전트라 스크린샷 왕복 없이
  **타입드 훅**으로 같은 문제를 더 싸고 결정적으로 푼다 — 2026-07-31 사고
  (커서를 훑어 배경을 노드로 착각, "안 느린데요" 오답 6연속)의 직접 처방.
  게이트: `tests/contract/map-testability.contract.test.ts`. 이 훅은 코드
  주석에만 있어 이 문서 독자에게는 존재하지 않는 것과 같았다 — 이 단락이
  그 등재다. 노드의 **형태/반지름/크기 규격**(위 "노드 규격" 절)은 이 훅이
  직접 노출하지 않는다 — 화면 좌표/상호작용 가능 여부만 훅의 몫이고, 형태
  규격은 kind 로부터 §1~§4 의 정적 계약을 따라 유도한다.
- **노드 규격의 코드 참조를 심볼 이름으로 바꿨다**(위 절 전체 + "부채" 절의
  기존 행 번호 참조 1건) — 행 번호는 코드가 이동하면 조용히 틀린 곳을
  가리킨다.

### 필요 없다고 판단했다 (그리고 왜)

- **W3C DTCG(Design Tokens Community Group) JSON export.** 2025.10 에 첫
  stable 버전이 나왔고 24개 이상 조직이 후원하며 툴 생태계도 넓다 — 하지만
  그 표준이 푸는 문제는 **Figma ↔ Style Dictionary ↔ 코드 사이의 왕복**이다.
  이 저장소엔 그 왕복이 없다(디자인 툴 소스가 없다 — 시안은 정적 HTML,
  `docs/prototypes/*.html`). DTCG JSON 을 새로 만들면 `app/globals.css` 와
  값이 **두 곳에 적힌다** — 이 문서가 반복해서 반려해 온 바로 그 패턴이다.
  소비자가 생기면(예: 실제 Figma 라이브러리 도입) 그때 `globals.css` 로부터
  **생성**하는 스크립트를 추가한다(손으로 유지되는 두 번째 진실원은 금지,
  빌드타임 파생은 허용 — `docs-vault:build` 와 같은 패턴).
- **컴포넌트 JSON 매니페스트(Meta Astryx 류).** 이건 "에이전트가 컴포넌트
  라이브러리에서 골라 조립"하는 앱-빌더용 패턴이다. 이 제품은 사람+에이전트가
  같은 저장소의 TSX 를 직접 고쳐 쓰는 단일 애플리케이션이라 "고를 컴포넌트
  목록"이 아니라 "지킬 규칙"이 필요하다 — 그 역할은 이미 `.claude/rules/
  design.md` + lint + 계약 테스트가 한다. 매니페스트를 새로 만들면 그 셋과
  네 번째로 같은 사실을 다르게 말하는 자리가 생긴다.
- **별도 `DESIGN.md`(Google Labs 포맷) 도입.** 그 포맷이 푸는 문제(기계가
  읽는 YAML 토큰 + 사람이 읽는 산문 근거를 한 파일에)는 이 저장소가 이미
  다른 배치로 푼다 — 토큰은 `app/globals.css`(CSS 자체가 이미 기계가 파싱
  가능한 포맷), 근거는 이 문서(사람이 읽는 프로즈). 셋째 파일을 얹으면
  "토큰이 정말 이 값인가"를 확인할 곳이 세 곳이 된다. 에이전트가 이미
  리포를 직접 Read 하므로, 별도 매니페스트가 원격 에이전트에게 주는 이득
  (조회 비용 절감)이 이 컨텍스트에는 없다.
- **컴포넌트별 "명시적 안티패턴" 메타데이터 필드.** 업계 사례(Spotify Encore
  류)는 컴포넌트 수십~수백 개를 가진 **라이브러리**의 문제다. 이 저장소의
  "안티패턴"은 이미 한곳에 있다 — "Anti-AI Design Criteria" 절(아래) +
  `forbidden.md`. 컴포넌트마다 흩어 놓으면 그 자체가 새 드리프트 표면이다.

## Design tokens

Defined via Tailwind 4's CSS-based `@theme`. See `app/globals.css` for the actual implementation.

### 스케일 고정 계약 (2026-07-24, 소유자 확정 — "지금 이대로 고정")

크기 계열 4연속 처방(zoom 제거 → 필 36 → Pretendard → twMerge 오분류 근본
수정 → 레일 20 통일) 후 소유자가 현 스케일을 표준으로 고정했다. 아래 값이
전 페이지의 크기 기준선이며, 이탈은 결함이다:

| 항목 | 고정값 | 토큰/출처 |
|---|---|---|
| 크롬 필/타일 높이 | **36px** | `--chrome-tile-size` |
| 크롬 라벨 | **11px** (`text-label`) | ChromeChip/상태 칩 |
| 레일 아이콘 | **20px 단일** (로고만 26) | `--app-nav-rail-icon-size` |
| ≥1920 배율 | **1:1 (zoom 없음)**, 2400+만 1.1 | `.topology-ui-scale` |
| 본문 폰트 | **Pretendard Variable** (셀프호스팅) | `--font-sans` |
| 타입 램프 | caption 9.5 · label 11 · body 12.5 · body-lg 14 · title 16 · display 23 · hero 30 | `--text-*` |
| 행간 램프 | 크기와 1:1 짝 14 · **16** · 20 · 22 · 24 · 28 · 34 + 자유 2(1.06 · 1.7) | `--leading-*` |
| 행간 결합 | 크기 스텝이 **자기 행간을 싣는다** (companion) — 크기만 조건부로 바꾸면 짝이 어긋난다 | `--text-*--line-height` |

주의: 타입 램프 유틸은 `cn()`(`src/shared/lib/cn.ts`)의 extendTailwindMerge
등록과 **반드시 동기** — 미등록 스텝은 색상으로 오분류되어 크기가 조용히
드롭된다(2026-07-23 크롬 16px 렌더 사고의 근본 원인, cn.test.ts 가 가드).
행간 램프도 같은 파일에 등록한다(`LEADING_RAMP_STEPS`) — 이쪽은 드롭이 아니라
**충돌 병합 실패**라 조건부 분기가 조용히 안 먹는다. 크롬 라벨의 `leading-4`
(16px)는 `--leading-label` 과 같은 값이라 잠금 계약이 그대로 유지된다.
루트 16px 상속으로 렌더되는 텍스트 표면은 전부 램프 미적용 결함이다.

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
- `--color-text-on-accent`: `#ffffff` — **채운 인디고 «위»의 전경.** 위 넷은 전부
  어두운 바탕용이라 채움 컨트롤 위에서는 하나도 못 쓴다. 새 hue 가 아니라 무채이고,
  `--color-indigo-brand` 위 대비 **4.71:1** 로 WCAG AA(4.5:1) 통과. 값 층에서는
  `controlClass({ tone: 'onAccent' })` 로만 나간다.

### Accent (the only color)

- `--color-indigo-brand`: `#5e6ad2`
- `--color-indigo-accent`: `#7170ff`
- `--color-indigo-hover`: `#828fff`

### Signal tones (3, symmetric ladders)

Design Guardian verdict, `.qa-scratch/audit-2026-07/guardian-color-verdict.md`
§① (2026-07-20): **신호 톤은 3종이다 — warning(amber) · error(red) ·
success(emerald).** Each is a solid status dot plus a symmetric
surface/border/text alpha ladder built on ONE hue. These are the only
chroma exceptions to the neutrals + single-indigo charter; they explain
*state*, never decoration. Do not add a 4th signal tone without an
explicit charter update backed by the same reasoning (a status primitive
with dot + surface + text siblings, not a one-off accent).

- **warning** — `--color-status-warning` (`#f4b731`) · `--color-amber-source-a*`
  surface ladder · `--color-amber-signal-a*` (forbidden.md-documented "방금
  추가됨" pulse variant) · `--color-amber-source-text-a*` pale text.
- **error** — `--color-status-danger` (`#e5484d`) · `--color-danger-a*` surface
  ladder · `--color-danger-text` / `--color-danger-text-strong`.
- **success** — `--color-status-success` (`#32b97d`, re-pointed 2026-07-20 from
  the dot-only `#27a644` to the same hue as the surface ladder below) ·
  `--color-success-a*` surface ladder · `--color-success-text-a*` pale text.
  Use only for positive/confirm signals — "연결됨 / 쓰기 확인 / 완료" (MCP
  connected, relation-write confirm, agent-setup success, starter CTA,
  success toast). Tokenize-existing-only — do not add new success surfaces
  without a PO/design pass; a 4th free-floating green is the exact drift
  this ladder was created to close.

kind-tone (`entities/ontology-class/model/tone.ts`) and the amber-docs
quarantine family (`--color-amber-docs-*`, provisional — see
`app/globals.css` comment, not a sanctioned signal tone) are documented
separately below; they are data marks / an unresolved charter-tension
family, not signal tones.

### Evidence tier — "no document" is achromatic, on purpose (2026-07-26)

결정 표면(인사이트 랭킹 · 허브 · 「할 일」 큐)은 **자기 `.md` 를 가진 개념**과
**다른 문서가 이름만 적어 둔 근거**를 구분한다. 판정의 단일 출처는
`isEvidenceOnlyConcept` (`entities/knowledge-graph`) 이고, 표시는
`EvidenceOnlyBadge` (`shared/ui`) 한 벌이다.

- **배지는 무채색이다** — `--color-text-quaternary` 텍스트 + `--color-border-soft`
  보더. 신호 톤(amber)을 쓰지 않는 이유는 규모다: 도그푸드 289개념 중 193개가
  파생이라 amber 를 쓰면 한 화면에 배지가 수십 개 뜨고, 이는 헌장의 "앰버가 셋
  이상 보이면 결함" 을 정면으로 위반한다. 계층은 색이 아니라 **위치**(접힌 아래
  계층)와 조용한 라벨로 말한다.
- **행 높이를 흔들지 않는다** — `text-label`(11px) + `leading-4`(16px) 로 같은
  행의 본문(`text-body` 12.5px, 줄높이 ~19px)보다 낮게 유지한다. 실측: 배지 있는
  행과 없는 행 모두 39–40px (1512×950). 자세한 이유는 아래 *Dimensional
  regularity* 절.
- **계층 펼침 모션** — `.insights-disclosure-in` = 같은 표면의 탭 전환과 **같은
  키프레임·같은 토큰**(`panelCrossfadeIn` + `--motion-fast` 120ms). 새 키프레임
  0 · 새 duration 0. 아래로만 자라므로 위 행의 자리는 불변(실측 shift 0px).
- **막대는 두 계층이 같은 자를 쓴다** — 수는 같은 계산(`computeOntologyDependents`
  = MCP `blast_radius`)에서 나오므로 자를 따로 두면 같은 15가 두 목록에서 다른
  길이로 그려져 막대가 거짓말을 한다.
- **숨기기는 계층화가 아니다** — 강등된 행을 지우지 않는다. 규모는 토글 라벨이
  그대로 말하고(「… 193개 보기」), 개발자의 추적과 「문서 만들기」 승격 경로도
  남는다.

### Three ambers, three rules (the recurring audit false-positive)

Every colour audit re-opens this, because a grep for "amber" returns three
unrelated families. They are governed by different rules, and a finding is only
a defect if it names the right one:

| Family | Value | Rule |
| --- | --- | --- |
| **Hub amber** | `--topology-v2-amber-hub` / `BRAND_MARK_AMBER` `#d4b478` | One hub ring + one Layer-0 container, plus two written exceptions (agent focus ring, `?recent=` spotlight). A third on screen is a defect. |
| **Brand mark** | the same `#d4b478` in the nav-rail logo | Not an expansion — it is the product's mark, one instance per route, never data. Written down here so audits stop re-filing it. |
| **Kind tone** | `capability` `rgba(211,159,73,.94)` (amber) · `element` `rgba(124,166,141,.94)` (eucalyptus) | A **data mark**. Allowed only where colour is the sole identity channel — the kind-census strip, map dots, tree chips. Composition bars whose segments are already identified by order + adjacent numerals use the app bar grammar (indigo primary + neutral + 1px seam) instead. Never a surface, rail, or callout. |
| **Footprint trail** | `--color-footprint-trail` `#e8c47a` (2026-07-29, added) | Deliberately a DIFFERENT value from hub amber, not an extension of it — same family, split value, so "center" (hub) and "walked" (trail) never collapse into one meaning. Opt-in, default 0, `shadowBlur` capped 6px, single consumer (`shared/lib/footprint-glyph.ts`). Gate: `tests/contract/footprint-bloom-exception.contract.test.ts`. See `.claude/rules/design.md` "amber 는 네 갈래" for the full four-way rule. |

**Bar colour is neutral + one indigo.** Indigo marks the primary series only —
the leading row in a one-value ranking (`DomainCompositionGrid`), the capability
segment in a two-value composition (`DomainCapacityBar`). The boundary between
two segments is carried by a **1px seam** (a gap that lets the track colour
show through), not by hue: indigo against neutral measures 1.12:1, far under the
3:1 graphic threshold, so the separator has to be colour-independent — the route
WCAG 1.4.11 sanctions.

The earlier rule ("bar colour follows the number of series") granted every
two-series bar a licence for two chromatic data marks. Measured cost on
`/ko/projects` (1512 dark, 2026-07-26): 13 chromatic faces, 32,987px² of chroma,
the longest bar on the first-visit screen amber. Worse, the licensed pair failed
its own premise — amber against eucalyptus composites to **1.14:1** on the
track, so it never separated by luminance, only by hue, and that hue axis
(orange↔green) is the one red-green colour deficiency (~8% of men) cannot
resolve. Order (capability always left), the unit word, and the adjacent
numerals were already carrying identity three times over; the colour was
duplicate ink.

Verified live 2026-07-26 after the change (`/ko/projects`, 1512 dark): chromatic
faces 13 → **1** (the nav-rail brand mark), chroma area 32,987px² → 36px². The
insights 구성 tab keeps 4 kind-tone faces, all inside the 종류 census card where
the unlabelled stack strip has no other channel. `/ko/project/[slug]` renders
zero. None of these is `--color-status-success`; a green **status dot** would be,
and that is a separate, sanctioned signal. Decision record:
`.qa-scratch/domain-bar-color-2026-07-26.md`.

### Borders

- `rgba(255,255,255,0.05)` — subtle
- `rgba(255,255,255,0.08)` — default
- `rgba(255,255,255,0.12)` — strong

### Typography

- Primary: `Inter Variable` (OpenType `"cv01", "ss03"` applied globally)
- Signature weight: `510` (Linear's signature)
- Mono: `JetBrains Mono`

#### 라틴 전용 장식은 한글에 얹지 않는다 (2026-07-26)

소유자가 [AI 연결] 패널에서 `무엇이  나가는가` · `보낸  기록` · `커밋할지는
당신의  선택이에요` 를 **이중 공백**으로 읽었다. i18n 문자열에는 공백이 하나뿐이었다
— 벌어진 것은 낱말 사이가 아니라 **공백 글리프**였다.

원인은 두 가지 라틴 관습이 한글 위에 얹힌 것이다.

| 장식 | 라틴에서 하는 일 | 한글에서 하는 일 |
|---|---|---|
| `uppercase` + wide tracking 아이브로 | 대문자 소제목의 결 | 대문자화 없음. **자간만** 벌어짐 |
| `font-mono` 문장 | 코드/식별자라는 신호 | JetBrains Mono 는 latin 서브셋이라 한글은 폴백되고, **공백만** 등폭 advance 로 남음 |

규칙:

- **한국어 문장형 텍스트에 `font-mono` 를 두르지 않는다.** 한 줄 안에 경로/식별자와
  한국어가 섞이면 **기계 문자열에만** mono span 을 씌운다
  (`<span class="font-mono">.ontology-atlas/llm-audit.jsonl</span> · 커밋할지는 …`).
- mono 입력칸의 **한국어 placeholder** 는 본문 서체로 되돌린다 — 값은 기계 문자열이지만
  안내 문구는 아니다.
- 문장형 한국어 소제목에는 mono/uppercase/wide-tracking 아이브로를 쓰지 않는다.
  크기·잉크로만 위계를 준다.
- 라틴 아이브로 자체는 유지한다(영문 라벨·탭·범례에서는 정상 신호다). 금지는
  **한글 위에 얹는 것**이다.

**이중 언어 표면은 로케일로 조건을 내린다 (2026-07-26 진입 검수 E-10).** 같은
컴포넌트가 ko 와 en 을 모두 그리면 장식을 통째로 없애는 것은 과잉 처방이다 —
en 에서는 그 아이브로가 정상 신호다. `src/shared/lib/latin-eyebrow.ts` 의
`useLatinEyebrow(tracking)` 이 이 판정의 단일 출처다:

```tsx
const eyebrow = useLatinEyebrow("tracking-[0.2em]");
<p className={`text-caption text-[color:var(--color-text-quaternary)] ${eyebrow}`}>
```

- ko → 빈 문자열(장식 0). en → `font-mono uppercase tracking-…`.
- **기계 문자열은 예외다** — 계기 숫자, 폴더 경로, 단축키 글리프는 등폭이 정보이므로
  mono 를 유지한다. 걷는 것은 그 곁의 **한국어 낱말**뿐이다.
- 등록되지 않은 로케일은 비-라틴으로 본다(장식을 잘못 얹는 쪽이 더 비싸다).
- intl provider 밖에서 렌더되는 컴포넌트는 이 훅을 못 쓴다 — 폴백으로 감추지 않고
  테스트에 provider mock 을 둔다(`useLocale: () => "ko"`).

실측 근거(1512×950 다크, getComputedStyle 전수): 첫 화면 ko 7곳이 자간
1.36~1.8px + mono 폴백 + uppercase 를 한글에 얹고 있었다 → 0곳. en 무변.

#### 라벨은 노드 도형선에 닿지 않는다 (2026-07-26 진입 검수 E-4)

캔버스 라벨의 베이스라인은 `render/labels.ts#resolveLabelBaselineY` **한 곳**에서
나온다. `draw()` 와 `topology-frame-draw.ts` 의 bbox 빌드가 같은 함수를 쓴다 —
갈라지면 측정한 상자와 실제로 칠한 글자가 다른 자리에 놓인다.

- 라벨 앵커는 **그려진** 스크린 반지름을 쓴다(magnitudeScale · breathe · 등장 램프 ·
  선택 시 1.12 성장 포함). nominal 반지름을 쓰면 큰 노드·선택 노드의 이름이 도형
  안으로 들어간다.
- 노드가 원판 **밖**에 그리는 외곽선(선택 링 +6px)과 글리프 사이에 최소 여유
  (`LABEL_NODE_CLEARANCE` 3px)를 보장한다. 오프셋 식만 쓰면 글리프가 베이스라인
  위로 자라는 만큼 링을 관통한다 — 어떤 줌 배율로도 해소되지 않는다(폰트가 같이 커짐).
- ego 멤버·호버 노드의 원판은 라벨 배치기에 **예약**으로 넘긴다
  (`NODE_DISC_LABEL_PRIORITY` = 1: 선택·호버 라벨은 굴복하지 않고 수동적 라벨만
  비켜선다). 예약에는 주인(`ownerId`)이 있어 자기 라벨은 면제된다.
- 비켜서는 순서는 **뒤집기 먼저, 억제 나중** — 아래가 막히면 노드 위 자리를 한 번
  시도하고, 거기도 막힐 때만 라벨을 떨어뜨린다("이름 없는 도형" 재발 방지).

### 지도 잉크 사다리 — 깊이 축 하나, 그 밖 둘 (2026-07-31)

45라운드 지도 연구 + 체계석 판정의 산물. **값이 아니라 구조가 계약이다.**

**출발점**: 지도의 엣지·노드 stroke **여덟 개가 전부 WCAG 1.4.11(3:1) 미달**
이었다 — 가장 밝은 project stroke 2.78:1, 가장 어두운 contains-l2 1.59:1.
위계석 실물 실측이 같은 것을 다른 각도로 잡았다: contains 선 피크 휘도 14.4
대 배경 13.3 으로 **사실상 결석**이고, 화면에서 가장 밝은 것은 연결선이 아니라
요약 칩(102.5)이었다. **지도의 일이 연결을 보여주는 것인데 연결이 제일 흐렸다.**

**깊이 축(`--topology-v2-ink-depth-*`)** — 단일 진실원. 노드 stroke 와
containment 엣지는 **같은 트리 깊이를 두 번 그리는 것**이라 같은 값을 참조한다:

| 단 | 토큰 | 대비 | 별칭 |
|---|---|---|---|
| leaf | `--topology-v2-ink-depth-leaf` | 3.22:1 | `node-stroke-element` · `edge-contains-l2` |
| mid | `--topology-v2-ink-depth-mid` | 3.42:1 | `node-stroke-capability` · `edge-contains` |
| top | `--topology-v2-ink-depth-top` | 3.96:1 | `node-stroke-domain` · `edge-contains-l0` |

처음엔 두 군을 따로 적었고 세 짝이 대비 0.02 이내로 **우연히** 수렴했다.
그건 운이지 계약이 아니다 — 한쪽만 고치면 아무 경고 없이 갈라진다.
*"값이 두 곳에 적히면 이미 드리프트가 시작된 것"*(Carbon).

**축 밖 둘**:

- **`node-stroke-project`(4.63:1)** — 깊이 축 위 한 단. 대응하는 containment
  엣지가 없다(프로젝트 위에 부모가 없으므로) 자기 값을 갖는다. 이 지도에서
  가장 밝은 마크다.
- **`edge-depends`(3.61:1)** — 위계가 아니라 관계 **범주**다. 명도 사다리의
  한 단이 아니라 별도 채널(파선 + 인디고 틴트)로 구분된다. 그래서 *"엣지는
  노드 stroke 의 80% 이하"* 같은 **사다리 간 상한을 걸지 않는다** — 그 규칙은
  두 사다리가 경쟁한다고 전제하는데, containment 엣지는 노드와 같은 축이고
  depends 는 아예 다른 축이라 비교 대상이 아니다. 구속은 둘뿐이다:
  **WCAG 3:1 이상**, 그리고 **가장 밝은 마크(project)를 넘지 않는다**.

**크롬은 콘텐츠보다 어둡다** — 클러스터 칩 rest 는 램프 **맨 아래 단**이다
(`--topology-v2-cluster-chip-{border,ink}-rest`, 3.01/3.14:1). 어느 노드보다
어둡되 WCAG 하한은 지킨다(컨트롤이라 못 찾게 만들면 안 된다). **rest 에서
인디고를 쓰지 않는 것이 핵심** — 인디고는 이 앱의 단일 악센트라 크롬이 상시로
쓰면 사용자가 부른 목적물과 경쟁한다. hover/focus 에서 인디고로 깨어난다.

**게이트**: `tests/contract/topology-ink-contrast.contract.test.ts` 가 ① 3:1
하한 ② 두 사다리의 순서 ③ **별칭 관계 자체**(값이 아니라 `var()` 참조) ④
depends 의 축-밖 규칙 ⑤ 칩이 어떤 노드보다 어두움 ⑥ 관문이 강등하지 않음을
붙든다. lint 로는 못 잡는다 — 판정에 배경색과 WCAG 공식이 필요하다.

⚠️ **폐기된 규칙**: 연구 중간에 *"엣지 대비 상한 = 노드 stroke × 0.8"* 을
발명했다가 폐기했다. WCAG 는 하한만 주므로 그건 이 연구의 발명이었고, 축을
단일화하고 나니 **전제가 틀렸음**이 드러났다(같은 축을 두 표현이 나눠 갖는데
한쪽을 20% 눌러야 할 이유가 없다). 되살리려면 두 사다리가 왜 경쟁 관계인지를
먼저 보여야 한다.

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
  **[feat/chrome-system]** 브랜드 필의 모양(radius/그림자)은 이제 아래
  "크롬 문법" 챕터의 `--chrome-*` 로 옮겼다 — 필이 원형에서 정사각으로
  바뀌며 우측 액션 lane(여전히 원형 pill)과 형태가 갈렸기 때문. 높이/뱃지/
  아이콘 크기 등 나머지 밀도 값은 이 클러스터가 계속 소유한다.
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
- ~~`--topology-relation-label-*`~~ **(18개, 2026-07-28 삭제)**. 관계 라벨을
  DOM 배지로 그리던 시절의 토큰 무리였다 — 치수 6 · 색 8 · 그림자 2 ·
  포커스 링 1 · 간격 1. 라벨 렌더가 캔버스로 옮겨간 뒤 소비자가 사라졌는데
  정의와 이 문서의 규격 설명만 남아 있었다. 실측: `var()` 사용 0회
  (`globals.css` 내부 포함), 캔버스 토큰 리더 스펙 목록 0건, 문자열 참조 0건.
  `--pad-card`/`--pad-panel`(2026-07-26) 과 같은 이유 — **아무도 안 쓰는
  토큰은 규격이 아니라 오정보다.** 특히 이 무리는 `-text-size: 10.5px` /
  `-svg-text-size: 9.5px` 로 **타입 램프 밖 크기**를 규격처럼 제시하고 있어서,
  다음 사람이 근거로 삼으면 램프 이탈이 정당화된다. 관계 라벨 처리를 다시
  토큰화할 일이 생기면 그때 **살아있는 소비자와 함께** 새로 만든다.
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
- `--topology-tour-scrim-surface` / `--topology-tour-transition-ms` (2026-07-23,
  guided tour, `src/features/guided-tour`): the tour's scrim-and-cutout
  contract. The scrim is a `box-shadow: 0 0 0 9999px var(--topology-tour-scrim-surface)`
  spread painted on the target rect with `blur 0` — an opaque mask, not the
  forbidden `0 0 ... blur>0` glow/neon ring; the code carries a comment making
  that distinction explicit at each call site. The surface is intentionally
  lighter than `--topology-blocking-backdrop-surface` (0.6 vs 0.72) so the map
  stays legible behind it — the tour is a pointing gesture, not a full block.
  `--topology-tour-transition-ms` (180ms) drives the cutout rect's
  top/left/width/height interpolation between steps, matching the existing
  180ms chrome rhythm and staying under the 200ms motion ceiling;
  `motion-reduce:transition-none` removes it entirely for
  `prefers-reduced-motion`. The canvas-node anchor steps (2 and 4) skip this
  CSS transition altogether — the per-frame `worldToScreen` projection in
  `use-topology-loop.ts` (the same technique as the realm "전개" button) is
  itself the motion, so imposing a CSS transition on top would fight the
  camera. All scrim/cutout paint — rect and circle alike — lives on the
  overlay's z-70 layer (the widget-side canvas anchor is a paint-free
  measurement probe), so DOM-anchored and canvas-anchored steps dim the
  surrounding chrome identically. The interactive step's blocker is a
  4-strip transparent funnel around the cutout bbox (no new tokens — the
  strips carry no paint); it blocks every surface except the spotlit node,
  which is what keeps the tour from stacking transient UI on top of itself.
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

### 모션 문법 (usability motion family, Phase 3 2026-07-25)

공방(`/ontology/studio`)·인사이트(`/ontology/insights`)의 "의미를 확인하는"
사용성 모션은 아래 **단일 duration/easing 패밀리** 위에서만 만든다. 전부
transform/opacity 만 쓰고, glow·bounce-loop·ambient 반복은 금지,
3-스텝 램프는 ≤240ms(그 위는 **이름과 이유를 가진 예외 토큰만** — 현재 2개:
`--agent-panel-reflow-duration` 260ms 패널 리플로우 · `--overlay-spring-response`
300ms 오버레이 스프링. 둘 다 임계감쇠라 물성이 옳고, 어긋나 있던 것은 코드가
아니라 이 문장이었다),
`prefers-reduced-motion` 은 `app/globals.css` base 레이어 전역 규칙이 즉시
등장으로 무력화한다.

- `--motion-fast: 120ms` — **확인**. 이미 일어난 상태의 확인(호버·포커스·색·
  회전·칩 크로스페이드·탭 콘텐츠 크로스페이드·피커 원점 스케일).
- `--motion-base: 180ms` — **이동**. 표면이 자리를 바꾸는 일(팝오버·패널·카드·
  백드롭·도킹의 등장/퇴장). 크롬 180ms 리듬과 동일.
- `--motion-settle: 240ms` — **확정**. 일이 끝났다는 서명(위성 재배치(FLIP)·
  커밋 수렴·완료 여운).
- `--motion-ease: cubic-bezier(0.25,0.1,0.25,1)` — 위 셋의 공통 이징.
- `--topology-motion-camera/drag-settle: 420/720ms` — **지도 캔버스 전용**
  연속성. DOM 표면에서 참조하면 결함이다.

#### 값이 아니라 쓰임으로 고른다 — 그리고 기본이면 클래스를 안 쓴다 (2026-07-27)

램프는 오래 있었는데 참조하는 컴포넌트는 하나뿐이었다. 원인은 취향이 아니라
**배관**이었다: Tailwind 의 `--default-transition-duration`(공장값 150ms)과 기본
커브 위에서 `transition-*` 유틸리티 500여 곳이 굴러가고 있었고, 코드에 흩어져
있던 `duration-<n>` 리터럴 30건 중 12건은 그 공장값을 손으로 한 번 더 적은
것이었다 — 아무도 고른 적 없는 숫자가 사실상 앱의 기본 모션이었다.

그래서 `@theme` 에서 기본 duration/easing 을 램프 토큰으로 갈아끼웠다. 결과:

- **기본이면 duration 클래스를 쓰지 않는다.** 명시하지 않은 전이는 자동으로
  `--motion-fast` + `--motion-ease` 다. 클래스를 한 줄도 안 고친 500여 곳이
  램프 위로 올라왔다.
- **뒤집어 말하면, 명시는 곧 "확인이 아니다" 라는 선언이다.** 표면이
  나타나거나 사라지는 자리는 `--motion-base` 를 **명시하고 이유를 옆에
  적는다** — 실제로 이번 치환에서 도움말 팝오버·「맨 위로」 버튼·지도 안쪽
  진입 버튼 3곳이 여기 해당했다(기본에 맡기면 페이드가 아니라 깜빡임이 된다).
- **램프 duration 을 받는 원소는 이징도 같은 패밀리로 간다.** duration 만
  갈아타면 "셋의 공통 이징"이라는 패밀리 정의가 반쪽만 지켜진다.
- **숫자를 직접 적으면 lint 가 막는다** (`no-restricted-syntax`, 래칫 미러).
  `--topology-motion-*` 를 쓰는 지도 전용 자리는 그대로 유지한다.

실측(1512×950 다크, headless Chromium, rAF 값-램프 샘플링) — 이 변경이 램프의
모양을 어떻게 바꿨나: 문서함 트리 행 호버가 `0.15s cubic-bezier(0.4,0,0.2,1)`
(첫 프레임 2.5% · 피크 4번째 · 램프 폭 108ms)에서 `0.12s
cubic-bezier(0.25,0.1,0.25,1)`(첫 프레임 15.4% · 피크 2번째 · 램프 폭 92ms)로
바뀌었다. 총 변화량은 같고 시간 분포만 앞으로 당겨졌다 — 팝 임계(70%) 근처도
아니고, "즉각 반응"(첫 프레임에 응답이 보인다) 규율 쪽으로 개선이다.

#### 모션 예산은 주인공에게 (2026-07-27)

위 패밀리는 "얼마나"를 정하고, 이 소절은 "누구에게"를 정한다. 실측이 끌어낸
원칙이다: INDEX 행을 클릭하면 개념 팝오버(사용자가 부른 목적물)는 첫 프레임에
휘도 램프의 88.8%가 도달하는 하드컷인데, 배경인 지도 ego 포커스는 100ms 이징을
받고 있었다 — 그리고 두 단계는 250ms 어긋나 따로 놀았다. 움직임의 예산이
주인공이 아니라 배경에 쓰였다.

1. **주인공이 먼저 받는다.** 한 입력이 여러 표면을 바꾸면, 전환은 Design
   Guardian verdict 가 지목한 attention winner 의 것이다. winner 가 하드컷
   (첫 프레임 델타 지분 >70%)인데 배경이 이징이면 결함이다. 둘 다 즉답
   (하드컷)인 것은 허용 — 금지는 배분의 역전이지 절제가 아니다.
2. **한 입력 = 한 사건.** 같은 입력이 낳은 단계들은 같은 프레임에 시작한다.
   시작 차가 `--motion-fast` 를 넘으면 사람 눈에 두 사건으로 갈라진다.
   스태거는 인과를 보여줄 때만(원인이 먼저), 간격은 `--motion-fast` 이하.
3. **판정은 실측으로.** 스크린샷이 아니라 프레임이다 — winner ROI 와 배경 ROI
   의 첫 프레임 지분을 각각 재서 비교한다. 이 원칙은 lint 가 잡을 수 없다
   (전환이 없는 원소는 리터럴도 없어서 모든 값 규칙을 무결점으로 통과한다).
   그래서 게이트는 Guardian verdict 의 Motion 항목이다: winner 의 전환
   토큰명을 답하지 못하는 verdict 는 미완성이다.

기존 규율과의 자리: "들어온 길로 나간다"(방향 대칭) · "즉각 반응"(첫 프레임
33ms) · "중단 가능" · "끄는 게 아니라 동등물"(reduced-motion)이 **한 표면 안**의
규칙이라면, 이 원칙은 **표면 사이의 배분** 규칙이다. Apple HIG 의 목적 있는
모션과 Tufte 의 잉크 예산(강조 잉크는 정보가 가장 큰 곳에)을 이 앱의 문법으로
번역했다.

#### 전수 실측이 가르친 것 (2026-07-28)

전 화면을 다시 재면서 **위 원칙보다 앞서는 사실 세 가지**를 배웠다. 셋 다
"규칙은 맞게 적혀 있는데 실제로는 안 걸리는" 종류라, 문서가 아니라 계약 테스트가
지킨다.

**① 퇴장은 자기 이름으로 앞으로 재생한다.** 등장 키프레임을 `reverse` 로
되감는 퇴장은 **같은 원소에서 클래스만 바뀌는 자리에서 재생되지 않는다.** CSS
애니메이션은 `animation-name` 이 그대로면 duration/direction 만 바뀌어도 다시
시작하지 않고, 시작 시각이 그대로라 이미 끝난 애니메이션은 `reverse` + `both`
를 만나는 순간 "끝난 뒤" 단계로 해석돼 역재생의 **종료 상태를 즉시** 보여준다.
노드 팝오버 닫기 실측: 불투명도 `1 → 0` **1프레임**, 그 뒤로 transform 만
`1 → 0.9877 → 0.9829 → 0.9804` — **이미 보이지 않는 원소가 천천히 줄어든다.**
읽으면 맞아 보이고 duration·easing 이 전부 토큰이라 값 규칙은 무결점 통과한다.
게이트: `tests/contract/exit-motion-restart.contract.test.ts`.

**② `!important` 는 레이어 순서가 뒤집힌다 — 동등물은 같은 레이어 안에 쓴다.**
reduced-motion 전역 kill 규칙(`*`, 특이도 0,0,0)은 `@layer base` 안에 있다.
그 위에 얹는 동등물을 **레이어 밖**에 쓰면, 특이도가 (0,3,0)이어도 진다:
important 선언끼리는 레이어 순서가 역전돼 레이어에 든 쪽이 이긴다. 토스트
동등물을 파일 끝에 썼을 때 계산값이 그대로 `0.01ms` 였다(실측 확인). **규칙이
있어도 자리가 틀리면 없는 것과 같다.**

**③ 불투명도 전용 클래스에 이동용 커브를 태우지 않는다.** `.map-overlay-in`
은 opacity 만 바꾸는데 이동용 expo 커브(`--topology-motion-ease-out`)를 타고
있었고, 그 커브는 첫 프레임에 47%에 닿는다(실측 45.9%) — 큰 표면이 사실상
하드컷으로 켜졌다. `.topology-chrome-in` 이 2026-07-27 에 배운 "밝기와 이동은
같은 커브를 쓰면 안 된다"의 나머지 절반이다. 이동 축이 없으면 남는 것은 밝기의
커브, 즉 앱 공통 램프(`--motion-ease`)뿐이다. 램프 폭 그대로, 첫 프레임 지분
45.9% → 16.1%.

**빈도가 예산을 깎는다.** 호버/포커스로 트리거되는 표면은 하루 수십 번 만나므로
객관적으로 빠른 곡선도 그 빈도에선 느리게 느껴진다. 답은 곡선 조정이 아니라
예산 축소다: 고빈도 표면은 `0~--motion-fast`, 이동/확정 램프는 하루 몇 번의
사건(모드 전환·표면 교체·커밋 수렴)의 것이다. 이 규율은 md 로는 안 지켜져서
`eslint.config.mjs` 의 공유 셀렉터 배열이 강제한다 — 호버/포커스 변형과
이동/확정 duration 이 같은 className 문자열에 공존하면 걸린다.

**교체는 두 프레임이다.** 같은 자리를 두 표면이 번갈아 쓰는 자리(INDEX 접힘 ↔
펼침, 설정 시트 열림 ↔ 닫힘)에서 도착 표면만 등장 문법을 입으면, 사용자가 누른
목적물은 0프레임을 받고 결과일 뿐인 배경이 200ms 를 받는다 — 판정식① 위반이
구조적으로 발생한다. `src/shared/lib/use-presence.ts` 의 `usePanelPresence` /
`useSurfaceSwap` 이 나가는 프레임을 붙들어 두고, 나가는 쪽은 `inert` +
`pointer-events-none` 으로 즉시 무력해진다. 퇴장 창은 `EXIT_WINDOW_MS` 하나로
공유한다 — 표면마다 다르면 그게 다시 결함이다.

**크로스페이드는 리플로우를 감싸야 한다.** 내용만 페이드하고 컨테이너 높이가
1프레임에 바뀌면 글은 배어들고 상자는 튄다(인사이트 탭 실측: 높이 878.5 →
605px, 문서 전체 246px 점프). `useSwapHeight` 가 교체 **직전**의 높이를
핸들러에서 재고(effect 안에서 재면 이미 새 레이아웃이라 늘 자기 자신에서 자기
자신으로 전이한다) 실측한 새 높이까지 한 스텝으로 전이한 뒤 `auto` 로 돌려준다.
높이는 흔들리는 축이라 감속 사용자에게는 걸지 않는다.

**WCAG 2.2 §2.3.3 의 예외는 진짜 예외다.** 표준은 **사용자가 개시한** 이동
(스크롤·팬·핀치)을 명시적으로 제외한다. 캔버스 카메라의 reduced-motion 스냅이
휠/핀치/팬까지 자르는 동안 감속 사용자에게는 **뷰포트 전체가 한 프레임에
순간이동**했다 — 대체하려던 이징보다 전정계에 더 나쁘고 "내가 어디로 갔나"를
읽을 단서까지 없앤다. 스냅은 **앱이 데려가는 이동**(ego 다이브·fit·자동 정렬)
에만 건다.

캐노니컬 유틸리티 클래스(globals.css `@layer base`):

- `.studio-stage-in` — 무대 등장(opacity + 6px 상승). 소비처가
  `--studio-stagger` 인라인 변수로 요소별 지연(≈40ms 간격 = 센터 카드 → 레인
  순차)을 준다.
- `.studio-picker-pop` — 피커 열림 원점 스케일(scale 0.96→1 + opacity).
  `transform-origin` 은 `--studio-picker-origin`(소켓 로컬 좌표) 주입.
- `.studio-summary-converge` — 저장 커밋 시 요약 칩이 저장 버튼 방향으로
  옅어지며 미끄러진다(한 박자). 이동 벡터는 `--studio-converge-x/y`.
- 위성 재배치(FLIP)는 JS(Web Animations API)로 old→new 레인 위치를
  transform-only 로 태운다(`--motion-settle`) — 순간이동 대신 이동을 보여
  "어디로 갔는지"를 눈이 따라간다.
- 소켓 채움 안착(파선→실선)은 기존 `.studio-strut-flow`/보더 전환이 담당 —
  같은 토큰 패밀리로 정렬.
- `.insights-tab-crossfade` — 인사이트 탭 전환 콘텐츠 크로스페이드
  (`panelCrossfadeIn` 재사용 + `--motion-fast`). 히어로 숫자 카운트업은 JS
  훅(`useCountUp`, `prefers-reduced-motion` 이면 즉시 최종값), 바 채움은 width
  0→목표 transition(`--motion-settle`, 30ms 스태거).
- `.ai-row-disclosure` / `.ai-row-disclosure-body` / `.ai-row-swap` —
  **목록 행 펼침**(아래 절).

#### 목록 행 펼침 — 나가는 길은 들어온 길이다 (2026-07-26)

행을 눌러 인라인 카드가 열리는 표면([AI 연결] 벤더 목록)의 캐노니컬 계약.

- **한 표면, 두 상태.** 상태별로 다른 행을 그리면(교체) 전이할 대상이 없다.
  헤더 밴드(`--control-row-h`)는 항상 같은 DOM 이고, 그 아래 상세 영역만
  높이가 자란다. 그래서 접힌 행이 펼친 행으로 **변하는** 것이지 다른 것으로
  바뀌는 게 아니라는 사실이 움직임으로 읽힌다.
- **열림·닫힘·내용 교체가 같은 전이를 지난다.** 클래스가 하나뿐이라 방향별로
  다른 커브가 생길 자리가 없다. 접힘 모션 없이 툭 사라지면 「취소」가
  "취소됐다" 가 아니라 "뭔가 잘못됐다" 로 읽힌다 — 사라진 것이 내가 시킨
  일인지 사고인지 구분할 단서가 화면에 없기 때문이다.
- **높이는 px 로 전이한다.** `height: auto` 는 보간되지 않고,
  `grid-template-rows: 0fr↔1fr` 는 열림/닫힘만 되고 **내용 교체**(입력 폼 →
  등록됨 액션)를 못 탄다. 소비처가 ResizeObserver 로 실제 콘텐츠 높이를 계속
  써 넣으면 열림·닫힘·교체·리플로우가 한 메커니즘으로 수렴한다.
- **형제가 자리를 내주는 방식이 곧 "이 셋은 형제다".** 펼치는 행의 높이가
  연속으로 자라면 아래 행이 밀려나는 것도 연속이다. 부모 다이얼로그 높이도
  같은 커브를 타므로 펼침이 "요동" 이 아니라 "성장" 으로 읽힌다.
- **duration**: 높이 `--motion-base`(180ms), 내용 opacity/2px `--motion-fast`
  (120ms). 내용이 한 스텝 빠르다 — 열릴 때는 자리가 먼저 나고 글이 들어오고,
  닫힐 때는 글이 먼저 비켜 빈 상자가 닫히는 것처럼 보이지 않는다.
- **JS 는 ms 를 복제하지 않는다.** 퇴장 언마운트 타이머는 `--motion-base` 를
  `getComputedStyle` 로 읽어 쓴다(모듈 레벨 1회 캐시).
- **`prefers-reduced-motion` 은 끄는 게 아니라 동등물을 준다.** 전역 규칙
  (`transition-duration: 0.01ms !important`)을 이 표면에서만 되받아,
  흔들리는 축(height·translate)은 없애고 흔들리지 않는 축(opacity 120ms)은
  남긴다. 이 상호작용에서 모션은 장식이 아니라 **인과의 증거**이기 때문이다 —
  내가 누른 「취소」 때문에 사라진 것인지 앱이 고장난 것인지, 완전 정적 화면은
  구분해 주지 않는다. 되받는 규칙은 전역 블록보다 **소스 순서상 뒤**여야
  이긴다(순서가 바뀌면 조용히 무력화된다).
- **접근성**: 접히는 동안(≈180ms) DOM 에 남으므로 상세 영역은 닫히는 즉시
  `inert` — 보이지 않는 입력칸이 탭 순서/스크린 리더에 남지 않는다. 퇴장
  모션의 대가를 접근성으로 치르지 않는다.
- **되돌리기는 그 프레임에.** 「취소」·헤더 토글·Esc 가 **한 함수**로 수렴하고,
  확인창을 끼우지 않는다(입력 안 한 상태를 버리는 데 확인은 과하다). 입력한
  내용이 있어도 조용히 버린다 — 잃는 것이 다시 붙여넣으면 되는 값이고,
  이 카드의 확인 예산은 이미 [지우기] 2단 확정이 쓰고 있다. 되돌릴 수 있는
  일과 없는 일에 같은 마찰을 물리면 진짜 경고가 값싸진다.

### reduced-motion 동등물은 목록이고, 그 목록은 테스트가 지킨다 (2026-07-26)

위 계약("끄는 게 아니라 동등물")은 한동안 **문서에만** 있었다. 실제로 지킨
셀렉터는 `.ai-row-disclosure` 하나뿐이고, 나머지 표면은 전역 규칙
(`animation-duration: 0.01ms !important`)이 그대로 잘라 하드컷이었다 —
프레임 실측: 설정 시트 150ms 이징 → **1프레임에 총델타의 98.9%**, 인사이트
탭 전환 150ms → 1프레임. 규격을 문서에만 쓰면 지켜지지 않는다.

지금은 **동등물이 있어야 하는 표면이 목록**이고, 그 목록과 globals.css 가
어긋나면 `tests/contract/reduced-motion-equivalent.contract.test.ts` 가
막는다. 규칙 셋:

1. **전역 kill 규칙은 남는다.** 감사되지 않은 모션(무한 heartbeat
   `.agent-pending-dot`, 장식 흐름 `.studio-strut-flow`)의 안전망이다. 그
   자리에서는 정지가 맞고, 진행의 사실은 옆의 텍스트가 이미 말한다.
2. **크로스페이드 계열은 시간을 되찾는다** — `.insights-tab-crossfade` ·
   `.insights-disclosure-in` · `.ai-row-swap` · `.agent-panel-stage-swap` ·
   `.overlay-fade-only` · `.app-settings-scrim-in` · `.map-overlay-in` ·
   `.overlay-spring-scrim`. 이미 opacity 전용이므로 duration 토큰만 되돌린다.
3. **transform 이 실린 등장은 키프레임 이름만 바꾼다** —
   `.app-settings-panel-in` · `.topology-chrome-in` / `-out` ·
   `.rail-status-dot-in` 은 `animation-name: panelCrossfadeIn`(opacity 전용)로
   갈아타고 자기 duration 토큰을 그대로 탄다. **새 키프레임 0 · 새 duration 0.**
4. **되받는 블록은 전역 블록보다 소스 순서상 뒤.** 앞에 오면 조용히 무력화된다.
5. **리터럴 ms 재기입 금지.** 동등물도 토큰으로만 시간을 되찾는다(가드가 검사).

실측 결과(설정 시트 열기, reduced-motion): 1프레임 98.9% 하드컷 →
`1.217 → 1.664 → 1.731(3프레임째 피크) → 1.591 → 1.217 → 0.961 → 0.913 → 0.155`
= 첫 프레임 25.9% 의 진짜 이징 ~150ms, scale 축만 제거.

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

### Touch & tablet responsive contract (2026-07-23, 반응형 감사 라운드)

폭 브레이크포인트만으로는 "태블릿=터치"를 표현할 수 없다 — 1024px 디스플레이는
fine-pointer 노트북일 수도, coarse-pointer 12.9" iPad 일 수도 있다. 그래서 터치
축은 **별도 계약**이다:

- **`--touch-target-min: 44px`** (`:root`) + **`@media (pointer: coarse)`**
  블록이 단일 출처. coarse 에서만 `--app-nav-rail-tile-height`(32→44) ·
  `--topology-chrome-control-height`(clamp 32–36→44) ·
  `--topology-shortcut-sheet-close-size` 를 44px 로 승격한다. fine-pointer 는
  밀도 유지. 다크 단일·색 무변 — 높이/히트 영역만.
- **하단 탭바 예약고** — BottomTabBar 가 존재하는 `<lg` 전 구간에서, 하단에
  앵커되거나 스크롤 끝을 갖는 표면은 `--topology-mobile-bottom-tab-reserve`
  (56px + safe-area) 를 차감/패딩해야 한다. 적용 지점: 확장 INDEX
  (`--topology-index-bottom-inset`) · 우하단 판독계
  (`--topology-relation-legend-bottom-inset`, 하단 전용 분리 토큰) · 데이터시트
  max-height(`--topology-v2-panel-bottom-reserve` 단일 knob) · 콘텐츠 페이지
  main 의 `max-lg` 하단 패딩. **"탭바 뒤로 가려져 도달 불가"는 결함이다** —
  새 하단 앵커 표면을 만들면 이 예약고부터 계약하라.
- **`<md` 확장 INDEX = 풀-블리드 시트** — `--topology-index-width` 가 `<md`
  에서 `calc(100vw - 2 * var(--topology-index-inset))` 로 전환된다. 좁은
  화면은 "한 번에 하나의 주 뷰": 펼치면 시트(지도는 컨텍스트), 접으면 지도
  전폭. 경계는 GlobalSearch 의 시트↔플로팅 분기와 같은 md(768) — 시트류
  표면은 이 경계를 공유한다.
- **정직한 강등** — 데스크톱 워크벤치 표면(빌더 3-pane 등)을 태블릿 폭에
  억지로 밀어넣지 않는다. 빌더 캔버스 게이트는 lg(1024)+; 그 아래는 트리
  편집 + 토폴로지 fallback 이 정답이다.

### 셸 본문 슬롯 — 압축 금지 계약 (2026-07-27)

**스크롤 컨테이너는 자기 자식을 압축하지 않는다.** 셸(`AppShell`)이 뷰포트
높이를 소유하고 본문 슬롯만 스크롤하는데, 그 슬롯은 flex 칼럼이다. 페이지
루트는 슬롯을 채우려고 `min-h-full` 을 쓰고, 그 **명시적 min-height 가 flex
아이템의 자동 최소 크기(=내용 높이)를 덮어쓴다**. 그래서 내용이 뷰포트보다
길어지면 flex 가 페이지 박스를 뷰포트 높이로 줄였고, 내용은 visible overflow
로 삐져나와 스크롤은 되지만 **페이지가 선언한 하단 예약고가 줄어든 박스
바닥에 갇혔다**.

실측(결함 당시): 다운로드는 마지막 글줄이 뷰포트 바닥에 딱 붙었고(여백 0px),
768 에서 프로젝트 상세의 마지막 줄은 하단 탭바 **뒤로 17px** 들어가 가려졌다
(프로젝트 목록은 여유 9px). 위 터치 계약의 "탭바 뒤로 가려짐은 결함" 이 바로
이 형태로 재발한 것이다.

처방은 **셸이 한 번** 선언한다 — 본문 슬롯의 직계 자식은 압축되지 않는다.
페이지마다 `shrink-0` 을 기억하게 하는 방식은 실제로 실패했다: 한 화면에서
고친 뒤에도 형제 라우트 4곳(프로젝트 목록·프로젝트 상세·인사이트·다운로드)에
같은 결함이 그대로 살아 있었다. 페이지가 기억해야 하는 구조는 다음 화면에서
또 빠진다.

- 자라는 것(`grow`)은 그대로 두므로 짧은 내용의 **세로 중앙 정렬은 무변**이다
  (실측: 중앙 정렬 박스의 상/하 여백 415/415px, 처방 전후 동일 · 스크린샷
  바이트 동일).
- 게이트는 두 층이다 — `src/app/providers/AppShell.test.tsx`(처방이 제자리에
  있는지) + `tests/e2e/scroll-end-gap.spec.ts`(스크롤 끝 여백·탭바 가림을
  **실제 레이아웃으로** 측정). jsdom 은 레이아웃을 하지 않아 픽셀을 못 본다.

### 기록 목적지 토큰 (`--git-*`, 2026-07-27 작업대 재설계)

`/git`(기록) 은 **모양이 상태로 갈리는** 목적지다. 그 갈림을 코드가 아니라
치수 계약이 지탱하므로 값이 전부 토큰이다.

| 토큰 | 값 | 무엇을 정하나 |
|---|---|---|
| `--git-setup-measure` | 520px | 연결 전(웹·폴더 없음·기록 시작 전) 단일 과업 기둥 폭 |
| `--git-setup-action-height` | 36px (coarse 44px) | 주/보조 동작 한 단 |
| `--git-evidence-min` | 600px | 증거 열 최소 폭. 11px mono 80칼럼 ≈ 528 + gutter + padding |
| `--git-evidence-stack-max` | 460px | 세로로 쌓였을 때 증거의 상한 (안에서 스크롤) |
| `--git-row-h` | 26px (coarse 44px) | 변경 행 높이 — 반복 세트라 내용이 정하지 못한다 |
| `--git-step-h` | 44px | 걸음 행 높이 (요약 + 이름 두 줄) |
| `--git-row-stagger` | 14ms | 목록 등장 계단 간격. 8행 상한 → 총 지연 ≤112ms |
| `--git-single-measure` | 920px | 증거 열이 없을 때의 단일 기둥 폭 |

**세 가지 계약이 값보다 중요하다.**

1. **열의 존재는 내용의 존재를 약속한다.** 증거 열은 보여줄 바뀐 줄이나 지난
   걸음이 있을 때만 렌더한다. 구 코드는 2열을 무조건 선언해, 다 남긴 상태에서
   우측이 한 줄만 담긴 채 세로 구분선만 화면 끝까지 그어져 있었다(1512×950
   실측: 우측 유효 잉크 1행 / 빈 높이 1,010px). **빈 열은 채우는 게 아니라
   안 만드는 것이 답이다.**
2. **작업면 높이는 `min(내용, 남은 공간)`.** flex 자식 기본값(`0 1 auto`) +
   `min-h-0` 이 그 뜻이다. `flex-1` 로 늘리면 짧은 목록에서 표면 안에 아무도
   고르지 않은 500px 빈 칸이 생긴다. 넘칠 때만 열이 안에서 스크롤한다.
3. **2열 게이트는 `xl`(1280)이다** — `lg`(1024)에서 2열을 켜면 증거 열이
   600px 를 먹고 목록이 430px 로 눌려 개념 이름이 잘린다. **잘린 목록은 판단
   재료가 아니다**(잘린 diff 가 증거가 아닌 것과 같은 이유). 1024–1279 는
   세로로 쌓는다.

### 앱 내장 터미널 도크 토큰 — 제거됨 (2026-07-26)

`--terminal-*` · `--agent-terminal-*` 토큰군과 `.agent-terminal-dock` 표면은
하단 터미널 도크와 함께 제거됐다. 근거는 `docs/AGENT-GRAPH-WORKFLOW.md` 의
번복 기록 절 — 도크는 사용자 자신의 터미널의 진부분집합이었고, 유일한 우위로
꼽던 "에이전트가 고치면 지도가 반응한다" 는 볼트 워처가 위치와 무관하게
이미 주고 있었다.

**되살리지 않는다.** 이 자리에 셀 타이포·ANSI 팔레트·그립 폭 토큰을 다시
만들어야 한다면 그건 도크가 돌아왔다는 뜻이고, 그 결정을 먼저 뒤집어야 한다.
값이 필요하면 git 이력에 그대로 있다.

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
3. **Next graph action** — Workshop for a frontmatter-backed write, Insights
   for maintenance, or Topology for spatial/path inspection.

Avoid making large explanatory panels the first thing users read. Prefer compact
action and handoff strips that name a concrete destination (`지도에서 확인`,
`관계 편집`, `개념 문서`, `다음 액션 복사`) and why it is useful. The retired
`Browse / Write / Query` cards, tree/ego hub, ERD Builder rails, and query
cockpit are not current chrome and must not be revived by documentation or
design guards.

Topology is the browse and decision surface. Its INDEX panel may project the
project → domain → capability → element hierarchy, but the canvas and
datasheet keep typed relations, evidence, and impact visible. Selecting a row
or node must preserve one canonical graph handle across map focus, detail,
Workshop deep-link, and source-document handoff. `/ontology` is only a
compatibility redirect to `/topology?index=expanded`; do not design a second
ontology hub behind it.

Workshop is the write surface. The center card plus fixed compass bearings
explain the current node and allowed relation directions; empty line-art
sockets invite one relation at a time. A writable vault lands real
frontmatter, while a read-only vault produces an MCP packet. Completion is the
center-card border and plain progress caption, not game reward, glow, loot, or
a hidden draft canvas. `/ontology/edit` is only a compatibility redirect to
this surface.

Insights is a maintenance board, not a generic analytics dashboard. Its exact
five questions are **Do next / Composition / Connections / Boundaries /
Freshness**. `?tab=` restores the selected question, `TabBar` exposes one
selected tab, and only the matching `tabpanel` is visible. The first viewport
should answer the selected question with real graph data; the bottom handoff
row copies the matching MCP/CLI action without making raw query syntax the
visual winner. A fixed three-tab dashboard, reader-persona lanes, or a large
query cockpit is retired structure.

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
  opacity and dims the rest through `topology-map-v2`'s `focus-state` world
  derivation; the source graph is not mutated. A content-sized
  `TopologyV2DetailPanel` anchors near the node and lists connected nodes as
  incremental ego-walk targets. `FullDetailA1` remains an opt-in full-detail
  drill, not the click default.
- **Card count chips are topology marks.** `--topology-card-count-surface` /
  `--topology-card-count-border` / `--topology-card-count-text` make each
  visible skeleton card's count read as node scale, not incidental metadata.
  Keep the chip compact and token-backed so card width remains stable while
  important anchors expose why they matter on the map.
- **Default view is an overview, not the full graph.** Show `project` + `domain`
  + hub nodes at level 0; reveal a domain's members on demand (semantic zoom).
  Never drop the full 2–3k-node hairball on the user uninvited.
- **Plain language over graph jargon.** `영향받음 N` → "이 노드를 쓰는 곳 N";
  `의존 N` → "필요한 항목 N". No duplicated labels (`개념 정보` ×3).
- **Scale path is evidence-gated.** The current canvas uses a deterministic
  semantic skeleton, tier reveal, density-gate cluster chips, label collision
  suppression, viewport pass-through edge demotion, and focus/realm filters
  before drawing more detail. Do not claim a 10k-node capacity from the retired
  Sigma/WebGL stack; publish a new upper bound only after production
  canvas-2D measurements at the stated viewport and interaction.
- **Canvas palette tokens.** The only current map-layer token source is
  `src/widgets/topology-map-v2/tokens/read-topology-v2-tokens.ts`. Dark overview
  edges stay quiet enough for dense vaults while containment, dependency,
  dimmed, hovered, and selected relations remain distinct semantic layers.
  There is no `topology-map-sigma` palette or WebGL reducer contract.

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
  must describe map/support/focus/transient/blocking layer order consistently
  (dark theme only — light mode was retired 2026-07-19).

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
- ❌ Decorative arrows trailing a label — `열기 →`, `상세 →`, or a trailing
  `ArrowRight`/`ArrowUpRight` glyph after link/button text (see
  "Arrows carry information or they don't ship" below)
- ❌ Cards in one grid whose height is decided by how much text each happens to
  contain (see "Dimensional regularity" below)

## Arrows carry information or they don't ship

Owner verdict, 2026-07-26, on seeing `지도에서 열기 →`:

> *"나는 이런 글 옆에 화살표 있는거 싫어하거든? AI느낌이라?"*

A trailing arrow after a link label adds no information. The label already says
where you're going, and the control already looks like a control. What the arrow
actually signals is *generated marketing chrome* — it's the visual tic of a
landing page that wants you to click something. On a workbench where the same
label appears a dozen times, it becomes noise a dozen times over.

**The rule is not "no arrows."** It's that an arrow must be carrying something
the words aren't:

| Allowed — the arrow *is* the data | Forbidden — the arrow is decoration |
| --- | --- |
| `{source} → {target}` — a path between two nodes | `문서 열기 →` |
| `오래된 → 최근` — an ordering | `상세 →` |
| `설정 → Developer` — a menu path to follow | `자세히 보기` |
| `목차 클릭 → 해당 위치로` — cause and effect | label + trailing `ArrowRight` icon |
| Leading `↗` on a link that **leaves the app** (`target="_blank"`, an external deeplink) — it warns before the click | Trailing `↗` on in-app navigation |
| `ChevronRight`/`ChevronDown` as a disclosure state, or prev/next on a carousel | |

The test: **remove the arrow and read the label aloud. If nothing was lost, it
was decoration.**

### The gate has to reach the markup, not just the strings

`tests/contract/label-decoration.contract.test.ts` scans three things now, and
the third one was added because the first two were not enough:

1. every `messages/*.json` string, for a trailing arrow;
2. a bare `↗` in JSX, unless the element declares `data-external-link-marker`;
3. **a lone arrow element that sits at the end of a label** — matched by what
   follows it, not by which glyph it is.

(3) exists because the rule shipped on 2026-07-26 exempted `→` wholesale, on the
grounds that every standalone `→` in this repo was an infix data arrow. One day
later the workshop's primary save button read `확인하고 저장 <span>→</span>` —
the repo that wrote the rule broke it, under its own exemption. **A rule whose
range is too short fails exactly like no rule at all.**

The exemption is gone; the discrimination moved to position. An arrow element
whose next non-whitespace sibling is the parent's closing tag is trailing
(decoration); anything else after it means the arrow sits between two things
(data). Measured before enabling, as `.claude/rules/design.md` requires: 3
trailing (all the same save-button family) and 7 infix across `src` + `app`.

## Dimensional regularity — when content length varies

Owner verdict, 2026-07-26, on a card grid whose rows didn't line up:

> *"박스 사이즈나 그런게 안맞지? 깔끔해보이지 않고 삐뚤빼뚤해보이는거말야… 정갈한걸 좋아해서"*

This is the recurring failure mode of a data-driven UI: the layout is regular in
the code and irregular on screen, because each card's height is decided by how
many words its content happened to have. A grid only reads as a grid when the
eye can find a repeating rhythm; content-driven height destroys that rhythm
without anyone having chosen it.

**The principle: the container's dimensions are a design decision, not a
byproduct of its contents.** Concretely:

- **Fix the anatomy, not just the box.** A card in a repeating set has the same
  named slots in the same order — head / measure / list / foot. A slot that is
  sometimes absent is worse than a slot that is sometimes empty, because absence
  moves everything below it.
- **Reserve the optional clause's space.** If a caption is sometimes
  `요소 2개` and sometimes `요소 2개 · 역량 1개 더`, the caption line still
  occupies one line either way. Do not let an optional clause change the card's
  height.
- **Truncate list slots to a fixed count.** Show N items and a remainder
  caption — never "however many fit." N is a design decision made once.
- **Equalize rows, not just columns.** CSS Grid stretches items within a row by
  default, so cards in the same row already match; rows do not match each other.
  When the set is meant to read as one field, make the row height uniform.
- **Truncation is a layout tool, not a failure.** Long titles clamp; they do not
  get to reflow the grid. Pair every clamp with the full value on hover/focus or
  in the detail surface, so nothing is actually lost.

The cost is real and must be paid knowingly: reserved slots create visible empty
space in small vaults. Accept that cost only where the set is genuinely a
repeating field the eye scans. **A one-off card should size to its content** —
regularity is for repetition.

> There is no carve-out. Every Don't above holds **app-wide, including the
> Ontology Workshop (공방)** — the old game-energy exception was retired 2026-07-24 (see
> the next section).

## Ontology Workshop — 공방 (Compass Stage); game exception RETIRED 2026-07-24

`/ontology/studio` is the vault **write surface** — where a human or AI agent
completes a node's meaning by filling its missing typed relations, and creates
new nodes. It once carried a **game-energy exception** (a node as a hexagon
"item" you socket meaning-"gems" into: focal glow, gold rarity, light rays,
particles, gradient frames). **That exception is retired.**

**Why it was retired (fable verdict B + owner, 2026-07-24):** "게임처럼
중독되게" was a *metaphor*, not a spec. Rendering loot-game aesthetics inside an
app whose identity is Rams/Linear restraint read as "restraint cosplaying a
game," not a finished game — and this surface is **decision material** (planners,
execs, developers, agents read it), where rarity glow *erodes trust*. Scoping
the energy to `--studio-*` tokens was itself an admission that it could never
fully commit. The exception was a considered mistake; removing it makes the
workshop finally look like this app.

**What the Workshop is now (restrained, full charter):**

- **Compass Stage.** The focal node is the center hero card; relation *types* are
  nailed to fixed bearings — UP = 상위 개념 (is_a), DOWN = 하위 항목 (contains),
  RIGHT = 필요한 항목 (depends), LEFT = 관련 항목 (relates). Filled = solid indigo
  strut + satellite card; missing = a **dashed line-art socket** (not a jewel)
  you fill via an inline anchored picker.
- **Completeness** reads from the center card's 4-side border (dashed = empty,
  solid = filled) + a plain caption ("4개 중 2개 채웠어요") + a top-left flow cue
  (mini compass). No floating % ring, no levels, no rarity.
- **Color:** achromatic + single indigo, exactly like the rest of the app.
  **amber** is used only as the "expected-but-missing" socket signal (the DOWN
  bearing when strongly expected). **No glow / gradient / gem / particle / gold.**
- **One guided next action** ("여기부터 채워요") + plain-language socket questions
  ("이 노드는 무엇의 한 종류인가요?") — zero ontology jargon on the surface.
- **Motion:** one interruptible ~200ms opacity/color confirm when a socket fills
  (dashed → solid); `prefers-reduced-motion` → instant. No ambient motion.
- **Enhance vs Create** are the same surface in different fill-states (no mode
  tabs). Enhance = partially filled existing node (`?node=`); Create
  (`?mode=create`) = all-empty draft card.

The `--studio-*` game token block and `.studio-*` game classes were **removed
from `app/globals.css`**. is_a is a real writable relation via the `broader`
(SKOS) frontmatter key (derive → `is_a` edge; registered in mcp/cli schema +
validator). Addictiveness comes from the **loop** (next action → immediate
reflection → accumulating progress), not from bling — Duolingo/Oura/Linear make
"one more" with zero glow. design-guardian now rejects glow/rarity/particle on
this surface too. Full history + KEEP/KILL/BUILD: session memory
`ontology-studio-game-direction`.

## Motion principles

- Initial load: `opacity 0 → 1` + `translateY 8px → 0` (spring)
- Hover: border opacity rises, connected edges brighten — no scale or glow
- Drawer: right-side `x: 100% → 0` spring
- Filter toggle: deselected categories fade to `opacity 0.15`
- Background: fully static
- Respect `prefers-reduced-motion`

## Page header — English caption + Korean h1

The header on each operations page (currently `/ontology/insights`) follows a **two-line pattern**. The user-facing Korean title is the primary heading, and the English category caption serves as a micro identifier that yields one step in the visual hierarchy.

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

`/ontology/insights` — follows this pattern. (`/ontology/edit`, the ERD builder,
was retired 2026-07-24 → it now redirects to `/ontology/studio`, the 공방 (Compass Stage).)

The public surfaces `/`, `/topology`, `/docs`, `/projects`, `/project/[slug]` use the standalone Korean h1 pattern (without an English eyebrow caption) — these are the browse surfaces, not the operations surfaces.

## Geometry & Type Codex (R5, 2026-07)

> **박스 하나하나 사이즈까지 싹 다 지정해서 모든 곳에서 동일하게.** 이 절은
> 텍스트 크기·radius·패딩을 토큰명으로 못박는 **법전**이다. 값 소스:
> `app/globals.css` `@theme` "Geometry & Type Codex" 블록. 아래 램프 밖의
> `text-[Npx]` / `rounded-[Npx]` 리터럴은 **존재 금지** — 신규 값이 필요하면
> 토큰을 신설하는 PR 로만 추가한다(인라인 arbitrary 로 몰래 넣지 않는다).

**실측 근거(치환 전, 2026-07):** `text-[Npx]` 하드코딩 **29종 크기 · 1,184건**,
arbitrary radius **18종**, 카드 패딩 4종. 이 산개를 아래 램프로 수렴했다.

### Type ramp — 7단

Tailwind v4 `--text-*` 네임스페이스가 `text-<step>` font-size 유틸리티를
생성한다. letter-spacing 은 `--tracking-*` 짝으로 **분리** 관리한다 —
`text-<step>` 에 자동 결합하면 ~1천 element 의 tracking 이 한꺼번에 바뀌어
"법전화지 리디자인 아님" 원칙을 깨기 때문. 신규 코드는 아래 짝을 함께 건다
(Apple 광학 원칙: 작은 단은 양의 tracking 으로 판독선 확보, 큰 단은 음의
tracking 으로 응집).

| 단 | 토큰 (유틸) | px | tracking 짝 (유틸) | 대상 |
|---|---|---|---|---|
| caption | `--text-caption` (`text-caption`) | 9.5 | `+0.04em` (`tracking-caption`) | 마이크로 라벨·범례·타임스탬프 |
| label | `--text-label` (`text-label`) | 11 | `+0.02em` (`tracking-label`) | 칩·배지·보조 라벨 |
| body | `--text-body` (`text-body`) | 12.5 | `+0.005em` (`tracking-body`) | 기본 본문·리스트 행 |
| body-lg | `--text-body-lg` (`text-body-lg`) | 14 | `0` (`tracking-body-lg`) | 강조 본문·부제 |
| title | `--text-title` (`text-title`) | 16 | `-0.01em` (`tracking-title`) | 패널/카드 제목 |
| display | `--text-display` (`text-display`) | 23 | `-0.022em` (`tracking-display`) | 페이지 헤드라인 |
| hero | `--text-hero` (`text-hero`) | 30 | `-0.022em` (`tracking-hero`) | 히어로 헤드라인 |
| hero-lg | `--text-hero-lg` (`text-hero-lg`) | 34 | `-0.022em` (`tracking-hero` 공유) | **관문 헤드라인** — 지도가 전면을 덮는 표면 |

**최근접 수렴 규칙**(치환 시): 각 리터럴 px 를 가장 가까운 단으로 스냅한다
(±1px 은 램프로 흡수). 단 사이 정확히 중간(예: 15px)은 상위 단으로, 램프 밖
값(≥1.5px 이탈)은 아래 "명시 예외"로만 남긴다.

**없는 단을 부르면 그 자리는 루트 16px 로 렌더된다** (2026-07-27 등재). Tailwind
는 정의되지 않은 스텝에 대해 아무 클래스도 만들지 않으므로, `text-large` 처럼
램프에 없는 이름은 **문법상 정상인 채로 아무 크기도 적용하지 않는다**. 이건
어떤 값 검사도 못 잡는다 — 존재하지 않는 것은 하드코딩 리터럴도 남기지 않아
`type-ramp-coverage` 래칫의 시야 밖이고, tsc·eslint 는 문자열을 검사하지 않는다.
실측 사례가 두 번 있었다: `text-callout`(#618 에서 손으로 발견), `text-large`
(공방 중심 카드의 노드 이름 — 화면의 주인공이 위성 카드 이름 12.5px 과 1.28배밖에
안 벌어져 있었다. 2026-07-27 `text-display` 로 수렴).

게이트는 `tests/contract/type-ramp-step-defined.contract.test.ts` 다. **ESLint 가
아닌 이유**: 판정에 이 문서가 아니라 `app/globals.css` 의 실제 토큰 목록이
필요한데, `no-restricted-syntax` 는 AST 셀렉터라 다른 파일을 참조할 수 없다.
스텝 이름을 룰에 복제하면 그 복제본이 램프와 드리프트해 게이트가 스스로
사각지대를 만든다. 그래서 원본을 읽어 판정하는 계약 테스트로 건다.

새 스텝이 정말 필요하면 한 PR 에서 셋을 함께 한다: ① `app/globals.css` 램프
② 이 문서의 표 ③ `src/shared/lib/cn.ts` 등록.

### Line-height ramp — 9단 (2026-07-27)

Tailwind v4 `--leading-*` 네임스페이스가 `leading-<step>` 유틸리티를 생성한다.
**행간은 독립 램프가 아니라 크기의 짝**이다 — 이 저장소의 실데이터가 그렇게
말한다: named 유틸리티의 대세가 이미 px 고정(`leading-4/5/6` = 16/20/24px,
121건)이고, 스케일 고정 계약이 이미 한 짝(크롬 라벨 11px + 16px 행간)을
명문화해 뒀다. 치수 규칙성 헌장과도 정합한다 — **행간이 곧 행 높이의 씨앗**
이라 px 로 고정해야 반복 카드 세트의 리듬이 글자 수·언어에 좌우되지 않는다.

값은 2px 그리드이고, 짝 3개(label 16 · body 20 · title 24)는 이미 쓰이던
`leading-4/5/6` 과 **값이 같다**. 새 규격이 아니라 이미 대세인 것에 이름을
준 것이다.

| 단 | 토큰 (유틸) | 값 | 짝 (font) | 비율 | 쓰임 — 이 행간을 언제 고르나 |
|---|---|---|---|---|---|
| caption | `--leading-caption` (`leading-caption`) | 14px | caption 9.5 | 1.47 | 마이크로 라벨·트랜스크립트·9~10px 보조문 |
| label | `--leading-label` (`leading-label`) | 16px | label 11 | 1.45 | 칩·배지·크롬 라벨·카드 설명. **잠금 계약의 16px** |
| body | `--leading-body` (`leading-body`) | 20px | body 12.5 | 1.60 | 기본 본문·리스트 행·패널 문단·목차 행 |
| body-lg | `--leading-body-lg` (`leading-body-lg`) | 22px | body-lg 14 | 1.57 | 강조 본문·부제 |
| title | `--leading-title` (`leading-title`) | 24px | title 16 | 1.50 | 패널/카드 제목 |
| display | `--leading-display` (`leading-display`) | 28px | display 23 | 1.22 | 페이지 헤드라인(줄바꿈 가능) |
| hero | `--leading-hero` (`leading-hero`) | 34px | hero 30 | 1.13 | 히어로 헤드라인(줄바꿈 가능) |
| hero-lg | `--leading-hero-lg` (`leading-hero-lg`) | 38px | hero-lg 34 | 1.12 | 관문 헤드라인(최대 2행) |
| display-tight | `--leading-display-tight` (`leading-display-tight`) | 1.06 | 자유 | — | **이름·수치처럼 한 덩어리로 읽히는 자리** — 히어로/섹션 제목, 카드 이름, 대형 수치. **최대 2행** |
| prose | `--leading-prose` (`leading-prose`) | 1.7 | 자유 | — | **사용자가 쓴 글** — 마크다운 뷰어/에디터, 상세 본문, pre. 읽기 폭 장문의 상한 |

**판정 한 줄**: 앱이 쓴 UI 텍스트면 그 크기의 **짝**, 사용자가 쓴 글이면
**prose**, 이름/수치면 **display-tight**.

**자유 스텝 2개만 무단위인 이유**: 이 둘은 램프 밖 크기(`clamp()` 히어로,
마크다운 내부의 중첩 크기)에도 얹히는 스텝이라, px 로 고정하면 크기마다
토큰이 또 필요해진다. 비율이 곧 의도(응집/이완)인 자리다.

**display-tight 의 경계**: 3행 이상 쌓이는 텍스트나 문장(설명·본문)에 쓰면
결함이다 — 한글은 윗줄 받침과 아랫줄 초성이 맞닿는다. 2행까지는 허용한다
(다운로드 히어로가 `<br />` 로 2행을 쓰는 실사용이 있다).

**한글이 값의 상한을 정한다.** 한글은 라틴보다 글자 상자가 꽉 차서 같은
행간이면 더 빽빽하게 읽힌다. 그래서 공유 램프 값은 **한글이 요구하는 여유**로
정하고 라틴이 그 여유를 따라온다(라틴은 넉넉한 행간에 관대하고, 한글은 좁은
행간에 관대하지 않다). **로케일별 분기는 만들지 않는다** — 한 문단 안에 두
언어가 섞이는 앱(en UI 안의 한글 vault 데이터)이라 분기는 같은 문단의 행
높이를 어긋나게 한다.

**tailwind-merge 등록 필수.** `cn.ts` 의 `LEADING_RAMP_STEPS` 에 스텝을 함께
등록하지 않으면 클래스가 드롭되지는 않지만 **충돌 병합이 일어나지 않는다** —
`cn('leading-body', cond && 'leading-prose')` 에서 둘 다 살아남고 CSS 소스
순서가 승자를 정한다. 크기 램프의 드롭 사고보다 조용해서 화면을 봐도 원인을
못 찾는다. 가드: `cn.test.ts`.

**companion 자동 결합 — 켰다 (B2, 2026-07-27).** Tailwind v4 의
`--text-<step>--line-height` 를 7단 전부에 정의해, `text-<step>` 하나가 행간까지
싣는다. 이 결합이 있어야 규격이 닫힌다 — 짝을 정의만 해두면 **행간 클래스를 안
쓴 자리**는 규격 밖에 남아 상속 1.5 로 렌더되고, 하드코딩 검사도 래칫도 *빠진
클래스*는 볼 수 없다(미등록 스텝이 루트 16px 로 조용히 렌더되던 것과 같은 계열의
사각지대다). 실측 927곳이 그 상태였다.

켜기 전 같은 조건(1512×950 다크 · ko/en · 8화면)으로 앞뒤를 찍어 잰 반경:

| 글자 | 건수 | 행간 |
|---|---|---|
| 9.5px caption | 94 | 14.25 → **14** (−0.25) |
| 11px label | 186 | 16.5 → **16** (−0.5) |
| 12.5px body | 70 | 18.75 → **20** (+1.25) |
| 14px body-lg | 30 | 21 → **22** (+1.0) |
| 23px display | 8 | 34.5 → **28** (−6.5) |

746 원소 중 388건이 바뀌고 그중 **380건이 |Δ| ≤ 1.25px** 다 — 대부분 한 줄짜리
칩·라벨이라 픽셀조차 안 움직인다. **박스 높이가 2px 이상 바뀐 곳은 8건**이고
전부 페이지 헤드라인(`/projects` · `/ontology/insights` · `/docs` 빈 상태 ·
`/git`)이다. 그 34.5px 은 아무도 고른 적 없는 상속 1.5 의 산물이었고, 치수
규칙성 헌장대로 행 높이를 설계 결정으로 되돌린 것이다. 라벨 186건이 내려온
16px 은 **잠금 계약이 이미 명문화한 값**이라, 결합은 계약을 어기는 게 아니라
계약이 말한 값으로 186곳을 수렴시킨다.

**font-size 는 하나도 안 바꾸므로 줄바꿈은 원리상 늘어날 수 없다.** 반복 카드
세트의 균일 높이가 깨진 곳도 0이다(행간이 크기로만 정해지니 한 세트는 함께
움직인다). 1024·768 에서도 같은 8건 + 2행 라벨 1건(42 → 44px)뿐이다.

**명시 `leading-*` 이 companion 을 이긴다** — B1 이 74곳에 깔아둔 명시 클래스가
그대로 방패로 작동한다. 단 `cn()` 안에서는 **순서가 중요하다**: tailwind-merge
는 "크기가 행간도 정한다"고 보므로 뒤따르는 `text-<스텝>` 이 앞선 `leading-*` 을
흡수한다. 결합 전엔 그 가정이 거짓이라 흡수된 자리가 상속 1.5 로 조용히
떨어졌고, 결합 후에야 참이 됐다. 권장 표기는 크기 먼저 · 행간 나중. 가드:
`cn.test.ts`.

**`--leading-hero` 는 오늘 1픽셀도 만들지 않는다 — 그래도 유지한다.** 저장소의
`text-hero` 호출부 2곳이 모두 명시 leading 을 이미 달고 있어서다
(`leading-tight` · `leading-display-tight`, 둘 다 "단일행 응집" 의도가 코드에
적혀 있다). 유지 이유는 미래다: 앞으로 leading 없이 히어로를 쓰면 상속 45px 이
아니라 **34px 을 받는다**. 빼면 램프 상단 두 단만 짝이 없는 예외가 생기고,
예외 없음이 규격의 값어치다. *"사용 0회니 죽은 토큰"* 으로 지우지 마라 —
`--pad-panel` 전례(아무도 안 쓰는 토큰은 오정보)와 다르다. 저건 아무도 안 쓰는
값이었고, 이건 `text-hero` 유틸리티가 **싣고 있는** 값이다.

**`--leading-hero-lg`(38px)도 같은 지위다** (2026-07-29 신설). 오늘 유일한
소비자인 `/download` 헤드라인이 `md:leading-hero-lg` 를 명시로 달고 있지만,
`--text-hero-lg--line-height` 결합이 있어야 램프 상단이 예외 없이 닫힌다.

**hero-lg 는 왜 34px 인가.** 지도가 전면을 덮는 표면에서 30px 헤드라인은
배경과 무게를 다툰다. 34px 이면 리드(`text-body` 12.5)와의 비가 **2.72** 로
레퍼런스 히어로 밴드(2.5–3.0) 안에 든다. 행간 38px 은 램프 상단으로 갈수록
비율이 조여지는 추세를 잇는다(1.217 → 1.133 → **1.118**). tracking 은
`--tracking-hero`(−0.022em)를 공유한다 — 같은 광학 구간이라 새 짝을 만들지
않는다. 승격 트리거는 **두 번째 소비처**였다: `DesktopVaultWelcome` 이 이미
`md:text-[34px]` + eslint-disable 로 램프를 비껴가고 있었다.

#### 조건부 크기 함정 — companion 결합이 만든 새 실패 모드

결합 이후 **글자 크기만 조건부로 갈아끼우면 짝이 어긋난다.** arbitrary 크기
(`text-[Npx]` · `text-[length:…]` · clamp)에는 companion 이 없으므로, 원래 단의
행간이 그 브레이크포인트에서도 그대로 남는다.

실측 전수 2건, 실제 어긋남 1건이었다:

| 자리 | 판정 |
|---|---|
| `/git` 헤드라인 — `text-title` + `sm:text-[length:var(--text-display)]` | ⚠️ **어긋남.** 23px 글자에 title 짝 24px 행간(1.04) — 저장소 최대 이탈. `sm:text-display` 로 정정 |
| 데스크톱 환영 히어로 — `text-hero` + `leading-tight` + `md:text-hero-lg` | 안전. **명시 leading 이 두 크기 모두를 덮는다**. (2026-07-29: 구 `md:text-[34px]` + eslint-disable 는 34px 이 램프 스텝으로 승격되면서 사라졌다 — 소비처가 둘이 되는 순간이 값을 이름으로 올릴 때다) |

**판별법**: 한 원소에 램프 크기 스텝과 조건부 arbitrary 크기가 함께 있으면,
명시 `leading-*` 이 있는지 본다. 없으면 결함이다. 고치는 길은 둘 —
① 조건부 크기도 램프 유틸리티로 쓰거나(짝이 따라온다) ② 명시 행간을 달아 두
크기 모두에서 직접 정한다.

**램프 토큰을 arbitrary length 로 우회 참조하지 마라.**
`text-[length:var(--text-display)]` 는 `text-display` 와 크기가 같아 보이지만
**행간 짝을 잃는다.** 램프 **밖** 크기 토큰(레일 라벨·크롬 타이틀 등 전용
토큰)의 arbitrary 참조는 정당하다 — 우회할 램프가 없기 때문이다.

게이트는 두 층이다: 우회 참조는 **lint** 가(`arbitrarySizeSelectors`), 짝
어긋남 일반형은 **계약 테스트**가 잡는다
(`tests/contract/type-ramp-leading-pair.contract.test.ts`) — 후자는 판정에 한
원소의 클래스 전체가 필요한데 `cn()` 인자로 쪼개지면 AST 셀렉터 하나에 안
담기기 때문이다.

### Radius ramp — 3단 (일반 표면)

Tailwind v4 `--radius-*` 네임스페이스가 `rounded-<step>` 를 생성한다.

| 단 | 토큰 (유틸) | px | 대상 |
|---|---|---|---|
| chip | `--radius-chip` (`rounded-chip`) | 6 | 칩·배지·작은 버튼 |
| card | `--radius-card` (`rounded-card`) | 9 | 카드·인풋·중형 서피스 |
| panel | `--radius-panel` (`rounded-panel`) | 12 | 패널·모달·큰 서피스 |

> **크롬 radius 사다리와의 관계.** 아래 "크롬 문법" 절의 `--chrome-radius`
> (10px) · `--chrome-radius-inner`(7px) · 키캡(4px) 사다리는 **컴포넌트에
> 캡슐화된 별개 체계**다(ChromeTile / ChromeChip / 상태 칩 전용). 이 codex 의
> `rounded-chip/card/panel` 은 그 밖의 **일반 JSX 표면**을 지배한다. 크롬
> 표면은 인라인 `rounded-[Npx]` 가 아니라 컴포넌트를 경유하므로 두 체계는
> 충돌하지 않는다 — 크롬 박스는 크롬 사다리, 나머지는 이 램프.

### 페이지 컬럼 — `--page-max` 하나

| 대상 | 토큰 | px |
|---|---|---|
| 페이지 컨테이너 | `--page-max` | 1600 |

`--page-max` 는 1920 기준 좌우 거터 160 을 남기는 페이지 폭이다.

**`--page-col-utility`(960px) 는 삭제됐다** (2026-07-29 디자인 카운슬 평결 ③).
"한 가지를 판단하는 화면은 안쪽에서 한 번 더 좁힌다" 는 규격 자체가 틀린
것은 아니었지만, **유일한 소비자에서 정확히 반대 결과를 냈다.** `/download`
는 다운로드 판을 무대 **왼쪽에 붙이는** 표면인데, 바닥 절만 이 토큰으로 다시
중앙정렬되면서 같은 페이지 안에 정렬 기준이 둘이 됐다 — 실측(1920): 판 x=160 ·
바닥 x=480. 어느 원소도 다른 원소와 정렬되지 않았다.

교훈 두 줄:

- **중앙 컬럼은 왼쪽 정렬 표면과 섞이지 않는다.** 한 페이지에 `mx-auto` 컬럼과
  좌측 고정 컬럼이 공존하면 둘의 x 는 뷰포트 폭의 함수로 갈린다.
- **아무도 안 쓰는 토큰은 규격이 아니라 오정보다.** 소비자가 0이 된 순간
  지운다(`--pad-card`/`--pad-panel` 과 같은 처분).

#### 정렬 원점 — `--gateway-origin` (2026-07-29 밤, 관문 표면)

| 대상 | 토큰 | 값 |
|---|---|---|
| 관문 정렬 원점 | `--gateway-origin` | `max(--gateway-gutter, (100vw − --page-max) / 2)` |
| 관문 홈통(원점의 바닥) | `--gateway-gutter` | 40 · 64(≥1536) — 무단위 |
| 관문 판 폭 / 틈 | `--gateway-plate-width` / `--gateway-plate-gap` | 480 / 24 — 무단위 |

**왼쪽만 맞추면 화면은 여전히 쏠린다.** 위 평결 ③ 이 여섯 원소를 같은 x 에
세운 뒤에도, 컬럼이 `--page-max` 에서 멈추니 남는 폭이 전부 오른쪽에 쌓였다 —
실측 1920 좌 64 · 우 256(비 4.0), 2560 좌 96 · 우 864(비 9.0). 여섯 원소는
그때도 **한 벌이었다**. 정렬 원칙을 지키면서도 대칭은 깨질 수 있으니, 둘은
따로 규격이고 따로 잰다.

**`mx-auto` 로 고치지 않는다.** 중앙정렬이 나빠서가 아니라 **원점이 둘이 되기
때문**이다 — 래퍼는 뷰포트를 보고 중앙에 서는데 카메라 예약 인셋은 고정값이라
1920 에서 +96, 2560 에서 +416 이 어긋난다. 원점을 토큰 하나로 승격시키면 여섯
원소와 카메라가 **같은 수**를 먹으므로 그 사고가 구조적으로 불가능해진다.
대칭은 좌우 패딩이 둘 다 원점이고 컬럼이 남는 폭을 정확히 채우는 데서 나온다.

**`@property <length>` 로 등록하는 유일한 관문 토큰이다.** 등록해야 계산값이
`160px` 같은 쓰인 길이로 굳고, 그래야 ① 뷰포트가 바뀔 때 CSS 가 알아서 다시
계산하고 ② JS 가 `parseFloat` 로 같은 수를 읽어 카메라 예약폭
(`원점 + 판 폭 + 틈`)을 파생시킨다. 사람이 손으로 정하는 원자값 셋은 **등록하지
않는다** — 등록하면 `30rem` 같은 자연스러운 오입력이 에러 없이 initial-value 로
되돌아가는 조용한 드리프트가 생긴다. 파생값만 등록한다.

**⚠️ 원점이 뷰포트의 함수가 되면 JS 파생은 리사이즈에 구독해야 한다.** CSS 쪽은
공짜로 따라오지만 카메라 예약폭은 안 따라온다 — 마운트 1회로 두면 판은 새
원점으로 가는데 카메라는 옛 수를 계속 피한다. 갱신은 전면 무효화가 아니라
`refreshIndexDependentTokens`(그 토큰 하나만 교체)로 한다.

게이트: `tests/e2e/download-gateway-grid.spec.ts` — 8폭 × (여섯 원소 x 동일 ·
`clientWidth − 밴드.right === 원점` · GNB 우측끝 · 예약폭 = 원점+판폭+틈) +
리사이즈 왕복. 대칭의 기준자는 `innerWidth` 가 아니라 `clientWidth` 다
(`100vw` 는 스크롤바를 포함하고 `getBoundingClientRect` 는 안 한다).

### Padding — 램프를 두지 않는다 (2026-07-26 정리)

| 대상 | 토큰 | px |
|---|---|---|
| 카드 내부 | `--card-pad` | 16 |
| 패널 내부 | `--topology-v2-panel-pad` | 14 |

**예전엔 `--pad-card`/`--pad-panel` 이라는 별도 2단 램프가 있었지만
삭제했다.** 이유는 문서가 죽은 값을 가리키고 있었기 때문이다:

- 전수 조사 결과 두 토큰의 **코드 사용은 0회**였다. 카드는 처음부터
  `--card-pad` 를, 패널은 `--topology-v2-panel-pad` 를 쓰고 있었다.
- `--pad-card`(16)는 `--card-pad`(16)와 값이 겹쳤다 — 같은 개념에 이름이 둘.
- `--pad-panel`(12)은 패널이 실제 쓰는 값(14)과 **달랐다**. 이 표를 보고 새
  패널을 만들었다면 기존 패널과 2px 어긋났을 것이다.

교훈은 규격 일반에 적용된다: **아무도 안 쓰는 토큰은 규격이 아니라
오정보다.** 램프를 만들 때는 사용처가 그 램프를 실제로 참조하는지까지가
한 작업이다.

간격 계단은 **4/8 원칙** — `gap-*` / `space-*` 는 1(4px)·2(8px)·3(12px)…
스텝만. 남아 있는 arbitrary px 패딩 27건은 전수 분류 결과 3·11·18px 를 빼면
전부 1~2회짜리 **광학 보정**이라, 램프에 스냅시키면 오히려 정렬이 깨진다 —
그래서 패딩에는 lint 룰을 걸지 않는다.

### 박스별 규격 표

각 박스는 아래 토큰만 참조한다. 표 밖의 인라인 px/radius 재구현 금지.

| 박스 | 높이 | radius | 패딩 | 타이포 단 |
|---|---|---|---|---|
| 크롬 타일 (ChromeTile) | `--chrome-tile-size` 36px | `--chrome-radius` 10px | `--chrome-inset` 정렬 | 아이콘 16px |
| 상태 칩 (`CHROME_STATUS_CHIP_CLASS`) | 44px (타일과 동일) | `--chrome-radius` 10px | `px-3.5` | body / label |
| 패널 (INDEX · 데이터시트) | 콘텐츠 | `--topology-v2-panel-radius` 12px (= `rounded-panel`) | `--topology-v2-panel-pad` | title 헤더 · body 행 |
| 팝오버 (ego popover) | 콘텐츠 | `rounded-panel` | `--card-pad` | title + body/label |
| 카드 (일반) | 콘텐츠 | `rounded-card` | `--card-pad` | title + body |
| 배지·칩 (일반) | 콘텐츠 | `rounded-chip` | `px-2 py-0.5` | label (또는 caption) |
| 입력 (input/search) | 콘텐츠 | `rounded-card` | `px-3 py-2` | body |
| 버튼 (일반) | 콘텐츠 | `rounded-chip`~`card` | `px-3 py-1.5` | body |

### 명시 예외 (램프 밖, 문서화된 것만)

램프로 스냅하면 리디자인이 되는 소수 표면은 `// eslint-disable-next-line
no-restricted-syntax -- <사유>` 로만 남긴다. 현재 등재분:

- **헤어라인 반경 1~4px** — 2~14px 높이 progress/capacity 미터 트랙·fill
  (`full-detail-a1-reach-panel`, `TopologyIndexTreeRow`, `FreshnessTab`,
  reach 스텝 칩). chip(6px)로 올리면 pill 처럼 읽혀 유지.
- **overlay sheet 반경 18~28px** — floating 카드/시트(`SearchPalette` 22px,
  `GestureHint`/`PublicQuickActions` 18px, `ProjectDrawer` 20px, `detail-card`
  28px 시그니처). panel(12px)로 내리면 표면 성격이 바뀌어 유지. `detail-card`
  28px 은 `detail-card.test.tsx` 가 assert.
- **display 숫자 34~40px** — 센서스 시그니처 대형 숫자(`InsightsHeroCensus`
  40px), 반응형 히어로 강조(`DesktopVaultWelcome` md:34px). type 램프 상단
  (hero 30px)을 넘는 의도적 display.
- **행간 1.1 (딱 1건)** — 데이터시트 액션 타일의 10px 2행 라벨
  (`TopologyV2DetailPanel` `ACTION_TILE_LEADING`). 짝인 caption(14px)을 넣으면
  두 행이 6px 자라 액션 스트립이 아래 메트릭 라인을 밀어내 크롬 스케일 계약을
  깬다. 이 값이 필요한 자리가 앱에 하나뿐이라 램프를 넓히지 않는다 — 쓰임이
  하나인 토큰은 규격이 아니라 오정보다. **별도 상수로 뽑아 둔 이유**: disable
  주석은 줄 단위라 클래스 문자열에 붙이면 같은 줄의 `text-[Npx]` 부채까지
  함께 침묵시킨다(실측: lint 총계가 143 → 142 로 *내려가는* 것으로 드러났다).

### Lint 봉쇄

`eslint.config.mjs` 의 `no-restricted-syntax` 가 신규 `text-[Npx]` ·
`rounded-[Npx]` · `leading-[N]` arbitrary 클래스를 차단한다.

**행간 named 유틸리티(`leading-4/5/6/relaxed/snug` 등 199건)는 룰로 잡지
않는다.** 199 warning 은 베이스라인 143 을 덮는 소음이고, 대세인 값 3개
(16/20/24px)는 램프 짝과 **동일해 위반도 아니다**. arbitrary 가 0 이 된 뒤
`relaxed`/`snug` 계열만 래칫 후보로 재측정한다.

- **마이그레이션 완료 디렉토리 = error** — `src/views/{ontology-insights,
  project-selector,ontology-edit,docs-vault}` · `src/shared/ui` · `src/widgets`
  (R6 제외).
- **미완(동시 작업) = warn** — `src/widgets/topology-map-v2` ·
  `src/widgets/hero-header` · `src/views/home`. R6 치환 완료 시 error 로 승격.
- 테스트 파일(`*.test.tsx`)은 렌더된 className 을 assert 하므로 룰에서 제외.

### 모션 문법 인덱스

기하와 짝인 모션 토큰(값 소스: `app/globals.css` 하단 `--topology-motion-*`):

- **spring 패밀리** — `damping` / `response` 쌍으로 표기. 크롬 등장·카메라·
  패널·드래그가 공유하는 단일 물리 어휘.
- **크롬 등장** — 180ms.
- **카메라/포커스 이동** — 200~420ms 구간.
- `prefers-reduced-motion` 존중은 base layer 에서 이미 처리.

## 크롬 문법 (feat/chrome-system)

Topology chrome (브랜드 pill · 상단 HUD lane · INDEX 패널 · 이후 좌측 내비 레일)이
공유하는 "machined tile" 문법. 승인 시안: `docs/prototypes/index-panel-v2-full.html`
(소유자 "좋다! 이대로 적용하자"). 토큰 소스: `app/globals.css` `--chrome-*`.
컴포넌트: `src/shared/ui/chrome-tile.tsx` (ChromeTile) ·
`src/shared/ui/chrome-chip.tsx` (ChromeChip).

### Radius 스텝 (4계층)

| 스텝 | 값 | 대상 |
|---|---|---|
| 키캡 | 4px | `<kbd>` 단축키 캡 |
| inner | 7px (`--chrome-radius-inner`) | 접기 버튼처럼 타일 안에 중첩되는 소형 컨트롤 |
| 타일 / 칩 / 필 | 10px (`--chrome-radius`) | ChromeTile · ChromeChip · 브랜드 필 |
| 패널 | 12px (`--topology-v2-panel-radius`) | INDEX 패널 · 압축 데이터시트 |

### 타일 / 칩 / 필 / 패널 4계층

- **타일 (ChromeTile)** — 36px 정사각(`--chrome-tile-size`) 아이콘 버튼. 목적지
  1개 = 타일 1개 (전체 보기, 문서함, 빌더 등). `href` 를 주면 링크, 없으면 버튼.
- **칩 (ChromeChip)** — 44px 높이 라벨 버튼. 아이콘(14px) + 텍스트 + 선택적
  `kbd` 캡. 자동 정렬 · 검색 · 작업공간처럼 라벨이 의미의 일부인 컨트롤.
- **필 (브랜드 pill)** — 칩과 같은 표면(10px radius)이지만 내부에 pip(브랜드
  마크) + 2줄 텍스트(타이틀 + census)를 담는 조합형 표면. `HeroCollapsed`.
- **패널 (INDEX · 압축 데이터시트)** — 12px radius, 위 3계층보다 한 단 크고
  내부에 자체 헤더/바디/푸터 리듬을 가진 표면.

### 박스 규격 (Geometry ladder) — "모든 곳 동일 적용" 계약

상단 크롬 열(브랜드 필 · 상태 칩 · 유틸리티 lane)의 **모든 표면은 같은 기하
토큰을 공유한다**. 규격을 인라인 px/hex 로 재구현하지 않고 아래 토큰만 참조한다
(`design.md` "인라인 재구현 금지"). 값 소스: `app/globals.css` `--chrome-*` /
`--topology-v2-panel-*`.

| 규격 | 토큰 | 값 | 대상 |
|---|---|---|---|
| 크롬 타일 높이 | `--chrome-tile-size` | 36px | ChromeTile · ChromeChip · 상태 칩(영역·복귀·경로) — **단일 규격** |
| 타일/칩/필 radius | `--chrome-radius` | 10px | 위 모든 크롬 표면 |
| inner radius | `--chrome-radius-inner` | 7px | 타일 안에 중첩되는 소형 컨트롤 |
| 키캡 radius | (kbd) | 4px | `<kbd>` 단축키 캡 |
| 패널 radius | `--topology-v2-panel-radius` | 12px | INDEX 패널 · 압축 데이터시트 |
| 보더 · 서피스 · 그림자 | `--chrome-border` · `--chrome-surface` · `--chrome-shadow` | — | 위 모든 크롬 표면 |

- **버튼 칩 vs 상태 칩** — 클릭 액션은 `ChromeChip`(버튼), "지금 이 세계/이
  경로" 를 알리는 비-버튼 상태 표시는 `CHROME_STATUS_CHIP_CLASS`
  (`src/shared/ui/chrome-chip.tsx`)를 쓴다. 둘은 **같은 높이·radius·보더·서피스·
  패딩(`px-3.5`)** 을 공유한다 — 형제로 나란히 서므로 규격이 어긋나면 즉시
  눈에 띈다. 상태 칩 3종(`TopologyRealmChip` · `TopologyInsightsReturnChip` ·
  `TopologyPathChip`)이 이 상수를 공유한다. 회귀 핀:
  `src/views/home/ui/topology-chrome-chip-geometry.test.tsx`.
- **⚠️ `topology-ui-scale` 중첩 금지 (S10 결함 1)** — `.topology-ui-scale` 은
  `zoom` 으로 구현되고 `zoom` 은 **중첩 시 곱해진다**(≥1920px 에서 1.15 ×
  1.15 ≈ 1.32). 스케일은 상단 lane 래퍼(`SearchHint` 등) **하나**가 소유한다.
  그 안에 슬롯으로 들어가는 칩이 `topology-ui-scale` 을 자기 자신에 다시 걸면
  형제보다 ~32% 커진다 — 소유자 1920 실보고의 "영역 칩이 검색/자동정렬보다
  큼" 이 정확히 이 이중 적용이었다. 슬롯 컴포넌트는 스케일 클래스를 갖지
  않는다(`CHROME_STATUS_CHIP_CLASS` 에 미포함).

### 좌측 내비 레일 (AppNavRail)

`docs/prototypes/chrome-rail-combined.html` 소유자 최종 승인 — 지형도 좌측에
상시 떠 있는 64px 세로 레일. `src/widgets/app-nav-rail`. 전역 목적지(지도·
문서함·공방·인사이트·프로젝트) + 하단 에이전트 상태·설정을 전담해, 브랜드
필의 book/network 유틸 타일과 우측 세로 레일의 설정 기어를 흡수한다.

- 로고(`<BrandMark size={20} detail="compact" />`, 위 "Brand mark" 섹션 — 브랜드
  필 pip 도 같은 컴포넌트를 15px 로 씀, 두 표면이 같은 마크) + 5 목적지(아이콘
  18px + 한글 라벨 9.5px) + 하단 에이전트 상태(Activity 아이콘 + 활동 중 앰버
  점) + 설정(기어, 트리거만 이관 — 팝오버는 앵커 방향만 `popoverAlign="left"`
  + `popoverSide="top"` 로 반전 — 레일 하단 트리거는 아래로 열면 화면 밖으로
  넘친다, 1920 라이브에서 발견).
- 활성 항목 = 인디고 틴트 타일 + 1px 인셋 링 + 좌측 2px 바 + `aria-current`.
  탭/칩과 달리 좌측 바가 추가되는 이유: 세로 스택에서 "지금 여기" 신호가
  타일 색만으로는 스캔하기 약해서(가로 탭의 밑줄 관례를 세로로 옮김).
- 캔버스 밖 flex 형제로 마운트 — 지도/INDEX/브랜드 필 등 기존 `absolute
  left-*` 좌표는 그대로 두어도 새 relative 컨테이너 기준으로 64px 밀린다
  (좌표 재계산 불필요). 캔버스 2D 엔진의 safe-inset 토큰은 뷰포트가 아니라
  이 relative 컨테이너를 기준으로 재측정하므로 별도 보정이 필요 없다 —
  라이브 화면에서 겹침 없음을 실측 확인.
- [완료, feat/rail-rollout] 위 슬라이스(#375)는 마운트 범위를 지형도
  (HomePage) 로 한정하고 `/docs`, `/ontology/*`, `/projects`, `/project/*`,
  `/download` 롤아웃과 `OperationsNav`/`OntologySubNav` 와의 관계 정리를
  별도 슬라이스로 미뤘다 — feat/rail-rollout 이 그 슬라이스로, 레일을 전
  페이지에 상주시키고 `OperationsNav`/`OntologySubNav` 를 완전히 삭제했다.
  표시 breakpoint 도 `md` → `lg` 로 올려 `BottomTabBar` 와의 경계를
  명확히 했다. 레일이 못 품는 `AppSettingsMenu`(구 `OperationsNav` 설정
  기어)·`LiveActivityIndicator` 는 별도 위젯으로 분리해 필요한 페이지
  헤더에 개별 마운트한다 (기능 손실 0 원칙, `docs/ARCHITECTURE.md` 참고).

### 토큰

- `--chrome-tile-size: 36px` · `--chrome-radius: 10px` · `--chrome-radius-inner: 7px`
- `--chrome-icon: 16px` (ChromeTile 아이콘) — ChromeChip 아이콘은 14px(칩 자체
  클래스가 강제, 별도 토큰 없음 — 칩은 타일보다 조밀한 밀도라 이 폭이 시안
  실측값).
- `--chrome-surface` · `--chrome-border`(=`--color-border-soft` 참조) ·
  `--chrome-shadow` · `--chrome-engrave` — 다크 전용 값.
- `--chrome-inset: 24px` — 좌우 정렬 기준선. `--topology-index-inset` 이 이
  값을 참조(단일 출처) — 새 크롬 표면의 좌우 여백은 항상 이 토큰만 쓴다.
- 기존 `--topology-chrome-*`(원형 pill 전용, 999px radius)와는 형태가 달라
  값을 공유하지 않는다 — 그림자/인디고 계열만 같은 단일 채색 신경계.

### Lucide 아이콘 규정

- stroke-width **1.75px** (Lucide 기본값 그대로 — 굵게 override 하지 않는다).
- 크기: ChromeTile 16px(`--chrome-icon`) · ChromeChip 14px.

### 24px 정렬 레일

Topology chrome 의 모든 좌/우 바깥 여백은 `--chrome-inset`(24px) 하나로
수렴한다. 브랜드 필 wrapper, INDEX 패널, TopologyAnalysisBar 좌측 정렬이 모두
같은 값을 참조 — 값 하나를 바꾸면 전 표면이 같이 움직인다.

### 소비 규범

크롬 표면(타일/칩)은 반드시 `ChromeTile` / `ChromeChip` 을 통해서만 만든다.
JSX 안에 44px 정사각 버튼이나 라벨 버튼을 인라인 클래스로 재구현하지 않는다 —
드리프트가 생기면(예: 43px, 11px radius) 시각적으로 감지하기 어렵고, 컴포넌트
경유가 아니면 다음 토큰 개정이 그 인스턴스를 놓친다.

## 컨트롤 인벤토리 (캐노니컬 컴포넌트) — 디자인 전면 정비 Phase 1 (2026-07-25)

> 22건 정비의 다수(4·13·16)는 개별 결함이 아니라 **시스템 부재의 증상**이라,
> 폼/셀렉트/빈 상태/모달의 캐노니컬 컴포넌트·토큰을 먼저 세운다. 전체 계획:
> `docs/plans/DESIGN-OVERHAUL-2026-07-25.md`.

### 캐노니컬 컴포넌트 위치

| 컴포넌트 | 위치 | 용도 |
|---|---|---|
| `Select` (다크 Listbox) | `src/shared/ui/select.tsx` | 네이티브 `<select>` 대체 — macOS 회색 시스템 드롭다운을 다크 앱 문법으로 |
| `EmptyState` | `src/shared/ui/empty-state.tsx` | 빈 리스트/차트/페이지 — 스켈레톤 자리표시 + 아이콘 + 한 줄 안내 |
| `ChromeTile` / `ChromeChip` | `src/shared/ui/chrome-tile.tsx` · `chrome-chip.tsx` | 크롬 타일/칩 (별도 "크롬 문법" 절) |
| `controlClass()` | `src/shared/ui/control-class.ts` | **값 층** — 눌리는 것들의 단일 클래스 출처 (아래 절) |
| `Chip` · `IconButton` · `RowButton` | `src/shared/ui/controls.tsx` | **행동 층** — `type="button"` 기본 · 접근 이름 강제 · 버튼 시맨틱 |
| `Surface` | `src/shared/ui/surface.tsx` | 조건부로 나타나는 표면의 등장·퇴장 |

⚠️ **`Card` · `Badge` · `DetailCard` 는 2026-08-03 에 삭제됐다.** 2026-04-30 생성,
3개월간 프로덕션 사용처 0. 이유는 게으름이 아니라 그 컴포넌트가 **시스템을
위반**하고 있었다는 것이다 — `CardTitle` 이 타입 램프에 없는 `text-lg` 를 썼다.
실패한 것은 컴포넌트가 아니라 **게이트 없는 컴포넌트**다.

### 컨트롤 모양 — `controlClass()` (2026-08-03 소유자 확정)

**이 표는 전수에서 나왔지 정해진 게 아니다.** 프로덕션 생 `<button>` 419개를
분류한 결과:

| 모양 | 개수 | 무엇인가 |
|---|---:|---|
| `chip` | 128 | 라벨을 가진 작은 알약형 |
| `link` | 85 | 글자만으로 눌리는 것 |
| `row` | 39 | 목록의 한 줄 전체 |
| `icon` | 36 | 정사각 아이콘 — 접근 이름 필수 |
| `pill` | 32 | 상태·수치를 나르는 완전 둥근 것 |
| `card` | 18 | 카드가 통째로 눌리는 큰 표면 |
| **표준 버튼(h-10/11)** | **1** | 기존 `<Button>` 이 덮는 **유일한** 모양 |

그 뒤 두 개가 더해졌고, **둘 다 감이 아니라 반복 횟수로 들어왔다** — 정규화
라운드가 「못 옮겼다」고 적은 사유를 세어 같은 결론이 여러 번 나온 것만 승격한다:

| 모양 | 언제 | 무엇이 없어서 생겼나 |
|---|---|---|
| `tile` | 2026-08-03 | 모양 여섯이 **전부 가로**였다. 아이콘 위·글자 아래의 세로 액션 타일 5개가 축 밖 |
| `segment` | 2026-08-03 | 보더 없는 인셋(세그먼트 항목·탭·고스트 버튼). **네 라운드 연속** 같은 결론이 다른 이름으로 나왔다(설정 3 · 지도 3 · features 9 · 위젯 6). `chip`/`pill`/`card`/`tile` 은 보더 필수라 상자 속 상자가 되고, `link` 는 인셋 0이라 히트 영역이 사라진다 |

축도 셋 늘었다가 **하나가 다시 죽었다**(전부 같은 규율):

| 축 | 무엇을 여나 | 근거 |
|---|---|---|
| `scope: 'app' \| 'panel'` | 지도 패널의 **두 번째 무채 잉크 램프**(`--topology-v2-panel-text-*`) | 두 라운드가 독립으로 같은 결론(11 + 8). 두 램프는 두 개의 채색 시스템이 아니라 **하나의 무채 램프가 두 바탕 위에서 갖는 두 해**다 — 패널 값은 `#17171c` 위 대비 실측으로 넛지됐다. 계약이 ① 두 램프가 단마다 실제로 다름을 globals.css 에서 읽어 단언하고 ② 패널 램프가 **잉크로만** 나가게 잠근다 |
| `truncate` | 말줄임 | 모양 여덟이 전부 flex 계열이라 `text-overflow: ellipsis` 가 안 먹는다(실측: `inline-block` 은 `…`, `inline-flex` 는 하드 클립). 유틸리티만 얹어선 못 고치고 **display 를 바꿔야** 한다 |
| ~~`fixedHeight` 3단~~ | — | **2026-08-03 삭제.** 아래 「컨트롤 높이 사다리」 절이 정본이다 — 그 축은 값이 틀렸다는 **증상**이었고, 값을 32로 수렴시키니 죽었다 |

톤도 하나 늘었다 — `onAccent`. 채운 인디고 위의 전경(`--color-text-on-accent`,
#fff, 인디고 위 4.71:1 = AA)이 없어서 두 라운드 11개가 밖에 있었다. **잉크만이
아니라 바탕·무게까지 한 쌍으로** 낸다(`active: true` 와 같은 문법) — 잉크만 내면
소비처가 `bg-…` 를 계속 손으로 써서 층이 있으나 마나가 된다.

그리고 또 하나 — `accentOnTint` (2026-08-03 체계석 판정). **이 앱에는 인디고
잉크의 해가 둘이다**, `scope` 축과 같은 문법으로:

| 톤 | 토큰 | 라이선스 (합성 대비 실측) |
|---|---|---|
| `accent` | `--color-indigo-accent` #7170ff — 앱 전역 99줄의 링크·라벨 관용구 | **맨 어두운 바탕까지만**: canvas 5.18 · panel 4.96 · elevated 4.53. 인디고 틴트(a14+/`line-a13`)나 앰버 힌트가 깔리면 3.5~4.4 로 WCAG 1.4.3 AA(4.5) 미달 — 호버 `a24` 는 canvas 위에서도 4.13 |
| `accentOnTint` | `--color-indigo-text-soft` rgba(188,195,255,.92) — 공방·지도 패널이 손으로 이미 쓰던 글자 인디고 | 모든 바탕 × 모든 틴트 합성에서 6.46:1 이상 — 어디서나 안전 |

전수 29곳 중 **26곳이 틴트 채움/호버 채움을 지고 있어 실측 미달 상태**였다
(대표: 설정 시트 인디고 칩 13곳 전부 — 호버 `line-a13`/panel 4.12). 그 26곳이
`accentOnTint` 로 갔고, 잔류 3곳은 전부 맨 바탕 위 `link` 다. 게이트 셋:
① `tests/contract/accent-ink-contrast.contract.test.ts` — 토큰 실값으로
라이선스를 계산하고, **accent 가 틴트 위에서 아직 실제로 깨진다**는 반대
단언도 갖는다(토큰이 수렴해 이게 빨개지는 날이 두 톤을 접는 날이다 — scope
축 게이트와 같은 문법) ② 같은 파일의 소스 스캔 — 파일 상수로 우회된
페어링까지 ③ eslint `accentTintPairingSelectors` — 같은 호출/원소 안의
리터럴 페어링을 편집기에서 즉시.

**`<Button>` 채택률 5%는 게으름이 아니라 커버리지 구멍이었다** — 시스템에 컨트롤
클래스가 하나뿐인데 앱은 여섯을 쓴다.

**왜 컴포넌트가 아니라 함수인가.** 이 저장소는 컴포넌트로 이미 시도했고 실패한
실측이 있다: `Card` · `Badge` · `DetailCard` 는 프로덕션 사용처가 **0**,
`ChromeTile` 1, `ChromeChip` 5. 그리고 여기서 실제로 작동하는 강제 기제는 lint
하나인데(이 문서의 "규격은 lint 로 강제된다" 절), 컴포넌트는 lint 로 강제할 수
없고 «이 className 이 이 함수에서 왔는가»는 강제할 수 있다.

⚠️ **기존 컨트롤을 옮기는 것은 리팩터가 아니라 정규화다 — 픽셀이 바뀐다.**
칩 143개의 (높이, `px`, `py`, 타입) 결합 분포가 **고유 조합 50종**이고 상위 3종을
합쳐도 23%였다. 즉 오늘의 크기는 램프가 아니라 임의값이고, 3단 램프는 «오늘의
요약»이 아니라 «가야 할 규격»이다. 그래서 대량 전환은 **디자인 게이트**(「체계」)의
일이고, 오늘 강제되는 것은 하나다 — **새로 쓰는 컨트롤은 50종을 51종으로 만들지
않는다**(`tests/contract/control-adoption-ratchet.contract.test.ts`. 기준선은 내려가기만 한다 — 417 에서 시작해 오늘 148).

### 컨트롤 높이 사다리 (2026-08-03 소유자 확정)

**이 표 밖의 컨트롤 높이는 이탈이다.** 이 절이 없어서 30 과 34 가 태어났다 —
컨트롤 값 층을 지으면서 `--control-h-*` 를 찾지 않고 패딩+행간+보더의 합을 램프라고
불렀고, 그 합이 칩 24/30/34 · 필 20/22/30 을 냈다. **30 · 34 · 22 · 20 은 이 앱의
높이 어휘 어디에도 없는 값**이다.

| px | 토큰 / 단 | 누가 서 있나 | 왜 이 값인가 |
|---:|---|---|---|
| **24** | (토큰 없음 — 규격 상수) | `chip`/`pill`/`icon` 의 `sm`, `segment` 의 `sm`·`md` | **WCAG 2.5.8 (AA, Target Size Minimum) 24×24** — 사다리의 바닥이다. 이 아래는 규격 미달이지 「작은 단」이 아니다 |
| **28** | `--control-h-sm` | `row` 의 `sm`, `icon` 의 `md`(`h-7 w-7`) | 한 줄 목록 행과 28px 정사각 아이콘 |
| **32** | `--control-h-md` | `chip`/`pill` 의 `md`·`lg`, `segment` 의 `lg`, `card` 의 `sm`, `icon` 의 `lg`, `--app-nav-rail-tile-height` | **이 앱의 기본 컨트롤 높이.** 값 층은 `min-h-8` 로 이 값에 선다 |
| **36** | `--chrome-tile-size` | 크롬 필·타일, **문서함 헤더 타일**, `row` 의 `md`, `card` 의 `md` | 「스케일 고정 계약」이 못박은 워크벤치 크롬 치수 |
| **40** | `--control-h-lg` | Select, 큰 폼 컨트롤, `card` 의 `lg` | 글자를 입력받는 상자 |
| **44** | `--touch-target-min` | `link`(비인라인)의 `min-h-11`, `row` 의 `lg`, `--control-row-h`, `pointer: coarse` 승격 | Apple HIG / Material 의 최소 터치 타깃 |

**34 는 2026-08-03 에 이 표에서 사라졌다.** 한 줄짜리 「크롬 잠금」으로
등재돼 있었지만, 그 등재는 34 를 **정당화한 게 아니라 기록만** 하고 있었다.
근거를 따라가면 `DocsHeaderTile` 의 주석 한 줄이 나온다 — *"`ChromeTile` 은
`--chrome-tile-size`(**44px**)를 고정해 헤더 밀도(34px)에 안 맞는다."*
크롬 타일은 2026-07-23 에 **36px 로 내려왔고**(소유자 *"딱봐도 크다"*), 그날
34 의 유일한 근거가 사라졌는데 아무도 34 를 다시 유도하지 않았다. 같은 역할
(정사각 아이콘 타일)에 값 둘 · coarse 승격 규칙 둘이 남아 있었을 뿐이다.
지금은 하나다: `--chrome-tile-size`. 원장: `docs/DECISIONS.md` 2026-08-03
「타일 치수는 하나다」.

### 이 사다리는 **어느 모양에** 적용되나 (2026-08-03 — 범위 명시)

위 문장(*"이 표 밖의 컨트롤 높이는 이탈이다"*)은 사정거리를 안 적어서, 실제로
**이탈로도 준수로도 판정할 수 없는 자리**를 남겼다: 나브레일 항목은 전 라우트에서
**62px** 로 렌더되는데(실측 1440×900), 그 62 는 아무도 고른 값이 아니라
`py-1.5`(12) + 타일 32 + `gap-1`(4) + 라벨 줄상자 14 의 **합**이다. 이 표에
없지만 결함도 아니다 — 규칙이 범위를 안 말해서 생긴 공백이었다.

| 부류 | 사다리가 무엇을 잡나 | 예 |
|---|---|---|
| **가로 한 줄 컨트롤** — 내용이 한 줄이고 높이를 축이 정한다 | **바깥 높이 자체.** 전 조합이 명시 `min-h-*` 를 선언하고 그 값은 표 안이어야 한다 | `chip` · `pill` · `segment` · `row` · `card` |
| **정사각 아이콘 컨트롤** | **변(邊) 자체.** `h-*` 또는 크기 토큰이 표 안이어야 한다 | `icon` · `ChromeTile` · `DocsHeaderTile` |
| **세로로 쌓는 컨트롤** — 아이콘 위 · 라벨 아래처럼 두 줄 이상이 쌓인다 | **바깥 높이가 아니라 안쪽 정사각 타일.** 바깥은 내용의 합이라 사다리가 정하지 않는다 | `tile` · 나브레일 항목(`--app-nav-rail-tile-height` = 32 = `--control-h-md`) |
| **인라인 텍스트 링크** | 면제. `min-h` 를 실으면 글줄 상자를 밀어 올린다(실측 21.3 → 44) | `link`(인라인). 비인라인 `link` 는 44 |

**한 줄로**: 사다리는 «한 줄짜리 상자의 높이»와 «정사각의 변»을 잡는다. 세로로
쌓는 것은 **그 안의 타일**로 잡고, 바깥 합계는 잡지 않는다 — 잡으려 들면 라벨
글자 수가 규격을 정하게 되어 사다리가 자기 규율 1(*"패딩이 높이를 정하면 안
된다"*)을 스스로 어긴다.

**규율 셋:**

1. **높이는 사다리가 정하고, 패딩은 그 안에서 결정된다.** 반대로 하면(패딩이
   높이를 정하면) 어휘에 없는 값이 조용히 태어난다 — 그게 30/34/22/20 이 생긴
   경로다.
2. **하드 `h-*` 가 아니라 `min-h-*`.** 하드 높이는 줄바꿈한 컨트롤을 잘라 내용을
   숨긴다. `min-h` 는 단행을 사다리에 세우고 넘치는 것은 자라게 둔다.
3. **여기 없는 높이가 필요하면 축을 더하지 말고 이 표를 고쳐라** — 그것이
   「시스템을 늘리는 규칙」 0번(이미 있는지 먼저 찾기)과 1번(축보다 부품)이
   이 자리에서 요구하는 것이다. 2026-08-03 의 `fixedHeight` 축이 정확히 그
   반대를 했다.

**2차 정정 (2026-08-03, 체계석 · #884 의 남은 절반)**: 위 복원이 칩·필에서 멈춰
있었다 — 2차 전수가 segment/sm **22px**(바닥 미달, 소비처 0) · row/lg **42px**
(어휘 밖, 소비처 0) · card/sm **30px**(어휘 밖, 15곳) · card/md **34px**(문서함
헤더 크롬 잠금 단의 우연 점유, 5곳)를 찾았다. 그래서 규율 1을 값으로 인코딩했다:
**가로 한 줄 모양(chip·pill·segment·row·card)은 전 조합이 명시 `min-h-*` 플로어를
선언한다.** 플로어가 자연높이와 같은 조합은 픽셀 이동 0이고, 위 네 조합만
24/44/32/36 으로 올라섰다(칩·필 `md`=`lg`=32 는 그대로 — `lg` 가 키우는 것은
글자·인셋이지 높이가 아니라는 소유자 확정 유효). `tile` 은 세로 2축 표면이라
내용이 높이를 정하고, `link` 는 비인라인 44 / 인라인 면제 — 둘은 이 표의 대상이
아니다.

**게이트**: `tests/contract/control-class.contract.test.ts` 가 ① `chip`/`pill` 의
`md`·`lg` 가 `min-h-8` 을 내고 `sm` 은 안 낸다 ② `min-h-8` 의 픽셀값이
`app/globals.css` 의 `--control-h-md` 파싱값과 **같다**(사다리 토큰이 움직이면
램프가 즉시 빨개진다) ③ `fixedHeight` 축이 되살아나지 않는다 ④ **가로 한 줄
모양 전 조합(5×3)+정사각(3)이 명시 높이를 선언하고 그 값이 높이 어휘 —
`--control-h-*`·`--chrome-tile-size`·`--touch-target-min` 파싱값 + WCAG 바닥
24 — 안이다**
⑤ `min-h-[...]` arbitrary 로 어휘를 우회할 수 없다 — 다섯을 단언한다.

**범위 게이트**: 위 표가 말로만 남지 않게, `tests/contract/control-height-ladder-scope.contract.test.ts`
가 값 층 **밖**의 두 부류를 잡는다 — ① `app/globals.css` 의 모든 타일 치수
토큰(`--*-tile-size` / `--*-tile-height`)의 기본값이 높이 어휘 안이다
(`max()`/`calc(× 스케일)` 형태는 기본 px 를 꺼내 판정) ② 세로로 쌓는 컨트롤의
안쪽 타일이 사다리에 선다(`--app-nav-rail-tile-height` = `--control-h-md`).
①이 없어서 34 가 태어난 날 아무 게이트도 안 울렸다.

### 시스템을 늘리는 규칙 (2026-08-03 소유자 지시)

`/design-build` 는 시스템을 **쓰는 법**이다. 이 절은 시스템을 **늘리는 법**이다 —
없어서 실제로 값을 치렀다.

> **확인 시도했으나 접근 불가 (2026-08-03)**: Material 3(`m3.material.io`)와
> Spectrum(`spectrum.adobe.com`)은 본문이 JS 렌더 전용이라 원문 텍스트가 안 내려온다
> (M3 는 전달 텍스트 전체가 *"This website requires JavaScript."* 69자). **그 둘을
> 근거로 대는 문장을 넣지 마라** — 다음 사람이 같은 확인을 반복하거나, 더 나쁘게
> 검색 요약으로 때우지 않게 여기 남긴다. Fluent 2 토큰 문서에는 「새 토큰을 언제
> 만드는가」 절이 **없다**는 것도 확인했다.

#### 규칙 0 — 새 값을 만들기 전에 **이미 있는지 먼저 찾는다**

**이 규칙이 첫 번째인 이유는 2026-08-03 에 그걸 안 해서다.**

이 앱에는 컨트롤 높이의 단일 진실원이 **이미 있었다** —
`--control-h-{sm,md,lg}` = **28 / 32 / 40px** (`app/globals.css`, 2026-07-25
「디자인 전면 정비 #13」이 세웠고 소비처 7파일). 그런데 컨트롤 값 층을 지으면서
그것을 찾지 않고 패딩+행간의 부산물로 **24 / 30 / 34** 를 새로 발명했다.
**30 과 34 는 이 앱의 높이 어휘(24·28·32·36·40·44) 어디에도 없는 값**이다.

그 다음이 더 나빴다. 새 값이 계약(32px)과 부딪히자 **값을 고치는 대신 예외 축
(`fixedHeight`)을 더했다.** 체계석 판정: *"그 축은 값이 틀렸다는 **증상**이지
필요한 축이 아니다 — 값을 고치면 축이 죽는다."*

결과가 화면에 나왔다: 칩 크기 50종을 3종으로 줄였는데 **한 화면에 컨트롤 높이가
8~9종**. 규칙 1~6 을 다 지켰어도 이 하나를 안 지켜서 났다.

**절차** — 새 치수·색·간격이 필요하다고 느끼면 그 자리에서 멈추고:

1. `app/globals.css` 에서 그 역할의 토큰을 찾는다(`--control-h-*` ·
   `--chrome-*` · `--text-*` · `--leading-*` · `--radius-*` · `--motion-*`).
2. 이 문서의 **「컨트롤 높이 사다리」** 와 램프 절을 읽는다.
3. `git log --oneline -- app/globals.css | head -20` 으로 그 값이 왜 그렇게
   정해졌는지 본다 — 대개 이유가 있고, 그 이유가 아직 유효하다.
4. 그래도 없으면 **그때 비로소** 규칙 4(몇 개가 막혔는지 센다)로 간다.

> **찾지 않고 만든 값은 시스템이 아니라 두 번째 시스템이다.**

**업계 발행본** — [Carbon 기여 심사](https://carbondesignsystem.com/contributing/product-development-lifecycle/)가
이 질문을 문자 그대로 심사 항목으로 갖는다:

> *"Does it replicate anything in the system already, or is there truly a gap?"*
> *"If the proposal does replicate an existing asset, is there evidence to show that
> the proposed solution is better?"*

[W3C Design Tokens 초안](https://www.designtokens.org/tr/drafts/format/)은 목적 자체를
단일 진실원으로 적는다 — *"Maintaining a 'single source of truth' for design tokens"* ·
*"Eliminating repetition of values in token files"*.

둘째 인용이 우리 사고의 정확한 반사실이다: **이미 있는 것을 다시 만들려면 새것이 더
낫다는 증거를 대야 한다.** 우리는 `--control-h-*` 를 두고 24/30/34 를 발명하면서 그
증거를 대지 않았다.

#### 규칙 1 — 축을 더하기 전에 슬롯을 먼저 본다

**이 조항의 근거는 산수이고, 슬롯이라는 도구는 업계에 있다.** 둘을 섞어 말하지
않기 위해 출처를 갈라 적는다.

**우리 근거(산수)**: 축이 3개면 조합이 8가지, 4개면 16가지다. **축은 곱해지고
부품은 더해진다.** 우리는 `active` → `inline` → `fixedHeight` 로 축을 하나씩
더했고 결과가 화면에 나왔다 — 칩 크기 50종을 3종으로 줄였는데 **한 화면에 컨트롤
높이가 8~9종**이다.

**업계 도구**: [tailwind-variants 의 slots](https://www.tailwind-variants.org/docs/slots)
는 *"Slots allows you to separate a component into multiple parts."* 라고 정의한다.
⚠️ **그 문서는 슬롯을 「변형 폭발의 해법」이라고 말하지 않는다** — 부품 분리
기능으로 소개할 뿐이다. 그것을 축 폭발의 대안으로 쓰자는 것은 **우리 판단**이고,
근거는 위 산수다. (원문 확인 2026-08-03. 처음엔 검색 요약만 보고 "문서가 명시한다"
고 적었는데 원문에 그 문장이 없었다 — 인용은 원문을 열고 한다.)

⚠️ **업계 발행본 근거는 없다.** Carbon · Fluent · Polaris · W3C 어디에도 「변형 축의
조합 폭발 vs 부품 분해」를 말하는 문장이 없다(2026-08-03 원문 확인). 이 조항은 **우리
산수와 실측만으로** 선다. tailwind-variants 는 도구 사용법 인용이지 업계 원칙 근거가
아니며, 그 구분을 지우는 순간 이 조항은 지어낸 권위를 갖게 된다.

판별: 새 변형이 필요할 때 「이 컨트롤의 **어느 부분**이 달라지는가」를 먼저 물어라.
껍데기만이면 축, 글자·아이콘·배지 중 하나면 **부품**이다.

#### 규칙 2 — 같은 겉모습의 두 태그를 만들지 않는다

**우리 근거**: 버튼과 링크가 겉모습이 같으면 하나는 반드시 낡는다. 실측 — 이
저장소에 바이트 동일한 `<button>`/`<Link>` 쌍둥이가 있었고 게이트가 없었다.

**업계 발행본 — 왜 쌍둥이가 생기나**: 시맨틱이 목적을 따라 갈라지기 때문이다.
[Carbon Button usage](https://carbondesignsystem.com/components/button/usage/):
*"Do not use buttons as navigational elements. Instead, use links when the desired
action is to take the user to a new page."*
[Polaris Button](https://polaris-react.shopify.com/components/actions/button):
*"Buttons are used primarily for actions… Links are used primarily for navigation."*

**그리고 업계의 답도 「컴포넌트는 하나, 밑의 원소만 교체」다** — 같은 Polaris 문서:
*"If navigation is required for the button component, use the `url` prop."* 우리
`asChild` 탈출구와 같은 구조를 Polaris 는 **1급 API** 로 낸다.

**업계 도구**: [Radix 의 `asChild`](https://www.radix-ui.com/primitives/docs/guides/composition)
는 *"When `asChild` is set to `true`, Radix will not render a default DOM element,
instead cloning the part's child and passing it the props and behavior required to
make it functional."*

⚠️ **그런데 Radix 자신이 이걸 흔한 길로 권하지 않는다.** 같은 문서:
*"In the majority of cases you shouldn't need to modify the element type as Radix
has been designed to provide the most appropriate defaults."* 그리고 조건이 셋이다 —
자식이 **props 를 전부 퍼뜨려야** 하고(`If your component doesn't support those
props, it will break.`), **ref 를 받아야** 하며(`If your component doesn't accept a
ref, then it will break.`), *"it is your responsibility to ensure it remains
accessible and functional."*

**그래서 우리 규칙은 이렇다**: 쌍둥이가 생길 자리에서만 쓰는 **탈출구**이지 기본
패턴이 아니다. 쓸 때는 위 세 조건을 계약 테스트로 못박는다. 그 부담을 못 지겠으면
쌍둥이를 만들지 말고 **한쪽을 없애라** — 그게 이 조항의 제목이다.

```tsx
<RowButton asChild><Link href="…">문서 열기</Link></RowButton>
```

#### 규칙 3 — 규격을 바꾸려면 「체계」를 부른다

트리거 목록과 근거는 `.claude/rules/design.md` 의 같은 이름 절에 있다. 요지 한 줄:
**혼자 정한 규격은 규격이 아니라 취향이다.**

#### 규칙 4 — 새 값을 더할 때는 「몇 개가 막혀 있나」를 먼저 센다

이 시스템의 축·모양은 전부 **전수에서 나왔다**(칩 128 · 링크형 85 · 행 39 · 아이콘
36 · pill 32 · 카드 18 · 표준 버튼 1). 감으로 더한 것은 하나도 없다.

새 모양·톤·축을 제안할 때는 **그것 때문에 시스템 밖에 남은 컨트롤 수**를 세서
근거로 대라. 못 세면 그건 아직 규격이 아니라 취향이다.

**업계 발행본** — [Carbon 기여 심사](https://carbondesignsystem.com/contributing/product-development-lifecycle/)가
수요 증거를 채택 조건으로 요구한다: *"Proposals need to show that the component or
pattern would be useful to many teams and unique to the system."* 우리 「막힌 컨트롤
수 세기」는 그 요구를 **1인 저장소 스케일로 번역한 계측**이다 — 절차를 복제한 게
아니라 같은 원칙을 우리 단위로 잰다. 세는 법은
`tests/contract/control-adoption-ratchet.contract.test.ts` 의 탐지기.

#### 규칙 5 — 규격을 문서에 쓰면 같은 PR 에 게이트를 넣는다

**업계 발행본은 절반만 받쳐 준다.** 「시스템이 강제 도구를 스스로 낸다」까지는
공통이다 — [Polaris 는 stylelint 설정을 공식 도구로 발행](https://polaris-react.shopify.com/tools/stylelint-polaris)한다:
*"A configuration of Stylelint rules that promote adoption of the Polaris design
system in consuming apps."*

⚠️ 그러나 **「같은 PR 에」 결합과 「켜기 전 전수 측정」은 어느 발행본에도 없다.** 그
둘은 우리 실측이 유일한 근거다 — lint 가 144 → 548 로 뛴 소음 사고, 그리고 게이트
자신의 결함이 세 번 드러난 일(램프 목록 하드코딩 · 접힌 `<details>` 미제외 · 공유
상수에 벌점).

이 저장소의 기존 규율 그대로다. 단 **켜기 전에 위반을 전수 측정한다**(`/gate-probe`).
그리고 게이트를 넣었으면 **결함을 넣어 빨개지는지 증명**한다 — 이 시스템의 게이트는
전부 그렇게 프로브됐고, 그 과정에서 게이트 자신의 결함이 세 번 드러났다(램프 목록
하드코딩 · 접힌 `<details>` 미제외 · 공유 상수에 벌점).

#### 규칙 6 — 라이브러리를 바꾸는 것은 최후다

⚠️ **업계 발행본 근거 없음.** 여섯 발행사 누구도 소비자의 스타일링 라이브러리 교체
시점을 말하지 않는다(그들이 말할 주제가 아니다). 이 조항은 `forbidden.md` 의 의존성
규율과 **사용처 244개**라는 우리 수치만으로 선다. 그래서 오히려 반박이 쉽다 — 외부
권위가 없으니 수치로만 다투면 된다.

`cva` → `tailwind-variants` 같은 교체는 슬롯·`extend`·반응형 변형을 준다. 그러나
`forbidden.md` 는 새 의존성에 **PR 본문의 이유**를 요구하고, 이 시스템은 이미 244개가
쓰고 있다. 교체를 제안하려면 **슬롯을 `cva` 로는 못 한다는 근거**를 대라 — 「더
편하다」는 이유가 아니다.

### 층이 둘이다 — 값과 행동

`controlClass()` 가 컴포넌트를 **대체하지 않는다.** 업계 표준은 명백히 컴포넌트고
(Carbon · Fluent · Material · Polaris · shadcn), 이 저장소도 컴포넌트를 낸다.
가른 것은 **무엇을 나누느냐**다:

| 층 | 형태 | 나르는 것 | 왜 |
|---|---|---|---|
| 값 | `controlClass()` | 모양 · 크기 · 색 · 비활성 | 문자열이면 충분하고, 계약 테스트가 램프 밖 값을 **못 내게** 막는다 |
| 행동 | `Chip`/`IconButton`/`RowButton` | `type="button"` 기본 · 접근 이름 강제 · 버튼 시맨틱 | **문자열이 원리적으로 나를 수 없다** |

구체적으로 문자열이 못 하는 것 셋: ① 폼 안에서 `<button>` 의 기본은 `submit` 이라
칩 하나가 폼을 보낼 수 있다 ② 아이콘 컨트롤에는 읽을 글자가 없어 접근 이름이
필요한데 그건 속성이다 ③ 목록 행은 넓어서 `div+onClick` 으로 만들고 싶어지는데
그러면 키보드로 못 간다. `IconButton` 의 `label` 은 **필수 prop** 이라 타입이
쓰는 순간 막는다 — lint 와 계약 테스트는 「빠뜨렸다」를 나중에 알려 주지만 타입은
그 자리에서 막는다.

높이는 램프에 넣지 않았다. 칩 143개 중 명시 높이를 가진 것이 38개(30%)뿐이라,
넣으면 나머지 70%가 전환되는 순간 키가 바뀐다. 정사각(`icon`)만 예외 —
거기서는 높이가 곧 모양이다.

### Select / Listbox (#4)

- **트리거** — 40px(`--control-h-lg`, `size="md"` 는 32px `--control-h-md`),
  `--color-overlay-1` 서피스, chevron, `role="combobox"` +
  `aria-haspopup="listbox"` + `aria-expanded` + `aria-activedescendant`.
- **팝오버 listbox** — `--color-elevated` 서피스, `role="listbox"`, 옵션마다
  `role="option"` + `aria-selected`; 활성/hover 옵션은 인디고 하이라이트
  (`--color-indigo-a16`), 선택 옵션은 인디고 체크.
- **키보드** — ↑↓ 순환 · Enter/Space 확정 · Esc 닫기(+트리거 포커스 복귀) ·
  Home/End · 타입어헤드(600ms 버퍼). 바깥 클릭 시 닫힘.
- **목록은 포털이다** (2026-08-02 설치 앱 실측 회귀). `createPortal(document.body)`
  + 트리거 rect 앵커 + 충돌 회피(아래 자리가 264px 을 못 채우고 위가 더 넓으면
  뒤로 뒤집고, `max-height` 는 실제 가용 공간으로 깎는다). `position: fixed`
  이므로 열려 있는 동안 scroll(capture)·resize 에 재앵커한다.
  **왜**: 구 `position: absolute` 는 조상의 `overflow: hidden` 에 그대로 잘렸다 —
  AI 연결의 모델 칸에서 러너가 준 7개 중 화면에 1개만 남았고(264px 중 39px,
  가시 14.8%), `aria-activedescendant` 는 7개를 정상적으로 훑었다. **키보드
  사용자가 듣는 세상과 눈으로 보는 세상이 갈린** 상태이고(Nielsen ① 시스템
  상태 가시성), role·aria 마커를 전부 통과한다. 자르던 조상
  (`.ai-row-disclosure`)의 `overflow: hidden` 은 높이 전이용이라 풀 수 없다.
- **모션** — 등장 `select-pop`(`--motion-fast`), 퇴장 `select-unpop`
  (`calc(var(--motion-fast) * 0.67)` — 나가는 것은 들어오는 것보다 빠르다,
  `settingsPanelOut`·`overlayFadeOut` 과 같은 문법). opacity + `scaleY` 만,
  `transform-origin` 은 열리는 방향. 셰브런의 `transition-transform` 도
  **같은 80ms** — 한 입력이 낳은 두 원소가 다른 시간을 쓰면 두 사건으로
  읽힌다(구 상태: 목록 1프레임 소멸 + 셰브런 120ms 이징).
  퇴장 창은 `usePanelPresence` 공용 게이트를 쓰고, 그 프레임은 `aria-hidden`
  + `inert` 로 접근성 트리에서 즉시 빠진다. `prefers-reduced-motion` 동등물은
  `panelCrossfadeIn`/`overlayFadeOut` (흔들리는 축만 제거, 시간은 유지).
- **API** — `{ value, onChange, options: [{value,label,description?}],
  placeholder, ariaLabel, size?, disabled? }`. 토큰만.
- **게이트** — `src/shared/ui/select.test.tsx`(포털·클리퍼 탈출·퇴장 프레임
  a11y) · `src/shared/ui/select-growth.test.ts`(상한 산수) ·
  `tests/contract/reduced-motion-equivalent.contract.test.ts`
  (`select-listbox`) · `tests/contract/exit-motion-restart.contract.test.ts` ·
  설치 앱 `--verify-ai-settings`(목록 잘림·히트테스트·상한 실측).

#### 목록의 자람과 상한 (`select-growth.ts`, 2026-08-02)

구 상한은 `max-h-[264px]` 리터럴 하나였고, 그 값은 **아무것도 답하지 않았다**:
항목이 몇 개일 때까지 다 보이나 · 언제부터 스크롤인가 · 화면 아래쪽에서 열면
어떻게 되나. 셋 다 틀려 있었다. 상한은 **둘이고 작은 쪽이 이긴다.**

| 상한 | 값 | 근거 |
|---|---|---|
| 행 상한 `LISTBOX_MAX_ROWS` | **8행** | ① 실측 러너가 모델 **7개** — 흔한 경우가 스크롤되면 「더 있다」가 거짓말이 된다 ② 설명 줄 섞인 8행 ≈ 320px 로 이 목록이 뜨는 설정 시트(672px)의 절반 아래. 그 위로 자라면 «고르는 컨트롤» 이 아니라 «덮는 표면» 이고, 그때 필요한 건 더 큰 드롭다운이 아니라 검색이다 |
| 자리 상한 | 앵커 기준 뷰포트 잔여 | 화면 아래쪽 트리거에서 행 상한을 그대로 쓰면 창 밖으로 나간다 |

세 규율:

1. **행 높이는 재는 것이지 가정하는 것이 아니다.** 「임베딩 전용」 설명이 붙는
   행은 두 줄이라 더 높다. 줄 수 × 고정 높이로 자르면 상한 근처에서 반 행이
   걸린다. `ResizeObserver` 로 늦게 오는 웹폰트까지 따라간다.
2. **아무것도 안 묶을 때의 상한은 «측정한 내용 높이» 가 아니다.** 그렇게 두면
   서브픽셀이나 늦게 온 폰트로 행이 1px 자라는 순간 상자가 자기 내용을
   스크롤한다 — 실측으로 잡혔다(7개가 전부 보이는데 `scrollHeight >
   clientHeight` 라 어포던스가 거짓으로 켜졌다). 안 묶이면 상한은 **남은 자리**다.
3. **어포던스는 상한에 닿고 실제로 가려졌을 때만.** `listboxTopIsHidden` /
   `listboxBottomIsHidden` — 컴포저의 `composerTopIsHidden` 과 같은 판정이고
   문법을 일부러 맞췄다(두 표면이 같은 병을 다르게 풀면 다음 사람이 어느 쪽을
   베낄지 모른다). 상한 미도달이면 `overflow: hidden` 이라 스크롤바 자체가 없다.

### 설정 시트의 행 측정폭 (`--settings-content-measure`, 2026-08-02)

| 토큰 | 값 | 무엇을 정하나 |
|---|---|---|
| `--settings-content-measure` | 658px | 설정 시트 **어느 얼굴에서든** 행이 사는 최대 폭 |

시트는 고정 880×672 인데 얼굴마다 행 폭이 달랐다: 루트(LNB 2단)는
`880 − 2 보더 − 180 LNB − 40 오른쪽 칸 p-5 = 658px`, AI 드릴인은
`880 − 2 − 32 p-4 = 846px`. **드릴인이 LNB 를 떼면서 그 180px 를 내용이
먹었다.** 늘어난 188px(+28.6%)이 나르는 정보는 0인데, `justify-between` 행은
폭이 커질수록 양끝을 더 벌리므로 「Anthropic ‥‥‥ [키 등록]」 사이가 통째로
빈 칸이 됐다(소유자 2회 지적).

**묶는 것은 시트가 아니라 행이다.** 시트 크기는 소유자 확정 고정값이고
(2026-07-29), 줄이면 루트의 LNB 2단과 「확장」 절이 같이 깨진다. 그리고 폭을
줄이는 것만으로는 재발이 안 막힌다 — 다음에 시트를 넓히면 같은 병이 돌아온다.

값은 취향이 아니라 **루트 얼굴의 유도값 그대로**이고, 유도가 어긋나면
`tests/contract/settings-sheet-content-measure.contract.test.ts` 가 잡는다
(시트 폭·LNB 폭·패딩 중 무엇이 바뀌어도 토큰이 따라와야 한다).

**산문은 이보다 좁다** — `--git-setup-measure`(520px)를 재사용한다. 읽는 것과
조작하는 것의 측정폭은 다르고, 같은 값의 토큰을 새로 만들지 않는다.

### EmptyState (#16)

- **슬롯** — `icon`(라인아트 글리프, muted 라운드 사각) · `skeleton`(true =
  기본 muted 막대 3줄, 또는 커스텀 ReactNode) · `title`(평문 한 줄) ·
  `description`(다음 행동 안내) · `action`(선택 버튼).
- **톤/정렬** — `tone` dashed(목록/카드 안, "채울 자리" 신호) | solid,
  `align` left(기본) | center(페이지 본문 통째 빈 상황).
- 빈 차트/목록은 "긴 공백" 대신 **채워질 형태(스켈레톤)** 를 먼저 보여준다 —
  현재 인사이트 "필요한 항목이 가장 많은 곳" / "허브" 빈 영역에 적용.

### 컨트롤 높이 토큰 (#13)

```
--control-h-sm: 28px;
--control-h-md: 32px;   /* Select size="md", 밀도 높은 폼 컨트롤 */
--control-h-lg: 40px;   /* Select 기본 트리거 */
--control-row-h: calc(var(--control-h-md) + 12px);  /* = 44px, 컨트롤을 담는 목록 행 */
```

- **`--control-row-h`(2026-07-26)** — 행 안에 버튼/컨트롤이 앉는 목록의 행
  높이. 컨트롤 높이와 같게 두면 안 된다: 소유자 실측 지적("키 등록 버튼이 너무
  빽빽하게 붙어있는것같")의 원인이 [AI 연결] 벤더 행의 높이 32px = 버튼 높이라
  버튼 위아래 여백이 0 이었던 것이다. 세 행이 1px 구분선만 사이에 두고 맞닿아
  버튼 셋이 한 덩어리로 읽혔다. 값이 아니라 **식**으로 적어 컨트롤이 커지면
  행도 따라 커지게 한다. 결과 44px 은 `--touch-target-min` 과 같은 값이고
  근거도 같다 — 손가락도 눈도 컨트롤 둘레의 여백으로 경계를 읽는다.
  한 행이 펼쳐지는 목록에서는 **펼친 카드의 헤더 밴드도 같은 토큰**을 써야
  나머지 행의 리듬과 이름 열이 유지된다(치수 규칙성).
- 크롬 필/타일은 **별도 잠금 토큰** `--chrome-tile-size`(36px)를 계속 쓴다 —
  이 컨트롤 스케일은 크롬 시스템 **밖**의 인터랙티브 컨트롤(캐노니컬 Select,
  폼 입력 등)용. 지도 우상단 툴바(자동 정렬·검색·최근 변경·
  작업공간·+ 개념)는 크롬 시스템에 속해 전부 `--chrome-tile-size`(36px)로
  수렴한다 — "+ 개념" primary 도 같은 높이·radius·타이포(text-label·아이콘
  14px)로 정합(#13).

### 다이얼로그 폭 스케일

```
--dialog-w-sm: 420px;
--dialog-w-md: 560px;   /* 토폴로지 "개념 추가" 컴포저 */
--dialog-w-lg: 720px;
```

- 중앙 정렬 모달/컴포저 폭 단일 진실원. 실제 적용은
  `w-[min(var(--dialog-w-md), calc(100vw - 2rem))]` 로 좁은 뷰포트를 감싼다.

### 소비 규범 (하드)

> **새 표면은 네이티브 `<select>` · 즉석 empty `<div>` 를 만들지 않는다 —
> 반드시 캐노니컬 `Select` / `EmptyState` 를 경유한다.** 컨트롤 높이는
> `--control-h-*`, 모달 폭은 `--dialog-w-*` 를 쓰고, 크롬 표면은 여전히
> `ChromeTile`/`ChromeChip`. 인라인 재구현은 드리프트를 만들고 다음 토큰
> 개정이 그 인스턴스를 놓친다.

## 개인화 — 캔버스 배경 세트 & 노드 아이콘 세트 (Phase 5, 2026-07-25)

큰 베팅(#20/#21): 사용자가 지도 배경 무늬와 노드 아이콘 그림체를 고른다.
헌장 안에서만 — 다크 단일, 정적, 저대비, 토큰. 진실원은 localStorage
(`src/shared/lib/appearance-preferences.ts`), 지도 캔버스(비-React)와 모든 DOM
글리프가 같은 스토어를 구독해 **함께 즉시 스왑**된다. 설정 시트 [화면] 그룹에
라이브 미리보기 피커.

### 캔버스 배경 시스템 (#20)

- **3종 출하**: `dot`(기본, 현 blueprint grid — 변경 없음) · `constellation`
  (고정 시드 별점, 1~2px·밝기 2단계·저밀도) · `contour`(저대비 등고선 곡선 —
  "atlas" 정체성). 후속(백로그): 청사진 격자 · 육각 메쉬.
- **토큰 패밀리 `--canvas-bg-*`** (`app/globals.css`) + **잉크 상한 토큰
  `--canvas-bg-ink-max: 0.08`**. **어떤 배경도 이 알파를 넘지 못한다**(실사용
  0.04~0.06). 배경은 언제나 데이터에 진다(Tufte) — 노드/엣지 잉크보다 훨씬
  옅게. 성좌 별점은 `--canvas-bg-constellation-dim/bright`, 등고선은
  `--canvas-bg-contour`.
- **정적**: 애니메이션·그라디언트 워시·오로라·글로우 금지(헌장). 성좌/등고선은
  오프스크린 타일 → `createPattern` → blueprint grid 와 같은 카메라 원점 시차로
  그린다(정적, 프레임당 상수 비용). `render/grid.ts#draw()` 가 `variant` 로 분기,
  `render/background-patterns.ts` 가 타일을 빌드. 성좌 시드는 고정(세션/기기 불변).
- 지속: `canvasBackground` (localStorage). 지도 표면에만 적용(공방은 solid
  `--color-canvas` 라 무관).

### 노드 아이콘 세트 (#21)

- **2종 출하**: `geometric`(기본, fill+금속 sheen) · `line`(stroke-only, 살짝
  얇은 획). 후속(백로그): 필드(채움) · 미니멀 점.
- **불변 규칙(하드)**: **kind→실루엣 매핑은 세트 간 절대 고정** — 매핑 표·
  근거·게이트는 위 "노드 규격" 절 §1 이 정본(여기 중복하지 않는다). 세트는
  **렌더 스타일만** 바꾼다(실루엣 자체 일관성은 `topology-v2-kind-glyph.test.tsx` /
  `node-shapes.test.ts`, 두 게이트웨이 간 parity 는
  `tests/contract/node-kind-shape-parity.contract.test.ts` 가 강제).
- **단일 게이트웨이**: 모든 kind-glyph 렌더는 두 게이트 중 하나를 경유한다 —
  DOM `@/shared/ui/topology-v2-kind-glyph`(`useGlyphSet()` 구독; INDEX·공방·
  팝오버·상세·프로젝트 등 앱 전역) + 캔버스 `topology-map-v2/render/node-shapes`
  (`glyphStyleDescriptor(fill|line)`). 둘 다 같은 `appearance-preferences`
  스토어를 읽어 **지도·INDEX·공방이 lockstep** 으로 바뀐다("한 표면만 안 바뀌면
  결함"). 캔버스는 세트별로 shape math 를 복제하지 않고 shared 디스크립터로
  fill/line 만 가른다.
- 지속: `glyphSet` (localStorage).

### 확장 — 접힌 묶음을 어떻게 펼치나 (2026-08-01 신설 · 2026-08-02 개정)

시안 `.qa-scratch/proto-expand.html` 의 좌측 계측 패널을 그대로 이식했다. 같은
`appearance-preferences` 스토어(`ontology-atlas:expand:v1`)를 쓰고, 지도 캔버스가
매 프레임 ref 미러로 읽어 **다음 프레임부터** 반영된다.

- **펼치기 표시** — `pill`(뜬 알약, 종전) · **`bar`(머리 위 막대, 기본)** ·
  `badge`(어깨 배지). 결정과 반증 조건은 `docs/DECISIONS.md` 2026-08-01 항목.
  드로우·히트테스트·라벨 예약이 판정 함수 하나(`clusterControlForm`)를 공유한다 —
  갈라지면 「보이는데 안 눌리는 버튼」이 난다.
- **확장 구조** — `disc`(나선 원반, 종전 배치) · **`fan`(부챗살, 기본)** · `ring` ·
  `column`. 임계(12) **초과** 부모에만 걸린다; 이하 부모는 종전 부채꼴 그대로.
  기본값 둘(막대 · 부챗살)이 화면을 바꾸고, 세 숫자는 종전 상수 그대로다.
- **한 노드의 컨트롤은 서로 다른 방위를 쓴다** (2026-08-02) — 막대=북(머리 위) ·
  배지=**북서**(왼쪽 어깨) · 궤도 「이 영역만 보기」 버튼=**동**(정오른쪽). 셋이
  같은 노드 둘레에 앵커되므로 방위가 겹치면 자리를 다툰다. 실측: 배지와 궤도
  버튼이 둘 다 우상단 45° 라 배지의 **80%(513px²)** 가 버튼에 덮였고
  `elementFromPoint` 가 버튼을 돌려줘 **배지가 한 번도 안 눌렸다**; 기본값인
  막대도 우하단 모서리 80px² 가 물렸다. 자리 계산의 단일 출처는
  `render/cluster-chips.ts`(`clusterBarRect` · `clusterBadgeRect` ·
  `orbitButtonRect`)이고, 반지름 7~42 × 줌 0.85~1.5 전수 겹침 0 을
  `expand-settings.contract.test.ts` 가 잠근다.
- **부챗살의 간격은 26 이 아니라 34 다** (2026-08-02) — 자식 반지름은
  `magnitudeScale` 로 최대 1.4배까지 자라(역량 11 → 15.4) 두 개가 나란히 서려면
  30.8 이 필요한데 나선 원반의 26 을 그대로 쓰고 있었다. `relaxCollisions` 는
  **기본 반지름**만 보고 밀어 이 초과분을 못 되돌린다(실측: 부모 셋 펼침에서
  마크 겹침 26쌍 → 0쌍, 이름 있는 마크 31% → 34%). 마지막 층은 쐐기 폭 전체에
  늘이지 않고 **가운데 정렬**한다 — 남은 둘이 부챗살 양 끝으로 날아가 부모에서
  가장 먼 두 점에 홀로 서던 자리(부스러기로 읽히고 형제 도메인에 가장 먼저 닿는
  자리)를 없앤다. 기둥(`column`)도 같은 이유로 34 를 쓴다.
- **막대에는 알약의 선행 글리프 존이 없다** (2026-08-02) — 알약은 그 14px 에
  `＋` 를 앉히지만 막대는 부호·숫자를 판 한가운데 정렬해 그린다. 존을 그대로
  물려받아 판이 자기가 설명하는 노드보다 넓었다(실측: 58.8 vs 도메인 노드 지름
  48). 컨트롤이 데이터보다 큰 것은 잉크 역전이다(Tufte) — 빼면 44.
- **이름 상자는 좌우 3px 을 더 예약한다**(`LABEL_SIDE_GAP`) — AABB 겹침 판정은
  «닿는 것» 을 겹침으로 안 세므로 두 이름이 0.7px 간격으로 나란히 서서 한
  단어처럼 읽혔다(실측 2026-08-02: 「카카오 알림톡」 + 「적립금 원장」). 시안의
  예약 상자 `측정폭 + 6` 과 같은 값이다.
- **세 숫자** — 한 번에 여는 개수(4~24, 기본 24) · 이름을 시도할 개수(3~40,
  기본 8) · 동시에 펼쳐 둘 부모(1~6, 기본 3). 셋 다 **이미 코드에 있던 상수**
  (`EGO_NEIGHBOR_LIMIT` · `DISC_LABEL_TOP_K` · `MAX_EXPANDED_PARENTS`)이고, 이제
  그 상수들이 이 설정의 기본값을 가져다 쓴다(값이 두 곳에 적히지 않게).
- **설정 절의 위계** — 여섯 항목을 같은 무게로 세우지 않는다. 결정은 둘
  (「펼치기 표시」·「확장 구조」)이고 세 숫자는 「숫자 맞추기」 뒤에 접혀 있다 —
  바로 아래 이웃인 「발자국」이 쓰는 문법(프리셋 먼저 · 「직접 맞추기」 뒤)과 같다.
- 게이트: `tests/contract/expand-settings.contract.test.ts`(기본값이 실제로
  칠해지는지 · 셋이 서로 다른 것을 그리는지 · 알약은 종전 지오메트리 그대로인지 ·
  컨트롤 방위 겹침 0 · 딥링크가 상한을 받는지) + `AppSettingsMenu.test.tsx`
  (LNB 4·2 · 아이콘 전원 · 시안 범위 그대로 · 세 숫자는 접혀서 시작).

## Changelog

- 2026-08-01: "노드 규격" 절 신설(형태·반지름·크기 스케일·각인 숫자를 심볼 이름으로 문서화, 브릿지 노드 자리 예약) + "에이전트가 소비하는 층" 절 신설(2026-07-31 기준 웹 조사 대비 이미 있는 것/새로 채운 것/필요 없다고 판단한 것). 게이트: `tests/contract/node-kind-shape-parity.contract.test.ts` 신설(캔버스·DOM 두 kind-glyph 게이트웨이의 parity, 이전엔 우연히 일치했을 뿐 계약이 아니었다). `--topology-v2-radius-magnitude-k` 주석 정정(로그→√, 구현과 어긋나 있던 드리프트). "Three ambers" 표에 4번째(발자국 트레일) 행 보강. "부채" 절의 행 번호 참조 1건을 심볼 이름으로 정정
- 2026-07-25: 디자인 전면 정비 Phase 5 (개인화) — 캔버스 배경 3종(도트/성좌/등고선, `--canvas-bg-*` + 잉크 상한 `--canvas-bg-ink-max`)과 노드 아이콘 세트 2종(기하/라인, kind→실루엣 불변·단일 게이트웨이). 설정 [화면] 라이브 미리보기 피커 + localStorage 지속. "개인화" 절 참고
- 2026-07-25: 디자인 전면 정비 Phase 1 — 캐노니컬 `Select`(다크 Listbox, #4) · `EmptyState` 스켈레톤/아이콘 슬롯 확장(#16) · 컨트롤 높이 토큰 `--control-h-sm/md/lg`(#13) · 다이얼로그 폭 스케일 `--dialog-w-sm/md/lg` 신설. 공방 create 도메인 + 토폴로지 "개념 추가" kind 셀렉트가 캐노니컬 Select 로, 인사이트 depends/허브 빈 영역이 EmptyState 로 이관. "컨트롤 인벤토리" 절 참고
- 2026-07-21: Geometry & Type Codex (R5) — `text-[Npx]`(29종·1,184건)를 7단 type 램프(`--text-caption`…`--text-hero` + `--tracking-*` 짝)로, arbitrary radius(18종)를 3단(`--radius-chip/card/panel`)으로 수렴. 박스별 규격 표 + 명시 예외 등재. ESLint `no-restricted-syntax` 가 신규 arbitrary 를 차단(마이그레이션 완료 디렉토리 error / R6 동시작업 dir warn). 시각은 ±1px 스냅 수준 유지(리디자인 아님); see "Geometry & Type Codex" 절
- 2026-07-18: 크롬 시스템(feat/chrome-system) — `--chrome-*` 토큰 + ChromeTile/ChromeChip 컴포넌트 신설, 24px 정렬 레일로 브랜드 필/INDEX 패널/분석 패널 좌측 인셋 수렴, INDEX 패널 v2.1(헤더 "INDEX · N" + 접기, 트리 행 grid + Lucide chevron + 인셋 capacity meter, 푸터로 에이전트 동기화 이관); see `docs/prototypes/index-panel-v2-full.html`
- 2026-07-18: Brand mark replaced — "헥사 별자리" (candidate A) across favicon, macOS app icon, and `BrandMark` shared component; see "Brand mark" section above
- 2026-07-18: v2 — B2+ "Circuit × Constellation" 언어를 페이지 롤아웃 규범으로 승격 (언어 6축 · 토큰 tier 카탈로그 · surface class 별 do/don't · v2 금지 추가 · 롤아웃 가드 · 토큰 drift 부채 감사); see [`TOPOLOGY-V2-DESIGN.md`](./TOPOLOGY-V2-DESIGN.md)
- 2026-06-08: Added topology node-focus & scale pattern (ego popover, overview-first, plain-language counts, LOD perf path); see [`TOPOLOGY-FOCUS-AND-SCALE.md`](./TOPOLOGY-FOCUS-AND-SCALE.md)
- 2026-04-13: Removed the consulting category
- 2026-04-12: Initial draft (Phase 0)
