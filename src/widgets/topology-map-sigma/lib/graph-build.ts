import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import type { Category } from '@/entities/category';
import { isProjectRecentlyUpdated, type Project } from '@/entities/project';
import { INDIGO_HUB } from '@/shared/config/indigo-tokens';
import {
  pickDominantOntologyKind,
  type MeaningfulOntologyKind,
  type OntologyCountsForProject,
} from '@/shared/lib/ontology-tree';
import { ontologyBorderTone } from './ontology-tone';

export interface SigmaNodeAttrs {
  x: number;
  y: number;
  size: number;
  label: string;
  color: string;
  /** @sigma/node-border용 테두리 색. 배경 대비를 위한 바깥쪽 얇은 링. */
  borderColor: string;
  /** 더 바깥쪽의 halo 링. 허브는 인디고 α 0.15 로 "중력감", 일반 노드는
   *  transparent. 선택 시 nodeReducer 가 α 를 올려 선택 halo 역할도 겸함. */
  outerBorderColor: string;
  projectSlug: string;
  categoryId: string;
  isHub: boolean;
  /** Sigma label grid 우회 — true면 zoom/density 무관 항상 라벨 렌더. 허브에 적용. */
  forceLabel?: boolean;
  /** 최근 N일 이내 업데이트 여부 — pulse 효과 대상. */
  recentlyUpdated?: boolean;
  /** owner slug 또는 unassigned. overlay tint 에서 owner 해시 색 매핑에 사용. */
  ownerKey: string;
  /** 툴팁 리치 표시용 메타. 렌더엔 안 쓰지만 hover 시 DOM 카드에서 참조. */
  description?: string;
  statusId?: string;
  tags?: string[];
  /** Sigma 기본 드래그 강조용 플래그. 런타임에 set/remove 된다. */
  highlighted?: boolean;
  /** reducer에서 라벨 숨김용. 드래그·dim 시 임시로 지운다. */
  zIndex?: number;
  /**
   * O-9b: project 노드에 매달린 ontology 의 도미넌트 kind.
   * tooltip / aria 에서 한국어 라벨로 표시. border 색은 build 단계에서 이미
   * 결정되므로 reducer 는 변경 없음. 미정 (`undefined`) 이면 ontology 0 또는
   * 비-project 노드 (container / hub).
   */
  ontologyTopKind?: MeaningfulOntologyKind;
}

export interface SigmaEdgeAttrs {
  size: number;
  color: string;
  /**
   * 엣지 관계 종류:
   * - `contains`: 소속 관계 (hub → container, node → hub). 계층 시각화.
   * - `depends-on`: cross-project 의존성. 동일 레벨 엔티티 간 관계.
   * - `referenced-by`: 역참조 (아직 미사용 예약).
   * - `knowledge`: extraction 결과로 파생된 관계 (아직 미사용 예약).
   */
  kind?: 'contains' | 'depends-on' | 'referenced-by' | 'knowledge';
  /** @sigma/edge-curve — 0=직선, 0.3=뚜렷한 커브. 허브-위성은 0.08, 허브-허브
   * 는 0.28로 관계 층위를 시각화. */
  curvature?: number;
}

const HUB_COLOR = INDIGO_HUB;
const HUB_BORDER = 'rgba(139, 151, 255, 0.55)';
const HUB_OUTER_HALO = 'rgba(139, 151, 255, 0.08)';
const NODE_BORDER = 'rgba(200, 210, 230, 0.3)';
const NODE_OUTER_HALO = 'rgba(0, 0, 0, 0)'; // 비허브는 halo 없음 (투명)
const EDGE_COLOR = 'rgba(170, 185, 210, 0.08)';

// 워크스페이스 맵(Layer 0) 의 컨테이너 노드 — 인디고 hub 와 명확히 구분되는
// 웜 앰버/샌드. 디자인 시스템의 "단일 인디고" 원칙을 Layer 1(프로젝트 내부)
// 에서 유지하되, Layer 0 에서는 계층 구분을 위해 보조 강조 한 색 허용.
const CONTAINER_CATEGORY_SENTINEL = '__container__';
const CONTAINER_COLOR = '#d4b478';                         // 웜 앰버
const CONTAINER_BORDER = 'rgba(224, 196, 140, 0.62)';
const CONTAINER_OUTER_HALO = 'rgba(224, 196, 140, 0.10)';

/**
 * 디자인 시스템이 색 추가를 금지(무채색 + 단일 인디고)하므로 도메인 구분은
 * 회색 luminance + 아주 옅은 tint 로 표현. 채도는 최대 ~6% 로 유지해 "무채색
 * 계열" 범위를 깨지 않되 slug prefix 로 도메인 클러스터를 구분할 수 있도록.
 */
const DOMAIN_TONE: Record<string, string> = {
  frontend: 'rgba(166, 180, 210, 0.9)',     // 블루 쪽으로 미세
  backend: 'rgba(204, 198, 178, 0.9)',      // 웜 쪽으로 미세
  data: 'rgba(160, 180, 190, 0.9)',         // 틸 쪽으로 미세
  ml: 'rgba(192, 178, 206, 0.9)',           // 라일락 쪽으로 미세
  mobile: 'rgba(176, 192, 184, 0.9)',       // 민트 쪽으로 미세
  infra: 'rgba(204, 206, 186, 0.9)',        // 샌드 쪽으로 미세
  security: 'rgba(198, 176, 176, 0.92)',    // 소프트 red 미세
  observability: 'rgba(206, 210, 220, 0.9)',// 쿨 그레이
  devops: 'rgba(166, 186, 198, 0.9)',       // 블루 그레이
  'internal-tools': 'rgba(198, 192, 216, 0.9)', // 라벤더 쪽
  docs: 'rgba(180, 184, 160, 0.9)',         // 올리브 쪽
};
const NODE_COLOR_DEFAULT = 'rgba(168, 178, 198, 0.82)';

function toneForSlug(slug: string): string {
  for (const key of Object.keys(DOMAIN_TONE)) {
    if (slug.startsWith(`${key}-`)) return DOMAIN_TONE[key];
  }
  return NODE_COLOR_DEFAULT;
}

/**
 * owner tint overlay 전용 7색 팔레트 — 채도 ≤ 8% 범위로 무채색 계열을 유지하되
 * luminance 와 미세 hue 로 owner 간 구분감만 만든다. 디자인 시스템의 단일
 * 인디고 원칙을 깨지 않기 위해 인디고 계열은 포함하지 않는다.
 */
const OWNER_TONE_PALETTE: readonly string[] = [
  'rgba(168, 178, 198, 0.88)', // 쿨 그레이
  'rgba(200, 194, 180, 0.88)', // 웜 샌드
  'rgba(176, 190, 190, 0.88)', // 틸 그레이
  'rgba(190, 180, 200, 0.88)', // 라일락 그레이
  'rgba(184, 196, 186, 0.88)', // 민트 그레이
  'rgba(198, 184, 180, 0.88)', // 로즈 그레이
  'rgba(186, 194, 206, 0.88)', // 블루 그레이
];

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function toneForOwnerKey(ownerKey: string): string {
  if (!ownerKey || ownerKey === 'unassigned') {
    // 담당자 미지정은 가장 흐리게 — 시각적으로 빠져 보이게.
    return 'rgba(128, 132, 140, 0.55)';
  }
  return OWNER_TONE_PALETTE[hashString(ownerKey) % OWNER_TONE_PALETTE.length];
}

function jitter(seed: number) {
  const x = Math.sin(seed * 9973.7) * 10000;
  return x - Math.floor(x);
}

/**
 * names 배열에서 모두가 공유하는 "첫 단어" brand prefix 를 감지.
 * 예: ["Demo IAM", "Demo Knowledge", "Demo Observability"] → "Demo".
 * 안 맞는 게 하나라도 있으면 '' 반환.
 */
function detectBrandPrefix(names: string[]): string {
  if (names.length < 2) return '';
  const firstWord = names[0].split(' ')[0];
  if (!firstWord) return '';
  for (const name of names) {
    if (!name.startsWith(firstWord + ' ') && name !== firstWord) return '';
  }
  return firstWord;
}

export function buildGraph(
  projects: Project[],
  categories: Category[],
  options?: {
    /**
     * Layer 1 에서 현재 컨테이너 이름 prefix 를 label 에서 제거하기 위한 값.
     * 예: "Demo Reactor" 내부에서는 "Demo Reactor · Router" → "Router".
     * undefined/빈 문자열이면 원본 project.name 그대로 사용 (Layer 0 동작).
     */
    stripNamePrefix?: string;
    /**
     * O-9b: project slug → ontology kind 카운트 map. 일반 project 노드
     * (container / hub 아님) 의 borderColor 를 ontology 도미넌트 kind 별로
     * 분기. `undefined` 이면 모두 NODE_BORDER (현행 무채색) 그대로.
     * Layer 0 의 satellite hub 와 container 는 ontology 분기 적용 안 함
     * (워크스페이스 보기는 `WorkspaceOntologyStrip` 가 이미 신호 — 이중 신호
     * 방지). 일반 project 만 받음.
     */
    ontologyCountsBySlug?: Map<string, OntologyCountsForProject>;
  },
): Graph<SigmaNodeAttrs, SigmaEdgeAttrs> {
  const graph = new Graph<SigmaNodeAttrs, SigmaEdgeAttrs>({ type: 'directed', multi: false });
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const prefix = options?.stripNamePrefix?.trim() ?? '';
  const prefixWithSep = prefix ? `${prefix} · ` : '';
  const shortenName = (name: string): string => {
    if (!prefixWithSep || !name.startsWith(prefixWithSep)) return name;
    const rest = name.slice(prefixWithSep.length).trim();
    return rest.length > 0 ? rest : name;
  };

  // Layer 감지 — Container 가 있으면 Layer 0 (Workspace 지도), 없으면
  // Layer 1 (컨테이너 내부). Layer 0 에선 Container 만 forceLabel 로 고정
  // 노출, Hub/Node 는 hover/선택/근접 줌에서만 라벨 노출 (사용자 요청:
  // "각 프로젝트만 이름이 나오고 나머지는 확장했을 때랑 마우스 올렸을 때만").
  // Layer 1 에선 containers 가 없으므로 Hub 가 primary anchor → Hub
  // forceLabel 유지.
  const hasContainers = projects.some(
    (p) => p.category === CONTAINER_CATEGORY_SENTINEL,
  );

  // Container 공통 brand prefix 감지 — 모든 container 이름이 같은 접두어 +
  // 공백 으로 시작하면 해당 접두어를 label 에서 제거해 공간 절약 ("Demo
  // Observability" → "Observability"). tooltip/drawer/검색 은 full name
  // 유지. 3개 미만 이면 축약 의미 없으므로 skip.
  const containerNames = projects
    .filter((p) => p.category === CONTAINER_CATEGORY_SENTINEL)
    .map((p) => p.name);
  const brandPrefix =
    containerNames.length >= 3 ? detectBrandPrefix(containerNames) : '';
  const stripContainerBrand = (name: string): string => {
    if (!brandPrefix) return name;
    const brandWithSpace = `${brandPrefix} `;
    if (!name.startsWith(brandWithSpace)) return name;
    const rest = name.slice(brandWithSpace.length).trim();
    return rest.length > 0 ? rest : name;
  };

  // 고립 노드가 카테고리 앵커에 남아 튕겨 나오지 않도록 모든 seed를 작은
  // 원반 안에서 시작. 카테고리별 분리는 edge + gravity가 만들어 낸다.
  projects.forEach((project, index) => {
    const theta = jitter(index) * Math.PI * 2;
    const r = jitter(index + 7) * 40;
    const recent = isProjectRecentlyUpdated(project, 7);
    const isContainer = project.category === CONTAINER_CATEGORY_SENTINEL;
    // Layer 0 에서 hub 는 "컨테이너 주변 위성" 으로 축소 — 수백개가 동시에
    // 큰 원으로 찍혀 환공포증 유발하던 문제 해소. 크기 3, alpha 0.3 로
    // 존재감만 남기고 시선은 container 쪽에 쏠리게. focus/hover 시엔
    // nodeReducer 가 size·color 를 원복해 다시 보인다.
    const isLayer0Hub = hasContainers && project.isHub;

    // O-9b: 일반 project 노드 (container / hub / Layer 0 satellite hub 제외)
    // 만 ontology 도미넌트 kind 에 따라 borderColor 분기. fill 은 분기 안 함
    // — 헌장 "허브만 유일한 채색" + "size 변동 최소" 정책.
    const isPlainProject = !isContainer && !project.isHub;
    const ontologyCounts = isPlainProject
      ? options?.ontologyCountsBySlug?.get(project.slug)
      : undefined;
    const ontologyKind = pickDominantOntologyKind(ontologyCounts);
    const ontologyTone = ontologyBorderTone(ontologyKind);

    graph.addNode(project.slug, {
      x: Math.cos(theta) * r,
      y: Math.sin(theta) * r,
      // 크기 위계: Container 10 → Hub 10 → Node 5.5. 2nd pass 에서
      // degree 스케일로 미세 조정. 이전엔 container 20 으로 과도하게 커
      // 노란 원이 화면을 지배했고, satellite hub (3) 와 비율도 ~7:1 로
      // 과함 (사용자 피드백). container 를 절반 (10~13) 으로 축소해
      // 전체 균형 개선 — hub 와 같은 사이즈 범위에서 amber 색으로 위계 구분.
      size: isContainer ? 10 : isLayer0Hub ? 3 : project.isHub ? 10 : 5.5,
      // Container 는 brand prefix 축약 ("Demo Observability" → "Observability")
      // 으로 라벨 공간 절약. project.name 은 attrs 의 label 만 단축하므로
      // drawer/tooltip/검색 등은 여전히 full name 으로 조회됨.
      label: isContainer
        ? stripContainerBrand(project.name)
        : shortenName(project.name),
      // Layer 0 (hasContainers=true): Container 만 forceLabel, Hub 는 hover/
      //   선택/확대 시에만 라벨 (labelRenderedSizeThreshold 보조).
      // Layer 1 (hasContainers=false): 기존대로 Hub 가 forceLabel.
      // Node 는 어느 Layer 에서도 threshold 로 점진 노출 (forceLabel false).
      forceLabel: isContainer || (!hasContainers && project.isHub),
      recentlyUpdated: recent,
      color:
        project.category === CONTAINER_CATEGORY_SENTINEL
          ? CONTAINER_COLOR
          : isLayer0Hub
            ? 'rgba(139, 151, 255, 0.32)'
            : project.isHub
              ? HUB_COLOR
              : toneForSlug(project.slug),
      borderColor:
        project.category === CONTAINER_CATEGORY_SENTINEL
          ? CONTAINER_BORDER
          : isLayer0Hub
            ? 'rgba(139, 151, 255, 0.18)'
            : project.isHub
              ? HUB_BORDER
              : ontologyTone?.borderColor ?? NODE_BORDER,
      outerBorderColor:
        project.category === CONTAINER_CATEGORY_SENTINEL
          ? CONTAINER_OUTER_HALO
          : project.isHub
            ? HUB_OUTER_HALO
            : NODE_OUTER_HALO,
      projectSlug: project.slug,
      categoryId: project.category,
      isHub: project.isHub,
      ownerKey: project.owner?.trim() || 'unassigned',
      description: project.description || undefined,
      statusId: project.status,
      tags: project.tags.length > 0 ? project.tags : undefined,
      ontologyTopKind: ontologyKind ?? undefined,
    });
  });
  // categoryById는 외부 확장용으로 유지 (현재 seed는 사용하지 않지만
  // 향후 "카테고리별 섹터" 배치가 필요할 때 재활용)
  void categoryById;

  for (const project of projects) {
    for (const dep of project.dependencies) {
      if (graph.hasNode(dep) && dep !== project.slug && !graph.hasEdge(project.slug, dep)) {
        const depProject = projects.find((p) => p.slug === dep);
        const hubToHub = project.isHub && depProject?.isHub === true;
        // 대상이 container 카테고리면 "소속" 관계 (hub → container, node → hub).
        // 그 외는 같은 레벨 엔티티 간 cross-project 의존성 (depends-on).
        const isContainsRelation =
          depProject?.category === CONTAINER_CATEGORY_SENTINEL ||
          (project.isHub === false && depProject?.isHub === true);
        graph.addEdge(project.slug, dep, {
          // 두께 기본값 — degree 가중은 아래 2nd pass에서 적용
          size: hubToHub ? 0.9 : 0.5,
          color: EDGE_COLOR,
          kind: isContainsRelation ? 'contains' : 'depends-on',
          curvature: hubToHub ? 0.28 : 0.08,
        });
      }
    }
  }

  // degree 기반 크기 재계산 — 연결이 많을수록 커진다.
  // Container: 20 → 26 (고정 ~20 에 degree 부스트), Hub: 10 → 13, Node: 4.5 → 7.5.
  // 화면 픽셀 기준 Container > Hub > Node 가 ~2x, ~2x 의 일관된 비율이 되도록.
  graph.forEachNode((id, attrs) => {
    const degree = graph.degree(id);
    const isContainer = attrs.categoryId === CONTAINER_CATEGORY_SENTINEL;
    const isLayer0Hub = hasContainers && attrs.isHub;
    if (isContainer) {
      // 절반 축소: 10 → 13 (degree 가중). hub 와 거의 같은 사이즈
      // 범위지만 amber 색 + 중앙 위치로 충분히 구분.
      graph.setNodeAttribute(
        id,
        'size',
        10 + Math.min(3, Math.log2(Math.max(1, degree)) * 0.9),
      );
    } else if (isLayer0Hub) {
      // Layer 0 위성 — degree 스케일 최소만. 3 ~ 4.5 사이 유지해 환공포증
      // 재현 없이도 "연결 많은 허브는 살짝 커 보임" 이라는 시그널만.
      graph.setNodeAttribute(
        id,
        'size',
        3 + Math.min(1.5, Math.log2(Math.max(1, degree)) * 0.35),
      );
    } else if (attrs.isHub) {
      graph.setNodeAttribute(
        id,
        'size',
        10 + Math.min(3, Math.log2(Math.max(1, degree)) * 0.8),
      );
    } else {
      graph.setNodeAttribute(
        id,
        'size',
        4.5 + Math.min(3, Math.log2(Math.max(1, degree)) * 0.6),
      );
    }
  });

  // 엣지 두께 degree 가중 — source/target 중 작은 쪽 degree 기반. 0.3 ~ 1.8
  // 범위로 log 스케일. 허브-허브는 이미 0.9 기본이라 weight 만큼 추가.
  graph.forEachEdge((edgeId, attrs, source, target) => {
    const weight = Math.min(graph.degree(source), graph.degree(target));
    const scaled = 0.3 + Math.min(1.5, Math.log2(Math.max(1, weight)) * 0.35);
    graph.setEdgeAttribute(edgeId, 'size', Math.max(attrs.size, scaled));
  });

  return graph;
}

/**
 * 초기 settle: 글로벌 optimization이 필요하므로 중력·linLog 켬. 한번만 돌려서
 * 전체 그래프를 깔끔하게 퍼뜨린다.
 */
const SETTLE_SETTINGS = {
  slowDown: 1,
  gravity: 2,
  strongGravityMode: true,
  linLogMode: true,
  scalingRatio: 14,
  outboundAttractionDistribution: true,
  barnesHutOptimize: true,
  barnesHutTheta: 0.5,
  adjustSizes: true,
  edgeWeightInfluence: 0.6,
} as const;

export function settleLayout(
  graph: Graph<SigmaNodeAttrs, SigmaEdgeAttrs>,
  iterations: number,
) {
  if (graph.order === 0) return;
  const settings = forceAtlas2.inferSettings(graph);
  forceAtlas2.assign(graph, {
    iterations,
    settings: { ...settings, ...SETTLE_SETTINGS },
  });
}

