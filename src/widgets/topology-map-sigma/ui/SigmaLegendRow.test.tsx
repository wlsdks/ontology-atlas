import { render, screen } from "@testing-library/react";
import { SigmaLegendRow } from "./SigmaLegendRow";

describe("SigmaLegendRow", () => {
  it("pairs a large color swatch with a label and role description", () => {
    render(
      <SigmaLegendRow
        color="rgba(47, 128, 237, 0.97)"
        label="도메인"
        description="공유 어휘 경계"
      />,
    );

    expect(screen.getByText("도메인")).toBeInTheDocument();
    expect(screen.getByText("공유 어휘 경계")).toBeInTheDocument();
    const swatch = screen.getByText("도메인").closest("div")?.querySelector("[aria-hidden='true']");
    expect(swatch).toHaveClass("h-3.5");
    expect(swatch).toHaveClass("w-7");
    expect(swatch).toHaveStyle({ backgroundColor: "rgba(47, 128, 237, 0.97)" });
  });
});
