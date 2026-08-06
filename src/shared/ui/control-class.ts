import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/shared/lib/cn';

/**
 * 눌리는 것들의 **단일 클래스 출처**.
 *
 * ## 왜 «값 층» 이 함수인가 — 컴포넌트를 안 만든다는 뜻이 아니다
 *
 * ⚠️ **첫 판단은 틀렸고 같은 날 정정했다.** 처음에는 이 저장소에 사용처 0인
 * 프리미티브가 셋 있는 것(`Card`·`Badge`·`DetailCard`)을 근거로 «컴포넌트는
 * 여기서 안 먹힌다» 고 읽었다. 소유자 반문(*"아직 안 쓴 걸 수도 있는 거 아님?
 * 대부분 디자인 시스템 만들 때 컴포넌트를 만들지 않나?"*)을 받고 실물을 열어
 * 보니 다른 답이 나왔다 — 그 셋은 2026-04-30 생성이라 「아직」이 아니었고,
 * `CardTitle` 이 **`text-lg`** 를 쓰고 있었다. 이 저장소 타입 램프에 **없는**
 * 스텝이다(램프: caption·label·body·body-lg·title·display·hero·hero-lg).
 *
 * **자기가 인코딩해야 할 시스템을 스스로 위반하는 프리미티브**였으니 아무도 안
 * 쓴 게 당연하다. 실패한 것은 컴포넌트가 아니라 **게이트 없는 컴포넌트**다.
 * 셋은 삭제했다. 그리고 업계 표준은 명백히 컴포넌트다 — Carbon · Fluent ·
 * Material · Polaris · shadcn 전부 컴포넌트를 낸다.
 *
 * 그래서 이 파일이 주장하는 것은 «컴포넌트 대신 함수» 가 아니라 **층의 분리**다:
 *
 * | 층 | 형태 | 왜 |
 * |---|---|---|
 * | **값** (모양·크기·색) | 이 함수 | 문자열이면 충분하고, 계약 테스트가 램프 밖 값을 **못 내게** 막는다 |
 * | **행동** (기본 `type="button"` · 접근 이름 요구 · 비활성 어포던스 · 포커스) | 컴포넌트 | 문자열이 나를 수 없다 |
 *
 * 위에 컴포넌트를 얹는 것은 정상이고 권장이다. **단 게이트를 갖고 태어나야
 * 한다** — 그게 `Card` 가 3개월간 죽어 있던 이유이고, 이 파일이 계약 테스트를
 * 같은 PR 에 달고 나온 이유다.
 *
 * ## 왜 모양이 여섯인가 — 지어낸 분류가 아니다
 *
 * 프로덕션 생 `<button>` **419개**를 전수 분류한 결과다(2026-08-03):
 *
 * | 모양 | 개수 | 기존 `<Button>` 이 덮나 |
 * |---|---:|---|
 * | `chip` | 128 | ✗ |
 * | `link` | 85 | ✗ |
 * | `row` | 39 | ✗ |
 * | `icon` | 36 | ✗ |
 * | `pill` | 32 | ✗ |
 * | `card` | 18 | ✗ |
 * | 표준 버튼(h-10/11) | **1** | ✓ |
 *
 * 채택률 5%는 게으름이 아니라 **커버리지 구멍**이었다 — 시스템에 컨트롤 클래스가
 * 하나뿐인데 앱은 여섯을 쓴다. 그래서 «Button 을 쓰게 만든다»가 아니라 «없는
 * 클래스를 만든다»가 이 파일의 일이다.
 *
 * ## 값은 실측에서 왔다 — 그런데 실측에 규격이 없었다
 *
 * 각 모양의 **모양 클래스**는 오늘 화면의 최빈값이다(chip: `rounded-chip` 126회 ·
 * `transition-colors` 121 …). 여기까지는 무손실이다.
 *
 * **크기는 달랐다.** 칩 143개의 (높이, `px`, `py`, 타입) 결합 분포를 재 보니
 * **고유 조합 50종**이고 상위 3종을 합쳐도 **23%** 였다. 즉 이 앱의 칩 크기는
 * 램프가 아니라 사실상 임의값이었고, 그게 `design.md` 의 「치수 규칙성」이 말하는
 * 결함 그 자체다.
 *
 * 그래서 **여기 3단 사이즈 램프는 «오늘의 요약»이 아니라 «가야 할 규격»이다.**
 * 결과가 중요하다:
 *
 * > **기존 컨트롤을 이 함수로 옮기는 것은 리팩터가 아니라 정규화다 — 픽셀이 바뀐다.**
 *
 * 그러므로 대량 전환은 이 파일이 단독으로 정할 일이 아니라 **디자인 게이트**의
 * 일이다(`/design-council` 의 「체계」). 이 파일이 오늘 보장하는 것은 하나다:
 * **새로 쓰는 컨트롤은 50종을 51종으로 만들지 않는다.** 그 강제가
 * `tests/contract/control-adoption-ratchet.contract.test.ts` 다.
 *
 * ## 이 함수가 하지 않는 것
 *
 * - **표준 버튼(`<Button>`)을 대체하지 않는다.** 그건 이미 variant/shadow 체계를
 *   갖고 있고 419개 중 1개만 그 모양이다. 겹치는 자리를 만들면 «어느 쪽이 규격인가»
 *   가 흐려진다.
 * - **접근성 기본값을 붙이지 않는다.** 함수는 문자열만 낸다 — `type="button"` 과
 *   접근 이름은 **별도 lint 룰**이 강제한다. 이게 갈래 D 의 명시된 대가였다.
 */

/**
 * 비활성 — **누를 수 없으면 누를 수 없어 보여야 한다.**
 *
 * 값 층에 두는 이유: 컴포넌트마다 챙기면 하나는 빠진다. 실제로 2026-08-03 에
 * `ChromeChip` 과 `ChromeTile` 이 둘 다 빠져 있었고, 소유자가 *"'최근 변경'
 * 누르니까 아무런 반응이 없는데?"* 로 발견했다. 값은 `Button` 이 이미 쓰는
 * 문법 그대로다(`tests/contract/disabled-affordance.contract.test.ts` 가
 * 프리미티브 간 값이 갈리는 것을 막는다).
 */
const DISABLED =
  'disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none disabled:hover:border-inherit disabled:hover:bg-inherit disabled:hover:text-inherit';

/**
 * 키보드 초점 — **`DISABLED` 와 같은 이유로 값 층에 둔다.**
 *
 * ## 왜 여기 없었나, 그리고 왜 그 판단이 틀렸나 (2026-08-05 실측)
 *
 * 이 파일은 아래 「축이 아닌 것」 절에서 *"호버·포커스는 여기서 안 낸다"* 고
 * 적어 두고 그 근거로 `design.md` 의 모션 예산(호버/포커스는 `--motion-fast`
 * 안에서 끝낸다)을 인용했다. **그 인용이 범주 오류였다** — 그 규칙은 초점
 * 전환이 얼마나 **오래** 걸리는지를 정하지, 초점을 **낼지 말지**를 정하지
 * 않는다.
 *
 * 결과 실측: `controlClass` 와 `controls.tsx` 에 `focus` 라는 글자가 **0회**
 * 나온다. 그래서 `Chip`(52곳) · `IconButton`(35곳) · `RowButton`(19곳)이 전부
 * 브라우저 기본 초점 링, 즉 **OS 강조색(보통 하늘색)** 을 그린다. 이는
 * `forbidden.md` 의 「둘 이상의 채색 시스템 금지」 밖이고, 같은 결함이 첫 실행
 * 시트에서 한 번 잡혀 `tests/e2e/dialog-focus-ring.spec.ts` 가 생겼는데 그
 * 검사는 **컨테이너 하나**만 보고 그 안의 버튼들은 안 봤다.
 *
 * 더 오래된 프리미티브(`Button` · `ChromeChip` · `ChromeTile` · `TabBar` ·
 * `Select` · `InfoHint`)는 전부 링을 갖고 있었다 — **새 정본이 그것을 잃은
 * 쪽**이다. `DISABLED` 가 2026-08-03 에 같은 방식으로 발견된 것과 판박이다.
 *
 * `ring-inset` 인 이유: 컨트롤이 촘촘한 행·칩 묶음에서 바깥 링은 이웃과
 * 겹친다. 안쪽 링은 상자 치수를 한 픽셀도 안 바꾼다 — 그래서 이 상수를
 * 더해도 레이아웃 이동이 0 이다.
 */
const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-a46)]';

/**
 * 손가락 바닥 표식 — `pointer: coarse` 에서만 컨트롤을 44px 로 밀어 올린다.
 *
 * ## 왜 값 층이 이걸 내나
 *
 * 이 파일은 높이를 **Tailwind 리터럴**(`min-h-6`=24 · `min-h-8`=32 ·
 * `min-h-9`=36)로 낸다. `--control-h-*` 를 읽지 않는다. 그래서
 * `@media (pointer: coarse)` 안에서 그 토큰들을 44 로 올려도 칩·행·pill 에는
 * **한 곳도 안 닿았다** — 실측 44px 미만 38곳.
 *
 * 리터럴을 토큰 참조로 바꾸는 길은 막혀 있다: 리터럴 5종이 토큰 3단과 1:1 이
 * 아니라 데스크톱 픽셀까지 움직인다. 그래서 표식 클래스로 **손가락에서만**
 * 바닥을 깐다. 규칙은 `app/globals.css` 파일 끝, **캐스케이드 레이어 밖**에
 * 있다 — 레이어 안에 있으면 `@layer utilities` 의 `min-h-8` 이 명시도와
 * 무관하게 이긴다(실제로 밟았다).
 *
 * ## 왜 `touch-hit-expand` 가 아니라 실제 높이인가
 *
 * 두 처방을 다 재 보고 골랐다. 히트 영역만 넓히면 컨트롤이 서로 **겹칠 수
 * 있다** — 44px 미만 38곳 중 **21곳이 이웃과 12px 미만**이었고(EN/KO 토글은
 * 1px), 보이지 않는 영역이 겹치면 그건 오터치다. `min-height` 는 컨트롤이
 * 실제로 커지면서 이웃을 **밀어내므로** 겹칠 수가 없다. 대가는 밀도(모바일
 * `/docs` 헤더 세로 ~50px)이고, 그 대가를 치르기로 했다.
 *
 * 정사각 표면 계약이라 `min-h` 로는 모양이 안 서는 `icon` 과, 글줄을 찢게 되는
 * `link`(WCAG 2.5.8 인라인 면제)는 이 표식을 받지 않는다.
 * 게이트: `tests/contract/touch-floor-layer.contract.test.ts`.
 */
const TOUCH_FLOOR = 'atlas-touch-floor';

const control = cva(`${DISABLED} ${FOCUS}`, {
  variants: {
    /**
     * 무엇처럼 눌리는가. 위 표의 여섯이 전부이고, **일곱째를 추가하려면 전수를
     * 다시 세야 한다** — 분류에 없는 모양이 나왔다는 뜻이라서다.
     */
    shape: {
      /** 라벨을 가진 작은 알약형 컨트롤. 이 앱에서 가장 많다(128). */
      /*
       * 반경이 여기 없는 유일한 모양 — 크기 컴파운드가 낸다(`xs`=micro,
       * `sm`~`lg`=chip). 마이크로 티어(24px 아래가 아니라 **칩 아래** 한 층)는
       * 반경도 한 단 작다: 전수 96곳의 4px(`rounded-micro`)이 그 증거다.
       * 두 반경이 한 출력에 공존하지 않도록 base 에서 뺐다 — cn 의 radius
       * 그룹 병합(`RADIUS_RAMP_STEPS`)이 있어도 출력은 한 클래스가 정직하다.
       */
      chip: `${TOUCH_FLOOR} inline-flex items-center gap-1.5 border transition-colors`,
      /**
       * 정사각 아이콘 컨트롤. 라벨이 없으므로 접근 이름이 **필수**다(36).
       *
       * ## `touch-hit-expand` 가 여기 붙는 이유 (2026-08-05)
       *
       * 이 모양은 **하드 치수**를 낸다 — `h-6`(24) · `h-7`(28) · `h-8`(32).
       * 정사각이라 `min-h` 로는 모양이 안 서기 때문이고, 그 판단 자체는 맞다.
       * 문제는 그 결과다: `@media (pointer: coarse)` 의 44px 승격은 **CSS
       * 토큰 9개**(`--chrome-tile-size` · `--overlay-close-size` · …)에만
       * 걸리는데, 이 모양은 그중 아무것도 안 읽는다. 실측 **51곳**(`shape:
       * 'icon'` 17 + `IconButton` 34)이 손가락 아래에서 24~32px 였고
       * `touch-hit-expand` 를 단 곳은 **0** 이었다.
       *
       * 「승격이 빈 방에 떨어지고 있었다」 — `touch-target-contract.spec.ts` 가
       * 자기 헤더에 적어 둔 그 문장이 다시 참이 된 것이고, 이번엔 값 층이
       * 리터럴을 내기 때문이다.
       *
       * **왜 값 층인가**: `DISABLED` · `FOCUS` 와 같은 이유다 — 컴포넌트마다
       * 챙기면 하나는 빠진다. 그리고 이 클래스는 **`pointer: coarse` 안에만
       * 존재**하므로 마우스에서는 규칙이 아예 안 만들어진다. 보이는 상자는
       * 그대로 두고 **히트 영역만** 의사요소로 넓히는 것이라 레이아웃 이동도 0.
       */
      icon: 'touch-hit-expand inline-flex shrink-0 items-center justify-center rounded-chip transition-colors',
      /** 목록의 한 줄 전체가 눌리는 것. 좌정렬이 정체성이다(39). */
      /**
       * ⚠️ `rounded-chip` 이 **처음엔 빠져 있었다.** 그래서 정규화된 목록 행의
       * 호버 배경이 각지게 나왔다(반경 6 → 0). 모양을 정의하면서 반경을 안 준 것이
       * 원인이고, 실측이 잡았다.
       */
      row: `${TOUCH_FLOOR} flex w-full items-center text-left transition-colors`,
      /** 상태·수치를 나르는 완전 둥근 컨트롤(32). */
      pill: `${TOUCH_FLOOR} inline-flex items-center rounded-full border transition-colors`,
      /** 카드 하나가 통째로 눌리는 큰 표면(18). */
      card: 'flex items-center rounded-card border transition-colors',
      /**
       * 글자만으로 눌리는 것. 보더도 배경도 없다(85). 바닥은 WCAG 2.5.8(AA)의
       * 24(`min-h-6`) — coarse 포인터의 44 는 높이가 아니라 `.touch-hit-expand`
       * (레이아웃 이동 0)가 낸다. 아래 「삭제된 축: inline」 참조.
       */
      link: 'inline-flex min-h-6 items-center gap-1 rounded-chip transition-colors',
      /**
       * 아이콘 위, 글자 아래의 **세로** 타일.
       *
       * 2026-08-03 정규화가 찾은 세 번째 구멍 — 모양 여섯이 **전부 가로**라
       * 세로 액션 타일 5개가 시스템 밖에 있었다. 전수에서 「모양」을 셀 때 축을
       * 하나만 본 것이다.
       */
      tile: 'flex flex-col items-center justify-start rounded-card border text-center transition-colors',
      /**
       * **보더 없는 인셋** — 세그먼트 항목 · 탭 · 고스트 버튼.
       *
       * ## 왜 여덟째 모양인가 — 네 라운드가 같은 결론에 다른 이름으로 닿았다
       *
       * 「일곱째를 감으로 추가하지 않는다」는 규율이 이 자리에서 요구하는 것은
       * **반복 횟수**다. 래칫 원장(`control-adoption-ratchet`)이 네 라운드
       * 연속으로 같은 구멍을 보고했다:
       *
       * | 라운드 | 원장이 쓴 이름 | 못 옮긴 수 |
       * |---|---|---:|
       * | 설정 시트 | 「보더 있는 컨테이너 안의 보더 없는 컨트롤」 | 1 파일 · 반복 3 |
       * | 지도 두 위젯 | 「세그먼트 탭」 | 3 |
       * | features | 「보더 없는 인셋(고스트) 모양이 없다」 | 9 |
       * | 위젯 | 「보더 없는 세그먼트·탭」 | 6 |
       *
       * 네 번 같은 결론이 나오면 그건 취향이 아니라 **모양이 실재한다**는
       * 신호다. `chip`·`pill`·`card`·`tile` 은 보더가 필수라 이미 보더를 두른
       * 상자 안에서 「상자 속 상자」가 되고, `link` 는 인셋이 0이라 세그먼트의
       * 히트 영역이 사라진다. 그 사이가 이 모양이다.
       *
       * ## 반경 — `--chrome-radius-inner` 는 새 값이 아니다
       *
       * 소비처 다섯이 `rounded-[var(--chrome-radius-inner)]` 를 쓰고 있는데,
       * `app/globals.css` 에서 그 토큰은 **`var(--radius-chip)` 의 별칭**이다
       * (6px, globals.css `--chrome-radius-inner: var(--radius-chip)`). 그래서
       * `rounded-chip` 으로 옮기면 **바이트만 다르고 픽셀은 같다** — 램프 밖
       * 반경을 새로 만들 이유가 없다.
       *
       * ## 크기 — 실측 최빈값이 `md` 다
       *
       * 남은 세그먼트/고스트 12개의 인셋 분포: `px-2 py-1`/`text-label` 6 ·
       * `px-2.5 py-1`/`text-label` 2 · `px-2.5`+28px 고정 5 · `px-3` 계열 3.
       * 최빈 하나를 `md` 에 정확히 앉혔다.
       */
      segment: 'inline-flex items-center justify-center rounded-chip text-center transition-colors',
    },
    /**
     * 크기 — **높이는 사다리가 정하고, 패딩은 그 안에서 결정된다.**
     *
     * ## 2026-08-03 정정: 패딩의 부산물을 램프라고 부르지 않는다
     *
     * 처음 이 램프는 높이를 **아무도 안 고른 채** 냈다 — 패딩+행간+보더의 합이
     * 곧 높이였고, 그 결과가 칩 24/30/34 · 필 20/22/30 이었다(실측). **30 · 34 ·
     * 22 · 20 은 이 앱의 높이 어휘(24 · 28 · 32 · 36 · 40 · 44) 어디에도 없는
     * 값**이고, 그때 이미 `app/globals.css` 에 `--control-h-{sm,md,lg}`
     * (28/32/40)라는 단일 진실원이 **있었다**. 찾지 않고 만든 값은 시스템이
     * 아니라 두 번째 시스템이다.
     *
     * 더 나빴던 것은 그 다음이다. 새 값이 계약(32px)과 부딪히자 값을 고치는
     * 대신 **예외 축(`fixedHeight`)을 더했다.** 축은 값이 틀렸다는 **증상**이지
     * 필요한 축이 아니었다 — 값을 고치니 축이 죽었다(2026-08-03 소유자 결정,
     * `docs/DECISIONS.md`).
     *
     * ## 2026-08-03 2차 정정: 사다리 복원이 칩·필에서 멈춰 있었다
     *
     * 위 정정(#884)이 세운 것은 `chip`/`pill` 뿐이었다. 같은 날 2차 전수가
     * 나머지 모양에서 같은 부류의 결함을 찾았다 — segment/sm **22px**(WCAG
     * 2.5.8 바닥 미달, 소비처 0) · row/lg **42px**(어휘 밖, 소비처 0) ·
     * card/sm **30px**(어휘 밖, 15곳) · card/md **34px**(크롬 잠금 단
     * `--docs-header-tile-size` 를 패딩 산수로 우연 점유, 5곳). 넷 다
     * 「패딩이 높이를 정한」 부산물이다.
     *
     * 그래서 오늘의 규격은 이렇다 — **가로 한 줄 모양은 전 조합이 명시
     * 플로어(`min-h-*`)로 사다리 위에 선다**. 플로어가 자연높이와 같은 조합은
     * 픽셀 이동 0이고, 규격이 산수의 부산물이 아니라 선언이 된다:
     *
     * | 모양 | xs | sm | md | lg |
     * |---|---:|---:|---:|---:|
     * | `chip`/`pill` | 24 | 24 | 32 | 32 — `lg` 가 키우는 것은 **글자와 좌우 인셋**이지 높이가 아니다(2026-08-03 소유자 확정, 소비처 26곳) |
     * | `segment` | 24 | 24 | 24 | 32 |
     * | `row` | 28 | 28 | 36 | 44 |
     * | `card` | 32 | 32 | 36 | 40 |
     * | `icon` | 24 | 24 | 28 | 32 — 정사각이라 하드 `h-*` |
     *
     * `xs` 는 **높이의 단이 아니다** — 24 바닥은 그대로 두고 인셋·타입·반경만
     * 마이크로 티어로 내린다(칩에서만 sm 과 다르고, 나머지 모양에서는 sm 의
     * 별칭이다). 24 아래 단을 만들지 않는 이유는 사다리 표의 첫 줄이다:
     * WCAG 2.5.8 바닥 아래는 «작은 단»이 아니라 규격 미달이다.
     *
     * `link` 는 바닥 24(`min-h-6`, 모양 base) — 2026-08-04 재설정 집행.
     * 종전 44(`min-h-11`)는 WCAG 2.5.8(AA, 24×24)을 인용하면서 2.5.5(AAA)/HIG
     * 터치 값을 실은 **사실 오류**였고, 44 는 터치 계약(design.md)이 «coarse
     * 단일 출처»로 못박은 `--touch-target-min` 이다. coarse 의 44 는 높이가
     * 아니라 `.touch-hit-expand` 가 내고, 부착 자격(이웃 타깃 여유 ≥12px)은
     * 소비처가 진다 — 밀집 행에 무조건 붙이면 DOM 순서상 뒤 원소가 앞 원소의
     * 탭을 훔친다. 자리별 전수 표: docs/DECISIONS.md 2026-08-04 「link 바닥 24」.
     * `tile` 은 세로 2축 표면이라 내용이 높이를 정한다 — 사다리 이탈이 아니라 축이 다르다.
     *
     * 하드 `h-8` 이 아니라 **`min-h-8`** 인 이유: 하드 높이는 줄바꿈한 칩을
     * 잘라 내용을 숨기지만, `min-h` 는 단행 칩을 32로 세우면서 넘치는 내용은
     * 자라게 둔다.
     *
     * 사다리 전체(24 · 28 · 32 · 34 · 36 · 40 · 44)와 각 단의 소유자는
     * `docs/DESIGN-SYSTEM.md` 「컨트롤 높이 사다리」 절이 정본이다.
     *
     * ## 타입은 size 에 동승한다 — 분리는 반려됐다 (2026-08-04 체계석)
     *
     * 레퍼런스 조사(Carbon: size 는 높이만 · shadcn: 타입은 base)가 「타입을
     * size 에서 빼면 ≈56 이 열린다」고 예측했고 소유자가 방향을 승인했지만,
     * 부채 155 를 **자리 단위로** 열어 보니 분리(오버라이드·상속)가 혼자 여는
     * 자리는 **2~3** 이었다 — 결합 부류의 자리 대부분이 rest 색 방언(틴트
     * 채움 · panel 보더 · overlay 배경) · 무게 · 모노 보이스 · 사다리 밖 높이 ·
     * 상시 밑줄에 **겹쳐** 있어 타입만 풀어도 안 열린다(값 층 라운드 3 의
     * 「겹친 구멍」 판정이 자리 단위에서 재확증됐다). 소비처 2~3 축은 만들지
     * 않는다 — `fixedHeight` 를 죽인 그 기준이다. Carbon 형(전 크기 한 타입)은
     * 위 표의 「`lg` 가 키우는 것은 글자와 좌우 인셋」 소유자 확정과 정면
     * 충돌하고, 칩·필 `sm`(caption) 전수의 픽셀을 근거 없이 올린다.
     * 원장: docs/DECISIONS.md 2026-08-04 「타입-크기 분리 반려」.
     */
    size: {
      /**
       * 마이크로 티어 — 명령 태그·마이크로 배지·kbd 급. **칩에서만 `sm` 과
       * 다르다**(인셋 px-1.5 · caption · 반경 micro). 높이는 그대로 24 바닥
       * (`min-h-6`)이다 — 사다리는 "24 아래는 규격 미달"이라 말하고, 이 단이
       * 여는 것은 높이가 아니라 **인셋·타입·반경**이다. 다른 모양에서는 `sm`
       * 의 별칭이다(소비처 0 값의 발명 금지 — 계약이 별칭임을 단언한다).
       *
       * 근거: 「sm 아래 한 칸이 없다」가 래칫 원장에 **세 라운드 연속**
       * (features 4 · 잔여 재측정 14 · 프리미티브 라운드 재확인) 기록된 뒤의
       * 승격이다. 감이 아니라 반복 횟수다.
       */
      xs: '',
      /** 사다리 바닥 24px — WCAG 2.5.8 최소 타깃. `text-caption`/`px-2`. */
      sm: '',
      /** `--control-h-md` 32px — 실측 최빈. `px-2.5`/`text-label`. */
      md: '',
      /** 같은 32px 인데 글자와 인셋이 한 단 크다. `px-3`/`text-body`. */
      lg: '',
    },
    /**
     * 색은 **위계**이지 장식이 아니다. 헌장이 무채색 + 단일 인디고를 고정했으므로
     * 여기서 나올 수 있는 것도 그 안이다.
     */
    tone: {
      /** 기본 — 3차 텍스트. 화면에서 가장 흔하다. */
      default: 'text-[color:var(--color-text-tertiary)]',
      /** 더 물러난 것 — 4차. 아이콘 컨트롤의 최빈값이다. */
      muted: 'text-[color:var(--color-text-quaternary)]',
      /**
       * 3차와 1차 사이 — **2026-08-03 정규화가 찾은 구멍.** 톤을 3단으로 냈는데
       * 설정 시트만 해도 `text-secondary` 컨트롤이 7개였다. 모양은 전수에서 셌으면서
       * **톤은 안 셌다.** 그 7개가 시스템 밖에 남아 있었다.
       */
      secondary: 'text-[color:var(--color-text-secondary)]',
      /** 지금 이겨야 하는 것 — 1차. 한 화면에 여럿이면 위계가 없는 것이다. */
      strong: 'text-[color:var(--color-text-primary)]',
      /**
       * 인디고 강조 — 「이 화면의 주 행동」. 같은 정규화가 찾은 두 번째 구멍으로,
       * 대응 톤이 없어 15개가 시스템 밖에 있었다. 헌장의 **단일 인디고**이고
       * 새 hue 가 아니다.
       *
       * ## 사정거리 — 맨 바탕 위에서만 (2026-08-03 체계석 판정)
       *
       * `--color-indigo-accent`(#7170ff)는 앱 전역 99줄이 쓰는 «링크·라벨
       * 인디고» 관용구다. **단 그 라이선스는 맨 어두운 바탕까지다**: 합성
       * 대비 실측이 canvas 5.18 · panel 4.96 · elevated 4.53 인데, 인디고
       * 틴트 채움(`--color-indigo-a14+`·`line-a13`)이나 앰버 힌트가 깔리면
       * 3.5~4.4 로 WCAG 1.4.3 AA(4.5)를 깬다 — 호버(`a24`)는 canvas 위에서도
       * 4.13 이다. 틴트를 지는 컨트롤은 아래 `accentOnTint` 다. 게이트:
       * `tests/contract/accent-ink-contrast.contract.test.ts` + eslint
       * 페어링 셀렉터.
       */
      accent: 'text-[color:var(--color-indigo-accent)]',
      /**
       * **틴트 위의 인디고 강조** — 채움·호버 채움(인디고 a08~a24 · line-a13 ·
       * 앰버 힌트)을 지는 「주 행동」의 잉크.
       *
       * ## 왜 둘로 갈랐나 — 이 앱에는 인디고 잉크의 해가 둘이다
       *
       * `scope` 축과 같은 문법이다: 하나의 인디고가 두 바탕 위에서 두 해를
       * 갖는다. 표식 인디고(#7170ff)는 틴트가 깔리는 순간 AA 를 깨는데
       * (전수 29곳 중 26곳이 실측 미달 상태였다), 글자용
       * `--color-indigo-text-soft`(rgba 188,195,255,.92)는 이 앱의 모든
       * 표면 합성에서 6.46:1 이상이다. 값은 새로 만들지 않았다 — 공방·지도
       * 패널이 손으로 이미 쓰던 그 토큰의 램프 등재다.
       *
       * hue 는 같은 단일 인디고라 «주 행동» 의미는 유지되고, 잃는 것은
       * 채도다 — 그 대가로 어떤 소비처도 자기 바탕의 대비 숙제를 다시 하지
       * 않는다.
       */
      accentOnTint: 'text-[color:var(--color-indigo-text-soft)]',
      /** 신호 3종 — 헌장이 인정한 그 셋뿐이다(warning · error · success). 확장 금지. */
      warning: 'text-[color:var(--color-status-warning)]',
      danger: 'text-[color:var(--color-danger-text)]',
      /*
       * ⚠️ success 만 신호 토큰이 아니라 **글자 역할 토큰**이다 (2026-08-03
       * 체계석 정정). 셋의 역할이 어긋나 있었다 — danger 는 글자 역할
       * (`--color-danger-text`)인데 success 는 신호색(#32b97d)을 내서, 성공
       * 틴트 위 글자(창백한 민트 a94)를 쓰는 소비처가 램프 밖에 남기를 택했고
       * 실측 소비처가 **0**이었다(소비처 0 = fixedHeight 를 죽인 그 기준).
       * 값을 앱의 실제 관용구(a94)로 맞추니 소비처가 돌아왔다. 기존 소비처
       * 0이라 이 재지정으로 바뀐 픽셀·색도 0이다.
       * warning 은 신호 토큰을 유지한다 — 유일 소비처(DependencyPicker)가
       * 그 값 위에서 이미 옳고, 앰버 글자 관용구(amber-source-a90)와의 수렴
       * 여부는 전수와 함께 다음 판정으로 넘겼다(래칫 원장 참조).
       */
      success: 'text-[color:var(--color-success-text-a94)]',
      /**
       * **채워진 인디고 위의 전경** — 이 화면의 단 하나의 주 동작.
       *
       * ## 왜 톤이 바탕까지 내는가
       *
       * 두 라운드가 독립으로 같은 구멍을 보고했다(features 5 · 위젯 6):
       * *"인디고를 배경으로 깔면 글자는 `text-white` 인데 tone 여덟에 그 자리가
       * 없다."* 잉크만 내면 소비처가 `bg-…`/무게를 `className` 으로
       * 계속 써야 하고, 그건 **모양을 className 으로 넘기는 것**이라 층이 있으나
       * 마나다. 그래서 잉크와 바탕을 **한 쌍으로** 낸다 — `active: true` 가 이미
       * 같은 문법(배경+보더+잉크를 함께)을 쓰고 있고, 채움은 「눌림」과 마찬가지로
       * 잉크 혼자로는 성립하지 않는 상태라서다.
       *
       * 무게를 포함한 이유도 실측이다: `--color-indigo-brand` 를 바탕으로 깐
       * 컨트롤 중 무게를 명시한 **15개가 semibold 13 · medium 2** 였다
       * (2026-08-03 전수). 무게가 이 톤의 정체성의 일부이고, 예외 2건은 규격이
       * 아니라 편차다 — 옮기면서 semibold 로 정규화했다(상자 치수는 패딩·행간이
       * 정하므로 높이 변화 0).
       *
       * **2026-08-05: 그 semibold 가 램프로 올라갔다.** `font-semibold`(600)는
       * Tailwind 기본 스텝이라 `--font-weight-*` 사다리 밖이었다. 이 자리는
       * 제목이 아니라 버튼 라벨이므로 `emphasis`(560) — 600 에서 가장 가까운
       * 스텝이기도 하다(560 은 −40, 650 은 +50). 「인디고 면 위에서 기본
       * 무게보다 무겁다」는 이 톤의 정체성은 그대로다.
       *
       * 호버(`hover:bg-[color:var(--color-indigo-hover)]`)는 여전히 소비처의
       * 몫이다 — 이 파일이 호버를 안 내는 규율은 그대로다.
       *
       * 새 hue 0: 바탕은 헌장의 단일 인디고, 잉크는 무채(#fff). 대비 실측
       * 4.71:1 로 WCAG AA(4.5) 위다.
       */
      onAccent:
        'bg-[color:var(--color-indigo-brand)] font-[var(--font-weight-emphasis)] text-[color:var(--color-text-on-accent)]',
    },
    /**
     * **어느 잉크 램프 위에 서 있는가.**
     *
     * ## 왜 이 축이 필요한가 — 두 라운드가 독립으로 같은 결론에 닿았다
     *
     * 이 저장소에는 무채색 글자 램프가 **두 벌** 있고 값이 다르다:
     *
     * | 단 | `--color-text-*` | `--topology-v2-panel-text-*` |
     * |---|---|---|
     * | primary | `#f7f8f8` | `#ececf0` |
     * | secondary | `#d0d6e0` | `#a3a3ac` |
     * | tertiary | `#8a8f98` | `#868690` |
     * | quaternary | `#82828a` | `#82828a` |
     *
     * 우연이 아니다 — 패널 램프의 tertiary/quaternary 는 **패널 바탕
     * `#17171c` 위에서 대비를 재서** 넛지된 값이다(globals.css 주석: 4.02:1 →
     * ≈4.9:1, ~2.5:1 → ~4.7:1). 즉 두 램프는 두 개의 채색 시스템이 아니라
     * **하나의 무채 램프가 두 바탕 위에서 갖는 두 해**다. (quaternary 는
     * 2026-08-03 「체계」 판정으로 전역 값이 `#787c84` → `#82828a` 로 올라
     * **두 해가 같은 값으로 수렴**했다 — 우연이 아니라 같은 제약(올라선 표면
     * 위 AA)의 같은 답이다. 원장: docs/DECISIONS.md.)
     *
     * 원장이 센 것: features 라운드 11개 + 위젯 라운드 8개 = **19개**가 이
     * 이유로 구조적으로 값 층 밖이었다.
     *
     * ## 왜 「소비처가 잉크만 얹는다」를 택하지 않았나
     *
     * 그러면 `className` 에 색이 실린다. 이 파일이 스스로 금지한 바로 그것이고
     * (「모양·크기·색을 여기 넣으면 이 함수가 있으나 마나다」), 19개를 옮겨도
     * 색은 여전히 손으로 쓴 값이니 **아무것도 안 옮긴 것과 같다**.
     *
     * ## 왜 CSS 변수 재정의를 택하지 않았나
     *
     * 패널 안에서 `--color-text-*` 를 통째로 덮으면 축 없이 19개가 그냥
     * 풀린다. 그런데 그 패널 안에는 컨트롤이 아닌 소비처(제목 · 통계 · 힌트
     * 문장)가 훨씬 많고, **그 전부의 출력이 같이 바뀐다**. 재지 않은 회귀를
     * 무료로 사는 셈이라 기각했다. 축은 명시적이고, 켠 자리만 바뀌고,
     * 계약으로 잠글 수 있다.
     *
     * ## 이 축이 열 수 없는 것
     *
     * 패널 램프에는 **신호 3종도 인디고도 없다.** `accent`/`warning`/`danger`/
     * `success` 는 `scope` 와 무관하게 전역 토큰을 그대로 낸다 — 신호는 바탕이
     * 아니라 뜻으로 정해지기 때문이다. 계약이 이걸 잠근다.
     */
    scope: {
      /** 앱 전역 바탕(`--color-canvas` 계열) 위. 기본값이다. */
      app: '',
      /** 지도 패널(`--topology-v2-panel-surface`, `#17171c`) 위. */
      panel: '',
    },
    /**
     * **말줄임이 필요한가.**
     *
     * ## 왜 이 축이 필요한가 (2026-08-03 실측)
     *
     * 모양 일곱이 **전부 flex 계열**(`inline-flex`/`flex`)이라
     * `text-overflow: ellipsis` 가 통하지 않는다. 실측: 같은 텍스트·같은 폭에서
     * `inline-block` 은 `…` 를 그리고 `inline-flex` 는 **하드 클립**한다(글자가
     * 잘린 자리에서 그냥 끊긴다). 그래서 「폭이 모자라면 줄여서라도 다 보여야
     * 하는」 컨트롤 — 빵부스러기 · 발자국 행 · 세그먼트 탭 라벨 — 이 값 층 밖에
     * 남았다(지도 뷰 라운드 3 + 세그먼트 5).
     *
     * `truncate` 유틸리티만 얹는 것으로는 못 고친다. **display 를 바꿔야
     * 한다** — 그건 모양의 일이지 소비처의 일이 아니다.
     *
     * 켜면 `block` 이 된다(`inline-block` 이 아니라): flex 자식으로 놓였을 때
     * `min-w-0`/`flex-1` 과 함께 줄어들어야 하는 자리가 실측 소비처의 전부다.
     */
    truncate: { true: 'block truncate', false: '' },
    /** 눌려 있는 상태(`aria-pressed` / `aria-selected` 와 **짝**이어야 한다). */
    /**
     * **쌓인 칸인가.** 이미 둥근 컨테이너(`overflow-hidden rounded-*`) 안에
     * 세로로 쌓여 경계선으로 갈리는 칸이면 `true` — 자기 반경을 내면 안 된다.
     *
     * ## 왜 아홉째 모양이 아니라 축인가 (2026-08-06)
     *
     * `row` 를 그대로 쓰면 `rounded-chip` 이 따라와서 **호버 배경이 조각조각
     * 둥글어지고 칸 사이에 틈이 보인다** — 컨테이너가 이미 모서리를 맡고 있는데
     * 안쪽이 또 맡는 것이다. 그렇다고 아홉째 모양을 만들면 `row` 와 **인셋·
     * 정렬·터치 바닥이 전부 같은** 쌍둥이가 생긴다(모양 여덟의 근거는 실측
     * 모집단인데, 이건 같은 모집단의 **배치 조건**이다).
     *
     * 전수 **9곳**: `DesktopVaultWelcome` 4 · `ProjectForm` · `DocsSidebarBody` ·
     * `CommitDetail` · `SearchPalette` · `TopologyIndexTreeRow`.
     */
    stacked: { false: '', true: '' },
    active: { true: '', false: '' },
    /*
     * ── **삭제된 축: `fixedHeight`** (2026-08-03 소유자 결정)
     *
     * 여기 「높이를 고정한다」는 축이 있었다. 칩 램프가 30/34 를 내는데 계약이
     * 32 를 못박아 «어느 조합으로도 2px 이 남는다» 는 것이 그 축의 근거였다.
     * 그 진단이 한 칸 얕았다 — 남은 2px 은 **램프 값이 틀렸다는 신호**였지
     * 축이 필요하다는 신호가 아니었다. 값을 32로 수렴시키자 축이 할 일이
     * 없어졌고, 19개 소비처 중 18개가 **픽셀 이동 0** 으로 기본값에 흡수됐다.
     *
     * 이 자리에 다시 높이 축을 세우고 싶어지면 그 전에 물어라: **사다리에
     * 이미 있는 값인가?** 있으면 그건 축이 아니라 `size` 다.
     */
    /*
     * ── **삭제된 축: `inline`** (2026-08-04 체계석 판정 — docs/DECISIONS.md)
     *
     * 「문장 속인가」로 `min-h-11` 을 면제하던 불리언이 있었다. 두 겹으로
     * 틀렸다: ① 면제하던 값(44)이 애초에 2.5.8 의 값이 아니었다(위 정정).
     * ② 「문장 속」을 정하는 셋 — 형제 글자의 출처(마크다운·i18n) · used
     * display(다른 파일의 부모가 정한다) · reflow — 이 전부 여는 태그 밖이라
     * **정적으로 판정 불가**다. 실측: 14개 소비처 중 진짜 문장·캡션 행 속은 3곳뿐,
     * 나머지 11곳은 「내 상자를 키우지 마라」는 일반 탈출구로 눌렀고 그중
     * 16~17px 자리들을 어떤 검사도 못 봤다. 바닥이 24 로 서자 탈출구가 할
     * 일이 없어졌다 — `fixedHeight` 와 같은 죽음이다.
     *
     * 인라인 면제(WCAG 2.5.8 «in a sentence»)의 판정은 런타임 계기가 맡는다:
     * `tests/e2e/touch-target-contract.spec.ts` 의 fine-pointer 검사가
     * computed display 와 형제 글자로 판정한다. 산문 링크는 애초에 컨트롤이
     * 아니다 — `.prose-link` 계약(`prose-link.contract.test.ts`) 소관.
     */
  },
  compoundVariants: [
    /*
     * ── 행의 반경은 **배치가 정한다** (2026-08-06).
     *
     * 홀로 서는 행은 자기 모서리를 갖고(`rounded-chip`), 이미 둥근 컨테이너 안에
     * 쌓인 칸은 **갖지 않는다** — 안쪽이 또 둥글면 호버 배경이 조각조각 둥글어져
     * 칸 사이에 틈이 보인다.
     */
    { shape: 'row', stacked: false, class: 'rounded-chip' },
    // ── 크기: 모양마다 «크다» 의 뜻이 다르다. 정사각에 px 를 주면 정사각이 아니게 된다.
    /*
     * 칩 — 24 / 32 / 32. `md` 는 자연 높이 30 을 `min-h-8` 이 32 로 올리고,
     * `lg` 는 `py` 를 한 단 줄여(1.5→1) 자연 30 을 만든 뒤 같은 32 에 세운다.
     * `min-h` 는 **올리기만** 하므로 `py-1.5` 그대로면 34 가 남는다.
     */
    /*
     * 칩 반경 — xs 만 micro(4px), 나머지는 chip(6px). 소비처 바이트가 근거다:
     * 마이크로 태그 전수가 `rounded`(4px)를 입고 있었고, 옮기며 반경이 움직인
     * 자리는 0이다.
     */
    { shape: 'chip', size: 'xs', class: 'rounded-micro min-h-6 gap-1 px-1.5 py-0.5 text-caption' },
    { shape: 'chip', size: ['sm', 'md', 'lg'], class: 'rounded-chip' },
    { shape: 'chip', size: 'sm', class: 'min-h-6 px-2 py-1 text-caption' },
    { shape: 'chip', size: 'md', class: 'min-h-8 px-2.5 py-1.5 text-label' },
    { shape: 'chip', size: 'lg', class: 'min-h-8 px-3 py-1 text-body' },
    { shape: 'icon', size: ['xs', 'sm'], class: 'h-6 w-6' },
    { shape: 'icon', size: 'md', class: 'h-7 w-7' },
    { shape: 'icon', size: 'lg', class: 'h-8 w-8' },
    /*
     * 행 — 28 / 36 / 44. 셋 다 자연높이가 이미 그 값이라(행간+패딩) 플로어는
     * 픽셀 이동 0이다. `lg` 만 예외 — 자연 42는 어휘에 없는 값이라 `min-h-11`
     * (`--touch-target-min` = `--control-row-h` 44)로 올린다. 소비처 0이라
     * 이동도 0. 42를 쓰는 소비처가 생기기 전에 단을 사다리에 세웠다.
     */
    { shape: 'row', size: ['xs', 'sm'], class: 'min-h-7 gap-1.5 px-2 py-1.5 text-label' },
    { shape: 'row', size: 'md', class: 'min-h-9 gap-2 px-2.5 py-2 text-body' },
    { shape: 'row', size: 'lg', class: 'min-h-11 gap-2.5 px-3 py-2.5 text-body-lg' },
    /*
     * 필 — 같은 24 / 32 / 32. **여기가 실측이 소유자 가설과 갈린 자리다.**
     * 필의 옛 자연 높이는 칩과 같은 24/30/34 가 아니라 **20 / 22 / 30** 이었다
     * (`py-0.5` 라서). 그래서 `sm` 은 20 → 24 로 **올려야** 사다리 바닥이자
     * WCAG 2.5.8 최소 타깃(24×24)에 닿고, `md` 는 22 → 32 로 10px 이 움직인다.
     * 소비처 9개(`sm`)·3개(`md`)의 실이동은 PR 본문의 표에 그대로 적혀 있다 —
     * 「±2px 안」이라는 예상과 다른 값이라 숨기지 않는다.
     */
    { shape: 'pill', size: ['xs', 'sm'], class: 'min-h-6 px-2 py-1 text-caption' },
    { shape: 'pill', size: 'md', class: 'min-h-8 px-2.5 py-0.5 text-label' },
    { shape: 'pill', size: 'lg', class: 'min-h-8 px-3 py-1 text-body' },
    /*
     * 카드 — 32 / 36 / 40 (+4 등차, 전부 높이 어휘 안). 2차 전수가 찾은 자리:
     * 자연높이가 sm 30 · md 34 로, 30은 어휘 밖이고 34는 크롬 잠금 단
     * (`--docs-header-tile-size`)의 우연 점유였다. 플로어로 32/36에 세운다 —
     * 한 줄짜리 카드만 +2px 움직이고(전수 표는 PR), 여러 줄 카드는 내용이
     * 이미 플로어 위라 이동 0이다. `lg` 는 자연 40 = `--control-h-lg` 그대로.
     */
    { shape: 'card', size: ['xs', 'sm'], class: 'min-h-8 gap-1.5 px-2.5 py-1.5 text-label' },
    { shape: 'card', size: 'md', class: 'min-h-9 gap-1.5 px-3 py-1.5 text-body' },
    { shape: 'card', size: 'lg', class: 'min-h-10 gap-2 px-3.5 py-2 text-body-lg' },
    { shape: 'tile', size: ['xs', 'sm'], class: 'gap-1.5 px-2 py-2 text-caption' },
    { shape: 'tile', size: 'md', class: 'gap-2 px-2 py-2.5 text-label' },
    { shape: 'tile', size: 'lg', class: 'gap-2 px-3 py-3 text-body' },
    { shape: 'link', size: ['xs', 'sm'], class: 'text-caption' },
    { shape: 'link', size: 'md', class: 'text-label' },
    { shape: 'link', size: 'lg', class: 'text-body' },
    // 세그먼트: `md` 가 실측 최빈(`px-2 py-1`/`text-label`, 24px)이라 6개가
    // 픽셀 변화 0으로 들어온다. lg 는 32px. 보더가 없어 자연높이가 바닥을
    // 뚫을 수 있다 — `min-h-6` 이 WCAG 2.5.8 바닥(24)에 세운다.
    //
    // `sm` 은 2026-08-03 재정의됐다. 구 값(px-2 py-1 caption)은 소비처 0인
    // 채 한 라운드를 다 돌았고, 실측 소비처(px-1 인셋의 마이크로 토글 —
    // 트레일 「지난 길」· 알림 벨 · 패널 내보내기, 전수 4)의 최빈은
    // `px-1 py-0.5`/`text-label`(md 와 같은 타입, 한 칸 좁은 인셋)이었다.
    // caption 이던 옛 sm 을 지키면 xs 아래에 sm 이 서는 역전이 생긴다 —
    // 소비처 0 값은 지키는 것이 아니라 고치는 것이다(#884 의 기준 그대로).
    { shape: 'segment', size: ['xs', 'sm'], class: 'min-h-6 gap-1 px-1 py-0.5 text-label' },
    { shape: 'segment', size: 'md', class: 'min-h-6 px-2 py-1 text-label' },
    { shape: 'segment', size: 'lg', class: 'min-h-8 px-3 py-1.5 text-body' },

    // ── 테두리를 가진 모양의 기본 테두리색. `link`/`row`/`icon` 은 보더가 없다.
    //
    // chip/pill 이 `--color-divider`(0.08)에서 `--color-border-soft`(0.06)로
    // 온 이유 (2026-08-03 체계석): 칩 반경 원소의 손 보더 전수가
    // **border-soft/chrome-border 74 대 divider 18**(4:1)이었다. 램프 기본이
    // 소수파(0.08)라서 칩을 옮길 때마다 보더가 조용히 한 단 진해졌다 —
    // 다수를 찾지 않고 기본값을 정한 규칙 0 위반의 정정이다. card/tile 은
    // 처음부터 border-soft 였으니 이제 네 모양이 같은 기본 위에 선다.
    { shape: 'chip', active: false, class: 'border-[color:var(--color-border-soft)]' },
    { shape: 'pill', active: false, class: 'border-[color:var(--color-border-soft)]' },
    { shape: 'card', active: false, class: 'border-[color:var(--color-border-soft)]' },
    { shape: 'tile', active: false, class: 'border-[color:var(--color-border-soft)]' },
    { shape: 'tile', active: true, class: 'border-[color:var(--color-indigo-pale-a28)] bg-[color:var(--color-indigo-a16)] text-[color:var(--color-text-primary)]' },

    // ── 눌려 있음: **인디고 하나**로만 표현한다. 새 hue 는 헌장 위반이다.
    { shape: 'chip', active: true, class: 'border-[color:var(--color-indigo-pale-a28)] bg-[color:var(--color-indigo-a16)] text-[color:var(--color-text-primary)]' },
    { shape: 'pill', active: true, class: 'border-[color:var(--color-indigo-pale-a28)] bg-[color:var(--color-indigo-a16)] text-[color:var(--color-text-primary)]' },
    { shape: 'card', active: true, class: 'border-[color:var(--color-indigo-pale-a28)] bg-[color:var(--color-indigo-a16)] text-[color:var(--color-text-primary)]' },
    { shape: 'row', active: true, class: 'bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-primary)]' },
    { shape: 'icon', active: true, class: 'bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-primary)]' },
    { shape: 'link', active: true, class: 'text-[color:var(--color-text-primary)]' },
    // 보더 없는 인셋의 눌림 — 상자 안에서 「지금 이것」을 인디고 틴트로만 말한다.
    // 실측 소비처 12개 중 12개가 `--color-indigo-a16`/`a26` 틴트였다(보더 0).
    { shape: 'segment', active: true, class: 'bg-[color:var(--color-indigo-a16)] text-[color:var(--color-text-primary)]' },

    /*
     * ── 두 번째 무채 램프. 패널 바탕(#17171c) 위에서 대비를 재서 넛지된 값이라
     * 새 채색 시스템이 아니라 **같은 무채 램프의 두 번째 해**다. 신호 3종과
     * 인디고는 여기 없다 — 뜻으로 정해지는 색은 바탕을 안 탄다.
     */
    { scope: 'panel', tone: 'default', class: 'text-[color:var(--topology-v2-panel-text-tertiary)]' },
    /*
     * `muted` 의 panel 컴파운드는 여기 **없다** (2026-08-03 삭제). 두 램프의
     * quaternary 가 `#82828a` 로 수렴해(전역 상향, docs/DECISIONS.md) 재매핑이
     * 같은 값을 내는 무노동 분기가 됐다 — 계약 시험의 처방대로 그 단은 tone
     * 하나로 충분하다. 소비처는 그대로 `tone: 'muted', scope: 'panel'` 을 써도
     * 된다(기본 muted 가 같은 값을 낸다, 픽셀 이동 0). 두 값이 다시 갈라지는
     * 날은 계약 시험의 수렴 고정이 빨개져 이 컴파운드를 되살리라고 말한다.
     */
    { scope: 'panel', tone: 'secondary', class: 'text-[color:var(--topology-v2-panel-text-secondary)]' },
    { scope: 'panel', tone: 'strong', class: 'text-[color:var(--topology-v2-panel-text-primary)]' },
    // 패널 안의 눌림도 패널 잉크를 쓴다 — 안 그러면 눌린 순간만 램프가 튄다.
    { scope: 'panel', shape: 'segment', active: true, class: 'text-[color:var(--topology-v2-panel-text-primary)]' },
    { scope: 'panel', shape: 'row', active: true, class: 'text-[color:var(--topology-v2-panel-text-primary)]' },
    { scope: 'panel', shape: 'link', active: true, class: 'text-[color:var(--topology-v2-panel-text-primary)]' },

    /*
     * ── 채움 톤은 보더를 지운다. 여기 있어야 하는 이유는 순서다 — 위의
     * `border-[…divider]` 컴파운드보다 **뒤**여야 tailwind-merge 에서 이긴다.
     */
    { tone: 'onAccent', class: 'border-transparent' },
  ],
  defaultVariants: {
    shape: 'chip',
    size: 'md',
    tone: 'default',
    scope: 'app',
    stacked: false,
    active: false,
    truncate: false,
  },
});

export type ControlShape = NonNullable<VariantProps<typeof control>['shape']>;
export type ControlSize = NonNullable<VariantProps<typeof control>['size']>;
export type ControlTone = NonNullable<VariantProps<typeof control>['tone']>;

export interface ControlClassOptions extends VariantProps<typeof control> {
  /**
   * 이 컨트롤 **한 자리에만** 참인 것(자리잡기 · 폭 · 순서). 모양·크기·색을 여기
   * 넣으면 이 함수가 있으나 마나다 — 그때는 램프에 스텝을 추가하는 것이 답이다.
   */
  className?: string;
}

/**
 * 눌리는 원소의 className 을 낸다.
 *
 * ```tsx
 * <button type="button" className={controlClass({ shape: 'chip' })}>도메인</button>
 * <button type="button" aria-label="닫기" className={controlClass({ shape: 'icon', size: 'sm' })}>
 * ```
 *
 * **호버·포커스는 여기서 안 낸다** — 빈도가 예산을 깎기 때문이다
 * (`.claude/rules/design.md`: 호버/포커스 표면은 `0~--motion-fast`). `transition-colors`
 * 만 싣고 실제 호버 색은 소비처가 정한다. 그래야 «이 컨트롤이 무엇을 바꾸는가»가
 * 자리마다 다를 수 있다.
 */
export function controlClass({ className, ...variants }: ControlClassOptions = {}): string {
  return cn(control(variants), className);
}

/* ════════════════════════════════════════════════════════════════════
 * ## 폼 필드 — **둘째 cva** (2026-08-06, 디자인 카운슬 「체계」 + 「위계」)
 * ════════════════════════════════════════════════════════════════════
 *
 * ### 왜 아홉째 `shape` 가 아닌가
 *
 * 세 가지가 전부 이 파일 자신의 규율이다:
 *
 * 1. **모양 여덟의 근거는 `<button>` 419 전수다.** 위 머리말이 「일곱째를
 *    추가하려면 전수를 다시 세야 한다」고 못박았는데, 필드는 **다른 모집단**
 *    (폼 63)이고 축도 다르다.
 * 2. **죽은 조합이 두 번째 시스템이다.** `tone` 10단 중 필드에 뜻이 있는 것은
 *    사실상 0이다 — 필드 잉크는 primary 고정이고 플레이스홀더 quaternary 가
 *    정체성이라, `accent`·`onAccent`·`success` 필드는 소비처가 없다. 공유
 *    base 의 `FOCUS`(ring-inset)도 **눌리는 것의 관용구**이지 필드의 관용구
 *    (보더 스왑)가 아니다.
 * 3. **조합 산수.** `control-class.contract.test.ts` 의 전수는 지금 2,560
 *    케이스다. 아홉째 모양은 **+320** 을 만들고 그 대부분이 죽은 조합이다.
 *    별도 cva 는 **16**(frame 2 × size 4 × multiline 2)으로 끝난다.
 *
 * ### 축이 셋인 근거 — 「위계」석이 같은 선을 독립적으로 그었다
 *
 * 「위계」석이 실물을 열고 폼을 셋으로 갈랐다: **기록**(값이 디스크에 남는다 —
 * 눈은 입력에) · **조회**(있는 것에 도착한다 — 눈은 결과에) · **무대**(카드에
 * 쓰일 글자를 그 자리에서 쓴다).
 *
 * 앞의 둘이 `frame` 축이다. **합치면 안 되는 이유**가 그 자리에서 나왔다 —
 * 기록을 투명하게 만들면 폼이 사라지고, 조회를 무겁게 만들면 **입력이 결과를
 * 이긴다**(조회 10곳은 전부 트리·지도·목록이 주목 승자인 자리다).
 *
 * **무대는 이 규격 밖이다** — 공방의 이름 입력(23px)은 폼의 타입이 아니라
 * **만들어질 카드의 타입**이라, 크기가 장식이 아니라 정보를 나른다(Mackinlay
 * expressiveness). 상자에 넣는 순간 그 정보가 지워진다. 여기 등재해 두는 이유는
 * **다음 사람이 접지 않게** 하기 위해서다.
 *
 * ### 새 토큰 0
 *
 * 전부 기존 램프의 재사용이다. 높이는 `--control-h-{sm,md,lg}`(28/32/40)와
 * **1:1** 이고 그 1:1 을 계약이 CSS 에서 읽어 대조한다 — 「어휘 안에 있는가」로
 * 쓰면 안 된다. 실제로 프로브에서 「한 줄 md 를 `h-9`(36)로」가 어휘 검사를
 * **초록으로 통과**했다(36도 높이 어휘 안이라서).
 */
/**
 * ⚠️ **타입은 base 가 아니라 «크기와 짝»이다** — 화면을 보고 고쳤다.
 *
 * 처음엔 `text-body`(12.5px) 하나로 냈다. `/project/new` 전후를 나란히 놓고
 * 보니 **주 폼에서 후퇴**였다 — 그 화면의 입력값이 종전 14px 였는데 12.5px 로
 * 내려가면서, **사용자가 입력한 값이 앱이 쓴 라벨(11px)과 거의 같은 급**이
 * 됐다. 폼에서 가장 잘 읽혀야 하는 것은 사용자가 넣은 값이다.
 *
 * 그래서 램프의 「크기 칸이 자기 행간을 같이 싣는다」와 같은 규율을 쓴다:
 * **넓은 칸(md·lg)은 `text-body-lg`(14) · 촘촘한 칸(xs·sm)은 `text-body`(12.5).**
 * 촘촘한 칸은 28px 상자라 14px 을 넣으면 위아래 여유가 사라진다.
 */
const fieldBase =
  'text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] transition-colors';

const field = cva(`${fieldBase} ${DISABLED}`, {
  variants: {
    /**
     * **누가 상자를 내는가.**
     *
     * `bare` 는 치수·보더·반경·터치 바닥을 **내면 안 된다** — 부모가 이미 상자를
     * 냈고, 여기서 또 내면 그 상자를 안쪽에서 밀어낸다.
     */
    frame: {
      /*
       * **폭을 내지 않는다.** 처음엔 `w-full` 을 넣었다가 뺐다 — 소비처가
       * 갈린다(`ProjectQuickEditPanel`·`WebManualConnectPanel` 은 `w-full`,
       * `CreateNodeForm` 은 부모 grid 가 폭을 준다). base 가 폭을 내면 후자에서
       * **0px 전환이 아니게 된다.**
       */
      boxed:
        'atlas-touch-floor border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] focus-visible:border-[color:var(--color-indigo-a46)] focus-visible:outline-none',
      bare: 'bg-transparent text-body focus:outline-none',
    },
    /** 한 줄인가 자라는가. **별개 모양이 아니다** — 보더·바탕·반경·초점·플레이스홀더가 같고 치수 문법만 다르다. */
    multiline: { false: '', true: 'resize-none' },
    size: { xs: '', sm: '', md: '', lg: '' },
  },
  compoundVariants: [
    /*
     * 높이는 `--control-h-*` 와 1:1 이다: sm=28 · md=32 · lg=40.
     * `xs` 는 높이 단이 아니라 **반경만 한 층 내리는** 티어다 — 위 `chip` 의
     * `xs` 가 쓰는 문법 그대로이고, 소비처는 `DocFrontmatterBlock` 3곳이다.
     */
    { frame: 'boxed', multiline: false, size: 'xs', class: 'h-7 rounded-micro px-2 text-body' },
    { frame: 'boxed', multiline: false, size: 'sm', class: 'h-7 rounded-chip px-2 text-body' },
    { frame: 'boxed', multiline: false, size: 'md', class: 'h-8 rounded-chip px-2.5 text-body-lg' },
    { frame: 'boxed', multiline: false, size: 'lg', class: 'h-10 rounded-chip px-3 text-body-lg' },
    { frame: 'boxed', multiline: true, size: 'xs', class: 'min-h-7 rounded-micro px-2 py-1.5 text-body' },
    { frame: 'boxed', multiline: true, size: 'sm', class: 'min-h-7 rounded-chip px-2 py-1.5 text-body' },
    { frame: 'boxed', multiline: true, size: 'md', class: 'min-h-8 rounded-chip px-2.5 py-1.5 text-body-lg' },
    { frame: 'boxed', multiline: true, size: 'lg', class: 'min-h-10 rounded-chip px-3 py-2 text-body-lg' },
  ],
  defaultVariants: { frame: 'boxed', multiline: false, size: 'md' },
});

export type FieldFrame = NonNullable<VariantProps<typeof field>['frame']>;
export type FieldSize = NonNullable<VariantProps<typeof field>['size']>;

export interface FieldClassOptions extends VariantProps<typeof field> {
  /** 이 필드 **한 자리에만** 참인 것 — 폭(`w-full`·`flex-1`)과 자리잡기. 규격은 여기 넣지 않는다. */
  className?: string;
}

/**
 * 폼 필드의 className 을 낸다.
 *
 * ```tsx
 * <input className={fieldClass({ size: 'lg' })} />                       // 기록
 * <input className={fieldClass({ frame: 'bare', className: 'flex-1' })} /> // 조회
 * <textarea className={fieldClass({ multiline: true, size: 'lg' })} />
 * ```
 *
 * **폭을 안 낸다** — `boxed` 만 `w-full` 을 내고 `bare` 는 부모의 flex 배치에
 * 얹히므로 `flex-1`/`min-w-0` 은 자리의 몫이다. 위 `controlClass` 가 「자리잡기·
 * 폭은 className」이라고 정한 것과 같은 경계다.
 */
export function fieldClass({ className, ...variants }: FieldClassOptions = {}): string {
  return cn(field(variants), className);
}

/**
 * 필드 이름(라벨)의 규격 — **폼 전수를 옮기면서 갈래가 셋으로 드러났다** (2026-08-06).
 *
 * | 갈래 | 무엇 | 규격이 있나 |
 * |---|---|---|
 * | **이름 텍스트** | 「이름」·「카테고리」처럼 필드를 부르는 말 | ✅ 이 함수 |
 * | **행 전체가 눌리는 것** | 체크박스를 감싸 라벨 클릭이 곧 토글이 되는 행 | ✅ 이 함수(`row`) |
 * | **배치 전용 래퍼** | `block` · `flex flex-col gap-1` 처럼 자리만 잡는 것 | ❌ 규격이 아니다 |
 *
 * 셋째 갈래를 여기 끌어들이지 않는다 — 자리만 잡는 `<label>` 에 타입·색을 얹으면
 * 그 안의 실제 이름 텍스트와 **둘이 규격을 다투게** 된다.
 *
 * ## 왜 잉크가 `secondary` 인가 — 「위계」석 실측이 뒤집은 값
 *
 * `/project/new` 의 필드 라벨이 `text-caption`(9.5px) · `quaternary` 였는데
 * **바로 아래 각주가 11px** 이었다. **필드의 이름이 자기 각주보다 한 단 작았다.**
 * 그래서 사용자는 라벨보다 14px 플레이스홀더를 먼저 읽고, 타이핑을 시작하는
 * 순간 그 안내가 사라진다(NN/g 플레이스홀더 연구가 말하는 실패 그대로).
 *
 * 2026-08-02 설정 시트에서 잡은 것과 **같은 과**다 — 종속 자리의 치수를 주
 * 역할에 그대로 들고 올라온 것. 규격: **이름은 `text-label`(11) 이상 · 잉크는
 * 각주(quaternary)보다 밝다.**
 */
const fieldLabelVariants = cva('text-label text-[color:var(--color-text-secondary)]', {
  variants: {
    /**
     * 행 전체가 눌리는가. 체크박스를 감싸면 **라벨이 곧 타깃**이라(WCAG 2.5.8)
     * 24px 바닥과 손가락 바닥을 함께 진다.
     */
    row: {
      false: '',
      true: `${TOUCH_FLOOR} flex min-h-6 cursor-pointer items-center gap-2`,
    },
  },
  defaultVariants: { row: false },
});

export interface FieldLabelOptions extends VariantProps<typeof fieldLabelVariants> {
  /** 이 라벨 한 자리에만 참인 것 — 자리잡기·폭. 타입·색은 여기 넣지 않는다. */
  className?: string;
}

/**
 * 필드 이름의 className 을 낸다.
 *
 * ```tsx
 * <label htmlFor={id} className={fieldLabel()}>이름</label>
 * <label className={fieldLabel({ row: true })}><input type="checkbox" />허브로 표시</label>
 * ```
 */
export function fieldLabel({ className, ...variants }: FieldLabelOptions = {}): string {
  return cn(fieldLabelVariants(variants), className);
}
