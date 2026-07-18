import { describe, expect, it } from "vitest";
import { formatFullDetailHandoffChain } from "./full-detail-handoff";

describe("formatFullDetailHandoffChain", () => {
  it("get_concept → find_backlinks → reachability 순서의 mono 호출 체인 문자열", () => {
    expect(formatFullDetailHandoffChain("domains/onboarding-ux", 3)).toBe(
      'get_concept("domains/onboarding-ux") → find_backlinks → reachability --max-depth 3',
    );
  });

  it("선택된 step 을 --max-depth 에 그대로 반영", () => {
    expect(formatFullDetailHandoffChain("capability:foo", 1)).toBe(
      'get_concept("capability:foo") → find_backlinks → reachability --max-depth 1',
    );
  });
});
