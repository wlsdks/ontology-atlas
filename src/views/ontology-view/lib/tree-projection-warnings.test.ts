import { describe, expect, it } from "vitest";
import {
  classifyTreeProjectionWarning,
  summarizeTreeProjectionWarnings,
} from "./tree-projection-warnings";

describe("tree projection warning summary", () => {
  it("classifies known tree projection warnings", () => {
    expect(
      classifyTreeProjectionWarning(
        'node "elements/foo" has multiple parents — keeping first (domains/a), ignoring (domains/b)',
      ),
    ).toBe("multiple-parent");
    expect(classifyTreeProjectionWarning('cycle detected at "domains/a" — promoted to root')).toBe(
      "cycle",
    );
    expect(
      classifyTreeProjectionWarning("self-parent edge ignored (contains domains/a → domains/a)"),
    ).toBe("self-parent");
    expect(
      classifyTreeProjectionWarning('node "capabilities/a" reached twice in tree — second occurrence skipped'),
    ).toBe("duplicate");
    expect(classifyTreeProjectionWarning("unknown projection note")).toBe("other");
  });

  it("summarizes warnings in stable priority order with capped examples", () => {
    const summary = summarizeTreeProjectionWarnings(
      [
        'cycle detected at "domains/cycle" — promoted to root',
        'node "elements/one" has multiple parents — keeping first (domains/a), ignoring (domains/b)',
        'node "elements/two" has multiple parents — keeping first (domains/a), ignoring (domains/b)',
        'node "elements/three" has multiple parents — keeping first (domains/a), ignoring (domains/b)',
        "unparsed warning",
      ],
      2,
    );

    expect(summary.total).toBe(5);
    expect(summary.groups.map((group) => group.kind)).toEqual([
      "multiple-parent",
      "cycle",
      "other",
    ]);
    expect(summary.groups[0]).toMatchObject({
      count: 3,
      examples: ["elements/one", "elements/two"],
    });
  });
});
