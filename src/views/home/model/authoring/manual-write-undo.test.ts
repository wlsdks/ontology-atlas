import { describe, expect, it } from "vitest";

import { planUndo } from "./manual-write-undo";

describe("undo of a manual write", () => {
  it("removes a file the write created", () => {
    expect(planUndo({ id: 1, slug: "domains/a", before: null, after: "new" }, "new")).toEqual({ action: "delete" });
  });

  it("brings back a file the write deleted", () => {
    expect(planUndo({ id: 1, slug: "domains/a", before: "old", after: null }, null)).toEqual({
      action: "create",
      content: "old",
    });
  });

  it("restores the bytes from before an edit", () => {
    expect(planUndo({ id: 1, slug: "domains/a", before: "old", after: "new" }, "new")).toEqual({
      action: "save",
      content: "old",
    });
  });

  it.each([
    ["an edit made on disk since", "new, edited elsewhere"],
    ["a file removed on disk since", null],
  ])("refuses after %s", (_case, current) => {
    expect(planUndo({ id: 1, slug: "domains/a", before: "old", after: "new" }, current)).toBe("changed");
  });

  it("refuses to bring back a deleted file when one was written there since", () => {
    expect(planUndo({ id: 1, slug: "domains/a", before: "old", after: null }, "someone else's")).toBe("changed");
  });
});
