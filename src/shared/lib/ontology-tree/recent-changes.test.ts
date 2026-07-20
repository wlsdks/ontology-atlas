import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  computeAdaptiveRecentChanges,
  computeRecentChanges,
  daysAgoFromIso,
  isWithinRecentWindow,
  RECENT_CHANGES_DEFAULT_WINDOW_DAYS,
  selectRecentVaultDocs,
} from "./recent-changes";

function node(id: string, opts: Partial<KnowledgeGraphNode> = {}): KnowledgeGraphNode {
  return {
    id,
    title: id,
    kind: "capability",
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "vault-frontmatter",
    ...opts,
  };
}

const NOW = Date.parse("2026-07-21T12:00:00.000Z");

describe("isWithinRecentWindow", () => {
  it("is true for a date inside the window", () => {
    expect(isWithinRecentWindow("2026-07-19T12:00:00.000Z", NOW, 7)).toBe(true);
  });

  it("is true exactly at the window boundary", () => {
    expect(isWithinRecentWindow("2026-07-14T12:00:00.000Z", NOW, 7)).toBe(true);
  });

  it("is false just past the window boundary", () => {
    expect(isWithinRecentWindow("2026-07-14T11:59:00.000Z", NOW, 7)).toBe(false);
  });

  it("is false for an unparseable date", () => {
    expect(isWithinRecentWindow("not-a-date", NOW, 7)).toBe(false);
  });

  it("허용 창(24h) 밖의 미래만 제외한다 — C-3 계약 갱신", () => {
    // NOW = 2026-07-21T12:00Z. +12h 는 세션 중 생성으로 간주 → 포함.
    expect(isWithinRecentWindow("2026-07-22T00:00:00.000Z", NOW, 7)).toBe(true);
    // +25h 는 진짜 skew → 제외.
    expect(isWithinRecentWindow("2026-07-22T13:00:00.000Z", NOW, 7)).toBe(false);
  });

  it("defaults to a 7-day window", () => {
    expect(isWithinRecentWindow("2026-07-15T12:00:00.000Z", NOW)).toBe(true);
    expect(isWithinRecentWindow("2026-07-13T00:00:00.000Z", NOW)).toBe(false);
  });
});

describe("daysAgoFromIso", () => {
  it("floors to whole days", () => {
    expect(daysAgoFromIso("2026-07-20T13:00:00.000Z", NOW)).toBe(0);
    expect(daysAgoFromIso("2026-07-20T11:00:00.000Z", NOW)).toBe(1);
  });

  it("returns +Infinity for an unparseable date", () => {
    expect(daysAgoFromIso("nope", NOW)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("computeRecentChanges", () => {
  it("includes a node whose evidence doc updated inside the window", () => {
    const nodes = [node("capability:a", { evidenceIds: ["docs/a"], title: "A" })];
    const freshness = new Map([["docs/a", "2026-07-19T00:00:00.000Z"]]);

    const result = computeRecentChanges(nodes, freshness, NOW);

    expect(result.recentNodeIds.has("capability:a")).toBe(true);
    expect(result.rows).toEqual([{ id: "capability:a", title: "A", kind: "capability", agoDays: 2 }]);
  });

  it("excludes a node whose evidence doc updated outside the window", () => {
    const nodes = [node("capability:old", { evidenceIds: ["docs/old"] })];
    const freshness = new Map([["docs/old", "2026-06-01T00:00:00.000Z"]]);

    const result = computeRecentChanges(nodes, freshness, NOW);

    expect(result.recentNodeIds.size).toBe(0);
    expect(result.rows).toHaveLength(0);
  });

  it("excludes a node with no evidenceIds (nothing to look up)", () => {
    const nodes = [node("capability:no-evidence", { evidenceIds: [] })];
    const freshness = new Map([["docs/whatever", "2026-07-20T00:00:00.000Z"]]);

    const result = computeRecentChanges(nodes, freshness, NOW);

    expect(result.rows).toHaveLength(0);
  });

  it("excludes a node whose evidence slug is not in the freshness index (unknown, not assumed recent)", () => {
    const nodes = [node("capability:unknown", { evidenceIds: ["docs/missing"] })];
    const result = computeRecentChanges(nodes, new Map(), NOW);

    expect(result.rows).toHaveLength(0);
  });

  it("sorts rows newest-first", () => {
    const nodes = [
      node("capability:a", { evidenceIds: ["docs/a"], title: "A" }),
      node("capability:b", { evidenceIds: ["docs/b"], title: "B" }),
    ];
    const freshness = new Map([
      ["docs/a", "2026-07-18T00:00:00.000Z"],
      ["docs/b", "2026-07-20T00:00:00.000Z"],
    ]);

    const result = computeRecentChanges(nodes, freshness, NOW);

    expect(result.rows.map((r) => r.id)).toEqual(["capability:b", "capability:a"]);
  });

  it("respects a custom windowDays", () => {
    const nodes = [node("capability:a", { evidenceIds: ["docs/a"] })];
    const freshness = new Map([["docs/a", "2026-07-10T00:00:00.000Z"]]); // 11 days ago

    expect(computeRecentChanges(nodes, freshness, NOW, 7).rows).toHaveLength(0);
    expect(computeRecentChanges(nodes, freshness, NOW, 14).rows).toHaveLength(1);
  });

  it("uses RECENT_CHANGES_DEFAULT_WINDOW_DAYS (7) when omitted", () => {
    expect(RECENT_CHANGES_DEFAULT_WINDOW_DAYS).toBe(7);
  });

  it("returns empty results for no nodes", () => {
    const result = computeRecentChanges([], new Map(), NOW);
    expect(result).toEqual({ recentNodeIds: new Set(), rows: [] });
  });
});

describe("selectRecentVaultDocs", () => {
  function doc(slug: string, updatedAt: string) {
    return { slug, updatedAt };
  }

  it("keeps only docs inside the window, newest-first", () => {
    const docs = [
      doc("a", "2026-07-01T00:00:00.000Z"),
      doc("b", "2026-07-19T00:00:00.000Z"),
      doc("c", "2026-07-20T00:00:00.000Z"),
    ];
    const result = selectRecentVaultDocs(docs, NOW);
    expect(result.map((d) => d.slug)).toEqual(["c", "b"]);
  });

  it("returns an empty array when nothing is recent", () => {
    expect(selectRecentVaultDocs([doc("old", "2025-01-01T00:00:00.000Z")], NOW)).toEqual([]);
  });
});
/** C-3 (Guardian 실증) — 세션 중 생성된 문서(스냅샷보다 미래 mtime)는 "오늘". */
describe("future-tolerance (session-created docs)", () => {
  const NOW = Date.parse("2026-07-21T12:00:00Z");
  it("스냅샷 이후 1시간 뒤 생성 문서도 최근에 포함된다", () => {
    const iso = new Date(NOW + 60 * 60 * 1000).toISOString();
    expect(isWithinRecentWindow(iso, NOW, 7)).toBe(true);
    expect(daysAgoFromIso(iso, NOW)).toBe(0);
  });
  it("24h 를 넘는 미래(진짜 skew)는 여전히 제외", () => {
    const iso = new Date(NOW + 25 * 60 * 60 * 1000).toISOString();
    expect(isWithinRecentWindow(iso, NOW, 7)).toBe(false);
  });
});


describe("computeAdaptiveRecentChanges (M-8 — 렌즈 창 적응화)", () => {
  const DAY = 24 * 3600 * 1000;
  const now = Date.parse("2026-07-21T12:00:00Z");
  const node = (id: string, slug: string) =>
    ({ id, title: id, kind: "element", evidenceIds: [slug], projectIds: [] }) as never;
  const iso = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString();

  it("7일 창 통과율이 50% 이하면 그대로 7일", () => {
    const nodes = [node("a", "a"), node("b", "b"), node("c", "c"), node("d", "d")];
    const fresh = new Map([
      ["a", iso(2)],
      ["b", iso(30)],
      ["c", iso(30)],
      ["d", iso(30)],
    ]);
    const r = computeAdaptiveRecentChanges(nodes, fresh, now);
    expect(r.windowDays).toBe(7);
    expect(r.recentNodeIds.size).toBe(1);
  });

  it("7일이 과반이면 3일 → 1일로 좁힌다", () => {
    // 6일 전 것이 대부분 — 7d 는 100%, 3d 는 25%
    const nodes = [node("a", "a"), node("b", "b"), node("c", "c"), node("d", "d")];
    const fresh = new Map([
      ["a", iso(0.5)],
      ["b", iso(6)],
      ["c", iso(6)],
      ["d", iso(6)],
    ]);
    const r = computeAdaptiveRecentChanges(nodes, fresh, now);
    expect(r.windowDays).toBe(3);
    expect(r.recentNodeIds.size).toBe(1);
  });

  it("1일까지 좁혀도 과반이면 1일 결과를 정직하게 반환 (0 으로 조작하지 않는다)", () => {
    const nodes = [node("a", "a"), node("b", "b")];
    const fresh = new Map([
      ["a", iso(0.1)],
      ["b", iso(0.2)],
    ]);
    const r = computeAdaptiveRecentChanges(nodes, fresh, now);
    expect(r.windowDays).toBe(1);
    expect(r.recentNodeIds.size).toBe(2);
  });

  it("빈 그래프는 7일 창 빈 결과", () => {
    const r = computeAdaptiveRecentChanges([], new Map(), now);
    expect(r.windowDays).toBe(7);
    expect(r.rows).toEqual([]);
  });
});
