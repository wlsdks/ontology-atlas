import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildContainmentParents, nearestDomainId } from "@/shared/lib/ontology-tree";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HEATSTRIP_WEEKS = 12;
export const FRESHNESS_WINDOW_WEEKS = HEATSTRIP_WEEKS;
const STALE_DAYS = 90;

/** 한 주의 갱신 강도 — 0(없음)~3(3건 이상). 실제 카운트에서 유도, 장식용 난수 없음. */
export type FreshnessLevel = 0 | 1 | 2 | 3;

export interface FreshnessWeekCell {
  level: FreshnessLevel;
  /** 가장 최근 주(이번 주) 여부 — 인디고로 별도 강조. */
  isCurrentWeek: boolean;
}

export interface DomainFreshnessRow {
  domainId: string;
  domainTitle: string;
  /** 오래된 주 → 최신 주 순, 길이 = HEATSTRIP_WEEKS. */
  weeks: FreshnessWeekCell[];
  /** 이 도메인에서 가장 최근 갱신된 시각 — 알려진 날짜가 하나도 없으면 null. */
  mostRecentUpdatedAt: string | null;
  daysAgo: number | null;
  /** 가장 최근 갱신도 STALE_DAYS 보다 오래됐으면 true. */
  stale: boolean;
}

export interface RecentUpdateRow {
  nodeId: string;
  title: string;
  kind: string;
  domainTitle: string | null;
  updatedAt: string;
}

export interface FreshnessSummary {
  domainRows: DomainFreshnessRow[];
  recent: RecentUpdateRow[];
  /** domain/capability/element 중 알려진 갱신일이 있고 STALE_DAYS 보다 오래된 노드 수.
   * 갱신일을 모르는 노드는 "모른다"이지 "오래됐다"가 아니므로 집계에서 제외 — 데이터
   * 없는 걸 부정확한 값으로 단정 짓지 않는다. */
  staleCount: number;
  /** 전 도메인 합산 주간 갱신 건수 — 히트스트립과 같은 12주 창, 같은 카운트
   * 소스(각 도메인의 주간 버킷을 합산). 신선도 탭 스파크라인의 진실원 —
   * 하드코딩 배열이 아니라 이 함수가 이미 계산한 값을 그대로 노출한다. */
  weeklyTotals: number[];
}

function levelFromCount(count: number): FreshnessLevel {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  return 3;
}

/**
 * 노드 → 갱신일(ISO string) 해석. `node.evidenceIds[0]` 이 곧 그 노드가 유래한
 * vault 문서 slug (`derivationToInsight` 계약 — 근거 문서 = 최초 등장 문서).
 * `docUpdatedAtBySlug` 는 `VaultManifest.docs[].updatedAt` 에서 만든 lookup —
 * local 모드는 실제 file.lastModified, static(dogfood) 모드는 빌드타임 값.
 */
function resolveNodeUpdatedAt(
  node: KnowledgeGraphNode,
  docUpdatedAtBySlug: ReadonlyMap<string, string>,
): string | null {
  const slug = node.evidenceIds[0];
  if (!slug) return null;
  return docUpdatedAtBySlug.get(slug) ?? null;
}

const CONTENT_KINDS = new Set(["domain", "capability", "element"]);

/**
 * 탭3 신선도 — 히트스트립(도메인 x 12주) + 최근 갱신 목록 + 90일 미갱신
 * 카운트. `visual-richness-sampler.html` §3 grammar 그대로, 다만 셀 값은
 * 하드코딩 배열이 아니라 실제 문서 갱신일에서 집계한다.
 */
export function computeFreshnessSummary(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  docUpdatedAtBySlug: ReadonlyMap<string, string>,
  referenceDate: Date,
  options?: { recentLimit?: number },
): FreshnessSummary {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const parentOf = buildContainmentParents(edges, nodeById);
  const domainNodes = nodes.filter((n) => n.kind === "domain");
  // 과제 ⑩ — 도메인 표시용 짧은 제목.
  const domainTitleById = new Map(domainNodes.map((d) => [d.id, d.display ?? d.title]));

  // 노드별 (updatedAt, domainId) 해석 — 한 번만.
  type Resolved = { node: KnowledgeGraphNode; updatedAt: string | null; domainId: string | null };
  const resolved: Resolved[] = nodes.map((node) => ({
    node,
    updatedAt: resolveNodeUpdatedAt(node, docUpdatedAtBySlug),
    domainId: nearestDomainId(node, parentOf, nodeById),
  }));

  // 도메인별 주간 버킷 카운트. weeksAgo=0 은 referenceDate 로부터 최근 7일 —
  // epoch-aligned 주 경계 대신 referenceDate 기준 상대 주로 계산해 "1일 전"
  // 같은 값이 경계 우연으로 지난 주에 떨어지는 걸 피한다.
  const nowMs = referenceDate.getTime();
  const countsByDomain = new Map<string, number[]>();
  const latestByDomain = new Map<string, number>();
  const weeklyTotals = new Array(HEATSTRIP_WEEKS).fill(0);
  for (const domain of domainNodes) {
    countsByDomain.set(domain.id, new Array(HEATSTRIP_WEEKS).fill(0));
  }

  for (const { node, updatedAt, domainId } of resolved) {
    if (!domainId || !updatedAt || !CONTENT_KINDS.has(node.kind)) continue;
    const counts = countsByDomain.get(domainId);
    if (!counts) continue;
    const updatedMs = Date.parse(updatedAt);
    if (!Number.isFinite(updatedMs)) continue;
    const weeksAgo = Math.floor((nowMs - updatedMs) / WEEK_MS);
    const bucketFromOldest = HEATSTRIP_WEEKS - 1 - weeksAgo;
    if (bucketFromOldest >= 0 && bucketFromOldest < HEATSTRIP_WEEKS) {
      counts[bucketFromOldest] += 1;
      weeklyTotals[bucketFromOldest] += 1;
    }
    const currentLatest = latestByDomain.get(domainId);
    if (currentLatest === undefined || updatedMs > currentLatest) {
      latestByDomain.set(domainId, updatedMs);
    }
  }

  const domainRows: DomainFreshnessRow[] = domainNodes
    .map((domain) => {
      const counts = countsByDomain.get(domain.id) ?? new Array(HEATSTRIP_WEEKS).fill(0);
      const weeks: FreshnessWeekCell[] = counts.map((count, i) => ({
        level: levelFromCount(count),
        isCurrentWeek: i === HEATSTRIP_WEEKS - 1,
      }));
      const latestMs = latestByDomain.get(domain.id) ?? null;
      const daysAgo = latestMs !== null ? Math.floor((referenceDate.getTime() - latestMs) / DAY_MS) : null;
      return {
        domainId: domain.id,
        domainTitle: domain.display ?? domain.title,
        weeks,
        mostRecentUpdatedAt: latestMs !== null ? new Date(latestMs).toISOString() : null,
        daysAgo,
        stale: daysAgo !== null && daysAgo > STALE_DAYS,
      };
    })
    .sort((a, b) => {
      // 알려진 최근일이 있는 도메인 먼저(최신순), 알 수 없는 건 뒤로.
      if (a.daysAgo === null && b.daysAgo === null) return a.domainTitle.localeCompare(b.domainTitle);
      if (a.daysAgo === null) return 1;
      if (b.daysAgo === null) return -1;
      return a.daysAgo - b.daysAgo;
    });

  const recent: RecentUpdateRow[] = resolved
    .filter((r): r is Resolved & { updatedAt: string } => r.updatedAt !== null)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.node.title.localeCompare(b.node.title))
    .slice(0, options?.recentLimit ?? 8)
    .map((r) => ({
      nodeId: r.node.id,
      // 과제 ⑩ — 최근 갱신 목록도 표시용 짧은 제목.
      title: r.node.display ?? r.node.title,
      kind: r.node.kind,
      domainTitle: r.domainId ? (domainTitleById.get(r.domainId) ?? null) : null,
      updatedAt: r.updatedAt,
    }));

  const staleCount = resolved.filter(({ node, updatedAt }) => {
    if (!CONTENT_KINDS.has(node.kind) || !updatedAt) return false;
    const updatedMs = Date.parse(updatedAt);
    if (!Number.isFinite(updatedMs)) return false;
    const daysAgo = (referenceDate.getTime() - updatedMs) / DAY_MS;
    return daysAgo > STALE_DAYS;
  }).length;

  return { domainRows, recent, staleCount, weeklyTotals };
}
