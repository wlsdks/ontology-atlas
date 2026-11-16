import {
  BASE_EDGES,
  BASE_NODES,
  SLUG,
  mocks,
  ontologyNode,
  renderPage,
  resetProjectDetailMocks,
} from "./ProjectDetailPage.harness";
import enMessages from "../../../../messages/en.json";
import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

describe("ProjectDetailPage", () => {
  beforeEach(resetProjectDetailMocks);

  describe("beside the brief: what to check and what changed", () => {
    const withDoc = (id: string, kind: string, title: string, docSlug: string) => ({ ...ontologyNode(id, kind, [SLUG], title), evidenceIds: [docSlug] });

    it("lists a stale capability with the file that moved, opens it on the map, and marks it in the composition", () => {
      mocks.insightNodes = BASE_NODES;
      mocks.insightEdges = BASE_EDGES;
      mocks.evidence = {
        availability: "measured",
        states: new Map([["capability:mcp-server", "stale"]]),
        movedPaths: new Map([["capability:mcp-server", "mcp/src/server.mjs"]]),
        stalePaths: new Map([["capability:mcp-server", { path: "mcp/src/server.mjs", gone: false, changedAt: "2026-11-16T00:00:00Z" }]]),
      };
      renderPage();

      const row = screen.getByTestId("project-detail-to-check-row");
      expect(row).toHaveAttribute("data-reason", "stale");
      expect(row).toHaveTextContent("mcp/src/server.mjs changed after this document was written.");
      expect(row).toHaveAttribute("href", "/topology/?mode=focus&p=capability%3Amcp-server");
      expect(screen.getByTestId("project-detail-evidence-line")).toHaveTextContent("1 of 1 capability that name a source file");
      const staleWords = enMessages.projectPages.detail.compositionStaleLegend;
      expect(screen.getByRole("img", { name: staleWords })).toHaveAttribute("title", staleWords);
      expect(screen.getByTestId("project-detail-stale-legend")).toHaveTextContent(staleWords);
      // One mark for one meaning: the legend, the capability row and the domain count draw the same dot.
      const dotClass = screen.getByTestId("project-detail-capability-stale").className;
      expect(screen.getByTestId("project-detail-stale-legend-mark").className).toBe(dotClass);
      expect(screen.getByTestId("project-detail-domain-stale").querySelector("span")?.className).toBe(dotClass);
      expect(screen.getByTestId("project-detail-domain-stale")).toHaveTextContent(/^1$/);
      expect(row).toHaveAccessibleName(expect.stringMatching(/^MCP Server .*mcp\/src\/server\.mjs changed after this document was written\.$/));
      expect(row).toHaveAccessibleDescription("Opens it on the map.");
      const option = screen.getAllByTestId("project-detail-domain-option").find((el) => el.getAttribute("aria-label")?.includes("with a source changed"));
      expect(option).toHaveAccessibleName(expect.not.stringContaining("◐"));
    });

    it("draws no stale mark when evidence was not measured, names why, and says the empty sentence beside it", () => {
      mocks.insightNodes = BASE_NODES;
      mocks.insightEdges = BASE_EDGES;
      mocks.evidence = {
        availability: "unreadable",
        states: new Map([["capability:mcp-server", "stale"]]),
        movedPaths: new Map(),
        stalePaths: new Map([["capability:mcp-server", { path: "mcp/src/server.mjs", gone: false, changedAt: null }]]),
      };
      renderPage();

      expect(screen.queryByTestId("project-detail-to-check-row")).not.toBeInTheDocument();
      expect(screen.getByTestId("project-detail-evidence-line")).toHaveTextContent(enMessages.projectPages.detail.toCheckEvidenceUnreadable);
      expect(screen.getByTestId("project-detail-to-check-empty")).toHaveTextContent(enMessages.projectPages.detail.toCheckEmpty);
      expect(screen.queryByTestId("project-detail-capability-stale")).not.toBeInTheDocument();
      expect(screen.queryByTestId("project-detail-stale-legend")).not.toBeInTheDocument();
      expect(screen.queryByTestId("project-detail-domain-stale")).not.toBeInTheDocument();
    });

    it("says no capability names a file when the walk compared none of this project's, even though it measured others", () => {
      mocks.insightNodes = BASE_NODES;
      mocks.insightEdges = BASE_EDGES;
      mocks.evidence = {
        availability: "measured",
        states: new Map([["capability:another-project", "current"]]),
        movedPaths: new Map(),
        stalePaths: new Map(),
      };
      renderPage();

      expect(screen.getByTestId("project-detail-evidence-line")).toHaveTextContent(enMessages.projectPages.detail.toCheckEvidenceNoPaths);
      expect(screen.queryByTestId("project-detail-stale-legend")).not.toBeInTheDocument();
    });

    it("opens every row in a dialog grouped by reason when more rows exist than fit", () => {
      const names = ["Alpha", "Beta", "Gamma", "Delta"];
      mocks.insightNodes = [...BASE_NODES, ...names.map((name) => withDoc(`capability:${name}`, "capability", name, `capabilities/${name}`))];
      mocks.insightEdges = BASE_EDGES;
      mocks.conceptFacts = new Map(names.map((name) => [`capabilities/${name}`, { findings: ["definition-missing"] }]));
      renderPage();

      expect(screen.getAllByTestId("project-detail-to-check-row")).toHaveLength(3);
      expect(mocks.dialogGroupings, "a closed dialog groups nothing").toBe(0);
      fireEvent.click(screen.getByTestId("project-detail-to-check-view-all"));
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText("No definition · 4")).toBeInTheDocument();
      expect(within(dialog).getAllByTestId("project-detail-to-check-row")).toHaveLength(4);
    });

    it("opens a document the agent raised in /docs, with the agent's note as its reason", async () => {
      mocks.insightNodes = [...BASE_NODES, withDoc("capability:checkout", "capability", "Checkout", "capabilities/checkout")];
      mocks.insightEdges = BASE_EDGES;
      mocks.vaultDocs = [
        { slug: "capabilities/checkout", title: "Checkout", frontmatter: { kind: "capability", review_state: "human_decides", review_note: "One capability or two?" } },
      ];
      renderPage();

      const row = await screen.findByTestId("project-detail-to-check-row");
      expect(row).toHaveAttribute("data-reason", "raised");
      expect(row).toHaveTextContent("Needs a decision: “One capability or two?”");
      expect(row.getAttribute("href")).toContain("slug=capabilities%2Fcheckout");
    });

    it("lists this project's changes newest first, with the map's recent lens as its door", () => {
      mocks.insightNodes = [...BASE_NODES, ontologyNode("capability:other", "capability", ["other"], "Other")];
      mocks.insightEdges = BASE_EDGES;
      mocks.recent = {
        reading: false,
        windowDays: 7,
        rows: [
          { id: "capability:other", agoDays: 0 },
          { id: "element:cli", agoDays: 1 },
          { id: "capability:mcp-server", agoDays: 0 },
        ],
        recentNodeIds: new Set(["capability:other", "element:cli", "capability:mcp-server"]),
      };
      renderPage();

      expect(screen.getByTestId("project-detail-changed-heading")).toHaveTextContent("Changed in the last 7 days · 2");
      const rows = screen.getAllByTestId("project-detail-changed-row");
      // The name is what the row shows, then where it opens.
      expect(rows).toEqual([
        screen.getByRole("link", { name: "MCP Server today", description: "Opens it on the map." }),
        screen.getByRole("link", { name: "CLI yesterday", description: "Opens it on the map." }),
      ]);
      expect(rows.map((row) => row.getAttribute("href"))).toEqual([
        "/topology/?mode=focus&p=capability%3Amcp-server",
        "/topology/?mode=focus&p=element%3Acli",
      ]);
      expect(screen.getByTestId("project-detail-changed-map-link")).toHaveAttribute("href", "/topology/?recent=auto");
      expect(screen.getByTestId("project-detail-capability-changed")).toHaveAccessibleName(enMessages.topology.index.freshTitle);
    });

    it("says it is reading change dates instead of claiming nothing changed", () => {
      mocks.insightNodes = BASE_NODES;
      mocks.insightEdges = BASE_EDGES;
      mocks.recent = { reading: true, windowDays: 7, rows: [], recentNodeIds: new Set() };
      renderPage();

      expect(screen.getByTestId("project-detail-changed-heading")).toHaveTextContent(enMessages.projectPages.detail.changedReading);
      expect(screen.queryByTestId("project-detail-changed-empty")).not.toBeInTheDocument();
    });

    it("opens Changes from the closing line", () => {
      mocks.insightNodes = BASE_NODES;
      mocks.insightEdges = BASE_EDGES;
      renderPage();
      expect(screen.getByTestId("project-detail-changes-link")).toHaveAttribute("href", "/changes/");
    });
  });
});
