import type { SVGProps } from 'react';

/**
 * ontology-atlas 브랜드 마크 — "헥사 별자리" (후보 A, 확정 2026-07-18).
 *
 * 헥사곤 외곽(프로젝트 노드) + 꼭짓점 6개(그래프 노드) + 스포크(관계) + 중심
 * 앰버 허브(허브 캐패빌리티 — design.md 의 "Hub 노드에만 보조 톤 허용" 규칙과
 * 동일 의미). 대형에서는 별자리 그래프로, 소형(`detail="compact"`, ≤24px
 * 권장 — 파비콘/네비 레일 로고)에서는 스포크·꼭짓점을 생략해 헥사곤 외곽 +
 * 앰버 허브만 남긴다. 좌표 출처: `docs/prototypes/app-icon-concepts.html`
 * (후보 A, 48px 마스터 + 20px 축소판).
 *
 * 인디고 라인/꼭짓점은 `currentColor` 로 상속 — 호출부가 텍스트 색으로
 * 마크를 톤다운/강조할 수 있다 (네비 레일 아이콘처럼 hover 시 밝아지는 등).
 * 앰버 허브만 고정 브랜드 상수 — SVG 정적 파일(파비콘 등)에는 CSS 변수가
 * 닿지 않으므로 이 컴포넌트도 같은 고정값을 쓴다.
 */
export const BRAND_MARK_AMBER = '#d4b478';

const HEXAGON_PATH = 'M24 7 L38.7 15.5 L38.7 32.5 L24 41 L9.3 32.5 L9.3 15.5 Z';

const VERTICES: ReadonlyArray<readonly [number, number]> = [
  [24, 7],
  [38.7, 15.5],
  [38.7, 32.5],
  [24, 41],
  [9.3, 32.5],
  [9.3, 15.5],
];

const CENTER = 24;

export interface BrandMarkProps
  extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height' | 'viewBox' | 'children'> {
  /** 렌더 크기(px), 정사각형. 기본 24. */
  size?: number;
  /** "full" (기본) = 스포크+꼭짓점+허브 · "compact" = 헥사곤 외곽+허브만 (≤24px 권장). */
  detail?: 'full' | 'compact';
}

export function BrandMark({
  size = 24,
  detail = 'full',
  'aria-label': ariaLabel = 'ontology-atlas',
  ...rest
}: BrandMarkProps) {
  const isFull = detail === 'full';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label={ariaLabel}
      {...rest}
    >
      {isFull ? (
        <g stroke="currentColor" strokeOpacity={0.55} strokeWidth={1.1}>
          {VERTICES.map(([x, y]) => (
            <line
              key={`spoke-${x}-${y}`}
              data-mark-part="spoke"
              x1={x}
              y1={y}
              x2={CENTER}
              y2={CENTER}
            />
          ))}
        </g>
      ) : null}
      <path
        data-mark-part="hexagon"
        d={HEXAGON_PATH}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.75}
        strokeWidth={isFull ? 1.1 : 2.6}
      />
      {isFull ? (
        <g fill="currentColor">
          {VERTICES.map(([x, y]) => (
            <circle key={`vertex-${x}-${y}`} data-mark-part="vertex" cx={x} cy={y} r={2} />
          ))}
        </g>
      ) : null}
      <circle
        data-mark-part="hub"
        cx={CENTER}
        cy={CENTER}
        r={isFull ? 3.2 : 5.5}
        fill={BRAND_MARK_AMBER}
      />
    </svg>
  );
}
