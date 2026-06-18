import { render, screen } from "@testing-library/react";
import { SigmaRelationLegend } from "./SigmaRelationLegend";

const labels = {
  title: "관계선",
  strong: "강한 구조",
  supported: "근거 있음",
  weak: "약한 관련",
  review: "검토 필요",
};

describe("SigmaRelationLegend", () => {
  it("renders a compact map utility legend for relation stroke semantics", () => {
    render(<SigmaRelationLegend labels={labels} />);

    const legend = screen.getByTestId("topology-relation-legend");
    expect(legend).toHaveAttribute(
      "data-relation-legend-contract",
      "map-utility-explains-edge-semantics",
    );
    expect(legend).toHaveAttribute("data-relation-legend-attention-role", "utility");
    expect(screen.getByText("관계선")).toBeInTheDocument();
  });

  it("binds each relation row to the same stroke tokens used by map connectors", () => {
    render(<SigmaRelationLegend labels={labels} />);

    expect(screen.getByText("강한 구조").closest("[data-relation-legend-row]")).toHaveAttribute(
      "data-relation-stroke-token",
      "--topology-relation-stroke-strong",
    );
    expect(screen.getByText("근거 있음").closest("[data-relation-legend-row]")).toHaveAttribute(
      "data-relation-stroke-token",
      "--topology-relation-stroke-supported",
    );
    expect(screen.getByText("약한 관련").closest("[data-relation-legend-row]")).toHaveAttribute(
      "data-relation-stroke-token",
      "--topology-relation-stroke-weak",
    );
    expect(screen.getByText("검토 필요").closest("[data-relation-legend-row]")).toHaveAttribute(
      "data-relation-stroke-token",
      "--topology-relation-stroke-review",
    );
  });
});
