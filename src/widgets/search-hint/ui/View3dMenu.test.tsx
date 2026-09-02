import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it } from "vitest";

import ko from "../../../../messages/ko.json";
import { View3dMenu } from "./View3dMenu";

/**
 * The contract for the view picker the 「3D」 chip opens.
 *
 * What this check holds is not values but **position and count**. When the
 * arrangements lived in the settings sheet under the names 「Ownership/Combination」, the owner
 * failed to find them twice (ledger (84)) — that regression leaves no value in the
 * code, so only the rendered result can catch it.
 */
function mount() {
  return render(
    <NextIntlClientProvider locale="ko" messages={ko}>
      <View3dMenu open onClose={() => {}} />
    </NextIntlClientProvider>,
  );
}

function mountClosed(onClose: () => void) {
  return render(
    <NextIntlClientProvider locale="ko" messages={ko}>
      <View3dMenu open={false} onClose={onClose} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("View3dMenu — 보기 고르개", () => {
  it("세 줄이다 — 평면·돔·구름이 한 목록에 있다", () => {
    mount();
    expect(screen.getByTestId("topology-view-3d-choice-flat")).toBeInTheDocument();
    expect(screen.getByTestId("topology-view-3d-choice-ownership")).toBeInTheDocument();
    expect(screen.getByTestId("topology-view-3d-choice-coupling")).toBeInTheDocument();
  });

  /*
   * An abstract noun is only a name to someone who already knows the concept. The
   * words on screen have to be the visible things (cone, cloud) — that was (84)'s
   * second correction.
   */
  it("눈에 보이는 것으로 부른다 — 화면에 「소유」·「결합」이 없다", () => {
    mount();
    expect(screen.getByText("원뿔")).toBeInTheDocument();
    expect(screen.getByText("구름")).toBeInTheDocument();
    expect(screen.queryByText("소유")).toBeNull();
    expect(screen.queryByText("결합")).toBeNull();
  });

  it("줄마다 무엇이 다른지 한 줄이 붙는다 — 이름만으로는 안 읽힌다", () => {
    mount();
    for (const id of ["flat", "ownership", "coupling"]) {
      const row = screen.getByTestId(`topology-view-3d-choice-${id}`);
      // Title plus hint, two lines. One line means the hint is missing.
      expect(row.querySelectorAll("span").length).toBeGreaterThanOrEqual(2);
    }
  });

  it("기본 상태에서는 평면이 골라져 있다 — 3D 는 옵트인이다", () => {
    mount();
    expect(screen.getByTestId("topology-view-3d-choice-flat")).toHaveAttribute("aria-checked", "true");
  });

  it("구름을 고르면 3D 가 켜지고 배치가 함께 저장된다 (두 값이 한 번에)", () => {
    mount();
    fireEvent.click(screen.getByTestId("topology-view-3d-choice-coupling"));
    expect(window.localStorage.getItem("atlas.appearance.view3d")).toBe("on");
    expect(window.localStorage.getItem("atlas.appearance.map-arrangement")).toBe("coupling");
  });

  it("평면을 고르면 3D 가 꺼진다 — 끄기가 같은 목록에 있다", () => {
    window.localStorage.setItem("atlas.appearance.view3d", "on");
    mount();
    fireEvent.click(screen.getByTestId("topology-view-3d-choice-flat"));
    expect(window.localStorage.getItem("atlas.appearance.view3d")).toBe("off");
  });

  /**
   * **It does not swallow Esc while closed** (regression, 2026-08-19).
   *
   * This component is **always rendered** beside the chip. Hooks run before any early
   * return, so without guarding the global listener on `open` it intercepts document
   * Esc and calls `stopPropagation()` the whole time it is closed — killing Esc across
   * the app. Measured in CI: node detail stopped closing on Esc, and five specs went
   * red together, covering the keyboard path, focus return and the popover contract.
   *
   * Two things are measured here: «the close function is not called» and «propagation
   * is alive». Drop the latter and an implementation that merely skips `onClose` while
   * still swallowing would pass.
   */
  it("닫혀 있으면 문서 Esc 를 삼키지 않는다 — 앱 전역 Esc 가 죽지 않는다", () => {
    let closed = 0;
    mountClosed(() => {
      closed += 1;
    });

    let reachedDocument = 0;
    const spy = () => {
      reachedDocument += 1;
    };
    document.addEventListener("keydown", spy);
    fireEvent.keyDown(document, { key: "Escape" });
    document.removeEventListener("keydown", spy);

    expect(closed, "닫혀 있는데 onClose 가 불렸다").toBe(0);
    expect(reachedDocument, "Esc 가 문서까지 못 갔다 — 고르개가 삼키고 있다").toBe(1);
  });
});
