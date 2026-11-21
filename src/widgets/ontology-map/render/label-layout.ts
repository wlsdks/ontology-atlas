/**
 * Pure label-placement helpers, no canvas or tokens: `isWithinSafeRect` (the visible area minus panels and
 * chrome), `greedyPlaceLabels` (priority bbox suppression: project > domain > capability > element) and
 * `ellipsizeToWidth` (word-boundary ellipsis; mid-word only for one unbreakable token).
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

/** Keep fading labels only where they cannot cover a currently placed name. */
export function filterFadingLabelCollisions<T>(
  entries: readonly T[],
  isPlaced: (entry: T) => boolean,
  boxFor: (entry: T) => LabelBBox | undefined,
): T[] {
  const occupied = entries.filter(isPlaced).map(boxFor).filter((box): box is LabelBBox => box !== undefined);
  return entries.filter(entry => {
    if (isPlaced(entry)) return true;
    const box = boxFor(entry);
    if (!box || occupied.some(other => bboxesOverlap(box, other))) return false;
    occupied.push(box);
    return true;
  });
}

export function isWithinSafeRect(x: number, y: number, rect: SafeRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/**
 * Clamps a label anchor into the safe rect instead of dropping it, for ego-protected labels whose node sits
 * under a chrome inset: a label at the inset edge says "this node is under this panel", which beats silence.
 * `marginX`/`marginY` keep the text box itself inside the rect.
 */
/**
 * A label whose slot below the node falls under the floor band takes the slot above instead, when
 * the node is on screen and that slot is inside the safe rect. Returns the baseline to use, or
 * null when the ordinary gate should decide.
 */
export function floorFlipBaseline(
  anchorX: number,
  anchorY: number,
  flippedBaselineY: number,
  screenY: number,
  rect: SafeRect,
  viewportHeight: number,
): number | null {
  if (anchorY <= rect.bottom) return null;
  if (screenY > viewportHeight) return null;
  return isWithinSafeRect(anchorX, flippedBaselineY, rect) ? flippedBaselineY : null;
}

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
 * Whether a label pushed outside the chrome inset is clamped to the inset edge rather than dropped.
 * Protected: the focus centre, ego neighbours, hover, footprint visits, and the project and hub
 * spine ranks, since a drawn spine node without a name breaks `render/labels.ts`. The rest drops.
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
  /** This label's own node id: with node discs reserved every label sits under its own node and would suppress itself (`ReservedBox.ownerId`). */
  ownerId?: string;
  /** A second box to try when `bbox` is taken: the slot above the node. */
  altBbox?: LabelBBox;
  usedAlt?: boolean;
  payload: T;
}

export interface LabelPriorityInput {
  kind: "project" | "domain" | "capability" | "element";
  isSelected: boolean;
  isHovered: boolean;
  isHub: boolean;
  /** The node a lens was opened to show (a path or constellation member); it takes the top band. */
  isLensSubject?: boolean;
}

/** Collision-culling ladder, lower wins `greedyPlaceLabels`: selected > hovered > project/hub > domain > capability > element. */
export function resolveLabelPriority(input: LabelPriorityInput): number {
  if (input.isLensSubject) return 0;
  if (input.isSelected) return 0;
  if (input.isHovered) return 1;
  if (input.kind === "project" || input.isHub) return 2;
  if (input.kind === "domain") return 3;
  if (input.kind === "capability") return 4;
  return 5;
}

/**
 * A non-label surface that owns screen area (density-gate cluster chips), ranked on the same ladder as
 * `resolveLabelPriority`; a candidate yields only when its number is strictly larger. A priority, not an
 * absolute block, so a chip never silences the selected (0) or hovered (1) label (`CLUSTER_CHIP_LABEL_PRIORITY`).
 */
export interface ReservedBox {
  bbox: LabelBBox;
  priority: number;
  /** The id of the node owning this area; that node's own label ignores the reservation. */
  ownerId?: string;
}

/**
 * Chips sit at the project/hub tier (2): losing a chip costs the user a control, losing an element label
 * costs one name that hover restores. Only selected and hovered labels rank above.
 */
export const CLUSTER_CHIP_LABEL_PRIORITY = 2;

/**
 * Where a drawn node disc ranks in the ladder. Rank 1 keeps the selected (0) and hovered (1) labels from
 * yielding to a disc; passive labels (2-5) flip above the node, then drop if blocked
 * (`ui/frame-draw/labels/paint-labels.ts`). Label-vs-label suppression alone let a name cut into a node.
 */
export const NODE_DISC_LABEL_PRIORITY = 1;

/**
 * Whether this bbox overlaps a reservation of a different label. Uses the same test as
 * `greedyPlaceLabels`, so the "blocked below, flip above" decision agrees with the placement.
 */
export function overlapsForeignReserved(
  bbox: LabelBBox,
  ownerId: string | undefined,
  priority: number,
  reserved: readonly ReservedBox[] | undefined,
): boolean {
  if (!reserved) return false;
  return reserved.some((box) => blocksForeign(box, bbox, ownerId, priority));
}

function blocksForeign(box: ReservedBox, bbox: LabelBBox, ownerId: string | undefined, priority: number): boolean {
  if (box.ownerId !== undefined && box.ownerId === ownerId) return false;
  return priority > box.priority && bboxesOverlap(box.bbox, bbox);
}

const BOX_GRID_CELL_PX = 48;
const BOX_GRID_MAX_SIDE = 128;

function finiteBounds(boxes: readonly LabelBBox[]): LabelBBox {
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const widen = (x: number, y: number) => {
    if (Number.isFinite(x)) {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.maxX = Math.max(bounds.maxX, x);
    }
    if (Number.isFinite(y)) {
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  };
  for (const box of boxes) {
    widen(box.minX, box.minY);
    widen(box.maxX, box.maxY);
  }
  if (bounds.minX > bounds.maxX) {
    bounds.minX = 0;
    bounds.maxX = 1;
  }
  if (bounds.minY > bounds.maxY) {
    bounds.minY = 0;
    bounds.maxY = 1;
  }
  return bounds;
}

class BoxGrid<T> {
  private readonly x0: number;
  private readonly y0: number;
  private readonly cell: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly buckets: (T[] | undefined)[];

  constructor(bounds: LabelBBox) {
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    this.cell = Math.max(BOX_GRID_CELL_PX, width / BOX_GRID_MAX_SIDE, height / BOX_GRID_MAX_SIDE);
    this.x0 = bounds.minX;
    this.y0 = bounds.minY;
    this.cols = Math.max(1, Math.ceil(width / this.cell));
    this.rows = Math.max(1, Math.ceil(height / this.cell));
    this.buckets = new Array(this.cols * this.rows);
  }

  private column(x: number): number {
    return Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.x0) / this.cell)));
  }

  private row(y: number): number {
    return Math.min(this.rows - 1, Math.max(0, Math.floor((y - this.y0) / this.cell)));
  }

  insert(box: LabelBBox, item: T): void {
    const c0 = this.column(box.minX);
    const c1 = this.column(box.maxX);
    for (let r = this.row(box.minY), r1 = this.row(box.maxY); r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        const bucket = this.buckets[r * this.cols + c];
        if (bucket === undefined) this.buckets[r * this.cols + c] = [item];
        else bucket.push(item);
      }
    }
  }

  some(box: LabelBBox, test: (item: T) => boolean): boolean {
    const c0 = this.column(box.minX);
    const c1 = this.column(box.maxX);
    for (let r = this.row(box.minY), r1 = this.row(box.maxY); r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        const bucket = this.buckets[r * this.cols + c];
        if (bucket === undefined) continue;
        for (const item of bucket) if (test(item)) return true;
      }
    }
    return false;
  }
}

export class ReservedBoxIndex {
  private readonly grid: BoxGrid<ReservedBox>;

  constructor(reserved: readonly ReservedBox[]) {
    this.grid = new BoxGrid(finiteBounds(reserved.map((box) => box.bbox)));
    for (const box of reserved) this.grid.insert(box.bbox, box);
  }

  overlapsForeign(bbox: LabelBBox, ownerId: string | undefined, priority: number): boolean {
    return this.grid.some(bbox, (box) => blocksForeign(box, bbox, ownerId, priority));
  }
}

/**
 * Greedy priority suppression: sort by priority, then `order`; place a label only if its bbox overlaps no
 * placed one. Deterministic. `reserved` lets non-label surfaces own screen area: a lower-ranked candidate
 * overlapping one is dropped. `isPreferred` breaks ties within one priority tier (a label placed last frame
 * keeps its slot); kind priority still dominates.
 */
export function greedyPlaceLabels<T>(
  candidates: readonly LabelCandidate<T>[],
  isPreferred?: (candidate: LabelCandidate<T>) => boolean,
  reserved?: readonly ReservedBox[] | ReservedBoxIndex,
): LabelCandidate<T>[] {
  const ranked = candidates.map((candidate) => ({ candidate, preferred: isPreferred?.(candidate) ? 0 : 1 }));
  ranked.sort((a, b) => {
    if (a.candidate.priority !== b.candidate.priority) return a.candidate.priority - b.candidate.priority;
    if (a.preferred !== b.preferred) return a.preferred - b.preferred;
    return a.candidate.order - b.candidate.order;
  });
  const reservedIndex =
    reserved === undefined ? null : reserved instanceof ReservedBoxIndex ? reserved : new ReservedBoxIndex(reserved);
  const boxes: LabelBBox[] = [];
  for (const candidate of candidates) {
    boxes.push(candidate.bbox);
    if (candidate.altBbox) boxes.push(candidate.altBbox);
  }
  const occupied = new BoxGrid<LabelBBox>(finiteBounds(boxes));
  const placed: LabelCandidate<T>[] = [];
  const free = (box: LabelBBox, candidate: LabelCandidate<T>): boolean =>
    !(reservedIndex?.overlapsForeign(box, candidate.ownerId, candidate.priority) ?? false) &&
    !occupied.some(box, (other) => bboxesOverlap(other, box));
  for (const { candidate } of ranked) {
    if (free(candidate.bbox, candidate)) {
      placed.push(candidate);
      occupied.insert(candidate.bbox, candidate.bbox);
      continue;
    }
    if (candidate.altBbox && free(candidate.altBbox, candidate)) {
      placed.push({ ...candidate, bbox: candidate.altBbox, usedAlt: true });
      occupied.insert(candidate.altBbox, candidate.altBbox);
    }
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

  let best = "";
  for (let i = 1; i < text.length; i += 1) {
    if (!BOUNDARY.test(text[i])) continue;
    const prefix = text.slice(0, i);
    if (measure(prefix + ELLIPSIS) <= maxWidth) best = prefix;
  }
  if (best !== "") return best + ELLIPSIS;

  for (let i = text.length - 1; i >= 1; i -= 1) {
    const prefix = text.slice(0, i);
    if (measure(prefix + ELLIPSIS) <= maxWidth) return prefix + ELLIPSIS;
  }
  return ELLIPSIS;
}
