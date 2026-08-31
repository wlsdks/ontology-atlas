type RouteAskDockBranch = "runtime" | "key";

export type RouteAskDockRequest = {
  key: string;
  branch: RouteAskDockBranch;
};

type RouteAskDockSyncInput = {
  requestKey: string | null;
  branch: RouteAskDockBranch;
  touched: boolean;
  previous: RouteAskDockRequest | null;
};

type RouteAskDockSyncPlan = {
  next: RouteAskDockRequest | null;
  shouldOpen: boolean;
  resetTouched: boolean;
};

/**
 * Plans the one route-request transition that may open the agent dock.
 *
 * A new request outranks an older manual close. Re-rendering the same request
 * is inert, while asynchronous runtime discovery may move that request from the
 * fallback key branch to the runtime branch once. A close marks the dock touched
 * and blocks every same-request transition until the URL request disappears.
 */
export function planRouteAskDockSync({
  requestKey,
  branch,
  touched,
  previous,
}: RouteAskDockSyncInput): RouteAskDockSyncPlan {
  if (!requestKey) {
    return { next: null, shouldOpen: false, resetTouched: false };
  }

  const sameRequest = previous?.key === requestKey;
  if (!sameRequest) {
    return {
      next: { key: requestKey, branch },
      shouldOpen: true,
      resetTouched: true,
    };
  }

  if (touched || previous.branch === branch) {
    return { next: previous, shouldOpen: false, resetTouched: false };
  }

  return {
    next: { key: requestKey, branch },
    shouldOpen: true,
    resetTouched: false,
  };
}
