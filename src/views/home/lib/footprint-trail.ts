import { ATLAS_CLI } from "@/shared/config/cli-invocation";
/**
 * 발자국 트레일 세션 모델 (fable 설계 — 소유자 요청, 사람 가치 우선). 지도에서
 * 노드를 ego 포커스할 때마다 세션 방문 목록에 쌓이는 "걸어온 길". 모드가 아니라
 * 지도 위에 얹히는 수동적 기록층 — URL 비영속, localStorage 금지, 새로고침 시 초기화.
 *
 * 순수 함수만 — React/DOM 지식 없음. HomePage 가 `canvasSelectedSlug` 변화를
 * 관찰해 append 하고, 지도(발자국 링)와 트레일 칩(미니 타임라인 + 인계 패킷)에
 * 같은 순서 배열을 내려보낸다.
 */

/** 세션 트레일 최대 길이 — 넘으면 가장 오래된 방문부터 밀어낸다(무한 성장 방지). */
export const FOOTPRINT_TRAIL_MAX = 30;

/**
 * 방문을 트레일에 추가한다. 순서 보존 + 중복 재방문은 **순서 갱신**(기존 위치를
 * 제거하고 맨 끝=가장 최근으로 이동). 상한 초과 시 앞(오래된 방문)을 잘라낸다.
 * 불변 — 새 배열을 반환한다.
 */
export function appendFootprintVisit(
  trail: readonly string[],
  nodeId: string,
): string[] {
  const next = trail.filter((id) => id !== nodeId);
  next.push(nodeId);
  return next.length > FOOTPRINT_TRAIL_MAX
    ? next.slice(next.length - FOOTPRINT_TRAIL_MAX)
    : next;
}

/**
 * 그래프 노드 id(`<kind>:<slug>`)에서 bare 개념 슬러그를 뽑는다 — 인계 패킷의
 * `get_concept("slug")` 시퀀스용. `project:foo` → `foo`, 접두 없는 id 는 그대로.
 */
export function graphIdToConceptSlug(nodeId: string): string {
  const idx = nodeId.indexOf(":");
  if (idx < 0) return nodeId;
  const tail = nodeId.slice(idx + 1).trim();
  return tail || nodeId;
}

export interface FootprintTrailEntry {
  /** 그래프 노드 id(`<kind>:<slug>`). */
  id: string;
  title: string;
  kind: string;
  /**
   * 에이전트가 아는 이름 — 볼트 뿌리 기준 문서 slug 또는 참조 원문
   * (`resolveNodeAgentTarget`). id 꼬리로 되짚으면 슬러그가 뭉개진 파생
   * 노드(`element:srcentitiesfoots`)에서 볼트에 없는 이름이 나간다.
   */
  agentRef?: string | null;
  /** 자기 문서가 있는가. 없으면 `get_concept` 대신 문서 신설을 안내한다. */
  documented?: boolean;
}

/** 인계문에 박을 이름 — 에이전트가 아는 이름 우선, 없으면 id 꼬리. */
function agentRefOf(entry: FootprintTrailEntry): string {
  return entry.agentRef?.trim() || graphIdToConceptSlug(entry.id);
}

export interface FootprintTrailPacketLabels {
  /** 패킷 제목 — "# 걸어온 길 (탐색 경로)". */
  title: string;
  /** 방문 순서 목록 머리말 — "방문 순서 (오래된 → 최근):". */
  order: string;
  /** get_concept 시퀀스 안내 한 줄. */
  reviewHint: string;
  /** find_path 힌트 안내 한 줄(방문 2개 이상일 때만). */
  pathHint: string;
  /** ④ 드리프트 핸드오프 — dusty 노드 안내 한 줄(호출자가 count 포맷,
   *  dusty 0 이면 섹션 자체 생략). */
  dustyHint?: string;
}

/**
 * 방문 체인을 기존 인계 패킷 문법으로 직렬화 — 슬러그 순서 + `get_concept`
 * 시퀀스 + `find_path` 힌트. 안정적 영문 MCP 호출이라 UI 로케일과 무관하게
 * 코딩 에이전트에 그대로 붙여넣어진다(경로 칩 패킷과 같은 규율). 결정론적.
 */
export function formatFootprintTrailAgentPacket(
  entries: readonly FootprintTrailEntry[],
  labels: FootprintTrailPacketLabels,
  dustySlugs: readonly string[] = [],
): string {
  const lines: string[] = [`# ${labels.title}`, labels.order];
  entries.forEach((entry, i) => {
    lines.push(`${i + 1}. ${entry.title} (${entry.kind}): ${entry.id}`);
  });
  lines.push("");
  lines.push(labels.reviewHint);
  for (const entry of entries) {
    // 문서가 없는 개념에 `get_concept` 을 주면 붙여넣는 즉시 "없음" 이다 —
    // 볼트가 아는 유일한 형태(다른 문서가 적어 둔 참조)를 그대로 밝힌다.
    lines.push(
      entry.documented === false
        ? `# ${agentRefOf(entry)} — 아직 문서 없음(참조로만 존재). add_concept 로 만들 수 있어요`
        : `get_concept("${agentRefOf(entry)}")`,
    );
  }
  if (entries.length >= 2) {
    const first = agentRefOf(entries[0]);
    const last = agentRefOf(entries[entries.length - 1]);
    lines.push("");
    lines.push(labels.pathHint);
    lines.push(`find_path("${first}", "${last}")`);
  }
  // ④ 살아있는 지도 드리프트 핸드오프 — 지도가 이미 아는 방치 신호를
  // 에이전트 패킷에도 싣는다(대표 3개 + CLI 큐 힌트). dusty 0 이면 침묵.
  if (labels.dustyHint && dustySlugs.length > 0) {
    lines.push("");
    lines.push(labels.dustyHint);
    for (const slug of dustySlugs.slice(0, 3)) {
      lines.push(`get_concept("${graphIdToConceptSlug(slug)}")`);
    }
    lines.push(`${ATLAS_CLI} maintenance`);
  }
  return lines.join("\n");
}
