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

  it("keeps the default tail breakdown, and moves it under the title when asked", () => {
    const row = { id: "domain:auth", title: "Auth", capabilityCount: 3, elementCount: 5, total: 8 };
    const { unmount } = render(<DomainCapacityBar row={row} labels={labels} />);
    expect(screen.getByTestId("domain-capacity-bar-tail")).toContainElement(screen.getByTestId("domain-capacity-bar-breakdown"));
    unmount();
    render(<DomainCapacityBar row={row} labels={labels} breakdownPlacement="title" />);
    const tail = screen.getByTestId("domain-capacity-bar-tail");
    expect(tail).toHaveTextContent(/^8$/);
    expect(tail).not.toContainElement(screen.getByTestId("domain-capacity-bar-breakdown"));
  });

  it('draws both segments in the shared bar grammar of indigo and neutral, not kind tones', () => {
    // Kind tones separate only by hue, the axis red-green colour blindness separates worst;
    // identity is already in order, unit words and numbers.
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

  it('separates two nonzero values with a 1px seam', () => {
    // Indigo and neutral are 1.12:1, so the seam separates two values without colour.
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

  it('draws no seam when one side is zero', () => {
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

  it('hides the track from assistive technology', () => {
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

  it('sets no minimum width floor so small values are not inflated', () => {
    render(
      <DomainCapacityBar
        row={{ id: "domain:auth", title: "Auth", capabilityCount: 1, elementCount: 199, total: 200 }}
        labels={labels}
      />,
    );
    expect(screen.getByTestId("domain-capacity-bar-capability").style.width).toBe("0.5%");
  });

  it('keeps the tail column the same width regardless of content', () => {
    // Different tail text widths must not change the track length; jsdom has no layout, so the
    // fixed-width class is asserted.
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
    // A fixed width on the spacing scale (`w-48`), not a width that follows the words.
    expect(wide).toMatch(/\bw-\d+\b/);
  });

  it("renders all nine current English Storefront tails inside the measured 192px column", () => {
    const storefrontRows = [
      { capabilityCount: 7, elementCount: 10 },
      { capabilityCount: 8, elementCount: 8 },
      { capabilityCount: 6, elementCount: 9 },
      { capabilityCount: 4, elementCount: 10 },
      { capabilityCount: 8, elementCount: 6 },
      { capabilityCount: 5, elementCount: 8 },
      { capabilityCount: 6, elementCount: 5 },
      { capabilityCount: 5, elementCount: 4 },
      { capabilityCount: 5, elementCount: 1 },
    ];

    expect(storefrontRows).toHaveLength(9);
    for (const [index, row] of storefrontRows.entries()) {
      const text = `capabilities ${row.capabilityCount} · elements ${row.elementCount}`;
      const { unmount } = render(
        <DomainCapacityBar
          row={{
            id: `domain:${index}`,
            title: `Domain ${index}`,
            total: row.capabilityCount + row.elementCount,
            ...row,
          }}
          labels={{ capabilityUnit: "capabilities", elementUnit: "elements" }}
        />,
      );
      const breakdown = screen.getByText(text);
      const tail = breakdown.parentElement as HTMLElement;
      expect(tail).toHaveClass("w-48");
      expect(breakdown).toHaveTextContent(text);
      unmount();
    }
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
  it('draws two unit words and two dots as the legend', () => {
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

  it('hides the legend from assistive technology along with the graphic', () => {
    render(<DomainCapacityLegend labels={labels} />);
    expect(screen.getByTestId("domain-capacity-legend")).toHaveAttribute("aria-hidden");
  });
});

/**
 * Length does not state size: however different two rows' sums are, the track fills identically and
 * only the boundary moves.
 */
describe('the bar shows composition, not size', () => {
  it('fills the track fully even when totals differ threefold', () => {
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
    expect(small, 'a row totalling 4 fills the track at 25/75').toEqual(["25%", "75%"]);
    expect(big, 'a row totalling 12 with the same ratio draws the same picture').toEqual(small);
  });

  it('sums the two segment widths to 100%', () => {
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
      expect(Math.round(sum), `${row.capabilityCount}:${row.elementCount} does not fill the track`).toBe(100);
      unmount();
    }
  });

  it('draws an empty track when both are zero', () => {
    render(
      <DomainCapacityBar
        row={{ id: "z", title: "Z", capabilityCount: 0, elementCount: 0, total: 0 }}
        labels={labels}
      />,
    );
    expect(screen.getByTestId("domain-capacity-bar-track").children).toHaveLength(0);
  });
});
