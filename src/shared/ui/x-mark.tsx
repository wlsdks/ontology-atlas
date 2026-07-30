import type { SVGProps } from 'react';

/**
 * X(구 트위터) 마크 — **플랫폼 지시자**이지 우리 브랜드가 아니다.
 *
 * 판정 근거는 `github-mark.tsx` 와 같다: `lucide-react` 는 브랜드 아이콘을
 * 전부 뺐고, 이 마크는 우리 것의 이름이 아니라 **링크의 목적지**이며, 우리는
 * 그 플랫폼의 레이아웃·색·서체를 하나도 가져오지 않는다. 가져온 것은 목적지의
 * 이름표 하나다. 그 파일의 헌장 판정 두 문단이 이 파일에도 그대로 적용된다.
 *
 * 색은 `currentColor` 단색 — 마크가 자기 색을 들고 오면 그것이 **세 번째 채색
 * 시스템**이 된다(`design.md` 금지).
 *
 * 크기 기본 14 는 GitHub 마크와 같은 자리에 서기 위해서다. 이 글리프는 16
 * 뷰박스 안에서 가장자리까지 쓰는 편이라 옆의 Octicon 과 광학 무게가 맞는다.
 */
const X_MARK_16 =
  'M12.6.75h2.454l-5.36 6.142L16 15.25h-4.937l-3.867-5.07-4.425 5.07H.316l5.733-6.57L0 .75h5.063l3.495 4.633L12.6.75Zm-.86 13.028h1.36L4.323 2.145H2.865l8.875 11.633Z';

export interface XMarkProps
  extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height' | 'viewBox' | 'children'> {
  /** 렌더 크기(px), 정사각형. 기본 14 — GitHub 마크와 같은 광학 무게. */
  size?: number;
}

export function XMark({ size = 14, ...rest }: XMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      focusable="false"
      {...rest}
    >
      <path data-mark-part="x" d={X_MARK_16} />
    </svg>
  );
}
