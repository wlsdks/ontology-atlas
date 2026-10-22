import { describe, expect, it, vi } from "vitest";

import { DIAL_INK_SPECS, DIAL_TOKEN_SPECS, readDialTokens, resolveDialTokens } from "./tokens";

const values = (): Map<string, string> => {
  const m = new Map(DIAL_TOKEN_SPECS.map(({ cssVar }, i) => [cssVar, String(i + 1)]));
  for (const { cssVar } of DIAL_INK_SPECS) m.set(cssVar, "#666672");
  m.set("--map-panel-text-primary", " #ececf0 ");
  return m;
};

describe("resolveDialTokens", () => {
  it("fills every key and borrows the attended name ink", () => {
    const tokens = resolveDialTokens((v) => values().get(v) ?? "");
    expect(Object.keys(tokens)).toHaveLength(DIAL_TOKEN_SPECS.length + DIAL_INK_SPECS.length + 1);
    expect(tokens.strokeElement).toBe("#666672");
    expect(tokens.pitch).toBe(1);
    expect(tokens.labelScale).toBe(64);
    expect(tokens.attendedNameInk).toBe("#ececf0");
  });

  it("names the 64 tokens once each, in camelCase of the css name", () => {
    expect(DIAL_TOKEN_SPECS).toHaveLength(64);
    expect(new Set(DIAL_TOKEN_SPECS.map((s) => s.key)).size).toBe(64);
    for (const { key, cssVar } of [...DIAL_TOKEN_SPECS, ...DIAL_INK_SPECS]) {
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
    ink.delete("--map-dial-stroke-element");
    expect(() => resolveDialTokens((v) => ink.get(v) ?? "")).toThrow(/--map-dial-stroke-element, --map-panel-text-primary/);
  });
});

describe("readDialTokens", () => {
  it("reads again when the theme changes", () => {
    let ink = "#111111";
    const spy = vi.spyOn(window, "getComputedStyle").mockImplementation(
      () => ({ getPropertyValue: (v: string) => (v === "--map-panel-text-primary" ? ink : (values().get(v) ?? "")) }) as CSSStyleDeclaration,
    );
    document.documentElement.setAttribute("data-theme", "dark");
    expect(readDialTokens().attendedNameInk).toBe("#111111");
    ink = "#222222";
    expect(readDialTokens().attendedNameInk).toBe("#111111");
    document.documentElement.setAttribute("data-theme", "light");
    expect(readDialTokens().attendedNameInk).toBe("#222222");
    document.documentElement.removeAttribute("data-theme");
    spy.mockRestore();
  });
});
