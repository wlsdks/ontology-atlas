import { describe, expect, it } from "vitest";
import {
  planRouteAskDockSync,
  type RouteAskDockRequest,
} from "./route-ask-dock-sync";

describe("route ask dock synchronization", () => {
  it("opens a new request once and keeps ordinary rerenders inert", () => {
    const first = planRouteAskDockSync({
      requestKey: "business-flow:request",
      branch: "key",
      touched: true,
      previous: null,
    });
    expect(first).toEqual({
      next: { key: "business-flow:request", branch: "key" },
      shouldOpen: true,
      resetTouched: true,
    });

    expect(
      planRouteAskDockSync({
        requestKey: "business-flow:request",
        branch: "key",
        touched: false,
        previous: first.next,
      }),
    ).toEqual({
      next: first.next,
      shouldOpen: false,
      resetTouched: false,
    });
  });

  it("moves the same request from the fallback branch to a discovered runtime once", () => {
    const previous: RouteAskDockRequest = {
      key: "business-flow:request",
      branch: "key",
    };
    const moved = planRouteAskDockSync({
      requestKey: previous.key,
      branch: "runtime",
      touched: false,
      previous,
    });
    expect(moved).toEqual({
      next: { key: previous.key, branch: "runtime" },
      shouldOpen: true,
      resetTouched: false,
    });
    expect(
      planRouteAskDockSync({
        requestKey: previous.key,
        branch: "runtime",
        touched: false,
        previous: moved.next,
      }).shouldOpen,
    ).toBe(false);
  });

  it("does not reopen while close is waiting for the URL request to clear", () => {
    const previous: RouteAskDockRequest = {
      key: "business-flow:request",
      branch: "runtime",
    };
    expect(
      planRouteAskDockSync({
        requestKey: previous.key,
        branch: "key",
        touched: true,
        previous,
      }),
    ).toEqual({
      next: previous,
      shouldOpen: false,
      resetTouched: false,
    });
  });

  it("clears its memory with the URL and lets a later explicit request open", () => {
    const previous: RouteAskDockRequest = {
      key: "business-flow:request",
      branch: "runtime",
    };
    const cleared = planRouteAskDockSync({
      requestKey: null,
      branch: "runtime",
      touched: true,
      previous,
    });
    expect(cleared).toEqual({
      next: null,
      shouldOpen: false,
      resetTouched: false,
    });

    expect(
      planRouteAskDockSync({
        requestKey: "node:new-request",
        branch: "runtime",
        touched: true,
        previous: cleared.next,
      }),
    ).toEqual({
      next: { key: "node:new-request", branch: "runtime" },
      shouldOpen: true,
      resetTouched: true,
    });
  });
});
