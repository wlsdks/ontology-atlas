import { render, screen } from "@testing-library/react";
import { SigmaRelationLegend } from "./SigmaRelationLegend";

const labels = {
  title: "선 의미",
  strong: "강한 구조",
  strongShort: "강함",
  supported: "근거 있음",
  supportedShort: "근거",
  weak: "약한 관련",
  weakShort: "약함",
  review: "검토 필요",
  reviewShort: "검토",
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
    expect(legend).toHaveAttribute(
      "data-relation-legend-typography",
      "readable-utility-labels",
    );
    expect(legend).toHaveAttribute(
      "data-relation-legend-width-token",
      "--topology-relation-legend-width",
    );
    expect(legend).toHaveAttribute(
      "data-relation-legend-max-width-token",
      "--topology-relation-legend-max-width",
    );
    expect(legend).toHaveAttribute(
      "data-relation-legend-inset-token",
      "--topology-relation-legend-inset",
    );
    expect(legend).toHaveAttribute(
      "data-relation-legend-bottom-token",
      "--topology-relation-legend-bottom",
    );
    expect(legend).toHaveAttribute(
      "data-relation-legend-minimap-gap-token",
      "--topology-relation-legend-minimap-gap",
    );
    expect(legend).toHaveAttribute(
      "data-relation-legend-surface-token",
      "--topology-relation-legend-surface",
    );
    expect(legend).toHaveAttribute(
      "data-relation-legend-border-token",
      "--topology-relation-legend-border",
    );
    expect(legend).toHaveAttribute(
      "data-relation-legend-shadow-token",
      "--topology-relation-legend-shadow",
    );
    expect(screen.getByText("선 의미")).toBeInTheDocument();
    expect(screen.getByText("강함")).toBeInTheDocument();
    expect(screen.getByText("근거")).toBeInTheDocument();
    expect(screen.getByText("약함")).toBeInTheDocument();
    expect(screen.getByText("검토")).toBeInTheDocument();
    const legendClasses = [
      legend.className,
      ...Array.from(legend.querySelectorAll("[class]"), (element) => element.className),
    ].join(" ");
    expect(legendClasses).not.toContain("font-mono");
    expect(legendClasses).not.toContain("uppercase");
    expect(legendClasses).not.toContain("w-[300px]");
    expect(legendClasses).not.toContain("right-4");
    expect(legendClasses).not.toContain("bottom-[calc");
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
