/**
 * 히어로 밴드 "미니 도메인 지도" — landing 계기 문법의 수출. 장식이 아니라
 * 실카운트(역량+요소)에 비례한 정직한 SVG geometry. 순수 함수라 DOM/SVG 없이
 * 단위 test 가능 — 렌더러(`MiniDomainMap.tsx`)는 이 결과를 그대로 그린다.
 *
 * 배치: 중심(프로젝트) 둘레에 N 개 도메인을 타원 위에 고르게(각 -90도 =
 * 정오 위부터 시계방향) 분산. 6개 고정이던 mockup 과 달리 도메인 개수가
 * 몇 개든(1~N) 일반화한다.
 *
 * 크기: `18 + sqrt(total) * 3.4` 폭 — mockup 의 sqrt 스케일과 동일 공식.
 * sqrt 를 쓰는 이유는 area(면적)가 total 에 비례하게 하기 위해서(선형 폭이면
 * 큰 도메인이 지나치게 압도).
 */
export interface MiniDomainMapInput {
  id: string;
  title: string;
  total: number;
}

export interface MiniDomainMapNode {
  id: string;
  title: string;
  total: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 입력 순서상 첫 번째(호출자가 이미 total desc 로 정렬해 넘긴다) — 강조색. */
  isTop: boolean;
}

export interface MiniDomainMapLayout {
  width: number;
  height: number;
  center: { x: number; y: number };
  nodes: MiniDomainMapNode[];
}

export interface BuildMiniDomainMapLayoutOptions {
  width?: number;
  height?: number;
}

const DEFAULT_WIDTH = 430;
const DEFAULT_HEIGHT = 168;
const PADDING = 34;

export function buildMiniDomainMapLayout(
  domains: readonly MiniDomainMapInput[],
  options: BuildMiniDomainMapLayoutOptions = {},
): MiniDomainMapLayout {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const center = { x: width / 2, y: height / 2 };
  const rx = width / 2 - PADDING;
  const ry = height / 2 - PADDING;

  const nodes: MiniDomainMapNode[] = domains.map((domain, index) => {
    const angleDeg = domains.length === 0 ? 0 : (index * 360) / domains.length - 90;
    const angleRad = (angleDeg * Math.PI) / 180;
    const x = center.x + rx * Math.cos(angleRad);
    const y = center.y + ry * Math.sin(angleRad);
    const nodeWidth = 18 + Math.sqrt(Math.max(0, domain.total)) * 3.4;
    const nodeHeight = nodeWidth * 0.56;
    return {
      id: domain.id,
      title: domain.title,
      total: domain.total,
      x,
      y,
      width: nodeWidth,
      height: nodeHeight,
      isTop: index === 0,
    };
  });

  return { width, height, center, nodes };
}
