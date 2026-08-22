import { describe, expect, it } from "vitest";
import {
  groupOfQueueSection,
  queueGroupOrder,
  queueGroupOrderKey,
  sumQueueGroupCounts,
} from "./queue-work-groups";

describe("queue-work-groups", () => {
  it("뜻으로 답이 나오는 섹션은 의미 작업, 개념 바깥을 읽어야 하는 섹션은 코드 작업", () => {
    expect(groupOfQueueSection("missing-definition")).toBe("meaning");
    expect(groupOfQueueSection("missing-domain")).toBe("meaning");
    expect(groupOfQueueSection("duplicate")).toBe("meaning");
    expect(groupOfQueueSection("promotion")).toBe("meaning");
    expect(groupOfQueueSection("neglected-hub")).toBe("code");
    expect(groupOfQueueSection("orphan")).toBe("code");
    expect(groupOfQueueSection("cycle")).toBe("code");
  });

  it("쓸 수 있는 세션은 내 몫이 먼저, 읽기 전용 세션은 인계로 닫히는 일이 먼저", () => {
    expect(queueGroupOrder({ canWriteVault: true, agentObserved: false })).toEqual([
      "meaning",
      "code",
    ]);
    expect(queueGroupOrder({ canWriteVault: false, agentObserved: true })).toEqual([
      "code",
      "meaning",
    ]);
  });

  it("순서 키는 능력이 바뀔 때만 달라진다 — 렌더마다 크로스페이드가 돌지 않게", () => {
    const a = queueGroupOrderKey({ canWriteVault: true, agentObserved: false });
    const b = queueGroupOrderKey({ canWriteVault: true, agentObserved: true });
    const c = queueGroupOrderKey({ canWriteVault: false, agentObserved: true });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("묶음 규모는 섹션 총계(절단 전)의 합이다", () => {
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
