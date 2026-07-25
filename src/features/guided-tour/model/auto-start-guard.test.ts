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

  it("안내가 가리키는 모달(공방 시작 선택)은 차단 사유가 아니다", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    // 공방은 도착하자마자 이 모달이 서 있는 화면이다. 금지하려던 것은 *사용자가
    // 열어 둔 다른 표면* 위에 겹쳐 쏘는 것이지, 안내가 설명하려는 그 표면을
    // 감광하는 것이 아니다 — 예외가 없으면 공방만 영영 안내를 못 받는다.
    document.body.innerHTML =
      '<section role="dialog" aria-modal="true" data-testid="studio-entry-choice"></section>';
    expect(canAutoStartGuidedTour(document)).toBe(false);
    expect(canAutoStartGuidedTour(document, ["studio-entry-choice"])).toBe(true);
  });

  it("가리키는 요소를 품은 모달도 마찬가지 — 다른 모달은 여전히 막는다", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    document.body.innerHTML =
      '<section role="dialog" aria-modal="true"><div data-testid="do-next-touchups"></div></section>' +
      '<section role="dialog" aria-modal="true" data-testid="vault-guide-sheet"></section>';
    expect(canAutoStartGuidedTour(document, ["do-next-touchups"])).toBe(false);
  });

  it("allows auto start on an idle focused page — non-modal hint chips do not block", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    // GestureHint 류 비차단 칩은 data-interactive-overlay 만 달고 modal 이
    // 아니다 — 가드가 이를 이유로 투어를 막으면 안 된다.
    document.body.innerHTML = '<div data-interactive-overlay="true"></div>';
    expect(canAutoStartGuidedTour(document)).toBe(true);
  });
});
