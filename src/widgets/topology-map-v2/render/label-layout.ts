/**
 * Pure label-placement helpers (Design Guardian 가독성 반려) — no canvas, no
 * tokens, unit-tested in `label-layout.test.ts`:
 *
 * - `isWithinSafeRect` — the anchor must sit inside the VISIBLE area (viewport
 *   minus the left ReaderLens panel + right popover rail + top/bottom chrome),
 *   so a label never leaks behind the panel or clips off the right edge.
 * - `greedyPlaceLabels` — priority greedy bbox suppression (project > domain >
 *   capability > element): a lower-priority label whose box overlaps an
 *   already-placed one is dropped, so same-kind constellation labels and long
 *   element titles stop colliding.
 * - `ellipsizeToWidth` — word-boundary ellipsis (NEVER mid-word except as an
 *   unavoidable last resort for a single unbreakable token — design.md AI-feel
 *   list forbids mid-word truncation).
 *
 * `frame-draw` supplies the pixel geometry (safe rect from `--topology-v2-safe-inset-*`,
 * measured bboxes) and consumes the placed list.
 */

export interface SafeRect {
  /** Left edge of the visible area (px) — right edge of the ReaderLens panel + margin. */
  left: number;
  /** Right edge of the visible area (px) — viewport width − popover rail. */
  right: number;
  top: number;
  bottom: number;
}

export interface LabelBBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Inclusive point-in-rect test for a label's anchor. */
export function isWithinSafeRect(x: number, y: number, rect: SafeRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/**
 * Clamp a label anchor INTO the safe rect instead of dropping it — for
 * ego-protected labels (selected/hovered/ego member) whose node sits under a
 * chrome inset. Guardian follow-up A (label-clarity): the safe-rect cull ran
 * BEFORE the selected/hovered alpha floor, so a focused domain's fan children
 * under the left panel lost their labels — recreating the "이름 없는 도형"
 * symptom the slice existed to fix. A clamped label sits at the inset edge
 * nearest its node ("이 패널 밑에 이 노드가 있다"), which beats silence.
 * `marginX`/`marginY` keep the text box itself inside the rect (width/2, font).
 */
export function clampAnchorIntoSafeRect(
  x: number,
  y: number,
  rect: SafeRect,
  marginX: number,
  marginY: number,
): { x: number; y: number } {
  const lo = Math.min(rect.left + marginX, rect.right - marginX);
  const hi = Math.max(rect.left + marginX, rect.right - marginX);
  const top = Math.min(rect.top + marginY, rect.bottom - marginY);
  const bottom = Math.max(rect.top + marginY, rect.bottom - marginY);
  return { x: Math.min(hi, Math.max(lo, x)), y: Math.min(bottom, Math.max(top, y)) };
}

export interface SafeRectProtectionInput {
  egoState: "center" | "neighbor" | "dim" | "normal";
  isHovered: boolean;
  /** 발자국 렌즈가 켜져 있고 이 노드가 방문 노드인가. */
  trailKept: boolean;
  kind: "project" | "domain" | "capability" | "element";
  isHub: boolean;
}

/**
 * **크롬 인셋 밖으로 나간 라벨을 버리는 대신 인셋 가장자리로 당겨 살릴 것인가.**
 *
 * 컬 자체는 있어야 한다 — 그것이 없으면 화면 밖 이름들이 인셋 가장자리에 쌓인다.
 * 그래서 판정은 「이 이름이 없으면 화면이 거짓말을 하는가」다:
 *
 * - 사용자가 지금 보고 있는 것 — 포커스 중심 · ego 이웃 · 호버 · 발자국 방문
 *   (Guardian follow-up A: 컬이 «선택 → 알파 1» 보장보다 먼저 돌아서 왼쪽 패널
 *   밑의 ego 자식이 이름을 잃었다).
 * - **오버뷰 스파인의 두 등급 — project 와 hub** (원장 2026-08-08 (3) ②).
 *   노드 패스는 뷰포트 전체로 컬하는데 이 패스는 안전영역으로 컬하므로, 최외곽
 *   스파인 노드가 «그려지지만 이름만 없는» 상태가 됐다. 이름 없는 앰버 허브 링은
 *   `render/labels.ts` 의 계약(*"잡을 수 있으면 읽을 수 있다"* · *nameless
 *   circle 금지*)과 `resolveLabelPriority`(허브는 이미 project 와 **같은 등급**)를
 *   동시에 어기고, 개요 고도에서 독자가 묻는 질문이 바로 *"무엇이 허브인가"*
 *   (`model/label-lod.ts`)다.
 *
 * 그 밖(`dim`/`normal` 의 평범한 도메인·역량·요소)은 종전대로 떨어진다.
 */
export function isSafeRectProtectedLabel(input: SafeRectProtectionInput): boolean {
  if (input.egoState === "center" || input.egoState === "neighbor") return true;
  if (input.isHovered || input.trailKept) return true;
  return input.kind === "project" || input.isHub;
}

/** Standard AABB overlap (touching edges do NOT count as overlap). */
export function bboxesOverlap(a: LabelBBox, b: LabelBBox): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

export interface LabelCandidate<T> {
  /** Lower = higher priority. See `resolveLabelPriority` for the ladder. */
  priority: number;
  /** Stable tie-break within a priority — pass the node's draw index for determinism. */
  order: number;
  bbox: LabelBBox;
  /**
   * 이 라벨의 주인 노드 id. `ReservedBox.ownerId` 와 짝을 이뤄 **자기 노드의
   * 예약 영역에는 굴복하지 않게** 한다 — 노드 디스크를 예약하기 시작하면
   * 모든 라벨이 (자기 노드 바로 아래 붙으므로) 자기 예약에 걸려 사라진다.
   */
  ownerId?: string;
  payload: T;
}

export interface LabelPriorityInput {
  kind: "project" | "domain" | "capability" | "element";
  isSelected: boolean;
  isHovered: boolean;
  isHub: boolean;
}

/**
 * Collision-culling priority ladder (label-clarity, 2026-07): selected >
 * hovered > project/hub > domain > capability > element. Lower number wins
 * `greedyPlaceLabels` — a domain name must survive over a capability's when
 * both compete for the same screen area, and the node the user is actively
 * attending to (selected or hovered) must never lose to a passive one.
 */
export function resolveLabelPriority(input: LabelPriorityInput): number {
  if (input.isSelected) return 0;
  if (input.isHovered) return 1;
  if (input.kind === "project" || input.isHub) return 2;
  if (input.kind === "domain") return 3;
  if (input.kind === "capability") return 4;
  return 5;
}

/**
 * A non-label surface that already owns screen area and that labels must respect
 * (currently: density-gate cluster chips). `priority` places the box on the SAME
 * ladder as `resolveLabelPriority` — a candidate only yields to it when the
 * candidate's priority number is strictly larger (i.e. it ranks lower).
 *
 * Why a priority instead of an absolute block: a chip must not silence the label
 * of the node the user is actively attending to. Selected(0)/hovered(1) labels
 * outrank a chip and still draw; passive domain/capability/element labels (3/4/5)
 * yield. See `CLUSTER_CHIP_LABEL_PRIORITY`.
 */
export interface ReservedBox {
  bbox: LabelBBox;
  priority: number;
  /** 이 영역의 주인 노드 id — 같은 주인의 라벨은 이 예약을 무시한다. */
  ownerId?: string;
}

/**
 * Cluster chips sit at the project/hub tier (2) of the label ladder.
 *
 * rationale: a chip is an interactive affordance carrying a typed fact ("N개가
 * 접혀 있다, 눌러서 열기") — losing it to a passive element label costs the user a
 * control, while losing an element label costs one name that hover/ego restores.
 * Above 2 sit only selected/hovered labels, which the user is actively attending
 * to and which must never be silenced by a chip.
 */
export const CLUSTER_CHIP_LABEL_PRIORITY = 2;

/**
 * 그려진 노드 디스크가 라벨 램프에서 갖는 등급 (진입 검수 E-4).
 *
 * 검수 실측: 상품 노드를 클릭한 ego 포커스에서 자식 라벨 「상품 등록」이 선택
 * 노드의 박스를 **15px 관통**했고, 그 옆 라벨은 펼침 배지에 삼켜져 「재」 한 자만
 * 남았다. greedy 억제는 라벨 ↔ 라벨 겹침만 알았고 라벨 ↔ **노드 도형** 겹침은
 * 아예 몰랐다 — 이름이 도형 위에 얹히면 둘 다 못 읽는다(Tufte: 그래픽 정직성).
 *
 * 등급 1 의 뜻: 선택(0)·호버(1) 라벨은 디스크보다 굴복하지 않는다 — 사용자가
 * 지금 보고 있는 이름이 남의 도형 때문에 사라지면 그게 더 나쁘다. 수동적인
 * 프로젝트/도메인/역량/요소 라벨(2~5)은 비켜선다(먼저 노드 위쪽으로 뒤집어
 * 보고, 거기도 막히면 떨어진다 — `topology-frame-draw.ts` 의 flip 로직).
 */
export const NODE_DISC_LABEL_PRIORITY = 1;

/**
 * 이 bbox 가 **남의** 예약 영역과 겹치는가(자기 주인의 예약은 제외).
 * `greedyPlaceLabels` 가 쓰는 것과 같은 판정을 프레임 빌드 단계에서 재사용해
 * "아래가 막혔으면 위로 뒤집는" 결정을 내린다 — 두 곳이 다른 규칙을 쓰면
 * 뒤집어 놓고 다시 떨어지는 낭비가 난다.
 */
export function overlapsForeignReserved(
  bbox: LabelBBox,
  ownerId: string | undefined,
  priority: number,
  reserved: readonly ReservedBox[] | undefined,
): boolean {
  if (!reserved) return false;
  return reserved.some((box) => {
    // 주인이 **둘 다 정해져 있고 같을 때만** 자기 예약으로 본다. `undefined ===
    // undefined` 를 같은 주인으로 읽으면 주인 없는 예약(클러스터 칩)이 주인 없는
    // 후보를 통과시켜 버린다 — 칩 억제가 조용히 무력화된다.
    const ownedBySameNode = box.ownerId !== undefined && box.ownerId === ownerId;
    if (ownedBySameNode) return false;
    return priority > box.priority && bboxesOverlap(box.bbox, bbox);
  });
}

/**
 * Greedy priority suppression: sort by priority (then stable `order`), place a
 * label only if its bbox doesn't overlap any already-placed one. Deterministic —
 * identical input → identical placed list.
 *
 * `reserved` (optional) lets non-label surfaces pre-own screen area — a candidate
 * that ranks below a reserved box and overlaps it is dropped. Omitted → identical
 * to the pre-reservation behavior.
 *
 * rank9 — optional `isPreferred` hysteresis: within the SAME priority tier, a
 * candidate the predicate marks (e.g. it was placed last frame) sorts ahead of a
 * non-preferred one, so an already-showing label keeps its slot instead of being
 * evicted by an equal-priority newcomer that merely has a lower `order`. Kind
 * priority still dominates (a domain never yields to a preferred element), so
 * this only breaks ties — enough to stop same-tier LOD churn without changing the
 * ladder. Omitted → identical to the pre-rank9 behavior (deterministic).
 */
export function greedyPlaceLabels<T>(
  candidates: readonly LabelCandidate<T>[],
  isPreferred?: (candidate: LabelCandidate<T>) => boolean,
  reserved?: readonly ReservedBox[],
): LabelCandidate<T>[] {
  const pref = isPreferred ?? (() => false);
  const sorted = [...candidates].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const pa = pref(a) ? 0 : 1;
    const pb = pref(b) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return a.order - b.order;
  });
  const placed: LabelCandidate<T>[] = [];
  for (const candidate of sorted) {
    if (
      overlapsForeignReserved(candidate.bbox, candidate.ownerId, candidate.priority, reserved)
    ) {
      continue;
    }
    if (placed.some((p) => bboxesOverlap(p.bbox, candidate.bbox))) continue;
    placed.push(candidate);
  }
  return placed;
}

/** Word/segment boundaries — whitespace and identifier/path separators, so file paths break cleanly at `/`. */
const BOUNDARY = /[\s/\-._]/;
const ELLIPSIS = "…";

/**
 * Truncates `text` with a trailing ellipsis so `measure(result) <= maxWidth`,
 * cutting at a word/segment boundary. Only when a single unbreakable token is
 * itself wider than `maxWidth` does it fall back to a hard character cut (the
 * one unavoidable mid-word case).
 */
export function ellipsizeToWidth(
  text: string,
  maxWidth: number,
  measure: (candidate: string) => number,
): string {
  if (measure(text) <= maxWidth) return text;

  // Collect prefixes that end right before a boundary char (the whole word/segment
  // before each separator), longest first.
  let best = "";
  for (let i = 1; i < text.length; i += 1) {
    if (!BOUNDARY.test(text[i])) continue;
    const prefix = text.slice(0, i);
    if (measure(prefix + ELLIPSIS) <= maxWidth) best = prefix;
  }
  if (best !== "") return best + ELLIPSIS;

  // Last resort: no boundary fits — hard-truncate the single long token.
  for (let i = text.length - 1; i >= 1; i -= 1) {
    const prefix = text.slice(0, i);
    if (measure(prefix + ELLIPSIS) <= maxWidth) return prefix + ELLIPSIS;
  }
  return ELLIPSIS;
}
