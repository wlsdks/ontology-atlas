import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DomainCapacityBar, DomainCapacityLegend } from "./DomainCapacityBar";

const labels = { capabilityUnit: "Capability", elementUnit: "Element" };

describe("DomainCapacityBar", () => {
  it("renders the domain title, total, and capability/element breakdown", () => {
    render(
      <DomainCapacityBar
        row={{ id: "domain:auth", title: "Auth", capabilityCount: 3, elementCount: 5, total: 8 }}
        labels={labels}
      />,
    );
    expect(screen.getByText("Auth")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("Capability 3 · Element 5")).toBeInTheDocument();
  });

  it("두 세그먼트는 앱 공통 막대 문법 — 主 계열 인디고 + 무채, kind tone 아님", () => {
    // The kind tones (amber/eucalyptus) measure 1.14:1 against each other on the
    // track, so they never separated by brightness — only by hue, and that hue pair
    // is the axis red-green colour blindness separates worst. Identity is already
    // carried by order, unit words and numbers, so colour was demoted.
    render(
      <DomainCapacityBar
        row={{ id: "domain:auth", title: "Auth", capabilityCount: 3, elementCount: 1, total: 4 }}
        labels={labels}
      />,
    );
    const cap = screen.getByTestId("domain-capacity-bar-capability");
    const el = screen.getByTestId("domain-capacity-bar-element");
    // The denominator is **this row's own sum** (3+1=4), not the list's maximum. The track is always full.
    expect(cap.style.width).toBe("75%");
    expect(el.style.width).toBe("25%");
    expect(cap.className).toContain("bg-[color:var(--color-indigo-brand)]");
    expect(el.className).toContain("bg-[color:var(--color-text-quaternary)]");
    // No going back to inline background colours (hardcoded rgba) — tokens only.
    expect(cap.style.backgroundColor).toBe("");
    expect(el.style.backgroundColor).toBe("");
  });

  it("두 값이 모두 있으면 1px 심이 경계를 진다 — 색이 아니라 구조가 가른다", () => {
    // Indigo and neutral measure 1.12:1 against each other, so an adjacent boundary is
    // invisible by colour alone. The seam is a colour-independent separator that
    // guarantees "a bar of two values" even in colour blindness or greyscale.
    render(
      <DomainCapacityBar
        row={{ id: "domain:auth", title: "Auth", capabilityCount: 3, elementCount: 1, total: 4 }}
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
        labels={labels}
      />,
    );
    const track = screen.getByTestId("domain-capacity-bar-track");
    expect(track.children).toHaveLength(1);
    expect(screen.queryByTestId("domain-capacity-bar-capability")).toBeNull();
    // With one side at 0 it becomes a single solid colour, and that is the state this bar says loudest.
    expect(screen.getByTestId("domain-capacity-bar-element").style.width).toBe("100%");
  });

  it("트랙은 aria-hidden — 같은 수를 스크린리더가 두 번 읽지 않는다", () => {
    render(
      <DomainCapacityBar
        row={{ id: "domain:auth", title: "Auth", capabilityCount: 3, elementCount: 5, total: 8 }}
        labels={labels}
      />,
    );
    expect(screen.getByTestId("domain-capacity-bar-track")).toHaveAttribute("aria-hidden");
    // The fact itself has to remain as text.
    expect(screen.getByText("Capability 3 · Element 5")).toBeInTheDocument();
  });

  it("최소 폭 바닥을 두지 않는다 — 상수 바닥은 작은 값을 부풀리는 lie factor 다", () => {
    render(
      <DomainCapacityBar
        row={{ id: "domain:auth", title: "Auth", capabilityCount: 1, elementCount: 199, total: 200 }}
        labels={labels}
      />,
    );
    expect(screen.getByTestId("domain-capacity-bar-capability").style.width).toBe("0.5%");
  });

  it("꼬리 열 폭이 내용과 무관하게 같다 — 여섯 행이 한 축을 공유해야 한다 (E1)", () => {
    // `역량 4 · 요소 110` and `역량 2 · 요소 5` have different text widths. If that
    // difference leaks into the length of the `flex-1` track beside it, the axis
    // diverges row by row (measured 929.8/935.5/941.2px) and a domain with smaller
    // values gets a longer bar axis. jsdom does not compute layout, so what is
    // asserted is **the contract that sets the width** (the fixed-width class).
    const tailOf = (row: { capabilityCount: number; elementCount: number; total: number }) => {
      const { unmount } = render(
        <DomainCapacityBar
          row={{ id: "domain:x", title: "X", ...row }}
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
    // An 8px dot — h-2 w-2 (inside the type and dimension ramps, no arbitrary px).
    expect(dots[0].className).toContain("h-2");
    expect(dots[0].className).toContain("w-2");
  });

  it("aria-hidden — aria-hidden 인 그래픽의 열쇠만 낭독되면 맥락 없는 단어가 된다", () => {
    render(<DomainCapacityLegend labels={labels} />);
    expect(screen.getByTestId("domain-capacity-legend")).toHaveAttribute("aria-hidden");
  });
});

/**
 * **Length does not state size** (2026-08-09, the owner chose 「막대가 구성을
 * 말하게」 — let the bar state composition).
 *
 * The denominator used to be the list's maximum, so length was size. But the number
 * right beside it was already answering that, and measured, the fill ratios were
 * 100/94/88/82/76/65/53/47% — clustered in the top half, so the differences in length
 * taught almost nothing new.
 *
 * The property this test pins: *however different two rows' sums are, the track fills
 * identically and the only thing that differs is where the boundary sits.* Break that
 * and the bar quietly reverts to its old meaning.
 */
describe("막대가 말하는 것 — 크기가 아니라 구성", () => {
  it("합이 3배 차이 나도 트랙은 똑같이 꽉 찬다", () => {
    const { rerender } = render(
      <DomainCapacityBar
        row={{ id: "a", title: "Small", capabilityCount: 1, elementCount: 3, total: 4 }}
        labels={labels}
      />,
    );
    const small = [
      screen.getByTestId("domain-capacity-bar-capability").style.width,
      screen.getByTestId("domain-capacity-bar-element").style.width,
    ];
    rerender(
      <DomainCapacityBar
        row={{ id: "b", title: "Big", capabilityCount: 3, elementCount: 9, total: 12 }}
        labels={labels}
      />,
    );
    const big = [
      screen.getByTestId("domain-capacity-bar-capability").style.width,
      screen.getByTestId("domain-capacity-bar-element").style.width,
    ];
    expect(small, "합이 4인 행도 25/75 로 트랙을 다 쓴다").toEqual(["25%", "75%"]);
    expect(big, "합이 12인 행도 같은 비율이면 같은 그림이다").toEqual(small);
  });

  it("두 조각의 폭을 더하면 언제나 100%", () => {
    for (const row of [
      { capabilityCount: 1, elementCount: 11 },
      { capabilityCount: 3, elementCount: 2 },
      { capabilityCount: 7, elementCount: 10 },
    ]) {
      const { unmount } = render(
        <DomainCapacityBar
          row={{ id: "x", title: "X", ...row, total: row.capabilityCount + row.elementCount }}
          labels={labels}
        />,
      );
      const sum = ["capability", "element"]
        .map((k) => Number(screen.getByTestId(`domain-capacity-bar-${k}`).style.width.replace("%", "")))
        .reduce((a, b) => a + b, 0);
      expect(Math.round(sum), `${row.capabilityCount}:${row.elementCount} 이 트랙을 안 채운다`).toBe(100);
      unmount();
    }
  });

  it("둘 다 0이면 빈 트랙이다 — 0을 100%로 부풀리지 않는다", () => {
    render(
      <DomainCapacityBar
        row={{ id: "z", title: "Z", capabilityCount: 0, elementCount: 0, total: 0 }}
        labels={labels}
      />,
    );
    expect(screen.getByTestId("domain-capacity-bar-track").children).toHaveLength(0);
  });
});
