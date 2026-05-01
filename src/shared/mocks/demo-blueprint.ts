/**
 * DEMO 데모 blueprint 생성기.
 *
 * Phase 1.5 슬림 (PRODUCT-DIRECTION v2): 21 → 6 컨테이너, hub/node count 도
 * 축소. mission "온톨로지 first" 정렬 — 토폴로지가 dense 노드 자랑이 아니라
 * 비개발자가 인식 가능한 도메인 6 개로.
 *
 * 6 컨테이너 × 평균 3 hub × 평균 3 node ≈ ~50 프로젝트 + ~18 hub.
 * 각 컨테이너에는 ontology metadata (capabilities · elements) 가 명시되어
 * `/ontology` 페이지에서 의미 있는 트리가 보이도록.
 */

interface BlueprintNode {
  slug: string;
  name: string;
  description: string;
  extraDeps?: string[];
}

interface BlueprintHub {
  slug: string;
  name: string;
  description: string;
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

// 각 컨테이너 테마 — 실제 플랫폼 도메인으로 felt-real 유지.
// `capabilities` / `elements` 는 `/ontology` 의 ontology 노드로 렌더되어
// 토폴로지 (의존도 그래프) 와 ontology (개념 트리) 두 시각이 모두 살아 보임.
export interface ContainerTheme {
  id: string;
  name: string;
  description: string;
  hubCount: number;
  /** 이 컨테이너 첫 hub 가 다른 컨테이너 hub 에 의존 (system boundary). */
  crossDepFrom?: string;
  /** ontology — 이 도메인이 다루는 capabilities (사용자 가치). */
  capabilities: ReadonlyArray<string>;
  /** ontology — 이 도메인이 사용하는 elements (구체 element/component). */
  elements: ReadonlyArray<string>;
}

export const CONTAINER_THEMES: ReadonlyArray<ContainerTheme> = [
  {
    id: 'demo',
    name: 'Demo Workbench',
    description: 'oh-my-ontology 본 제품 — 토폴로지 + 트리 + ERD 빌더.',
    hubCount: 4,
    capabilities: ['ontology 시각화', 'vault 동기', '검색', '빌더 캔버스'],
    elements: ['Sigma.js', 'xyflow', 'IndexedDB', 'Next.js'],
  },
  {
    id: 'demo-iam',
    name: 'Demo IAM',
    description: '인증·세션·권한 인프라.',
    hubCount: 3,
    capabilities: ['이메일 로그인', 'Google OAuth', '비밀번호 재설정', '세션 추적'],
    elements: ['Firebase Auth', 'JWT', 'refresh token'],
  },
  {
    id: 'demo-knowledge',
    name: 'Demo Knowledge',
    description: '문서 파이프라인 + 온톨로지 빌더 + 공개 그래프.',
    hubCount: 3,
    crossDepFrom: 'demo',
    capabilities: ['문서 등록', 'frontmatter 추출', 'stub 승격', '검수 큐'],
    elements: ['markdown parser', 'Firestore', 'Cloud Functions'],
  },
  {
    id: 'demo-vault',
    name: 'Demo Vault',
    description: 'File System Access API 기반 로컬 폴더 동기.',
    hubCount: 3,
    capabilities: ['폴더 선택', 'manifest 빌드', '파일 변경 감지', 'frontmatter 패치'],
    elements: ['File System Access API', 'IndexedDB', 'Web Worker'],
  },
  {
    id: 'demo-search',
    name: 'Demo Search',
    description: '글로벌 검색 + 명령 팔레트.',
    hubCount: 2,
    crossDepFrom: 'demo-knowledge',
    capabilities: ['fuzzy 매칭', 'kind 필터', '명령 팔레트', '단축키'],
    elements: ['cmdk', 'Radix Dialog', '한·영 fuzzy matcher'],
  },
  {
    id: 'demo-design',
    name: 'Demo Design',
    description: '디자인 시스템 — 토큰 · 컴포넌트 · 헌장.',
    hubCount: 2,
    capabilities: ['디자인 토큰', '다크/라이트 테마', '접근성', '모션 정책'],
    elements: ['Tailwind CSS 4', 'CSS 변수', 'Radix UI', 'lucide-react'],
  },
];

// 허브 이름 풀 — container 와 조합해 "{Container Short} · {Hub Role}" 형식.
const HUB_ROLE_POOL: ReadonlyArray<string> = [
  'Core', 'Gateway', 'Adapter', 'Pipeline', 'Engine', 'Registry',
  'Router', 'Processor', 'Orchestrator', 'Scheduler', 'Store', 'Cache',
  'Indexer', 'Monitor', 'Agent', 'Collector', 'Publisher', 'Broker',
  'Translator', 'Normalizer', 'Aggregator', 'Evaluator', 'Classifier',
  'Validator', 'Tokenizer', 'Serializer', 'Compiler', 'Dispatcher',
  'Supervisor', 'Worker',
];

const NODE_ROLE_POOL: ReadonlyArray<string> = [
  'Client', 'Server', 'Worker', 'Listener', 'Handler', 'Middleware',
  'Formatter', 'Interceptor', 'Transformer', 'Strategy', 'Policy',
  'Repository', 'Factory', 'Builder', 'Parser', 'Renderer',
  'Resolver', 'Dispatcher', 'Emitter', 'Receiver', 'Guard',
];

// 간단한 deterministic RNG — 같은 seed 에 같은 값.
function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickInRange(rng: () => number, lo: number, hi: number): number {
  return Math.floor(rng() * (hi - lo + 1)) + lo;
}

function toSlugSuffix(role: string): string {
  return role.toLowerCase();
}

export function generateDemoBlueprint(): ReadonlyArray<BlueprintContainer> {
  return CONTAINER_THEMES.map((theme, containerIndex) => {
    const rng = mulberry32(hashSeed(theme.id));
    const hubs: BlueprintHub[] = [];
    for (let h = 0; h < theme.hubCount; h += 1) {
      const role = HUB_ROLE_POOL[(hashSeed(theme.id) + h) % HUB_ROLE_POOL.length];
      const hubSlug = `${theme.id}-${toSlugSuffix(role)}${h === 0 ? '' : `-${h}`}`;
      const hubName = `${theme.name} · ${role}`;
      const nodeCount = pickInRange(rng, 2, 4);
      const nodes: BlueprintNode[] = [];
      for (let n = 0; n < nodeCount; n += 1) {
        const nodeRole = NODE_ROLE_POOL[(n + h * 3) % NODE_ROLE_POOL.length];
        const nodeSlug = `${hubSlug}-${toSlugSuffix(nodeRole)}${n === 0 ? '' : `-${n}`}`;
        nodes.push({
          slug: nodeSlug,
          name: `${role} ${nodeRole}`,
          description: `${theme.name} 의 ${role} 허브 산하 ${nodeRole}.`,
        });
      }
      const extraDeps: string[] = [];
      // 첫 hub 에 cross-container 의존 1건 — 시스템 간 경계를 엣지로 가시화.
      if (h === 0 && theme.crossDepFrom) {
        const target = CONTAINER_THEMES.find((c) => c.id === theme.crossDepFrom);
        if (target) {
          const targetRole = HUB_ROLE_POOL[hashSeed(target.id) % HUB_ROLE_POOL.length];
          extraDeps.push(`${target.id}-${toSlugSuffix(targetRole)}`);
        }
      }
      hubs.push({
        slug: hubSlug,
        name: hubName,
        description: `${theme.name} 의 ${role} 담당 허브.`,
        extraDeps: extraDeps.length > 0 ? extraDeps : undefined,
        nodes,
      });
    }
    return {
      id: theme.id,
      name: theme.name,
      description: theme.description,
      order: containerIndex,
      hubs,
    };
  });
}
