import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { copyText } from "@/shared/lib/copy-text";
import { TopologyOntologyDrawer } from "./TopologyOntologyDrawer";

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
const stamp = new Date(0);

beforeEach(() => {
  copyTextMock.mockReset();
});

function node(id: string, kind = "capability"): KnowledgeGraphNode {
  return {
    id,
    title: id,
    kind,
    projectIds: [],
    evidenceIds: [id],
    lastApprovedAt: stamp,
    lastApprovedBy: "test",
  };
}

function edge(
  id: string,
  from: string,
  to: string,
  type = "contains",
): KnowledgeGraphEdge {
  return {
    id,
    from,
    to,
    type,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: stamp,
    lastApprovedBy: "test",
  };
}

const labels = {
  caption: "Ontology node",
  source: "Source document",
  noSource: "No source document",
  relations: "Direct relations",
  incoming: "Incoming",
  outgoing: "Outgoing",
  noRelations: "No relations",
  openOntology: "Open in ontology tree",
  openBuilder: "Focus in builder",
  openSource: "Open source document",
  collaboratorTitle: "Collaborator brief",
  collaboratorBody: "Use this as shared vocabulary.",
  collaboratorCopy: "Copy brief",
  collaboratorCopyVocabulary: "Copy vocabulary",
  collaboratorCopyMcpProfile: "Copy MCP profile",
  collaboratorCopyMcpImpact: "Copy MCP impact",
  collaboratorCopySyncGate: "Copy sync gate",
  collaboratorCopySuccess: "Collaborator brief copied.",
  collaboratorCopyError: "Could not copy collaborator brief.",
  collaboratorBriefRelationTypes: "Relation types",
  collaboratorVocabularyTitle: "Review vocabulary",
  collaboratorVocabularyMeaning: "Meaning to keep",
  collaboratorVocabularyReuse: "Reuse context",
  collaboratorVocabularyAnchors: "Relation anchors",
  collaboratorBriefPreviewRelations: "Preview relations",
  collaboratorBriefNoPreviewRelations: "No direct relation evidence",
  collaboratorBriefImpactSummary: "Change impact",
  collaboratorBriefFirstIncoming: "First incoming",
  collaboratorBriefFirstOutgoing: "First outgoing",
  collaboratorBriefNoImpactRelation: "none yet",
  collaboratorBriefHandoff: "Handoff",
  collaboratorBriefTopology: "Topology",
  collaboratorBriefOntology: "Ontology",
  collaboratorBriefBuilder: "Builder",
  collaboratorBriefAgentCheck: "Agent check",
  collaboratorBriefMcpCheck: "MCP check",
  collaboratorBriefImpactCheck: "Impact check",
  collaboratorBriefMcpImpactCheck: "MCP impact check",
  collaboratorBriefSyncGate: "Post-change sync gate",
  collaboratorHandoffOrderTitle: "Graph handoff order",
  collaboratorHandoffProfileStep: "Inspect profile first.",
  collaboratorHandoffImpactStep: "Trace incoming impact.",
  collaboratorHandoffSyncStep: "Run sync gate after changes.",
  collaboratorBriefReviewQuestions: "Review questions",
  collaboratorLensLabels: {
    project: "Product or initiative scope",
    domain: "Shared domain vocabulary",
    capability: "User-visible capability or behavior",
    element: "Implementation detail behind the capability",
    node: "Ontology concept",
  },
  collaboratorReviewLabels: {
    define_owner: "Define the owner.",
    explain_usage: "Explain usage.",
    confirm_dependents: "Confirm dependents.",
    trace_impact: "Trace impact.",
  },
  collaboratorImpactLabels: {
    needs_owner: "Define ownership first.",
    usage_only: "Check outgoing dependencies first.",
    dependent_only: "Check incoming dependents first.",
    bidirectional: "Trace both directions first.",
  },
  collaboratorReviewQuestionLabels: {
    define_owner: [
      "Who owns this concept?",
      "Which container owns it?",
      "What meaning must be true?",
    ],
    explain_usage: [
      "What does this depend on?",
      "Why does it matter?",
      "Who needs the explanation?",
    ],
    confirm_dependents: [
      "Who relies on this concept?",
      "What breaks if it changes?",
      "Who should confirm the change?",
    ],
    trace_impact: [
      "Which incoming references matter?",
      "Which outgoing dependencies explain it?",
      "Which boundary should not move?",
    ],
  },
  collaboratorChipLabels: {
    source: "source-backed",
    impact: "impact trace",
    vocabulary: "review vocabulary",
  },
};

describe("TopologyOntologyDrawer", () => {
  it("copies the collaborator brief from the topology drawer", async () => {
    copyTextMock.mockResolvedValue(true);
    const selected = node("capabilities/topology-ontology-inspection");
    const domain = node("domains/views", "domain");

    render(
      <TopologyOntologyDrawer
        node={selected}
        nodes={[selected, domain]}
        edges={[edge("domain->cap", domain.id, selected.id)]}
        onClose={vi.fn()}
        closeLabel="Close"
        labels={labels}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy brief" }));

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    const copied = copyTextMock.mock.calls[0]?.[0];
    expect(copied).toContain("# capabilities/topology-ontology-inspection");
    expect(copied).toContain("- Review prompt: Confirm dependents.");
    expect(copied).toContain(
      "- Ontology: /ontology/?node=capabilities%2Ftopology-ontology-inspection",
    );
    expect(copied).toContain(
      '- MCP check: query_ontology({"operation":"node_profile","slug":"capabilities/topology-ontology-inspection","depth":2,"limit":12})',
    );
    expect(copied).toContain("- Post-change sync gate:");
    expect(copied).toContain("  # Post-change ontology sync gate");
    expect(copied).toContain('"operation": "health"');
    expect(copied).toContain('"operation": "maintenance_plan"');
    expect(copied).toContain(
      "oh-my-ontology validate [vault]",
    );
  });

  it("shows collaborator review questions in the visible drawer", () => {
    const selected = node("capabilities/topology-ontology-inspection");
    const domain = node("domains/views", "domain");

    render(
      <TopologyOntologyDrawer
        node={selected}
        nodes={[selected, domain]}
        edges={[edge("domain->cap", domain.id, selected.id)]}
        onClose={vi.fn()}
        closeLabel="Close"
        labels={labels}
      />,
    );

    expect(screen.getByText("Review questions")).toBeInTheDocument();
    expect(screen.getByText("Change impact")).toBeInTheDocument();
    expect(screen.getByText("Check incoming dependents first.")).toBeInTheDocument();
    expect(screen.getByText("First incoming")).toBeInTheDocument();
    expect(screen.getByText("Graph handoff order")).toBeInTheDocument();
    expect(screen.getByText("Inspect profile first.")).toBeInTheDocument();
    expect(screen.getByText("Trace incoming impact.")).toBeInTheDocument();
    expect(screen.getByText("Run sync gate after changes.")).toBeInTheDocument();
    expect(
      screen.getByText("node_profile · capabilities/topology-ontology-inspection"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("blast_radius · incoming · depth 2"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("health · cycles · growth_plan · maintenance_plan · validate"),
    ).toBeInTheDocument();
    expect(screen.getByText("Who relies on this concept?")).toBeInTheDocument();
    expect(screen.getByText("What breaks if it changes?")).toBeInTheDocument();
    expect(screen.getByText("Who should confirm the change?")).toBeInTheDocument();
  });

  it("copies focused MCP profile, impact, and sync-gate payloads from the topology drawer", async () => {
    copyTextMock.mockResolvedValue(true);
    const selected = node("capabilities/topology-ontology-inspection");
    const domain = node("domains/views", "domain");

    render(
      <TopologyOntologyDrawer
        node={selected}
        nodes={[selected, domain]}
        edges={[edge("domain->cap", domain.id, selected.id)]}
        onClose={vi.fn()}
        closeLabel="Close"
        labels={labels}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy MCP profile" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy MCP impact" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy sync gate" }));

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(3));
    expect(copyTextMock).toHaveBeenNthCalledWith(
      1,
      'query_ontology({"operation":"node_profile","slug":"capabilities/topology-ontology-inspection","depth":2,"limit":12})',
    );
    expect(copyTextMock).toHaveBeenNthCalledWith(
      2,
      'query_ontology({"operation":"blast_radius","slug":"capabilities/topology-ontology-inspection","depth":2,"direction":"incoming"})',
    );
    expect(copyTextMock.mock.calls[2]?.[0]).toContain(
      "# Post-change ontology sync gate",
    );
    expect(copyTextMock.mock.calls[2]?.[0]).toContain('"operation": "health"');
    expect(copyTextMock.mock.calls[2]?.[0]).toContain(
      '"operation": "maintenance_plan"',
    );
    expect(copyTextMock.mock.calls[2]?.[0]).toContain(
      "oh-my-ontology validate [vault]",
    );
  });

  it("copies a focused vocabulary review packet for secondary collaborators", async () => {
    copyTextMock.mockResolvedValue(true);
    const selected = {
      ...node("capabilities/topology-ontology-inspection"),
      title: "Topology Ontology Inspection",
      summary: "Inspect selected topology concepts with relation evidence.",
    };
    const domain = node("domains/views", "domain");

    render(
      <TopologyOntologyDrawer
        node={selected}
        nodes={[selected, domain]}
        edges={[edge("domain->cap", domain.id, selected.id)]}
        onClose={vi.fn()}
        closeLabel="Close"
        labels={labels}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy vocabulary" }));

    await waitFor(() => expect(copyTextMock).toHaveBeenCalledTimes(1));
    expect(copyTextMock.mock.calls[0]?.[0]).toContain(
      "# Review vocabulary: Topology Ontology Inspection",
    );
    expect(copyTextMock.mock.calls[0]?.[0]).toContain("## Meaning to keep");
    expect(copyTextMock.mock.calls[0]?.[0]).toContain("## Reuse context");
    expect(copyTextMock.mock.calls[0]?.[0]).toContain("## Relation anchors");
    expect(copyTextMock.mock.calls[0]?.[0]).toContain(
      "- Incoming contains: domains/views (domains/views)",
    );
  });
});
