import type { Category } from '@/entities/category/model';
import type { KnowledgeDocument } from '@/entities/knowledge-document/model';
import type { Project } from '@/entities/project/model';
import type { Status } from '@/entities/status/model';
import type { WorkspaceProject } from '@/entities/workspace-project/model';
import { generateDemoBlueprint } from './demo-blueprint';

// 엔티티 DEFAULT_STATUSES 의 순수 값 복제. shared 가 entities 의 runtime value 를
// 참조하면 FSD 레이어가 역행하므로 여기서 동일 데이터를 정의한다. entity 쪽
// 기본 상태는 firestore seeding 용이고, demo-data 용 상태는 데모 dataset 용.
// 값이 벌어지면 demo UI 와 실 UI 가 달라지니 양쪽 변경 시 같이 맞출 것.
const DEMO_DEFAULT_STATUSES: Omit<Status, 'createdAt' | 'updatedAt'>[] = [
  { id: 'idea', label: '아이디어', labelEn: 'Idea', order: 0, dotColor: 'neutral' },
  { id: 'planning', label: '기획', labelEn: 'Planning', order: 1, dotColor: 'warning' },
  { id: 'developing', label: '개발중', labelEn: 'Developing', order: 2, dotColor: 'warning' },
  { id: 'deploy-ready', label: '배포준비', labelEn: 'Deploy Ready', order: 3, dotColor: 'warning' },
  { id: 'completed', label: '개발완료', labelEn: 'Completed', order: 4, dotColor: 'success' },
  { id: 'live', label: '운영중', labelEn: 'Live', order: 5, dotColor: 'success' },
  { id: 'paused', label: '일시중단', labelEn: 'Paused', order: 6, dotColor: 'paused' },
  { id: 'deprecated', label: '중단', labelEn: 'Deprecated', order: 7, dotColor: 'paused' },
];

export const DEMO_ACCOUNT_ID = 'demo-workspace';
const DEMO_VIEWER_EMAIL = 'demo-viewer@local';

const SEED_BASE = new Date('2025-10-01T00:00:00Z').getTime();
const NOW = new Date('2026-04-20T00:00:00Z').getTime();

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * 카테고리는 원본 DEFAULT_CATEGORIES와 **정확히 동일한 shape**을 유지한다.
 * TaxonomyProvider의 `hasRegisteredCategoryRegions`가 default와 동일하면 false를
 * 반환해 토폴로지가 "클러스터 요약" 모드가 아닌 "전체 노드 fitView" 모드로
 * 렌더된다. 그래야 의존 관계 엣지가 이어지는 유기적 허브-스포크 그래프가
 * 보인다.
 *
 * 도메인(프론트/백엔드 등)은 카테고리가 아니라 프로젝트 이름·태그·stack에만
 * 반영돼서, force 시뮬레이션이 의존 관계로 자연스럽게 클러스터를 만들어 준다.
 */
const IN_PROGRESS_CATEGORY: Omit<Category, 'createdAt' | 'updatedAt'> = {
  id: 'in-progress',
  label: '작업중',
  labelEn: 'In Progress',
  order: 0,
  position: { x: 0, y: 0 },
  size: { width: 2000, height: 1600 },
  radius: 620,
  borderStyle: 'underline',
};

const PLANNED_CATEGORY: Omit<Category, 'createdAt' | 'updatedAt'> = {
  id: 'planned',
  label: '예정',
  labelEn: 'Planned',
  order: 1,
  position: { x: -1700, y: 0 },
  size: { width: 900, height: 1200 },
  radius: 360,
  borderStyle: 'dashed',
};

// (legacy DomainProfile / DOMAIN_PROFILES 제거 — DEMO_BLUEPRINT 가 대체)

const OWNERS = [
  '플랫폼팀',
  '결제팀',
  '성장팀',
  '검색팀',
  '콘텐츠팀',
  '데이터팀',
  'SRE',
  '보안팀',
  '모바일팀',
  '디자인팀',
];

const LINK_HOSTS = ['github.com/demo', 'docs.demo.dev', 'status.demo.dev'];

function pickIntegerInRange(rng: () => number, min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function sampleUnique<T>(rng: () => number, source: readonly T[], count: number): T[] {
  const pool = [...source];
  const take = Math.min(count, pool.length);
  const out: T[] = [];
  for (let i = 0; i < take; i += 1) {
    const idx = Math.floor(rng() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

function buildCategories(): Category[] {
  const createdAt = new Date(SEED_BASE - 1000 * 60 * 60 * 24 * 30);
  const updatedAt = new Date(NOW - 1000 * 60 * 60 * 24 * 3);
  return [
    { ...IN_PROGRESS_CATEGORY, createdAt, updatedAt },
    { ...PLANNED_CATEGORY, createdAt, updatedAt },
  ];
}

function buildStatuses(): Status[] {
  return DEMO_DEFAULT_STATUSES.map((s) => ({
    ...s,
    createdAt: new Date(SEED_BASE),
    updatedAt: new Date(NOW),
  }));
}

// (legacy generateProjectSeeds 제거 — DEMO_BLUEPRINT 기반으로 buildProjects 가
// 직접 청사진 → seed list 변환을 수행)

function weightedPickStatus(rng: () => number, statuses: Status[], isHub: boolean): Status {
  if (isHub) {
    const live = statuses.find((s) => s.id === 'live');
    if (live && rng() < 0.7) return live;
    const completed = statuses.find((s) => s.id === 'completed');
    if (completed && rng() < 0.85) return completed;
  }
  const weights: Record<string, number> = {
    idea: 2,
    planning: 4,
    developing: 8,
    'deploy-ready': 4,
    completed: 5,
    live: 9,
    paused: 2,
    deprecated: 1,
  };
  const enriched = statuses.map((s) => ({ status: s, weight: weights[s.id] ?? 1 }));
  const total = enriched.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng() * total;
  for (const entry of enriched) {
    roll -= entry.weight;
    if (roll <= 0) return entry.status;
  }
  return enriched[enriched.length - 1].status;
}

/**
 * status → 라이프사이클 카테고리 매핑. idea·planning·paused·deprecated는
 * 'planned' 위성으로, 나머지 활성 상태는 메인 'in-progress' 클러스터로 보낸다.
 */
function lifecycleCategoryFor(statusId: string): 'in-progress' | 'planned' {
  switch (statusId) {
    case 'idea':
    case 'planning':
    case 'paused':
    case 'deprecated':
      return 'planned';
    default:
      return 'in-progress';
  }
}

/**
 * Fibonacci/golden-angle 원반 배치. force 시뮬레이션 seed 위치가 너무 겹치지
 * 않도록 사전 분산만 보장하고, 최종 레이아웃은 simulation이 만든다.
 */
function seedDiskPosition(
  category: Pick<Category, 'position' | 'size'>,
  index: number,
  total: number,
  rng: () => number,
) {
  const halfW = category.size.width / 2 - 80;
  const halfH = category.size.height / 2 - 80;
  const golden = 2.39996322972865332;
  const t = total > 0 ? (index + 1) / (total + 1) : 0.5;
  const radius = Math.sqrt(t);
  const theta = index * golden + rng() * 0.35;
  return {
    x: category.position.x + radius * halfW * Math.cos(theta),
    y: category.position.y + radius * halfH * Math.sin(theta),
  };
}

function buildLinks(rng: () => number, slug: string) {
  if (rng() < 0.35) return [];
  const count = pickIntegerInRange(rng, 1, 2);
  const links: { label: string; url: string }[] = [];
  for (let i = 0; i < count; i += 1) {
    const host = pick(rng, LINK_HOSTS);
    if (host.startsWith('github')) links.push({ label: 'Repo', url: `https://${host}/${slug}` });
    else if (host.startsWith('docs')) links.push({ label: 'Docs', url: `https://${host}/${slug}` });
    else links.push({ label: 'Status', url: `https://${host}/${slug}` });
  }
  return links;
}

// ─── Demo 청사진 ────────────────────────────────────────────────────────
//
// 데모를 "랜덤 합성" 이 아닌 "실제 Demo 로드맵 / 코드베이스 구조" 로 보이게
// 만든다. 4 컨테이너 × 약 5 hubs × 5–12 nodes ≈ 200 프로젝트. 이름·설명은
// 실제 우리가 만든 / 만들 시스템 이름. cross-container 의존도 명시.
//
// 새 hub/node 를 추가하려면 DEMO_BLUEPRINT 만 수정하면 됨. 분배는 자동.

interface BlueprintNode {
  slug: string;
  name: string;
  description: string;
  /** 다른 hub slug 들에 추가 의존 (cross-container 등). 기본은 자기 hub 만. */
  extraDeps?: string[];
}

interface BlueprintHub {
  slug: string;
  name: string;
  description: string;
  /** 다른 hub slug 들에 의존 (시스템 경계). */
  extraDeps?: string[];
  nodes: BlueprintNode[];
}

interface BlueprintContainer {
  id: string;
  name: string;
  description: string;
  order: number;
  hubs: BlueprintHub[];
}

const DEMO_BLUEPRINT: ReadonlyArray<BlueprintContainer> = generateDemoBlueprint();

const SLUG_TO_CONTAINER = new Map<string, string>();
for (const container of DEMO_BLUEPRINT) {
  for (const hub of container.hubs) {
    SLUG_TO_CONTAINER.set(hub.slug, container.id);
    for (const node of hub.nodes) {
      SLUG_TO_CONTAINER.set(node.slug, container.id);
    }
  }
}

function buildProjects(
  _total: number,
  categories: Category[],
  statuses: Status[],
): Project[] {
  const rng = mulberry32(0x5eed2);
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  // 청사진 → flat seed list. 4계층 (Workspace > Project > Hub > Node) 중
  // Project(=container)·Hub 소속을 seed 에 명시해 둬야 이후 Project 타입의
  // workspaceProjectId / hubSlugs 필드를 채울 수 있다.
  interface FlatSeed {
    slug: string;
    name: string;
    description: string;
    isHub: boolean;
    domainId: string; // container (=workspace project) id
    hubSlugs: string[]; // node 의 소속 hub 배열 (hub 자신은 빈 배열)
    extraDeps: string[];
  }
  const seeds: FlatSeed[] = [];
  for (const container of DEMO_BLUEPRINT) {
    for (const hub of container.hubs) {
      seeds.push({
        slug: hub.slug,
        name: hub.name,
        description: hub.description,
        isHub: true,
        domainId: container.id,
        hubSlugs: [],
        extraDeps: hub.extraDeps ?? [],
      });
      for (const node of hub.nodes) {
        seeds.push({
          slug: node.slug,
          name: node.name,
          description: node.description,
          isHub: false,
          domainId: container.id,
          hubSlugs: [hub.slug],
          extraDeps: [hub.slug, ...(node.extraDeps ?? [])],
        });
      }
    }
  }

  // 1st pass: status/lifecycle/createdAt 등 시각 다양성 결정
  const enriched = seeds.map((seed) => {
    const status = weightedPickStatus(rng, statuses, seed.isHub);
    const lifecycleId = lifecycleCategoryFor(status.id);
    const createdAt = new Date(
      SEED_BASE - pickIntegerInRange(rng, 30, 480) * 24 * 60 * 60 * 1000,
    );
    const updatedAt = new Date(NOW - pickIntegerInRange(rng, 0, 30) * 24 * 60 * 60 * 1000);
    return { seed, status, lifecycleId, createdAt, updatedAt };
  });

  // 2nd pass: lifecycle 별로 seedDiskPosition. 좌표 일관성을 위해 lifecycle
  // 안에서만 모음.
  const byLifecycle = new Map<string, typeof enriched>([
    ['in-progress', []],
    ['planned', []],
  ]);
  for (const entry of enriched) byLifecycle.get(entry.lifecycleId)!.push(entry);

  const containerToTags: Record<string, string[]> = {
    demo: ['Product', 'UI', 'Sigma', 'WebGL'],
    'demo-iam': ['Auth', 'Security', 'Identity'],
    'demo-reactor': ['AI', 'Agent', 'Eval'],
    'demo-knowledge': ['KB', 'Docs', 'Ontology'],
  };
  const containerToStack: Record<string, string[]> = {
    demo: ['TypeScript', 'React', 'Sigma.js', 'Firestore'],
    'demo-iam': ['Node.js', 'OAuth', 'JWT', 'Postgres'],
    'demo-reactor': ['Python', 'OpenAI SDK', 'Anthropic SDK', 'Pydantic'],
    'demo-knowledge': ['Gemini', 'Firestore', 'TypeScript', 'Cloud Functions'],
  };

  const projects: Project[] = [];
  for (const [lifecycleId, group] of byLifecycle) {
    const category = categoryById.get(lifecycleId)!;
    group.forEach((entry, indexInGroup) => {
      const position = seedDiskPosition(category, indexInGroup, group.length, rng);
      const tagPool = containerToTags[entry.seed.domainId] ?? [];
      const stackPool = containerToStack[entry.seed.domainId] ?? [];
      projects.push({
        accountId: DEMO_ACCOUNT_ID,
        slug: entry.seed.slug,
        name: entry.seed.name,
        nameEn: undefined,
        category: lifecycleId,
        status: entry.status.id,
        description: entry.seed.description,
        detail: undefined,
        tags:
          tagPool.length > 0
            ? sampleUnique(rng, tagPool, Math.min(2, tagPool.length))
            : [],
        stack:
          stackPool.length > 0
            ? sampleUnique(rng, stackPool, Math.min(3, stackPool.length))
            : [],
        links: buildLinks(rng, entry.seed.slug),
        dependencies: [], // 3rd pass 에서 주입
        owner: pick(rng, OWNERS),
        icon: undefined,
        screenshots: [],
        timeline: {
          startedAt: entry.createdAt,
          launchedAt:
            entry.status.id === 'live' || entry.status.id === 'completed'
              ? entry.updatedAt
              : undefined,
        },
        progress: entry.seed.isHub ? 80 + Math.floor(rng() * 15) : Math.floor(rng() * 100),
        isHub: entry.seed.isHub,
        // 4계층 부모 참조 — 데이터 계약으로 명시. legacy 폴백 없이 항상 채움.
        workspaceProjectId: entry.seed.domainId,
        hubSlugs: entry.seed.isHub ? undefined : [...entry.seed.hubSlugs],
        position,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      });
    });
  }

  // 3rd pass: 청사진의 extraDeps 를 그대로 dependencies 로 주입. node 는
  // 자기 hub 가 이미 첫 번째 항목.
  const seedBySlug = new Map(seeds.map((s) => [s.slug, s]));
  for (const project of projects) {
    const seed = seedBySlug.get(project.slug);
    if (!seed) continue;
    project.dependencies = [...new Set(seed.extraDeps)];
  }

  return projects;
}

/**
 * 데모 컨테이너 — DEMO_BLUEPRINT 에서 직접 도출. project.slug 가 어느
 * 컨테이너에 속하는지는 hash 가 아니라 청사진 매핑(SLUG_TO_CONTAINER) 로
 * deterministic.
 */
function pickContainerId(slug: string): string {
  return SLUG_TO_CONTAINER.get(slug) ?? DEMO_BLUEPRINT[0].id;
}

function buildWorkspaceProjects(): WorkspaceProject[] {
  const createdAt = new Date(SEED_BASE);
  const updatedAt = new Date(NOW);
  return DEMO_BLUEPRINT.map((container) => ({
    id: container.id,
    accountId: DEMO_ACCOUNT_ID,
    name: container.name,
    description: container.description,
    isPublic: true,
    order: container.order,
    createdAt,
    updatedAt,
  }));
}

interface DemoDataset {
  projects: Project[];
  categories: Category[];
  statuses: Status[];
  documents: KnowledgeDocument[];
  workspaceProjects: WorkspaceProject[];
}

let cache: DemoDataset | null = null;

/**
 * 데모 세션용 지식 문서. **모든 허브 11개** + **비허브 중 degree 높은 40개** 에
 * 대해 생성해 UI 에서 문서 리스트가 비어 보이는 상황을 최소화. 실제 extraction/
 * publish 체인은 없지만 document list 자체는 바로 보여준다.
 */
function buildDocuments(projects: Project[]): KnowledgeDocument[] {
  const docs: KnowledgeDocument[] = [];
  const kinds = ['spec', 'adr', 'workflow'] as const;
  const statuses: KnowledgeDocument['status'][] = [
    'draft',
    'reviewing',
    'published',
  ];
  const jobStatuses = ['queued', 'running', 'succeeded'];
  const labelByKind: Record<string, string> = {
    spec: '명세',
    adr: '결정 기록',
    workflow: '운영 흐름',
  };

  // 모든 허브 + 참조 많은 상위 비허브도 포함. 참조 수 = reverseDeps 계산.
  const reverseDegree = new Map<string, number>();
  for (const project of projects) {
    for (const dep of project.dependencies) {
      reverseDegree.set(dep, (reverseDegree.get(dep) ?? 0) + 1);
    }
  }
  const hubs = projects.filter((p) => p.isHub);
  const topNonHubs = projects
    .filter((p) => !p.isHub)
    .slice()
    .sort((a, b) => (reverseDegree.get(b.slug) ?? 0) - (reverseDegree.get(a.slug) ?? 0))
    .slice(0, 40);
  const docTargets = [...hubs, ...topNonHubs];

  docTargets.forEach((project, idx) => {
    // 허브는 3~5개, 비허브는 1~2개.
    const count = project.isHub ? 3 + (idx % 3) : 1 + (idx % 2);
    for (let i = 0; i < count; i += 1) {
      const kind = kinds[(idx + i) % kinds.length];
      const status = statuses[(idx + i) % statuses.length];
      const jobStatus = jobStatuses[(idx + i) % jobStatuses.length];
      const titleSuffix = labelByKind[kind] ?? '문서';
      const docId = `${project.slug}-doc-${i + 1}`;
      const createdDaysAgo = Math.max(2, 60 - idx - i * 3);
      const updatedDaysAgo = Math.max(0, createdDaysAgo - 5 - i);
      docs.push({
        id: docId,
        accountId: DEMO_ACCOUNT_ID,
        title: `${project.name} ${titleSuffix}`,
        kind,
        projectIds: [project.slug],
        sourceType: i === 0 ? 'upload' : 'manual',
        currentVersionId: `${docId}-v1`,
        formatScore: 0.72 + i * 0.05,
        status,
        latestJobStatus: jobStatus,
        createdAt: new Date(NOW - createdDaysAgo * 24 * 60 * 60 * 1000),
        updatedAt: new Date(NOW - updatedDaysAgo * 24 * 60 * 60 * 1000),
        createdBy: DEMO_VIEWER_EMAIL,
      });
    }
  });
  return docs;
}

// 사용자 요구 범위(300–700)에서 중간값. Sigma 기반 /map은 1500노드 stress
// test에서도 60fps 유지 확인 — 이 수치는 시각적 풍성함과 카드 모드에서도
// 그나마 덜 꽉찬 밸런스 지점.
const DEFAULT_PROJECT_COUNT = 500;

export function getDemoDataset(): DemoDataset {
  if (cache) return cache;
  const categories = buildCategories();
  const statuses = buildStatuses();
  const projects = buildProjects(DEFAULT_PROJECT_COUNT, categories, statuses);
  const documents = buildDocuments(projects);
  const workspaceProjects = buildWorkspaceProjects();
  cache = {
    projects,
    categories,
    statuses,
    documents,
    workspaceProjects,
  };
  return cache;
}

export function getDemoProjects(accountId?: string | null): Project[] {
  const normalized = accountId?.trim() ?? null;
  const dataset = getDemoDataset();
  if (!normalized || normalized === DEMO_ACCOUNT_ID) return dataset.projects;
  return [];
}

export function getDemoProject(slug: string, accountId?: string | null): Project | null {
  const list = getDemoProjects(accountId);
  return list.find((project) => project.slug === slug) ?? null;
}

export function getDemoCategories(): Category[] {
  return getDemoDataset().categories;
}

export function getDemoStatuses(): Status[] {
  return getDemoDataset().statuses;
}

export function getDemoKnowledgeDocumentsByProject(
  projectSlug: string,
): KnowledgeDocument[] {
  return getDemoDataset().documents.filter((doc) =>
    doc.projectIds.includes(projectSlug),
  );
}

export function getAllDemoKnowledgeDocuments(): KnowledgeDocument[] {
  return getDemoDataset().documents;
}

export function getDemoWorkspaceProjects(
  accountId?: string | null,
): WorkspaceProject[] {
  const normalized = accountId?.trim() ?? null;
  if (normalized && normalized !== DEMO_ACCOUNT_ID) return [];
  return getDemoDataset().workspaceProjects;
}

/**
 * 컨테이너 안의 hub/node 후보 (= 데모 flat projects 중 hash 분배로 이 컨테이너
 * 에 속한 것들). 4-layer zoom-in 단계 시각화용.
 */
export function getDemoProjectsForContainer(
  accountId: string | null | undefined,
  projectId: string | null | undefined,
): Project[] {
  const normalized = accountId?.trim() ?? null;
  if (normalized && normalized !== DEMO_ACCOUNT_ID) return [];
  const targetId = projectId?.trim() || 'general';
  return getDemoDataset().projects.filter(
    (project) => pickContainerId(project.slug) === targetId,
  );
}

/**
 * 컨테이너별 hub/node 카운트 + cross-container 의존 weight.
 * zoom-out view 의 컨테이너 노드 크기·간 엣지 시각화에 사용.
 */
export interface DemoContainerStats {
  containerId: string;
  hubs: number;
  nodes: number;
  /** 이 컨테이너의 project 들이 다른 컨테이너의 project 를 의존하는 횟수. */
  depsToContainers: Map<string, number>;
}

let containerStatsCache: Map<string, DemoContainerStats> | null = null;

export function getDemoContainerStats(
  accountId?: string | null,
): Map<string, DemoContainerStats> {
  const normalized = accountId?.trim() ?? null;
  if (normalized && normalized !== DEMO_ACCOUNT_ID) return new Map();
  if (containerStatsCache) return containerStatsCache;

  const stats = new Map<string, DemoContainerStats>();
  for (const container of DEMO_BLUEPRINT) {
    let hubs = 0;
    let nodes = 0;
    for (const hub of container.hubs) {
      hubs += 1;
      nodes += hub.nodes.length;
    }
    stats.set(container.id, {
      containerId: container.id,
      hubs,
      nodes,
      depsToContainers: new Map(),
    });
  }

  // cross-container 의존 카운트
  for (const project of getDemoDataset().projects) {
    const fromContainer = pickContainerId(project.slug);
    const fromStats = stats.get(fromContainer);
    if (!fromStats) continue;
    for (const depSlug of project.dependencies) {
      const toContainer = pickContainerId(depSlug);
      if (toContainer === fromContainer) continue;
      fromStats.depsToContainers.set(
        toContainer,
        (fromStats.depsToContainers.get(toContainer) ?? 0) + 1,
      );
    }
  }

  containerStatsCache = stats;
  return stats;
}
