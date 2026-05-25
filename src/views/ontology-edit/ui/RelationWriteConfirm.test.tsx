import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RelationWriteConfirm } from "./RelationWriteConfirm";
import { RelationPostSaveHandoff } from "./RelationPostSaveHandoff";
import type { VaultRelationKey } from "../lib/relation-proposal";
import { copyText } from "@/shared/lib/copy-text";

vi.mock("@/shared/lib/copy-text", () => ({
  copyText: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

const copyTextMock = vi.mocked(copyText);

const relationKeyLabels: Record<VaultRelationKey, string> = {
  domains: "domains",
  capabilities: "capabilities",
  elements: "elements",
  dependencies: "dependencies",
  contains: "contains",
  describes: "describes",
  relates: "relates",
};

const relationKeyHints: Record<VaultRelationKey, string> = {
  domains: "owns domain",
  capabilities: "owns capability",
  elements: "uses element",
  dependencies: "depends on",
  contains: "contains target",
  describes: "describes target",
  relates: "semantic relation",
};

const labels = {
  title: "Confirm relation write",
  body: "Review before write",
  inferred: "Proposed edge",
  inferredKey: "Inferred key",
  inferenceReason: "Reason",
  alternatives: "Relation key",
  writeScope: "Write:",
  writeFile: "File",
  writeChangedFiles: "Changed files",
  writeUnchangedFiles: "Unchanged files",
  writeBoundary: "Boundary",
  writeBoundaryValue: "source frontmatter only; target file remains unchanged",
  writeKey: "Key",
  writeMeaning: "Meaning",
  writeMutation: "Mutation",
  writeFrontmatterPatch: "Frontmatter patch",
  mcpWriteArgs: "MCP args",
  mcpWritePolicy: "MCP write policy",
  mcpWritePolicyReady:
    "Direct MCP write payload is enabled only after read checks are clear.",
  mcpWritePolicyBlocked:
    "Direct MCP write payload stays disabled until read checks are reviewed.",
  graphEffect: "Graph effect",
  graphEdge: "Edge",
  graphRelation: "Relation label",
  graphSurfaces: "Surfaces",
  graphSurfacesValue: "topology, path, impact, MCP",
  graphAlternativeWarning: "Alternative selected.",
  postSaveGraphHandoff: "Post-save graph handoff",
  postSaveGraphHandoffBody:
    "Open the saved edge in topology before running the sync gate.",
  postSavePathHandoff: "Open topology path",
  postSaveSourceFocus: "Source focus",
  postSaveTargetFocus: "Target focus",
  saveChecklist: "Save decision checklist",
  saveChecklistSelectedKey: "Selected key matches intended meaning",
  saveChecklistPreflight: "Relation preflight result",
  saveChecklistTraversal: "Bounded traversal evidence",
  saveChecklistSyncGate: "Post-save sync gate",
  saveChecklistReady: "ready",
  saveChecklistReview: "review",
  saveChecklistBlocked: "blocked",
  saveChecklistSyncRequired: "required",
  preflight: "Preflight",
  preflightEvidence: "Evidence",
  preflightExact: "exact edge",
  preflightInverse: "inverse edge",
  preflightPath: "existing path",
  preflightClear: "clear",
  preflightPresent: "present",
  preflightActionSafe: "Preflight is clear. Save only after review.",
  preflightActionReview: "Preflight found existing graph context. Run read checks first.",
  preflightActionBlocked: "This exact relation already exists. No write needed.",
  traversalCheck: "Traversal completeness",
  traversalCheckBody: "Run bounded all_paths before treating this edge as complete graph evidence.",
  traversalContract: "Evidence contract",
  traversalContractBody: "Report all_paths completeness fields before write.",
  agentCheck: "Agent check:",
  postSaveCheck: "After save:",
  path: "Path:",
  copyCliPreflight: "Copy CLI preflight",
  copyCliPreflightCopied: "CLI preflight copied",
  copyCliPreflightFailed: "Copy failed",
  copyMcpPreflight: "Copy MCP preflight",
  copyMcpPreflightCopied: "MCP preflight copied",
  copyMcpPreflightFailed: "Copy failed",
  copyPostSaveSyncGate: "Copy sync gate",
  copyPostSaveSyncGateCopied: "Sync gate copied",
  copyPostSaveSyncGateFailed: "Copy failed",
  copyMcpWrite: "Copy MCP write",
  copyMcpWriteCopied: "MCP write copied",
  copyMcpWriteFailed: "Copy failed",
  cancel: "Cancel",
  confirm: "Save relation",
  copyPacket: "Copy packet",
  copyPacketCopied: "Packet copied",
  copyPacketFailed: "Copy failed",
  closeAriaLabel: "Close",
  decisionLabels: {
    safe_to_add: "Safe to add",
    skip_existing: "Already exists",
    review_inverse: "Review inverse",
    review_path: "Review path",
  },
  decisionHints: {
    safe_to_add: "No duplicate relation found.",
    skip_existing: "This exact relation already exists.",
    review_inverse: "A reverse relation already exists.",
    review_path: "An existing path already connects these nodes.",
  },
  relationKeyLabels,
  relationKeyHints,
};

const proposal = {
  sourceSlug: "capabilities/mcp-server",
  targetSlug: "elements/mcp-index",
  sourceKind: "capability",
  targetKind: "element",
  inferredKey: "elements" as const,
};
const safePreflight = {
  decision: "safe_to_add" as const,
  exactExists: false,
  inverseExists: false,
  pathExists: false,
  path: [],
};

const postSaveLabels = {
  title: "Relation saved",
  body: "Inspect the new edge before running the sync gate.",
  relationLabel: "edge",
  openPath: "Open topology path",
  sourceFocus: "Source focus",
  targetFocus: "Target focus",
  copySyncGate: "Copy sync gate",
  copySyncGateCopied: "Sync gate copied",
  copySyncGateFailed: "Copy failed",
  closeAriaLabel: "Dismiss saved relation handoff",
};

describe("RelationWriteConfirm", () => {
  beforeEach(() => {
    copyTextMock.mockReset();
  });

  it("shows the exact frontmatter write preview", () => {
    render(
      <RelationWriteConfirm
        proposal={proposal}
        selectedKey="elements"
        preflight={safePreflight}
        labels={labels}
        onSelectKey={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        "capabilities/mcp-server.elements += elements/mcp-index",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Frontmatter patch")).toBeInTheDocument();
    expect(screen.getByText(/elements:\s+- elements\/mcp-index/)).toBeInTheDocument();
    expect(screen.getByTestId("builder-relation-write-confirm")).toBeInTheDocument();
    expect(screen.getByTestId("builder-relation-write-confirm")).toHaveAttribute(
      "aria-modal",
      "true",
    );
    expect(screen.getByTestId("builder-relation-write-actions")).toHaveClass(
      "sticky",
    );
    expect(screen.getByText("Inferred key")).toBeInTheDocument();
    expect(screen.getByText("Reason")).toBeInTheDocument();
    expect(
      screen.getByText(
        "capability -> element maps to elements because capabilities use concrete elements.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("capabilities/mcp-server.md")).toHaveLength(2);
    expect(screen.getByText("elements/mcp-index.md")).toBeInTheDocument();
    expect(screen.getByText("Changed files")).toBeInTheDocument();
    expect(screen.getByText("Unchanged files")).toBeInTheDocument();
    expect(screen.getByText("Boundary")).toBeInTheDocument();
    expect(
      screen.getByText("source frontmatter only; target file remains unchanged"),
    ).toBeInTheDocument();
    expect(screen.getByText("MCP args")).toBeInTheDocument();
    expect(
      screen.getByText(
        '{"from":"capabilities/mcp-server","to":"elements/mcp-index","type":"elements"}',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("MCP write policy")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Direct MCP write payload is enabled only after read checks are clear.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("uses element")).toHaveLength(2);
    expect(
      screen.getByText(
        "capabilities/mcp-server --elements--> elements/mcp-index",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Relation label")).toBeInTheDocument();
    expect(screen.getAllByText("elements").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("topology, path, impact, MCP")).toBeInTheDocument();
    expect(screen.getByText("Post-save graph handoff")).toBeInTheDocument();
    expect(
      screen.getByText("Open the saved edge in topology before running the sync gate."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open topology path" })).toHaveAttribute(
      "href",
      expect.stringContaining(
        "/topology/?mode=path&pathFrom=capabilities%2Fmcp-server&pathTo=elements%2Fmcp-index",
      ),
    );
    expect(screen.getByRole("link", { name: "Source focus" })).toHaveAttribute(
      "href",
      expect.stringContaining(
        "/topology/?mode=focus&p=capabilities%2Fmcp-server",
      ),
    );
    expect(screen.getByRole("link", { name: "Target focus" })).toHaveAttribute(
      "href",
      expect.stringContaining("/topology/?mode=focus&p=elements%2Fmcp-index"),
    );
    expect(screen.getByText("Save decision checklist")).toBeInTheDocument();
    expect(
      screen.getByText("Selected key matches intended meaning"),
    ).toBeInTheDocument();
    expect(screen.getByText("Relation preflight result")).toBeInTheDocument();
    expect(screen.getByText("Bounded traversal evidence")).toBeInTheDocument();
    expect(screen.getByText("Post-save sync gate")).toBeInTheDocument();
    expect(screen.getAllByText("ready").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("required")).toBeInTheDocument();
    expect(screen.getByText("Agent check:")).toBeInTheDocument();
    expect(
      screen.getByText(
        "oh-my-ontology relation-check capabilities/mcp-server elements/mcp-index elements [vault]",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("After save:")).toBeInTheDocument();
    expect(
      screen.getByText("oh-my-ontology health [vault]"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("oh-my-ontology cycles [vault] --max-hops 8"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("oh-my-ontology growth [vault] --limit 20"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("oh-my-ontology maintenance [vault] --limit 20"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("oh-my-ontology validate [vault]"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy CLI preflight" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy MCP preflight" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy sync gate" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy MCP write" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Evidence")).toBeInTheDocument();
    expect(screen.getByText("exact edge")).toBeInTheDocument();
    expect(screen.getByText("inverse edge")).toBeInTheDocument();
    expect(screen.getByText("existing path")).toBeInTheDocument();
    expect(screen.getAllByText("clear")).toHaveLength(3);
    expect(screen.getByTestId("builder-relation-preflight-action")).toHaveTextContent(
      "Preflight is clear. Save only after review.",
    );
    expect(screen.getByText("Traversal completeness")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Run bounded all_paths before treating this edge as complete graph evidence.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Evidence contract")).toBeInTheDocument();
    expect(
      screen.getByText("Report all_paths completeness fields before write."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "oh-my-ontology all-paths capabilities/mcp-server elements/mcp-index [vault] --plan --max-hops 5 --limit 10 --search-budget 1000",
      ),
    ).toBeInTheDocument();
  });

  it("lets the user pick an alternative relation key before saving", () => {
    const onSelectKey = vi.fn();
    const onConfirm = vi.fn();
    render(
      <RelationWriteConfirm
        proposal={proposal}
        selectedKey="elements"
        preflight={safePreflight}
        labels={labels}
        onSelectKey={onSelectKey}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /dependencies/i }));
    fireEvent.click(screen.getByRole("button", { name: /save relation/i }));

    expect(onSelectKey).toHaveBeenCalledWith("dependencies");
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("copies a portable relation write packet for agent review", async () => {
    copyTextMock.mockResolvedValue(true);
    render(
      <RelationWriteConfirm
        proposal={proposal}
        selectedKey="elements"
        preflight={safePreflight}
        labels={labels}
        onSelectKey={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /copy packet/i }));

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining("# Relation write review"),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "- Source ontology URL: /ontology/?node=capabilities%2Fmcp-server",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "- Target builder URL: /ontology/edit/?node=elements%2Fmcp-index",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "- Post-save topology path: /topology/?mode=path&pathFrom=capabilities%2Fmcp-server&pathTo=elements%2Fmcp-index",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "- Source topology focus: /topology/?mode=focus&p=capabilities%2Fmcp-server",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "- Target topology focus: /topology/?mode=focus&p=elements%2Fmcp-index",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining("- Inferred key: elements"),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "- Inference reason: capability -> element maps to elements because capabilities use concrete elements.",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining("- Selected key: elements"),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "- Mutation: capabilities/mcp-server.elements += elements/mcp-index",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(["- Frontmatter patch:", "elements:", "  - elements/mcp-index"].join("\n")),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        '- MCP add_relation args: {"from":"capabilities/mcp-server","to":"elements/mcp-index","type":"elements"}',
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        '- MCP add_relation call: {"tool":"add_relation","arguments":{"from":"capabilities/mcp-server","to":"elements/mcp-index","type":"elements"}}',
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "- Write boundary: source frontmatter only; target file remains unchanged",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "- Graph effect: capabilities/mcp-server --elements--> elements/mcp-index",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining("- Preflight: safe_to_add"),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        [
          "- Save decision checklist:",
          "  - Selected key reviewed: ready",
          "  - Preflight result: ready",
          "  - Traversal evidence: review",
          "  - Post-save sync gate: required",
        ].join("\n"),
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "oh-my-ontology relation-check capabilities/mcp-server elements/mcp-index elements [vault]",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining("MCP preflight:"),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        'query_ontology({"operation":"relation_check","from":"capabilities/mcp-server","to":"elements/mcp-index","type":"elements"})',
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        'query_ontology({"operation":"path","from":"capabilities/mcp-server","to":"elements/mcp-index","maxHops":5})',
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining("Traversal completeness check:"),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "oh-my-ontology all-paths capabilities/mcp-server elements/mcp-index [vault] --plan --max-hops 5 --limit 10 --search-budget 1000",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        'query_ontology({"operation":"query_plan","targetOperation":"all_paths","from":"capabilities/mcp-server","to":"elements/mcp-index","maxHops":5,"limit":10,"searchBudget":1000})',
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        'query_ontology({"operation":"all_paths","from":"capabilities/mcp-server","to":"elements/mcp-index","maxHops":5,"limit":10,"searchBudget":1000})',
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "all_paths evidence contract: report limit, searchBudget, expandedStates, exhaustive, truncatedByBudget, totalPathsExact, evidence.status, evidence.reason, and evidence.pathsComplete before using paths as write evidence",
      ),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining("Post-save graph checks:"),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining("Post-save MCP/CLI sync gate:"),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining("# Post-change ontology sync gate"),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('"operation": "health"'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('"tool": "validate_vault"'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining("oh-my-ontology health [vault]"),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining("oh-my-ontology cycles [vault] --max-hops 8"),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining("oh-my-ontology growth [vault] --limit 20"),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining("oh-my-ontology maintenance [vault] --limit 20"),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining("oh-my-ontology validate [vault]"),
    );
    expect(
      await screen.findByRole("button", { name: /packet copied/i }),
    ).toBeInTheDocument();
  });

  it("copies only the CLI preflight commands before saving", async () => {
    copyTextMock.mockResolvedValue(true);
    render(
      <RelationWriteConfirm
        proposal={proposal}
        selectedKey="elements"
        preflight={safePreflight}
        labels={labels}
        onSelectKey={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy CLI preflight" }));

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock).toHaveBeenCalledWith(
      [
        "# Relation write CLI preflight",
        "",
        "- Run these before saving the builder edge when MCP is not connected.",
        "- oh-my-ontology relation-check capabilities/mcp-server elements/mcp-index elements [vault]",
        "- Run bounded all_paths before treating a shortest path or existing path as complete evidence.",
        "- oh-my-ontology all-paths capabilities/mcp-server elements/mcp-index [vault] --plan --max-hops 5 --limit 10 --search-budget 1000",
        "- all_paths evidence contract: report limit, searchBudget, expandedStates, exhaustive, truncatedByBudget, totalPathsExact, evidence.status, evidence.reason, and evidence.pathsComplete before using paths as write evidence",
      ].join("\n"),
    );
    expect(
      await screen.findByRole("button", { name: "CLI preflight copied" }),
    ).toBeInTheDocument();
  });

  it("copies only the MCP preflight payloads before saving", async () => {
    copyTextMock.mockResolvedValue(true);
    render(
      <RelationWriteConfirm
        proposal={proposal}
        selectedKey="elements"
        preflight={safePreflight}
        labels={labels}
        onSelectKey={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy MCP preflight" }));

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock).toHaveBeenCalledWith(
      [
        "# Relation write MCP preflight",
        "",
        "- Run these before saving the builder edge.",
        '- query_ontology({"operation":"relation_check","from":"capabilities/mcp-server","to":"elements/mcp-index","type":"elements"})',
        '- query_ontology({"operation":"path","from":"capabilities/mcp-server","to":"elements/mcp-index","maxHops":5})',
        "- Run bounded all_paths before treating a shortest path or existing path as complete evidence.",
        '- query_ontology({"operation":"query_plan","targetOperation":"all_paths","from":"capabilities/mcp-server","to":"elements/mcp-index","maxHops":5,"limit":10,"searchBudget":1000})',
        '- query_ontology({"operation":"all_paths","from":"capabilities/mcp-server","to":"elements/mcp-index","maxHops":5,"limit":10,"searchBudget":1000})',
        "- all_paths evidence contract: report limit, searchBudget, expandedStates, exhaustive, truncatedByBudget, totalPathsExact, evidence.status, evidence.reason, and evidence.pathsComplete before using paths as write evidence",
      ].join("\n"),
    );
    expect(
      await screen.findByRole("button", { name: "MCP preflight copied" }),
    ).toBeInTheDocument();
  });

  it("copies the shared post-save sync gate from the relation confirmation", async () => {
    copyTextMock.mockResolvedValue(true);
    render(
      <RelationWriteConfirm
        proposal={proposal}
        selectedKey="elements"
        preflight={safePreflight}
        labels={labels}
        onSelectKey={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy sync gate" }));

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining("# Post-change ontology sync gate"),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining("## MCP"),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining('"operation": "maintenance_plan"'),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining("## CLI fallback"),
    );
    expect(copyTextMock).toHaveBeenCalledWith(
      expect.stringContaining("oh-my-ontology validate [vault]"),
    );
    expect(
      await screen.findByRole("button", { name: "Sync gate copied" }),
    ).toBeInTheDocument();
  });

  it("copies only the MCP add_relation write payload", async () => {
    copyTextMock.mockResolvedValue(true);
    render(
      <RelationWriteConfirm
        proposal={proposal}
        selectedKey="elements"
        preflight={safePreflight}
        labels={labels}
        onSelectKey={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy MCP write" }));

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock).toHaveBeenCalledWith(
      [
        "# Relation write MCP payload",
        "",
        "- Run only after reviewing relation_check, path, and bounded all_paths evidence.",
        "- This writes frontmatter in the local vault.",
        '{"tool":"add_relation","arguments":{"from":"capabilities/mcp-server","to":"elements/mcp-index","type":"elements"}}',
      ].join("\n"),
    );
    expect(
      await screen.findByRole("button", { name: "MCP write copied" }),
    ).toBeInTheDocument();
  });

  it("warns when the user selects a relation key other than the inferred key", () => {
    render(
      <RelationWriteConfirm
        proposal={proposal}
        selectedKey="dependencies"
        preflight={safePreflight}
        labels={labels}
        onSelectKey={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("Alternative selected.")).toBeInTheDocument();
    expect(screen.getAllByText("review").length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText(
        "capabilities/mcp-server --dependencies--> elements/mcp-index",
      ),
    ).toBeInTheDocument();
  });

  it("shows direct existing path evidence when another key already links the pair", () => {
    render(
      <RelationWriteConfirm
        proposal={proposal}
        selectedKey="relates"
        preflight={{
          decision: "review_path",
          exactExists: false,
          inverseExists: false,
          pathExists: true,
          path: ["capabilities/mcp-server", "elements/mcp-index"],
        }}
        labels={labels}
        onSelectKey={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("Review path")).toBeInTheDocument();
    expect(screen.getByText("Relation preflight result")).toBeInTheDocument();
    expect(screen.getAllByText("review").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("button", { name: "Copy MCP write" })).toBeDisabled();
    expect(
      screen.getByText(
        "Direct MCP write payload stays disabled until read checks are reviewed.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save relation/i })).toBeEnabled();
    expect(screen.getByText("Path:")).toBeInTheDocument();
    expect(
      screen.getByText("capabilities/mcp-server → elements/mcp-index"),
    ).toBeInTheDocument();
    expect(screen.getByText("present")).toBeInTheDocument();
    expect(screen.getAllByText("clear")).toHaveLength(2);
    expect(screen.getByTestId("builder-relation-preflight-action")).toHaveTextContent(
      "Preflight found existing graph context. Run read checks first.",
    );
  });

  it("keeps review-path packets copyable without exporting a direct write call", async () => {
    copyTextMock.mockResolvedValue(true);
    render(
      <RelationWriteConfirm
        proposal={proposal}
        selectedKey="relates"
        preflight={{
          decision: "review_path",
          exactExists: false,
          inverseExists: false,
          pathExists: true,
          path: ["capabilities/mcp-server", "elements/mcp-index"],
        }}
        labels={labels}
        onSelectKey={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /copy packet/i }));

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    const copied = copyTextMock.mock.calls[0]?.[0] ?? "";
    expect(copied).toContain("- Preflight: review_path");
    expect(copied).toContain(
      "- MCP add_relation call: blocked by preflight (existing graph path needs meaning review)",
    );
    expect(copied).not.toContain('"tool":"add_relation"');
    expect(
      await screen.findByRole("button", { name: /packet copied/i }),
    ).toBeInTheDocument();
  });

  it("blocks direct MCP write copy when an inverse relation needs review", () => {
    render(
      <RelationWriteConfirm
        proposal={proposal}
        selectedKey="elements"
        preflight={{
          decision: "review_inverse",
          exactExists: false,
          inverseExists: true,
          pathExists: false,
          path: [],
        }}
        labels={labels}
        onSelectKey={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Copy MCP write" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /save relation/i })).toBeEnabled();
    expect(screen.getByTestId("builder-relation-preflight-action")).toHaveTextContent(
      "Preflight found existing graph context. Run read checks first.",
    );
  });

  it("blocks saving an exact duplicate relation", () => {
    const onConfirm = vi.fn();
    render(
      <RelationWriteConfirm
        proposal={proposal}
        selectedKey="elements"
        preflight={{
          decision: "skip_existing",
          exactExists: true,
          inverseExists: false,
          pathExists: false,
          path: ["capabilities/mcp-server", "elements/mcp-index"],
        }}
        labels={labels}
        onSelectKey={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    const save = screen.getByRole("button", { name: /save relation/i });
    const copyMcpWrite = screen.getByRole("button", { name: "Copy MCP write" });
    expect(save).toBeDisabled();
    expect(copyMcpWrite).toBeDisabled();
    expect(screen.getByText("present")).toBeInTheDocument();
    expect(screen.getByText("blocked")).toBeInTheDocument();
    expect(screen.getAllByText("clear")).toHaveLength(2);
    expect(screen.getByTestId("builder-relation-preflight-action")).toHaveTextContent(
      "This exact relation already exists. No write needed.",
    );
    fireEvent.click(save);
    fireEvent.click(copyMcpWrite);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(copyTextMock).not.toHaveBeenCalled();
  });

  it("keeps duplicate review packets copyable without exporting a write call", async () => {
    copyTextMock.mockResolvedValue(true);
    render(
      <RelationWriteConfirm
        proposal={proposal}
        selectedKey="elements"
        preflight={{
          decision: "skip_existing",
          exactExists: true,
          inverseExists: false,
          pathExists: false,
          path: ["capabilities/mcp-server", "elements/mcp-index"],
        }}
        labels={labels}
        onSelectKey={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /copy packet/i }));

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    const copied = copyTextMock.mock.calls[0]?.[0] ?? "";
    expect(copied).toContain("- Preflight: skip_existing");
    expect(copied).toContain(
      "- MCP add_relation call: blocked by preflight (exact relation already exists)",
    );
    expect(copied).not.toContain('"tool":"add_relation"');
    expect(
      await screen.findByRole("button", { name: /packet copied/i }),
    ).toBeInTheDocument();
  });
});

describe("RelationPostSaveHandoff", () => {
  beforeEach(() => {
    copyTextMock.mockReset();
  });

  it("keeps topology handoff actions visible after a relation save", () => {
    render(
      <RelationPostSaveHandoff
        relation={{ ...proposal, selectedKey: "elements" }}
        labels={postSaveLabels}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByTestId("builder-relation-post-save-handoff")).toBeInTheDocument();
    expect(screen.getByText("Relation saved")).toBeInTheDocument();
    expect(
      screen.getByText("capabilities/mcp-server.elements -> elements/mcp-index"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open topology path" })).toHaveAttribute(
      "href",
      "/topology/?mode=path&pathFrom=capabilities%2Fmcp-server&pathTo=elements%2Fmcp-index",
    );
    expect(screen.getByRole("link", { name: "Source focus" })).toHaveAttribute(
      "href",
      "/topology/?mode=focus&p=capabilities%2Fmcp-server",
    );
    expect(screen.getByRole("link", { name: "Target focus" })).toHaveAttribute(
      "href",
      "/topology/?mode=focus&p=elements%2Fmcp-index",
    );
  });

  it("copies the shared sync gate from the post-save handoff", async () => {
    copyTextMock.mockResolvedValue(true);

    render(
      <RelationPostSaveHandoff
        relation={{ ...proposal, selectedKey: "elements" }}
        labels={postSaveLabels}
        onDismiss={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy sync gate" }));

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock.mock.calls[0]?.[0]).toContain("# Post-change ontology sync gate");
    expect(screen.getByRole("button", { name: "Sync gate copied" })).toBeInTheDocument();
  });

  it("dismisses the saved relation handoff", () => {
    const onDismiss = vi.fn();

    render(
      <RelationPostSaveHandoff
        relation={{ ...proposal, selectedKey: "elements" }}
        labels={postSaveLabels}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Dismiss saved relation handoff" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
