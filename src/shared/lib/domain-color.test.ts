import { describe, expect, it } from "vitest";
import { resolveDomainTint } from "./domain-color";

const DOGFOOD_DOMAINS = [
  "ai-agent-partner",
  "mode-aware-adapters",
  "onboarding-ux",
  "ontology-core",
  "vault-local-first",
  "views",
] as const;

function hslaHue(value: string): number {
  const match = value.match(/hsla\((\d+),/);
  if (!match) throw new Error(`Cannot parse hsla color: ${value}`);
  return Number(match[1]);
}

function circularHueDistance(a: number, b: number): number {
  const delta = Math.abs(a - b);
  return Math.min(delta, 360 - delta);
}

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
    expect(resolveDomainTint(null).hueName).toBe("neutral");
  });

  it("uses named qualitative hues for Atlas dogfood domains", () => {
    expect(DOGFOOD_DOMAINS.map((slug) => resolveDomainTint(slug).hueName)).toEqual([
      "blue",
      "violet",
      "amber",
      "emerald",
      "rose",
      "lime",
    ]);
  });

  it("keeps Atlas dogfood domain hues separated enough for scanning", () => {
    for (let i = 0; i < DOGFOOD_DOMAINS.length; i += 1) {
      for (let j = i + 1; j < DOGFOOD_DOMAINS.length; j += 1) {
        const left = hslaHue(resolveDomainTint(DOGFOOD_DOMAINS[i]).accent);
        const right = hslaHue(resolveDomainTint(DOGFOOD_DOMAINS[j]).accent);
        expect(circularHueDistance(left, right)).toBeGreaterThanOrEqual(36);
      }
    }
  });
});
