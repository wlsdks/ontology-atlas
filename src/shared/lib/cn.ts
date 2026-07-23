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
const TYPE_RAMP_STEPS = ['caption', 'label', 'body', 'body-lg', 'title', 'display', 'hero'] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [...TYPE_RAMP_STEPS] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
