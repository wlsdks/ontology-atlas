import { describe, expect, it } from "vitest";

import { holdOrder, rowsInHeldOrder } from "./held-row-order";
import type { SourceGroup } from "./source-group-index";
import type { SourceTableRow } from "./table-rows";

function row(key: string): SourceTableRow {
  return { key, group: { key } as SourceGroup, members: null, range: null };
}

describe("holdOrder", () => {
  const previous = { keys: ["a", "b"], grouping: "folder" } as const;

  it("returns the very same object while the keys are unchanged", () => {
    expect(holdOrder(previous, ["a", "b"])).toBe(previous);
  });

  it("returns a new order with the same grouping when a key moved or was added", () => {
    expect(holdOrder(previous, ["b", "a"])).toEqual({ keys: ["b", "a"], grouping: "folder" });
    expect(holdOrder(previous, ["a", "b", "c"]).keys).toEqual(["a", "b", "c"]);
  });
});

describe("rowsInHeldOrder", () => {
  it("draws rows in the held order, however the rows arrive", () => {
    const ordered = rowsInHeldOrder([row("c"), row("a"), row("b")], ["a", "b", "c"]);
    expect(ordered.map((item) => item.key)).toEqual(["a", "b", "c"]);
  });

  it("puts a row that joined after the order was held last, and skips a key whose row left", () => {
    const ordered = rowsInHeldOrder([row("new"), row("b"), row("a")], ["a", "gone", "b"]);
    expect(ordered.map((item) => item.key)).toEqual(["a", "b", "new"]);
  });
});
