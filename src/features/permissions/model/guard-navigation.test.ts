import { describe, expect, it } from "vitest";
import { buildGuardHomeHref, buildGuardLoginHref } from "./guard-navigation";

describe("permission guard navigation", () => {
  it("preserves account and current path for login", () => {
    expect(
      buildGuardLoginHref({
        accountId: "stress-lab",
        currentPath: "/projects/?account=stress-lab",
      }),
    ).toBe(
      "/login/?account=stress-lab&next=%2Fprojects%2F%3Faccount%3Dstress-lab",
    );
  });

  it("keeps a next path even without account scope", () => {
    expect(
      buildGuardLoginHref({
        accountId: null,
        currentPath: "/knowledge/documents/new/",
      }),
    ).toBe("/login/?next=%2Fknowledge%2Fdocuments%2Fnew%2F");
  });

  it("builds account scoped home fallback when an account is present", () => {
    expect(buildGuardHomeHref("stress-lab")).toBe("/?account=stress-lab");
    expect(buildGuardHomeHref(null)).toBe("/");
  });
});
