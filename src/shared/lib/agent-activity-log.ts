/**
 * B3 — 에이전트 활동 로그(`.ontology-atlas/activity.jsonl`) 파서.
 * 쓰기는 MCP(`mcp/src/activity-log.mjs`)가 소유하고, 웹은 읽기만 한다.
 * 한 줄 스키마 v1: {"v":1,"at":ISO,"tool","target","summary","agent","why"}
 * 깨진 줄은 건너뛴다 — 파서가 죽어 전체를 못 보여주는 것이 더 나쁘다.
 * (mcp 리더와의 drift 는 cross-package 계약 테스트가 잡는다.)
 */
export interface AgentActivityEntry {
  v: 1;
  at: string;
  tool: string;
  target: string;
  summary: string;
  agent: string | null;
  why: string | null;
}

export function parseAgentActivityLog(raw: string, { limit = 100 }: { limit?: number } = {}): AgentActivityEntry[] {
  const entries: AgentActivityEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as Partial<AgentActivityEntry>;
      if (parsed?.v !== 1 || typeof parsed.at !== "string" || typeof parsed.summary !== "string") continue;
      entries.push({
        v: 1,
        at: parsed.at,
        tool: typeof parsed.tool === "string" ? parsed.tool : "",
        target: typeof parsed.target === "string" ? parsed.target : "",
        summary: parsed.summary,
        agent: typeof parsed.agent === "string" ? parsed.agent : null,
        why: typeof parsed.why === "string" ? parsed.why : null,
      });
    } catch {
      /* skip broken line */
    }
  }
  return entries.slice(-limit);
}

/** nowMs 기준 오늘(24h) 항목 수 — 다이제스트 헤더용. */
export function countRecentEntries(entries: readonly AgentActivityEntry[], nowMs: number, windowMs = 24 * 3600 * 1000): number {
  return entries.filter((entry) => {
    const t = Date.parse(entry.at);
    return Number.isFinite(t) && nowMs - t <= windowMs && t - nowMs <= 60 * 60 * 1000;
  }).length;
}

/** 시계 오차 허용 — 이보다 더 미래로 찍힌 줄은 못 믿으므로 무시한다
 *  (`countRecentEntries` 가 이미 쓰는 값과 같게 둔다). */
const CLOCK_SKEW_TOLERANCE_MS = 60 * 60 * 1000;

/**
 * 「지금 쓰는 중」이라고 말할 수 있는 시간 창 = 마지막 **쓰기** 이후 2분.
 *
 * 왜 2분인가 — 이 로그에는 **쓰기 성공만** 남는다. 두 쓰기 사이에 에이전트는
 * 읽고 생각하고 코드를 고치는데 그 구간은 로그에 한 줄도 안 남으므로, 창이
 * 그 공백보다 짧으면 한 세션 내내 「쓰는 중 ↔ 대기」가 깜빡인다. 아래에서
 * 위로 눌린 값과 위에서 아래로 눌린 값 사이에서 고른다:
 *  - 아래: 볼트 감시 주기(앱 0.5초 / 웹 폴링 burst 1.5초 · idle 5초,
 *    `.claude/rules/surfaces.md`). 창은 이보다 충분히 커야 감시 지연만으로
 *    상태가 흔들리지 않는다.
 *  - 위: heartbeat 의 stale 기준 5분(`AGENT_ACTIVITY_STALE_AFTER_MS`).
 *    「쓰는 중」은 「heartbeat 이 살아 있음」보다 **더 강한** 주장이라
 *    그것보다 오래 살아남으면 안 된다.
 * 틀렸을 때의 비용은 한 방향뿐이다 — 에이전트가 멈춘 뒤 최대 2분 동안
 * 「쓰는 중」이 남는다. 반대(쓰고 있는데 대기라고 말하는 것)는 이 화면이
 * 고치려는 바로 그 결함이라 그쪽으로 기울인다.
 */
export const AGENT_WRITING_WINDOW_MS = 2 * 60 * 1000;

/**
 * 화면이 「지금 쓰는 중인가 / 마지막 활동이 언제·어디였나」에 답하기 위한
 * 파생 결과. 서버는 이 파일을 쓰지 않는다 — 로그(사실)만 서버가 쓰고,
 * 판정은 화면이 한다.
 */
export interface AgentWritingActivity {
  /** 마지막 쓰기가 `windowMs` 안이면 true. */
  writing: boolean;
  /** 마지막 쓰기 시각(ms). 읽을 줄이 하나도 없으면 null. */
  lastAt: number | null;
  /** 마지막 쓰기 대상 **슬러그**. 슬러그가 아닌 대상이면 null (아래 참고). */
  lastTarget: string | null;
  /** 마지막 쓰기 도구 이름(`add_relation` · `cli:add` …). */
  lastTool: string | null;
}

/**
 * 슬러그로 쓸 수 있는 target 만 통과시킨다. 로그의 `target` 은 대부분
 * 슬러그지만 전부는 아니다 — 배치 도구는 `(batch)`, `absorb_document` 는
 * 파일 경로를 넣는다(`mcp/src/index.js` 의 `summarizeWrite`). 화면은 이 값으로
 * 노드에 날아가므로, 슬러그가 아닌 것을 슬러그인 척 넘기면 죽은 링크가 된다.
 *
 * ⚠️ **`/` 는 슬러그가 아니라는 신호가 아니다** (2026-08-01 정정). 처음 이 룰은
 * "경로 구분자가 있으면 슬러그가 아니다" 였는데, 규격이 정하는 슬러그가 바로
 * `folderForKind(kind)` + 평평한 이름 — 즉 **`capabilities/checkout` 처럼 `/`
 * 를 하나 갖는다**(`mcp/src/schema.mjs` `flatSlugIssue`). 실측 로그 98줄 중
 * 배치가 아닌 target 은 **전부** 그 모양이라, 옛 룰 아래에서는 `lastTarget` 이
 * 사실상 항상 null 이었다 — 죽은 링크를 막는 대신 **살아 있는 링크를 전부**
 * 막고 있었다. 원장이 금지한 것은 `elements/src/views/home` 같은 **경로형**
 * 슬러그이지 종류 폴더가 아니다.
 *
 * 그래서 여기서 거르는 것은 「슬러그일 리 없는 모양」 셋뿐이다: 배치 표식
 * (`(batch)`), 공백/역슬래시, **확장자로 끝나는 파일 경로**(`absorb_document`).
 * 나머지 한 겹은 화면이 맡는다 — 링크를 걸기 전에 **매니페스트에 그 슬러그가
 * 실제로 있는지** 확인한다. 정규식은 모양만 알고 존재는 모른다.
 */
const NON_SLUG_TARGET = /[\s\\]|^\(|\.[A-Za-z0-9]{1,8}$/;

/**
 * 로그의 `target` → 화면이 링크로 걸어도 되는 슬러그, 아니면 null.
 *
 * 「작업 중」 줄과 알림함이 **같은 판정**을 써야 한다 — 한쪽만 `(batch)` 를
 * 걸러내면 다른 쪽에 죽은 링크가 생긴다. 그래서 판정은 여기 한 곳에 있다.
 */
export function toSlugTarget(target: string | null | undefined): string | null {
  const trimmed = (target ?? "").trim();
  if (!trimmed) return null;
  return NON_SLUG_TARGET.test(trimmed) ? null : trimmed;
}

/**
 * 활동 로그에서 「쓰는 중」을 파생한다. 순수 함수 — 파일도 시계도 안 읽는다
 * (`nowMs` 를 받는 이유이자 경계값을 테스트할 수 있는 이유).
 *
 * ⚠️ **읽기만 하는 에이전트는 여기 안 잡힌다.** 로그는 쓰기 성공 직후에만
 * append 되므로(`mcp/src/activity-log.mjs`), `get_concept` 로 볼트를 열심히
 * 읽는 세션은 `writing: false` 다. 결함이 아니라 사실이다 — 이 파생은
 * 「무언가 바뀌고 있다」를 말하지 「에이전트가 붙어 있다」를 말하지 않는다.
 * 후자는 heartbeat(`agent-activity.json`, 에이전트의 선언)의 몫이다.
 *
 * @param entries 파싱된 로그 tail (순서 무관 — 가장 늦은 시각을 고른다).
 * @param nowMs   기준 시각.
 * @param windowMs 「쓰는 중」 창. 기본 `AGENT_WRITING_WINDOW_MS`. 경계는 **포함**
 *                 (정확히 창 끝에 걸친 쓰기는 아직 쓰는 중이다).
 */
export function deriveAgentWritingActivity(
  entries: readonly AgentActivityEntry[],
  nowMs: number,
  { windowMs = AGENT_WRITING_WINDOW_MS }: { windowMs?: number } = {},
): AgentWritingActivity {
  let latest: AgentActivityEntry | null = null;
  let latestAt = Number.NEGATIVE_INFINITY;

  for (const entry of entries) {
    const at = Date.parse(entry.at);
    if (!Number.isFinite(at)) continue;
    if (at - nowMs > CLOCK_SKEW_TOLERANCE_MS) continue;
    if (at >= latestAt) {
      latestAt = at;
      latest = entry;
    }
  }

  if (!latest) return { writing: false, lastAt: null, lastTarget: null, lastTool: null };

  const tool = latest.tool.trim();
  return {
    writing: nowMs - latestAt <= windowMs,
    lastAt: latestAt,
    lastTarget: toSlugTarget(latest.target),
    lastTool: tool || null,
  };
}
