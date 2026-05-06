import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import type { Category } from '@/entities/category';
import {
  isProjectRecentlyUpdated,
  type Project,
} from '@/entities/project';
import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from '@/entities/knowledge-graph';
import { INDIGO_HUB } from '@/shared/config/indigo-tokens';
import {
  isMeaningfulOntologyKind,
  pickDominantOntologyKind,
  type MeaningfulOntologyKind,
  type OntologyCountsForProject,
} from '@/shared/lib/ontology-tree';
import { ontologyBorderTone } from './ontology-tone';
import { resolveTopologyPalette } from './topology-palette';

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
  /**
   * R14: Topology ↔ Ontology 연계. true 면 이 노드가 project 가 아니라
   * ontology 의 도메인/역량/요소 노드 (frontmatter `kind: domain | capability
   * | element` 등). degree-기반 size scaling 과 owner overlay 등 project
   * 전용 처리에서 제외하기 위한 분기 플래그.
   */
  isOntology?: boolean;
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
const NODE_OUTER_HALO = 'rgba(0, 0, 0, 0)'; // 비허브는 halo 없음 (투명)

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
    /**
     * R13 #70 — runtime diff highlight. polling 으로 방금 들어온 (또는
     * 갱신된) project slug 들. 이 set 안의 노드는 calendar-time 기준의
     * recentlyUpdated 와 OR — 그래서 매우 오래 전 만든 노드여도 사용자가
     * 방금 .md 를 추가했으면 pulse. 기본 비어있음 = 기존 동작 유지.
     */
    runtimeRecentSlugs?: ReadonlySet<string>;
    /**
     * Topology ↔ Ontology 연계. nodes/edges 가 주어지면 project 노드 집합
     * 에 ontology 의 도메인·역량·요소 노드와 그 사이 관계 (contains /
     * depends_on / describes / related_to 등) 를 함께 그래프에 넣는다.
     * `kind === 'project'` 인 ontology 노드는 이미 위에서 추가된 project
     * 와 중복되므로 skip. project↔ontology containment 도 같은 id 의
     * project 가 graph 안에 있으면 자연스럽게 엣지가 이어진다.
     */
    ontologyExtension?: {
      nodes: readonly KnowledgeGraphNode[];
      edges: readonly KnowledgeGraphEdge[];
    };
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

  // Layer 0 컨테이너 시스템 폐기 후 모든 토폴로지가 단일 layer —
  // Hub 가 primary anchor 로 forceLabel 노출.

  // build 시점 테마 팔레트. 토글 후엔 SigmaTopology 의 mutation observer 가
  // 그래프 attr 을 새 팔레트 값으로 다시 바르고 sigma.refresh() 한다.
  const palette = resolveTopologyPalette();

  // 고립 노드가 카테고리 앵커에 남아 튕겨 나오지 않도록 모든 seed를 작은
  // 원반 안에서 시작. 카테고리별 분리는 edge + gravity가 만들어 낸다.
  projects.forEach((project, index) => {
    const theta = jitter(index) * Math.PI * 2;
    const r = jitter(index + 7) * 40;
    const recent =
      isProjectRecentlyUpdated(project, 7) ||
      options?.runtimeRecentSlugs?.has(project.slug) === true;

    // O-9b: 일반 project 노드 (hub 제외) 만 ontology 도미넌트 kind 에 따라
    // borderColor 분기. fill 은 분기 안 함 — 헌장 "허브만 유일한 채색" +
    // "size 변동 최소" 정책.
    const isPlainProject = !project.isHub;
    const ontologyCounts = isPlainProject
      ? options?.ontologyCountsBySlug?.get(project.slug)
      : undefined;
    const ontologyKind = pickDominantOntologyKind(ontologyCounts);
    const ontologyTone = ontologyBorderTone(ontologyKind);

    graph.addNode(project.slug, {
      x: Math.cos(theta) * r,
      y: Math.sin(theta) * r,
      // 크기 위계: Hub 10 → Node 5.5. 2nd pass 에서 degree 스케일 미세 조정.
      size: project.isHub ? 10 : 5.5,
      label: shortenName(project.name),
      // Hub 는 forceLabel — 토폴로지 상시 노출 anchor. Node 는 threshold 로
      // 점진 노출.
      forceLabel: project.isHub,
      recentlyUpdated: recent,
      color: project.isHub ? HUB_COLOR : toneForSlug(project.slug),
      borderColor: project.isHub
        ? palette.hubBorder
        : ontologyTone?.borderColor ?? palette.nodeBorder,
      outerBorderColor: project.isHub ? palette.hubOuterHalo : NODE_OUTER_HALO,
      projectSlug: project.slug,
      categoryId: project.category ?? '',
      isHub: Boolean(project.isHub),
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
        // node → hub 는 "소속" 관계 (contains). 그 외는 같은 레벨 의존성.
        const isContainsRelation =
          project.isHub === false && depProject?.isHub === true;
        graph.addEdge(project.slug, dep, {
          // 두께 기본값 — degree 가중은 아래 2nd pass에서 적용
          size: hubToHub ? 0.9 : 0.5,
          color: palette.edge,
          kind: isContainsRelation ? 'contains' : 'depends-on',
          curvature: hubToHub ? 0.28 : 0.08,
        });
      }
    }
  }

  // R14: Topology ↔ Ontology 연계. project 외의 도메인/역량/요소 노드와
  // 그 관계를 같은 그래프에 추가해 토폴로지가 "vault 의 ontology 전체 지도"
  // 가 되도록. project 와 같은 id 가 ontology 안에 또 있으면 (kind:project)
  // skip. degree-scaling / owner overlay 는 isOntology=true 분기로 제외.
  const ext = options?.ontologyExtension;
  if (ext) {
    ext.nodes.forEach((node, idx) => {
      // project kind 는 이미 위에서 project 로 추가됐다 — 같은 id 면 skip.
      if (node.kind === 'project' || graph.hasNode(node.id)) return;
      // narrow string → MeaningfulOntologyKind. 'document' / 그 외 unknown
      // string 은 'unknown' 으로 묶어 amber tone 노출.
      const kind: MeaningfulOntologyKind = isMeaningfulOntologyKind(node.kind)
        ? node.kind
        : 'unknown';
      const tone = ontologyBorderTone(kind);
      // project 들이 원점 근처 (~r 40) 에 모여있으니 ontology 노드는 외곽
      // (r 90~140) 에 배치 → settleLayout 이 두 집합을 부드럽게 섞어준다.
      const theta = jitter(idx + 1000) * Math.PI * 2;
      const r = 90 + jitter(idx + 2000) * 50;
      graph.addNode(node.id, {
        x: Math.cos(theta) * r,
        y: Math.sin(theta) * r,
        // ontology 노드는 project leaf (4.5) 보다 작게 — 시각적 위계 보존.
        size: 3.5,
        label: node.title,
        forceLabel: false,
        recentlyUpdated: false,
        // 흐린 무채색 fill — 헌장의 "허브만 유일한 채색" 과 충돌 안 함.
        color: 'rgba(160, 168, 184, 0.55)',
        borderColor: tone?.borderColor ?? palette.nodeBorder,
        outerBorderColor: NODE_OUTER_HALO,
        // SigmaTopology 의 click handler 가 projectSlug 를 키로 drawer 를
        // 여는데, ontology 노드는 project 가 아니므로 drawer 가 빈 상태가
        // 된다 — 일단 id 를 그대로 박아두고 후속 단계에서 ontology 전용
        // 핸들링을 추가한다 (TODO: ontology 노드 클릭 시 vault md 열기).
        projectSlug: node.id,
        categoryId: 'ontology',
        isHub: false,
        ownerKey: 'unassigned',
        description: node.summary,
        ontologyTopKind: kind,
        isOntology: true,
      });
    });
    for (const edge of ext.edges) {
      // 양 끝이 모두 그래프에 있어야 — project 만 있고 ontology 노드 추가
      // 시 skip 된 'project' kind 노드 등이 from/to 에 있으면 자연스럽게
      // 누락되거나 (없는 경우) project 끼리 이어진다.
      if (!graph.hasNode(edge.from) || !graph.hasNode(edge.to)) continue;
      if (edge.from === edge.to) continue;
      if (graph.hasEdge(edge.from, edge.to)) continue;
      // KnowledgeEdgeType (7종) → SigmaEdgeAttrs.kind (4종) 매핑.
      const kind: SigmaEdgeAttrs['kind'] =
        edge.type === 'contains' || edge.type === 'belongs_to'
          ? 'contains'
          : edge.type === 'describes'
            ? 'knowledge'
            : 'depends-on';
      graph.addEdge(edge.from, edge.to, {
        // ontology 엣지는 project↔project dependencies 보다 가늘게 — 메인
        // 의존 골격이 시야에서 사라지지 않도록.
        size: 0.35,
        color: palette.edge,
        kind,
        curvature: 0.06,
      });
    }
  }

  // degree 기반 크기 재계산 — 연결이 많을수록 커진다.
  // Hub: 10 → 13, Node: 4.5 → 7.5. 화면 픽셀 기준 ~2x 일관 비율.
  // ontology 노드는 base 3.5 를 유지하되 degree 영향은 약하게.
  graph.forEachNode((id, attrs) => {
    const degree = graph.degree(id);
    if (attrs.isHub) {
      graph.setNodeAttribute(
        id,
        'size',
        10 + Math.min(3, Math.log2(Math.max(1, degree)) * 0.8),
      );
    } else if (attrs.isOntology) {
      graph.setNodeAttribute(
        id,
        'size',
        3.5 + Math.min(2, Math.log2(Math.max(1, degree)) * 0.4),
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

