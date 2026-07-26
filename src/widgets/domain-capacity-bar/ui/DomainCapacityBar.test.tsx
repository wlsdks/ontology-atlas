import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DomainCapacityBar, DomainCapacityLegend } from "./DomainCapacityBar";

const labels = { capabilityUnit: "Capability", elementUnit: "Element" };

describe("DomainCapacityBar", () => {
  it("renders the domain title, total, and capability/element breakdown", () => {
    render(
      <DomainCapacityBar
        row={{ id: "domain:auth", title: "Auth", capabilityCount: 3, elementCount: 5, total: 8 }}
        maxTotal={8}
        labels={labels}
      />,
    );
    expect(screen.getByText("Auth")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("Capability 3 · Element 5")).toBeInTheDocument();
  });

  it("두 세그먼트는 앱 공통 막대 문법 — 主 계열 인디고 + 무채, kind tone 아님", () => {
    // kind tone(앰버/유칼립투스)은 트랙 위에서 서로 1.14:1 이라 밝기로는 구분이
    // 안 되고 hue 로만 갈렸는데, 그 hue 쌍이 적록 색약이 가장 못 가르는 축이다.
    // 정체는 순서·단위어·숫자가 이미 나르므로 색을 강등했다.
    render(
      <DomainCapacityBar
        row={{ id: "domain:auth", title: "Auth", capabilityCount: 3, elementCount: 1, total: 4 }}
        maxTotal={8}
        labels={labels}
      />,
    );
    const cap = screen.getByTestId("domain-capacity-bar-capability");
    const el = screen.getByTestId("domain-capacity-bar-element");
    expect(cap.style.width).toBe("37.5%");
    expect(el.style.width).toBe("12.5%");
    expect(cap.className).toContain("bg-[color:var(--color-indigo-brand)]");
    expect(el.className).toContain("bg-[color:var(--color-text-quaternary)]");
    // 인라인 배경색(하드코딩 rgba)으로 돌아가지 않는다 — 토큰 경유만.
    expect(cap.style.backgroundColor).toBe("");
    expect(el.style.backgroundColor).toBe("");
  });

  it("두 값이 모두 있으면 1px 심이 경계를 진다 — 색이 아니라 구조가 가른다", () => {
    // 인디고와 무채는 서로 1.12:1 이라 인접 경계가 색으로는 안 보인다. 심은
    // 색맹·흑백에서도 "값 두 개짜리 막대"임을 보증하는 색-무관 구분자다.
    render(
      <DomainCapacityBar
        row={{ id: "domain:auth", title: "Auth", capabilityCount: 3, elementCount: 1, total: 4 }}
        maxTotal={8}
        labels={labels}
      />,
    );
    const track = screen.getByTestId("domain-capacity-bar-track");
    expect(track.className).toContain("gap-px");
    expect(track.children).toHaveLength(2);
  });

  it("한쪽이 0 이면 세그먼트도 심도 없다 — 가를 것이 없다", () => {
    render(
      <DomainCapacityBar
        row={{ id: "domain:auth", title: "Auth", capabilityCount: 0, elementCount: 4, total: 4 }}
        maxTotal={8}
        labels={labels}
      />,
    );
    const track = screen.getByTestId("domain-capacity-bar-track");
    expect(track.children).toHaveLength(1);
    expect(screen.queryByTestId("domain-capacity-bar-capability")).toBeNull();
    expect(screen.getByTestId("domain-capacity-bar-element").style.width).toBe("50%");
  });

  it("트랙은 aria-hidden — 같은 수를 스크린리더가 두 번 읽지 않는다", () => {
    render(
      <DomainCapacityBar
        row={{ id: "domain:auth", title: "Auth", capabilityCount: 3, elementCount: 5, total: 8 }}
        maxTotal={8}
        labels={labels}
      />,
    );
    expect(screen.getByTestId("domain-capacity-bar-track")).toHaveAttribute("aria-hidden");
    // 사실 자체는 텍스트로 남아 있어야 한다.
    expect(screen.getByText("Capability 3 · Element 5")).toBeInTheDocument();
  });

  it("최소 폭 바닥을 두지 않는다 — 상수 바닥은 작은 값을 부풀리는 lie factor 다", () => {
    render(
      <DomainCapacityBar
        row={{ id: "domain:auth", title: "Auth", capabilityCount: 1, elementCount: 199, total: 200 }}
        maxTotal={200}
        labels={labels}
      />,
    );
    expect(screen.getByTestId("domain-capacity-bar-capability").style.width).toBe("0.5%");
  });

  it("꼬리 열 폭이 내용과 무관하게 같다 — 여섯 행이 한 축을 공유해야 한다 (E1)", () => {
    // `역량 4 · 요소 110` 과 `역량 2 · 요소 5` 는 글자 폭이 다르다. 그 차이가
    // 옆의 `flex-1` 트랙 길이로 새면 축이 행마다 갈리고(실측 929.8/935.5/941.2px)
    // 값이 작은 도메인이 더 긴 막대 축을 받는다. jsdom 은 레이아웃을 계산하지
    // 않으므로 폭을 정하는 **계약(고정 폭 클래스)** 을 단언한다.
    const tailOf = (row: { capabilityCount: number; elementCount: number; total: number }) => {
      const { unmount } = render(
        <DomainCapacityBar
          row={{ id: "domain:x", title: "X", ...row }}
          maxTotal={200}
          labels={labels}
        />,
      );
      const node = screen.getByTestId("domain-capacity-bar-row");
      const tail = node.lastElementChild as HTMLElement;
      const className = tail.className;
      unmount();
      return className;
    };

    const wide = tailOf({ capabilityCount: 4, elementCount: 110, total: 114 });
    const narrow = tailOf({ capabilityCount: 2, elementCount: 5, total: 7 });
    expect(wide).toBe(narrow);
    expect(wide).toContain("flex-none");
    expect(wide).toMatch(/w-\[\d+px\]/);
  });

  it("floors the fill at zero when maxTotal is zero (empty vault guard)", () => {
    render(
      <DomainCapacityBar
        row={{ id: "domain:auth", title: "Auth", capabilityCount: 0, elementCount: 0, total: 0 }}
        maxTotal={0}
        labels={labels}
      />,
    );
    expect(screen.getByTestId("domain-capacity-bar-track").children).toHaveLength(0);
  });
});

describe("DomainCapacityLegend", () => {
  it("두 단위어와 두 점을 그린다 — 색을 강등한 자리를 대신하는 열쇠", () => {
    render(<DomainCapacityLegend labels={labels} />);
    const legend = screen.getByTestId("domain-capacity-legend");
    expect(legend).toHaveTextContent("Capability");
    expect(legend).toHaveTextContent("Element");
    const dots = legend.querySelectorAll("span.rounded-full");
    expect(dots).toHaveLength(2);
    expect(dots[0].className).toContain("bg-[color:var(--color-indigo-brand)]");
    expect(dots[1].className).toContain("bg-[color:var(--color-text-quaternary)]");
    // 8px 점 — h-2 w-2 (타입/치수 램프 안, 임의 px 없음).
    expect(dots[0].className).toContain("h-2");
    expect(dots[0].className).toContain("w-2");
  });

  it("aria-hidden — aria-hidden 인 그래픽의 열쇠만 낭독되면 맥락 없는 단어가 된다", () => {
    render(<DomainCapacityLegend labels={labels} />);
    expect(screen.getByTestId("domain-capacity-legend")).toHaveAttribute("aria-hidden");
  });
});
