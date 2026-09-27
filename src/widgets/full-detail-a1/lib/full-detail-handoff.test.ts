import { describe, expect, it } from "vitest";
import { formatFullDetailHandoffChain } from "./full-detail-handoff";

describe("formatFullDetailHandoffChain", () => {
  it('builds the get_concept, find_backlinks, reachability call chain', () => {
    expect(formatFullDetailHandoffChain("domains/onboarding-ux", 3)).toBe(
      'get_concept("domains/onboarding-ux") → find_backlinks → reachability --max-depth 3',
    );
  });

  it('passes the selected step as --max-depth', () => {
    expect(formatFullDetailHandoffChain("capability:foo", 1)).toBe(
      'get_concept("capability:foo") → find_backlinks → reachability --max-depth 1',
    );
  });
});
