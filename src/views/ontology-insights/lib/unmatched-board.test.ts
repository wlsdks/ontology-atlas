import { describe, expect, it } from "vitest";

import { buildUnmatchedBoard, unmatchedRowId } from "./unmatched-board";

const INPUT = {
  asks: [
    {
      ref: "capabilities/holds-position",
      relations: ["capabilities", "dependencies"],
      count: 3,
      sources: ["capabilities/invoice", "capabilities/refund", "domains/payment"],
    },
    { ref: "capabilities/ledger", relations: ["dependencies"], count: 1, sources: ["capabilities/invoice"] },
  ],
  missingContainment: [{ slug: "capabilities/invoice", domain: "domains/payment" }],
  unassigned: ["elements/floating"],
};

describe("buildUnmatchedBoard — what was asked for that this vault does not hold", () => {
  it("puts the most-asked-for name first and keeps its count", () => {
    const board = buildUnmatchedBoard(INPUT, new Set());
    expect(board.rows[0]).toMatchObject({
      kind: "unresolved-reference",
      name: "capabilities/holds-position",
      count: 3,
    });
    expect(board.rows.map((row) => row.name)).toEqual([
      "capabilities/holds-position",
      "capabilities/ledger",
      "capabilities/invoice",
      "elements/floating",
    ]);
  });

  it("keeps the three kinds apart and counts each", () => {
    const board = buildUnmatchedBoard(INPUT, new Set());
    expect(board.counts).toEqual({
      "unresolved-reference": 2,
      "missing-containment": 1,
      "unassigned-node": 1,
    });
    expect(board.totalCount).toBe(4);
  });

  it("carries who asked, so a row can be judged without opening a file", () => {
    const board = buildUnmatchedBoard(INPUT, new Set());
    expect(board.rows[0].sources).toEqual([
      "capabilities/invoice",
      "capabilities/refund",
      "domains/payment",
    ]);
    expect(board.rows[0].relations).toEqual(["capabilities", "dependencies"]);
    // A containment row names the domain that should have held it.
    expect(board.rows[2].sources).toEqual(["domains/payment"]);
  });

  it("a single node row counts once — the slot is occurrences, not a badge", () => {
    const board = buildUnmatchedBoard(INPUT, new Set());
    expect(board.rows[2].count).toBe(1);
    expect(board.rows[3].count).toBe(1);
  });
});

describe("buildUnmatchedBoard — a dismissal is this viewer's, and only hides", () => {
  it("hides a dismissed row and says how many are hidden", () => {
    const board = buildUnmatchedBoard(
      INPUT,
      new Set([unmatchedRowId("unresolved-reference", "capabilities/ledger")]),
    );
    expect(board.rows.map((row) => row.name)).toEqual([
      "capabilities/holds-position",
      "capabilities/invoice",
      "elements/floating",
    ]);
    expect(board.dismissedCount).toBe(1);
    // The total is what the vault says, not what this viewer chose to look at.
    expect(board.totalCount).toBe(4);
  });

  it("still counts a dismissed row in its kind — dismissing is not fixing", () => {
    const board = buildUnmatchedBoard(
      INPUT,
      new Set([unmatchedRowId("unassigned-node", "elements/floating")]),
    );
    expect(board.counts["unassigned-node"]).toBe(1);
  });

  it("ignores a dismissal for something the vault no longer asks for", () => {
    const board = buildUnmatchedBoard(INPUT, new Set(["unresolved-reference:gone"]));
    expect(board.dismissedCount).toBe(0);
    expect(board.rows).toHaveLength(4);
  });

  it("makes an empty board out of an empty vault", () => {
    const board = buildUnmatchedBoard(
      { asks: [], missingContainment: [], unassigned: [] },
      new Set(),
    );
    expect(board.rows).toEqual([]);
    expect(board.totalCount).toBe(0);
    expect(board.dismissedCount).toBe(0);
  });
});
