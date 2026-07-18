import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TopologyRelationLegend } from "./TopologyRelationLegend";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("TopologyRelationLegend", () => {
  it("always renders the spine and quality-stroke key regardless of first-run state", () => {
    render(<TopologyRelationLegend />);

    const legend = screen.getByTestId("topology-relation-legend");
    expect(legend).toHaveTextContent("overviewRelationLegendSpine");
    expect(legend).toHaveTextContent("overviewRelationLegendQuality");
  });
});
