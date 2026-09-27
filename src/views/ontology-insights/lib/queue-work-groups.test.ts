import { describe, expect, it } from "vitest";
import {
  groupOfQueueSection,
  queueGroupOrder,
  queueGroupOrderKey,
  sumQueueGroupCounts,
} from "./queue-work-groups";

describe("queue-work-groups", () => {
  it("groups sections answered by meaning as meaning work and those needing outside reading as code work", () => {
    expect(groupOfQueueSection("missing-definition")).toBe("meaning");
    expect(groupOfQueueSection("missing-domain")).toBe("meaning");
    expect(groupOfQueueSection("duplicate")).toBe("meaning");
    expect(groupOfQueueSection("promotion")).toBe("meaning");
    expect(groupOfQueueSection("neglected-hub")).toBe("code");
    expect(groupOfQueueSection("orphan")).toBe("code");
    expect(groupOfQueueSection("cycle")).toBe("code");
  });

  it("puts own work first when writable and handoff work first when read-only", () => {
    expect(queueGroupOrder({ canWriteVault: true, agentObserved: false })).toEqual([
      "meaning",
      "code",
    ]);
    expect(queueGroupOrder({ canWriteVault: false, agentObserved: true })).toEqual([
      "code",
      "meaning",
    ]);
  });

  it("changes the order key only when abilities change", () => {
    const a = queueGroupOrderKey({ canWriteVault: true, agentObserved: false });
    const b = queueGroupOrderKey({ canWriteVault: true, agentObserved: true });
    const c = queueGroupOrderKey({ canWriteVault: false, agentObserved: true });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("sizes a group as the sum of its pre-truncation section totals", () => {
    expect(
      sumQueueGroupCounts([
        { section: "missing-definition", total: 4 },
        { section: "duplicate", total: 3 },
        { section: "promotion", total: 2 },
        { section: "neglected-hub", total: 5 },
        { section: "cycle", total: 1 },
        // A negative is not a signal but a computation accident — clamped to 0 so it cannot eat into the total.
        { section: "orphan", total: -3 },
      ]),
    ).toEqual({ meaning: 9, code: 6 });
  });
});
