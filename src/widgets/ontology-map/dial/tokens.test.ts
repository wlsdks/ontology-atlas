import { describe, expect, it } from "vitest";

import { DIAL_TOKEN_SPECS, resolveDialTokens } from "./tokens";

const values = (): Map<string, string> => {
  const m = new Map(DIAL_TOKEN_SPECS.map(({ cssVar }, i) => [cssVar, String(i + 1)]));
  m.set("--map-panel-text-primary", " #ececf0 ");
  return m;
};

describe("resolveDialTokens", () => {
  it("fills every key and borrows the attended name ink", () => {
    const tokens = resolveDialTokens((v) => values().get(v) ?? "");
    expect(Object.keys(tokens)).toHaveLength(69);
    expect(tokens.pitch).toBe(1);
    expect(tokens.labelScale).toBe(68);
    expect(tokens.attendedNameInk).toBe("#ececf0");
  });

  it("names the 68 tokens once each, in camelCase of the css name", () => {
    expect(DIAL_TOKEN_SPECS).toHaveLength(68);
    expect(new Set(DIAL_TOKEN_SPECS.map((s) => s.key)).size).toBe(68);
    for (const { key, cssVar } of DIAL_TOKEN_SPECS) {
      expect(cssVar.replace("--map-dial-", "").replace(/-(\w)/g, (_, c: string) => c.toUpperCase())).toBe(key);
    }
  });

  it("throws on an empty or non-numeric value", () => {
    const empty = values();
    empty.set("--map-dial-hub-clearance", "  ");
    expect(() => resolveDialTokens((v) => empty.get(v) ?? "")).toThrow(/--map-dial-hub-clearance/);
    const bad = values();
    bad.set("--map-dial-pitch", "26px");
    expect(() => resolveDialTokens((v) => bad.get(v) ?? "")).toThrow(/--map-dial-pitch/);
    const ink = values();
    ink.delete("--map-panel-text-primary");
    expect(() => resolveDialTokens((v) => ink.get(v) ?? "")).toThrow(/--map-panel-text-primary/);
  });
});
