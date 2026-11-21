/**
 * Shared `readOntologyMapTokens()` wrapper for the UI layer — swallows
 * `OntologyMapTokenError` into a console error + `null` so per-frame/per-event
 * callers can bail out safely on token drift instead of crashing the canvas.
 */

import { readOntologyMapTokens, OntologyMapTokenError, type OntologyMapTokens } from "./read-map-tokens";

// One log per distinct drift message: an early read right after a remount, before CSS applies, produced 1,200+ messages per session.
const loggedDriftMessages = new Set<string>();

export function readOntologyMapTokensOrNull(): OntologyMapTokens | null {
  try {
    return readOntologyMapTokens();
  } catch (error) {
    if (error instanceof OntologyMapTokenError && !loggedDriftMessages.has(error.message)) {
      loggedDriftMessages.add(error.message);
      console.error("[ontology-map] token drift:", error.message);
    }
    return null;
  }
}
