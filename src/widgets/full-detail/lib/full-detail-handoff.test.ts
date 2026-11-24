import { describe, expect, it } from "vitest";
import { formatFullDetailHandoffChain } from "./full-detail-handoff";

describe("formatFullDetailHandoffChain", () => {
  it('builds the get_concepts, find_backlinks, reachability call chain', () => {
    expect(formatFullDetailHandoffChain("domains/onboarding-ux", 3)).toBe(
      'get_concepts({slugs:["domains/onboarding-ux"]}) → find_backlinks → reachability --max-depth 3',
    );
  });

  it('passes the selected step as --max-depth', () => {
    expect(formatFullDetailHandoffChain("capability:foo", 1)).toBe(
      'get_concepts({slugs:["capability:foo"]}) → find_backlinks → reachability --max-depth 1',
    );
  });
});
