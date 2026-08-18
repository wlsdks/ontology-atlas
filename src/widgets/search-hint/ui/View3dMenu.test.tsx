import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it } from "vitest";

import ko from "../../../../messages/ko.json";
import { View3dMenu } from "./View3dMenu";

/**
 * 「3D」 칩이 여는 보기 고르개의 계약.
 *
 * 이 검사가 지키는 것은 값이 아니라 **자리와 개수**다. 배치를 설정 시트에 두고
 * 이름을 「소유/결합」으로 썼을 때 소유자가 두 번 다 못 찾았다(원장 (84)) —
 * 그 회귀는 코드에 아무 값도 안 남기므로 렌더된 결과로만 잡을 수 있다.
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
   * 이름이 추상 명사면 그 개념을 아는 사람에게만 이름이다. 화면에 뜨는 말이
   * 눈에 보이는 것(돔·구름)이어야 한다는 것이 (84) 의 두 번째 교정이다.
   */
  it("눈에 보이는 것으로 부른다 — 화면에 「소유」·「결합」이 없다", () => {
    mount();
    expect(screen.getByText("돔")).toBeInTheDocument();
    expect(screen.getByText("구름")).toBeInTheDocument();
    expect(screen.queryByText("소유")).toBeNull();
    expect(screen.queryByText("결합")).toBeNull();
  });

  it("줄마다 무엇이 다른지 한 줄이 붙는다 — 이름만으로는 안 읽힌다", () => {
    mount();
    for (const id of ["flat", "ownership", "coupling"]) {
      const row = screen.getByTestId(`topology-view-3d-choice-${id}`);
      // 제목 + 힌트 두 줄. 한 줄뿐이면 힌트가 빠진 것이다.
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
   * **닫혀 있는 동안 Esc 를 삼키지 않는다** (2026-08-19 회귀).
   *
   * 이 컴포넌트는 칩 옆에 **항상 렌더된다**. 훅은 조기 반환보다 먼저 도니,
   * 전역 리스너를 `open` 으로 가드하지 않으면 닫혀 있는 내내 문서 Esc 를
   * 가로채 `stopPropagation()` 한다 — 앱 전역에서 Esc 가 죽는다. CI 실측:
   * 노드 상세가 Esc 로 안 닫히고 키보드 경로·포커스 반환·팝오버 계약까지
   * 다섯 스펙이 함께 빨개졌다.
   *
   * 여기서 재는 것은 «닫는 함수가 안 불린다»와 «전파가 살아 있다» 둘이다 —
   * 후자를 빼면 `onClose` 만 안 부르고 여전히 삼키는 구현이 통과한다.
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
