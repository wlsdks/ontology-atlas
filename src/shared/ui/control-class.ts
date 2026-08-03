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

const control = cva(DISABLED, {
  variants: {
    /**
     * 무엇처럼 눌리는가. 위 표의 여섯이 전부이고, **일곱째를 추가하려면 전수를
     * 다시 세야 한다** — 분류에 없는 모양이 나왔다는 뜻이라서다.
     */
    shape: {
      /** 라벨을 가진 작은 알약형 컨트롤. 이 앱에서 가장 많다(128). */
      chip: 'inline-flex items-center gap-1.5 rounded-chip border transition-colors',
      /** 정사각 아이콘 컨트롤. 라벨이 없으므로 접근 이름이 **필수**다(36). */
      icon: 'inline-flex shrink-0 items-center justify-center rounded-chip transition-colors',
      /** 목록의 한 줄 전체가 눌리는 것. 좌정렬이 정체성이다(39). */
      /**
       * ⚠️ `rounded-chip` 이 **처음엔 빠져 있었다.** 그래서 정규화된 목록 행의
       * 호버 배경이 각지게 나왔다(반경 6 → 0). 모양을 정의하면서 반경을 안 준 것이
       * 원인이고, 실측이 잡았다.
       */
      row: 'flex w-full items-center rounded-chip text-left transition-colors',
      /** 상태·수치를 나르는 완전 둥근 컨트롤(32). */
      pill: 'inline-flex items-center rounded-full border transition-colors',
      /** 카드 하나가 통째로 눌리는 큰 표면(18). */
      card: 'flex items-center rounded-card border transition-colors',
      /** 글자만으로 눌리는 것. 보더도 배경도 없다(85). */
      link: 'inline-flex items-center gap-1 rounded-chip transition-colors',
      /**
       * 아이콘 위, 글자 아래의 **세로** 타일.
       *
       * 2026-08-03 정규화가 찾은 세 번째 구멍 — 모양 여섯이 **전부 가로**라
       * 세로 액션 타일 5개가 시스템 밖에 있었다. 전수에서 「모양」을 셀 때 축을
       * 하나만 본 것이다.
       */
      tile: 'flex flex-col items-center justify-start rounded-card border text-center transition-colors',
    },
    size: {
      /** 실측 분포의 작은 쪽 — `text-caption`/`px-2`. */
      sm: '',
      /** 실측 최빈 — `h-8`/`px-2.5`/`text-label`. */
      md: '',
      /** 실측 분포의 큰 쪽 — `px-3`/`text-body`. */
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
       */
      accent: 'text-[color:var(--color-indigo-accent)]',
      /** 신호 3종 — 헌장이 인정한 그 셋뿐이다(warning · error · success). 확장 금지. */
      warning: 'text-[color:var(--color-status-warning)]',
      danger: 'text-[color:var(--color-danger-text)]',
      success: 'text-[color:var(--color-status-success)]',
    },
    /** 눌려 있는 상태(`aria-pressed` / `aria-selected` 와 **짝**이어야 한다). */
    active: { true: '', false: '' },
    /**
     * **높이를 고정한다** — 크롬 계약이 못박은 자리에서만.
     *
     * ## 왜 이 축이 필요한가 (2026-08-03 회수 라운드 실측)
     *
     * 칩 램프는 패딩으로 높이가 정해져 `md`=30 · `lg`=34 를 낸다. 그런데 설정
     * 시트 계약(`settings-sheet-type-dialect.contract.test.ts`)은 **`h-8`(32)** 을
     * 문자열로 못박는다. **어느 조합으로도 2px 이 남는다** — 램프를 쓰면 계약이
     * 깨지고 계약을 지키면 램프 밖이다.
     *
     * 높이를 램프의 기본값으로 만들지 않은 이유는 그대로 유효하다(칩 143개 중
     * 명시 높이는 38개뿐, 강제하면 70%의 키가 바뀐다). 그래서 **기본값은 여전히
     * 「패딩이 높이를 정한다」**이고, 계약이 치수를 소유한 자리만 이 축을 켠다.
     */
    fixedHeight: { true: '', false: '' },
    /**
     * **문장 속에 있는가.** `link` 에만 뜻이 있다.
     *
     * ## 왜 이 축이 필요한가 (2026-08-03 실측)
     *
     * `link` 에 터치 타깃(`min-h-11`)을 실었더니 **문장 속 컨트롤의 줄 상자가
     * 21.3 → 44px 로 밀려 올라갔다.** 접근성을 지키려던 것이 인라인 자리에서는
     * 레이아웃을 깨는 것이다 — 하나를 고치다 다른 하나를 깼다.
     *
     * 근거는 취향이 아니라 규격이다. **WCAG 2.5.8 은 인라인을 명시적으로
     * 면제한다** — *"The target is in a sentence or its size is otherwise
     * constrained by the line-height of non-target text."* 문장 속 링크는
     * 24×24 를 요구받지 않는다.
     *
     * **기본값이 `false`(= 타깃을 실음)인 이유**: 반대로 두면 홀로 선 글자
     * 컨트롤이 조용히 16px 히트 영역을 갖는다. 인라인에서 잘못 쓰면 줄이
     * 벌어져 **눈에 보이지만**, 타깃이 작은 것은 **안 보인다.** 안 보이는
     * 결함을 기본값으로 두지 않는다.
     */
    inline: { true: '', false: '' },
  },
  compoundVariants: [
    // ── 크기: 모양마다 «크다» 의 뜻이 다르다. 정사각에 px 를 주면 정사각이 아니게 된다.
    { shape: 'chip', size: 'sm', class: 'px-2 py-1 text-caption' },
    { shape: 'chip', size: 'md', class: 'px-2.5 py-1.5 text-label' },
    { shape: 'chip', size: 'lg', class: 'px-3 py-1.5 text-body' },
    { shape: 'icon', size: 'sm', class: 'h-6 w-6' },
    { shape: 'icon', size: 'md', class: 'h-7 w-7' },
    { shape: 'icon', size: 'lg', class: 'h-8 w-8' },
    { shape: 'row', size: 'sm', class: 'gap-1.5 px-2 py-1.5 text-label' },
    { shape: 'row', size: 'md', class: 'gap-2 px-2.5 py-2 text-body' },
    { shape: 'row', size: 'lg', class: 'gap-2.5 px-3 py-2.5 text-body-lg' },
    { shape: 'pill', size: 'sm', class: 'px-2 py-0.5 text-caption' },
    { shape: 'pill', size: 'md', class: 'px-2.5 py-0.5 text-label' },
    { shape: 'pill', size: 'lg', class: 'px-3 py-1 text-body' },
    { shape: 'card', size: 'sm', class: 'gap-1.5 px-2.5 py-1.5 text-label' },
    { shape: 'card', size: 'md', class: 'gap-1.5 px-3 py-1.5 text-body' },
    { shape: 'card', size: 'lg', class: 'gap-2 px-3.5 py-2 text-body-lg' },
    { shape: 'tile', size: 'sm', class: 'gap-1.5 px-2 py-2 text-caption' },
    { shape: 'tile', size: 'md', class: 'gap-2 px-2 py-2.5 text-label' },
    { shape: 'tile', size: 'lg', class: 'gap-2 px-3 py-3 text-body' },
    { shape: 'link', size: 'sm', class: 'text-caption' },
    { shape: 'link', size: 'md', class: 'text-label' },
    { shape: 'link', size: 'lg', class: 'text-body' },

    // ── 테두리를 가진 모양의 기본 테두리색. `link`/`row`/`icon` 은 보더가 없다.
    { shape: 'chip', active: false, class: 'border-[color:var(--color-divider)]' },
    { shape: 'pill', active: false, class: 'border-[color:var(--color-divider)]' },
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
    // 홀로 선 글자 컨트롤만 타깃을 싣는다 — 문장 속은 WCAG 2.5.8 이 면제한다.
    { shape: 'link', inline: false, class: 'min-h-11' },
    // 크롬 계약의 32px — `--chrome-tile-size` 와 같은 단이다.
    { shape: 'chip', fixedHeight: true, class: 'h-8 py-0' },
    { shape: 'pill', fixedHeight: true, class: 'h-8 py-0' },
  ],
  defaultVariants: { shape: 'chip', size: 'md', tone: 'default', active: false, inline: false, fixedHeight: false },
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
