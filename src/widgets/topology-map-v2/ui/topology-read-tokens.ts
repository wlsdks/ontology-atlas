/**
 * Shared `getTopologyV2Tokens()` wrapper for the UI layer — swallows
 * `TopologyV2TokenError` into a console error + `null` so per-frame/per-event
 * callers can bail out safely on token drift instead of crashing the canvas.
 */

import { getTopologyV2Tokens, TopologyV2TokenError, type TopologyV2Tokens } from "../tokens/read-topology-v2-tokens";

export function readTopologyV2TokensOrNull(): TopologyV2Tokens | null {
  try {
    return getTopologyV2Tokens();
  } catch (err) {
    if (err instanceof TopologyV2TokenError) console.error("[topology-map-v2] token drift:", err.message);
    return null;
  }
}
