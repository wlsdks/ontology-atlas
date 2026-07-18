import { useCallback, useSyncExternalStore } from "react";

import { isTopologyMapV2Enabled } from "@/shared/config/feature-flags";

/**
 * React-safe reader for the `topology-map-v2` feature flag
 * (`docs/TOPOLOGY-V2-DESIGN.md` §4 P2). Same `useSyncExternalStore` pattern
 * as `use-local-storage-boolean.ts`. The server snapshot is `true` — matching
 * the P6 default-on flip (2026-07-18): with the old `false` snapshot every
 * reload mounted the LEGACY canvas for the first client render (hydration
 * parity) and only then swapped to v2 — the owner's "가끔 리로딩할때 예전게
 * 보임" flash. Default-on makes the v2 engine the first paint; only the
 * `?mapEngine=legacy` / localStorage `"false"` escape hatch re-checks to
 * legacy post-mount (an acceptable inverse flash for a safety valve). This
 * intentionally avoids a `useEffect` + `setState` pair, which
 * `react-hooks/set-state-in-effect` flags as an anti-pattern for exactly this
 * "read an external source once mounted" case.
 */
export function useTopologyMapV2Enabled(): boolean {
  const getSnapshot = useCallback(() => isTopologyMapV2Enabled(), []);
  const getServerSnapshot = useCallback(() => true, []);
  return useSyncExternalStore(() => () => undefined, getSnapshot, getServerSnapshot);
}
