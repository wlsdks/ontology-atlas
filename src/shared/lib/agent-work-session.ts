/**
 * 활동 로그(줄)를 **작업(session)** 으로 묶는다.
 *
 * ## 왜 줄이 아니라 작업인가 (실측)
 *
 * 2026-08-01 실험에서 에이전트가 **11분 40초 동안 53번** 썼다. 줄 단위로
 * 알리면 알림 53개 — 아무도 안 읽고, 그 순간 벨 배지는 늘 빨간불이라 뜻을
 * 잃는다. 작업 단위로 묶으면 같은 로그가 알림 두 개가 된다.
 *
 * ## 「작업이 끝났다」를 어떻게 아는가 — 조용해짐
 *
 * Atlas 는 에이전트에 **연결하지 않는다**(폴더를 볼 뿐이다). 그래서 "끝났다"는
 * 통보를 받을 길이 없고, 유일하게 관측 가능한 신호는 **쓰기가 멈춘 시간**이다.
 * 임계값은 감이 아니라 실측 두 로그(총 98줄 · 쓰기 간격 96개)의 분포에서 골랐다:
 *
 * ```
 * p50 1.9s · p90 23.2s · p95 48.5s · p98 133.9s · p99 329.5s · max 1733.3s
 * 간격의 80.2% 가 4초 이하
 * ```
 *
 * 꼬리에 두 종류가 섞여 있다. **작업 중의 침묵**(에이전트가 읽고 생각하고
 * 코드를 고치는 동안 — 로그에는 쓰기 성공만 남으므로 그 구간은 한 줄도 안
 * 남는다)과 **작업 사이의 침묵**. 관측된 최대 「작업 중 침묵」은 133.9초였고,
 * 그다음 값이 329.5초, 그다음이 1733.3초(28.9분 — 세션이 갈린 자리)다.
 *
 * 임계값별로 로그가 몇 조각으로 갈리는지 실제로 재 봤다:
 *
 * | 임계값 | 갈라지는 간격 | 결과 |
 * |---|---|---|
 * | 60s | 5개 | 두 로그가 7작업 — 「생각하는 40초」를 끝으로 오판 |
 * | 120s | 4개 | 6작업 — 여전히 133.9초 침묵을 끝으로 읽는다 |
 * | **300s** | **2개** | **로그당 2작업** — 소유자가 말한 「1~2개」 |
 * | 600s | 1개 | 29분 침묵까지 한 작업 — 끝 알림이 10분 늦는다 |
 *
 * **5분(300초)을 고른 이유 셋**:
 * 1. 관측된 최대 「작업 중 침묵」(133.9초)의 **2.24배**다. 실측한 어떤 것보다
 *    두 배 오래 생각하는 에이전트도 여전히 한 작업으로 남는다.
 * 2. `AGENT_ACTIVITY_STALE_AFTER_MS`(heartbeat 이 낡았다고 보는 5분)와 **같은
 *    값**이다. 「이 에이전트는 이제 없다」는 판정이 제품 안에서 두 개의 서로
 *    다른 숫자를 가지면 안 된다.
 * 3. 틀렸을 때의 비용이 비대칭이고 유계다 — 길어서 틀리면 「끝」 알림이 최대
 *    5분 늦을 뿐이고, 짧아서 틀리면 한 작업이 알림 여러 개로 쪼개진다.
 *    후자가 정확히 이 묶음이 막으려는 실패다.
 */
import { toSlugTarget, type AgentActivityEntry } from "./agent-activity-log";

/** 쓰기가 이만큼 멎으면 그 작업은 끝난 것으로 본다. 근거는 파일 머리말. */
export const AGENT_TASK_IDLE_MS = 5 * 60 * 1000;

/**
 * 「마지막 작업 N분 전」을 화면에 남겨 두는 상한.
 *
 * 이 문장은 언제 말해도 **참**이다(연결이 없으니 「연결됨」과 달리 거짓이 될
 * 수 없다). 그래도 상한이 필요한 이유는 참/거짓이 아니라 **뉴스인가**다 —
 * 사흘 전 기록은 지도 위 크롬이 아니라 알림함이 들고 있어야 할 것이다.
 * 값은 이 로그가 이미 쓰고 있는 「오늘」의 경계(`countRecentEntries` 의 24시간)
 * 를 그대로 재사용한다. 같은 로그에 대한 「최근」의 정의를 두 개 만들지 않는다.
 */
export const AGENT_TASK_VISIBLE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** 한 작업이 볼트에 한 일의 세 갈래. 소유자 합의 문구는 「추가 · 편집 · 삭제」. */
export type AgentWriteKind = "added" | "edited" | "removed";

export type AgentWriteCounts = Record<AgentWriteKind, number>;

/**
 * 도구 → 갈래. **도구 이름이 곧 의도다** — 매니페스트 diff 와 달리 rename 을
 * 「삭제 + 추가」로 오독하지 않는다(`VaultDiffToaster` 가 같은 이유로 도구
 * 이름을 쓴다).
 */
const WRITE_KIND_BY_TOOL: Readonly<Record<string, AgentWriteKind>> = {
  add_concept: "added",
  add_concepts: "added",
  add_relation: "added",
  add_relations: "added",
  absorb_document: "added",
  patch_concept: "edited",
  rename_concept: "edited",
  reclassify_concept: "edited",
  merge_concepts: "edited",
  replace_relation: "edited",
  delete_concept: "removed",
  remove_relation: "removed",
};

/** 배치 도구 — 한 줄이 여러 행을 뜻한다. 행 수는 요약문에만 있다. */
const BATCH_TOOLS = new Set(["add_concepts", "add_relations"]);

/**
 * 배치 한 줄이 실제로 몇 행이었나. 요약문(`add_concepts 46행 성공`)은 **MCP 가
 * 소유하는 문구**라 여기서 파싱한다. 문구가 바뀌면 1로 떨어질 뿐 화면이
 * 깨지지 않는다 — 세는 값이 조금 작아지는 것과 알림이 안 뜨는 것 사이에서
 * 전자를 고른다.
 */
export function entryWeight(entry: AgentActivityEntry): number {
  if (!BATCH_TOOLS.has(entry.tool)) return 1;
  const matched = /(\d+)\s*행/.exec(entry.summary);
  if (!matched) return 1;
  const parsed = Number.parseInt(matched[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export interface AgentWorkSession {
  /**
   * 폴링마다 다시 파생되므로 **시작 시각으로 고정**한다. 배열 인덱스로 키를
   * 만들면 앞에 줄이 하나 들어오는 순간 모든 알림이 새 알림이 된다.
   */
  id: string;
  startAt: number;
  endAt: number;
  /** 로그 줄 수(배치는 1). 「몇 번 썼나」. */
  entryCount: number;
  /** 갈래별 행 수(배치는 N). 「무엇을 얼마나 했나」. */
  counts: AgentWriteCounts;
  /** 마지막으로 손댄 대상 슬러그 후보. 배치·문서 흡수면 null. */
  lastTarget: string | null;
  lastTool: string | null;
  /**
   * 이 작업에서 마지막으로 이름을 밝힌 에이전트 (하트비트 또는 MCP 연결 인사의
   * clientInfo.name, `mcp/src/activity-log.mjs` `resolveAgentName`). 이름 없는
   * 줄이 직전 이름을 지우지 않는 것은 `lastTarget` 과 같은 이유다 — 배치 한
   * 줄 때문에 화면이 말할 수 있던 것을 잃지 않는다. 한 번도 못 들었으면 null.
   */
  agent: string | null;
  /** 조용해진 지 `idleMs` 가 지났나 — 끝난 작업만 true. */
  done: boolean;
}

function emptyCounts(): AgentWriteCounts {
  return { added: 0, edited: 0, removed: 0 };
}

/** 갈래 하나라도 0이 아닌가 — 「추가 0 · 편집 0 · 삭제 0」은 정보가 아니다. */
export function hasWrites(counts: AgentWriteCounts): boolean {
  return counts.added > 0 || counts.edited > 0 || counts.removed > 0;
}

/**
 * 활동 로그 → 작업 목록(오래된 것 먼저). 순수 함수 — 파일도 시계도 안 읽는다.
 *
 * @param entries 파싱된 로그 tail. 순서 무관 — 여기서 시간순으로 정렬한다.
 * @param nowMs   기준 시각. 마지막 작업이 끝났는지 판정하는 데만 쓴다.
 */
export function deriveAgentWorkSessions(
  entries: readonly AgentActivityEntry[],
  nowMs: number,
  { idleMs = AGENT_TASK_IDLE_MS }: { idleMs?: number } = {},
): AgentWorkSession[] {
  const timed = entries
    .map((entry) => ({ entry, at: Date.parse(entry.at) }))
    .filter((row) => Number.isFinite(row.at))
    .sort((a, b) => a.at - b.at);

  const sessions: AgentWorkSession[] = [];
  let current: AgentWorkSession | null = null;

  for (const { entry, at } of timed) {
    if (current && at - current.endAt > idleMs) current = null;
    if (!current) {
      current = {
        id: `task:${at}`,
        startAt: at,
        endAt: at,
        entryCount: 0,
        counts: emptyCounts(),
        lastTarget: null,
        lastTool: null,
        agent: null,
        done: false,
      };
      sessions.push(current);
    }
    current.endAt = at;
    current.entryCount += 1;
    const kind = WRITE_KIND_BY_TOOL[entry.tool];
    if (kind) current.counts[kind] += entryWeight(entry);
    current.lastTool = entry.tool.trim() || current.lastTool;
    // 마지막 대상은 **슬러그일 때만** 갱신한다. 배치가 마지막 줄이라고 해서
    // 직전에 알아낸 대상을 지우면, 화면이 말할 수 있던 것을 잃는다.
    current.lastTarget = toSlugTarget(entry.target) ?? current.lastTarget;
    current.agent = entry.agent?.trim() || current.agent;
  }

  for (const session of sessions) {
    session.done = nowMs - session.endAt > idleMs;
  }
  return sessions;
}

/** 지금 쓰는 중인 작업(=아직 안 끝난 마지막 작업). 없으면 null. */
export function activeSession(sessions: readonly AgentWorkSession[]): AgentWorkSession | null {
  const last = sessions[sessions.length - 1];
  return last && !last.done ? last : null;
}
