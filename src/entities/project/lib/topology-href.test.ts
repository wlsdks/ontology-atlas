import { describe, expect, it } from "vitest";
import { getTopologyProjectHref } from "./topology-href";

describe("getTopologyProjectHref", () => {
  it("builds a topology deep link with the selected project query", () => {
    expect(getTopologyProjectHref("gemma4")).toBe("/?p=gemma4");
  });

  it("includes the account query when provided", () => {
    expect(getTopologyProjectHref("gemma4", "sandbox")).toBe(
      "/?p=gemma4&account=sandbox",
    );
  });

  it("encodes slug values safely", () => {
    expect(getTopologyProjectHref("alpha beta")).toBe("/?p=alpha%20beta");
  });

  it("chains workspace project query when provided", () => {
    expect(getTopologyProjectHref("gemma4", "stark", "narnia")).toBe(
      "/?p=gemma4&account=stark&pj=narnia",
    );
  });
});
