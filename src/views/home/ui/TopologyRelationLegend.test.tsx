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
    // P1a-1: the spine label now comes from the shared relation-vocabulary
    // dictionary (`useRelationVocabulary("contains", "formal")`) instead of
    // its own `overviewRelationLegendSpine` i18n key — the mocked
    // `useTranslations` above is an identity function, so the formal
    // register resolves to the raw edge-type key "contains".
    expect(legend).toHaveTextContent("contains");
    expect(legend).toHaveTextContent("overviewRelationLegendQuality");
  });
});
