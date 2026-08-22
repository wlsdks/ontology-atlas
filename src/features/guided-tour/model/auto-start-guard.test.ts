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

  it("blocks auto start while a blocking edit composer (개념 추가) is open (#96)", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    // CreateNodeForm/OntologyBootstrapForm declare modality via
    // data-surface-role, not role=dialog — the tour must still defer.
    document.body.innerHTML =
      '<section data-surface-role="blocking-edit-surface" data-testid="create-node-form"></section>';
    expect(canAutoStartGuidedTour(document)).toBe(false);
  });

  it("정직 강등 카드가 선 화면에는 안내를 쏘지 않는다 — 없는 표면을 소개할 수 없다", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    // A screen that says "you cannot get here" (the workshop below `lg`). Raising
    // "this is the workshop" over it is a lie rather than guidance.
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

  it("안내가 가리키려는 모달(공방 진입 선택)도 예외 없이 막는다", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    // The workshop puts this decision screen up the moment you arrive; firing guidance
    // over it covers the entry-choice cards the card meant to introduce and puts two
    // `aria-modal` elements up (the card vanishes for a screen reader). Guidance appears
    // on the work surface after the decision is made.
    document.body.innerHTML =
      '<section role="dialog" aria-modal="true" data-testid="studio-entry-choice"></section>';
    expect(canAutoStartGuidedTour(document)).toBe(false);
  });

  it("allows auto start on an idle focused page — non-modal hint chips do not block", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    // Non-blocking chips like GestureHint carry only data-interactive-overlay and are
    // not modals — the guard must not block the tour on that basis.
    document.body.innerHTML = '<div data-interactive-overlay="true"></div>';
    expect(canAutoStartGuidedTour(document)).toBe(true);
  });

  /**
   * **Do not explain to someone who is already doing it.** Measured in the installed
   * app 2026-07-29: starting the workshop practice raised the first-visit tour over it
   * 900ms later and physically blocked the practice's step 1 ("give it a name"). The
   * practice band is a non-blocking band rather than a modal, so it matched none of the
   * modality conditions.
   */
  it("does not explain a surface the user is already working through", () => {
    document.body.innerHTML =
      '<div data-testid="studio-practice-rail" data-surface-role="hands-on-guide"></div>';
    expect(canAutoStartGuidedTour(document)).toBe(false);
  });
});

/**
 * The settings dock is non-modal and has no `aria-modal`. But the fact that "the user
 * is in conversation with another surface" is unchanged — this guard's criterion is
 * not modality but **where the attention is**, so a marker has to bridge the place
 * where the attribute was lost.
 */
describe("설정 도크 위에는 안내를 쏘지 않는다", () => {
  it("settings-dock 마커가 서 있으면 자동 시작이 막힌다", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    document.body.innerHTML =
      '<div role="dialog" data-surface-role="settings-dock">설정</div>';
    expect(canAutoStartGuidedTour(document)).toBe(false);
  });

  it("도크가 닫히면 다시 열린다 — 영구 차단이 아니다", () => {
    // This guard also looks at document focus (so guidance is not fired into a background tab).
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    document.body.innerHTML = "";
    expect(canAutoStartGuidedTour(document)).toBe(true);
  });
});
