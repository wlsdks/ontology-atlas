/**
 * Decides how (and whether) an unresolved `?p=` deep link on the topology
 * hub should surface the shared "not found" fallback toast.
 *
 * Cross-verified UX expert round (2026-07-19, `_verification-ledger.md`
 * item 3): a *kind-prefixed* slug (`?p=element:foo`) already got an
 * immediate, visible toast when it matched neither an ontology node nor a
 * project — kind-prefixed values can never collide with a project slug
 * (project slugs never contain `:`), so there's nothing to wait for. A
 * *bare* slug (`?p=project`) had no such guarantee: it waited for the
 * project list to finish loading before ruling itself out (correct — the
 * bare form could still turn out to be a real project slug), but if that
 * load never settled (stuck vault reconnect, permission prompt never
 * answered, disk read error, …) the wait never ended and the miss stayed
 * silent forever. This module gives the bare-slug case the same bounded
 * fate as the kind-prefixed one: wait for the project list, but only up to
 * a grace window — past that, notify anyway rather than staying silent.
 */

export type DeeplinkMissDecision =
  | { action: "none" }
  | { action: "notify-now" }
  | { action: "notify-after-grace" };

export interface DeeplinkMissDecisionInput {
  /** The raw `?p=` value, or `null`/`""` when there is no deep link. */
  selectedSlug: string | null;
  /** Whether `selectedSlug` resolved to a node in the ontology graph. */
  hasOntologyMatch: boolean;
  /** Whether `selectedSlug` resolved to a project's `slug`. */
  hasProjectMatch: boolean;
  /** `useProjects().loaded` — whether the project list has settled. */
  projectsLoaded: boolean;
  /**
   * Whether the persisted vault restore and current ontology source have
   * settled enough to diagnose absence. False while startup/open/reload can
   * still replace the transient static sample with a local graph.
   */
  sourceReady: boolean;
}

/**
 * Pure gate — no timers, no toast side effect. The caller (`HomePage`)
 * turns `"notify-now"` into an immediate toast and `"notify-after-grace"`
 * into a bounded `setTimeout` that fires the same toast once the grace
 * window elapses (cancelled early if the slug resolves in the meantime).
 */
export function resolveDeeplinkMissDecision({
  selectedSlug,
  hasOntologyMatch,
  hasProjectMatch,
  projectsLoaded,
  sourceReady,
}: DeeplinkMissDecisionInput): DeeplinkMissDecision {
  if (!selectedSlug) return { action: "none" };
  if (hasOntologyMatch || hasProjectMatch) return { action: "none" };
  if (!sourceReady) return { action: "none" };

  const isKindPrefixed = selectedSlug.includes(":");
  if (isKindPrefixed || projectsLoaded) return { action: "notify-now" };

  return { action: "notify-after-grace" };
}
