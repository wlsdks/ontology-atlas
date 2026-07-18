import { describe, expect, it } from "vitest";
import { shortenDomainTitle } from "./short-domain-title";

describe("shortenDomainTitle", () => {
  it("returns short titles unchanged", () => {
    expect(shortenDomainTitle("Views")).toBe("Views");
  });

  it("cuts at a parenthetical qualifier", () => {
    expect(shortenDomainTitle("Views (Topology · Browse · Builder)")).toBe("Views");
  });

  it("keeps a compound name that fits within the max length", () => {
    expect(shortenDomainTitle("AI Agent Partner")).toBe("AI Agent Partner");
  });

  it("cuts at a parenthetical qualifier even with a long compound prefix", () => {
    expect(shortenDomainTitle("Onboarding & UX (theme · toast · a11y · mobile · CLI)")).toBe("Onboarding & UX");
  });

  it("truncates a long single segment with an ellipsis", () => {
    const result = shortenDomainTitle("A Very Long Domain Title With No Punctuation At All");
    expect(result.length).toBeLessThanOrEqual(19);
    expect(result.endsWith("…")).toBe(true);
  });
});
