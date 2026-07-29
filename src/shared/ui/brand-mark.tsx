import type { SVGProps } from 'react';

/**
 * ontology-atlas 브랜드 마크 — "겹 육각형" (소유자 확정 2026-07-29, 카운슬
 * 집행 사양). **이 파일이 좌표의 단일 진실원이고**, OS 아이콘·파비콘·마스터
 * SVG 는 전부 여기서 파생된다.
 *
 * 구조가 제품의 층위를 그대로 말한다: 바깥 육각형(프로젝트 경계) → 스포크로
 * 이어진 노드 3개(주요 도메인) → 중간 육각형 → 핵(핵심 온톨로지). 그 사이의
 * 점선 층은 탐색 경로다.
 *
 * ## 획의 강약이 이 마크의 정체다
 *
 * 바깥 18 · 중간 13 · 핵 19 — **핵이 가장 굵고 중간이 가장 얇다.** 1차 구현이
 * 이 위계를 뒤집어(중간 18 · 핵 15) 그렸더니 겹의 리듬이 무너져 "이상한데"가
 * 나왔다. 원본을 픽셀로 잰 값이 그대로 여기 있고, **정리한답시고 균일화하지
 * 않는다** — 균일화가 정확히 1차 실패의 원인이었다.
 *
 * 기하는 정육각형으로 폈다(원본 생성 이미지는 세로로 2.7% 늘어나 있었다).
 * 그건 부산물이지 의도가 아니고, 작은 크기에서 찌그러짐만 커진다.
 *
 * ## 크기 사다리 — 작을수록 층을 지운다
 *
 * `full`(≥64px) 전부 · `compact`(20~48px) 바깥+중간+노드 · `micro`(≤18px)
 * 바깥 + 속 채운 핵. 16px 에서 겹 윤곽 두 개를 그리면 잉크가 뭉쳐 육각형이라는
 * 것조차 안 읽힌다.
 *
 * 축약형의 노드는 중간 육각형 **꼭짓점 위에 박혀** 있다 — 떠 있는 점 3개는
 * 흔한 분자 아이콘이 되고, 그게 폐기된 1차 축약형의 실패였다.
 */

/** 512 좌표계 — 모든 자산이 이 뷰박스를 공유한다. */
export const BRAND_MARK_VIEWBOX = 512;

/** 브랜드 그라디언트 — 인디고 단일 hue 램프(원본 시트 실측). */
export const BRAND_GRADIENT_FROM = '#787EF6';
export const BRAND_GRADIENT_TO = '#3E4BDF';
/** 그라디언트를 못 쓰는 자리(단색 파비콘 등)의 대체값 — 시트 명기 브랜드 컬러. */
export const BRAND_MARK_SOLID = '#5E6AD2';

const OUTER_HEX = 'M 256 56 L 429.2 156 L 429.2 356 L 256 456 L 82.8 356 L 82.8 156 Z';
const DASHED_HEX = 'M 256 100 L 391.1 178 L 391.1 334 L 256 412 L 120.9 334 L 120.9 178 Z';
const MID_HEX = 'M 256 144 L 353 200 L 353 312 L 256 368 L 159 312 L 159 200 Z';
/** 핵 — R=48. 이 마크에서 가장 굵은 선이다. */
const CORE_HEX = 'M 256 208 L 297.6 232 L 297.6 280 L 256 304 L 214.4 280 L 214.4 232 Z';
/** 미형 전용 — 윤곽 대신 속을 채우는 핵. R=88. */
const MICRO_CORE = 'M 256 168 L 332.2 212 L 332.2 300 L 256 344 L 179.8 300 L 179.8 212 Z';

/** 스포크 = 바깥 꼭짓점 → 중간 꼭짓점. 굵기는 중간 육각형과 같은 계조(13). */
const SPOKES: ReadonlyArray<readonly [number, number, number, number]> = [
  [256, 56, 256, 144],
  [429.2, 356, 353, 312],
  [82.8, 356, 159, 312],
];

/** 노드 — 중간 육각형의 −90° · 30° · 150° 꼭짓점. 전체형·축약형이 같은 자리를 쓴다. */
export const BRAND_MARK_NODES: ReadonlyArray<readonly [number, number]> = [
  [256, 144],
  [353, 312],
  [159, 312],
];

/** 획 두께 — 원본 실측. 균일화 금지(위 주석). */
export const BRAND_STROKES = {
  outer: 18,
  dashed: 6,
  mid: 13,
  core: 19,
  spoke: 13,
  node: 23,
  compactOuter: 36,
  compactMid: 28,
  compactNode: 42,
  microOuter: 44,
} as const;

/** 점선 층 — 짧은 대시가 아니라 **원형 점**이다(원본은 촘촘한 점). */
export const BRAND_DASH_ARRAY = '0.1 16';

export type BrandMarkDetail = 'full' | 'compact' | 'micro';

export interface BrandMarkProps
  extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height' | 'viewBox' | 'children'> {
  /** 렌더 크기(px), 정사각형. 기본 24. */
  size?: number;
  /** "full"(≥64px) · "compact"(20~48px, 기본) · "micro"(≤18px). */
  detail?: BrandMarkDetail;
}

export function BrandMark({
  size = 24,
  detail = 'compact',
  'aria-label': ariaLabel = 'ontology-atlas',
  ...rest
}: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${BRAND_MARK_VIEWBOX} ${BRAND_MARK_VIEWBOX}`}
      role="img"
      aria-label={ariaLabel}
      {...rest}
    >
      {detail === 'micro' ? (
        <>
          <path
            data-mark-part="hexagon"
            d={OUTER_HEX}
            fill="none"
            stroke="currentColor"
            strokeWidth={BRAND_STROKES.microOuter}
            strokeLinejoin="round"
          />
          <path data-mark-part="core" d={MICRO_CORE} fill="currentColor" />
        </>
      ) : (
        <>
          <g fill="none" stroke="currentColor" strokeLinejoin="round" strokeLinecap="round">
            <path
              data-mark-part="hexagon"
              d={OUTER_HEX}
              strokeWidth={detail === 'full' ? BRAND_STROKES.outer : BRAND_STROKES.compactOuter}
            />
            {detail === 'full' ? (
              <path
                data-mark-part="path-layer"
                d={DASHED_HEX}
                strokeWidth={BRAND_STROKES.dashed}
                strokeDasharray={BRAND_DASH_ARRAY}
                strokeOpacity={0.62}
              />
            ) : null}
            <path
              data-mark-part="mid"
              d={MID_HEX}
              strokeWidth={detail === 'full' ? BRAND_STROKES.mid : BRAND_STROKES.compactMid}
            />
            {detail === 'full' ? (
              <>
                <path data-mark-part="core" d={CORE_HEX} strokeWidth={BRAND_STROKES.core} />
                {SPOKES.map(([x1, y1, x2, y2]) => (
                  <line
                    key={`spoke-${x1}-${y1}`}
                    data-mark-part="spoke"
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    strokeWidth={BRAND_STROKES.spoke}
                  />
                ))}
              </>
            ) : null}
          </g>
          <g fill="currentColor">
            {BRAND_MARK_NODES.map(([cx, cy]) => (
              <circle
                key={`node-${cx}-${cy}`}
                data-mark-part="node"
                cx={cx}
                cy={cy}
                r={detail === 'full' ? BRAND_STROKES.node : BRAND_STROKES.compactNode}
              />
            ))}
          </g>
        </>
      )}
    </svg>
  );
}
