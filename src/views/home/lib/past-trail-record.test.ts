import { describe, expect, it } from "vitest";

import {
  upsertPastWalk,
  deserializePastTrails,
  describePastTrailDay,
  PAST_WALKS_MAX,
  serializePastTrails,
  type PastWalk,
  type PastWalkEntry,
} from "./past-trail-record";

function entries(...ids: string[]): PastWalkEntry[] {
  return ids.map((id) => ({ id, title: id.toUpperCase(), kind: id.split(":")[0] ?? "element" }));
}

describe("past-trail-record — 매체와 무관한 형식 규칙", () => {
  it("문턱(2걸음) 미만은 길이 되지 않는다", () => {
    expect(upsertPastWalk([], "w1", entries("domain:a"))).toEqual([]);
  });

  it("2걸음 이상이면 최근이 앞으로 쌓인다", () => {
    const one = upsertPastWalk([], "w1", entries("domain:a", "capability:b"), { now: 1_000 });
    const two = upsertPastWalk(one, "w2", entries("element:c", "element:d"), { now: 2_000 });
    expect(two.map((w) => w.id)).toEqual(["w2", "w1"]);
  });

  it("같은 id 는 새 줄이 아니라 제자리 갱신 — 한 세션은 한 줄", () => {
    const one = upsertPastWalk([], "w1", entries("domain:a", "capability:b"), { now: 1_000 });
    const grown = upsertPastWalk(one, "w1", entries("domain:a", "capability:b", "element:c"), {
      now: 2_000,
    });
    expect(grown).toHaveLength(1);
    expect(grown[0].entries).toHaveLength(3);
    expect(grown[0].endedAt).toBe(2_000);
  });

  it("다른 id 라도 최신 길과 경로가 같으면 줄을 늘리지 않는다 (날짜 보존)", () => {
    const one = upsertPastWalk([], "w1", entries("domain:a", "capability:b"), { now: 1_000 });
    const again = upsertPastWalk(one, "w2", entries("domain:a", "capability:b"), { now: 9_000 });
    expect(again).toHaveLength(1);
    expect(again[0].endedAt).toBe(1_000);
  });

  it("한 걸음이라도 다르면 새 줄이다", () => {
    const one = upsertPastWalk([], "w1", entries("domain:a", "capability:b"), { now: 1_000 });
    const two = upsertPastWalk(one, "w2", entries("domain:a", "capability:b", "element:c"), {
      now: 2_000,
    });
    expect(two).toHaveLength(2);
  });

  it("상한 10 회전 — 11번째를 넣으면 가장 오래된 길이 소멸한다", () => {
    let walks: PastWalk[] = [];
    for (let i = 0; i < PAST_WALKS_MAX + 1; i += 1) {
      walks = upsertPastWalk(walks, `w${i}`, entries(`domain:a${i}`, `capability:b${i}`), {
        now: 1_000 + i,
      });
    }
    expect(walks).toHaveLength(PAST_WALKS_MAX);
    expect(walks[0].id).toBe("w10");
    expect(walks.some((w) => w.id === "w0")).toBe(false);
  });

  it("걸음 상한 30 — 넘치면 오래된 걸음부터 잘린다", () => {
    const long = entries(...Array.from({ length: 42 }, (_, i) => `element:n${i}`));
    const [walk] = upsertPastWalk([], "w1", long, { now: 1_000 });
    expect(walk.entries).toHaveLength(30);
    expect(walk.entries[0].id).toBe("element:n12");
    expect(walk.entries[29].id).toBe("element:n41");
  });

  it("입력 목록을 변형하지 않는다 (순수)", () => {
    const before = upsertPastWalk([], "w1", entries("domain:a", "capability:b"), { now: 1 });
    upsertPastWalk(before, "w2", entries("element:c", "element:d"), { now: 2 });
    expect(before).toHaveLength(1);
  });

  it("직렬화한 JSON 에 걸음당 시각이 하나도 없다 — 시각은 길당 endedAt 1개뿐", () => {
    const walks = upsertPastWalk([], "w1", entries("domain:a", "capability:b", "element:c"), {
      now: 1_700_000,
    });
    const raw = serializePastTrails(walks);
    const parsed = JSON.parse(raw) as { walks: Array<Record<string, unknown>> };

    expect(parsed.walks).toHaveLength(1);
    expect(parsed.walks[0].endedAt).toBe(1_700_000);
    for (const entry of parsed.walks[0].entries as Array<Record<string, unknown>>) {
      expect(Object.keys(entry).sort()).toEqual(["id", "kind", "title"]);
    }

    // 전수 감사 — 저장된 트리 안의 숫자값은 `v: 1` 과 `endedAt` 둘뿐이다.
    // 걸음이 3개인데도 숫자가 늘지 않는다는 것이 "걸음당 시각 0"의 직접 증거다.
    const numbers: number[] = [];
    const walkTree = (node: unknown): void => {
      if (typeof node === "number") numbers.push(node);
      else if (Array.isArray(node)) node.forEach(walkTree);
      else if (node && typeof node === "object") Object.values(node).forEach(walkTree);
    };
    walkTree(JSON.parse(raw));
    expect(numbers.sort((a, b) => a - b)).toEqual([1, 1_700_000]);
  });

  it("직렬화 → 역직렬화 왕복이 같은 레코드를 준다 (매체 독립의 근거)", () => {
    const walks = upsertPastWalk([], "w1", entries("domain:a", "capability:b"), { now: 5 });
    expect(deserializePastTrails(serializePastTrails(walks))).toEqual(walks);
  });

  it("파손 JSON · 빈 값 · 구스키마는 빈 목록으로 읽는다", () => {
    expect(deserializePastTrails(null)).toEqual([]);
    expect(deserializePastTrails("{not json")).toEqual([]);
    expect(deserializePastTrails(JSON.stringify({ v: 99, walks: [] }))).toEqual([]);
    expect(deserializePastTrails(JSON.stringify([1, 2]))).toEqual([]);
  });

  it("손으로 끼워 넣은 걸음당 시각 필드는 읽는 순간 떨어진다", () => {
    const raw = JSON.stringify({
      v: 1,
      walks: [
        {
          id: "w1",
          endedAt: 1_000,
          entries: [
            { id: "domain:a", title: "A", kind: "domain", visitedAt: 5, dwellMs: 900 },
            { id: "capability:b", title: "B", kind: "capability", visitCount: 3 },
          ],
        },
      ],
    });
    expect(deserializePastTrails(raw)[0].entries).toEqual([
      { id: "domain:a", title: "A", kind: "domain" },
      { id: "capability:b", title: "B", kind: "capability" },
    ]);
  });
});

describe("describePastTrailDay — 일 단위 묶음", () => {
  const now = new Date(2026, 6, 26, 14, 0, 0).getTime();

  it("같은 날은 오늘", () => {
    expect(describePastTrailDay(new Date(2026, 6, 26, 1, 0, 0).getTime(), now)).toEqual({
      kind: "today",
    });
  });

  it("하루 전은 어제", () => {
    expect(describePastTrailDay(new Date(2026, 6, 25, 23, 0, 0).getTime(), now)).toEqual({
      kind: "yesterday",
    });
  });

  it("같은 해의 더 이전 날은 sameYear", () => {
    const at = new Date(2026, 6, 22, 9, 0, 0).getTime();
    expect(describePastTrailDay(at, now)).toEqual({ kind: "sameYear", at });
  });

  it("해가 넘어가면 olderYear", () => {
    const at = new Date(2025, 11, 3, 9, 0, 0).getTime();
    expect(describePastTrailDay(at, now)).toEqual({ kind: "olderYear", at });
  });
});
