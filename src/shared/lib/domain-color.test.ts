import { describe, expect, it } from "vitest";
import { resolveDomainTint } from "./domain-color";

describe("resolveDomainTint", () => {
  it("같은 slug 는 항상 같은 색 (deterministic)", () => {
    expect(resolveDomainTint("ai-agent-partner")).toEqual(
      resolveDomainTint("ai-agent-partner"),
    );
  });

  it("다른 slug 는 다른 hue (8 hue palette 안에서)", () => {
    const a = resolveDomainTint("ai-agent-partner");
    const b = resolveDomainTint("views");
    // 같은 hue 가 collision 으로 동일할 수도 있지만 두 slug 의 hash 가 다른 index
    // 가져야 정상. accent 또는 bg 둘 중 하나는 달라야 함.
    expect(a.accent === b.accent && a.bg === b.bg).toBe(false);
  });

  it("null / undefined → neutral tint (배경 transparent)", () => {
    expect(resolveDomainTint(null).bg).toBe("transparent");
    expect(resolveDomainTint(undefined).bg).toBe("transparent");
    expect(resolveDomainTint("").bg).toBe("transparent");
  });

  it("indigo family 만 사용 (hue 218 ~ 258 사이)", () => {
    for (const slug of [
      "ai-agent-partner",
      "vault-local-first",
      "views",
      "onboarding-ux",
      "ontology-core",
      "mode-aware-adapters",
      "anything-else",
      "x",
    ]) {
      const { accent } = resolveDomainTint(slug);
      const match = accent.match(/hsla\((\d+),/);
      expect(match).not.toBeNull();
      const hue = Number(match![1]);
      expect(hue).toBeGreaterThanOrEqual(218);
      expect(hue).toBeLessThanOrEqual(258);
    }
  });
});
