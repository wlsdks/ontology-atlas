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

/** Standard AABB overlap (touching edges do NOT count as overlap). */
export function bboxesOverlap(a: LabelBBox, b: LabelBBox): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

export interface LabelCandidate<T> {
  /** Lower = higher priority. project 0 · domain 1 · capability 2 · element 3. */
  priority: number;
  /** Stable tie-break within a priority — pass the node's draw index for determinism. */
  order: number;
  bbox: LabelBBox;
  payload: T;
}

/**
 * Greedy priority suppression: sort by priority (then stable `order`), place a
 * label only if its bbox doesn't overlap any already-placed one. Deterministic —
 * identical input → identical placed list.
 */
export function greedyPlaceLabels<T>(candidates: readonly LabelCandidate<T>[]): LabelCandidate<T>[] {
  const sorted = [...candidates].sort((a, b) => a.priority - b.priority || a.order - b.order);
  const placed: LabelCandidate<T>[] = [];
  for (const candidate of sorted) {
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
