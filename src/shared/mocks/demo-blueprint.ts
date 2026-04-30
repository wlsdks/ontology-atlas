/**
 * DEMO 데모 blueprint 생성기.
 *
 * 20 개 컨테이너 · 컨테이너당 10~20 허브 · 허브당 4~8 노드.
 * 일관된 deterministic random (seed) 로 매 빌드마다 같은 결과.
 * 각 허브·노드 slug 는 컨테이너 id 를 prefix 로 가져 charge 충돌 회피.
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
const CONTAINER_THEMES: ReadonlyArray<{
  id: string;
  name: string;
  description: string;
  hubCount: number;
  crossDepFrom?: string; // 이 컨테이너 첫 hub 가 다른 컨테이너 hub 에 의존 (system boundary)
}> = [
  { id: 'demo', name: 'Demo', description: '메인 제품 — 토폴로지 지도, 컨테이너/허브/노드 4-layer, 실시간 협업.', hubCount: 14 },
  { id: 'demo-iam', name: 'Demo IAM', description: '인증·세션·권한 인프라.', hubCount: 12 },
  { id: 'demo-reactor', name: 'Demo Reactor', description: 'Spring AI 기반 엔터프라이즈 AI Agent 런타임.', hubCount: 20, crossDepFrom: 'demo-iam' },
  { id: 'demo-knowledge', name: 'Demo Knowledge', description: '문서 파이프라인 + 온톨로지 빌더 + 공개 그래프.', hubCount: 12, crossDepFrom: 'demo' },
  { id: 'demo-billing', name: 'Demo Billing', description: '구독·사용량·청구서 발행.', hubCount: 10, crossDepFrom: 'demo-iam' },
  { id: 'demo-analytics', name: 'Demo Analytics', description: '사용 지표·대시보드·리포트 파이프라인.', hubCount: 12 },
  { id: 'demo-notify', name: 'Demo Notify', description: '이메일·Slack·웹훅 다채널 알림 허브.', hubCount: 10 },
  { id: 'demo-storage', name: 'Demo Storage', description: 'Blob·메타·권한 통합 스토리지.', hubCount: 11, crossDepFrom: 'demo-iam' },
  { id: 'demo-search', name: 'Demo Search', description: '벡터·키워드·하이브리드 검색 서비스.', hubCount: 10, crossDepFrom: 'demo-knowledge' },
  { id: 'demo-workflow', name: 'Demo Workflow', description: '휴먼-인-더-루프 승인 + 스케줄 워크플로.', hubCount: 13 },
  { id: 'demo-audit', name: 'Demo Audit', description: '조작 로그·보안 이벤트 감사.', hubCount: 10, crossDepFrom: 'demo-iam' },
  { id: 'demo-ingest', name: 'Demo Ingest', description: '외부 소스 → 내부 지식으로 ETL.', hubCount: 11, crossDepFrom: 'demo-knowledge' },
  { id: 'demo-sdk', name: 'Demo SDK', description: '외부 클라이언트용 SDK · CLI · MCP 서버.', hubCount: 10 },
  { id: 'demo-presence', name: 'Demo Presence', description: 'WebSocket 기반 실시간 협업 상태.', hubCount: 10, crossDepFrom: 'demo' },
  { id: 'demo-billing-gateway', name: 'Payment Gateway', description: '다중 PG 결제 추상화 레이어.', hubCount: 10, crossDepFrom: 'demo-billing' },
  { id: 'demo-email', name: 'Demo Email', description: '트랜잭션 · 캠페인 이메일 라우팅.', hubCount: 10, crossDepFrom: 'demo-notify' },
  { id: 'demo-scheduler', name: 'Demo Scheduler', description: 'Cron · 분산 큐 · 리트라이 스케줄러.', hubCount: 10, crossDepFrom: 'demo-workflow' },
  { id: 'demo-observability', name: 'Demo Observability', description: 'Trace · Metric · Log 수집 + 알람.', hubCount: 11, crossDepFrom: 'demo-analytics' },
  { id: 'demo-featureflag', name: 'Demo FeatureFlag', description: '롤아웃·AB 테스트·동적 토글.', hubCount: 10 },
  { id: 'demo-onboarding', name: 'Demo Onboarding', description: '신규 사용자 가입·투어·샘플 데이터.', hubCount: 10, crossDepFrom: 'demo-iam' },
  { id: 'demo-support', name: 'Demo Support', description: '고객지원·티켓·지식베이스 연동.', hubCount: 10, crossDepFrom: 'demo-knowledge' },
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
      const nodeCount = pickInRange(rng, 5, 10);
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
