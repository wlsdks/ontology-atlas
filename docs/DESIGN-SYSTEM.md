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
| **선택·전개 사다리 (Selection ladder)** | `--topology-v2-indigo`(노드 선택, **실선**) · `--topology-v2-edge-selected`(엣지 페어 포커스, pale 인디고) · `--topology-v2-expanded-cohort`(전개 코호트, **탈채도 인디고 파선**) | 세 상태가 **같은 인디고 축** 안에서 채도·값·기하(실선/파선)로만 갈린다 — 새 hue 추가 금지. 전개 코호트 = 클러스터 칩(`+N`)으로 드러난 직속 자식의 소속 링(부모는 채도 있는 인디고 파선 오라로 주인공 유지). 소유자 요청 "확장한거는 선택 파란색과 다르게 구분" 의 헌장 내 답 |
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
- `--shadow-elevation-1/2/3` — 떠 있는 표면 드롭 섀도 3단 사다리
  (coach-mark < popover < dialog). 값은 alpha 토큰(`--color-shadow-a35/a42/a46`)
  합성. 이전엔 ontology-edit 전반이 `0_24px_72px`·`0_24px_80px`·`0_22px_54px`·
  `0_18px_44px`·`0_18px_40px`·`0_10px_32px`·`0_6px_16px` 같은 손 튜닝 섀도를
  8종 흩뿌렸다 — 계층별 대표값으로 수렴(빌더 2라운드 감사 #9). JSX 에 새
  drop-shadow 를 손으로 적지 말고 이 3단을 상속한다. 전역 나머지 표면 마이그레이션은 후속 큐.

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

주의: 타입 램프 유틸은 `cn()`(`src/shared/lib/cn.ts`)의 extendTailwindMerge
등록과 **반드시 동기** — 미등록 스텝은 색상으로 오분류되어 크기가 조용히
드롭된다(2026-07-23 크롬 16px 렌더 사고의 근본 원인, cn.test.ts 가 가드).
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
- `--topology-panel-graph-width`: (은퇴 #19, 2026-07-25) 구 Graph 모드
  (살아있는 그래프) 레일 폭. 물리 토글이 제거되면서 소비처가 사라진
  orphan 토큰 — 후속 정리 대기.
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
transform/opacity 만 쓰고, glow·bounce-loop·ambient 반복은 금지, ≤240ms,
`prefers-reduced-motion` 은 `app/globals.css` base 레이어 전역 규칙이 즉시
등장으로 무력화한다.

- `--motion-fast: 120ms` — 칩·탭 콘텐츠 크로스페이드·피커 원점 스케일 등 즉답.
- `--motion-base: 180ms` — 패널/카드/무대 요소 등장(크롬 180ms 리듬과 정렬).
- `--motion-settle: 240ms` — 위성 재배치(FLIP)·커밋 수렴 등 한 박자 더 긴 확정.
- `--motion-ease: cubic-bezier(0.25,0.1,0.25,1)` — 위 셋의 공통 이징.

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
| `설정 → Developer` — a menu path to follow | `전체 상세 →` |
| `목차 클릭 → 해당 위치로` — cause and effect | label + trailing `ArrowRight` icon |
| Leading `↗` on a link that **leaves the app** (`target="_blank"`, an external deeplink) — it warns before the click | Trailing `↗` on in-app navigation |
| `ChevronRight`/`ChevronDown` as a disclosure state, or prev/next on a carousel | |

The test: **remove the arrow and read the label aloud. If nothing was lost, it
was decoration.**

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
  nailed to fixed bearings — UP = 상위개념 (is_a), DOWN = 담는 것 (contains),
  RIGHT = 기대는 곳 (depends), LEFT = 비슷한 것 (relates). Filled = solid indigo
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

**최근접 수렴 규칙**(치환 시): 각 리터럴 px 를 가장 가까운 단으로 스냅한다
(±1px 은 램프로 흡수). 단 사이 정확히 중간(예: 15px)은 상위 단으로, 램프 밖
값(≥1.5px 이탈)은 아래 "명시 예외"로만 남긴다.

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
| 크롬 타일 (ChromeTile) | `--chrome-tile-size` 44px | `--chrome-radius` 10px | `--chrome-inset` 정렬 | 아이콘 16px |
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

### Lint 봉쇄

`eslint.config.mjs` 의 `no-restricted-syntax` 가 신규 `text-[Npx]` ·
`rounded-[Npx]` arbitrary 클래스를 차단한다.

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

- **타일 (ChromeTile)** — 44px 정사각(`--chrome-tile-size`) 아이콘 버튼. 목적지
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
| 크롬 타일 높이 | `--chrome-tile-size` | 44px | ChromeTile · ChromeChip · 상태 칩(영역·복귀·경로) — **단일 규격** |
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

- `--chrome-tile-size: 44px` · `--chrome-radius: 10px` · `--chrome-radius-inner: 7px`
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
> `docs/DESIGN-OVERHAUL-2026-07-25.md`.

### 캐노니컬 컴포넌트 위치

| 컴포넌트 | 위치 | 용도 |
|---|---|---|
| `Select` (다크 Listbox) | `src/shared/ui/select.tsx` | 네이티브 `<select>` 대체 — macOS 회색 시스템 드롭다운을 다크 앱 문법으로 |
| `EmptyState` | `src/shared/ui/empty-state.tsx` | 빈 리스트/차트/페이지 — 스켈레톤 자리표시 + 아이콘 + 한 줄 안내 |
| `ChromeTile` / `ChromeChip` | `src/shared/ui/chrome-tile.tsx` · `chrome-chip.tsx` | 크롬 타일/칩 (별도 "크롬 문법" 절) |

### Select / Listbox (#4)

- **트리거** — 40px(`--control-h-lg`, `size="md"` 는 32px `--control-h-md`),
  `--color-overlay-1` 서피스, chevron, `role="combobox"` +
  `aria-haspopup="listbox"` + `aria-expanded` + `aria-activedescendant`.
- **팝오버 listbox** — `--color-elevated` 서피스, `role="listbox"`, 옵션마다
  `role="option"` + `aria-selected`; 활성/hover 옵션은 인디고 하이라이트
  (`--color-indigo-a16`), 선택 옵션은 인디고 체크.
- **키보드** — ↑↓ 순환 · Enter/Space 확정 · Esc 닫기(+트리거 포커스 복귀) ·
  Home/End · 타입어헤드(600ms 버퍼). 바깥 클릭 시 닫힘.
- **모션** — `select-pop` 150ms, opacity + `scaleY`(origin-top) 만.
  `prefers-reduced-motion` 에서 `animate-none` 으로 정지 (헌장의 "모션은
  opacity/색 위주, transform 최소" 준수).
- **API** — `{ value, onChange, options: [{value,label,description?}],
  placeholder, ariaLabel, size?, disabled? }`. 토큰만.

### EmptyState (#16)

- **슬롯** — `icon`(라인아트 글리프, muted 라운드 사각) · `skeleton`(true =
  기본 muted 막대 3줄, 또는 커스텀 ReactNode) · `title`(평문 한 줄) ·
  `description`(다음 행동 안내) · `action`(선택 버튼).
- **톤/정렬** — `tone` dashed(목록/카드 안, "채울 자리" 신호) | solid,
  `align` left(기본) | center(페이지 본문 통째 빈 상황).
- 빈 차트/목록은 "긴 공백" 대신 **채워질 형태(스켈레톤)** 를 먼저 보여준다 —
  현재 인사이트 "가장 많이 기대는 곳" / "허브" 빈 영역에 적용.

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
- **불변 규칙(하드)**: **kind→실루엣 매핑은 세트 간 절대 고정** — project=hex ·
  domain=chip(둥근 사각) · capability=circle · element=via-pad(사각+홀). 세트는
  **렌더 스타일만** 바꾼다(실루엣 계약은 `topology-v2-kind-glyph.test.tsx` /
  `node-shapes.test.ts` 가 강제).
- **단일 게이트웨이**: 모든 kind-glyph 렌더는 두 게이트 중 하나를 경유한다 —
  DOM `@/shared/ui/topology-v2-kind-glyph`(`useGlyphSet()` 구독; INDEX·공방·
  팝오버·상세·프로젝트 등 앱 전역) + 캔버스 `topology-map-v2/render/node-shapes`
  (`glyphStyleDescriptor(fill|line)`). 둘 다 같은 `appearance-preferences`
  스토어를 읽어 **지도·INDEX·공방이 lockstep** 으로 바뀐다("한 표면만 안 바뀌면
  결함"). 캔버스는 세트별로 shape math 를 복제하지 않고 shared 디스크립터로
  fill/line 만 가른다.
- 지속: `glyphSet` (localStorage).

## Changelog

- 2026-07-25: 디자인 전면 정비 Phase 5 (개인화) — 캔버스 배경 3종(도트/성좌/등고선, `--canvas-bg-*` + 잉크 상한 `--canvas-bg-ink-max`)과 노드 아이콘 세트 2종(기하/라인, kind→실루엣 불변·단일 게이트웨이). 설정 [화면] 라이브 미리보기 피커 + localStorage 지속. "개인화" 절 참고
- 2026-07-25: 디자인 전면 정비 Phase 1 — 캐노니컬 `Select`(다크 Listbox, #4) · `EmptyState` 스켈레톤/아이콘 슬롯 확장(#16) · 컨트롤 높이 토큰 `--control-h-sm/md/lg`(#13) · 다이얼로그 폭 스케일 `--dialog-w-sm/md/lg` 신설. 공방 create 도메인 + 토폴로지 "개념 추가" kind 셀렉트가 캐노니컬 Select 로, 인사이트 depends/허브 빈 영역이 EmptyState 로 이관. "컨트롤 인벤토리" 절 참고
- 2026-07-21: Geometry & Type Codex (R5) — `text-[Npx]`(29종·1,184건)를 7단 type 램프(`--text-caption`…`--text-hero` + `--tracking-*` 짝)로, arbitrary radius(18종)를 3단(`--radius-chip/card/panel`)으로 수렴. 박스별 규격 표 + 명시 예외 등재. ESLint `no-restricted-syntax` 가 신규 arbitrary 를 차단(마이그레이션 완료 디렉토리 error / R6 동시작업 dir warn). 시각은 ±1px 스냅 수준 유지(리디자인 아님); see "Geometry & Type Codex" 절
- 2026-07-18: 크롬 시스템(feat/chrome-system) — `--chrome-*` 토큰 + ChromeTile/ChromeChip 컴포넌트 신설, 24px 정렬 레일로 브랜드 필/INDEX 패널/분석 패널 좌측 인셋 수렴, INDEX 패널 v2.1(헤더 "INDEX · N" + 접기, 트리 행 grid + Lucide chevron + 인셋 capacity meter, 푸터로 에이전트 동기화 이관); see `docs/prototypes/index-panel-v2-full.html`
- 2026-07-18: Brand mark replaced — "헥사 별자리" (candidate A) across favicon, macOS app icon, and `BrandMark` shared component; see "Brand mark" section above
- 2026-07-18: v2 — B2+ "Circuit × Constellation" 언어를 페이지 롤아웃 규범으로 승격 (언어 6축 · 토큰 tier 카탈로그 · surface class 별 do/don't · v2 금지 추가 · 롤아웃 가드 · 토큰 drift 부채 감사); see [`TOPOLOGY-V2-DESIGN.md`](./TOPOLOGY-V2-DESIGN.md)
- 2026-06-08: Added topology node-focus & scale pattern (ego popover, overview-first, plain-language counts, LOD perf path); see [`TOPOLOGY-FOCUS-AND-SCALE.md`](./TOPOLOGY-FOCUS-AND-SCALE.md)
- 2026-04-13: Removed the consulting category
- 2026-04-12: Initial draft (Phase 0)
