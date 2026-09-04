import { describe, expect, it } from "vitest";

import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildDoNextQueue } from "./do-next-queue";
import { buildUnmatchedBoard, unmatchedRowId } from "./unmatched-board";

const ASKS = [
  {
    ref: "capabilities/holds-position",
    relations: ["capabilities", "dependencies"],
    count: 3,
    sources: ["capabilities/invoice", "capabilities/refund", "domains/payment"],
  },
  {
    ref: "capabilities/ledger",
    relations: ["dependencies"],
    count: 1,
    sources: ["capabilities/invoice"],
  },
];

describe("buildUnmatchedBoard — one question, one list", () => {
  it("orders by how often a name was asked for, then by name", () => {
    const board = buildUnmatchedBoard({ asks: ASKS }, new Set());
    expect(board.rows.map((row) => row.name)).toEqual([
      "capabilities/holds-position",
      "capabilities/ledger",
    ]);
    expect(board.rows[0].count).toBe(3);
  });

  it("carries who asked and under which keys, so a row is judged without opening a file", () => {
    const board = buildUnmatchedBoard({ asks: ASKS }, new Set());
    expect(board.rows[0].sources).toEqual([
      "capabilities/invoice",
      "capabilities/refund",
      "domains/payment",
    ]);
    expect(board.rows[0].relations).toEqual(["capabilities", "dependencies"]);
  });

  it("counts names, not references — the eyebrow says how many concepts are missing", () => {
    expect(buildUnmatchedBoard({ asks: ASKS }, new Set()).totalCount).toBe(2);
  });

  it("makes an empty board out of a folder that holds every name it mentions", () => {
    const board = buildUnmatchedBoard({ asks: [] }, new Set());
    expect(board.rows).toEqual([]);
    expect(board.totalCount).toBe(0);
    expect(board.dismissedCount).toBe(0);
  });
});

describe("buildUnmatchedBoard — a dismissal is this viewer's, and only hides", () => {
  it("hides a dismissed row and says how many are hidden", () => {
    const board = buildUnmatchedBoard(
      { asks: ASKS },
      new Set([unmatchedRowId("capabilities/ledger")]),
    );
    expect(board.rows.map((row) => row.name)).toEqual(["capabilities/holds-position"]);
    expect(board.dismissedCount).toBe(1);
    // The total is what the folder says, not what this viewer chose to look at.
    expect(board.totalCount).toBe(2);
  });

  it("ignores a dismissal for something the folder no longer asks for", () => {
    const board = buildUnmatchedBoard({ asks: ASKS }, new Set(["unresolved-reference:gone"]));
    expect(board.dismissedCount).toBe(0);
    expect(board.rows).toHaveLength(2);
  });

  it("hiding every row still leaves the total standing", () => {
    const board = buildUnmatchedBoard(
      { asks: ASKS },
      new Set(ASKS.map((ask) => unmatchedRowId(ask.ref))),
    );
    expect(board.rows).toEqual([]);
    expect(board.totalCount).toBe(2);
    expect(board.dismissedCount).toBe(2);
  });
});

/*
 * ⚠️ **Two boards on one screen must not count one fact twice** (decision 2026-08-07 (3)).
 * The first draft of this tab also carried missing containment and unplaced concepts, and
 * both already fed the Do-next badge — so one folder problem raised two numbers on the same
 * page. The narrowing holds because of what a dangling reference *is*: a name this folder
 * has no document for. Do-next rows are all real concepts, so the two sets cannot meet.
 */
describe("the unmatched list and the Do-next queue never hold the same thing", () => {
  const PROSE = new Proxy({} as Record<string, string>, {
    get: (_target, key) => (typeof key === "string" ? key : ""),
    has: () => true,
  });
  const node = (id: string, kind: string, slug: string): KnowledgeGraphNode =>
    ({
      id,
      title: id,
      kind,
      projectIds: [],
      evidenceIds: [slug],
      lastApprovedAt: new Date(0),
      lastApprovedBy: "vault-frontmatter",
    }) as KnowledgeGraphNode;
  const edge = (from: string, to: string, type = "relates"): KnowledgeGraphEdge =>
    ({ from, to, type }) as KnowledgeGraphEdge;

  it("shares no row id and no name with the queue's rows", () => {
    const hub = node("capability:invoice", "capability", "capabilities/invoice");
    const spokes = Array.from({ length: 5 }, (_, i) =>
      node(`element:s${i}`, "element", `elements/s${i}`),
    );
    const queue = buildDoNextQueue(
      [hub, ...spokes],
      spokes.map((spoke) => edge(spoke.id, hub.id)),
      new Map([["capabilities/invoice", new Date(0).toISOString()]]),
      // The handoff prose is irrelevant here; only the row identities matter.
      { prose: PROSE as never },
    );
    const board = buildUnmatchedBoard({ asks: ASKS }, new Set());

    expect(board.rows.length).toBeGreaterThan(0);
    expect(queue.rows.length).toBeGreaterThan(0);
    const claimedByQueue = new Set([
      ...queue.rows.map((row) => row.id),
      ...queue.rows.map((row) => row.nodeId),
      ...queue.activeRowIds,
    ]);
    for (const row of board.rows) {
      expect(claimedByQueue.has(row.id)).toBe(false);
      expect(claimedByQueue.has(row.name)).toBe(false);
    }
  });
});
