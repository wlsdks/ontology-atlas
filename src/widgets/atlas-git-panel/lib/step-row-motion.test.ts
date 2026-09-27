import { describe, expect, it } from "vitest";
import { stepRowMotionClass, stepRowUsesStagger } from "./step-row-motion";

describe("step row motion", () => {
  it("gives the just-committed hash the confirm ramp", () => {
    expect(stepRowMotionClass("abc123", "abc123")).toBe("git-commit-settle");
  });

  it("leaves the other history rows unchanged", () => {
    expect(stepRowMotionClass("older", "abc123")).toBe("git-fade-in");
  });

  it("confirms no row when nothing was just committed", () => {
    expect(stepRowMotionClass("abc123", null)).toBe("git-fade-in");
    expect(stepRowMotionClass("abc123", undefined)).toBe("git-fade-in");
  });

  it("does not stagger the confirmed row", () => {
    expect(stepRowUsesStagger("abc123", "abc123")).toBe(false);
    expect(stepRowUsesStagger("older", "abc123")).toBe(true);
  });
});
