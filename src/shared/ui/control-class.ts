import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/shared/lib/cn';

/**
 * 눌리는 것들의 **단일 클래스 출처**.
 *
 * ## 왜 컴포넌트가 아니라 함수인가 (2026-08-03 소유자 확정)
 *
 * 이 저장소는 이미 컴포넌트로 시도했고 **실패한 실측이 있다**: `Card` · `Badge` ·
 * `DetailCard` 는 프로덕션 사용처가 **0**, `ChromeTile` 은 1, `ChromeChip` 은 5다.
 * 만들어 두면 쓴다는 가정이 틀렸다. 그리고 이 저장소에서 실제로 작동하는 강제
 * 기제는 하나뿐이다 — **lint**(`.claude/rules/design.md`: "규격은 문서가 아니라
 * lint 가 강제한다"). 컴포넌트는 lint 로 강제할 수 없지만 «이 className 이 이
 * 함수에서 왔는가»는 AST 셀렉터로 강제할 수 있다.
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

const control = cva('', {
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
      row: 'flex w-full items-center text-left transition-colors',
      /** 상태·수치를 나르는 완전 둥근 컨트롤(32). */
      pill: 'inline-flex items-center rounded-full border transition-colors',
      /** 카드 하나가 통째로 눌리는 큰 표면(18). */
      card: 'flex items-center rounded-card border transition-colors',
      /** 글자만으로 눌리는 것. 보더도 배경도 없다(85). */
      link: 'inline-flex items-center gap-1 rounded-chip transition-colors',
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
      /** 지금 이겨야 하는 것 — 1차. 한 화면에 여럿이면 위계가 없는 것이다. */
      strong: 'text-[color:var(--color-text-primary)]',
    },
    /** 눌려 있는 상태(`aria-pressed` / `aria-selected` 와 **짝**이어야 한다). */
    active: { true: '', false: '' },
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
    { shape: 'link', size: 'sm', class: 'text-caption' },
    { shape: 'link', size: 'md', class: 'text-label' },
    { shape: 'link', size: 'lg', class: 'text-body' },

    // ── 테두리를 가진 모양의 기본 테두리색. `link`/`row`/`icon` 은 보더가 없다.
    { shape: 'chip', active: false, class: 'border-[color:var(--color-divider)]' },
    { shape: 'pill', active: false, class: 'border-[color:var(--color-divider)]' },
    { shape: 'card', active: false, class: 'border-[color:var(--color-border-soft)]' },

    // ── 눌려 있음: **인디고 하나**로만 표현한다. 새 hue 는 헌장 위반이다.
    { shape: 'chip', active: true, class: 'border-[color:var(--color-indigo-pale-a28)] bg-[color:var(--color-indigo-a16)] text-[color:var(--color-text-primary)]' },
    { shape: 'pill', active: true, class: 'border-[color:var(--color-indigo-pale-a28)] bg-[color:var(--color-indigo-a16)] text-[color:var(--color-text-primary)]' },
    { shape: 'card', active: true, class: 'border-[color:var(--color-indigo-pale-a28)] bg-[color:var(--color-indigo-a16)] text-[color:var(--color-text-primary)]' },
    { shape: 'row', active: true, class: 'bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-primary)]' },
    { shape: 'icon', active: true, class: 'bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-primary)]' },
    { shape: 'link', active: true, class: 'text-[color:var(--color-text-primary)]' },
  ],
  defaultVariants: { shape: 'chip', size: 'md', tone: 'default', active: false },
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
