import { describe, expect, it } from "vitest";
import { canonicalizeDomainRef } from "./canonicalize-domain-ref";

describe("canonicalizeDomainRef", () => {
  it("collapses both serialization forms to the same canonical slug (C7)", () => {
    // The map writer's folder-prefixed form and the studio writer's bare form must
    // canonicalize identically so analytics don't split one domain into two.
    expect(canonicalizeDomainRef("domains/문의-처리")).toBe("문의-처리");
    expect(canonicalizeDomainRef("문의-처리")).toBe("문의-처리");
    expect(canonicalizeDomainRef("domains/문의-처리")).toBe(canonicalizeDomainRef("문의-처리"));
  });

  it("preserves the bare dogfood-vault form unchanged (no rewrite churn)", () => {
    expect(canonicalizeDomainRef("ai-agent-partner")).toBe("ai-agent-partner");
    expect(canonicalizeDomainRef("views")).toBe("views");
  });

  it("slugifies hand-typed values with spaces", () => {
    expect(canonicalizeDomainRef("문의 처리")).toBe("문의-처리");
    expect(canonicalizeDomainRef("Auth Platform")).toBe("auth-platform");
  });

  it("strips any folder prefix, not just domains/", () => {
    expect(canonicalizeDomainRef("some/nested/billing")).toBe("billing");
  });

  it("returns empty for blank / nullish input", () => {
    expect(canonicalizeDomainRef("")).toBe("");
    expect(canonicalizeDomainRef("   ")).toBe("");
    expect(canonicalizeDomainRef(null)).toBe("");
    expect(canonicalizeDomainRef(undefined)).toBe("");
  });
});
