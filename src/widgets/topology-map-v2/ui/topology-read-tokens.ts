/**
 * Shared `getTopologyV2Tokens()` wrapper for the UI layer — swallows
 * `TopologyV2TokenError` into a console error + `null` so per-frame/per-event
 * callers can bail out safely on token drift instead of crashing the canvas.
 */

import { getTopologyV2Tokens, TopologyV2TokenError, type TopologyV2Tokens } from "../tokens/read-topology-v2-tokens";

// Re-review friction E — the same drift message is not printed every frame. An early
// read right after a remount, before CSS applies, was demonstrated to produce 1,200+
// messages of spam per session. One log per distinct message — a new kind of drift is
// still visible.
const loggedDriftMessages = new Set<string>();

export function readTopologyV2TokensOrNull(): TopologyV2Tokens | null {
  try {
    return getTopologyV2Tokens();
  } catch (err) {
    if (err instanceof TopologyV2TokenError && !loggedDriftMessages.has(err.message)) {
      loggedDriftMessages.add(err.message);
      console.error("[topology-map-v2] token drift:", err.message);
    }
    return null;
  }
}
