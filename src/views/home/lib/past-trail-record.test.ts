import { describe, expect, it } from "vitest";

import {
  upsertPastWalk,
  deserializePastTrails,
  describePastTrailDay,
  refinePastWalkEntries,
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

  it("맨 앞이 아닌 줄과 경로가 같아도 줄을 늘리지 않는다 — 지난 길을 다시 편 경우", () => {
    // 어제 걸은 길(w1) 위에 오늘 다른 길(w2)이 쌓인 상태에서 w1 을 다시 편다.
    const yesterday = upsertPastWalk([], "w1", entries("domain:a", "capability:b"), { now: 1_000 });
    const today = upsertPastWalk(yesterday, "w2", entries("element:c", "element:d"), { now: 2_000 });
    const replayed = upsertPastWalk(today, "w3", entries("domain:a", "capability:b"), {
      now: 9_000,
    });
    expect(replayed.map((w) => w.id)).toEqual(["w2", "w1"]);
    expect(replayed.find((w) => w.id === "w1")?.endedAt).toBe(1_000);
  });

  it("다시 편 길에서 한 걸음 더 걸으면 그때 새 줄이 된다", () => {
    const yesterday = upsertPastWalk([], "w1", entries("domain:a", "capability:b"), { now: 1_000 });
    const walkedOn = upsertPastWalk(
      yesterday,
      "w3",
      entries("domain:a", "capability:b", "element:c"),
      { now: 9_000 },
    );
    expect(walkedOn.map((w) => w.id)).toEqual(["w3", "w1"]);
    expect(walkedOn[1].endedAt).toBe(1_000);
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

describe("refinePastWalkEntries — 다시 펴기 전 살아있는 지도에 맞추기", () => {
  const live = new Map([
    ["domain:a", { title: "지금 이름 A", kind: "domain" }],
    ["capability:b", { title: "B", kind: "capability" }],
  ]);
  const lookup = (id: string) => live.get(id) ?? null;

  it("사라진 노드는 빠지고 남은 노드의 이름은 지금 이름이 된다", () => {
    const stored = [
      { id: "domain:a", title: "그때 이름 A", kind: "domain" },
      { id: "element:gone", title: "지워진 곳", kind: "element" },
      { id: "capability:b", title: "B", kind: "capability" },
    ];
    expect(refinePastWalkEntries(stored, lookup)).toEqual([
      { id: "domain:a", title: "지금 이름 A", kind: "domain" },
      { id: "capability:b", title: "B", kind: "capability" },
    ]);
  });

  it("전부 사라지면 빈 목록 — 호출부가 '지금 지도에 없어요'로 읽는다", () => {
    expect(refinePastWalkEntries(entries("element:gone", "element:gone2"), lookup)).toEqual([]);
  });

  it("방문 순서를 뒤집지 않는다 — 인계 패킷이 같은 순서로 재생돼야 한다", () => {
    const stored = entries("capability:b", "domain:a");
    expect(refinePastWalkEntries(stored, lookup).map((e) => e.id)).toEqual([
      "capability:b",
      "domain:a",
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
