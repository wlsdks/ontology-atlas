import { describe, expect, it } from "vitest";
import { createHistoryWriteGuard, HISTORY_WRITE_BUDGET } from "./history-write-guard";

describe("history write guard", () => {
  it("stays under WebKit's 100-per-10s limit and reports a runaway once", () => {
    const refused: number[] = [];
    const guard = createHistoryWriteGuard(HISTORY_WRITE_BUDGET, 10_000, (n) => refused.push(n));
    let allowed = 0;
    for (let i = 0; i < 500; i += 1) if (guard.allow(i * 10)) allowed += 1;
    expect(allowed).toBe(HISTORY_WRITE_BUDGET);
    expect(HISTORY_WRITE_BUDGET).toBeLessThan(100);
    expect(refused).toEqual([HISTORY_WRITE_BUDGET]);
  });

  it("lets writes through again once the window has passed", () => {
    const guard = createHistoryWriteGuard(3, 1_000);
    expect([0, 1, 2, 3].map((t) => guard.allow(t))).toEqual([true, true, true, false]);
    expect(guard.allow(1_001)).toBe(true);
  });
});
