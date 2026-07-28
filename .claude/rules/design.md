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
- **amber 는 세 갈래이고 규율이 다르다** — ① 허브 앰버(`#d4b478`, 확장 금지)
  ② 레일 로고 마크(같은 값이지만 브랜드 마크, 라우트당 1개, 데이터 아님)
  ③ kind tone 앰버(`capability` 데이터 마크 — 종류 센서스의 무라벨 스택
  스트립, 지도 점). 감사 때마다 ②③이 ①의 확장으로 오인돼 재점검된다.
  판별표: `docs/DESIGN-SYSTEM.md` "Three ambers, three rules".
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

## 규격은 lint 로 강제된다 (md 만으로는 안 지켜진다)

**디자인 규격을 문서에 쓰면 같은 PR 에서 `eslint.config.mjs` 에 룰을 넣는다.**
룰 없는 규격은 지켜지지 않는다 — 2026-07-26 실측: `--shadow-elevation-1/2/3`
사다리가 `design.md` 에 정의돼 있었는데 룰이 없어 하드코딩 rgba 섀도가 코드에
5건 살아 있었다.

현재 코드로 강제되는 것 (`no-restricted-syntax`):

| 규격 | 셀렉터 | 레벨 |
|---|---|---|
| 타입 램프 | `text-[Npx]` 금지 | 완료 디렉토리 error / 미완 warn |
| radius 램프 | `rounded-[Npx]` 금지 | 동일 |
| **그림자 사다리** | `shadow-[…]` 중 **`var(` 없는 것**만 금지 | 동일 |
| **hex 색상** | Tailwind **arbitrary value 안**의 hex 만 금지 | 동일 (현재 위반 0 — 예방 게이트) |
| **모션 duration** | `duration-<숫자>` 금지 (토큰 참조형은 문법상 안 걸림) | 동일 |
| **행간 램프** | `leading-[N]` arbitrary 만 금지 (기존 named 199건은 제외) | 동일 |
| **램프 우회** | 램프 토큰을 arbitrary length 로 참조하는 것만 금지 (램프 밖 크기 토큰은 정당) | 동일 (켤 때 위반 0) |
| 금지 그라디언트 | `scaleGradientSelectors` | 동일 |

### lint 가 못 보는 층은 계약 테스트가 맡는다

`no-restricted-syntax` 는 **한 파일의 AST 셀렉터 매칭**이라, 판정에 다른 파일의
값 목록이 필요한 규격은 표현할 수 없다. 그런 규격은 계약 테스트로 건다 — 문서에
쓰고 아무 게이트도 안 거는 것만 금지다.

| 규격 | 게이트 | lint 가 못 하는 이유 |
|---|---|---|
| **`text-*`/`leading-*` 가 정의된 스텝을 가리킨다** | `tests/contract/type-ramp-step-defined.contract.test.ts` | 판정에 `app/globals.css` 의 토큰 목록이 필요. 스텝 이름을 룰에 복제하면 복제본이 램프와 드리프트해 게이트가 사각지대를 만든다 |
| **셸 본문 슬롯이 자식을 압축하지 않는다** | `AppShell.test.tsx`(처방 위치) + `tests/e2e/scroll-end-gap.spec.ts`(실제 여백 px) | 결함이 **레이아웃 계산의 결과**. 클래스 문자열은 정상인 채로 픽셀만 틀린다 |
| **조건부 크기가 행간 짝을 어긋내지 않는다** | `tests/contract/type-ramp-leading-pair.contract.test.ts` | 판정에 **한 원소의 클래스 전체**가 필요한데 `cn()` 인자로 쪼개지면 AST 셀렉터 하나에 안 담긴다. 램프 토큰을 arbitrary length 로 우회하는 **부분집합**만 lint 가 잡는다 |

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

**정정(2026-07-28 실측)**: 이 절은 오래 "세 블록" 이라 적어 왔지만, 램프
셀렉터를 스프레드하는 블록은 **둘**(`codexMigratedGlobs` error ·
`codexR6Globs` warn)이다. 세 번째 블록은 `scaleGradientSelectors` 만 전역
적용한다. 차이가 중요하다 — 그 **두 글롭 밖의 경로에는 램프 룰이 아예 없다**
(`src/entities/**`, `src/views/{home,ontology-studio,project-detail,git,…}`,
`src/shared/{lib,config,motion}`, `app/**`). 그건 결함이 아니라 문서화된
설계이고 래칫(`type-ramp-coverage`)이 붙들지만, "3 블록" 이라는 문구는 다음
사람에게 **커버리지를 과대평가하게** 만든다.

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
