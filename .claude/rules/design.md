---
paths:
  - "src/**/*.tsx"
  - "src/**/ui/**"
  - "src/shared/motion/**"
  - "src/widgets/topology-map-v2/**"
  - "app/**/*.css"
  - "app/**/*.tsx"
  - "eslint.config.mjs"
  - "docs/DESIGN-SYSTEM.md"
---

# Design system rules

> **조건부 로드** — UI 파일(`src/**/*.tsx` · `app/**/*.css` 등)을 읽을 때 실린다(위 `paths:`).
> 「절대 금지」층은 상주인 `forbidden.md` 에도 있어 이 파일이 안 실려도 살아 있다.
> 토큰 / 모션 / 금지 패턴의 단일 진실원: `@docs/DESIGN-SYSTEM.md`.

## 스케일 고정 계약 (2026-07-24 소유자 확정 — 이탈은 결함)

- 크롬 필/타일 **36px**(`--chrome-tile-size`) · 크롬 라벨 **`text-label`(11px)**
- 레일 아이콘 **20px 단일**(`--app-nav-rail-icon-size`, 로고만 26)
- **≥1920 zoom 금지**(1:1), 2400+만 1.1 — 비정수 zoom 은 폰트 래스터 왜곡
- 본문 폰트 **Pretendard Variable** 셀프호스팅 (Inter 폐기 — latin 서브셋 한글 혼합 사고)
- 타입 램프 스텝을 새로 만들면 `src/shared/lib/cn.ts` 의 `TYPE_RAMP_STEPS` 에
  **반드시 등록** — 미등록 스텝은 tailwind-merge 가 색상으로 오분류해 크기를
  조용히 드롭한다 (2026-07-23 크롬 16px 렌더 사고, `cn.test.ts` 가드).
- **행간도 크기의 짝이다** — `--leading-*` 9단(px 짝 7 + 자유 `display-tight`
  1.06 · `prose` 1.7). 앱이 쓴 UI 텍스트면 그 크기의 짝, 사용자가 쓴 글이면
  `prose`, 이름·수치면 `display-tight`(최대 2행). 값의 상한은 한글이 정하고
  로케일 분기는 만들지 않는다. 스텝 추가 시 `LEADING_RAMP_STEPS` 에도 등록 —
  이쪽 실패 모드는 드롭이 아니라 **충돌 병합 실패**(둘 다 살아남아 CSS 소스
  순서가 승자를 정한다)라 더 조용하다. 상세: `docs/DESIGN-SYSTEM.md`
  "Line-height ramp".
- **크기 스텝이 자기 행간을 싣는다** (companion 결합, 2026-07-27). 그래서
  **글자 크기만 조건부로 갈아끼우면 짝이 어긋난다** — arbitrary 크기
  (`text-[Npx]` 류)에는 짝이 없어 원래 단의 행간이 그 브레이크포인트에 그대로
  남는다(실측: `/git` 헤드라인이 23px 글자에 24px 행간, 1.04). 조건부 크기도
  램프 유틸리티로 쓰거나, 명시 `leading-*` 으로 두 크기 모두를 덮어라.
  램프 토큰을 arbitrary length 로 **우회 참조하지 마라** — 크기는 같아 보여도
  짝을 잃는다(램프 *밖* 크기 토큰의 arbitrary 참조는 정당하다).
  `--leading-hero` 는 오늘 쓰이는 곳이 없어도 `text-hero` 가 싣는 값이라
  **삭제 금지** — 죽은 토큰이 아니다.
- 루트 16px 상속으로 렌더되는 텍스트 = 램프 미적용 결함. 상세 표:
  `docs/DESIGN-SYSTEM.md` "스케일 고정 계약" 절.
- ⚠️ **이 계약의 사정거리는 워크벤치 크롬이다** (2026-07-28 체계석 확정).
  36px 필/타일과 20px 레일 아이콘은 **지도 위에 떠서 화면을 최대한 양보해야
  하는 도구 막대**의 치수다. `isGatewayRoute()` 인 라우트(오늘 `/download`)의
  **얼굴 크롬**은 도구가 아니라 이 사이트의 첫인상이라 같은 값을 쓰면 랜딩이
  아니라 앱 크롬으로 읽힌다 — 소유자 판정 *"세로 길이가 너무 좁고"*. 현행
  소비처는 `GatewayNav`(`min-h-14` / `md:min-h-16`, Tailwind 기본 spacing
  램프의 정규 스텝)이고, **새 토큰은 만들지 않는다** — 소비처가 하나뿐인데
  변수를 만들면 "36px 하나" 이던 참조 대상이 둘로 늘어 어디가 규격인지
  흐려진다. 두 번째 관문 라우트가 생기면 그때 승격한다(트리거는 시간이
  아니라 **두 번째 소비처**).
- ⚠️ **설정 시트도 계약 밖이다** (2026-08-02, 소유자 지적 3건 — `docs/DECISIONS.md`).
  같은 판별식이다: 딤으로 뒤를 차단하는 **모달 목적지**는 도구 막대가 아니다.
  **선언 자체는 화면을 안 바꿨다** — 실측해 보니 이 시트는 계약의 값을 하나도
  안 쓰고 있었다. 계약이 틀린 게 아니라 **표면에 규격이 없었던 것**이고, 그
  공백이 만든 결함이 진짜 문제였다: 절별 폰트 센서스가 **한 시트 안의 두 방언**
  을 보여줬다(화면/작업공간/AI = 12.5+11, **확장/발자국 = 9.5+11**). 원인은
  `Slider`/`Choice` 가 「발자국」의 **접힌 세부**에서 태어나 그 치수를 그대로
  들고 「확장」의 **주 컨트롤**이 된 것 — 그래서 라디오 칩(9.5px/24px)이 자기
  라벨(11px)보다 작았다(위계 역전 + WCAG 2.5.8 여유 0).
  **규격**: 누르는 글자·행 라벨 `text-body`, 설명·수치 `text-label`,
  `text-caption` 은 루트 시트에서 금지. LNB 는 오른쪽 칸 행과 같은 인셋
  (`px-3 py-2`) + 한 단 위(`text-body-lg`). 새 토큰 0개.
  게이트: `tests/contract/settings-sheet-type-dialect.contract.test.ts`.
  **일반화**: 프리미티브를 «세부» 에서 «주 컨트롤» 자리로 승격할 때는 치수도
  같이 승격됐는지 본다 — 안 하면 그 절만 조용히 한 단 작아진다. lint 는 못
  잡는다(양쪽 다 정당한 램프 스텝이라 리터럴이 없다).

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
- **amber 는 네 갈래이고 규율이 다르다** (2026-07-29 에 넷째가 등재됨) —
  ① 허브 앰버(`#d4b478`, 확장 금지) ② 레일 로고 마크(같은 값이지만 브랜드
  마크, 라우트당 1개, 데이터 아님) ③ kind tone 앰버(`capability` 데이터 마크 —
  종류 센서스의 무라벨 스택 스트립, 지도 점) ④ **발자국 트레일**
  (`--color-footprint-trail`, `#e8c47a`). 감사 때마다 ②③이 ①의 확장으로
  오인돼 재점검된다. 판별표: `docs/DESIGN-SYSTEM.md` "Three ambers, three rules".

  **④ 가 ① 의 확장이 아닌 이유는 값이 다르기 때문이다.** 소유자 지시
  (*"노란색으로 빛나게"*)를 따르되 허브 앰버와 **같은 비트를 쓰지 않는다** —
  이 지도에서 노랑은 이미 "여기가 중심"이라는 뜻이라, 같은 값이면 "중심"과
  "걸었다"가 한 색이 된다. 계열은 같고 명도·채도를 갈랐다. 그리고 ④ 는
  **렌즈 한정**이다(트레일 팝오버가 열려 있는 동안만) — 명문 예외 2건
  (에이전트 포커스 링 · 최근 변경 스포트라이트)과 같은 구조라 상시 앰버
  확장이 아니다. 색은 노랑/인디고 **2택 고정**이고 자유 컬러피커가 아니다.
  게이트: `tests/contract/footprint-bloom-exception.contract.test.ts` 가 두
  값이 같아지면 실패한다.
- **막대 채색은 무채색 + 인디고 하나** — 인디고는 主 하나에만(1계열이면 선두
  행 `DomainCompositionGrid`, 2계열이면 주 계열 `DomainCapacityBar` 의 역량).
  2계열의 경계는 색이 아니라 **1px 심(트랙색 틈)** 이 진다(인접 세그먼트가
  3:1 에 못 미치는 데 대한 색-무관 구분자). kind 팔레트는 **색이 정체를
  나르는 유일한 채널인 차트**(종류 센서스의 무라벨 스택 스트립, 지도 점,
  트리 칩)에만 남는다 — 순서·라벨·숫자가 정체를 이미 나르는 막대에서 kind
  색은 중복 잉크다. 구 "계열 수가 정한다" 규율은 2계열 막대가 있는 모든
  표면에 유채 2색 라이선스를 줬고, 그 실측 비용이 `/projects` 유채 면적
  32,987px² · 앰버 면 6곳이었다. 게다가 그 앰버/유칼립투스 쌍은 트랙 위
  합성 대비 **1.14:1** 로 휘도로는 구분되지 않고 hue 로만 갈렸는데, 그
  hue 축이 적록 색약(남성 약 8%)이 가장 못 가르는 축이다 — 색이 정체를
  나른다는 전제 자체가 틀렸다 (소유자 확정 2026-07-26,
  `.qa-scratch/domain-bar-color-2026-07-26.md`).
- ontology kind 색상은 예외적으로 허용하지만 data mark 로만 쓴다. graph fill 은 작은 점의 3:1 대비를 위해 선명할 수 있고, panel/card 에서는 neutral surface + compact marker/swatch + label/icon 으로 낮춘다. detail card 내부의 full-height colored rail 은 AI SaaS callout 처럼 읽히므로 금지한다.
- 카테고리 구분은 **색이 아닌 보더 스타일** (작업중: 인디고 underline, 예정: dashed).
- **선택 색 사다리**: 노드 선택 = 표준 인디고(#5e6ad2), 엣지 선택(페어
  포커스) = pale 인디고(`--topology-v2-edge-selected`, rgba(200,210,255)) —
  같은 인디고 1계열 안에서 값으로만 구분한다. 새 hue 로의 확장 금지.
- **"온톨로지" 는 브랜드 자리와 그 단어를 정의하는 문장에서만 쓴다.** 그
  외의 UI 문구는 지도 / 개념 / 문서함 같은 평문으로 쓴다 (2026-07-26 실측:
  주 진입 경로 어디에도 정의가 없는데 2차 표면 16곳이 이 단어를 설명 없이
  쓰고 있었다 — 낯선 단어의 반복은 학습이 아니라 신뢰 비용이다). 정의는
  투어 1단계와 "?" 시트 용어사전 두 곳이 진실원이고, 새 표면을 만들어
  가르치지 않는다.

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

## 노드 규격(형태 · 반지름 · 크기 · 각인 숫자) — 정본은 DESIGN-SYSTEM.md (2026-08-01)

> kind→도형(hex/사각/원/via-pad) 매핑, 반지름 사다리, `magnitudeScale`(자식 수
> 기반 크기), 각인 숫자 표시 조건은 **여기 복제하지 않는다** — 정본은
> `docs/DESIGN-SYSTEM.md` "노드 규격 (Node Spec)" 절. 복제하면 그 순간부터
> 드리프트가 시작된다(Carbon — "값이 두 곳에 적히면 이미 드리프트가 시작된
> 것").

- `render/node-shapes.ts`(캔버스) 와 `shared/ui/topology-v2-kind-glyph.tsx`
  (DOM)를 열기 전에: kind→실루엣 매핑은 **두 파일이 항상 같아야** 한다 — 한쪽만
  고치면 `tests/contract/node-kind-shape-parity.contract.test.ts` 가 막는다.
- **브릿지 노드는 아직 값이 없다.** 데이터 쪽이 1급 개념으로 들이는 중이고
  시각 표현은 도해석(`design-infoviz`) 판정 대기다 — 이 두 파일에 새 kind나
  새 시각 값을 **추측으로 넣지 않는다**. 자리는 `docs/DESIGN-SYSTEM.md` "노드
  규격" §5 가 예약해 뒀다.
- `app/globals.css` 의 `--topology-v2-radius-*` 값 자체(30/17/11/7)와 반지름
  비율 상수(`DOMAIN_HALF_EXTENT_RATIO` 등)는 위계를 지키는 디자인 결정이라
  lint/계약 테스트로 판정 못 한다 — 바꾸려면 지도 45라운드 연구급 재수렴이
  필요.

## [강등됨 2026-07-24] 구 온톨로지 스튜디오 게임 예외 — 폐기

`/ontology/studio` 는 한때 노드를 게임 아이템으로 다루며 glow·gradient·aura·
particle·rarity(gold)·shimmer 를 `--studio-*` 토큰 + `.studio-stage` 안에서
허용하는 **스코프 예외**였다. 이 예외는 **폐기됐다** — fable 판정 B + 소유자
확정(2026-07-24). "게임처럼 중독되게" 는 은유였지 사양이 아니었고, 절제가
정체성인 앱에서 게임 미학은 "완성된 게임" 이 아니라 "코스프레" 로 읽히며,
의사결정 자료(기획자·임원·개발자·에이전트가 보는)의 신뢰를 갉아먹었다.

- 이 표면(현 공방)은 이제 절제된 **나침 무대(Compass Stage)** 다 — 관계 종류별 고정
  방위 + 라인아트 소켓 + 인디고 프로그레스 + 200ms opacity/color 확정 모션.
  **앱 전역과 동일한 헌장** (무채색 + 단일 인디고 + `--color-*` 토큰)만 쓴다.
- **glow/rarity/particle/gem 은 공방에서도 금지.** `--studio-*` 게임 토큰
  블록은 `app/globals.css` 에서 제거됐다. amber 는 "빈(강하게 기대되는) 소켓"
  신호로만.
- design-guardian 은 이제 공방 표면에서도 glow/rarity/particle 을 **반려**한다.
- 배경 + KEEP/KILL/BUILD: `[[ontology-studio-game-direction]]`. 중독은 파티클이
  아니라 루프(다음 할 일 → 즉시 반영 → 진전 누적)에서 온다.

## 라벨 장식 — 화살표 (2026-07-26 소유자 확정)

- **라벨 끝의 화살표 금지.** `열기 →` · `상세 →` · 라벨 뒤에 붙는
  `ArrowRight`/`ArrowUpRight` 아이콘. 소유자: *"글 옆에 화살표 있는거
  싫어하거든? AI느낌이라?"* — 어디로 가는지는 라벨이 이미 말했고, 누를 수
  있다는 건 컨트롤 생김새가 이미 말한다. 남는 신호는 랜딩 페이지의 결이다.
- **화살표 자체는 금지가 아니다.** 문장 가운데의 화살표는 대개 데이터다 —
  `{source} → {target}`(경로), `오래된 → 최근`(순서), `설정 → Developer`
  (메뉴 경로), `목차 클릭 → 이동`(인과). 앱을 **벗어나는** 링크
  (`target="_blank"`·외부 딥링크)의 선행 `↗` 도 클릭 전 경고라 정보다.
  펼침 상태의 `ChevronRight`, 캐러셀 이전/다음도 유지.
- **판별법**: 화살표를 지우고 라벨을 소리 내어 읽어라. 잃은 게 없으면 장식이었다.
- 게이트: `tests/contract/label-decoration.contract.test.ts` 가 ① i18n 문자열
  끝의 화살표, ② 선언 없는 `↗`, ③ **라벨 끝에 붙은 화살표 요소**를 차단한다.
  ③ 은 2026-07-27 에 넓혔다 — 그 전엔 `→` 를 통째로 면제해서, 규칙을 등재한
  다음 날 공방의 주 저장 버튼(`확인하고 저장 <span>→</span>`)이 그 면제 아래로
  빠져나갔다. **룰이 있어도 사정거리가 짧으면 룰이 없는 것과 같다.** 판별은
  글리프가 아니라 위치로 한다: 뒤따르는 첫 비-공백이 부모의 닫는 태그면 끝자리
  (장식), 아니면 중위(데이터). 켜기 전 전수 측정 = 끝자리 3 · 중위 7.
  상세: `docs/DESIGN-SYSTEM.md`.

## 치수 규칙성 — 내용 길이가 달라질 때 (2026-07-26 소유자 확정)

소유자: *"박스 사이즈가 안맞지? 삐뚤빼뚤해보이는거말야.. 정갈한걸 좋아해서"*

- **컨테이너의 치수는 설계 결정이지 내용물의 부산물이 아니다.** 반복되는
  카드 세트에서 높이가 글자 수로 정해지면 격자의 리듬이 아무도 고르지 않은
  채 무너진다.
- 선택적 절(`· 역량 1개 더` 같은)이 **줄 수를 바꾸지 못하게** 한다 — 없어도
  그 줄은 자리를 지킨다.
- 목록 슬롯은 **고정 개수 + 나머지 캡션**. "들어가는 만큼" 은 금지.
- 그리드는 행 안에서만 stretch 한다 — 한 벌로 읽혀야 하는 세트는 **행 높이도**
  균일화한다.
- 긴 제목은 클램프한다. 대신 hover/focus 또는 상세 표면에서 전체 값을 준다.
- **대가**: 자리 예약은 작은 vault 에서 빈 공간을 만든다. 눈이 훑는 **반복
  세트**에서만 그 대가를 치른다 — 일회성 카드는 내용에 맞게 커져도 된다.

상세: `docs/DESIGN-SYSTEM.md` "Dimensional regularity".

## 절대 하지 말 것

> 아래 금지는 앱 전역에 유효하다 — **공방 포함, 예외 없음** (구 게임 예외는
> 위에서 강등됨).

- 토폴로지 노드 클릭 → 풀스크린/풀블리드 상세 모달 (ego 팝오버 + focus 로 대체, 상세는 opt-in)
- 보라 → 핑크 그라디언트
- glassmorphism / `backdrop-blur`
- glow pulse · neon
- glow-like `boxShadow: \`0 0 ...\`` ring
- 움직이는 그라디언트 배경 · 오로라
- scale 기반 hover (`hover:scale-*`)
- 둘 이상의 채색 시스템

## 규격을 바꾸려면 「체계」를 부른다 (2026-08-03 소유자 지시)

**아래를 고치는 변경은 `design-system` 자리를 소집한다.** 회의를 열지 말지를
고르는 게 아니라, **이 목록에 걸리면 부른다**:

- `src/shared/ui/control-class.ts` — 값 층(컨트롤이 어떻게 보일지를 정하는 값들이 모인 곳)의 축·선택지·기본값. 「축」은 고를 수 있는 항목 하나(모양·크기·톤 같은 것)이고, 「선택지」는 그 항목이 가질 수 있는 값들이다
- `src/shared/ui/controls.tsx` — 버튼·칩처럼 **눌러서 동작하는** 부품(프리미티브 = 다른 화면들이 가져다 쓰는 기본 부품)
- `src/shared/ui/surface.tsx` — 화면이 **나타나고 사라지는 방식**을 담은 기본 부품
- `app/globals.css` — 램프(ramp — 쓸 수 있는 값을 미리 정해 둔 사다리. 그 밖의 값은 lint 가 막는다): 글자 크기 · 행간 · 모서리 반경 · 그림자 · 컨트롤 높이 · 팔레트의 기준색
- `.claude/rules/design.md` — 이 파일의 「스케일 고정 계약」 절

> 위 목록은 **이 규칙의 정본이면서, 동시에 검사 스크립트가 읽어 가는 입력**이다.
> `pnpm decisions:check` 가 이 절에 백틱으로 적힌 경로를 그대로 **읽어서** 감시
> 대상을 만든다(`scripts/lib/design-spec-census.mjs`). 코드 쪽에 같은 목록의
> 사본이 없으므로, 여기 한 줄을 더하면 그날부터 검사가 그 파일도 본다. 목록과
> 검사가 어긋나지 않게 지키는 계약 테스트:
> `tests/contract/design-spec-ledger.contract.test.ts`.

**왜 이 규칙이 생겼나**: 컨트롤 244개를 하나의 규격으로 맞추는 동안 이 자리를 한
번도 부르지 않았고, 값 층 설계(톤 8단 · 모양 7종 · 고를 항목 3개 · 램프 값)를
**만드는 쪽이 혼자서** 정했다. 결과 — 칩 크기를 50종에서 3종으로 줄였는데도
**한 화면에 컨트롤 높이가 8~9종** 있다. 규칙이 안 맞는 자리가 나올 때마다 규칙을
고치는 대신 **고를 항목을 하나씩 더 붙였기** 때문이다.

> **혼자 정한 규격은 규격이 아니라 취향이다.**

⚠️ 「불렀는가」는 여전히 기계가 확인하지 못한다. 기계가 확인하는 것은 **규격이
실제로 바뀌었는데 결정 기록이 비었는가**다 — `pnpm decisions:check` 가 위 목록의
파일에서 이름과 값(축 · 선택지 · 기본값 · 램프 토큰 · 밖으로 내보내는 부품 ·
스케일 계약의 수치)이 늘거나 줄었는지 세고, 하나라도 달라졌는데
`docs/DECISIONS.md` 에 새 기록이 없으면 검사가 실패한다. **그 파일이 이번 변경에
들어 있는지로 판정하지 않는다** — 이 파일들은 이 저장소에서 가장 자주 고쳐서
(최근 300 커밋 중 79개) 그렇게 걸면 엉뚱하게 걸리는 것이 63건 나오고, 그건
강제가 아니라 소음이다. 왜 이렇게 좁혔는지는
`scripts/lib/design-spec-census.mjs` 맨 위 주석에 다 적혀 있다.

검사 둘: `tests/contract/design-council.contract.test.ts`(그 자리가 이름으로
실재하는가) + `tests/contract/design-spec-ledger.contract.test.ts`(위 목록의
파일들이 실재하는가, 그리고 검사가 아무것도 안 잡은 채 헛돌고 있지는 않은가).
「누구를 불렀는가」는 사람이 지킬 수밖에 없다 — 그래서 이 문단이 있다.

## 규격은 lint 로 강제된다 (md 만으로는 안 지켜진다)

**디자인 규격을 문서에 쓰면 같은 PR 에서 `eslint.config.mjs` 에 룰을 넣는다.**
룰 없는 규격은 지켜지지 않는다 — 2026-07-26 실측: `--shadow-elevation-1/2/3`
사다리가 `design.md` 에 정의돼 있었는데 룰이 없어 하드코딩 rgba 섀도가 코드에
5건 살아 있었다.

현재 코드로 강제되는 것 (`no-restricted-syntax`):

| 규격 | 셀렉터 | 레벨 |
|---|---|---|
| 타입 램프 | `text-[Npx]` 금지 | `src/**`+`app/**` 전역 error / 유산 부채 파일 12개만 예외 |
| radius 램프 | `rounded-[Npx]` 금지 — 방향 접미(`rounded-t-[Npx]`·`rounded-r-md`) 포함 (2026-08-04 확장) | 동일 |
| **그림자 사다리** | `shadow-[…]` 의 **기하 허용목록** — elevation-1/2/3 · dock-bottom/side · control-press · 표면 전용 토큰 · inset 만 통과 | 동일 |
| **hex 색상** | Tailwind **arbitrary value 안**의 hex 만 금지 | 동일 (현재 위반 0 — 예방 게이트) |
| **모션 duration** | `duration-<숫자>` 금지 (토큰 참조형은 문법상 안 걸림) | 동일 |
| **행간 램프** | `leading-[N]` arbitrary 금지 + 이름 유틸리티(`leading-relaxed` 등 208건)는 `named-offramp-utility-ratchet` 기준선이 붙든다 (2026-08-04) | 동일 |
| **램프 우회** | 램프 토큰을 arbitrary length 로 참조하는 것만 금지 (램프 밖 크기 토큰은 정당) | 동일 (켤 때 위반 0) |
| 금지 그라디언트 | `scaleGradientSelectors` | 동일 |
| **accent×틴트 페어링** | `accentTintPairingSelectors` — `tone accent` 와 인디고/앰버 틴트 `bg-` 가 같은 호출/원소에 공존 금지 (상수 우회는 `accent-ink-contrast` 계약이 맡는다) | 전역 error (켤 때 위반 0 — 26곳 선치환) |

> **표에 나온 말 넷** — 「램프(ramp)」는 쓸 수 있는 값을 미리 정해 둔 사다리이고,
> 그 밖의 값은 lint 가 막는다. 「셀렉터」는 ESLint 가 코드에서 무엇을 찾아낼지
> 적어 둔 검색 패턴이다. 「레벨」은 걸렸을 때 오류로 볼지 경고로 볼지다.
> 「래칫(ratchet)」은 한 번 좋아진 수치가 다시 나빠지지 못하게 오늘 값을 상한으로
> 박아 두는 검사다 — 줄이는 것은 되고 늘리는 것은 안 된다.

### lint 가 못 보는 층은 계약 테스트가 맡는다

`no-restricted-syntax` 는 **한 파일의 구문 트리(AST)에서 패턴을 찾아내는 것**이라,
맞는지 보려면 다른 파일에 있는 값 목록까지 봐야 하는 규격은 아예 표현할 수 없다.
그런 규격은 계약 테스트로 건다 — 문서에만 써 놓고 아무 검사도 안 거는 것만
금지다.

| 규격 | 게이트 | lint 가 못 하는 이유 |
|---|---|---|
| **`text-*`/`leading-*` 가 램프에 실제로 있는 칸을 가리킨다** | `tests/contract/type-ramp-step-defined.contract.test.ts` | 맞는지 보려면 `app/globals.css` 에 어떤 토큰이 있는지를 알아야 한다. 칸 이름을 lint 룰에 베껴 두면 그 사본이 램프와 어긋나면서 검사가 못 보는 구멍이 생긴다 |
| **셸 본문 칸이 그 안의 내용을 찌그러뜨리지 않는다** | `AppShell.test.tsx`(고치는 자리) + `tests/e2e/scroll-end-gap.spec.ts`(실제 여백 px) | 결함이 **레이아웃을 계산한 결과**로 생긴다. 클래스 이름은 멀쩡한데 실제 픽셀만 틀린다 |
| **화면 폭에 따라 크기를 바꿀 때 행간 짝이 어긋나지 않는다** | `tests/contract/type-ramp-leading-pair.contract.test.ts` | 맞는지 보려면 **한 원소에 붙은 클래스 전부**를 봐야 하는데, `cn()` 의 인자로 쪼개져 있으면 패턴 하나에 안 담긴다. 램프 값을 `text-[var(…)]` 로 돌려 쓰는 **일부 경우**만 lint 가 잡는다 |
| **컨트롤 값 층이 램프 밖으로 못 샌다** | `tests/contract/control-class.contract.test.ts` | 판정할 대상이 **cva 가 조합해서 만들어 내는 결과 문자열**이다. 코드에는 `chip`·`md` 같은 키만 적혀 있고 실제 값은 실행할 때 합쳐지므로 lint 가 볼 것이 없다. 그래서 여덟 모양 × 3 크기 × 9 톤 × … 을 전부 실제로 만들어 본다 |
| **두 무채색 글자색 램프가 실제로 서로 다르다** | 같은 파일(`scope` 축 절) | 판정하려면 `app/globals.css` 의 **두 램프 8개 값**을 봐야 한다. 두 램프 값이 같아져 버리면 `scope` 는 아무 차이도 안 내면서 고를 것만 늘리는 셈이라, 그날 검사가 그걸 지우라고 말해 줘야 한다 |
| **손으로 쓴 컨트롤이 늘지 않는다** | `tests/contract/control-adoption-ratchet.contract.test.ts` | 래칫이라 **저장소 전체의 개수**가 판정 기준인데, 그건 파일 하나만 봐서는 셀 수 없다 |
| **글 속의 링크는 컨트롤이 아니라 글이다** — `.prose-link` 는 밑줄 모양만 정하고 display·행간·크기·포커스는 그 링크를 감싼 글의 것을 따른다 | `tests/contract/prose-link.contract.test.ts` + `tests/e2e/touch-target-contract.spec.ts` 의 fine-pointer 감사(WCAG 2.5.8 인라인 면제 판정) | 판정하려면 「이 링크가 문장 흐름 속에 있는가」(실제로 그려진 결과)와 브라우저가 계산한 display 값을 봐야 한다 — 「문장 속인가」를 정하는 세 가지(옆에 오는 글자가 어디서 왔는지 · 부모가 정하는 실제 display · 줄바꿈)가 전부 여는 태그 바깥에 있어서, 코드만 보고 판정하던 `inline` 축은 잘못 설정된 4건을 못 본 채 무용지물이었다(2026-08-04) |
| **어느 바탕 위에 어느 글자색까지 쓸 수 있나** — quaternary 는 겹치지 않은 무채색 바탕(맨 아래 3단 + canvas/panel 위 overlay-1)까지, 그보다 올라선 바탕(overlay-2 이상 · elevated+overlay · 색이 섞인 바탕) 위의 글자는 tertiary 부터 | `tests/contract/quaternary-ink-surface.contract.test.ts`(값·자리) + `tests/e2e/a11y-open-surfaces.spec.ts`(화면) | 판정이 글자색이 아니라 **그 글자가 얹힌 바탕이 어떻게 겹쳐졌는지**에 달렸다 — 같은 클래스가 panel 위에서는 대비 5.00, overlay-2 위에서는 4.36 이다. 게다가 이 층에서 가장 흔한 코드 모양이 `active ? 틴트+밝은 글자색 : quaternary` 같은 분기라, 같은 태그에 붙은 클래스만 보고 짝을 맞추면 엉뚱하게 걸린다(2026-08-04 전수 18쌍 중 다수가 분기였다) — 그래서 코드만 보는 래칫 대신 값 자체를 고정하는 계약 + 실제로 화면을 열어서 재는 검사를 쓴다 |

**미정의 스텝은 침묵한다 (2026-07-27 실측).** `text-large` 는 램프에 없는데
tsc·eslint·전체 테스트를 전부 통과했다 — Tailwind 가 클래스를 아예 만들지 않아
그 자리가 루트 16px 로 렌더됐을 뿐이다. **존재하지 않는 것은 리터럴도 남기지
않으므로 하드코딩 검사의 시야 밖**이다. 같은 파일에서 같은 사고(`text-callout`)가
이미 한 번 있었고 사람 검수를 두 자리 통과했다.

**spacing 은 강제하지 않는다 (결론, 2026-07-26).** arbitrary px 는 27건뿐
(이탈률 1.1%)이고 그중 3·11·18px 을 빼면 전부 1~2회짜리 **광학 보정**이라
램프에 스냅시키면 오히려 정렬이 깨진다. 대신 지목했던 죽은 토큰 2개
(`--pad-card`/`--pad-panel`)는 **삭제했다** — 사용 0회인 데다 `--pad-panel`
은 패널의 실제 값(14px)과 달라서, 문서가 규격이 아니라 오정보를 주고 있었다.
카드는 `--card-pad`, 패널은 `--topology-v2-panel-pad` 가 단일 출처다.
**아무도 안 쓰는 토큰은 규격이 아니라 오정보다.**

### 그림자는 왜 `var(` 면제가 아니라 기하 허용목록인가

처음 이 룰을 켤 때 `shadow-\[` 를 통째로 금지했더니 정상 토큰 사용 90여 건까지
잡아 lint 가 144 → 548 로 뛰었다. 그래서 **`var(` 가 있으면 통과**로 좁혔고,
그 판단은 그때 옳았다(소음 0, 위반 5건 치환).

**그런데 그 면제가 반대 방향으로 샜다.** `var(` 는 *색*에만 있어도 만족되므로,
`0 28px 90px var(--color-shadow-a58)` 같은 값이 통과했다 — 색은 토큰인데 기하는
손으로 쓴 것이다. 2026-07-28 실측: 손 튜닝 드롭 섀도 **23종**, 그 안에

- **광원 역전 2건** — 하단 탭바 `0 -16px`(위에서 오는 빛), 우측 패널
  `-24px 0`(옆에서 오는 빛). 이 앱의 광원은 하나이고 y 는 항상 양수다.
- **계층 역전 1건** — 설정 시트 blur 90px 이 dialog 단(80px)보다 크다. 설정
  메뉴가 모달보다 높게 읽힌다.

셋 다 값 규칙을 무결점 통과했다. 그래서 판정을 **"토큰을 썼는가" 에서 "어느
토큰을 썼는가"** 로 바꿨다 — 허용은 사다리(elevation-*/dock-*) · 눌림
(control-press) · 표면 전용 토큰 · inset 헤어라인(광원이 아니라 재질)뿐이다.

교훈: **면제는 방향이 있다.** "정상 사용을 살린다" 는 면제가 "비정상 사용도
살린다" 가 되는지 켤 때 함께 물어야 한다.

### hex 는 왜 "모든 hex 금지" 가 아닌가

전수 측정(2026-07-26) 결과 `src/`·`app/` 의 hex 127건 중 **Tailwind arbitrary
value 안에 박힌 진짜 위반은 0건**이었다. 나머지는 전부 정당한 예외다:

| 범주 | 건수 |
|---|---|
| 테스트 픽스처 | 83 |
| PR 번호 주석(`#375`) — AST 룰은 주석을 안 본다 | 16 |
| **CSS 변수가 닿지 않는 표면** — `next/og` Satori · `viewport.themeColor` · standalone HTML | 16 |
| JS 측 토큰 진실원(`indigo-tokens.ts`) · 정적 SVG | 7 |
| 토큰 리더 fallback (`read("--color-canvas", "#08090a")`) | 3 |
| 마스크 알파 스텐실(`#000`) — 시각 색이 아님 | 2 |

"모든 hex 금지" 는 **27건의 소음만 만들고 잡을 신호가 0** 이다. arbitrary value
안으로 좁히면 오늘 0건 · 미래 유입만 차단한다.

### ⚠️ flat config 다중 블록 함정

`eslint.config.mjs` 는 `no-restricted-syntax` 를 여러 블록에서 재정의한다.
flat config 는 rule option 배열을 **병합하지 않고 교체**하므로, 새 셀렉터를 한
블록에만 넣으면 뒤 블록이 덮어써서 **조용히 무력화**된다. 셀렉터는 반드시 공유
배열(`arbitrarySizeSelectors`)에 넣어 모든 블록이 함께 스프레드하게 한다.

### 커버리지는 허용목록이 아니라 거부목록이다 (2026-08-04 뒤집음)

**종전**: 램프 셀렉터를 스프레드하는 블록이 「치환이 끝난 디렉터리」 허용목록
(`codexMigratedGlobs`)이었고, 이 절은 그것을 *"결함이 아니라 문서화된 설계"* 라
적어 뒀다. 부채를 한 번에 못 치우던 시절에는 맞는 말이었지만 **부작용이 목적을
뒤집었다**: 목록에 없는 경로에는 램프 룰이 **아예 없고**, 새로 만든 디렉터리는
언제나 목록에 없다.

실사용 시험 실측 — 새 `src/views/<name>/ui/*.tsx` 한 줄에
`text-[13px] rounded-[5px] leading-[1.9] duration-300` 네 위반을 심고
`pnpm exec eslint` 를 돌리니 **0 errors, 0 warnings**. `calculateConfigForFile`
로 재보니 그 경로가 받는 셀렉터는 **7개**(scale/gradient 5 + accent 2)뿐이고
램프 셀렉터는 **0개**였다. 소유자 목표가 *"명령만 하면 디자인 시스템 기반으로
화면이 나온다"* 인데 **새 화면이야말로 규격이 하나도 강제되지 않는 자리**였다.

**현행**: `rampCoveredGlobs = ['src/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}']` —
전부 덮고, 유산 부채를 진 **파일**만 `rampDebtExemptions` 로 뺀다.

- 켜기 전 전수(아래 절차대로): 전 경로에 강제로 걸어 재니 위반 **125건**,
  그리고 그 125건은 **파일 12개**에 몰려 있었다. 디렉터리 8곳이 사각지대였는데
  실제 부채는 12개 파일이라, 뒤집는 비용이 **예외 12줄**이었다. `pnpm lint`
  총계는 93 warning · 0 error 로 **불변**.
- 125건을 같은 PR 에서 안 치운 이유는 규모가 아니라 **성격**이다 — 대부분이
  램프에 없는 값(13 · 27 · 11.5px …)이라 치환이 곧 렌더 픽셀 변경이고 자리마다
  디자인 판정이 필요하다. 그건 lint PR 이 아니라 디자인 패스의 일이다.
- **예외는 반드시 파일 단위다.** 디렉터리로 빼면 그 안에 새로 만드는 파일까지
  같이 빠져 같은 구멍이 다시 열린다. 계약이 글롭을 거부한다.
- 게이트: `tests/contract/type-ramp-coverage.contract.test.ts` 가 ① 커버 글롭이
  거부목록 모양인지 ② **아직 없는 경로**가 램프 셀렉터를 전부 받는지
  (`calculateConfigForFile`) ③ 그 네 줄이 실제로 빨개지고 정상 램프 값은
  통과하는지 ④ 예외가 파일 단위이고 실재하는지 ⑤ 예외 부채가 내려가기만 하는지
  를 잰다. 판정을 정규식으로 복제하지 않고 **ESLint 자신을 돌린다** — 종전
  래칫의 손복제 정규식은 12 패밀리 중 7종만 갖고 있었다(2026-07-28 실측).

**교훈**: 허용목록 게이트의 실패 모드는 「목록에 없는 것」이고, 소프트웨어에서
목록에 없는 것은 **언제나 새로 만든 것**이다. 규격이 가장 필요한 자리가 정확히
규격이 없는 자리가 된다.

### 룰을 켜기 전 반드시 측정한다

**새 룰이 수백 건 warning 을 만들면 그건 강제가 아니라 소음이다.** 기존 신호
(현재 144 warning)까지 읽을 수 없게 만들어 게이트를 무력화한다.

실제 사례: `shadow-\[` 를 통째로 금지했더니 lint 가 144 → 548 로 뛰었다.
`shadow-[var(--chrome-shadow)]` 은 Tailwind 에서 CSS 변수를 참조하는 **정상
문법**인데 그것까지 잡은 것이다. `var(` 없는 것만 잡도록 좁히니 위반은 5건,
치환 후 144 그대로 · 소음 0. 켜기 전 절차:

1. 위반을 **패턴별로 분류**한다 (정상 토큰 사용 vs 진짜 하드코딩).
2. 진짜 위반 수가 **한 PR 로 치환 가능한 규모**인지 확인한다.
3. 치환 → 룰 추가 → `pnpm lint` 총계가 baseline 대비 늘지 않는지 확인한다.
4. 룰이 실제로 잡는지 **프로브 파일로 증명**한다 (위반 1줄 + 정상 1줄).

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
- **duration 은 3단 램프뿐이고, 값이 아니라 쓰임으로 고른다** (2026-07-27):
  `--motion-fast`(120ms) = **확인** — 이미 일어난 상태의 확인(호버·포커스·색·
  회전·칩 크로스페이드). Tailwind 기본 전이가 이 토큰을 타므로 **기본이면
  duration 클래스를 아예 쓰지 않는다**. `--motion-base`(180ms) = **이동** —
  표면이 자리를 바꾸는 일(팝오버·패널·카드·백드롭의 등장/퇴장).
  `--motion-settle`(240ms) = **확정** — 일이 끝났다는 서명(FLIP 재배치·커밋
  수렴). `--topology-motion-camera/drag-settle`(420/720ms)은 **지도 캔버스
  전용**이라 DOM 표면이 참조하면 결함. 숫자를 직접 적으면 lint 가 막는다.
- 램프 duration 을 받는 원소는 **이징도 같은 패밀리**로 간다 — duration 만
  갈아타면 "셋의 공통 이징"이라는 패밀리 정의가 반쪽만 지켜진다.
- `prefers-reduced-motion` 사용자 존중 — `app/globals.css` 의 base layer 에 이미 처리.
- **모션 예산은 주인공에게.** 한 입력이 여러 표면을 바꿀 때, 전환은 사용자가
  부른 목적물(Design Guardian verdict 의 attention winner)이 먼저 갖는다.
  winner 는 하드컷(첫 프레임 델타 지분 >70%)인데 배경(dim·ego·재배치)만
  이징이면 결함이다 — 실측 전례: INDEX 행에서 연 개념 팝오버가 1프레임
  88.8% 하드컷인데 배경 지도는 100ms 이징을 받고 있었다 (2026-07-27 모션 검수).
- **한 입력 = 한 사건.** 같은 입력이 낳은 단계들은 같은 프레임에 시작한다.
  시작 시점 차가 `--motion-fast`(120ms)를 넘으면 두 사건으로 읽혀 결함.
  의도된 스태거는 인과(원인이 먼저 움직임)를 보일 때만 허용.
- 위 두 원칙은 **lint 가 원리적으로 못 잡는 층**이다 — 전환이 아예 없는
  원소는 리터럴도 없어서 모든 값 규칙을 무결점으로 통과한다. 그래서 게이트가
  Guardian verdict 의 Motion 항목 + 프레임 실측이다.

### 값은 맞는데 안 걸리는 것들 (2026-07-28 전수 실측)

넷 다 duration·easing 이 전부 토큰이라 값 lint 를 무결점 통과하면서 화면에서는
1프레임이었다. 그래서 각각 계약 테스트/룰을 갖는다.

- **퇴장은 자기 이름으로 앞으로 재생한다.** 등장 키프레임을 `reverse` 로 되감는
  퇴장은 **같은 원소에서 클래스만 바뀌는 자리에서 재생되지 않는다** — CSS
  애니메이션은 `animation-name` 이 그대로면 duration/direction 이 바뀌어도
  재시작하지 않고, 이미 끝난 것은 `reverse` + `both` 를 만나는 순간 역재생의
  종료 상태를 즉시 보여준다. 실측: 노드 팝오버가 1프레임에 사라진 뒤 **보이지도
  않는 채로** transform 만 천천히 줄고 있었다.
  게이트: `tests/contract/exit-motion-restart.contract.test.ts`.
- **reduced-motion 동등물은 전역 kill 규칙과 같은 레이어 안에 쓴다.**
  `!important` 끼리는 캐스케이드 레이어 순서가 **뒤집혀** 레이어에 든 쪽이
  이긴다. 레이어 밖에 쓰면 특이도가 아무리 높아도 진다(실측: (0,3,0) 규칙이
  (0,0,0) 전역 규칙에 져서 계산값 0.01ms). 게이트:
  `tests/contract/reduced-motion-equivalent.contract.test.ts` — **목록이 곧
  사정거리다.** 새 표면을 만들면 목록도 같이 넓힌다.
- **표면 교체는 두 프레임이다.** 도착 표면만 등장 문법을 입으면 사용자가 누른
  목적물이 0프레임을 받고 배경이 200ms 를 받는다(판정식① 위반이 구조적으로
  발생). `src/shared/lib/use-presence.ts` 의 `usePanelPresence` /
  `useSurfaceSwap` / `useSwapHeight` 를 쓰고, 나가는 프레임은 `inert` +
  `pointer-events-none`. 퇴장 창은 `EXIT_WINDOW_MS` 하나로 공유한다.
- **빈도가 예산을 깎는다.** 호버/포커스 표면은 `0~--motion-fast`. 이동/확정
  램프는 하루 몇 번의 사건의 것이다. 룰: `eslint.config.mjs` 공유 셀렉터 배열
  (호버/포커스 변형과 이동/확정 duration 이 같은 className 에 공존하면 걸린다).
- **WCAG 2.2 §2.3.3 의 예외는 진짜 예외다** — 사용자가 개시한 줌/팬/스크롤은
  reduced-motion 에서도 시간을 지킨다. 자르면 뷰포트 전체가 1프레임에
  순간이동해 대체하려던 이동보다 나쁘다. 앱이 데려가는 이동만 도착시킨다.

⚠️ **잴 원소를 틀리면 결론이 통째로 뒤집힌다.** 2026-07-28 감사 초안이 팝오버의
**포지셔너**(전이가 없는 게 정상인 배치용 래퍼)를 재고 "주인공이 전이를 한 톨도
안 받는다"를 최우선 결함으로 냈는데, 실제 애니메이션은 그 자식 패널에 있었고
첫 프레임 지분 16.3% 로 이미 건강했다(2026-07-27 수정이 정상 동작 중). 위 8번째
줄의 "88.8% 하드컷" 전례도 **그때 이미 고쳐진 값**이다. 애니메이션을 **소유한
원소**를 재고, 고치기 전에 재현부터 한다.

## 다크 단일 (2026-07-19, 라이트 모드 전면 폐기)

- 앱은 **다크 단일**이다. 라이트 모드 토글, `data-theme` 속성, `theme-toggle`
  기능, 라이트 전용 토큰/CSS 분기는 모두 제거됐다 — 소유자 전략 결정.
- 새 UI 는 다크 값만 정의한다. `[data-theme="light"]` 셀렉터, light 전용
  분기 코드, 라이트 대비 검증을 새로 만들지 말 것.
- `prefers-color-scheme` 대응도 다크 고정 — 시스템 라이트 선호 사용자에게도
  다크를 보여준다 (`app/layout.tsx` `viewport.colorScheme: 'dark'`).

## 토큰 정의 위치

`app/globals.css` 의 `@theme` + `:root` 블록. Tailwind v4 가 alpha 토큰을 utility 만 만들고 `:root` 에 emit 안 하는 경우가 있어 alpha 토큰은 `:root` 에도 명시 선언.
