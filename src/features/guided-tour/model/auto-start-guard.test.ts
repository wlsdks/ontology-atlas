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
    // 공방은 도착하자마자 이 결정 화면이 서는데, 그 위에 안내를 쏘면 카드가
    // 소개하려던 진입 선택 카드를 덮고 `aria-modal` 이 둘이 된다(스크린리더
    // 에서 카드 소실). 안내는 결정이 끝난 뒤 작업 표면에서 뜬다.
    document.body.innerHTML =
      '<section role="dialog" aria-modal="true" data-testid="studio-entry-choice"></section>';
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
