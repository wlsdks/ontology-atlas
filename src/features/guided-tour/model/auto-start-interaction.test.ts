import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchGuidedTourAutoStartCancel } from "./auto-start-interaction";

/**
 * F6 회귀 — 자동 투어는 화면이 정착할 때까지 기다리느라 2~6초 뒤에 발화할 수
 * 있는데, 그 사이 사용자가 스스로 노드를 클릭해 상세 패널을 열면 1/7 카드가
 * 그 위로 끼어들었다. 대기 중 첫 실질 상호작용이면 발화를 취소한다.
 */
describe("watchGuidedTourAutoStartCancel", () => {
  beforeEach(() => {
    // jsdom 의 document.hasFocus() 는 기본 false — 가드가 그것만으로 막지
    // 않도록 "앞에 떠 있는 탭" 을 흉내낸다(auto-start-guard.test 와 같은 관례).
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

    // 시트가 닫힌 뒤에도 감시는 살아 있다 — 그 다음 상호작용부터 취소.
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
