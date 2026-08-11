import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDestinationShortcuts } from "./use-destination-shortcuts";
import { NAV_LEADER_WINDOW_MS } from "@/shared/config/destinations";

/**
 * 이동 단축키의 **거절 조건**은 여기서 잰다 — e2e 가 아니라.
 *
 * ⚠️ **e2e 로 재려다 실패했다** (2026-08-09). 「입력 중에는 이동하지 않는다」를
 * 브라우저에서 재려면 입력칸에 초점을 줘야 하는데, 볼트를 안 고른 상태의 이 앱에는
 * **화면에 입력칸이 없다**(실측: `/topology` · `/projects` · `/docs` · `/git` 네
 * 라우트 전부 `input:visible` 0개). 그래서 ⌘K 팔레트를 열어 그 입력칸을 썼는데,
 * 팔레트가 **자기도 `aria-modal`** 이라 모달 판정이 먼저 걸렸다 — 입력 판정을
 * 통째로 지워도 그 시험은 초록이었다. **원리적으로 실패할 수 없는 시험**이었고,
 * 그건 게이트가 아니다(`/gate-probe`).
 *
 * 여기서는 키보드 사건을 직접 만들어 보내므로 조건이 서로 가려지지 않는다.
 * 「정말 이동하나」는 여전히 e2e 의 몫이다 —
 * `tests/e2e/destination-shortcuts.spec.ts`.
 */

/**
 * 한글 입력기가 켜진 상태의 키 사건 — `key` 는 자모, `code` 는 물리 위치.
 *
 * ⚠️ **이 함수가 있는 이유가 실제 결함이다** (2026-08-10, 설치 앱 실측).
 * 한글 입력 상태에서 물리 `G` 는 `key="ㅎ"`, `P` 는 `key="ㅔ"` 로 온다. 조합키도
 * 없고 초점도 body 였고 막는 표면도 없었는데, **단지 글자가 달라 하나도 안 먹었다.**
 * 이 제품의 주 언어가 한국어이므로 그건 드문 환경이 아니라 **평소 상태**였고,
 * 브라우저 e2e 는 Latin 을 타이핑하므로 원리적으로 못 잡는다.
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
    pressHangul("ㅎ", "KeyG"); // 리더
    pressHangul("ㅔ", "KeyP"); // 프로젝트
    expect(navigate, "한글 입력 상태에서 안 먹는다").toHaveBeenCalledWith("/projects/", "projects");
  });

  it("한글 입력기에서 G G(git)도 성립한다", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    pressHangul("ㅎ", "KeyG");
    pressHangul("ㅎ", "KeyG");
    expect(navigate).toHaveBeenCalledWith("/git/", "git");
  });

  it("자판이 QWERTY 가 아니어도 찍힌 글자로 맞는다", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    // AZERTY 에서 사용자가 `G` 라고 찍힌 키를 누르면 `code` 는 다를 수 있다.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "g", code: "KeyZ", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", code: "KeyX", bubbles: true }));
    expect(navigate).toHaveBeenCalledWith("/projects/", "projects");
  });

  it("리더 없이 글자만 누르면 아무 일도 없다", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    press("p");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("리더를 두 번 누르면 git 으로 간다 — 리더 자신도 둘째 글자가 될 수 있다", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    press("g");
    press("g");
    expect(navigate).toHaveBeenCalledWith("/git/", "git");
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
   * ⚠️ `isContentEditable` 을 **흉내 내야 한다** — jsdom 은 그것을 구현하지 않아
   * `contentEditable = "true"` 를 줘도 늘 `false` 다(실측으로 확인했다). 흉내를
   * 안 내면 이 시험은 훅이 아니라 jsdom 을 재는 셈이 된다.
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
    // jsdom 은 레이아웃이 없어 `getClientRects()` 가 늘 비었다 — 그려진 것으로
    // 보이게 흉내 낸다. 이 흉내가 필요하다는 사실 자체가, 화면 기준 판정을
    // 브라우저에서 한 번 더 재야 하는 이유다(e2e 가 그 몫을 맡는다).
    modal.getClientRects = (() => [{}] as unknown as DOMRectList) as typeof modal.getClientRects;
    document.body.append(modal);
    press("g");
    press("p");
    expect(navigate, "모달이 떠 있는데 뒤 화면을 바꿨다").not.toHaveBeenCalled();
  });

  /**
   * **숨은 모달은 막지 않는다.** 이 단언이 없으면, 퇴장 중인 표면 하나가 DOM 에
   * 남아 이동 단축키 전체를 영구히 죽이는 상태를 아무도 못 잡는다(실제로 그
   * 결함을 냈다 — 훅 주석 참고).
   */
  /**
   * **막힐 때 말해 준다** — 침묵이 아니라.
   *
   * 이것이 없던 동안 공방은 키보드 함정이었다: 도착하면 선택 창이 뜨고, 그 뒤로는
   * 어떤 이동 단축키도 **조용히** 먹지 않았다(2026-08-10 전체 검수에서 잡혔다).
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
    // 모달 안에서 그냥 타이핑하는 상황 — 안내가 쏟아지면 그게 소음이다.
    for (const key of ["a", "b", "c", "z"]) press(key);
    expect(onBlockedByOverlay, "지목도 안 했는데 말했다").not.toHaveBeenCalled();
  });

  it("숨은 막는 표면은 이동을 막지 않는다", () => {
    renderHook(() => useDestinationShortcuts({ navigate }));
    const hidden = document.createElement("div");
    hidden.setAttribute("aria-modal", "true");
    // 그려지지 않은 상태 = `getClientRects()` 가 비어 있다(jsdom 기본값).
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
   * ⚠️ **이 시험이 설치 앱의 결함을 잡는 자리다** (2026-08-10).
   *
   * 처음 구현은 시각을 **`event.timeStamp`** 로 읽고 «0 이면 리더를 안 누른 것»
   * 으로 판정했다. 브라우저에서는 잘 돌았고 e2e 도 통과했는데, **설치 앱
   * (WKWebView)에서는 리더 조합이 하나도 안 먹었다** — `G P` 도 `G M` 도. 같은
   * 화면에서 `?` 는 정상이었으니 키가 WebView 에 닿기는 했다.
   *
   * 0 을 «안 누름» 의 뜻으로 겸용한 것이 원인이고, 어떤 런타임이 0 을 주면 기능이
   * 통째로 사라지면서 **화면에는 아무 단서도 없다.** 그래서 두 사건의 `timeStamp`
   * 를 **둘 다 0** 으로 두고도 이동해야 한다고 못박는다.
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
    // 시계는 `performance.now()` 다 — 그것만 가짜로 만든다.
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
});
