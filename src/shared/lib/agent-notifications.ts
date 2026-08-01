/**
 * 알림함의 자료 모델 — **작업 단위로만** 알린다.
 *
 * ## 무엇이 알림이 되나 (소유자 합의 2026-08-01)
 *
 * | 사건 | 왜 |
 * |---|---|
 * | 작업 시작 | 내 폴더에서 지금 뭔가 벌어진다 |
 * | 작업 끝 | 요약과 함께 — 「추가 34 · 편집 2 · 삭제 4」 |
 * | 도메인이 생기거나 사라짐 | 지도의 큰 뼈대가 바뀜 |
 * | 브릿지가 끼어듦 | 계층이 하나 늘었다 — 드물고 되돌리기 어려움 |
 * | 문제 발생 | 허공 참조·순환처럼 볼트가 아파진 것 |
 *
 * ## 무엇이 알림이 **안** 되나
 *
 * - **노드 하나 추가 · 관계 하나** — 지도가 이미 밝게 보여준다. 알림은 화면을
 *   안 보고 있을 때를 위한 것이고, 보고 있으면 지도가 더 낫다.
 * - **도구 호출** — 2026-08-01 판정이 명시적으로 반려했다: *"도구 호출 로그를
 *   그리는 순간 Atlas 는 에이전트 터미널과 경쟁하는 MCP 호출 뷰어가 되는데,
 *   이 제품의 해자는 도구층 위의 의미층이다."*
 */
import type { AgentWriteCounts, AgentWorkSession } from "./agent-work-session";
import { hasWrites } from "./agent-work-session";
import type { VaultShapeNode } from "./vault-shape-events";

export type AgentNotificationKind =
  | "task-start"
  | "task-end"
  | "domain-added"
  | "domain-removed"
  | "bridge-inserted"
  | "vault-problem";

/** 설정에서 갈래를 고를 때의 목록이자 순서. 화면과 저장값의 단일 출처. */
export const AGENT_NOTIFICATION_KINDS: readonly AgentNotificationKind[] = [
  "task-start",
  "task-end",
  "domain-added",
  "domain-removed",
  "bridge-inserted",
  "vault-problem",
];

export interface AgentNotification {
  /**
   * 폴링마다 다시 파생되므로 **내용에서 결정론적으로** 만든다. 그래야 읽음
   * 표시와 React 키가 흔들리지 않는다.
   */
  id: string;
  kind: AgentNotificationKind;
  at: number;
  /** 지도로 날아갈 대상. 없으면 null — **대상 없이 상태만 말한다.** */
  node: VaultShapeNode | null;
  /**
   * 링크는 못 걸지만 이름은 아는 경우(사라진 도메인). 없는 노드로 날아가는
   * 링크를 만들지 않으면서도 「무엇이」를 잃지 않기 위한 자리.
   */
  label?: string;
  /** `task-end` 전용 요약. */
  counts?: AgentWriteCounts;
  /** `bridge-inserted` 전용 — 데려간 자식 수. */
  childCount?: number;
  /** `vault-problem` 전용 — 늘어난 허공 참조/순환 수. */
  problems?: { unresolvedEdges: number; dependencyCycles: number };
}

/**
 * 작업 목록 → 시작/끝 알림. 로그가 진실원이므로 **새로고침해도 살아남는**
 * 유일한 갈래다(뼈대·문제 알림은 폴링 중에만 관측되고 로그에 안 남는다).
 */
export function deriveTaskNotifications(
  sessions: readonly AgentWorkSession[],
): AgentNotification[] {
  const out: AgentNotification[] = [];
  for (const session of sessions) {
    out.push({
      id: `${session.id}:start`,
      kind: "task-start",
      at: session.startAt,
      node: null,
    });
    // 끝나지 않은 작업엔 끝 알림이 없다. 0건 요약도 내보내지 않는다 —
    // 「추가 0 · 편집 0 · 삭제 0」은 정보가 아니라 소음이다.
    if (session.done && hasWrites(session.counts)) {
      out.push({
        id: `${session.id}:end`,
        kind: "task-end",
        at: session.endAt,
        node: session.lastTarget ? { slug: session.lastTarget, name: session.lastTarget } : null,
        counts: session.counts,
      });
    }
  }
  return out;
}

/**
 * 목록 합치기 — 최신 먼저, id 중복 제거, 상한.
 *
 * 상한이 있는 이유: 알림함은 감사 로그의 대체물이 아니다. 「모든 흐름」은
 * 읽을 수 있는 길이 안에서만 파악 가능하고, 그 이상은 `/git` 과 볼트 안
 * `activity.jsonl` 이 들고 있다.
 */
export const AGENT_NOTIFICATION_LIMIT = 60;

export function mergeNotifications(
  ...groups: readonly (readonly AgentNotification[])[]
): AgentNotification[] {
  const seen = new Map<string, AgentNotification>();
  for (const group of groups) {
    for (const item of group) if (!seen.has(item.id)) seen.set(item.id, item);
  }
  return [...seen.values()]
    .sort((a, b) => b.at - a.at || a.id.localeCompare(b.id))
    .slice(0, AGENT_NOTIFICATION_LIMIT);
}

/** 설정에서 끈 갈래를 걷어낸다. */
export function filterNotifications(
  notifications: readonly AgentNotification[],
  enabledKinds: ReadonlySet<AgentNotificationKind>,
): AgentNotification[] {
  return notifications.filter((item) => enabledKinds.has(item.kind));
}

/**
 * 안 읽은 수. `readAt` 은 「여기까지 봤다」는 시각 하나뿐이다 — 알림마다
 * 읽음 플래그를 두면 볼트 밖에 상태가 쌓이는데, 이 앱에서 진실원은 볼트다.
 */
export function countUnread(
  notifications: readonly AgentNotification[],
  readAt: number,
): number {
  return notifications.filter((item) => item.at > readAt).length;
}
