import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getOntologyKindTone } from "@/entities/ontology-class";
import { DomainCapacityBar } from "./DomainCapacityBar";

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

  it("splits the bar fill using the ontology kind tones as data marks", () => {
    render(
      <DomainCapacityBar
        row={{ id: "domain:auth", title: "Auth", capabilityCount: 3, elementCount: 1, total: 4 }}
        maxTotal={8}
        labels={labels}
      />,
    );
    const row = screen.getByTestId("domain-capacity-bar-row");
    const segments = row.querySelectorAll<HTMLSpanElement>("span[style]");
    // 첫 두 style span 이 capability(37.5%)/element(12.5%) 세그먼트.
    const [capSegment, elSegment] = Array.from(segments);
    expect(capSegment.style.width).toBe("37.5%");
    expect(capSegment.style.backgroundColor).not.toBe("");
    expect(elSegment.style.width).toBe("12.5%");
    expect(capSegment.style.backgroundColor).toContain(
      rgbaToRgbPrefix(getOntologyKindTone("capability").fill),
    );
    expect(elSegment.style.backgroundColor).toContain(
      rgbaToRgbPrefix(getOntologyKindTone("element").fill),
    );
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
    const row = screen.getByTestId("domain-capacity-bar-row");
    const segments = row.querySelectorAll<HTMLSpanElement>("span[style]");
    for (const segment of Array.from(segments)) {
      expect(segment.style.width).toBe("0%");
    }
  });
});

// jsdom normalizes `rgba(...)` to `rgb(...)` shorthand comparisons can miss —
// compare on the shared numeric prefix instead of exact string equality.
function rgbaToRgbPrefix(rgba: string): string {
  const match = rgba.match(/rgba?\((\d+,\s*\d+,\s*\d+)/);
  if (!match) throw new Error(`Cannot parse rgba color: ${rgba}`);
  return match[1];
}
