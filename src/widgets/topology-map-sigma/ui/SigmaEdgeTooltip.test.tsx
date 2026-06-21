import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import enMessages from "../../../../messages/en.json";
import { SigmaSelectedEdgeCard } from "./SigmaEdgeTooltip";

function I18nTestProvider({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

describe("SigmaSelectedEdgeCard", () => {
  it("keeps selected relation endpoint names visibly readable", () => {
    render(
      <SigmaSelectedEdgeCard
        data={{
          edgeId: "edge:views-to-ontology-hub",
          source: "domain:views",
          target: "capability:ontology-hub-mode-aware",
          sourceName: "Views (Topology · Browse · Builder)",
          targetName: "Ontology Hub — Mode-Aware",
          kind: "contains",
          relationType: "contains",
          relationQuality: "strong",
          evidenceCount: 1,
          authored: false,
          x: 0,
          y: 0,
        }}
        onClose={vi.fn()}
      />,
      { wrapper: I18nTestProvider },
    );

    const endpointRoute = screen.getByTestId("sigma-selected-edge-endpoint-route");

    expect(endpointRoute).toHaveAttribute(
      "data-endpoint-route-contract",
      "visible-source-target-names-wrap",
    );
    expect(endpointRoute).toHaveAttribute(
      "data-source-name",
      "Views (Topology · Browse · Builder)",
    );
    expect(endpointRoute).toHaveAttribute("data-target-name", "Ontology Hub — Mode-Aware");
    expect(endpointRoute).toHaveAttribute(
      "data-handle-summary",
      "domain:views → capability:ontology-hub-mode-aware",
    );
    expect(endpointRoute).toHaveTextContent("Views (Topology · Browse · Builder)");
    expect(endpointRoute).toHaveTextContent("Ontology Hub — Mode-Aware");
    expect(endpointRoute.className).toContain("flex-wrap");
    expect(endpointRoute.className).not.toContain("truncate");
  });
});
