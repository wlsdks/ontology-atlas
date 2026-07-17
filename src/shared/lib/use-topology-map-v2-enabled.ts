import { useCallback, useSyncExternalStore } from "react";

import { isTopologyMapV2Enabled } from "@/shared/config/feature-flags";

/**
 * React-safe reader for the `topology-map-v2` feature flag
 * (`docs/TOPOLOGY-V2-DESIGN.md` §4 P2). Same `useSyncExternalStore` pattern
 * as `use-local-storage-boolean.ts` — the server snapshot is always `false`
 * (no `window` during the static-export prerender), so the very first client
 * render matches the server render exactly (no hydration mismatch), and the
 * real flag value (query param or localStorage) only takes effect once
 * React re-checks the snapshot post-mount. This intentionally avoids a
 * `useEffect` + `setState` pair, which `react-hooks/set-state-in-effect`
 * flags as an anti-pattern for exactly this "read an external source once
 * mounted" case.
 */
export function useTopologyMapV2Enabled(): boolean {
  const getSnapshot = useCallback(() => isTopologyMapV2Enabled(), []);
  const getServerSnapshot = useCallback(() => false, []);
  return useSyncExternalStore(() => () => undefined, getSnapshot, getServerSnapshot);
}
