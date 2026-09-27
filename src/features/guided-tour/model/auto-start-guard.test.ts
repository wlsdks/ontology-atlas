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

  it("blocks auto start while a blocking edit composer is open", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    // CreateNodeForm and OntologyBootstrapForm declare modality via data-surface-role, not
    // role=dialog; the tour must still defer.
    document.body.innerHTML =
      '<section data-surface-role="blocking-edit-surface" data-testid="create-node-form"></section>';
    expect(canAutoStartGuidedTour(document)).toBe(false);
  });

  it("blocks auto start while an honest fallback card is shown", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    // A "you cannot get here" screen (the workshop below `lg`) has no surface to introduce.
    document.body.innerHTML =
      '<main data-surface-role="degraded-surface" data-testid="degraded-surface"></main>';
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

  it("blocks auto start while the workshop entry modal is open", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    // Guidance over the entry choice would cover the cards it introduces and stack two
    // `aria-modal` elements; it appears after the decision.
    document.body.innerHTML =
      '<section role="dialog" aria-modal="true" data-testid="studio-entry-choice"></section>';
    expect(canAutoStartGuidedTour(document)).toBe(false);
  });

  it("allows auto start on an idle focused page — non-modal hint chips do not block", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    // Non-blocking chips like GestureHint carry only data-interactive-overlay and are not modals.
    document.body.innerHTML = '<div data-interactive-overlay="true"></div>';
    expect(canAutoStartGuidedTour(document)).toBe(true);
  });

  /** A hands-on practice band is not modal, but the tour must not cover it. */
  it("does not explain a surface the user is already working through", () => {
    document.body.innerHTML =
      '<div data-testid="studio-practice-rail" data-surface-role="hands-on-guide"></div>';
    expect(canAutoStartGuidedTour(document)).toBe(false);
  });
});

/**
 * The settings dock is non-modal, but the guard follows where attention is, so a marker
 * bridges the missing `aria-modal`.
 */
describe("settings dock blocking", () => {
  it("blocks auto start while the settings-dock marker is present", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    document.body.innerHTML =
      '<div role="dialog" data-surface-role="settings-dock">설정</div>';
    expect(canAutoStartGuidedTour(document)).toBe(false);
  });

  it("allows auto start again after the dock closes", () => {
    // The guard also reads document focus, so guidance is not fired into a background tab.
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    document.body.innerHTML = "";
    expect(canAutoStartGuidedTour(document)).toBe(true);
  });
});
