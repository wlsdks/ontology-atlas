import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FlatDialLegend } from "./FlatDialLegend";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, number>) => (values ? `${key} ${values.shown}/${values.total}` : key),
}));

describe("FlatDialLegend", () => {
  it("says how many links the rest budget shows only when it hides some", () => {
    const { rerender } = render(<FlatDialLegend evidenceMeasured={false} linksShown={17} linksTotal={17} />);
    expect(screen.queryByTestId("flat-dial-legend-links")).not.toBeInTheDocument();
    rerender(<FlatDialLegend evidenceMeasured={false} linksShown={24} linksTotal={61} />);
    expect(screen.getByTestId("flat-dial-legend-links")).toHaveTextContent("linksShown 24/61");
  });

  it("always says what the rings mean", () => {
    render(<FlatDialLegend evidenceMeasured={false} linksShown={17} linksTotal={17} />);
    expect(screen.getByTestId("flat-dial-legend-rings")).toHaveTextContent("legendRings");
  });
});
