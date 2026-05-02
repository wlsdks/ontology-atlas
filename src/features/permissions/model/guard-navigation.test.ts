import { describe, expect, it } from "vitest";
import { buildGuardHomeHref, buildGuardLoginHref } from "./guard-navigation";

describe("permission guard navigation", () => {
  it("preserves account and current path for login", () => {
    expect(
      buildGuardLoginHref({
        accountId: "demo-workspace",
        currentPath: "/projects/?account=demo-workspace",
      }),
    ).toBe(
      "/login/?account=demo-workspace&next=%2Fprojects%2F%3Faccount%3Ddemo-workspace",
    );
  });

  it("keeps a next path even without account scope", () => {
    expect(
      buildGuardLoginHref({
        accountId: null,
        currentPath: "/settings/categories/",
      }),
    ).toBe("/login/?next=%2Fsettings%2Fcategories%2F");
  });

  it("builds account scoped home fallback when an account is present", () => {
    expect(buildGuardHomeHref("demo-workspace")).toBe("/?account=demo-workspace");
    expect(buildGuardHomeHref(null)).toBe("/");
  });
});
