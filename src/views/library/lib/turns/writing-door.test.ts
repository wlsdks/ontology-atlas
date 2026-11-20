import { describe, expect, it } from "vitest";

import { writingDoor } from "./writing-door";

describe("which Library turns keep running away from the Library", () => {
  it.each([
    ["compile", false, "compile"],
    ["fix", false, "fix"],
    ["import", false, "import"],
    ["propose", false, "propose"],
    ["ask", true, "typed"],
  ] as const)("a %s turn outlives the screen as its door", (kind, typed, door) => {
    expect(writingDoor(kind, typed)).toBe(door);
  });

  it.each([
    ["ask", false],
    ["refresh", false],
    ["lint", false],
  ] as const)("a %s turn the desk or a refresh started has no writing door", (kind, typed) => {
    expect(writingDoor(kind, typed)).toBeNull();
  });
});
