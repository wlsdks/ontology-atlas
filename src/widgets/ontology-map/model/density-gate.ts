/**
 * Folds a crowded parent's subtree into one `+N` chip that expands that parent alone on
 * click (`docs/design/ontology-map.md`, "the rest expands on click"). The expanded set lives
 * in `?open=` so it is shareable. Pure and deterministic; O(N) over the containment map
 * with Sets for the folded and held-open ids.
 */

/**
 * Folds above this: the measured ceiling at which labels on a fan around the parent still
 * clear each other on the dogfood vault.
 */
export const DENSITY_GATE_THRESHOLD = 12;

export const DEFAULT_CHIP_RING = 120;

/**
 * Expanding draws children on the chip's ring, so an expanded chip stands this far
 * beyond the child disc and never overlaps a child node or label.
 */
export const EXPANDED_CHIP_CLEARANCE = 96;

export function chipAnchorRadius(ring: number, expanded: boolean): number {
  return expanded ? ring + EXPANDED_CHIP_CLEARANCE : ring;
}

export interface DensityGateParentGeometry {
  x: number;
  y: number;
  /** Outward fan direction in radians; the chip sits along it. */
  angle: number;
  /** Defaults to `DEFAULT_CHIP_RING`. */
  ring?: number;
}

export interface ClusterChip {
  parentId: string;
  /**
   * The whole folded subtree, the same number the node badge and the INDEX row state: every
   * capability and element the spine places here, minus visible domains and held-open nodes.
   */
  count: number;
  /** While expanded the chip affords collapsing (`− N`). */
  expanded: boolean;
  anchor: { x: number; y: number };
  /** Picks the mini glyph (circle = capability, square = element) from the first folded child. */
  childKind?: string;
  /**
   * Selective ego's `Neighbor +N` chip, merged in by `use-topology-loop` on the same draw and
   * hit path; clicking it reveals the next neighbour batch instead of toggling the URL.
   */
  ego?: boolean;
}

export interface DensityGateInput {
  childrenByParent: ReadonlyMap<string, readonly string[]>;
  expandedParents: ReadonlySet<string>;
  /** Used only for chip anchors. */
  parentGeometry: ReadonlyMap<string, DensityGateParentGeometry>;
  /** Folds above it. Defaults to `DENSITY_GATE_THRESHOLD`. */
  threshold?: number;
  /**
   * Domain children are exempt from counting and folding: they are the map's spine. Omitted,
   * every child is eligible.
   */
  kindOf?: (nodeId: string) => string | undefined;
  /**
   * The focused node's 1-hop neighbours under another parent stay drawn, so the ego graph
   * shows every relation the panel lists; their own children still fold.
   */
  heldOpen?: ReadonlySet<string>;
}

export interface DensityGateResult {
  /** Ids not drawn; the collapsed parent itself stays visible beside its chip. */
  clusteredIds: Set<string>;
  chips: ClusterChip[];
}

/** Chip order follows `childrenByParent` insertion order, the world build's order. */
export function computeDensityGate(input: DensityGateInput): DensityGateResult {
  const threshold = input.threshold ?? DENSITY_GATE_THRESHOLD;
  const { childrenByParent, expandedParents, parentGeometry, kindOf } = input;
  const heldOpen = input.heldOpen ?? null;

  const isExempt = (id: string): boolean => kindOf?.(id) === "domain";
  const gatedChildrenOf = (children: readonly string[]): readonly string[] =>
    kindOf ? children.filter((c) => !isExempt(c)) : children;

  /**
   * Both the hidden set and the chip's `+N` read this one walk, so the chip number is by
   * construction the number of nodes it hides.
   */
  const foldedSubtreeOf = (parentId: string): string[] => {
    const folded: string[] = [];
    const seen = new Set<string>();
    const stack = [...(childrenByParent.get(parentId) ?? [])];
    while (stack.length > 0) {
      const id = stack.pop() as string;
      if (seen.has(id) || isExempt(id)) continue;
      seen.add(id);
      if (!heldOpen?.has(id)) folded.push(id);
      const grandChildren = childrenByParent.get(id);
      if (grandChildren) stack.push(...grandChildren);
    }
    return folded;
  };

  const collapsedParents = new Set<string>();
  for (const [parentId, children] of childrenByParent) {
    if (gatedChildrenOf(children).length > threshold && !expandedParents.has(parentId)) {
      collapsedParents.add(parentId);
    }
  }

  // A collapsed ancestor hides its whole subtree even where the tier would reveal it, or
  // nodes appear without a visible parent. Domains are not descended into.
  const clusteredIds = new Set<string>();
  for (const parentId of collapsedParents) {
    for (const id of foldedSubtreeOf(parentId)) clusteredIds.add(id);
  }

  // A crowded parent inside a collapsed one gets no chip until the outer one expands.
  const chips: ClusterChip[] = [];
  for (const [parentId, children] of childrenByParent) {
    const gated = gatedChildrenOf(children);
    if (gated.length <= threshold) continue;
    if (clusteredIds.has(parentId)) continue;
    const geometry = parentGeometry.get(parentId);
    if (!geometry) continue;
    const ring = geometry.ring ?? DEFAULT_CHIP_RING;
    const expanded = expandedParents.has(parentId);
    const folded = foldedSubtreeOf(parentId);
    // The glyph names the rank the chip sits on, so it reads the direct children.
    const foldedChildren = heldOpen ? gated.filter((c) => !heldOpen.has(c)) : gated;
    if (foldedChildren.length === 0 && !expanded) continue;
    const anchorRadius = chipAnchorRadius(ring, expanded);
    chips.push({
      parentId,
      count: folded.length,
      expanded,
      anchor: {
        x: geometry.x + Math.cos(geometry.angle) * anchorRadius,
        y: geometry.y + Math.sin(geometry.angle) * anchorRadius,
      },
      childKind: kindOf?.(foldedChildren[0] ?? gated[0]),
    });
  }

  return { clusteredIds, chips };
}
