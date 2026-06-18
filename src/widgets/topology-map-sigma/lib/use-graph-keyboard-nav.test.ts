import { describe, expect, it } from "vitest";
import { shouldPreserveNativeTabNavigation } from "./use-graph-keyboard-nav";

describe("shouldPreserveNativeTabNavigation", () => {
  it("keeps native Tab movement for visible topology controls", () => {
    document.body.innerHTML = `
      <button data-testid="topology-concept-search">Search</button>
      <a href="/docs">Docs</a>
      <div tabindex="0" data-testid="relation-row">Relation</div>
    `;

    expect(
      shouldPreserveNativeTabNavigation(
        document.querySelector('[data-testid="topology-concept-search"]'),
      ),
    ).toBe(true);
    expect(shouldPreserveNativeTabNavigation(document.querySelector("a"))).toBe(true);
    expect(
      shouldPreserveNativeTabNavigation(
        document.querySelector('[data-testid="relation-row"]'),
      ),
    ).toBe(true);
  });

  it("allows graph-level Tab navigation only from the non-interactive map layer", () => {
    document.body.innerHTML = `
      <div data-graph-keyboard-nav-root="true">
        <div data-testid="sigma-map"></div>
        <button data-testid="relation-label">contains</button>
      </div>
    `;

    expect(
      shouldPreserveNativeTabNavigation(document.querySelector('[data-testid="sigma-map"]')),
    ).toBe(false);
    expect(
      shouldPreserveNativeTabNavigation(document.querySelector('[data-testid="relation-label"]')),
    ).toBe(true);
    expect(shouldPreserveNativeTabNavigation(document.body)).toBe(true);
  });
});
