import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import ko from "../../messages/ko.json";
import en from "../../messages/en.json";

/**
 * The error screen's two actions are **standard buttons with translated labels**.
 *
 * History. On 2026-08-17 both actions used `shape: "icon"` (square, no horizontal
 * padding), so their labels overflowed and overlapped; they were moved to a hand-built
 * `pill` with `h-10`, a custom indigo fill and a manual focus ring. On 2026-09-25 the
 * sibling 404 still used `<Button>`, so the two dead ends differed in radius, fill and
 * height, and the copy was hard-coded English under a Korean URL.
 *
 * This screen is only visible **when something has already gone wrong**, so it can stay
 * broken without anyone meeting it. What is pinned is the grammar, not a sentence: the
 * screen draws the primitive, not a hand dialect, and every label comes from both locales.
 */
const SCREEN = readFileSync(
  join(process.cwd(), "src", "views", "terminal-state", "ui", "RouteErrorScreen.tsx"),
  "utf8",
);
const BOUNDARY = readFileSync(join(process.cwd(), "app", "error.tsx"), "utf8");

describe("error screen controls", () => {
  it("the boundary renders the shared screen, not its own markup", () => {
    expect(BOUNDARY).toMatch(/<RouteErrorScreen\b/u);
    expect(BOUNDARY).not.toMatch(/className=/u);
  });

  it("retry is the standard primary button and home the standard outline", () => {
    expect(SCREEN).toMatch(/<Button[^>]*variant="primary"[^>]*onClick=\{onRetry\}/u);
    expect(SCREEN).toMatch(/buttonVariants\(\{\s*variant:\s*'outline'\s*\}\)/u);
  });

  it("draws no hand-built control dialect", () => {
    expect(SCREEN).not.toMatch(/controlClass\(/u);
    expect(SCREEN).not.toMatch(/\bh-10\b|\brounded-full\b|focus-visible:ring/u);
  });

  it("every label is a message both locales carry", () => {
    const keys = [...SCREEN.matchAll(/\bt\('([A-Za-z]+)'\)/gu)].map((m) => m[1]);
    expect(keys.length, "found no translated label; the checks below would idle").toBeGreaterThanOrEqual(5);
    for (const key of keys) {
      expect((ko.routeError as Record<string, string>)[key], `ko routeError.${key}`).toBeTruthy();
      expect((en.routeError as Record<string, string>)[key], `en routeError.${key}`).toBeTruthy();
    }
  });
});
