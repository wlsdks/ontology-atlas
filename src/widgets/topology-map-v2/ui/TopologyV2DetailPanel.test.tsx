import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectSourceView } from "@/shared/lib/project-source-receipt";
import { TopologyV2DetailPanel, type TopologyV2DetailPanelProps } from "./TopologyV2DetailPanel";

// `@/i18n/navigation`'s Link wraps next-intl's `createNavigation`, which
// pulls in `next/navigation` — unresolvable under vitest's module graph in
// this repo (established pattern, see `DocsVaultViewer.test.tsx`). Mocked to
// a plain anchor so href/click assertions still work.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: true,
    media: "(max-width: 1512.98px)",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
});

afterEach(() => vi.unstubAllGlobals());

const labels = {
  kindLabel: "Domain",
  domainLabel: "domain",
  poweredOn: "fresh",
  poweredOff: "idle",
  metricContains: "contains",
  containsShowAll: "view all",
  containsShowSummary: "summary",
  containsOtherGroup: "other",
  groupShowMore: "more",
  groupShowFewer: "fewer",
  metricUsedBy: "used by",
  metricDependsOn: "leans on",
  metricBelongsTo: "belongs to",
  metricEvidence: "evidence",
  statsConnected: "Connected",
  statsEvidenceDocs: "Source docs",
  codeLocationsLabel: "code location",
  codeLocationsCopyLabel: "copy",
  codeLocationsCopiedLabel: "copied",
  editSubjectPrefix: "Last edited",
  editSubjectAgent: "AI agent",
  editSubjectHuman: "me",
  editConflictMessage: "This document changed elsewhere — check before you overwrite",
  noConnections: "no relations recorded yet · relations are declared in frontmatter",
  handoff: "Copy next action",
  close: "Close",
  openFullDetail: "Full detail →",
  actionsGroupLabel: "Node actions",
  actionDocument: "Document",
  actionEditRelations: "Edit relations",
  actionCopyHandoff: "Copy handoff",
  actionAskAgent: "Ask agent",
  actionPath: "Path",
  actionRealm: "Expand realm",
  sourceHeading: "Code evidence",
  sourceKind: "Source · Git repository",
  sourceStatus: "Source verified",
  sourceMeasuredAt: "Measured today",
  sourceCurrentness: "Current source",
  sourceGap: "Connect a code folder",
  sourceGapLabel: "Next check",
  sourceAction: "Use current evidence",
  sourceWhy: "Connecting a code folder shows where each concept lives.",
  sourceRelationsShow: "Show project relations",
  sourceRelationsHide: "Hide project relations",
  sourceOntologyDocument: "Concept document",
  sourceBusy: "Measuring code evidence",
};

function renderPanel(
  onOpenFullDetail?: () => void,
  evidence: { rows: { id: string; title: string; path: string | null }[]; total: number } = {
    rows: [],
    total: 0,
  },
  overrides: {
    documentHref?: string | null;
    onCopyHandoff?: () => void;
    onSetPathSource?: () => void;
    domain?: { id: string; title: string } | null;
    onSelectConnection?: (id: string) => void;
    onHoverConnection?: (id: string | null) => void;
    onHoverEvidence?: (slug: string | null) => void;
    sourceTitle?: string | null;
    showHandoff?: boolean;
    showSourcePath?: boolean;
    codeLocations?: readonly string[];
    lastEditSubject?: { kind: "agent" | "human"; ageLabel: string } | null;
    mtimeConflict?: boolean;
    kind?: string;
    projectSource?: ProjectSourceView | null;
    onProjectSourceAction?: () => void | Promise<void>;
    onAskAgent?: () => void;
    onEditRelations?: () => void;
    onEnterRealm?: () => void;
    projectSourceBusy?: boolean;
    projectSourceError?: string | null;
    projectSourceDegraded?: TopologyV2DetailPanelProps["projectSourceDegraded"];
    projectSourceProposal?: TopologyV2DetailPanelProps["projectSourceProposal"];
    onProjectSourceConfirmProposal?: () => void | Promise<void>;
    updatedAtLabel?: string | null;
    groups?: TopologyV2DetailPanelProps["groups"];
  } = {},
) {
  return render(
    <TopologyV2DetailPanel
      open
      nodeId="domain:views"
      slug="domains/views"
      title="Views"
      sourceTitle={overrides.sourceTitle ?? null}
      kind={overrides.kind ?? "domain"}
      domain={overrides.domain !== undefined ? overrides.domain : null}
      powered={false}
      groups={overrides.groups ?? {
        contains: { rows: [], total: 0 },
        usedBy: { rows: [], total: 1 },
        dependsOn: { rows: [], total: 2 },
        belongsTo: { rows: [], total: 0 },
      }}
      evidence={evidence}
      codeLocations={overrides.codeLocations ?? []}
      updatedAtLabel={overrides.updatedAtLabel}
      handoffText="node: domains/views"
      documentHref={
        overrides.documentHref !== undefined
          ? overrides.documentHref
          : "/docs/domains/views"
      }
      meaningEditHref="/ontology/studio/?node=domains%2Fviews"
      labels={labels}
      lastEditSubject={overrides.lastEditSubject ?? null}
      mtimeConflict={overrides.mtimeConflict ?? false}
      onSelectConnection={overrides.onSelectConnection ?? (() => {})}
      onHoverConnection={overrides.onHoverConnection}
      onHoverEvidence={overrides.onHoverEvidence}
      onCopyHandoff={overrides.onCopyHandoff ?? (() => {})}
      onAskAgent={overrides.onAskAgent}
      onEditRelations={overrides.onEditRelations}
      onClose={() => {}}
      onSetPathSource={overrides.onSetPathSource ?? (() => {})}
      onEnterRealm={overrides.onEnterRealm}
      onOpenFullDetail={onOpenFullDetail}
      projectSource={overrides.projectSource}
      onProjectSourceAction={overrides.onProjectSourceAction}
      projectSourceBusy={overrides.projectSourceBusy}
      projectSourceError={overrides.projectSourceError}
      projectSourceDegraded={overrides.projectSourceDegraded}
      projectSourceProposal={overrides.projectSourceProposal}
      onProjectSourceConfirmProposal={overrides.onProjectSourceConfirmProposal}
      showHandoff={overrides.showHandoff}
      showSourcePath={overrides.showSourcePath}
    />,
  );
}

describe("TopologyV2DetailPanel — project source receipt", () => {
  it("renders one flat, versioned receipt rail for a selected project", () => {
    const projectSource: ProjectSourceView = {
      contractVersion: 1,
      projectSlug: "views",
      status: "verified_current",
      currentness: "current",
      measuredAt: "2026-08-02T10:00:00.000Z",
      topGap: null,
      nextAction: { id: "use_current_evidence" },
      bindingCardinality: 1,
      receipt: null,
    };

    renderPanel(vi.fn(), undefined, { kind: "project", projectSource });

    const rail = screen.getByTestId("topology-v2-project-source-receipt");
    expect(rail).toHaveAttribute("data-source-status", "verified_current");
    expect(rail).toHaveAttribute("data-source-version", "1");
    expect(rail).toHaveAttribute("data-source-measured-at", "2026-08-02T10:00:00.000Z");
    expect(rail).toHaveAttribute("data-source-top-gap", "none");
    expect(rail).toHaveAttribute("data-source-action", "use_current_evidence");
    expect(rail).toHaveAttribute("data-source-currentness", "current");
    expect(rail).toHaveAttribute("data-source-cardinality", "1");
    expect(rail).toHaveAttribute("data-source-layout", "status-action-separated");
    expect(rail).toHaveAttribute("data-source-gap-visible", "false");
    expect(rail).toHaveAttribute("aria-live", "polite");
    expect(screen.getByTestId("topology-v2-project-source-heading")).toHaveTextContent(
      "Code evidence",
    );
    expect(rail).toHaveTextContent("Source verified");
    expect(rail).toHaveTextContent("Source · Git repository");
    expect(rail).toHaveTextContent("Measured today");
    expect(rail).toHaveTextContent("Current source");
    expect(rail).not.toHaveTextContent("Connect a code folder");
    expect(screen.queryByTestId("topology-v2-project-source-gap")).not.toBeInTheDocument();
  });

  it("shows only a real top gap as the next check", () => {
    const projectSource: ProjectSourceView = {
      contractVersion: 1,
      projectSlug: "views",
      status: "not_measured",
      currentness: "unavailable",
      measuredAt: null,
      topGap: { id: "source_unbound" },
      nextAction: { id: "connect_source" },
      bindingCardinality: 0,
      receipt: null,
    };

    renderPanel(undefined, undefined, {
      kind: "project",
      projectSource,
      projectSourceError: null,
    });

    const rail = screen.getByTestId("topology-v2-project-source-receipt");
    expect(rail).toHaveAttribute("data-source-gap-visible", "true");
    expect(screen.getByTestId("topology-v2-project-source-gap")).toHaveTextContent(
      "Next check: Connect a code folder",
    );
  });

  it("keeps four inline ontology actions for a current project and one footer handoff", () => {
    const projectSource: ProjectSourceView = {
      contractVersion: 1,
      projectSlug: "views",
      status: "verified_current",
      currentness: "current",
      measuredAt: "2026-08-02T10:00:00.000Z",
      topGap: null,
      nextAction: { id: "use_current_evidence" },
      bindingCardinality: 1,
      receipt: null,
    };

    renderPanel(vi.fn(), undefined, {
      kind: "project",
      projectSource,
      onProjectSourceAction: vi.fn(),
      onAskAgent: vi.fn(),
      onEnterRealm: vi.fn(),
    });

    const actions = screen.getByTestId("topology-v2-detail-panel-actions");
    expect(actions).toHaveAttribute("data-inline-action-count", "4");
    /*
     * 2026-08-03 — this used to count `actions.children`, back when the tiles were
     * the group's **direct children**. With the action strip now three rows
     * (verdict ④) the direct children are **the rows**. This assertion's intent was
     * "four tiles are drawn", so it skips the rows and counts the tiles — surviving
     * a change in row count while still turning red if a tile disappears.
     */
    expect(
      actions.querySelectorAll('[data-testid^="topology-v2-detail-panel-action-"]'),
    ).toHaveLength(4);
    expect(screen.queryByTestId("topology-v2-detail-panel-action-handoff")).not.toBeInTheDocument();
    expect(screen.queryByTestId("topology-v2-detail-panel-action-path")).not.toBeInTheDocument();
    expect(screen.getByTestId("topology-v2-project-source-action")).toBeInTheDocument();
  });

  it("keeps project relation counts visible while individual rows start collapsed", () => {
    const projectSource: ProjectSourceView = {
      contractVersion: 1,
      projectSlug: "views",
      status: "not_measured",
      currentness: "unavailable",
      measuredAt: null,
      topGap: { id: "source_unbound" },
      nextAction: { id: "connect_source" },
      bindingCardinality: 0,
      receipt: null,
    };
    const groups: TopologyV2DetailPanelProps["groups"] = {
      contains: {
        rows: [
          {
            id: "domain:catalog",
            title: "Catalog",
            kind: "domain",
            relationType: "contains",
            direction: "outgoing",
          },
        ],
        total: 1,
      },
      usedBy: { rows: [], total: 0 },
      dependsOn: {
        rows: [
          {
            id: "project:billing",
            title: "Billing",
            kind: "project",
            relationType: "depends_on",
            direction: "outgoing",
          },
        ],
        total: 1,
      },
      belongsTo: { rows: [], total: 0 },
    };

    renderPanel(undefined, undefined, { kind: "project", projectSource, groups });

    const summary = screen.getByTestId("topology-v2-project-relations-summary");
    expect(summary).toHaveTextContent("contains1");
    expect(summary).toHaveTextContent("leans on1");
    expect(screen.queryByText("Catalog")).not.toBeInTheDocument();
    expect(screen.queryByText("Billing")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show project relations" }));
    expect(screen.getByText("Catalog")).toBeInTheDocument();
    expect(screen.getByText("Billing")).toBeInTheDocument();
  });

  it("keeps project relation rows expanded on a wider workbench", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: false,
      media: "(max-width: 1512.98px)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    const projectSource: ProjectSourceView = {
      contractVersion: 1,
      projectSlug: "views",
      status: "not_measured",
      currentness: "unavailable",
      measuredAt: null,
      topGap: { id: "source_unbound" },
      nextAction: { id: "connect_source" },
      bindingCardinality: 0,
      receipt: null,
    };
    const groups: TopologyV2DetailPanelProps["groups"] = {
      contains: {
        rows: [{ id: "domain:catalog", title: "Catalog", kind: "domain", relationType: "contains", direction: "outgoing" }],
        total: 1,
      },
      usedBy: { rows: [], total: 0 },
      dependsOn: { rows: [], total: 0 },
      belongsTo: { rows: [], total: 0 },
    };

    renderPanel(undefined, undefined, { kind: "project", projectSource, groups });

    expect(screen.queryByTestId("topology-v2-project-relations-summary")).not.toBeInTheDocument();
    expect(screen.getByText("Catalog")).toBeInTheDocument();
  });

  it("puts the next action inside the remedy block next to the gap, not in the footer", () => {
    const onProjectSourceAction = vi.fn();
    const projectSource: ProjectSourceView = {
      contractVersion: 1,
      projectSlug: "views",
      status: "not_measured",
      currentness: "unavailable",
      measuredAt: null,
      topGap: { id: "source_unbound" },
      nextAction: { id: "connect_source" },
      bindingCardinality: 0,
      receipt: null,
    };

    renderPanel(vi.fn(), undefined, {
      kind: "project",
      projectSource,
      onProjectSourceAction,
    });

    const action = screen.getByTestId("topology-v2-project-source-action");
    fireEvent.click(action);
    expect(onProjectSourceAction).toHaveBeenCalledTimes(1);
    expect(action.className).toContain("--topology-v2-panel-primary-surface");
    /*
     * **The prescription has to sit beside the diagnosis.** Measured 2026-08-04,
     * these two were 393px apart with four action tiles and the evidence list in
     * between. A unit test cannot measure pixel distance, so it pins **whether they
     * share an ancestor** — if someone drops it back into the footer, this assertion
     * breaks first.
     */
    const remedy = screen.getByTestId("topology-v2-project-source-remedy");
    expect(remedy).toContainElement(action);
    expect(screen.getByTestId("topology-v2-project-source-receipt")).toContainElement(remedy);
    // The same control is never drawn in two places.
    expect(screen.getAllByTestId("topology-v2-project-source-action")).toHaveLength(1);

    const fullDetail = screen.getByTestId("topology-v2-detail-panel-open-full-detail");
    expect(fullDetail.className).not.toContain("--topology-v2-panel-primary-surface");
    expect(fullDetail.className).toContain("--topology-v2-panel-text-tertiary");
  });

  it("explains why the action matters right where the gap is stated", () => {
    const projectSource: ProjectSourceView = {
      contractVersion: 1,
      projectSlug: "views",
      status: "not_measured",
      currentness: "unavailable",
      measuredAt: null,
      topGap: { id: "source_unbound" },
      nextAction: { id: "connect_source" },
      bindingCardinality: 0,
      receipt: null,
    };

    renderPanel(vi.fn(), undefined, {
      kind: "project",
      projectSource,
      onProjectSourceAction: vi.fn(),
    });

    // Diagnosis, explanation and prescription are one lump — missing any of the
    // three reverts to "a screen that diagnoses but cannot prescribe".
    expect(screen.getByTestId("topology-v2-project-source-gap")).toBeInTheDocument();
    expect(screen.getByTestId("topology-v2-project-source-why")).toHaveTextContent(
      "Connecting a code folder shows where each concept lives.",
    );
    expect(screen.getByTestId("topology-v2-project-source-remedy")).toHaveAttribute(
      "data-remedy-mode",
      "actionable",
    );
  });

  it("asks about the inferred folder so connecting is one click, with an escape next to it", () => {
    const onProjectSourceAction = vi.fn();
    const onProjectSourceConfirmProposal = vi.fn();
    const projectSource: ProjectSourceView = {
      contractVersion: 1,
      projectSlug: "views",
      status: "not_measured",
      currentness: "unavailable",
      measuredAt: null,
      topGap: { id: "source_unbound" },
      nextAction: { id: "connect_source" },
      bindingCardinality: 0,
      receipt: null,
    };

    renderPanel(vi.fn(), undefined, {
      kind: "project",
      projectSource,
      onProjectSourceAction,
      onProjectSourceConfirmProposal,
      projectSourceProposal: {
        question: "Is this the right folder?",
        rootPath: "/Users/stark/dev/oh-my-ontology",
        reason: "It is the git repository around this vault · 55 of 55 declared paths were found here",
        confirmLabel: "Connect this folder",
        pickOtherLabel: "Choose another folder",
        confidence: "high",
      },
    });

    const remedy = screen.getByTestId("topology-v2-project-source-remedy");
    expect(remedy).toHaveAttribute("data-remedy-mode", "proposed");

    // ① What it proposes — one path. ② Why it guessed that — one line.
    const proposal = screen.getByTestId("topology-v2-project-source-proposal");
    expect(proposal).toHaveAttribute("data-proposal-confidence", "high");
    expect(screen.getByTestId("topology-v2-project-source-proposal-path")).toHaveAttribute(
      "title",
      "/Users/stark/dev/oh-my-ontology",
    );
    expect(
      screen.getByTestId("topology-v2-project-source-proposal-reason"),
    ).toHaveTextContent("55 of 55 declared paths were found here");

    // ③ Confirm in one press — no folder picker in between.
    const confirm = screen.getByTestId("topology-v2-project-source-confirm");
    fireEvent.click(confirm);
    expect(onProjectSourceConfirmProposal).toHaveBeenCalledTimes(1);
    expect(onProjectSourceAction).not.toHaveBeenCalled();

    // ④ A guess can be wrong — the escape hatch is right beside it, and it is the previous picker.
    const pickOther = screen.getByTestId("topology-v2-project-source-action");
    expect(pickOther).toHaveTextContent("Choose another folder");
    fireEvent.click(pickOther);
    expect(onProjectSourceAction).toHaveBeenCalledTimes(1);

    // One indigo primary action per box — the escape hatch recedes into a quiet skin.
    expect(confirm.className).toContain("--topology-v2-panel-primary-surface");
    expect(pickOther.className).not.toContain("--topology-v2-panel-primary-surface");
  });

  it("falls back to the picker when nothing can be inferred — never a dead button", () => {
    const projectSource: ProjectSourceView = {
      contractVersion: 1,
      projectSlug: "views",
      status: "not_measured",
      currentness: "unavailable",
      measuredAt: null,
      topGap: { id: "source_unbound" },
      nextAction: { id: "connect_source" },
      bindingCardinality: 0,
      receipt: null,
    };

    renderPanel(vi.fn(), undefined, {
      kind: "project",
      projectSource,
      onProjectSourceAction: vi.fn(),
      projectSourceProposal: null,
    });

    expect(screen.getByTestId("topology-v2-project-source-remedy")).toHaveAttribute(
      "data-remedy-mode",
      "actionable",
    );
    expect(
      screen.queryByTestId("topology-v2-project-source-proposal"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("topology-v2-project-source-confirm"),
    ).not.toBeInTheDocument();
    const action = screen.getByTestId("topology-v2-project-source-action");
    expect(action).toHaveTextContent("Use current evidence");
    expect(action.className).toContain("--topology-v2-panel-primary-surface");
  });

  it("degrades honestly where the action cannot run: why, where, and what still works", () => {
    const projectSource: ProjectSourceView = {
      contractVersion: 1,
      projectSlug: "views",
      status: "not_measured",
      currentness: "unavailable",
      measuredAt: null,
      topGap: { id: "source_unbound" },
      nextAction: { id: "connect_source" },
      bindingCardinality: 0,
      receipt: null,
    };

    renderPanel(vi.fn(), undefined, {
      kind: "project",
      projectSource,
      // Web: there is no execute callback. This position used to end at one grey sentence.
      projectSourceDegraded: {
        why: "A browser cannot tell where the folder sits on your disk.",
        ctaLabel: "Get the macOS app",
        href: "/download/",
        stillWorks: "Reading the map still works here.",
      },
    });

    const remedy = screen.getByTestId("topology-v2-project-source-remedy");
    expect(remedy).toHaveAttribute("data-remedy-mode", "degraded");
    // What cannot be executed is not drawn as a button.
    expect(screen.queryByTestId("topology-v2-project-source-action")).not.toBeInTheDocument();
    // ① why ② where to — a destination that actually opens, not a sentence ③ what works here too.
    expect(screen.getByTestId("topology-v2-project-source-degraded-why")).toBeInTheDocument();
    expect(screen.getByTestId("topology-v2-project-source-degraded-cta")).toHaveAttribute(
      "href",
      expect.stringContaining("/download/") as unknown as string,
    );
    expect(
      screen.getByTestId("topology-v2-project-source-degraded-still-works"),
    ).toHaveTextContent("Reading the map still works here.");
  });

  it("keeps the remedy block out of a healthy receipt so the box always means work", () => {
    const projectSource: ProjectSourceView = {
      contractVersion: 1,
      projectSlug: "views",
      status: "verified_current",
      currentness: "current",
      measuredAt: "2026-08-02T10:00:00.000Z",
      topGap: null,
      nextAction: { id: "use_current_evidence" },
      bindingCardinality: 1,
      receipt: null,
    };

    renderPanel(vi.fn(), undefined, {
      kind: "project",
      projectSource,
      onProjectSourceAction: vi.fn(),
    });

    expect(screen.queryByTestId("topology-v2-project-source-remedy")).not.toBeInTheDocument();
    // The action does not disappear — only its position stays in the footer.
    expect(screen.getAllByTestId("topology-v2-project-source-action")).toHaveLength(1);
  });

  it("ignores a source receipt for non-project kinds and preserves the old panel contract", () => {
    const projectSource: ProjectSourceView = {
      contractVersion: 1,
      projectSlug: "views",
      status: "verified_current",
      currentness: "current",
      measuredAt: "2026-08-02T10:00:00.000Z",
      topGap: null,
      nextAction: { id: "use_current_evidence" },
      bindingCardinality: 1,
      receipt: null,
    };

    renderPanel(vi.fn(), undefined, { kind: "domain", projectSource });

    expect(screen.queryByTestId("topology-v2-project-source-receipt")).not.toBeInTheDocument();
    expect(screen.getByTestId("topology-v2-detail-panel-stats")).toBeInTheDocument();
    expect(screen.getByTestId("topology-v2-detail-panel-open-full-detail").className).toContain(
      "--topology-v2-panel-primary-surface",
    );
  });

  it("keeps a next action readable but non-interactive when no callback is available", () => {
    const projectSource: ProjectSourceView = {
      contractVersion: 1,
      projectSlug: "views",
      status: "verified_current",
      currentness: "unavailable",
      measuredAt: "2026-08-02T10:00:00.000Z",
      topGap: null,
      nextAction: { id: "use_current_evidence" },
      bindingCardinality: 1,
      receipt: null,
    };

    renderPanel(undefined, undefined, { kind: "project", projectSource });

    expect(screen.queryByTestId("topology-v2-project-source-action")).not.toBeInTheDocument();
    expect(screen.getByText("Use current evidence")).toBeInTheDocument();
  });

  it("keeps concept-document age distinct from source measurement time", () => {
    const projectSource: ProjectSourceView = {
      contractVersion: 1,
      projectSlug: "views",
      status: "verified_current",
      currentness: "current",
      measuredAt: "2026-08-02T10:00:00.000Z",
      topGap: null,
      nextAction: { id: "use_current_evidence" },
      bindingCardinality: 1,
      receipt: null,
    };

    renderPanel(undefined, undefined, {
      kind: "project",
      projectSource,
      updatedAtLabel: "changed 3d ago",
    });

    expect(screen.getByTestId("topology-v2-datasheet-updated-at")).toHaveTextContent(
      "Concept document · changed 3d ago",
    );
    expect(screen.getByTestId("topology-v2-project-source-receipt")).toHaveTextContent(
      "Measured today",
    );
  });

  it("keeps the previous receipt visible while busy and announces an actionable error", () => {
    const projectSource: ProjectSourceView = {
      contractVersion: 1,
      projectSlug: "views",
      status: "review_required",
      currentness: "stale",
      measuredAt: "2026-08-02T10:00:00.000Z",
      topGap: { id: "source_changed" },
      nextAction: { id: "remeasure_source" },
      bindingCardinality: 1,
      receipt: null,
    };

    renderPanel(undefined, undefined, {
      kind: "project",
      projectSource,
      onProjectSourceAction: vi.fn(),
      projectSourceBusy: true,
      projectSourceError: "Could not save the receipt. The previous binding is unchanged.",
    });

    expect(screen.getByTestId("topology-v2-project-source-receipt")).toHaveAttribute(
      "data-source-status",
      "review_required",
    );
    const action = screen.getByTestId("topology-v2-project-source-action");
    expect(action).toBeDisabled();
    expect(action).toHaveAttribute("aria-busy", "true");
    expect(action).toHaveTextContent("Measuring code evidence");
    expect(screen.getByTestId("topology-v2-project-source-error")).toHaveTextContent(
      "previous binding is unchanged",
    );
  });
});

describe("TopologyV2DetailPanel — installed-app evidence identity", () => {
  it("exposes the selected ontology handle and readable identity on the panel root", () => {
    renderPanel();
    const panel = screen.getByTestId("topology-v2-detail-panel");

    expect(panel).toHaveAttribute("data-selected-node-id", "domain:views");
    expect(panel).toHaveAttribute("data-selected-node-kind", "domain");
    expect(panel).toHaveAttribute("data-selected-node-title", "Views");
    expect(panel).toHaveAttribute("data-surface-role", "active-node-inspector");
    expect(panel).toHaveAttribute("data-attention-role", "supporting-detail");
  });
});

describe("TopologyV2DetailPanel — full-detail A1 opt-in link", () => {
  it("renders the '전체 상세 →' link when onOpenFullDetail is provided", () => {
    const onOpenFullDetail = vi.fn();
    renderPanel(onOpenFullDetail);
    fireEvent.click(screen.getByTestId("topology-v2-detail-panel-open-full-detail"));
    expect(onOpenFullDetail).toHaveBeenCalledTimes(1);
  });

  it("hides the link when onOpenFullDetail is omitted", () => {
    renderPanel(undefined);
    expect(
      screen.queryByTestId("topology-v2-detail-panel-open-full-detail"),
    ).not.toBeInTheDocument();
  });
});

// P3-③ (2026-07-21 retention round) — at 1440×900 a node with many connections
// overflowed the panel content past the viewport, pushing the 「전체 상세 →」
// (full detail) footer off screen (y=911) and out of reach. The panel must always
// scroll inside the viewport by itself — jsdom does no real layout, so the
// regression is caught by checking that the clamp contract (a token-based
// max-height plus internal overflow) is actually on the className.
describe("TopologyV2DetailPanel — viewport clamp (P3-③)", () => {
  it("+N 은 죽은 수가 아니다 — 누르면 그 자리에서 전부 펼쳐지고, 다시 누르면 접힌다", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      id: `capability:c${i}`,
      title: `Cap ${i}`,
      kind: "capability",
      relationType: "contains",
      direction: "outgoing" as const,
    }));
    const groups: TopologyV2DetailPanelProps["groups"] = {
      contains: { rows: many.slice(0, 6), allRows: many, total: 9 },
      usedBy: { rows: [], total: 0 },
      dependsOn: { rows: [], total: 0 },
      belongsTo: { rows: [], total: 0 },
    };
    renderPanel(undefined, undefined, { groups });

    expect(screen.getByText("Cap 0")).toBeInTheDocument();
    expect(screen.queryByText("Cap 8")).not.toBeInTheDocument();

    const more = screen.getByTestId("topology-v2-group-more-contains");
    expect(more).toHaveTextContent("+3");
    fireEvent.click(more);
    expect(screen.getByText("Cap 8")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("topology-v2-group-more-contains"));
    expect(screen.queryByText("Cap 8")).not.toBeInTheDocument();
  });

  it("always carries a viewport-bounded max-height and internal scroll so the footer link stays reachable", () => {
    renderPanel(vi.fn());
    const panel = screen.getByTestId("topology-v2-detail-panel");
    expect(panel.className).toContain("max-h-[var(--topology-v2-panel-max-height)]");
    expect(panel.className).toContain("overflow-y-auto");
    // The full-detail footer link is inside the same clamped/scrollable
    // root, not a sibling escaping the clamp.
    expect(panel).toContainElement(
      screen.getByTestId("topology-v2-detail-panel-open-full-detail"),
    );
  });
});

describe("TopologyV2DetailPanel — 근거(evidence) group promotion (RATIO-SYSTEM §4)", () => {
  it("renders an evidence group with its row's title when evidence rows exist", () => {
    renderPanel(undefined, {
      rows: [{ id: "capabilities/product-owner-operating-system", title: "product-owner-operating-system", path: "capabilities/" }],
      total: 1,
    });
    // After the ink split, the metric strip also has an "evidence" label span, so
    // getByText matches more than one — look it up by the group marker directly.
    const group = document.querySelector("[data-datasheet-group='evidence']");
    expect(group).not.toBeNull();
    expect(group!.textContent).toContain("evidence");
    expect(screen.getByText("product-owner-operating-system")).toBeInTheDocument();
  });

  // Toss C2 (2026-07-24) — the raw vault-path prefix (`row.path`) used to
  // render as an always-visible mono span next to the title, opaque to a
  // non-developer. It no longer renders in the visible DOM text; the row's
  // link carries the full `row.id` slug as a native `title=` hover instead
  // (information preserved, just no longer competing for first-read
  // attention with the plain 「근거」 label).
  it("folds the evidence row's path behind a hover title instead of always-visible text", () => {
    renderPanel(undefined, {
      rows: [{ id: "capabilities/product-owner-operating-system", title: "product-owner-operating-system", path: "capabilities/" }],
      total: 1,
    });
    expect(screen.queryByText("capabilities/")).not.toBeInTheDocument();
    const link = screen.getByText("product-owner-operating-system").closest("a");
    expect(link).toHaveAttribute("title", "capabilities/product-owner-operating-system");
  });

  it("does not render the evidence group when there are no evidence rows", () => {
    renderPanel(undefined, { rows: [], total: 0 });
    expect(document.querySelector("[data-datasheet-group='evidence']")).toBeNull();
  });

  it("renders each evidence row as a link to its vault document", () => {
    renderPanel(undefined, {
      rows: [{ id: "capabilities/product-owner-operating-system", title: "product-owner-operating-system", path: "capabilities/" }],
      total: 1,
    });
    const link = screen.getByText("product-owner-operating-system").closest("a");
    expect(link).not.toBeNull();
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("product-owner-operating-system"),
    );
  });
});

// Mockup redesign (2026-07-24) — the engraved per-type metric strip is replaced by
// a plain aggregate stats line ("Connected N · Source docs M"); the per-type
// counts now live once each in their own relation-group header count chips.
describe("TopologyV2DetailPanel — 근거 evidence count (numeric, in stats + group)", () => {
  it("shows the evidence total in the plain stats line (Source docs M)", () => {
    renderPanel(undefined, {
      rows: [{ id: "capabilities/mcp-server", title: "mcp-server", path: "capabilities/" }],
      total: 1,
    });
    const stats = screen.getByTestId("topology-v2-detail-panel-stats");
    expect(stats.textContent).toContain(labels.statsEvidenceDocs);
    expect(stats.textContent).toContain("1");
    // the old engraved metric strip is gone
    expect(
      screen.getByTestId("topology-v2-detail-panel").querySelector("[data-datasheet-metric='engraved']"),
    ).toBeNull();
  });

  it("shows the evidence count as a number in the group header total (matches the mockup)", () => {
    renderPanel(undefined, {
      rows: [{ id: "capabilities/mcp-server", title: "mcp-server", path: "capabilities/" }],
      total: 1,
    });
    const total = document.querySelector("[data-datasheet-group-total='evidence']");
    expect(total!.textContent).toBe("1");
  });
});

// R+ 「코드 위치」 (code location) — the REAL code evidence (raw file paths),
// distinct from the 「근거」 (evidence) group above, a source-doc slug reference.
describe("TopologyV2DetailPanel — 코드 위치 (code location) group", () => {
  it("renders a code-location row for each path when codeLocations is non-empty", () => {
    renderPanel(undefined, undefined, {
      codeLocations: ["mcp/src/index.js", "mcp/src/verify.mjs"],
    });
    const group = document.querySelector("[data-datasheet-group='code-locations']");
    expect(group).not.toBeNull();
    expect(screen.getByText("mcp/src/index.js")).toBeInTheDocument();
    expect(screen.getByText("mcp/src/verify.mjs")).toBeInTheDocument();
  });

  it("does not render the code-location group when there are no code paths", () => {
    renderPanel(undefined, undefined, { codeLocations: [] });
    expect(document.querySelector("[data-datasheet-group='code-locations']")).toBeNull();
  });

  it("renders a plain (non-link) row for a raw code path — distinguishable from the clickable evidence/connection rows", () => {
    renderPanel(undefined, undefined, { codeLocations: ["mcp/src/index.js"] });
    const row = screen.getByText("mcp/src/index.js").closest("li");
    expect(row).not.toBeNull();
    expect(row!.querySelector("a")).toBeNull();
  });

  it("copies the path when the row's copy button is clicked", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderPanel(undefined, undefined, { codeLocations: ["mcp/src/index.js"] });
    fireEvent.click(screen.getByTestId("topology-v2-detail-panel-code-location-copy"));
    expect(writeText).toHaveBeenCalledWith("mcp/src/index.js");
  });
});

// Toss C2 (2026-07-24) — the sticky footer used to show the FULL `slug`
// (`ontology/capabilities/mcp-server`) always visible, mono/quaternary but
// still raw and unreadable to a non-developer. It now shows only the last
// path segment and folds the full slug behind a native `title=` hover — the
// 「전체 상세 →」 link already owns navigating to the full record.
describe("TopologyV2DetailPanel — sticky 푸터 slug 평문화 (Toss C2)", () => {
  it("shows only the slug's last segment in visible text, with the full slug as a hover title", () => {
    render(
      <TopologyV2DetailPanel
        open
        nodeId="capability:mcp-server"
        slug="ontology/capabilities/mcp-server"
        title="MCP Server"
        kind="capability"
        domain={null}
        powered={false}
        groups={{
          contains: { rows: [], total: 0 },
          usedBy: { rows: [], total: 0 },
          dependsOn: { rows: [], total: 0 },
          belongsTo: { rows: [], total: 0 },
        }}
        evidence={{ rows: [], total: 0 }}
        codeLocations={[]}
        handoffText="node: ontology/capabilities/mcp-server"
        documentHref={null}
        meaningEditHref="/ontology/studio/?node=ontology%2Fcapabilities%2Fmcp-server"
        labels={labels}
        onSelectConnection={() => {}}
        onCopyHandoff={() => {}}
        onClose={() => {}}
        onSetPathSource={() => {}}
      />,
    );
    const slugEl = screen.getByTestId("topology-v2-detail-panel-slug");
    expect(slugEl).toHaveTextContent("mcp-server");
    expect(slugEl.textContent).not.toContain("ontology/capabilities");
    expect(slugEl).toHaveAttribute("title", "ontology/capabilities/mcp-server");
  });

  it("shows the slug as-is when it has no path segment to fold", () => {
    renderPanel();
    // fixture slug is "domains/views" — but a slug with no "/" should render
    // unchanged (nothing to fold).
    const slugEl = screen.getByTestId("topology-v2-detail-panel-slug");
    expect(slugEl).toHaveTextContent("views");
  });
});

// Slice B (humanising element labels) — when a title humanised for display is
// rendered, the original code path is preserved as a mono subline. The caller's
// contract is to pass sourceTitle only when display differs from the original, so
// the panel itself decides whether to render purely from sourceTitle's presence
// and whether it equals the title.
describe("TopologyV2DetailPanel — 원문 경로 서브라인 (슬라이스 B)", () => {
  it("sourceTitle 이 title 과 다르면 모노 서브라인으로 원문을 보존해 렌더한다", () => {
    renderPanel(undefined, undefined, { sourceTitle: "src/foo/bar-baz.ts" });
    const subline = screen.getByTestId("topology-v2-detail-panel-source-path");
    expect(subline).toHaveTextContent("src/foo/bar-baz.ts");
  });

  it("sourceTitle 이 없으면(null/undefined) 서브라인을 렌더하지 않는다", () => {
    renderPanel(undefined, undefined, {});
    expect(
      screen.queryByTestId("topology-v2-detail-panel-source-path"),
    ).not.toBeInTheDocument();
  });

  it("sourceTitle 이 title 과 같으면(중복) 서브라인을 렌더하지 않는다", () => {
    renderPanel(undefined, undefined, { sourceTitle: "Views" });
    expect(
      screen.queryByTestId("topology-v2-detail-panel-source-path"),
    ).not.toBeInTheDocument();
  });
});

// Slice C (the dev/non-dev mode toggle) — non-dev (plain) mode treats the
// handoff-copy action and the raw path subline as developer chrome and hides them.
// The default (omitted) is true for both, keeping the existing render (zero regression).
describe("TopologyV2DetailPanel — showHandoff / showSourcePath (슬라이스 C)", () => {
  it("showHandoff 생략 시 기본으로 인계 복사 타일을 렌더한다", () => {
    renderPanel();
    expect(screen.getByTestId("topology-v2-detail-panel-action-handoff")).toBeInTheDocument();
  });

  it("showHandoff=false 면 인계 복사 타일을 렌더하지 않는다", () => {
    renderPanel(undefined, undefined, { showHandoff: false });
    expect(
      screen.queryByTestId("topology-v2-detail-panel-action-handoff"),
    ).not.toBeInTheDocument();
  });

  it("showSourcePath 생략 시 기본으로 원문 경로 서브라인을 렌더한다 (sourceTitle 이 있을 때)", () => {
    renderPanel(undefined, undefined, { sourceTitle: "src/foo/bar-baz.ts" });
    expect(screen.getByTestId("topology-v2-detail-panel-source-path")).toBeInTheDocument();
  });

  it("showSourcePath=false 면 sourceTitle 이 있어도 원문 경로 서브라인을 렌더하지 않는다", () => {
    renderPanel(undefined, undefined, {
      sourceTitle: "src/foo/bar-baz.ts",
      showSourcePath: false,
    });
    expect(
      screen.queryByTestId("topology-v2-detail-panel-source-path"),
    ).not.toBeInTheDocument();
  });
});

describe("TopologyV2DetailPanel — M-2 typed containment split", () => {
  it("renders a 담는 것(contains) group with the parent's children (not folded into 기대는 곳)", () => {
    render(
      <TopologyV2DetailPanel
        open
        nodeId="domain:ai-agent-partner"
        slug="domains/ai-agent-partner"
        title="AI Agent Partner"
        kind="domain"
        domain={null}
        powered={false}
        groups={{
          contains: {
            rows: [
              { id: "capability:mcp-server", title: "MCP Server", kind: "capability", relationType: "contains", direction: "outgoing" },
              { id: "capability:agent-config", title: "Agent Config", kind: "capability", relationType: "contains", direction: "outgoing" },
            ],
            total: 2,
          },
          usedBy: {
            rows: [
              { id: "capability:x", title: "Consumer X", kind: "capability", relationType: "depends_on", direction: "incoming" },
            ],
            total: 1,
          },
          dependsOn: { rows: [], total: 0 },
          belongsTo: { rows: [], total: 0 },
        }}
        evidence={{ rows: [], total: 0 }}
        codeLocations={[]}
        handoffText="node: domains/ai-agent-partner"
        documentHref={null}
        meaningEditHref="/ontology/studio/?node=domains%2Fai-agent-partner"
        labels={labels}
        onSelectConnection={() => {}}
        onCopyHandoff={() => {}}
        onClose={() => {}}
        onSetPathSource={() => {}}
      />,
    );
    // the contains group exists and holds the contained capabilities
    const group = document.querySelector("[data-datasheet-group='contains']");
    expect(group).not.toBeNull();
    expect(screen.getByText("MCP Server")).toBeInTheDocument();
    expect(screen.getByText("Agent Config")).toBeInTheDocument();
    // the contains group header carries the typed label + its own count chip
    expect(group!.textContent).toContain("contains");
    expect(document.querySelector("[data-datasheet-group-total='contains']")!.textContent).toBe("2");
  });

  it("omits the 담는 것 group for a leaf node (contains 0)", () => {
    renderPanel();
    expect(document.querySelector("[data-datasheet-group='contains']")).toBeNull();
    expect(document.querySelector("[data-datasheet-group-total='contains']")).toBeNull();
  });
});

// Mockup redesign (2026-07-24) — a plain aggregate stats line: "Connected <N> ·
// Source docs <M>". N = the contains + usedBy + dependsOn totals; the per-type
// detail lives in each relation group's own indigo count chip.
describe("TopologyV2DetailPanel — plain stats line + group count chips", () => {
  it("renders the aggregate stats line with the connected total (usedBy 1 + dependsOn 2)", () => {
    renderPanel();
    const stats = screen.getByTestId("topology-v2-detail-panel-stats");
    expect(stats.textContent).toContain(labels.statsConnected);
    // contains 0 + usedBy 1 + dependsOn 2 = 3
    expect(stats.textContent).toContain("3");
  });

  it("gives each relation group header an indigo count chip (not the old metric ink)", () => {
    renderPanel();
    const total = document.querySelector("[data-datasheet-group-total='usedBy']");
    expect(total).not.toBeNull();
    expect(total!.className).toContain("--topology-v2-panel-count-text");
    expect(total!.textContent).toBe("1");
  });
});

// Scope correction (2026-07-26) — 「이어진 곳」 (connected) counts all four relation
// buckets, and every bucket it counts is drawn. Only 속한 곳 (incoming containment)
// used to be missing, so a node with only a parent (221 of the dogfood vault's 294
// = 75%) said 「이어진 곳 0」 — with a clickable domain chip right above it. This
// pins the screen against stating a verifiable falsehood.
describe("TopologyV2DetailPanel — 부모만 있는 노드의 이어진 곳", () => {
  const parentRow = {
    id: "capability:frontmatter-to-ontology",
    title: "Frontmatter → Ontology Stub",
    kind: "capability",
    relationType: "contains",
    direction: "incoming" as const,
  };

  function renderParentOnly(onSelectConnection: (id: string) => void = () => {}) {
    render(
      <TopologyV2DetailPanel
        open
        nodeId="element:src/entities/docs-vault/lib/derive-ontology-from-vault.ts"
        slug="src/entities/docs-vault/lib/derive-ontology-from-vault.ts"
        title="Derive Ontology From Vault"
        kind="element"
        domain={{ id: "domain:ontology-core", title: "온톨로지 코어" }}
        powered={false}
        groups={{
          contains: { rows: [], total: 0 },
          usedBy: { rows: [], total: 0 },
          dependsOn: { rows: [], total: 0 },
          belongsTo: { rows: [parentRow], total: 1 },
        }}
        evidence={{ rows: [], total: 0 }}
        codeLocations={[]}
        handoffText="node: src/entities/docs-vault/lib/derive-ontology-from-vault.ts"
        documentHref={null}
        meaningEditHref="/ontology/studio/?node=element%3Aderive-ontology-from-vault"
        labels={labels}
        onSelectConnection={onSelectConnection}
        onCopyHandoff={() => {}}
        onClose={() => {}}
        onSetPathSource={() => {}}
      />,
    );
  }

  it("counts the parent — a node with a parent never reads '이어진 곳 0'", () => {
    renderParentOnly();
    const stats = screen.getByTestId("topology-v2-detail-panel-stats");
    // The first <b> is the connection aggregate, the second the evidence document count.
    expect(stats.querySelectorAll("b")[0].textContent).toBe("1");
  });

  it("draws the 속한 곳 group with the parent row, clickable like any other connection", () => {
    const onSelectConnection = vi.fn();
    renderParentOnly(onSelectConnection);
    const group = document.querySelector("[data-datasheet-group='belongsTo']");
    expect(group).not.toBeNull();
    expect(group!.textContent).toContain(labels.metricBelongsTo);
    expect(document.querySelector("[data-datasheet-group-total='belongsTo']")!.textContent).toBe("1");
    fireEvent.click(screen.getByText("Frontmatter → Ontology Stub"));
    expect(onSelectConnection).toHaveBeenCalledWith("capability:frontmatter-to-ontology");
  });

  it("does not show the '아직 기록된 관계 없음' empty-state — the parent IS a recorded relation", () => {
    renderParentOnly();
    expect(screen.queryByText(labels.noConnections)).not.toBeInTheDocument();
  });

  it("keeps the aggregate equal to the sum of the four rendered group totals", () => {
    render(
      <TopologyV2DetailPanel
        open
        nodeId="capability:mcp-server"
        slug="ontology/capabilities/mcp-server"
        title="MCP Server"
        kind="capability"
        domain={null}
        powered={false}
        groups={{
          contains: { rows: [], total: 27 },
          usedBy: { rows: [], total: 9 },
          dependsOn: { rows: [], total: 1 },
          belongsTo: { rows: [parentRow], total: 1 },
        }}
        evidence={{ rows: [], total: 0 }}
        codeLocations={[]}
        handoffText="node: ontology/capabilities/mcp-server"
        documentHref={null}
        meaningEditHref="/ontology/studio/?node=capability%3Amcp-server"
        labels={labels}
        onSelectConnection={() => {}}
        onCopyHandoff={() => {}}
        onClose={() => {}}
        onSetPathSource={() => {}}
      />,
    );
    const stats = screen.getByTestId("topology-v2-detail-panel-stats");
    const groupTotals = [...document.querySelectorAll("[data-datasheet-group-total]")]
      .filter((el) => el.getAttribute("data-datasheet-group-total") !== "evidence")
      .map((el) => Number(el.textContent));
    expect(groupTotals.reduce((a, b) => a + b, 0)).toBe(38);
    expect(stats.querySelectorAll("b")[0].textContent).toBe("38");
  });
});

describe("TopologyV2DetailPanel — P3-① 미기록 관계 empty-state (0 vs 미기록 disambiguation)", () => {
  it("renders the honest 'no relations recorded yet' empty-state when a node has zero recorded relations", () => {
    // A node like global-search, widely used in the code but with no relation yet
    // declared in the vault frontmatter — the UI has to say honestly that
    // 「쓰는 곳 0」 means "not recorded yet", not "no dependencies".
    render(
      <TopologyV2DetailPanel
        open
        nodeId="element:src/widgets/global-search"
        slug="src/widgets/global-search"
        title="global-search"
        kind="element"
        domain={null}
        powered={false}
        groups={{
          contains: { rows: [], total: 0 },
          usedBy: { rows: [], total: 0 },
          dependsOn: { rows: [], total: 0 },
          belongsTo: { rows: [], total: 0 },
        }}
        evidence={{ rows: [], total: 0 }}
        codeLocations={[]}
        handoffText="node: src/widgets/global-search"
        documentHref={null}
        meaningEditHref="/ontology/studio/?node=src%2Fwidgets%2Fglobal-search"
        labels={labels}
        onSelectConnection={() => {}}
        onCopyHandoff={() => {}}
        onClose={() => {}}
        onSetPathSource={() => {}}
      />,
    );
    expect(screen.getByText(labels.noConnections)).toBeInTheDocument();
    // the copy must carry the "recorded / declared" framing, not a bare "no connections"
    expect(labels.noConnections).toMatch(/recorded|declared/i);
  });
});

describe("TopologyV2DetailPanel — N6 소속 도메인 1급 사실", () => {
  it("renders a 도메인 · <이름> fact in the header when the node has an owning domain", () => {
    renderPanel(undefined, undefined, {
      domain: { id: "domains/ai-agent-partner", title: "AI Agent Partner" },
    });
    const fact = screen.getByTestId("topology-v2-detail-panel-domain");
    expect(fact).toHaveTextContent("domain");
    expect(fact).toHaveTextContent("AI Agent Partner");
  });

  it("hides the domain fact when the node has no owning domain", () => {
    renderPanel(undefined, undefined, { domain: null });
    expect(screen.queryByTestId("topology-v2-detail-panel-domain")).not.toBeInTheDocument();
  });

  it("focuses the domain via onSelectConnection when the domain fact is clicked", () => {
    const onSelectConnection = vi.fn();
    renderPanel(undefined, undefined, {
      domain: { id: "domains/ai-agent-partner", title: "AI Agent Partner" },
      onSelectConnection,
    });
    fireEvent.click(screen.getByTestId("topology-v2-detail-panel-domain"));
    expect(onSelectConnection).toHaveBeenCalledWith("domains/ai-agent-partner");
  });
});

describe("TopologyV2DetailPanel — W2-A action row", () => {
  it("links the 문서 tile to the document href when the node has a backing doc", () => {
    renderPanel(undefined, undefined, { documentHref: "/docs/domains/views" });
    const link = screen.getByTestId("topology-v2-detail-panel-action-document");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", expect.stringContaining("/docs/domains/views"));
  });

  it("hides the 문서 tile when the node has no sourceSlug/document href (no dead affordance)", () => {
    renderPanel(undefined, undefined, { documentHref: null });
    expect(
      screen.queryByTestId("topology-v2-detail-panel-action-document"),
    ).not.toBeInTheDocument();
  });

  it("links the 관계 편집 tile to the studio deep link", () => {
    renderPanel();
    const link = screen.getByTestId("topology-v2-detail-panel-action-edit");
    expect(link).toHaveAttribute("href", expect.stringContaining("/ontology/studio/"));
  });

  it("keeps 관계 편집 in place when a contextual editor callback is available", () => {
    const onEditRelations = vi.fn();
    renderPanel(undefined, undefined, { onEditRelations });
    const action = screen.getByTestId("topology-v2-detail-panel-action-edit");
    expect(action.tagName).toBe("BUTTON");
    fireEvent.click(action);
    expect(onEditRelations).toHaveBeenCalledTimes(1);
  });

  it("copies the handoff text when the 인계 복사 tile is clicked", () => {
    const onCopyHandoff = vi.fn();
    renderPanel(undefined, undefined, { onCopyHandoff });
    fireEvent.click(screen.getByTestId("topology-v2-detail-panel-action-handoff"));
    expect(onCopyHandoff).toHaveBeenCalledWith("node: domains/views");
  });

  it("calls onSetPathSource when the 경로 tile is clicked", () => {
    const onSetPathSource = vi.fn();
    renderPanel(undefined, undefined, { onSetPathSource });
    fireEvent.click(screen.getByTestId("topology-v2-detail-panel-action-path"));
    expect(onSetPathSource).toHaveBeenCalledTimes(1);
  });

  it("no longer renders a duplicate handoff button in the footer", () => {
    renderPanel();
    expect(
      screen.queryByTestId("topology-v2-detail-panel-handoff"),
    ).not.toBeInTheDocument();
  });

  // S2 part 3 — a long 「담는 것」 defaults to the path-prefix summary, with 「전체 보기」 for the list.
  it("담는 것이 15개 초과면 경로 프리픽스 요약을 보여주고 '전체 보기'로 리스트를 편다", () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      id: `element:cli/src/commands/c${i}`,
      title: `cmd ${i}`,
      kind: "element",
      relationType: "contains",
      direction: "outgoing" as const,
    }));
    render(
      <TopologyV2DetailPanel
        open
        nodeId="domain:cli"
        slug="domains/cli"
        title="CLI"
        kind="domain"
        domain={null}
        powered={false}
        groups={{
          contains: {
            rows, // capped preview
            total: 60,
            summary: {
              groups: [
                { key: "cli/src/commands", count: 48 },
                { key: ".claude/skills", count: 6 },
              ],
              otherCount: 6,
              total: 60,
              usable: true,
            },
          },
          usedBy: { rows: [], total: 0 },
          dependsOn: { rows: [], total: 0 },
          belongsTo: { rows: [], total: 0 },
        }}
        evidence={{ rows: [], total: 0 }}
        codeLocations={[]}
        handoffText="node: domains/cli"
        documentHref={null}
        meaningEditHref="/ontology/studio/?node=domains%2Fcli"
        labels={labels}
        onSelectConnection={() => {}}
        onCopyHandoff={() => {}}
        onClose={() => {}}
        onSetPathSource={() => {}}
      />,
    );
    // Default: the summary is visible and the individual row preview is hidden.
    expect(screen.getByTestId("topology-v2-contains-summary")).toBeInTheDocument();
    expect(screen.getByText("cli/src/commands")).toBeInTheDocument();
    expect(screen.getByText("48")).toBeInTheDocument();
    expect(screen.getByText(labels.containsOtherGroup)).toBeInTheDocument();
    expect(screen.queryByText("cmd 0")).not.toBeInTheDocument();

    // The 「전체 보기」 toggle → the list appears.
    fireEvent.click(screen.getByTestId("topology-v2-contains-summary-toggle"));
    expect(screen.queryByTestId("topology-v2-contains-summary")).not.toBeInTheDocument();
    expect(screen.getByText("cmd 0")).toBeInTheDocument();
  });

  it("담는 것이 15개 이하면 요약 없이 기존 리스트를 그대로 쓴다", () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `capability:c${i}`,
      title: `cap ${i}`,
      kind: "capability",
      relationType: "contains",
      direction: "outgoing" as const,
    }));
    render(
      <TopologyV2DetailPanel
        open
        nodeId="domain:small"
        slug="domains/small"
        title="Small"
        kind="domain"
        domain={null}
        powered={false}
        groups={{
          contains: { rows, total: 3, summary: { groups: [], otherCount: 3, total: 3, usable: false } },
          usedBy: { rows: [], total: 0 },
          dependsOn: { rows: [], total: 0 },
          belongsTo: { rows: [], total: 0 },
        }}
        evidence={{ rows: [], total: 0 }}
        codeLocations={[]}
        handoffText="node: domains/small"
        documentHref={null}
        meaningEditHref="/ontology/studio/?node=domains%2Fsmall"
        labels={labels}
        onSelectConnection={() => {}}
        onCopyHandoff={() => {}}
        onClose={() => {}}
        onSetPathSource={() => {}}
      />,
    );
    expect(screen.queryByTestId("topology-v2-contains-summary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("topology-v2-contains-summary-toggle")).not.toBeInTheDocument();
    expect(screen.getByText("cap 0")).toBeInTheDocument();
  });

  // B4 (H1) — when the summary collapses into one 「기타」 lump (usable=false), the
  // summary and toggle are hidden even past the threshold and the individual list
  // renders instead (avoiding zero information).
  it("담는 것이 15개 초과라도 요약이 usable=false 면 리스트로 폴백한다", () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      id: `element:leaf${i}`,
      title: `leaf ${i}`,
      kind: "element",
      relationType: "contains",
      direction: "outgoing" as const,
    }));
    render(
      <TopologyV2DetailPanel
        open
        nodeId="domain:flat"
        slug="domains/flat"
        title="Flat"
        kind="domain"
        domain={null}
        powered={false}
        groups={{
          contains: {
            rows,
            total: 40,
            summary: { groups: [], otherCount: 40, total: 40, usable: false },
          },
          usedBy: { rows: [], total: 0 },
          dependsOn: { rows: [], total: 0 },
          belongsTo: { rows: [], total: 0 },
        }}
        evidence={{ rows: [], total: 0 }}
        codeLocations={[]}
        handoffText="node: domains/flat"
        documentHref={null}
        meaningEditHref="/ontology/studio/?node=domains%2Fflat"
        labels={labels}
        onSelectConnection={() => {}}
        onCopyHandoff={() => {}}
        onClose={() => {}}
        onSetPathSource={() => {}}
      />,
    );
    expect(screen.queryByTestId("topology-v2-contains-summary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("topology-v2-contains-summary-toggle")).not.toBeInTheDocument();
    expect(screen.getByText("leaf 0")).toBeInTheDocument();
  });
});

// rank7 (design-council B5) — last-edit provenance + expected_mtime conflict.
describe("TopologyV2DetailPanel — last-edit provenance", () => {
  it("renders no subject row when lastEditSubject is null (no fabrication)", () => {
    renderPanel();
    expect(screen.queryByTestId("last-edit-subject-row")).not.toBeInTheDocument();
  });

  it("renders the AI agent subject row from a real, caller-resolved fact", () => {
    renderPanel(undefined, undefined, {
      lastEditSubject: { kind: "agent", ageLabel: "3m ago" },
    });
    const row = screen.getByTestId("last-edit-subject-row");
    expect(row).toHaveAttribute("data-edit-subject-kind", "agent");
    expect(row).toHaveTextContent("AI agent");
    expect(row).toHaveTextContent("3m ago");
  });

  it("renders the human subject row from a real, caller-resolved fact", () => {
    renderPanel(undefined, undefined, {
      lastEditSubject: { kind: "human", ageLabel: "yesterday" },
    });
    const row = screen.getByTestId("last-edit-subject-row");
    expect(row).toHaveAttribute("data-edit-subject-kind", "human");
    expect(row).toHaveTextContent("me");
  });

  it("renders no conflict badge when mtimeConflict is false (default)", () => {
    renderPanel();
    expect(screen.queryByTestId("mtime-conflict-badge")).not.toBeInTheDocument();
  });

  it("renders the conflict badge only when the caller resolved a real mtime mismatch", () => {
    renderPanel(undefined, undefined, { mtimeConflict: true });
    expect(screen.getByTestId("mtime-conflict-badge")).toBeInTheDocument();
  });
});

// Mockup redesign (2026-07-24, owner-approved mockup-panel-detail) — a balanced
// header (name hero + kind badge + domain chip), group headers with a direction
// icon + count chip + underline, a kind glyph at each row's left, a quiet action
// strip, and an indigo primary footer.
describe("TopologyV2DetailPanel — 시안 재설계 구조", () => {
  it("renders the node name as the header hero (title2/650, truncatable)", () => {
    renderPanel();
    const name = screen.getByRole("heading", { level: 2 });
    expect(name).toHaveTextContent("Views");
    expect(name.className).toContain("text-title");
    expect(name.className).toContain("truncate");
  });

  it("renders a quiet kind badge with the localized kind word next to the name", () => {
    renderPanel();
    const panel = screen.getByTestId("topology-v2-detail-panel");
    // kindLabel appears in the header badge (fixture kind = 'domain' → 'Domain')
    expect(panel.textContent).toContain(labels.kindLabel);
    // the header badge carries the kind-badge surface token
    const badge = Array.from(panel.querySelectorAll("span")).find((s) =>
      s.className.includes("--topology-v2-panel-kind-badge-surface"),
    );
    expect(badge).toBeTruthy();
    expect(badge!.textContent).toContain(labels.kindLabel);
  });

  it("no longer renders the floating power-state dot", () => {
    renderPanel();
    expect(
      screen.getByTestId("topology-v2-detail-panel").querySelector("[data-power-state]"),
    ).toBeNull();
  });

  it("renders each relation group header with an underline divider + directional glyph + count chip", () => {
    render(
      <TopologyV2DetailPanel
        open
        nodeId="domain:ai-agent-partner"
        slug="domains/ai-agent-partner"
        title="AI Agent Partner"
        kind="domain"
        domain={null}
        powered={false}
        groups={{
          contains: {
            rows: [
              { id: "capability:mcp-server", title: "MCP Server", kind: "capability", relationType: "contains", direction: "outgoing" },
              { id: "element:agent-config", title: "Agent Config", kind: "element", relationType: "contains", direction: "outgoing" },
            ],
            total: 2,
          },
          usedBy: { rows: [], total: 0 },
          dependsOn: { rows: [], total: 0 },
          belongsTo: { rows: [], total: 0 },
        }}
        evidence={{ rows: [], total: 0 }}
        codeLocations={[]}
        handoffText="node: domains/ai-agent-partner"
        documentHref={null}
        meaningEditHref="/ontology/studio/?node=domains%2Fai-agent-partner"
        labels={labels}
        onSelectConnection={() => {}}
        onCopyHandoff={() => {}}
        onClose={() => {}}
        onSetPathSource={() => {}}
      />,
    );
    const group = document.querySelector("[data-datasheet-group='contains']");
    expect(group).not.toBeNull();
    // header underline token present
    const header = group!.querySelector("[class*='--topology-v2-panel-group-underline']");
    expect(header).not.toBeNull();
    // count chip carries the indigo count token
    const chip = group!.querySelector("[data-datasheet-group-total='contains']");
    expect(chip!.className).toContain("--topology-v2-panel-count-text");
    // each row carries the canvas kind glyph (data-kind-glyph), no right-aligned kind word
    const glyphs = group!.querySelectorAll("[data-kind-glyph]");
    expect(glyphs.length).toBe(2);
  });

  it("renders the relation zone with the enlarged between-group gap token (28px rhythm)", () => {
    render(
      <TopologyV2DetailPanel
        open
        nodeId="domain:ai-agent-partner"
        slug="domains/ai-agent-partner"
        title="AI Agent Partner"
        kind="domain"
        domain={null}
        powered={false}
        groups={{
          contains: {
            rows: [{ id: "capability:x", title: "X", kind: "capability", relationType: "contains", direction: "outgoing" }],
            total: 1,
          },
          usedBy: { rows: [], total: 0 },
          dependsOn: { rows: [], total: 0 },
          belongsTo: { rows: [], total: 0 },
        }}
        evidence={{ rows: [], total: 0 }}
        codeLocations={[]}
        handoffText="node: domains/ai-agent-partner"
        documentHref={null}
        meaningEditHref="/ontology/studio/?node=domains%2Fai-agent-partner"
        labels={labels}
        onSelectConnection={() => {}}
        onCopyHandoff={() => {}}
        onClose={() => {}}
        onSetPathSource={() => {}}
      />,
    );
    const zone = document
      .querySelector("[data-datasheet-group='contains']")!
      .closest("div[class*='--topology-v2-panel-zone-gap']");
    expect(zone).not.toBeNull();
  });

  it("renders the footer '전체 상세' as the single indigo-filled primary", () => {
    renderPanel(vi.fn());
    const primary = screen.getByTestId("topology-v2-detail-panel-open-full-detail");
    expect(primary.className).toContain("--topology-v2-panel-primary-surface");
    expect(primary.className).toContain("--topology-v2-panel-primary-text");
  });

  it("renders the domain chip as an indigo-tinted navigable chip (surface token + chevron)", () => {
    renderPanel(undefined, undefined, {
      domain: { id: "domains/ai-agent-partner", title: "AI Agent Partner" },
    });
    const chip = screen.getByTestId("topology-v2-detail-panel-domain");
    expect(chip.className).toContain("--topology-v2-panel-domain-surface");
    expect(chip).toHaveAttribute("aria-label", expect.stringContaining("AI Agent Partner"));
    // a chevron (svg) affordance is present
    expect(chip.querySelector("svg")).not.toBeNull();
  });

  /**
   * This panel **carries its own exit window** (2026-08-03). The parent used to
   * open the window with `usePanelPresence` and only dictate the class through a
   * `presence` prop — which made «does this surface have a way out» a fact living
   * outside this file, and if the parent reverted to unmounting immediately nothing
   * here could catch it.
   *
   * The contract HomePage leans on is exactly these two: it stays for the window's
   * duration after closing, and it reports once when the window ends (that report
   * takes down the positioner).
   */
  it("닫아도 1프레임에 사라지지 않고, 퇴장이 끝나면 한 번 알린다", async () => {
    const onExited = vi.fn();
    const panel = (open: boolean) => (
      <TopologyV2DetailPanel
        open={open}
        onExited={onExited}
        nodeId="domain:views"
        slug="domains/views"
        title="Views"
        kind="domain"
        domain={null}
        powered={false}
        groups={{
          contains: { rows: [], total: 0 },
          usedBy: { rows: [], total: 0 },
          dependsOn: { rows: [], total: 0 },
          belongsTo: { rows: [], total: 0 },
        }}
        evidence={{ rows: [], total: 0 }}
        codeLocations={[]}
        handoffText="node: domains/views"
        documentHref={null}
        meaningEditHref="/ontology/studio/?node=domains%2Fviews"
        labels={labels}
        onSelectConnection={() => {}}
        onCopyHandoff={() => {}}
        onClose={() => {}}
        onSetPathSource={() => {}}
      />
    );

    const { rerender } = render(panel(true));
    expect(screen.getByTestId("topology-v2-detail-panel")).toBeInTheDocument();

    rerender(panel(false));
    // It is *mid*-exit — still on screen, and unpressable for that frame.
    expect(screen.getByTestId("topology-v2-detail-panel")).toBeInTheDocument();
    expect(onExited, "퇴장 중에 부르면 포지셔너가 애니 도중에 사라진다").not.toHaveBeenCalled();

    await waitFor(() => expect(onExited).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("topology-v2-detail-panel")).not.toBeInTheDocument();
  });
});

/**
 * Hovering a row makes the map beside it point at that node (owner instruction,
 * 2026-08-17: *"이부분들 각각 마우스 올리면 옆에 지도에서 반짝이면서 표시되면
 * 좋겠는데 가능할까? 지금은 아무 반응이 없어서.."* — hovering each of these should
 * make it glint on the map beside it; right now nothing responds).
 *
 * What is measured here is one thing: **which name goes out through which
 * callback.** The two row kinds use different namespaces — a relation row uses the
 * canvas node id and an evidence document row uses the vault slug. Merging the two
 * into one list once produced a dead feature that «had the wiring but caught no
 * name at all» (`chat-node-index.ts`), and this is precisely the check that was
 * missing then. Whether the map actually draws it is canvas and cannot be measured
 * here; `tests/e2e/datasheet-hover-map-brush.spec.ts` measures that in pixels.
 */
describe("TopologyV2DetailPanel — 줄 호버가 지도로 나가는 통로", () => {
  const childRow = {
    id: "capability:cart",
    title: "장바구니",
    kind: "capability",
    relationType: "contains",
    direction: "outgoing" as const,
  };

  it("관계 행은 **캔버스 노드 id** 를 내보내고, 커서가 나가면 null 로 접는다", () => {
    const onHoverConnection = vi.fn();
    renderPanel(undefined, undefined, {
      onHoverConnection,
      groups: {
        contains: { rows: [childRow], total: 1 },
        usedBy: { rows: [], total: 0 },
        dependsOn: { rows: [], total: 0 },
        belongsTo: { rows: [], total: 0 },
      },
    });

    const row = screen.getByText("장바구니").closest("button");
    expect(row).not.toBeNull();
    fireEvent.pointerEnter(row!);
    expect(onHoverConnection).toHaveBeenCalledWith("capability:cart");
    fireEvent.pointerLeave(row!);
    expect(onHoverConnection).toHaveBeenLastCalledWith(null);
  });

  it("근거 문서 행은 **볼트 slug** 를 내보낸다 — 캔버스 id 와 다른 이름 공간이다", () => {
    const onHoverEvidence = vi.fn();
    const onHoverConnection = vi.fn();
    renderPanel(
      undefined,
      { rows: [{ id: "domains/order", title: "order", path: "domains/" }], total: 1 },
      { onHoverEvidence, onHoverConnection },
    );

    const link = screen.getByText("order").closest("a");
    expect(link).not.toBeNull();
    fireEvent.pointerEnter(link!);
    expect(onHoverEvidence).toHaveBeenCalledWith("domains/order");
    // Leaking through the canvas-id channel would let the caller pass it straight to the map without the lookup table.
    expect(onHoverConnection).not.toHaveBeenCalled();
    fireEvent.pointerLeave(link!);
    expect(onHoverEvidence).toHaveBeenLastCalledWith(null);
  });

  it("도메인 칩도 같은 통로다 — 같은 어포던스인데 여기만 반응이 없으면 안 된다", () => {
    const onHoverConnection = vi.fn();
    renderPanel(undefined, undefined, {
      onHoverConnection,
      domain: { id: "domain:order", title: "주문" },
    });

    const chip = screen.getByTestId("topology-v2-detail-panel-domain");
    fireEvent.pointerEnter(chip);
    expect(onHoverConnection).toHaveBeenCalledWith("domain:order");
    fireEvent.pointerLeave(chip);
    expect(onHoverConnection).toHaveBeenLastCalledWith(null);
  });

  it("패널이 사라지면 강조도 걷힌다 — 행을 누르면 pointerleave 가 안 온다", () => {
    const onHoverConnection = vi.fn();
    const onHoverEvidence = vi.fn();
    const { unmount } = renderPanel(undefined, undefined, {
      onHoverConnection,
      onHoverEvidence,
      groups: {
        contains: { rows: [childRow], total: 1 },
        usedBy: { rows: [], total: 0 },
        dependsOn: { rows: [], total: 0 },
        belongsTo: { rows: [], total: 0 },
      },
    });

    fireEvent.pointerEnter(screen.getByText("장바구니").closest("button")!);
    expect(onHoverConnection).toHaveBeenLastCalledWith("capability:cart");

    unmount();
    expect(onHoverConnection).toHaveBeenLastCalledWith(null);
    expect(onHoverEvidence).toHaveBeenLastCalledWith(null);
  });
});
