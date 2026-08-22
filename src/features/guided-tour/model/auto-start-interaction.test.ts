import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchGuidedTourAutoStartCancel } from "./auto-start-interaction";

/**
 * Regression — the automatic tour waits for the screen to settle and can fire two to
 * six seconds later, and in that window a user who clicked a node and opened the
 * detail panel had a 1/7 card cut in over it. The first substantive interaction while
 * waiting cancels the firing.
 */
describe("watchGuidedTourAutoStartCancel", () => {
  beforeEach(() => {
    // jsdom's `document.hasFocus()` defaults to false — imitate a foreground tab so the
    // guard does not block on that alone (the same idiom as auto-start-guard.test).
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  function openModal() {
    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    document.body.appendChild(modal);
    return modal;
  }

  it("지도 위 포인터 입력이면 자동 발화를 취소한다", () => {
    const onCancel = vi.fn();
    const stop = watchGuidedTourAutoStartCancel(onCancel);

    window.dispatchEvent(new Event("pointerdown"));

    expect(onCancel).toHaveBeenCalledTimes(1);
    stop();
  });

  it("모달이 떠 있는 동안의 입력은 취소로 세지 않는다 — 시트의 [다음에] 클릭이 곧 투어 차례다", () => {
    const onCancel = vi.fn();
    const stop = watchGuidedTourAutoStartCancel(onCancel);
    const modal = openModal();

    window.dispatchEvent(new Event("pointerdown"));
    expect(onCancel).not.toHaveBeenCalled();

    // The watch stays alive after the sheet closes — the next interaction cancels.
    modal.remove();
    window.dispatchEvent(new Event("pointerdown"));
    expect(onCancel).toHaveBeenCalledTimes(1);

    stop();
  });

  it("수정자 키만 눌린 것은 탐색 시작이 아니다", () => {
    const onCancel = vi.fn();
    const stop = watchGuidedTourAutoStartCancel(onCancel);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
    expect(onCancel).not.toHaveBeenCalled();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    stop();
  });

  it("한 번만 알리고 스스로 떨어진다", () => {
    const onCancel = vi.fn();
    const stop = watchGuidedTourAutoStartCancel(onCancel);

    window.dispatchEvent(new Event("pointerdown"));
    window.dispatchEvent(new Event("pointerdown"));

    expect(onCancel).toHaveBeenCalledTimes(1);
    stop();
  });

  it("해제하면 더 이상 감지하지 않는다", () => {
    const onCancel = vi.fn();
    const stop = watchGuidedTourAutoStartCancel(onCancel);
    stop();

    window.dispatchEvent(new Event("pointerdown"));

    expect(onCancel).not.toHaveBeenCalled();
  });
});
