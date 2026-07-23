import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TopologyRelationLegend } from "./TopologyRelationLegend";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("TopologyRelationLegend", () => {
  it("renders the two real edge-type encodings (contains solid / depends dashed) regardless of first-run state", () => {
    render(<TopologyRelationLegend />);

    const legend = screen.getByTestId("topology-relation-legend");
    // Both labels come from the shared relation-vocabulary dictionary
    // (`useRelationVocabulary(type, "formal")`); the mocked `useTranslations`
    // is an identity function, so the formal register resolves to the raw
    // edge-type keys "contains" / "depends".
    // 2026-07-23 (Image #9): the old right-hand item was a decorative
    // "confidence" gradient with no backing data — replaced by the real
    // `depends` (dashed) encoding the map actually draws.
    expect(legend).toHaveTextContent("contains");
    expect(legend).toHaveTextContent("depends");
    expect(legend).not.toHaveTextContent("overviewRelationLegendQuality");
  });
});
