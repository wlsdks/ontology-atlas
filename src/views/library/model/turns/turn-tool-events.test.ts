import { describe, expect, it } from "vitest";

import { turnToolEvents } from "./turn-tool-events";

describe("turnToolEvents", () => {
  it("keeps the tool calls with the fields the work card counts and drops other events", () => {
    const events = [
      { kind: "agent", text: "hello" },
      { kind: "tool", id: "t1", toolKind: "edit", status: "completed", title: "Edit a.md", rawInput: { path: "a.md" }, extra: 1 },
    ] as never;
    expect(turnToolEvents({ events })).toEqual([
      { id: "t1", toolKind: "edit", status: "completed", title: "Edit a.md", rawInput: { path: "a.md" } },
    ]);
  });
});
