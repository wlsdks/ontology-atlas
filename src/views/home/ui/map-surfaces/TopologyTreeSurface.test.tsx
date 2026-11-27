import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MAP_NAVIGATION_SPEED,
} from "@/shared/lib/preferences/map-navigation-speed-preferences";
import type { OntologyMapNode } from "@/widgets/ontology-map";
import en from "../../../../../messages/en.json";
import type { MapEvidence } from "@/features/vault-ontology";
import { TopologyTreeSurface } from "./TopologyTreeSurface";

const evidence = vi.hoisted(() => ({ current: null as MapEvidence | null }));

vi.mock("@/widgets/ontology-map", () => ({
  OntologyTreeMap: ({ legend }: { legend: (state: { focused: boolean }) => ReactNode }) => <>{legend({ focused: false })}</>,
}));
vi.mock("@/features/vault-ontology", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/vault-ontology")>()),
  useMapEvidenceStates: () => evidence.current,
}));

const mapNode = (id: string, kind: OntologyMapNode["kind"]) => ({ id, label: id, kind }) as unknown as OntologyMapNode;
const nodes = [mapNode("project:p", "project"), mapNode("domain:d", "domain"), mapNode("capability:a", "capability"), mapNode("element:b", "element"), mapNode("element:c", "element")];

function renderSurface() {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <TopologyTreeSurface
        nodes={nodes}
        edges={[]}
        insightNodes={[]}
        vaultKey="vault"
        selectedId={null}
        onSelect={() => {}}
        onPaneClick={() => {}}
        reducedMotion
        arrivedByMorph={false}
        navigationSpeed={DEFAULT_MAP_NAVIGATION_SPEED}
        fitToken={0}
        growthReplayToken={0}
      />
    </NextIntlClientProvider>,
  );
}

describe("the tree's legend", () => {
  it("has no stale item when evidence was not measured, and the quiet line names why", () => {
    evidence.current = { availability: "app-only", states: new Map([["capability:a", "stale"]]), movedPaths: new Map(), stalePaths: new Map() };
    renderSurface();
    expect(screen.queryByTestId("tree-map-legend-stale")).toBeNull();
    expect(screen.getByTestId("tree-map-evidence-note").textContent).toBe(en.mapTree.evidenceNeedsFolder);
  });

  it("counts the stale concepts of every kind when evidence was measured", () => {
    evidence.current = {
      availability: "measured",
      states: new Map([["capability:a", "stale"], ["element:b", "stale"], ["element:c", "current"]]),
      movedPaths: new Map(),
      stalePaths: new Map(),
    };
    renderSurface();
    expect(screen.getByTestId("tree-map-legend-stale").textContent).toBe("2 stale");
    expect(screen.queryByTestId("tree-map-evidence-note")).toBeNull();
  });
});
