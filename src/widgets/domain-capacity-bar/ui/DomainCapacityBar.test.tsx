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
