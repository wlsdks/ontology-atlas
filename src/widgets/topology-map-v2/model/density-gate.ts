/**
 * The child-density threshold — the pure model layer behind "fold a crowded
 * parent into a cluster chip, expand it on click" (`docs/TOPOLOGY-V2-DESIGN.md`
 * semantic-zoom charter, "the rest expands on click" — the rest expands on
 * click — applied to large fan-outs).
 *
 * Hundreds of children under one parent (dogfood sample: the Onboarding & UX
 * domain holds 108 capabilities) smear labels and nodes into each other when
 * all are drawn at once. So a parent at or below the threshold keeps revealing
 * its children by zoom tier as before, while a parent above it folds its
 * children — and their whole subtree — into one `+N` cluster chip that expands
 * that parent alone on click. The expanded set lives in the URL (`?open=`), so
 * it is shareable and readable by an agent.
 *
 * Pure and deterministic — it knows nothing of coordinates, canvas, or camera.
 * From the contains parent→children map, the expanded-parent set, and parent
 * geometry (position + outward angle) it returns per-node clustered flags and
 * per-parent chip data. A chip anchor is the parent pushed along its outward
 * direction (the layout's own fan direction) by the child-ring radius.
 */

/**
 * A parent folds into a cluster when its child count **exceeds** this.
 *
 * 12 is the measured ceiling at which labels standing on a fan around the
 * parent still clear each other (observed live on the 295-node dogfood vault).
 * From the 13th child on, an adjacent label's horizontal extent outgrows the
 * fan spacing and the two start invading each other — that is the point where
 * always-visible switches to folding.
 */
export const DENSITY_GATE_THRESHOLD = 12;

/** Default chip radius (world units) when the parent geometry omits one. */
export const DEFAULT_CHIP_RING = 120;

/**
 * Extra clearance (world units) pushing an **expanded** chip outside the child
 * ring. A collapsed chip may sit on the ring (`ring`) because no child is drawn
 * there; expanding puts child nodes and labels on that exact ring, where they
 * smear the `− N` chip. Owner report: "The expand chip overlapped nodes and labels" (the
 * expand chip overlapped nodes and labels). Only when expanded, push this much
 * further outward so the chip stands beyond the child disc and can never
 * overlap a child node or label.
 */
export const EXPANDED_CHIP_CLEARANCE = 96;

/**
 * Chip anchor radius (parent→chip distance, world units). Collapsed = the child
 * ring (`ring`); expanded = child ring + `EXPANDED_CHIP_CLEARANCE`, outside the
 * expanded child disc. Pure and deterministic.
 */
export function chipAnchorRadius(ring: number, expanded: boolean): number {
  return expanded ? ring + EXPANDED_CHIP_CLEARANCE : ring;
}

/** Parent position + outward direction (radians, the layout fan direction). */
export interface DensityGateParentGeometry {
  x: number;
  y: number;
  /** Outward direction (radians) — the direction the layout fans children into. */
  angle: number;
  /** Child-ring radius (world units) the chip sits on. Defaults to `DEFAULT_CHIP_RING`. */
  ring?: number;
}

/** One cluster chip, consumed by the renderer and hit-testing. */
export interface ClusterChip {
  /** Node id of the collapsed (or expanded) parent. */
  parentId: string;
  /** Direct child count — engraved on the chip as `+N`. */
  count: number;
  /** True while this parent is expanded — the chip then affords collapsing (`− N`). */
  expanded: boolean;
  /** Chip world position (parent outward direction × child ring). */
  anchor: { x: number; y: number };
  /**
   * Kind of the folded children — decides the mini glyph shape (circle =
   * capability, square = element). `kindOf(first folded child)`, else undefined.
   */
  childKind?: string;
  /**
   * True for selective ego's `Neighbor +N` (neighbours +N) chip. This module never
   * produces that chip — `use-topology-loop` merges it in at runtime — but it
   * takes the same draw and hit path, so it shares the type. Clicking it reveals
   * the next neighbour batch instead of toggling the URL.
   */
  ego?: boolean;
}

export interface DensityGateInput {
  /** contains parent id → its direct child ids. */
  childrenByParent: ReadonlyMap<string, readonly string[]>;
  /** Parent slugs the user has expanded (chip click state). */
  expandedParents: ReadonlySet<string>;
  /** Per-parent position + outward direction — used only for chip anchors. */
  parentGeometry: ReadonlyMap<string, DensityGateParentGeometry>;
  /** Fold threshold (folds above it). Defaults to `DENSITY_GATE_THRESHOLD`. */
  threshold?: number;
  /**
   * Node kind lookup — **domain children are exempt from folding**, in both the
   * count and the clustering. A project's direct children (its domains) are the
   * map's spine, so folding 14 domains into a single `+N` chip because they
   * exceed the threshold of 12 erases the spine itself (reproduced with
   * `/?synth=2000`). Only capability/element children are counted and folded.
   * Omit it and every child is eligible, as before.
   */
  kindOf?: (nodeId: string) => string | undefined;
}

export interface DensityGateResult {
  /**
   * Node ids inside a collapsed parent's subtree, i.e. the ones **not drawn**.
   * The collapsed parent itself is not in here — it stays visible per spine and
   * tier, with its chip beside it.
   */
  clusteredIds: Set<string>;
  /** One per crowded parent (children > threshold), collapsed or expanded. */
  chips: ClusterChip[];
}

/**
 * Deterministic: same input, same output. Chip order follows `childrenByParent`
 * insertion order, which is the world build's own deterministic order.
 */
export function computeDensityGate(input: DensityGateInput): DensityGateResult {
  const threshold = input.threshold ?? DENSITY_GATE_THRESHOLD;
  const { childrenByParent, expandedParents, parentGeometry, kindOf } = input;

  // Domain children are exempt (they are the spine). Without kindOf, none are.
  const isExempt = (id: string): boolean => kindOf?.(id) === "domain";
  /** The children that count toward the threshold: everything but domains. */
  const gatedChildrenOf = (children: readonly string[]): readonly string[] =>
    kindOf ? children.filter((c) => !isExempt(c)) : children;

  // Crowded parent = countable children > threshold; collapsed = crowded and
  // not expanded.
  const collapsedParents = new Set<string>();
  for (const [parentId, children] of childrenByParent) {
    if (gatedChildrenOf(children).length > threshold && !expandedParents.has(parentId)) {
      collapsedParents.add(parentId);
    }
  }

  // The whole subtree of every collapsed parent, grandchildren included: even
  // when the zoom tier would reveal an element, a collapsed ancestor must hide
  // it too, or the map grows nodes with no visible parent. Domains stay visible
  // under a collapsed ancestor and are not descended into — each domain is
  // judged only by its own child count.
  const clusteredIds = new Set<string>();
  for (const parentId of collapsedParents) {
    const stack = [...(childrenByParent.get(parentId) ?? [])];
    while (stack.length > 0) {
      const id = stack.pop() as string;
      if (clusteredIds.has(id) || isExempt(id)) continue;
      clusteredIds.add(id);
      const grandChildren = childrenByParent.get(id);
      if (grandChildren) stack.push(...grandChildren);
    }
  }

  // A chip is emitted for every crowded parent that is itself visible. A nested
  // crowded parent inside a collapsed one gets none — expand the outer one first
  // and its chip appears. The count is the number of children that actually
  // fold; exempt domain children stay visible and so are excluded from `+N`.
  const chips: ClusterChip[] = [];
  for (const [parentId, children] of childrenByParent) {
    const gated = gatedChildrenOf(children);
    if (gated.length <= threshold) continue;
    if (clusteredIds.has(parentId)) continue;
    const geometry = parentGeometry.get(parentId);
    if (!geometry) continue;
    const ring = geometry.ring ?? DEFAULT_CHIP_RING;
    const expanded = expandedParents.has(parentId);
    // Expanded chips stand outside the child disc so they never overlap it.
    const anchorRadius = chipAnchorRadius(ring, expanded);
    chips.push({
      parentId,
      count: gated.length,
      expanded,
      anchor: {
        x: geometry.x + Math.cos(geometry.angle) * anchorRadius,
        y: geometry.y + Math.sin(geometry.angle) * anchorRadius,
      },
      childKind: kindOf?.(gated[0]),
    });
  }

  return { clusteredIds, chips };
}
