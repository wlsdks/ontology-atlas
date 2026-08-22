import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Tailwind 클래스명 결합 유틸리티.
 * clsx로 조건부 합치고 tailwind-merge로 충돌 해결 (나중 값이 이김).
 *
 * 소유자 실보고 근본 원인 (2026-07-23, "크롬 글자가 너무 크다"): tailwind-merge
 * 는 자기 기본 스케일에 없는 `text-<step>` 을 **색상**으로 분류한다. 우리
 * 타입 램프(`--text-caption`~`--text-hero`)의 `text-label`/`text-body` 가
 * 색상으로 오분류된 채 뒤따르는 색상 arbitrary(text-[color:…] 꼴)와 "충돌"해 조용히
 * 드롭됐고, 해당 표면들은 루트 16px 로 렌더돼 왔다 (크롬 필 실측으로 발견).
 * 램프 7단을 font-size 그룹으로 등록해 크기·색상이 공존하게 한다.
 * `app/globals.css` 의 `--text-*` 램프와 반드시 동기 — 스텝을 추가하면
 * 여기도 추가할 것 (계약 테스트: cn.test.ts).
 */
export const TYPE_RAMP_STEPS = [
  'caption',
  'label',
  'body',
  'body-lg',
  'title',
  'display',
  'hero',
  'hero-lg',
  // 관문 헤드라인 전용 기념비 스텝 (2026-08-18, 관문 리메이크).
  // clamp(40px, 5.8cqw, 96px) — 단(measure) 비례. 값과 글리프 예산 산식은
  // `app/globals.css` 의 `--text-monument` 독블록.
  'monument',
] as const;

/**
 * 행간 램프 스텝 — 타입 램프와 같은 규율이 그대로 적용된다.
 *
 * 오분류의 형태는 크기 램프와 다르다. tailwind-merge 는 `leading-` 접두를
 * 다른 그룹으로 오분류하지는 않으므로 클래스가 **드롭되지는** 않는다. 대신
 * 커스텀 스텝을 아예 인식하지 못해 **충돌 병합이 일어나지 않는다** —
 * `cn('leading-body', cond && 'leading-prose')` 에서 둘 다 살아남고 CSS 소스
 * 순서가 승자를 정한다. 조건부 분기가 의도한 값을 못 이기는 조용한 비결정성이라
 * 크기 드롭보다 찾기 어렵다.
 *
 * `app/globals.css` 의 `--leading-*` 램프와 반드시 동기 — 스텝을 추가하면
 * 여기도 추가할 것 (계약 테스트: cn.test.ts).
 */
export const LEADING_RAMP_STEPS = [
  'caption',
  'label',
  'body',
  'body-lg',
  'title',
  'display',
  'hero',
  'hero-lg',
  'monument',
  'display-tight',
  'prose',
] as const;

/**
 * 반경 램프 스텝 — 위 두 램프와 같은 규율.
 *
 * tailwind-merge 는 자기 스케일에 없는 `rounded-<step>` 을 radius 그룹으로
 * 인식하지 못한다. 그러면 `cn('rounded-chip', cond && 'rounded-micro')` 에서
 * **둘 다 살아남아** CSS 소스 순서가 승자를 정한다 — 행간 램프와 같은 «충돌
 * 병합 실패» 부류다. 값 층(`control-class.ts`)이 모양 기본 반경 위에 크기별
 * 반경(chip/xs 의 micro)을 컴파운드로 얹으면서 이 병합이 실제로 필요해졌다.
 *
 * `app/globals.css` 의 `--radius-*` 램프와 반드시 동기 — 스텝을 추가하면
 * 여기도 추가할 것 (계약 테스트: cn.test.ts).
 */
export const RADIUS_RAMP_STEPS = ['micro', 'chip', 'card', 'panel', 'sheet'] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [...TYPE_RAMP_STEPS] }],
      leading: [{ leading: [...LEADING_RAMP_STEPS] }],
      rounded: [{ rounded: [...RADIUS_RAMP_STEPS] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
