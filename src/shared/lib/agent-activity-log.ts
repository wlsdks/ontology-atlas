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
