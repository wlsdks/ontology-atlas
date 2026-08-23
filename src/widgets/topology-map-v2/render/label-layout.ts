/**
 * Pure label-placement helpers (from a Design Guardian legibility rejection) — no canvas, no
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
 * under the left panel lost their labels — recreating the "nameless shapes"
 * (nameless shapes) symptom the slice existed to fix. A clamped label sits at
 * the inset edge nearest its node, saying "this node is under this panel", which
 * beats silence.
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
  /** Whether the footprint lens is on and this node is one of the visited ones. */
  trailKept: boolean;
  kind: "project" | "domain" | "capability" | "element";
  isHub: boolean;
}

/**
 * **Whether a label pushed outside the chrome inset is clamped to the inset edge
 * rather than dropped.**
 *
 * The cull itself has to exist — without it, off-screen names pile up along the
 * inset edge. So the question is: would the screen lie if this name were missing?
 *
 * - What the user is looking at right now — the focus centre, ego neighbours,
 *   hover, footprint visits. (Guardian follow-up: the cull ran before the
 *   "selected ⇒ alpha 1" guarantee, so ego children under the left panel lost
 *   their names.)
 * - **The two overview-spine ranks, project and hub** (decision ledger
 *   2026-08-08 (3) ②). The node path culls against the whole viewport while this
 *   path culls against the safe rect, which left the outermost spine nodes drawn
 *   but nameless. A nameless amber hub ring breaks both the contract in
 *   `render/labels.ts` (*"if you can click it, you can read it"*, no nameless
 *   circles) and `resolveLabelPriority`, where a hub already ranks **equal to a
 *   project** — and at overview altitude the reader's question is precisely
 *   *which one is the hub* (`model/label-lod.ts`).
 *
 * Everything else — ordinary `dim`/`normal` domains, capabilities, elements —
 * still drops.
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
   * The id of this label's own node. Paired with `ReservedBox.ownerId` so a
   * label never yields to **its own** node's reservation — once node discs are
   * reserved, every label sits directly under its own node and would otherwise
   * suppress itself.
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
  /** The id of the node owning this area; that node's own label ignores the reservation. */
  ownerId?: string;
}

/**
 * Cluster chips sit at the project/hub tier (2) of the label ladder.
 *
 * rationale: a chip is an interactive affordance carrying a typed fact ("N are
 * collapsed here, click to open") — losing it to a passive element label costs the user a
 * control, while losing an element label costs one name that hover/ego restores.
 * Above 2 sit only selected/hovered labels, which the user is actively attending
 * to and which must never be silenced by a chip.
 */
export const CLUSTER_CHIP_LABEL_PRIORITY = 2;

/**
 * Where a drawn node disc ranks in the label priority ladder.
 *
 * Measured during review: with ego focus on a product node, the child label
 * "product registration" cut **15px into** the selected node's box, and the label beside it
 * was swallowed by an expand badge down to a single character. Greedy
 * suppression only knew label ↔ label overlap, never label ↔ **node shape** —
 * and a name laid over a shape makes both unreadable (Tufte: graphical
 * integrity).
 *
 * Rank 1 means selected (0) and hovered (1) labels do not yield to a disc: the
 * name the user is looking at right now disappearing behind someone else's shape
 * is the worse outcome. Passive project/domain/capability/element labels (2–5)
 * step aside — first by flipping above the node, then dropping if that is
 * blocked too (the flip logic in `topology-frame-draw.ts`).
 */
export const NODE_DISC_LABEL_PRIORITY = 1;

/**
 * Whether this bbox overlaps a **foreign** reservation, ignoring its own owner's.
 * The frame build reuses the exact test `greedyPlaceLabels` applies, so the
 * "blocked below, flip above" decision agrees with the placement — two different
 * rules here would flip a label only to drop it anyway.
 */
export function overlapsForeignReserved(
  bbox: LabelBBox,
  ownerId: string | undefined,
  priority: number,
  reserved: readonly ReservedBox[] | undefined,
): boolean {
  if (!reserved) return false;
  return reserved.some((box) => {
    // A reservation counts as one's own only when **both** owners are defined and
    // equal. Reading `undefined === undefined` as the same owner would let an
    // ownerless reservation (a cluster chip) pass an ownerless candidate through,
    // silently disabling chip suppression.
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
