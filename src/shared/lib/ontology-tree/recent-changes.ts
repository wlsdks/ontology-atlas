import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";

/**
 * P4a — "최근 변경" 렌즈의 단일 진실원. 의미론은 **mtime 7일 창**(세션
 * changeset 이 아니다 — `ontology-changeset.ts` 의 "마지막 기준 이후 변경"과는
 * 다른 질문. 이 모듈은 "지난 N일 안에 실제로 수정된 문서가 뭔가"에 답한다).
 *
 * 두 표면이 이 창 계산을 공유한다 — INDEX 지도 렌즈(`computeRecentChanges`,
 * 온톨로지 노드 → `evidenceIds[0]` → vault 문서 실제 갱신일 간접 조회)와
 * 문서함 사이드바 스트립(`selectRecentVaultDocs`, `VaultDoc.updatedAt` 직접
 * 조회 — 문서 자체가 이미 실제 날짜를 들고 있어 간접 조회가 필요 없다). 두
 * 함수 모두 `isWithinRecentWindow`/`daysAgoFromIso` 라는 같은 날짜 산수를
 * 호출해 "최근"의 기준이 표면마다 갈라지는 걸(N2 census drift 교훈) 막는다.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** 렌즈의 기본 창 — 7일. 페르소나 재검 문구("지난 7일 뭐가 바뀌었나")와 동일. */
export const RECENT_CHANGES_DEFAULT_WINDOW_DAYS = 7;

/**
 * C-3 (Guardian 총괄) — "약간 미래" 허용 창. `nowMs` 는 세션 첫-렌더
 * 스냅샷이라, 세션 도중 만들어진 문서(첫 지도 부트스트랩 등)는 mtime 이
 * 스냅샷보다 미래다. 이걸 전부 제외하면 "방금 만든 노드 6개 직후 최근
 * 변경 0"이라는 자기모순이 실증됐다. 24h 안의 미래는 "지금(오늘)"으로
 * 포함하고, 그 밖(진짜 clock skew/데이터 이상)만 제외한다.
 */
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

/**
 * `updatedAtIso` 가 `nowMs` 기준 `windowDays` 안(과거)에 들어오는지. 파싱 불가
 * 값은 false(모른다≠최근). 미래는 24h 허용 창 안이면 "오늘"로 포함.
 */
export function isWithinRecentWindow(
  updatedAtIso: string,
  nowMs: number,
  windowDays: number = RECENT_CHANGES_DEFAULT_WINDOW_DAYS,
): boolean {
  const updatedMs = Date.parse(updatedAtIso);
  if (!Number.isFinite(updatedMs)) return false;
  const ageMs = nowMs - updatedMs;
  if (ageMs < -FUTURE_TOLERANCE_MS) return false;
  return ageMs <= windowDays * DAY_MS;
}

/** `updatedAtIso` 가 `nowMs` 로부터 며칠 전인지 — 내림(정수일). 파싱 불가면 +Infinity. */
export function daysAgoFromIso(updatedAtIso: string, nowMs: number): number {
  const updatedMs = Date.parse(updatedAtIso);
  if (!Number.isFinite(updatedMs)) return Number.POSITIVE_INFINITY;
  // 허용 창 안의 미래(세션 중 생성)는 0일 = "오늘" (음수 일수 방지).
  return Math.max(0, Math.floor((nowMs - updatedMs) / DAY_MS));
}

export interface RecentChangeRow {
  id: string;
  title: string;
  kind: string;
  /** `daysAgoFromIso` — 0 = 오늘. */
  agoDays: number;
}

export interface RecentChangesResult {
  recentNodeIds: Set<string>;
  /** 최신순(agoDays 오름차순) 정렬. */
  rows: RecentChangeRow[];
}

/**
 * 온톨로지 노드 → "최근 변경" 렌즈. 노드 자체엔 시간 정보가 없다(vault
 * frontmatter 는 시간을 안 가짐) — `node.evidenceIds[0]` 이 곧 그 노드가
 * 유래한 vault 문서 slug(`derivationToInsight` 계약, `use-vault-doc-freshness.ts`
 * 와 동일 관례)이므로 `freshnessIndex`(slug → 실제 updatedAt ISO)로 간접
 * 조회한다. evidenceIds 가 없거나 freshnessIndex 에 없는 노드는 "모른다"로
 * 취급해 렌즈에서 제외(있다고 단정하지 않는다).
 */
export function computeRecentChanges(
  nodes: readonly KnowledgeGraphNode[],
  freshnessIndex: ReadonlyMap<string, string>,
  nowMs: number,
  windowDays: number = RECENT_CHANGES_DEFAULT_WINDOW_DAYS,
): RecentChangesResult {
  const recentNodeIds = new Set<string>();
  const rows: RecentChangeRow[] = [];

  for (const node of nodes) {
    const slug = node.evidenceIds[0];
    if (!slug) continue;
    const updatedAt = freshnessIndex.get(slug);
    if (!updatedAt) continue;
    if (!isWithinRecentWindow(updatedAt, nowMs, windowDays)) continue;

    recentNodeIds.add(node.id);
    rows.push({
      id: node.id,
      title: node.title,
      kind: node.kind,
      agoDays: daysAgoFromIso(updatedAt, nowMs),
    });
  }

  rows.sort((a, b) => a.agoDays - b.agoDays || a.title.localeCompare(b.title));
  return { recentNodeIds, rows };
}

/**
 * vault 문서(`VaultDoc` 호환 최소 shape) → "최근 변경" 목록. 문서 자체가 이미
 * 실제 `updatedAt` 을 들고 있으므로(local 모드 = `file.lastModified`,
 * static/dogfood = 빌드타임 값) `computeRecentChanges` 의 freshnessIndex 간접
 * 조회가 필요 없다 — 대신 같은 `isWithinRecentWindow` 산수를 공유해 두 표면의
 * "최근"이 갈라지지 않는다. 최신순 정렬.
 */
export function selectRecentVaultDocs<T extends { updatedAt: string }>(
  docs: readonly T[],
  nowMs: number,
  windowDays: number = RECENT_CHANGES_DEFAULT_WINDOW_DAYS,
): T[] {
  return docs
    .filter((doc) => isWithinRecentWindow(doc.updatedAt, nowMs, windowDays))
    .slice()
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

// P4b — "에이전트가 방금" 배지의 대상 노드 id 는 이 모듈에서 새로 만들지
// 않는다. `HomePage.tsx` 가 이미 W6(agent visibility)용으로
// `resolveAgentFocusNodeId`(`views/home/lib/resolve-agent-focus-node.ts`) 로
// heartbeat focus → 그래프 노드 id 를 정규화해 두므로, 배지는 그 결과가
// `recentNodeIds` 에 속하는지 집합 조회 한 줄로 판정한다(HomePage 참고) — 두
// 번째 매치 휴리스틱을 만들면 두 표면의 "에이전트가 지금 보는 노드" 판정이
// 갈라질 수 있어 피한다.
