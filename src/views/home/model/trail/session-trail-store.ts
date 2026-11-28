import { useSyncExternalStore } from "react";

import { appendFootprintVisit } from "../../lib/trail/footprint-trail";

/**
 * The visited trail for the app session: module state, so leaving the map for another destination
 * and coming back keeps the walk, while a reload starts fresh. It holds one folder's walk; another
 * folder replaces it. Nothing here is written to disk.
 */
interface SessionTrail {
  scope: string | null;
  steps: readonly string[];
}

const NO_STEPS: readonly string[] = Object.freeze([]);

let sessionTrail: SessionTrail = { scope: null, steps: NO_STEPS };
const listeners = new Set<() => void>();

function publish(next: SessionTrail) {
  sessionTrail = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readSessionTrail(): SessionTrail {
  return sessionTrail;
}

/** "switched" when the store held another folder's walk, which it drops. */
export function adoptSessionTrailScope(scope: string): "same" | "switched" | "first" {
  if (sessionTrail.scope === scope) return "same";
  const previous = sessionTrail.scope;
  publish({ scope, steps: NO_STEPS });
  return previous === null ? "first" : "switched";
}

export function visitSessionTrail(scope: string, nodeId: string) {
  const steps = sessionTrail.scope === scope ? sessionTrail.steps : NO_STEPS;
  if (steps[steps.length - 1] === nodeId) return;
  publish({ scope, steps: appendFootprintVisit(steps, nodeId) });
}

export function clearSessionTrail(scope: string) {
  if (sessionTrail.scope !== scope || sessionTrail.steps.length === 0) return;
  publish({ scope, steps: NO_STEPS });
}

/** The open folder's steps, oldest first, revisits included; empty for any other folder. */
export function useSessionTrailSteps(scope: string | null): readonly string[] {
  const trail = useSyncExternalStore(subscribe, readSessionTrail, readSessionTrail);
  return scope !== null && trail.scope === scope ? trail.steps : NO_STEPS;
}
