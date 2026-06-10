import { render, screen } from "@testing-library/react";
import { SigmaLegendRow } from "./SigmaLegendRow";

describe("SigmaLegendRow", () => {
  it("pairs a compact color dot with a label (charter: kind hue is a small data-mark)", () => {
    render(
      <SigmaLegendRow
        color="rgba(47, 128, 237, 0.97)"
        label="도메인"
      />,
    );

    expect(screen.getByText("도메인")).toBeInTheDocument();
    const swatch = screen.getByText("도메인").closest("div")?.querySelector("[aria-hidden='true']");
    // compact 6px dot, not the old 40px glow pill
    expect(swatch).toHaveClass("h-1.5");
    expect(swatch).toHaveClass("w-1.5");
    expect(swatch).toHaveClass("rounded-full");
    expect(swatch).toHaveStyle({ backgroundColor: "rgba(47, 128, 237, 0.97)" });
  });

  it("still renders an optional description (audit legend reuse)", () => {
    render(<SigmaLegendRow color="#fff" label="도메인" description="공유 어휘 경계" />);
    expect(screen.getByText("공유 어휘 경계")).toBeInTheDocument();
  });

  it("renders an optional tier tag on the same row (계층 위계 표기)", () => {
    render(<SigmaLegendRow color="#fff" label="도메인" tier="2계층" />);
    expect(screen.getByText("2계층")).toBeInTheDocument();
  });

  it("omits the tier tag when not given", () => {
    render(<SigmaLegendRow color="#fff" label="도메인" />);
    expect(screen.queryByText(/계층/)).not.toBeInTheDocument();
  });
});
