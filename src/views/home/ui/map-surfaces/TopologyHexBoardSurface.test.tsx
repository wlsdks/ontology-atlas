import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  DEFAULT_MAP_NAVIGATION_SPEED,
} from "@/shared/lib/preferences/map-navigation-speed-preferences";
import type { HexBoardLabels, OntologyMapNode } from "@/widgets/ontology-map";
import en from "../../../../../messages/en.json";
import { TopologyHexBoardSurface } from "./TopologyHexBoardSurface";

const seen = vi.hoisted(() => ({ labels: null as HexBoardLabels | null }));

vi.mock("@/widgets/ontology-map", () => ({
  OntologyHexBoardMap: ({ labels }: { labels: HexBoardLabels }) => {
    seen.labels = labels;
    return null;
  },
}));
vi.mock("@/features/vault-ontology", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/vault-ontology")>()),
  useMapEvidenceStates: () => ({ availability: "no-paths", states: new Map(), movedPaths: new Map(), stalePaths: new Map() }),
  useRecheckedConcepts: () => new Set(),
}));

const insightNode = (id: string, kind: string) =>
  ({ id, title: id, kind, projectIds: [], evidenceIds: [], lastApprovedAt: new Date(0), lastApprovedBy: "test" }) as unknown as KnowledgeGraphNode;

const mapNode = (id: string, kind: OntologyMapNode["kind"], descendantCount: number): OntologyMapNode => ({
  id, label: id, kind, size: 1, x: 0, y: 0, isHub: kind === "project", ownerKey: null, recentlyUpdated: false, fullDegree: 0, descendantCount,
});

describe("hex board hub", () => {
  it("counts the folder's concepts by the map rule, not the hub's contained descendants", () => {
    const insight = [
      insightNode("project:atlas", "project"),
      insightNode("domain:map", "domain"),
      insightNode("capability:draw", "capability"),
      insightNode("element:loose", "element"),
      insightNode("document:notes", "document"),
    ];
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <TopologyHexBoardSurface
          nodes={[mapNode("project:atlas", "project", 2), mapNode("domain:map", "domain", 1), mapNode("capability:draw", "capability", 0)]}
          edges={[]}
          insightNodes={insight}
          vaultKey="vault"
          selectedId={null}
          onSelect={() => {}}
          onPaneClick={() => {}}
          reducedMotion
          arrivedByMorph={false}
          navigationSpeed={DEFAULT_MAP_NAVIGATION_SPEED}
        />
      </NextIntlClientProvider>,
    );
    expect(seen.labels?.projectMeta).toBe("4 concepts");
  });
});
