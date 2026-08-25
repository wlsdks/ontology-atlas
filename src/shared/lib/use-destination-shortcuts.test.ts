import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDestinationShortcuts } from "./use-destination-shortcuts";
import { NAV_LEADER_WINDOW_MS } from "@/shared/config/destinations";

/**
 * The navigation shortcuts' **refusal conditions** are measured here, not in e2e.
 *
 * ⚠️ **Measuring them in e2e failed** (2026-08-09). Proving "do not navigate while
 * typing" in a browser needs a focused input, and with no vault selected this app
 * has **no visible input on screen** (measured: `input:visible` count 0 on all of
 * `/topology`, `/projects`, `/docs`, `/git`). Opening the ⌘K palette to borrow its
 * input did not work either — the palette is **itself `aria-modal`**, so the modal
 * check fired first and the spec stayed green even with the typing check deleted
 * entirely. A spec that cannot fail is not a gate (`/gate-probe`).
 *
 * Dispatching keyboard events directly keeps the conditions from masking each
 * other. Whether navigation actually happens is still e2e's job —
 * `tests/e2e/destination-shortcuts.spec.ts`.
 */

/**
 * A key event with a Korean IME active — `key` is a jamo, `code` is the physical
 * position.
 *
 * ⚠️ **This helper exists because of a real defect** (2026-08-10, measured in the
 * installed app). With the Korean IME on, physical `G` arrives as the Hangul
 * letter hieuh (U+314E), and `P` as the Hangul letter e (U+3154). No modifier,
 * focus on body, no blocking surface — and
 * **nothing worked, purely because the character differed.** Korean is this
 * product's primary language, so that is the normal state, not an edge case, and
 * browser e2e types Latin so it can never catch it.
 */
function pressHangul(jamo: string, code: string) {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: jamo, code, bubbles: true, cancelable: true }),
  );
}

function press(key: string, target?: Element, extra: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra });
  (target ?? window).dispatchEvent(event);
  return event;
}

describe("useDestinationShortcuts", () => {
  let navigate: ReturnType<typeof vi.fn<(href: string, id: string) => void>>;

  beforeEach(() => {
    navigate = vi.fn();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("리더 다음 글자를 누르면 그 목적지로 데려간다", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    press("g");
    press("p");
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0]?.[0]).toBe("/projects/");
    expect(navigate.mock.calls[0]?.[1]).toBe("projects");
  });

  it("한글 입력기가 켜져 있어도 이동한다 — 물리 키로 판정한다", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    pressHangul("ㅎ", "KeyG"); // leader
    pressHangul("ㅔ", "KeyP"); // projects
    expect(navigate, "한글 입력 상태에서 안 먹는다").toHaveBeenCalledWith("/projects/", "projects");
  });

  it("한글 입력기에서 G R(architecture)도 성립한다", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    pressHangul("ㅎ", "KeyG");
    pressHangul("ㄱ", "KeyR");
    expect(navigate).toHaveBeenCalledWith("/architecture/", "architecture");
  });

  it("자판이 QWERTY 가 아니어도 찍힌 글자로 맞는다", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    // On AZERTY, pressing the key printed `G` can report a different `code`.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "g", code: "KeyZ", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", code: "KeyX", bubbles: true }));
    expect(navigate).toHaveBeenCalledWith("/projects/", "projects");
  });

  it("리더 없이 글자만 누르면 아무 일도 없다", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    press("p");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("리더 다음 r을 누르면 architecture로 간다", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    press("g");
    press("r");
    expect(navigate).toHaveBeenCalledWith("/architecture/", "architecture");
  });

  it("입력칸에 초점이 있으면 이동하지 않는다", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    const input = document.createElement("input");
    document.body.append(input);
    press("g", input);
    press("p", input);
    expect(navigate, "입력 중에 화면을 바꿨다").not.toHaveBeenCalled();
  });

  it("textarea 도 같다", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    const area = document.createElement("textarea");
    document.body.append(area);
    press("g", area);
    press("p", area);
    expect(navigate).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ `isContentEditable` **has to be faked** — jsdom does not implement it, so it
   * stays `false` even after `contentEditable = "true"` (confirmed by measurement).
   * Without the fake this spec measures jsdom rather than the hook.
   */
  it("contentEditable 도 같다", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    Object.defineProperty(editable, "isContentEditable", { value: true });
    document.body.append(editable);
    press("g", editable);
    press("p", editable);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("조합키가 눌린 입력은 우리 것이 아니다", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    press("g", undefined, { metaKey: true });
    press("p");
    expect(navigate, "⌘G 를 리더로 먹었다").not.toHaveBeenCalled();
  });

  it("보이는 막는 표면이 있으면 이동하지 않는다", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    const modal = document.createElement("div");
    modal.setAttribute("aria-modal", "true");
    // jsdom has no layout, so `getClientRects()` is always empty — fake it into
    // looking rendered. Needing this fake is itself the reason the visibility
    // judgement is measured once more in a browser (e2e owns that half).
    modal.getClientRects = (() => [{}] as unknown as DOMRectList) as typeof modal.getClientRects;
    document.body.append(modal);
    press("g");
    press("p");
    expect(navigate, "모달이 떠 있는데 뒤 화면을 바꿨다").not.toHaveBeenCalled();
  });

  /**
   * **Say so when blocked**, rather than going silent.
   *
   * While this was missing, the studio was a keyboard trap: arriving there opened
   * a picker, after which every navigation shortcut **silently** did nothing
   * (found in the 2026-08-10 sweep).
   */
  it("막는 표면이 있으면 이동하지 않고 알린다", () => {
    const onBlockedByOverlay = vi.fn();
    renderHook(() => useDestinationShortcuts({ navigate, onBlockedByOverlay }));
    const modal = document.createElement("div");
    modal.setAttribute("aria-modal", "true");
    modal.getClientRects = (() => [{}] as unknown as DOMRectList) as typeof modal.getClientRects;
    document.body.append(modal);
    press("g");
    press("p");
    expect(navigate, "모달이 떠 있는데 이동했다").not.toHaveBeenCalled();
    expect(onBlockedByOverlay, "막혔는데 아무 말도 안 했다").toHaveBeenCalledTimes(1);
  });

  it("갈 곳을 지목하지 않은 키에는 아무 말도 하지 않는다", () => {
    const onBlockedByOverlay = vi.fn();
    renderHook(() => useDestinationShortcuts({ navigate, onBlockedByOverlay }));
    const modal = document.createElement("div");
    modal.setAttribute("aria-modal", "true");
    modal.getClientRects = (() => [{}] as unknown as DOMRectList) as typeof modal.getClientRects;
    document.body.append(modal);
    // Plain typing inside a modal — a hint for every keystroke would be noise.
    for (const key of ["a", "b", "c", "z"]) press(key);
    expect(onBlockedByOverlay, "지목도 안 했는데 말했다").not.toHaveBeenCalled();
  });

  /**
   * **A hidden modal must not block.** Without this assertion, nobody catches the
   * state where one exit-animating surface left in the DOM permanently kills every
   * navigation shortcut — a defect this repo actually shipped (see the hook's own
   * comment).
   */
  it("숨은 막는 표면은 이동을 막지 않는다", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    const hidden = document.createElement("div");
    hidden.setAttribute("aria-modal", "true");
    // Not rendered = `getClientRects()` is empty (jsdom's default).
    document.body.append(hidden);
    press("g");
    press("p");
    expect(navigate, "숨은 모달이 이동을 막았다").toHaveBeenCalledTimes(1);
  });

  it("aria-hidden 조상 안의 모달도 세지 않는다", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    const wrapper = document.createElement("div");
    wrapper.setAttribute("aria-hidden", "true");
    const modal = document.createElement("div");
    modal.setAttribute("aria-modal", "true");
    modal.getClientRects = (() => [{}] as unknown as DOMRectList) as typeof modal.getClientRects;
    wrapper.append(modal);
    document.body.append(wrapper);
    press("g");
    press("p");
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  /**
   * ⚠️ **This is the spec that catches the installed-app defect** (2026-08-10).
   *
   * The first implementation read the clock from **`event.timeStamp`** and treated
   * 0 as "the leader was never pressed". It worked in the browser and passed e2e,
   * but **in the installed app (WKWebView) no leader combination worked at all** —
   * neither `G P` nor `G M`. `?` still worked on the same screen, so the keys were
   * reaching the WebView.
   *
   * The cause was overloading 0 to mean "not pressed": any runtime that reports 0
   * makes the whole feature vanish **with no clue on screen**. So both events are
   * pinned at `timeStamp` 0 and navigation must still happen.
   */
  it("event.timeStamp 가 0 이어도 이동한다 — 시계를 사건에서 읽지 않는다", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    for (const key of ["g", "p"]) {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      Object.defineProperty(event, "timeStamp", { value: 0 });
      window.dispatchEvent(event);
    }
    expect(navigate, "사건의 timeStamp 에 기대고 있다").toHaveBeenCalledWith("/projects/", "projects");
  });

  it("리더를 누른 지 오래되면 글자만으로는 이동하지 않는다", () => {
    // The clock is `performance.now()` — fake only that.
    vi.useFakeTimers();
    try {
      renderHook(() => useDestinationShortcuts({ navigate }));
      press("g");
      vi.advanceTimersByTime(NAV_LEADER_WINDOW_MS + 50);
      press("p");
      expect(navigate, "시간 제한이 안 걸렸다").not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("시간 제한 안이면 이동한다 — 위 시험이 늘 통과하는 게 아니라는 증거", () => {
    vi.useFakeTimers();
    try {
      renderHook(() => useDestinationShortcuts({ navigate }));
      press("g");
      vi.advanceTimersByTime(Math.floor(NAV_LEADER_WINDOW_MS / 2));
      press("p");
      expect(navigate).toHaveBeenCalledWith("/projects/", "projects");
    } finally {
      vi.useRealTimers();
    }
  });

  it("disabled 면 아무것도 하지 않는다", () => {
    renderHook(() => useDestinationShortcuts({ navigate, disabled: true }));
    press("g");
    press("p");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("문맥 주소가 있으면 그것으로 간다", () => {
    renderHook(() =>
      useDestinationShortcuts({ navigate, hrefOverrides: { docs: "/project/atlas/docs/" } }),
    );
    press("g");
    press("d");
    expect(navigate).toHaveBeenCalledWith("/project/atlas/docs/", "docs");
  });

  it("화면이 다시 그려져도 전역 keydown 리스너를 갈아 끼우지 않고 최신 목적지를 쓴다", () => {
    const removeListener = vi.spyOn(window, "removeEventListener");
    const firstNavigate = vi.fn();
    const secondNavigate = vi.fn();
    const { rerender } = renderHook(
      ({ currentNavigate, docsHref }) =>
        useDestinationShortcuts({
          navigate: currentNavigate,
          hrefOverrides: { docs: docsHref },
        }),
      {
        initialProps: {
          currentNavigate: firstNavigate,
          docsHref: "/project/first/docs/",
        },
      },
    );

    removeListener.mockClear();
    rerender({
      currentNavigate: secondNavigate,
      docsHref: "/project/second/docs/",
    });

    expect(
      removeListener.mock.calls.filter(([type]) => type === "keydown"),
      "AppShell 재렌더 사이에 단축키 리스너가 사라졌다",
    ).toHaveLength(0);
    press("g");
    press("d");
    expect(firstNavigate).not.toHaveBeenCalled();
    expect(secondNavigate).toHaveBeenCalledWith("/project/second/docs/", "docs");
  });
});
