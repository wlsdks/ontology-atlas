import { render, screen } from "@testing-library/react";
import { SigmaRelationLegend } from "./SigmaRelationLegend";

const labels = {
  title: "관계선",
  strong: "강한 구조",
  strongShort: "강",
  supported: "근거 있음",
  supportedShort: "근",
  weak: "약한 관련",
  weakShort: "약",
  review: "검토 필요",
  reviewShort: "검",
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
    expect(legend).toHaveAttribute("data-relation-legend-layout", "single-row-strip");
    expect(screen.getByText("관계선")).toBeInTheDocument();
    expect(screen.getByText("강")).toBeInTheDocument();
    expect(screen.getByText("근")).toBeInTheDocument();
    expect(screen.getByText("약")).toBeInTheDocument();
    expect(screen.getByText("검")).toBeInTheDocument();
  });

  it("binds each relation row to the same stroke tokens used by map connectors", () => {
    render(<SigmaRelationLegend labels={labels} />);

    expect(screen.getByLabelText("강한 구조").closest("[data-relation-legend-row]")).toHaveAttribute(
      "data-relation-stroke-token",
      "--topology-relation-stroke-strong",
    );
    expect(screen.getByLabelText("근거 있음").closest("[data-relation-legend-row]")).toHaveAttribute(
      "data-relation-stroke-token",
      "--topology-relation-stroke-supported",
    );
    expect(screen.getByLabelText("약한 관련").closest("[data-relation-legend-row]")).toHaveAttribute(
      "data-relation-stroke-token",
      "--topology-relation-stroke-weak",
    );
    expect(screen.getByLabelText("검토 필요").closest("[data-relation-legend-row]")).toHaveAttribute(
      "data-relation-stroke-token",
      "--topology-relation-stroke-review",
    );
  });
});
