import { describe, expect, it } from "vitest";
import { canonicalizeDomainRef } from "./canonicalize-domain-ref";

describe("canonicalizeDomainRef", () => {
  /*
   * Map-edit QA D10 (2026-09-26): the map's "add under this domain" wrote `domain: code-evidence`
   * while every agent-written node in the same vault — and the dogfood vault, 93 of 93 — writes
   * `domain: domains/code-evidence`. The domain document's own address is the one spelling.
   */
  it("keeps the folder-qualified address every other writer uses", () => {
    expect(canonicalizeDomainRef("domains/code-evidence")).toBe("domains/code-evidence");
    expect(canonicalizeDomainRef("domains/문의-처리")).toBe("domains/문의-처리");
  });

  it("does not invent a folder for a domain addressed at the vault root", () => {
    expect(canonicalizeDomainRef("ai-agent-partner")).toBe("ai-agent-partner");
    expect(canonicalizeDomainRef("views")).toBe("views");
  });

  it("slugifies only the name, so hand-typed spaces become hyphens", () => {
    expect(canonicalizeDomainRef("문의 처리")).toBe("문의-처리");
    expect(canonicalizeDomainRef("Auth Platform")).toBe("auth-platform");
    expect(canonicalizeDomainRef("domains/Auth Platform")).toBe("domains/auth-platform");
  });

  it("drops stray slashes and a file extension", () => {
    expect(canonicalizeDomainRef("/domains/billing/")).toBe("domains/billing");
    expect(canonicalizeDomainRef("domains/billing.md")).toBe("domains/billing");
  });

  it("returns empty for blank / nullish input", () => {
    expect(canonicalizeDomainRef("")).toBe("");
    expect(canonicalizeDomainRef("   ")).toBe("");
    expect(canonicalizeDomainRef(null)).toBe("");
    expect(canonicalizeDomainRef(undefined)).toBe("");
  });
});
