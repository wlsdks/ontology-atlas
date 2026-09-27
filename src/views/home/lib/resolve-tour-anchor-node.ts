/**
 * Resolves the guided tour's canvas anchor to a graph node id here, since features must not import
 * widget types. `project` takes the first project, else a domain; `domain` the first domain, else a
 * project. Never an `isHub` node: hubs fold into a "+N" cluster chip whose click relayouts instead
 * of selecting, which stalls the tour's `hasSelection` auto-advance. `null` when neither exists;
 * the caller skips the step.
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
