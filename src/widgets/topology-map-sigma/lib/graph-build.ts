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
import { pickOverviewLandmarks } from './label-lod';
import {
  isContainmentRelation,
  isMeaningfulOntologyKind,
  pickDominantOntologyKind,
  type MeaningfulOntologyKind,
  type OntologyCountsForProject,
} from '@/shared/lib/ontology-tree';
import {
  ontologyBorderTone,
  ontologyFillTone,
  ONTOLOGY_NODE_SIZE_BY_KIND,
  type TopologyOntologyKind,
} from './ontology-tone';
import { resolveTopologyPalette, applyLeafFillSaturate } from './topology-palette';
import { compactOntologyDescription } from '@/shared/lib/ontology-description';

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
  /**
   * 검색 필터 hot-path 최적화 — `${projectSlug}\n${label}` 를 build 시 1회
   * 소문자화해 둔다. nodeReducer / edgeReducer 가 매 프레임 (라이브 검색 중
   * 물리 시뮬레이션이 돌면 60fps) 모든 노드의 label·slug 를 toLowerCase 로
   * 재계산하던 비용 (N×2 문자열 할당/프레임) 을 제거. 구분자 `\n` 는 사용자
   * 쿼리에 등장하지 않아 cross-boundary false-positive 가 없다. 빌드 외 경로
   * (테스트 fixture 등) 에서 비어있으면 matchesSearch 가 label/slug 로 폴백.
   */
  searchText?: string;
  categoryId: string;
  isHub: boolean;
  /** Sigma label grid 우회 — true면 zoom/density 무관 항상 라벨 렌더. 허브에 적용. */
  forceLabel?: boolean;
  /**
   * degree 최상위 N개 랜드마크 — overview(전체 축소)에서도 *항상* 라벨. 줌아웃
   * 시 앵커마저 솎여 라벨 0(익명 점) 이 되는 걸 막아 방향감 보장. `label-lod`
   * 의 pickOverviewLandmarks 로 선정.
   */
  overviewLandmark?: boolean;
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
  ontologyTopKind?: TopologyOntologyKind;
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
  /**
   * User-facing relation key for analysis surfaces. `kind` is the Sigma render
   * grouping; this keeps the ontology/frontmatter relation meaning available
   * for Path mode and tooltips.
   */
  relationType?: string;
  /** @sigma/edge-curve — 0=직선, 0.3=뚜렷한 커브. 허브-위성은 0.08, 허브-허브
   * 는 0.28로 관계 층위를 시각화. */
  curvature?: number;
  /** Sigma reducer에서 hover/focus edge layering을 조정할 때 사용. */
  zIndex?: number;
}

const HUB_COLOR = INDIGO_HUB;
// R+ 사용자 비전: "은하계의 별처럼 / 별자리처럼". 비허브 노드에도 outer
// halo 로 light bloom 효과 → 작은 dot 가 별처럼 빛남. 톤은 light/dark
// 분기 — palette.nodeOuterHalo. dark: 흐릿한 푸른 dust, light: 어두운
// graphite (흰 배경 회귀 차단).

/**
 * ontology 노드가 forceLabel = true 로 승격되는 degree 기준.
 * 5 = 한 노드가 다른 노드 5 이상에 연결됨 → "이 도메인/역량 안에 뭔가 많다"
 * 신호. 이 임계 미만은 fingerprint 기여가 작아 hover 라벨로 충분.
 */
const ONTOLOGY_LABEL_DEGREE = 5;

/**
 * Project slug-prefix fallback tones. This is nominal data: when a vault has
 * no ontology extension yet, users still need visibly different clusters
 * instead of near-neutral dots. Keep these categorical and test-separated; the
 * ontology kind palette remains the primary semantic color source once the
 * graph contains project/domain/capability/element nodes.
 */
export const TOPOLOGY_DOMAIN_TONE: Record<string, string> = {
  frontend: 'rgba(37, 99, 235, 0.92)',
  backend: 'rgba(249, 115, 22, 0.92)',
  data: 'rgba(6, 182, 212, 0.92)',
  ml: 'rgba(168, 85, 247, 0.92)',
  mobile: 'rgba(34, 197, 94, 0.92)',
  infra: 'rgba(234, 179, 8, 0.92)',
  security: 'rgba(239, 68, 68, 0.93)',
  observability: 'rgba(100, 116, 139, 0.92)',
  devops: 'rgba(99, 102, 241, 0.92)',
  'internal-tools': 'rgba(236, 72, 153, 0.92)',
  docs: 'rgba(132, 204, 22, 0.92)',
};
const NODE_COLOR_DEFAULT = 'rgba(168, 178, 198, 0.82)';

function toneForSlug(slug: string): string {
  for (const key of Object.keys(TOPOLOGY_DOMAIN_TONE)) {
    if (slug.startsWith(`${key}-`)) return TOPOLOGY_DOMAIN_TONE[key];
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
    /**
     * 변경점(changeset) baseline 대비 added/changed 된 노드 id 집합. 여기 든
     * 노드는 recentlyUpdated 로 표시돼 기존 pulse 로 시각 강조된다(회의·리뷰에서
     * "기준 이후 바뀐 개념"). 비어있으면 기존 동작 유지.
     */
    changedSlugs?: ReadonlySet<string>;
  },
): Graph<SigmaNodeAttrs, SigmaEdgeAttrs> {
  const graph = new Graph<SigmaNodeAttrs, SigmaEdgeAttrs>({ type: 'directed', multi: false });
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const prefix = options?.stripNamePrefix?.trim() ?? '';
  const prefixWithSep = prefix ? `${prefix} · ` : '';
  const shortenName = (name: string): string => {
    if (!prefixWithSep || !name.startsWith(prefixWithSep)) {
      return compactGraphLabel(name);
    }
    const rest = name.slice(prefixWithSep.length).trim();
    return compactGraphLabel(rest.length > 0 ? rest : name);
  };

  // Layer 0 컨테이너 시스템 폐기 후 모든 토폴로지가 단일 layer —
  // Hub 가 primary anchor 로 forceLabel 노출.

  // build 시점 테마 팔레트. 토글 후엔 SigmaTopology 의 mutation observer 가
  // 그래프 attr 을 새 팔레트 값으로 다시 바르고 sigma.refresh() 한다.
  const palette = resolveTopologyPalette();

  // 고립 노드가 카테고리 앵커에 남아 튕겨 나오지 않도록 모든 seed를 작은
  // 원반 안에서 시작. 카테고리별 분리는 edge + gravity가 만들어 낸다.
  const ext = options?.ontologyExtension;
  const showsOntologyKinds = ext !== undefined;

  projects.forEach((project, index) => {
    const theta = jitter(index) * Math.PI * 2;
    const r = jitter(index + 7) * 40;
    const recent =
      isProjectRecentlyUpdated(project, 7) ||
      options?.runtimeRecentSlugs?.has(project.slug) === true ||
      options?.changedSlugs?.has(project.slug) === true;

    // O-9b: 일반 project 노드 (hub 제외) 만 ontology 도미넌트 kind 에 따라
    // borderColor 분기. fill 은 분기 안 함 — 헌장 "허브만 유일한 채색" +
    // "size 변동 최소" 정책.
    const isPlainProject = !project.isHub;
    const ontologyCounts = isPlainProject
      ? options?.ontologyCountsBySlug?.get(project.slug)
      : undefined;
    const dominantOntologyKind = pickDominantOntologyKind(ontologyCounts);
    const projectOntologyKind: TopologyOntologyKind | null =
      showsOntologyKinds && isPlainProject ? 'project' : dominantOntologyKind;
    const ontologyTone = ontologyBorderTone(projectOntologyKind);

    const projectLabel = shortenName(project.name);
    graph.addNode(project.slug, {
      x: Math.cos(theta) * r,
      y: Math.sin(theta) * r,
      // 크기 위계: Hub 13 → Node 5.5 (cycle 47 — Obsidian/Logseq 스타일,
      // hub vs leaf 명확한 시각 차이로 \"별 + 위성\" 메타포 강화). 2nd pass
      // 에서 degree 스케일 미세 조정.
      size: project.isHub ? 13 : 5.5,
      label: projectLabel,
      // Hub 는 forceLabel — 토폴로지 상시 노출 anchor. Node 는 threshold 로
      // 점진 노출.
      forceLabel: project.isHub,
      recentlyUpdated: recent,
      color: project.isHub
        ? HUB_COLOR
        : showsOntologyKinds
          ? ontologyFillTone('project')
          : applyLeafFillSaturate(toneForSlug(project.slug), palette.leafFillSaturate),
      borderColor: project.isHub
        ? palette.hubBorder
        : ontologyTone?.borderColor ?? palette.nodeBorder,
      outerBorderColor: project.isHub ? palette.hubOuterHalo : palette.nodeOuterHalo,
      projectSlug: project.slug,
      searchText: buildSearchText(project.slug, projectLabel),
      categoryId: project.category ?? '',
      isHub: Boolean(project.isHub),
      ownerKey: project.owner?.trim() || 'unassigned',
      description: compactOntologyDescription(project.description),
      statusId: project.status,
      tags: project.tags.length > 0 ? project.tags : undefined,
      ontologyTopKind: projectOntologyKind ?? undefined,
    });
  });
  // categoryById는 외부 확장용으로 유지 (현재 seed는 사용하지 않지만
  // 향후 "카테고리별 섹터" 배치가 필요할 때 재활용)
  void categoryById;

  // slug → project 룩업 1회 빌드. 아래 이중 루프에서 dep 마다
  // projects.find (O(P)) 를 돌면 O(P²·D) — 대형 프로젝트 그래프에서 매
  // 그래프 재빌드 시 누적. Map.get (O(1)) 으로 O(P·D) 로 낮춘다.
  // 중복 slug 시 projects.find 는 *첫* 항목을 반환하므로 Map 도 첫 항목만
  // 유지(set-if-absent)해 동작을 정확히 보존한다. `new Map(entries)` 는
  // 마지막 항목을 남겨 find 와 갈라지므로 쓰지 않는다.
  const projectBySlug = new Map<string, (typeof projects)[number]>();
  for (const p of projects) {
    if (!projectBySlug.has(p.slug)) projectBySlug.set(p.slug, p);
  }
  for (const project of projects) {
    for (const dep of project.dependencies) {
      if (graph.hasNode(dep) && dep !== project.slug && !graph.hasEdge(project.slug, dep)) {
        const depProject = projectBySlug.get(dep);
        const hubToHub = project.isHub && depProject?.isHub === true;
        // node → hub 는 "소속" 관계 (contains). 그 외는 같은 레벨 의존성.
        const isContainsRelation =
          project.isHub === false && depProject?.isHub === true;
        graph.addEdge(project.slug, dep, {
          // 두께 기본값 — degree 가중은 아래 2nd pass에서 적용
          size: hubToHub ? 0.9 : 0.5,
          color: palette.edge,
          kind: isContainsRelation ? 'contains' : 'depends-on',
          relationType: isContainsRelation ? 'contains' : 'depends_on',
          // R+ stick-bug fix: non-hub 의 0.08 도 거의 직선 → 0.14. hub-hub
          // 의 0.28 은 그대로 (메인 의존 골격 강조).
          curvature: hubToHub ? 0.28 : 0.14,
        });
      }
    }
  }

  // R14: Topology ↔ Ontology 연계. project 외의 도메인/역량/요소 노드와
  // 그 관계를 같은 그래프에 추가해 토폴로지가 "vault 의 ontology 전체 지도"
  // 가 되도록. project 와 같은 id 가 ontology 안에 또 있으면 (kind:project)
  // skip. degree-scaling / owner overlay 는 isOntology=true 분기로 제외.
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
      const ontologyLabel = compactGraphLabel(node.title);
      graph.addNode(node.id, {
        x: Math.cos(theta) * r,
        y: Math.sin(theta) * r,
        // kind 별 size 차등. domain > capability > element. 색상 구분이 약한
        // 환경에서도 위계를 읽을 수 있게 색 + 크기 + 범례를 함께 쓴다.
        size: ONTOLOGY_NODE_SIZE_BY_KIND[kind],
        label: ontologyLabel,
        forceLabel: false,
        recentlyUpdated: options?.changedSlugs?.has(node.id) === true,
        // kind 별 fill — 좌하단 "색의 의미" 범례와 실제 노드 본체를 맞춘다.
        // topology 는 데이터 시각화 surface 이므로 주변 chrome 보다 명확한
        // colorblind-safe hue 분리를 허용한다.
        color: ontologyFillTone(kind),
        borderColor: tone?.borderColor ?? palette.nodeBorder,
        outerBorderColor: palette.nodeOuterHalo,
        // projectSlug 는 SigmaTopology click handler 의 노드 식별 키. ontology
        // 노드는 project 가 아니라 자기 id 를 그대로 키로 쓰고, 소비 view
        // (HomePage — `/` 와 `/topology` 둘 다 렌더)가 그 선택을
        // TopologyOntologyDrawer 로 라우팅한다: 도메인/관계/설명 in-place 편집 +
        // builder/ontology/source 링크 + reach·impact. ("vault md 열기" 는
        // resolveTopologyNodeEditTarget 로 구현 완료 — 과거 TODO 해소됨.)
        projectSlug: node.id,
        searchText: buildSearchText(node.id, ontologyLabel),
        categoryId: 'ontology',
        isHub: false,
        ownerKey: 'unassigned',
        description: compactOntologyDescription(node.summary),
        ontologyTopKind: kind,
        isOntology: true,
      });
    });
    // ontology 노드 id 는 `project:slug` prefixed 인데 토폴로지의 project 노드는
    // bare slug (renderProjects 출처) — prefixed 가 그래프에 없으면 bare 로 해석해
    // project↔domain contains spine 이 drop 되지 않게 한다.
    const resolveEndpoint = (id: string): string => {
      if (graph.hasNode(id)) return id;
      if (id.startsWith('project:')) {
        const bare = id.slice('project:'.length);
        if (graph.hasNode(bare)) return bare;
      }
      return id;
    };
    for (const edge of ext.edges) {
      const from = resolveEndpoint(edge.from);
      const to = resolveEndpoint(edge.to);
      // 양 끝이 모두 그래프에 있어야 — project 만 있고 ontology 노드 추가
      // 시 skip 된 'project' kind 노드 등이 from/to 에 있으면 자연스럽게
      // 누락되거나 (없는 경우) project 끼리 이어진다.
      if (!graph.hasNode(from) || !graph.hasNode(to)) continue;
      if (from === to) continue;
      if (graph.hasEdge(from, to)) continue;
      // KnowledgeEdgeType (7종) → SigmaEdgeAttrs.kind (4종) 매핑.
      const kind: SigmaEdgeAttrs['kind'] =
        isContainmentRelation(edge.type)
          ? 'contains'
          : edge.type === 'describes'
            ? 'knowledge'
            : 'depends-on';
      graph.addEdge(from, to, {
        // ontology 엣지는 project↔project dependencies 보다 가늘게 — 메인
        // 의존 골격이 시야에서 사라지지 않도록. R+ stick-bug 후속: 0.35 →
        // 0.28 로 더 얇게.
        size: 0.28,
        color: palette.edge,
        kind,
        relationType: edge.type,
        // R+ 사용자 피드백: zoom out 시 거의 직선 (0.06) 이 "대벌레 다리"
        // 격자 시각의 한 원인. 살짝 더 휘게 (0.14) — 노드 클러스터 사이가
        // organic 한 흐름. project hub-hub 의 0.28 보다 약함 (메인 의존
        // 골격이 여전히 두드러지게).
        curvature: 0.14,
      });
    }
  }

  // degree 기반 크기 재계산 — 연결이 많을수록 커진다.
  // Hub: 10 → 13, Node: 4.5 → 7.5. 화면 픽셀 기준 ~2x 일관 비율.
  // ontology 노드는 base 3.5 를 유지하되 degree 영향은 약하게.
  //
  // forceLabel 정책 (R+ usability):
  //   - domain kind → 항상 라벨. 트리 최상위라 navigation 앵커.
  //   - 기타 ontology 노드 → degree ≥ ONTOLOGY_LABEL_DEGREE 이면 라벨.
  //     "어디가 hub-like 인지" 한 눈에 보여 사용자가 80 노드 그래프에서
  //     fingerprint 잡을 수 있게. element 처럼 1~2 edge 인 leaf 는 hover 의존.
  graph.forEachNode((id, attrs) => {
    const degree = graph.degree(id);
    if (attrs.isHub) {
      graph.setNodeAttribute(
        id,
        'size',
        10 + Math.min(3, Math.log2(Math.max(1, degree)) * 0.8),
      );
    } else if (attrs.isOntology) {
      // kind 별 base size (ONTOLOGY_NODE_SIZE_BY_KIND) + degree 가중.
      // 색상 외에도 domain/capability/element 위계가 보이도록 degree 영향은
      // 약하게 유지한다.
      const kind = attrs.ontologyTopKind;
      const base = kind && ONTOLOGY_NODE_SIZE_BY_KIND[kind] !== undefined
        ? ONTOLOGY_NODE_SIZE_BY_KIND[kind]
        : 3.5;
      graph.setNodeAttribute(
        id,
        'size',
        base + Math.min(2, Math.log2(Math.max(1, degree)) * 0.4),
      );
      const isDomain = attrs.ontologyTopKind === 'domain';
      const isHighDegree = degree >= ONTOLOGY_LABEL_DEGREE;
      if (isDomain || isHighDegree) {
        graph.setNodeAttribute(id, 'forceLabel', true);
      }
    } else {
      graph.setNodeAttribute(
        id,
        'size',
        4.5 + Math.min(3, Math.log2(Math.max(1, degree)) * 0.6),
      );
    }
  });

  // overview 랜드마크 — degree 최상위 N개를 줌 무관 항상-라벨로 flag. 줌아웃
  // 하면 앵커마저 솎여 라벨이 0(익명 점)이 되는데, 그러면 "Atlas 보기만 해도
  // 구조 파악" 이 깨진다. 최상위 hub 만 남겨 overview 에 최소 방향감을 준다.
  const overviewLandmarks = pickOverviewLandmarks(
    graph.mapNodes((id) => ({ id, degree: graph.degree(id) })),
  );
  for (const id of overviewLandmarks) {
    graph.setNodeAttribute(id, 'overviewLandmark', true);
  }

  // 엣지 두께 degree 가중 — source/target 중 작은 쪽 degree 기반.
  // ontology edge 는 수백 개가 한 화면에 깔리므로 기본 상태에선 배경 증거선
  // 수준으로 제한한다. 선택/focus/path reducer 가 필요한 관계만 전경으로
  // 승격하므로, 전체 지도는 노드 구조가 먼저 읽혀야 한다.
  graph.forEachEdge((edgeId, attrs, source, target) => {
    const weight = Math.min(graph.degree(source), graph.degree(target));
    const sourceAttrs = graph.getNodeAttributes(source);
    const targetAttrs = graph.getNodeAttributes(target);
    const ontologyEdge = sourceAttrs.isOntology === true || targetAttrs.isOntology === true;
    const base = ontologyEdge ? 0.18 : 0.3;
    const maxBoost = ontologyEdge
      ? attrs.kind === 'contains'
        ? 0.42
        : 0.62
      : 1.8;
    const step = ontologyEdge ? 0.12 : 0.35;
    const scaled = base + Math.min(maxBoost - base, Math.log2(Math.max(1, weight)) * step);
    graph.setEdgeAttribute(edgeId, 'size', Math.max(attrs.size, scaled));
  });

  return graph;
}

/**
 * 검색 필터용 정규화 텍스트 — slug 와 label 을 `\n` 으로 이어 1회 소문자화.
 * matchesSearch 가 `includes(query)` 한 번으로 두 필드를 동시에 검사하게 한다.
 */
function buildSearchText(slug: string, label: string): string {
  return `${slug}\n${label}`.toLowerCase();
}

function compactGraphLabel(label: string): string {
  const stripped = label.replace(/\s*\(.*$/, "").trim();
  return stripped.length > 0 ? stripped : label;
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
