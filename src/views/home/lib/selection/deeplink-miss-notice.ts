/**
 * Decides whether an unresolved `?p=` deep link shows the "not found" toast. A kind-prefixed slug
 * can never be a project slug (no `:`), so it notifies at once; a bare slug waits for the project
 * list, but only for a grace window, or a stuck load keeps the miss silent forever. A selection
 * that resolved earlier and then vanished (undone, deleted, renamed elsewhere) is no broken link: it
 * deselects quietly.
 */

export type DeeplinkMissDecision =
  | { action: "none" }
  | { action: "notify-now" }
  | { action: "notify-after-grace" }
  | { action: "deselect" };

export interface DeeplinkMissDecisionInput {
  selectedSlug: string | null;
  hasOntologyMatch: boolean;
  hasProjectMatch: boolean;
  projectsLoaded: boolean;
  /** False while startup, open or reload can still replace the static sample with a local graph. */
  sourceReady: boolean;
  /** This slug resolved to a node earlier in the session. */
  resolvedBefore: boolean;
}

/** Pure gate: the caller turns "notify-after-grace" into a cancellable timeout. */
export function resolveDeeplinkMissDecision({
  selectedSlug,
  hasOntologyMatch,
  hasProjectMatch,
  projectsLoaded,
  sourceReady,
  resolvedBefore,
}: DeeplinkMissDecisionInput): DeeplinkMissDecision {
  if (!selectedSlug) return { action: "none" };
  if (hasOntologyMatch || hasProjectMatch) return { action: "none" };
  if (!sourceReady) return { action: "none" };
  if (resolvedBefore) return { action: "deselect" };

  const isKindPrefixed = selectedSlug.includes(":");
  if (isKindPrefixed || projectsLoaded) return { action: "notify-now" };

  return { action: "notify-after-grace" };
}
