import { afterEach, describe, expect, it, vi } from "vitest";
import { canAutoStartGuidedTour } from "./auto-start-guard";

describe("canAutoStartGuidedTour (stacked-transient guard)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("blocks auto start while a modal dialog (e.g. VaultOpenGuideSheet) is open", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    document.body.innerHTML =
      '<section role="dialog" aria-modal="true" data-testid="vault-guide-sheet"></section>';
    expect(canAutoStartGuidedTour(document)).toBe(false);
  });

  it("blocks auto start while document focus is away (OS folder picker / background tab)", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    expect(canAutoStartGuidedTour(document)).toBe(false);
  });

  it("blocks auto start when the tour is already open manually (no welcome reset)", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    document.body.innerHTML =
      '<div data-testid="guided-tour-overlay" data-tour-step="nodes"></div>';
    expect(canAutoStartGuidedTour(document)).toBe(false);
  });

  it("allows auto start on an idle focused page — non-modal hint chips do not block", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    // GestureHint 류 비차단 칩은 data-interactive-overlay 만 달고 modal 이
    // 아니다 — 가드가 이를 이유로 투어를 막으면 안 된다.
    document.body.innerHTML = '<div data-interactive-overlay="true"></div>';
    expect(canAutoStartGuidedTour(document)).toBe(true);
  });
});
