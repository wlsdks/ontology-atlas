/**
 * 히어로 밴드 "미니 도메인 지도" — landing 계기 문법의 수출. 장식이 아니라
 * 실카운트(역량+요소)에서 나온 SVG geometry. 순수 함수라 DOM/SVG 없이
 * 단위 test 가능 — 렌더러(`MiniDomainMap.tsx`)는 이 결과를 그대로 그린다.
 *
 * 배치: 중심(프로젝트) 둘레에 N 개 도메인을 타원 위에 고르게(각 -90도 =
 * 정오 위부터 시계방향) 분산. 6개 고정이던 mockup 과 달리 도메인 개수가
 * 몇 개든(1~N) 일반화한다.
 *
 * 크기: `18 + sqrt(total) * 3.4` 폭. **순서 인코딩이지 비례 인코딩이 아니다** —
 * `+18` 바닥이 있으므로 면적은 total 에 비례하지 않는다. 실측(2026-07-26
 * 도그푸드): total 114 vs 7 은 데이터 비 16.3배인데 면적 비는 4.05배(Tufte
 * lie factor 0.25)다. 그래서 캡션도 「비례」가 아니라 「많이 담긴 도메인이 더
 * 크게」라고 말한다(`minimapSublabel`) — 캡션이 약속이고, 이 그림이 지킬 수
 * 있는 약속은 순서까지다.
 *
 * 바닥을 없애 진짜 비례로 가지 않는 이유는 읽힘이다. `+18` 을 빼면 total 7 이
 * 9.0×5.1px, total 1 이 3.4×1.9px 로 그려져 도메인 표시가 점이 되고 이름을
 * 걸 자리가 사라진다. 반대로 작은 쪽을 지금 크기로 유지하며 비례를 맞추면
 * total 114 가 68×38px 이 되어 430×168 프레임의 타원 배치에서 이웃 노드·라벨과
 * 충돌한다. 이 프레임에서 "읽히는 최솟값 + 참된 비례" 는 동시에 성립하지 않는다.
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
