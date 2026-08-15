import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/shared/lib/cn';

/**
 * **정적 배지의 값 층** — 눌리지 않는 작은 표시의 단일 클래스 출처
 * (2026-08-15 「체계」석 비준).
 *
 * ## 왜 컴포넌트가 아니라 값 층인가
 *
 * `controlClass` 가 정한 층 분리 그대로다: **값은 함수, 행동은 컴포넌트.**
 * 정적 배지는 행동이 0이다 — 눌리지 않고, 포커스도 비활성도 터치 바닥도
 * 없다. 컴포넌트가 나를 것이 없으므로 컴포넌트 껍데기는 2026-08-03 에 죽은
 * `Badge` 의 재생산이다.
 *
 * ## 죽은 `Badge` 를 다시 만드는 것 아닌가 — 사인이 다르다
 *
 * `Card`/`Badge`/`DetailCard` 셋은 **소비처 0** 으로 삭제됐다(2026-08-03).
 * 그런데 부검 기록(`control-class.ts` 머리말)이 같은 날 정정을 달아 뒀다:
 * 실패한 것은 컴포넌트가 아니라 **게이트 없는 컴포넌트**다. 대조군이 오늘
 * 셋 있다 — Dialog · Checkbox · SegmentedControl 은 전부 **이주와 래칫을 같은
 * 라운드에** 지고 태어나 살아 있다. 그래서 이 파일은 혼자 오지 않는다:
 * 이주 22곳 + 채택 래칫 + 조합 계약 + 안내판 라우팅이 같은 PR 에 있다.
 *
 * ## 축은 실측이 유도했다 (2026-08-15 전수: 67건 · 36파일 · 기하 30종 · 색 60종)
 *
 * | shape | 반경 가족 | 값(그 가족의 최빈 기하) | 바이트 동일 |
 * |---|---:|---|---:|
 * | `pill` | full 28 | `rounded-full` + `px-2 py-0.5` + caption | **10** |
 * | `micro` | micro 20 | `rounded-micro` + `px-1.5 py-0.5` + caption | **7** |
 * | `tag` | chip 19 | `rounded-chip` + `px-1.5 py-0` + label | **5** |
 *
 * 반경 삼분은 드리프트가 아니라 **모양이 셋**이라는 뜻이다(세 갈래 모두 두
 * 자릿수 모집단). 각 shape 의 값은 그 가족에서 가장 많이 쓰인 기하이고,
 * 그래서 이주 22곳이 **픽셀 이동 0** 이다.
 *
 * **새 토큰 0 · 새 값 0.** 그 분산은 값이 아니라 **조합** 수준이었다 —
 * 구성 값은 전부 이미 램프 안에 있었고, 없던 것은 그것을 내주는 한 곳이다.
 *
 * ## ⚠️ tone·caps 축은 **일부러 없다** — 색에는 수렴할 다수파가 없었다
 *
 * 체계석 비준은 「색 census 를 세고 tone 축을 확정하라」였다. 세어 보니 축을
 * 만들면 안 되는 모양이었다:
 *
 * | 무엇 | 조합 종수 | 최대 클러스터 |
 * |---|---:|---:|
 * | **기하**(반경·인셋·타입) | 30 | 10 |
 * | **색**(보더/바탕/잉크) | **60** | **2** |
 *
 * 67건에 색 조합이 60종이면 사실상 자리마다 하나다. 어떤 값을 골라도 소비처가
 * 2 이하이므로, tone 을 축으로 만드는 것은 **소비처 0 선택지를 세 개 만드는
 * 것**이고 그것이 컨트롤 높이 8~9종 사고의 원인이었다(`fixedHeight` 계보).
 * 대문자 아이브로우의 자간도 마찬가지다 — caps-08 13 · caps-10 6 · caps-12 5
 * 로 갈려 있어 하나로 고정하면 그 자체가 픽셀 이동이다.
 *
 * 그래서 이 층은 **기하만 소유하고 색·자간은 자리에 남긴다.** 색 수렴은 값이
 * 아니라 **자리별 디자인 판정**이고(무엇이 인디고여야 하는지는 그 배지가 무슨
 * 사실을 나르는지가 정한다), 그 판정은 다음 라운드의 일이다. 래칫이 그때까지
 * 총량을 붙든다 — 한 번에 다 바꾸면 무엇 때문에 화면이 달라졌는지 아무도 못
 * 가른다(`/design-system-audit` 의 수정 순서 계약).
 *
 * `danger`/`success` 도 같은 이유로 없다 — 정적 배지로 쓰인 곳이 0이다(전수에서
 * 나온 4건은 콜아웃 2 · 상태 점 1 · 떠 있는 배너 1로 배지가 아니다).
 *
 * ## 이 층이 덮지 않는 것
 *
 * - **상태 점**(`rounded-full` + `size-1~3`, 글자 없음) — 신호 톤 규격이
 *   따로 있고 배지가 아니다.
 * - **콜아웃**(`MtimeConflictBadge` 처럼 `role="status"` + `px-2 py-1.5` 틴트
 *   블록) — 이름에 badge 가 들어 있어도 **해부가 다르다**. 배지 램프에 밀어
 *   넣으면 축이 오염된다(체계석 명시 제외).
 * - **`EvidenceOnlyBadge`** — `px-1` + `text-label` 은 「행 높이를 흔들지
 *   않는다」가 문서화된 유도라, 바이트 동일이 아니면 스냅하지 않는다(체계석
 *   조건 3). 이 층의 소비자가 아니고, 래칫 등재부가 그 사실을 진다.
 *
 * 게이트: `tests/contract/badge-class.contract.test.ts`(조합 전수) ·
 * `tests/contract/static-badge-adoption-ratchet.contract.test.ts`(손 배지 총량).
 */
const badge = cva('inline-flex flex-none items-center', {
  variants: {
    /** 기하 — 반경 · 인셋 · 타입단. 셋 다 실측 최빈 클러스터다(위 표). */
    shape: {
      micro: 'rounded-micro px-1.5 py-0.5 text-caption leading-caption',
      tag: 'rounded-chip px-1.5 text-label leading-label',
      pill: 'rounded-full px-2 py-0.5 text-caption leading-caption',
    },
  },
  defaultVariants: { shape: 'tag' },
});

export type BadgeShape = NonNullable<VariantProps<typeof badge>['shape']>;

export interface BadgeClassOptions extends VariantProps<typeof badge> {
  /**
   * 이 자리에만 참인 것 — 자리잡기 · 폭 · 잘림, 그리고 **색과 자간**.
   * 색을 여기로 받는 것은 임시가 아니라 위에 적은 실측의 결과다(다수파 없음).
   */
  className?: string;
}

/**
 * 정적 배지의 className 을 낸다.
 *
 * ```tsx
 * <span className={badgeClass({ shape: 'pill', className: 'bg-[color:var(--color-indigo-a12)] text-[color:var(--color-indigo-text-soft)]' })}>초안</span>
 * <span className={badgeClass({ shape: 'micro' })}>문서 없음</span>
 * ```
 */
export function badgeClass({ className, ...variants }: BadgeClassOptions = {}): string {
  return cn(badge(variants), className);
}
