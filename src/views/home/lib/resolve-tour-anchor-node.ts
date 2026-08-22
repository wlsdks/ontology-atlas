/**
 * Resolves the guided tour's canvas-node anchor to a real graph node id. The
 * feature layer must not know the widget's graph types (FSD forbids
 * feature -> widgets), so the view layer resolves it and passes only the id down
 * as `TopologyMapV2Props.tourAnchorNodeId`.
 *
 * - `target: "project"` — the first project node, else the first domain node.
 * - `target: "domain"` — the first domain node, falling back to a project.
 *   **It must not aim at an `isHub` node** (corrected against measurement,
 *   2026-07-23): hubs sit in the capability tier, so in the spine view they are
 *   folded into a "+N" cluster chip, and clicking those coordinates expands the
 *   cluster (a full relayout into element view) instead of selecting — which
 *   stalled the tour permanently at the interactive step. A domain always
 *   renders in the spine tier and a click there is a selection, which makes the
 *   step's auto-advance (`hasSelection` false -> true) deterministic.
 *
 * `null` when neither is found; the caller then skips that step.
 */
export interface TourAnchorCandidateNode {
  id: string;
  kind: string;
  isHub: boolean;
}

export function resolveTourAnchorNodeId(
  nodes: readonly TourAnchorCandidateNode[],
  target: "project" | "domain",
): string | null {
  const project = nodes.find((n) => n.kind === "project");
  const domain = nodes.find((n) => n.kind === "domain");
  if (target === "domain") {
    return domain?.id ?? project?.id ?? null;
  }
  return project?.id ?? domain?.id ?? null;
}
