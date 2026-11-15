import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readTreeTokens } from "./read-tree-tokens";

const BORROWED_INKS: Record<string, string> = {
  "--map-graph-project": "#9aa2ff",
  "--map-graph-disc-fill": "#0b0c12",
  "--map-graph-name": "#c9cdd8",
  "--map-graph-name-strong": "#f4f5f9",
  "--map-graph-halo": "#07080c",
  "--map-graph-arc": "#cfd3ff",
  "--map-graph-reach": "#eeaa86",
  "--color-status-warning": "#f4b731",
  "--map-canvas-bg-near": "#0a0a0d",
};

function declaredTreeTokens(): Record<string, string> {
  const css = readFileSync(path.join(process.cwd(), "app/styles/map-tree-tokens.css"), "utf8");
  return Object.fromEntries([...css.matchAll(/(--map-tree-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

function stubStyle(values: Record<string, string>): void {
  vi.spyOn(window, "getComputedStyle").mockReturnValue({
    getPropertyValue: (name: string) => values[name] ?? "",
  } as CSSStyleDeclaration);
}

afterEach(() => vi.restoreAllMocks());

describe("readTreeTokens", () => {
  it("throws naming a missing tree token instead of falling back", () => {
    const values = { ...declaredTreeTokens(), ...BORROWED_INKS };
    delete values["--map-tree-arc-width-px"];
    stubStyle(values);
    expect(() => readTreeTokens()).toThrow(/--map-tree-arc-width-px/);
  });
});
