/**
 * Focus / ego-state machine + hover-ripple emphasis — ported from the B2+
 * prototype's `nodeEgoState()`/`edgeEgoState()`/`startRipple()`/
 * `updateEmphasis()` (`docs/prototypes/topology-b2plus.html` §9, §11, §13).
 *
 * Contract (`docs/TOPOLOGY-V2-DESIGN.md` §3.2 "State Contract 매핑",
 * §3.6 "클릭=안전 계약"):
 * - **Click** sets a *durable* focus (`focusedNode`) — the ego-set (focused
 *   node + its 1-hop neighbors) reads as `"center"`/`"neighbor"`, everything
 *   else as `"dim"` (opaque dim tokens, never alpha — see
 *   `--topology-v2-node-fill-dim`/`node-stroke-dim`).
 * - **Hover** only raises `emphasis` (ripple) — it never touches focus/camera,
 *   and is suppressed entirely while a focus is active ("포커스가 emphasis
 *   소유권 독점", prototype: `if (focusedNode) return;` in pointermove).
 * - `emphasis` per node is a scalar 0..1 that exponentially rises toward 1
 *   while the node is in the active hover's ego-set AND its ripple delay has
 *   elapsed, and decays toward 0 otherwise:
 *   ```
 *   rising:  emphasis += (1 - emphasis) * (1 - exp(-dt / riseTau))   // riseTau  = --topology-v2-emphasis-rise-tau  (0.09s)
 *   falling: emphasis += (0 - emphasis) * (1 - exp(-dt / decayTau))  // decayTau = --topology-v2-emphasis-decay-tau (0.15s)
 *   ```
 * - Ripple stagger: hovering node N schedules its own ramp to start
 *   immediately, and each 1-hop neighbor's ramp to start
 *   `baseDelayMs + i*perNeighborDelayMs` later (`--topology-v2-ripple-stagger-ms`
 *   = 55, `+12`/neighbor — both numbers live under that one token in the
 *   design doc's §2.4 table, the prototype's `startRipple()`).
 *
 * Pure state — no DOM/pointer-event/canvas knowledge. `interaction/pointer-state-machine.ts`
 * owns translating raw pointer events into `focusedNodeId`/`hoveredNodeId`
 * changes that this module reacts to.
 */

import { DEFAULT_EXPAND } from "@/shared/lib/appearance-preferences";

export type NodeEgoState = "center" | "neighbor" | "dim" | "normal";
export type EdgeEgoState = "ego" | "dim" | "normal";

/**
 * S2 파트 3a — 선택적 ego. 포커스 노드의 1-hop 이웃이 이 값을 넘으면(예: 87
 * 이웃 허브) 전부 점등하면 다발이 화면을 관통해 판독 불가다. DOI 랭크 상위
 * `EGO_NEIGHBOR_LIMIT` 개만 full 점등하고 나머지는 **dim 이 아니라 hidden**,
 * 포커스 노드 옆 `이웃 +N` 집계 칩으로 접는다(칩 클릭 = 다음 배치 점등).
 *
 * **값의 단일 출처는 설정이다** — 「확장 → 한 번에 여는 개수」(기본 24)가 그대로
 * 여기로 온다. 종전엔 이 파일이 24 를 직접 적었고 설정은 그 숫자를 다시 적어야
 * 했는데, 값이 두 곳에 적히면 이미 드리프트가 시작된 것이다(Carbon). 라이브
 * 값은 `use-topology-loop` 이 프레임마다 읽고, 이 상수는 그 기본값이자
 * 설정을 모르는 순수 함수의 폴백이다.
 */
export const EGO_NEIGHBOR_LIMIT = DEFAULT_EXPAND.batchSize;

/**
 * 선택적 ego 의 `이웃 +N` 집계 칩이 쓰는 합성 parentId. 실제 노드 id 와
 * 충돌하지 않게 예약어를 쓴다 — 포인터 핸들러가 이 id 를 보고 URL 토글
 * 대신 다음 이웃 배치 점등으로 분기한다.
 */
export const EGO_NEIGHBOR_CHIP_ID = "__ego_neighbors__";

/**
 * 고팬아웃 배치-공개(2026-07) — 펼친 클러스터 부모의 **잔여 배치**를 대신하는
 * `+N 더보기` 칩의 합성 parentId prefix. `이웃 +N` 칩(EGO_NEIGHBOR_CHIP_ID)과
 * 동형이되, 펼침은 여러 부모가 동시에 존재할 수 있어 단일 예약어로는 부족하다 —
 * 실제 부모 id 를 prefix 로 감싸 각 부모의 잔여 칩을 구분한다. 포인터 핸들러가
 * 이 접두어를 보고 URL 토글(접기) 대신 **그 부모의 다음 배치**를 점등한다.
 * 실제 부모 slug 와 충돌하지 않게 예약 접두어를 쓴다.
 */
export const CLUSTER_MORE_CHIP_PREFIX = "__cluster_more__:";

/** 실제 부모 id → `+N 더보기` 칩의 합성 id. */
export function clusterMoreChipId(parentId: string): string {
  return CLUSTER_MORE_CHIP_PREFIX + parentId;
}

/** 합성 `+N 더보기` 칩 id → 실제 부모 id(아니면 null). draw/hit/pointer 공용. */
export function parseClusterMoreChipId(chipId: string): string | null {
  return chipId.startsWith(CLUSTER_MORE_CHIP_PREFIX) ? chipId.slice(CLUSTER_MORE_CHIP_PREFIX.length) : null;
}

export interface EgoNeighborRankEntry {
  id: string;
  kind: string;
  /** 전체 차수(이웃 수) — 동일 kind 안에서 허브를 우선 노출. */
  degree: number;
  /**
   * 이 이웃과 포커스 노드를 잇는 엣지의 **원 관계 타입**(`WorldEdge.relationType`
   * — contains|depends 2치 kind 로 뭉개기 전 값). DOI 랭크에서 kind 다음
   * 우선순위로 관계 위계(contains > depends > relates)를 반영한다. 관계 맥락이
   * 없는 호출부(예: 레이아웃 디스크 정렬)는 생략 가능 — 미상은 가중치 1로 취급.
   */
  relationType?: string;
}

/**
 * 관계 타입 위계 가중치 — 렌더의 잉크 램프(실선 contains > 파선 depends >
 * 약한 relates)와 같은 위계를 DOI 랭크에도 반영한다. containment(contains/
 * belongs_to) 3 > dependency(depends_on) 2 > 그 외(relates/related_to/
 * describes/…)·미상 1. 결정론 유지 — 순수 매핑, 부수효과 없음.
 */
function relationTypeWeight(relationType: string | undefined): number {
  if (relationType === "contains" || relationType === "belongs_to") return 3;
  if (relationType === "depends_on") return 2;
  return 1;
}

/**
 * DOI(degree-of-interest) 랭크 — 결정론: ① kind 가중치(domain 3 > capability 2 >
 * element/기타 1) 내림차순 → ② 관계 타입 가중치(contains 3 > depends 2 >
 * relates/기타 1) 내림차순 → ③ degree 내림차순 → ④ slug(id) 사전순. Furnas
 * (1986) DOI 처럼 "구조적으로 중요한" 이웃을 먼저 보여준다 — 도메인·허브 우선,
 * 그리고 같은 kind·degree 라면 contains 자식이 스쳐가는 relates 이웃을 앞선다
 * (렌더 위계와 랭크 위계 정렬). kind 가중치가 관계 타입보다 우선한다.
 */
export function rankEgoNeighborsByDOI(neighbors: readonly EgoNeighborRankEntry[]): string[] {
  const weight = (kind: string): number => (kind === "domain" ? 3 : kind === "capability" ? 2 : 1);
  return [...neighbors]
    .sort(
      (a, b) =>
        weight(b.kind) - weight(a.kind) ||
        relationTypeWeight(b.relationType) - relationTypeWeight(a.relationType) ||
        b.degree - a.degree ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .map((n) => n.id);
}

export interface SelectiveEgoResult {
  /** 이번에 full 점등할 이웃(랭크 상위 `revealedBatches × limit`). */
  visibleNeighbors: Set<string>;
  /** 접어서 숨길 이웃(그 엣지·라벨도 함께 숨긴다). */
  hiddenNeighbors: Set<string>;
  /** 숨긴 이웃 수 — `이웃 +N` 칩의 N. 0 이면 칩 소멸. */
  hiddenCount: number;
}

/**
 * 랭크된 이웃을 배치 단위로 노출한다. `revealedBatches` 는 1 부터(기본 상위
 * limit 개), 칩 클릭마다 +1(다음 limit 개 추가). 상위 `revealedBatches × limit`
 * 는 visible, 나머지는 hidden. 세션 임시 상태(URL 저장 없음).
 */
export function selectiveEgoNeighbors(
  rankedIds: readonly string[],
  revealedBatches: number,
  limit: number = EGO_NEIGHBOR_LIMIT,
): SelectiveEgoResult {
  const shown = Math.max(0, revealedBatches) * Math.max(1, limit);
  const visibleNeighbors = new Set<string>();
  const hiddenNeighbors = new Set<string>();
  rankedIds.forEach((id, i) => {
    if (i < shown) visibleNeighbors.add(id);
    else hiddenNeighbors.add(id);
  });
  return { visibleNeighbors, hiddenNeighbors, hiddenCount: hiddenNeighbors.size };
}

/**
 * `"center"` if `nodeId === focusedNodeId`, `"neighbor"` if `nodeId` is a
 * 1-hop neighbor of the focused node, `"dim"` otherwise — but only when a
 * focus is active at all; with no focus, every node is `"normal"`.
 */
export function resolveNodeEgoState(
  nodeId: string,
  focusedNodeId: string | null,
  neighborsOfFocused: ReadonlySet<string>,
): NodeEgoState {
  if (focusedNodeId === null) return "normal";
  if (nodeId === focusedNodeId) return "center";
  if (neighborsOfFocused.has(nodeId)) return "neighbor";
  return "dim";
}

/** `"ego"` if the edge touches the focused node, `"dim"` otherwise; `"normal"` with no focus. */
export function resolveEdgeEgoState(
  edgeTouchesFocusedNode: boolean,
  focusedNodeId: string | null,
): EdgeEgoState {
  if (focusedNodeId === null) return "normal";
  return edgeTouchesFocusedNode ? "ego" : "dim";
}

/**
 * 엣지 선택 = 페어 포커스 (사용자 요청: "선을 클릭하면 그 선과 연결된
 * 노드간만 표시"). 노드 포커스가 없고 엣지가 선택된 동안:
 * - 양끝 노드는 "neighbor" 급 (주인공은 '선'이므로 center 링 없음)
 * - 나머지 노드/엣지는 "dim"
 * - 선택된 엣지 자체는 "ego" (+ 별도 selected 스트로크는 드로어 소관)
 * 노드 포커스가 있으면 기존 ego 규칙이 우선한다 (클릭=안전 계약 유지).
 */
export interface EdgePairFocus {
  sourceId: string;
  targetId: string;
}

export function resolveNodeEgoStateWithPair(
  nodeId: string,
  focusedNodeId: string | null,
  neighborsOfFocused: ReadonlySet<string>,
  pair: EdgePairFocus | null,
): NodeEgoState {
  if (focusedNodeId === null && pair !== null) {
    return nodeId === pair.sourceId || nodeId === pair.targetId ? "neighbor" : "dim";
  }
  return resolveNodeEgoState(nodeId, focusedNodeId, neighborsOfFocused);
}

export function resolveEdgeEgoStateWithPair(
  edgeTouchesFocusedNode: boolean,
  focusedNodeId: string | null,
  pair: EdgePairFocus | null,
  isSelectedEdge: boolean,
): EdgeEgoState {
  if (focusedNodeId === null && pair !== null) {
    return isSelectedEdge ? "ego" : "dim";
  }
  return resolveEdgeEgoState(edgeTouchesFocusedNode, focusedNodeId);
}

/**
 * 걸어온 길 렌즈 — 트레일 팝오버가 열려 있는 동안만 유효한 ego 분류 **대체**.
 *
 * 왜 새 기호가 아니라 keep-set 교체인가: 팝오버를 열고 지도를 "궤적"으로 읽으려는
 * 순간에도 지도는 여전히 "관계"를 말한다(포커스 노드의 인디고 엣지). 소유자가 그
 * 관계 엣지를 걸어온 길의 일부로 오독했을 만큼 두 독법이 같은 화면에서 경쟁했다.
 * 그래서 궤적 선을 새로 그리는 대신(이 제품에서 선 = 관계다) 남길 집합만 바꾼다 —
 * 1-hop 이웃 대신 방문 노드를 남기고, 나머지는 **기존 dim 값 그대로** 후퇴시킨다.
 * "빛나게"는 glow 가 아니라 어두워진 장 위의 값 대비로 성립한다.
 *
 * 방문 노드가 `"neighbor"` 가 아니라 `"normal"` 인 이유: neighbor 는 노드 외곽에
 * pale 인디고 링을 하나 더 두르는데, 방문 노드에는 이미 발자국 링(+3 궤도)이 있어
 * 같은 색 헤어라인 둘이 인접 궤도에서 브레이드로 읽힌다(궤도당 신호 1개 규율).
 * 방문 표시는 발자국 링이 이미 하고 있으므로 렌즈는 잉크를 더하지 않는다.
 *
 * 현재 포커스 노드는 `"center"` 로 남아 선택 링 > 발자국 링 위계가 불변이다.
 */
export function resolveTrailLensNodeEgoState(
  nodeId: string,
  focusedNodeId: string | null,
  trailIds: ReadonlySet<string>,
): NodeEgoState {
  if (focusedNodeId !== null && nodeId === focusedNodeId) return "center";
  return trailIds.has(nodeId) ? "normal" : "dim";
}

/**
 * 렌즈 동안 이 노드가 **트레일 잉크를 얼마나 받나** (0 = 안 받음, 1 = 완전).
 *
 * ## 왜 이 함수가 생겼나 (2026-08-02 소유자 실보고)
 *
 * *"걸어온길 클릭했을때 화면인데 노드 선택되어서 빛나게 해줘야지?"* — 종전
 * 렌즈는 방문 노드를 `"normal"` 로 **남기기만** 했다. 나머지가 dim 이라 상대적
 * 대비는 있었지만 방문 표시는 노드 **옆** 발자국뿐이라, 「걸어온 길」을 켜도
 * 길 위의 노드가 자기 몸으로는 아무 말도 하지 않았다.
 *
 * ## 「빛나게」의 헌장 안 형태
 *
 * glow 가 아니다. 번짐(`ctx.shadowBlur`)은 `shared/lib/footprint-glyph.ts`
 * 한 파일의 opt-in·기본 0 예외로만 존재하고, 그 밖으로 나가지 않는다
 * (`.claude/rules/forbidden.md`). 여기서 하는 것은 노드가 **이미 가진 stroke
 * 채널**의 색을 트레일 잉크 쪽으로 옮기는 것뿐이다 — 새 링(넷째 원)도, 새
 * 궤도도, 새 hue 도 없다. 어두워진 장 위의 값·색 대비가 이 지도에서 「빛난다」의
 * 뜻이다.
 *
 * ## 세 규칙
 *
 * 1. **렌즈 한정** — `ramp` 는 팝오버가 열려 있는 동안만 1 로 오르고 닫히면
 *    0 으로 내린다. 상시 앰버 확장이 아니라는 것이 이 값이 보증하는 성질이고,
 *    선행 예외 둘(에이전트 포커스 링 · 최근 변경 스포트라이트)과 같은 구조다.
 * 2. **방문한 것만** — 안 방문한 노드는 0 이다(기존대로 dim 으로 물러난다).
 * 3. **고른 노드는 받지 않는다** — 선택 링(인디고) > 발자국 위계가 불변이다.
 *    받게 하면 사용자가 방금 고른 노드가 «걸었던 곳»과 같은 색이 되어, 화면이
 *    「지금 여기」와 「지나온 곳」을 더 이상 가르지 않는다.
 */
export function trailNodeInkStrength(input: {
  kept: boolean;
  ramp: number;
  colorEgoState: NodeEgoState;
}): number {
  if (!input.kept || input.colorEgoState === "center") return 0;
  if (!Number.isFinite(input.ramp)) return 0;
  return Math.min(1, Math.max(0, input.ramp));
}

/**
 * Ambient comet-tail advance speed for one `depends` edge (`world.edges[].t +=
 * dt * speed`). When a node is clicked ("powered"), its own incident edges carry
 * *more current* — the pulse advances at `egoSpeed` instead of the ambient
 * `baseSpeed`, so the selected subgraph visibly reads as energized (B2+ circuit
 * metaphor, lead spec §2). Every other edge keeps the ambient `baseSpeed`.
 *
 * Pure — the caller decides `edgeTouchesFocusedNode` from
 * `edge.sourceId/targetId === focusedNodeId`. Speeds are tokens
 * (`--topology-v2-edge-pulse-speed` / `-ego`).
 */
export function resolveEdgePulseSpeed(
  edgeTouchesFocusedNode: boolean,
  focusedNodeId: string | null,
  baseSpeed: number,
  egoSpeed: number,
): number {
  return focusedNodeId !== null && edgeTouchesFocusedNode ? egoSpeed : baseSpeed;
}

/**
 * Whether a node may ramp its `emphasis` (hover-ripple) this frame.
 *
 * - **No focus:** hover owns the ripple — the hovered node and its 1-hop
 *   neighbors (`isHoverEgoMember`) ramp.
 * - **Focus active:** hover is suppressed (focus owns attention), EXCEPT the one
 *   node the user is hovering in the detail panel's "연결된 노드" list
 *   (`panelEmphasisNodeId`). That single neighbor still ramps so the panel row
 *   and the on-canvas node/edge light up together ("emphasis ripple" linkage,
 *   lead spec §4). `panelEmphasisNodeId` is null until the panel-hover API feeds
 *   it in.
 */
export function isNodeEmphasisActive(
  nodeId: string,
  focusedNodeId: string | null,
  isHoverEgoMember: boolean,
  panelEmphasisNodeId: string | null,
): boolean {
  if (focusedNodeId !== null) return nodeId === panelEmphasisNodeId;
  return isHoverEgoMember;
}

export interface RippleSchedule {
  nodeId: string;
  /** Absolute ms timestamp (same clock as `performance.now()`) when this node's ramp may begin. */
  startAtMs: number;
}

/**
 * Schedules the hovered node's own immediate ramp plus each neighbor's
 * staggered ramp. `baseDelayMs`/`perNeighborDelayMs` = 55/12 per
 * `--topology-v2-ripple-stagger-ms`.
 */
export function scheduleRipple(
  hoveredNodeId: string,
  nowMs: number,
  neighborIds: readonly string[],
  baseDelayMs: number,
  perNeighborDelayMs: number,
  maxTotalStaggerMs: number = Number.POSITIVE_INFINITY,
): readonly RippleSchedule[] {
  const own: RippleSchedule = { nodeId: hoveredNodeId, startAtMs: nowMs };
  // A7 — the stagger has a TOTAL budget (`--topology-v2-ripple-stagger-max-ms`).
  // Uncapped, a 40-neighbor hub started its last neighbor 523ms in — a slow
  // enumeration, while a 3-neighbor node finished in 91ms. The ripple says
  // "these are the neighbors"; it doesn't count them. High-degree nodes
  // compress the per-neighbor delay so every ripple ends inside the budget.
  const perDelay =
    neighborIds.length > 0 ? Math.min(perNeighborDelayMs, maxTotalStaggerMs / neighborIds.length) : perNeighborDelayMs;
  const neighbors = neighborIds.map((nodeId, i) => ({
    nodeId,
    startAtMs: nowMs + baseDelayMs + i * perDelay,
  }));
  return [own, ...neighbors];
}

/**
 * One exponential-smoothing step of a single node's emphasis value.
 *
 * @param currentEmphasis 0..1
 * @param isInActiveEgoSet true if this node is the hovered node or one of its
 *   1-hop neighbors AND no focus is currently suppressing hover
 * @param rippleHasStarted true once `nowMs >= scheduledStartAtMs` for this
 *   node (ignored when `isInActiveEgoSet` is false)
 * @param dt elapsed seconds since the last step
 * @param riseTau `--topology-v2-emphasis-rise-tau` = 0.09
 * @param decayTau `--topology-v2-emphasis-decay-tau` = 0.15
 */
export function stepEmphasis(
  currentEmphasis: number,
  isInActiveEgoSet: boolean,
  rippleHasStarted: boolean,
  dt: number,
  riseTau: number,
  decayTau: number,
): number {
  if (isInActiveEgoSet) {
    if (!rippleHasStarted) return currentEmphasis;
    return currentEmphasis + (1 - currentEmphasis) * (1 - Math.exp(-dt / riseTau));
  }
  return currentEmphasis + (0 - currentEmphasis) * (1 - Math.exp(-dt / decayTau));
}

/**
 * One exponential-smoothing step of a single node's **focus ramp** — a scalar
 * 0..1 that rises toward 1 while ANY focus is active (a clicked node OR a
 * selected edge-pair) and falls toward 0 when none is. It is the shared time
 * base for the click-focus signature: `topology-frame-draw.ts#resolveNodeVisual`
 * lerps each node's normal color toward its dim/ego target by this factor (and
 * eases the center node's radius 1→1.12), so the dim/neighbor/center color swap
 * a click triggers ramps IN with the camera dive instead of hard-cutting, and a
 * deselect ramps it back OUT (owner headline: "하드 컷으로 읽히지 않게"). One
 * symmetric τ (`--topology-v2-focus-dim-tau`) — the color transition should feel
 * the same entering and leaving. Sibling to `stepEmphasis` (hover ripple) and
 * the ego-reveal ramp; kept separate because those gate on narrower conditions
 * (hover ego-set / tier exemption) than "is the scene focused at all".
 *
 * @param current 0..1 previous ramp value
 * @param focusActive true if a node OR edge-pair focus is live this frame
 * @param dt elapsed seconds since the last step
 * @param tau `--topology-v2-focus-dim-tau` (≈0.16s)
 */
export function stepFocusRamp(current: number, focusActive: boolean, dt: number, tau: number): number {
  const target = focusActive ? 1 : 0;
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}
