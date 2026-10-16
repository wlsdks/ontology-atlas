import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectSourceView } from "@/shared/lib/project-source/project-source-receipt";
import { OntologyMapDetailPanel } from "./OntologyMapDetailPanel";
import type { OntologyMapDetailPanelProps } from "./detail-panel/types";

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
  codeLocationsLabel: "code location",
  codeLocationsCopyLabel: "copy",
  codeLocationsCopiedLabel: "copied",
  editSubjectPrefix: "Last edited",
  editSubjectAgent: "AI agent",
  editSubjectHuman: "me",
  editConflictMessage: "This document changed elsewhere — check before you overwrite",
  summaryFreshnessPrefix: "Description lags membership",
  summaryFreshnessLag: "1d",
  summaryFreshnessAction: "Review description",
  summaryHistoryUnavailable: "History could not be compared",
  noConnections: "no relations recorded yet · relations are declared in frontmatter",
  handoff: "Copy next action",
  close: "Close",
  openFullDetail: "Full detail →",
  actionsGroupLabel: "Node actions",
  actionDocument: "Document",
  actionEditRelations: "Edit relations",
  actionCreateLinked: "Create linked",
  actionCopyHandoff: "Copy handoff",
  actionAskAgent: "Ask agent",
  actionEditMenu: "Edit",
  actionMore: "More actions",
  actionPath: "Path",
  actionRealm: "Expand realm",
  sourceHeading: "Code evidence",
  sourcePending: "Reading the analysis receipt",
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
    suppressPrimaryAction?: boolean;
    onEditRelations?: () => void;
    onCreateLinked?: () => void;
    onEnterRealm?: () => void;
    projectSourceBusy?: boolean;
    projectSourceError?: string | null;
    projectSourceDegraded?: OntologyMapDetailPanelProps["projectSourceDegraded"];
    projectSourceProposal?: OntologyMapDetailPanelProps["projectSourceProposal"];
    onProjectSourceConfirmProposal?: () => void | Promise<void>;
    updatedAtLabel?: string | null;
    groups?: OntologyMapDetailPanelProps["groups"];
    projectSourceLoading?: boolean;
    summaryHistoryUnavailable?: boolean;
    summaryStaleness?: { behindByDays: number } | null;
  } = {},
) {
  return render(panelElement(onOpenFullDetail, evidence, overrides));
}

function panelElement(
  onOpenFullDetail: (() => void) | undefined,
  evidence: { rows: { id: string; title: string; path: string | null }[]; total: number } = {
    rows: [],
    total: 0,
  },
  overrides: Parameters<typeof renderPanel>[2] = {},
) {
  return (
    <OntologyMapDetailPanel
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
      summaryHistoryUnavailable={overrides.summaryHistoryUnavailable}
      summaryStaleness={overrides.summaryStaleness}
      onSelectConnection={overrides.onSelectConnection ?? (() => {})}
      onHoverConnection={overrides.onHoverConnection}
      onHoverEvidence={overrides.onHoverEvidence}
      onCopyHandoff={overrides.onCopyHandoff ?? (() => {})}
      onAskAgent={overrides.onAskAgent}
      suppressPrimaryAction={overrides.suppressPrimaryAction}
      onEditRelations={overrides.onEditRelations}
      onCreateLinked={overrides.onCreateLinked}
      onClose={() => {}}
      onEnterRealm={overrides.onEnterRealm}
      onOpenFullDetail={onOpenFullDetail}
      projectSource={overrides.projectSource}
      projectSourceLoading={overrides.projectSourceLoading}
      onProjectSourceAction={overrides.onProjectSourceAction}
      projectSourceBusy={overrides.projectSourceBusy}
      projectSourceError={overrides.projectSourceError}
      projectSourceDegraded={overrides.projectSourceDegraded}
      projectSourceProposal={overrides.projectSourceProposal}
      onProjectSourceConfirmProposal={overrides.onProjectSourceConfirmProposal}
      showHandoff={overrides.showHandoff}
      showSourcePath={overrides.showSourcePath}
    />
  );
}

describe("OntologyMapDetailPanel history availability", () => {
  it("shows incomplete history without a stale verdict and clears it after a completed comparison", () => {
    const props = { summaryHistoryUnavailable: true, summaryStaleness: { behindByDays: 1 } };
    const { rerender } = renderPanel(undefined, { rows: [], total: 0 }, props);
    expect(screen.getByTestId("summary-history-unavailable")).toHaveTextContent(labels.summaryHistoryUnavailable);
    expect(screen.queryByTestId("summary-freshness-row")).not.toBeInTheDocument();
    rerender(panelElement(undefined, { rows: [], total: 0 }, { ...props, summaryHistoryUnavailable: false }));
    expect(screen.queryByTestId("summary-history-unavailable")).not.toBeInTheDocument();
    expect(screen.getByTestId("summary-freshness-row")).toHaveTextContent(labels.summaryFreshnessLag);
  });
});

describe("OntologyMapDetailPanel — project source receipt", () => {
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

    const rail = screen.getByTestId("map-project-source-receipt");
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
    expect(screen.getByTestId("map-project-source-heading")).toHaveTextContent(
      "Code evidence",
    );
    expect(rail).toHaveTextContent("Source verified");
    expect(rail).toHaveTextContent("Source · Git repository");
    expect(rail).toHaveTextContent("Measured today");
    expect(rail).toHaveTextContent("Current source");
    expect(rail).not.toHaveTextContent("Connect a code folder");
    expect(screen.queryByTestId("map-project-source-gap")).not.toBeInTheDocument();
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

    const rail = screen.getByTestId("map-project-source-receipt");
    expect(rail).toHaveAttribute("data-source-gap-visible", "true");
    expect(screen.getByTestId("map-project-source-gap")).toHaveTextContent(
      "Next check: Connect a code folder",
    );
  });

  it("keeps one primary action plus Edit and More for a current project", () => {
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

    const actions = screen.getByTestId("map-detail-panel-actions");
    expect(actions.querySelectorAll('[data-action-role="primary"]')).toHaveLength(1);
    expect(screen.getByTestId("map-detail-panel-edit-menu-trigger")).toBeInTheDocument();
    expect(screen.getByTestId("map-detail-panel-more-menu-trigger")).toBeInTheDocument();
    expect(screen.queryByTestId("map-detail-panel-action-handoff")).not.toBeInTheDocument();
    expect(screen.queryByTestId("map-detail-panel-action-path")).not.toBeInTheDocument();
    expect(screen.getByTestId("map-project-source-action")).toBeInTheDocument();
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
    const groups: OntologyMapDetailPanelProps["groups"] = {
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

    const summary = screen.getByTestId("map-project-relations-summary");
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
    const groups: OntologyMapDetailPanelProps["groups"] = {
      contains: {
        rows: [{ id: "domain:catalog", title: "Catalog", kind: "domain", relationType: "contains", direction: "outgoing" }],
        total: 1,
      },
      usedBy: { rows: [], total: 0 },
      dependsOn: { rows: [], total: 0 },
      belongsTo: { rows: [], total: 0 },
    };

    renderPanel(undefined, undefined, { kind: "project", projectSource, groups });

    expect(screen.queryByTestId("map-project-relations-summary")).not.toBeInTheDocument();
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

    const action = screen.getByTestId("map-project-source-action");
    fireEvent.click(action);
    expect(onProjectSourceAction).toHaveBeenCalledTimes(1);
    expect(action.className).toContain("--map-panel-primary-surface");
    /*
     * The remedy must share an ancestor with the receipt; jsdom cannot measure distance, so the shared
     * ancestor is pinned.
     */
    const remedy = screen.getByTestId("map-project-source-remedy");
    expect(remedy).toContainElement(action);
    expect(screen.getByTestId("map-project-source-receipt")).toContainElement(remedy);
    // The same control is never drawn in two places.
    expect(screen.getAllByTestId("map-project-source-action")).toHaveLength(1);

    const fullDetail = screen.getByTestId("map-detail-panel-open-full-detail");
    expect(fullDetail.className).not.toContain("--map-panel-primary-surface");
    expect(fullDetail.className).toContain("--map-panel-text-tertiary");
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
    expect(screen.getByTestId("map-project-source-gap")).toBeInTheDocument();
    expect(screen.getByTestId("map-project-source-why")).toHaveTextContent(
      "Connecting a code folder shows where each concept lives.",
    );
    expect(screen.getByTestId("map-project-source-remedy")).toHaveAttribute(
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

    const remedy = screen.getByTestId("map-project-source-remedy");
    expect(remedy).toHaveAttribute("data-remedy-mode", "proposed");

    // ① What it proposes — one path. ② Why it guessed that — one line.
    const proposal = screen.getByTestId("map-project-source-proposal");
    expect(proposal).toHaveAttribute("data-proposal-confidence", "high");
    expect(screen.getByTestId("map-project-source-proposal-path")).toHaveAttribute(
      "title",
      "/Users/stark/dev/oh-my-ontology",
    );
    expect(
      screen.getByTestId("map-project-source-proposal-reason"),
    ).toHaveTextContent("55 of 55 declared paths were found here");

    // ③ Confirm in one press — no folder picker in between.
    const confirm = screen.getByTestId("map-project-source-confirm");
    fireEvent.click(confirm);
    expect(onProjectSourceConfirmProposal).toHaveBeenCalledTimes(1);
    expect(onProjectSourceAction).not.toHaveBeenCalled();

    // ④ A guess can be wrong — the escape hatch is right beside it, and it is the previous picker.
    const pickOther = screen.getByTestId("map-project-source-action");
    expect(pickOther).toHaveTextContent("Choose another folder");
    fireEvent.click(pickOther);
    expect(onProjectSourceAction).toHaveBeenCalledTimes(1);

    // One indigo primary action per box — the escape hatch recedes into a quiet skin.
    expect(confirm.className).toContain("--map-panel-primary-surface");
    expect(pickOther.className).not.toContain("--map-panel-primary-surface");
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

    expect(screen.getByTestId("map-project-source-remedy")).toHaveAttribute(
      "data-remedy-mode",
      "actionable",
    );
    expect(
      screen.queryByTestId("map-project-source-proposal"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("map-project-source-confirm"),
    ).not.toBeInTheDocument();
    const action = screen.getByTestId("map-project-source-action");
    expect(action).toHaveTextContent("Use current evidence");
    expect(action.className).toContain("--map-panel-primary-surface");
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
      projectSourceDegraded: {
        why: "A browser cannot tell where the folder sits on your disk.",
        ctaLabel: "Get the macOS app",
        href: "/download/",
        stillWorks: "Reading the map still works here.",
      },
    });

    const remedy = screen.getByTestId("map-project-source-remedy");
    expect(remedy).toHaveAttribute("data-remedy-mode", "degraded");
    // What cannot be executed is not drawn as a button.
    expect(screen.queryByTestId("map-project-source-action")).not.toBeInTheDocument();
    // ① why ② where to — a destination that actually opens, not a sentence ③ what works here too.
    expect(screen.getByTestId("map-project-source-degraded-why")).toBeInTheDocument();
    expect(screen.getByTestId("map-project-source-degraded-cta")).toHaveAttribute(
      "href",
      expect.stringContaining("/download/") as unknown as string,
    );
    expect(
      screen.getByTestId("map-project-source-degraded-still-works"),
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

    expect(screen.queryByTestId("map-project-source-remedy")).not.toBeInTheDocument();
    // The action does not disappear — only its position stays in the footer.
    expect(screen.getAllByTestId("map-project-source-action")).toHaveLength(1);
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

    expect(screen.queryByTestId("map-project-source-receipt")).not.toBeInTheDocument();
    expect(screen.queryByTestId("map-detail-panel-stats")).not.toBeInTheDocument();
    expect(screen.getByTestId("map-detail-panel-open-full-detail").className).toContain(
      "--map-panel-primary-surface",
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

    expect(screen.queryByTestId("map-project-source-action")).not.toBeInTheDocument();
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

    expect(screen.getByTestId("map-datasheet-updated-at")).toHaveTextContent(
      "Concept document · changed 3d ago",
    );
    expect(screen.getByTestId("map-project-source-receipt")).toHaveTextContent(
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

    expect(screen.getByTestId("map-project-source-receipt")).toHaveAttribute(
      "data-source-status",
      "review_required",
    );
    const action = screen.getByTestId("map-project-source-action");
    expect(action).toBeDisabled();
    expect(action).toHaveAttribute("aria-busy", "true");
    expect(action).toHaveTextContent("Measuring code evidence");
    expect(screen.getByTestId("map-project-source-error")).toHaveTextContent(
      "previous binding is unchanged",
    );
  });
});

describe("OntologyMapDetailPanel — project receipt still being read", () => {
  const gapView: ProjectSourceView = {
    contractVersion: 1,
    projectSlug: "views",
    status: "needs_evidence",
    currentness: "unavailable",
    measuredAt: null,
    topGap: { id: "receipt_missing" },
    nextAction: { id: "measure_source" },
    bindingCardinality: 1,
    receipt: null,
  };

  it("draws the project's layout from the first frame and holds the receipt's place", () => {
    renderPanel(vi.fn(), undefined, {
      kind: "project",
      projectSource: null,
      projectSourceLoading: true,
      updatedAtLabel: "changed today",
    });

    const pending = screen.getByTestId("map-project-source-pending");
    expect(pending).toHaveAttribute("aria-busy", "true");
    expect(pending).toHaveAttribute("aria-live", "polite");
    expect(pending).not.toHaveAttribute("data-source-action");
    expect(screen.getByTestId("map-project-source-heading")).toHaveTextContent("Code evidence");
    expect(screen.queryByTestId("map-project-source-receipt")).not.toBeInTheDocument();
    // Everything else is already the project's.
    expect(screen.getByTestId("map-datasheet-updated-at")).toHaveTextContent(
      "Concept document · changed today",
    );
    expect(screen.getByTestId("map-project-relations-summary")).toBeInTheDocument();
    expect(screen.queryByTestId("map-detail-panel-slug")).not.toBeInTheDocument();
    expect(screen.getByTestId("map-detail-panel-open-full-detail").className).not.toContain(
      "--map-panel-primary-surface",
    );
    expect(screen.getByTestId("map-detail-panel-actions").className).toContain("border-t");
  });

  it("says it is reading only once the read outlives a frame's worth of waiting", async () => {
    renderPanel(vi.fn(), undefined, {
      kind: "project",
      projectSource: null,
      projectSourceLoading: true,
    });

    const line = screen.getByTestId("map-project-source-pending-line");
    expect(line).toHaveAttribute("data-pending-announced", "false");
    expect(line.className).toContain("invisible");
    await waitFor(() => expect(line).toHaveAttribute("data-pending-announced", "true"));
    expect(line).toHaveTextContent("Reading the analysis receipt");
    expect(line.className).not.toContain("invisible");
  });

  it("turns the same live region into the receipt, and the gap arrives inside a disclosure", () => {
    const { rerender } = renderPanel(vi.fn(), undefined, {
      kind: "project",
      projectSource: null,
      projectSourceLoading: true,
    });
    const slot = screen.getByTestId("map-project-source-pending");

    rerender(panelElement(vi.fn(), undefined, {
      kind: "project",
      projectSource: gapView,
      projectSourceLoading: false,
      onProjectSourceAction: vi.fn(),
    }));

    const receipt = screen.getByTestId("map-project-source-receipt");
    expect(receipt).toBe(slot);
    expect(receipt).not.toHaveAttribute("aria-busy");
    expect(receipt).toHaveAttribute("data-source-action", "measure_source");
    expect(screen.queryByTestId("map-project-source-pending-line")).not.toBeInTheDocument();
    const gap = screen.getByTestId("map-project-source-gap");
    expect(gap.closest(".ai-row-disclosure")).toHaveAttribute("data-state", "open");
    expect(screen.getByTestId("map-project-source-remedy").closest(".ai-row-disclosure")).toHaveAttribute(
      "data-state",
      "open",
    );
  });

  it("keeps the plain layout where no receipt can exist (nothing is being read)", () => {
    renderPanel(vi.fn(), undefined, {
      kind: "project",
      projectSource: null,
      projectSourceLoading: false,
    });

    expect(screen.queryByTestId("map-project-source-pending")).not.toBeInTheDocument();
    expect(screen.queryByTestId("map-project-source-receipt")).not.toBeInTheDocument();
    expect(screen.getByTestId("map-detail-panel-slug")).toBeInTheDocument();
    expect(screen.getByTestId("map-detail-panel-open-full-detail").className).toContain(
      "--map-panel-primary-surface",
    );
  });

  it("never holds a receipt's place for a kind that has none", () => {
    renderPanel(vi.fn(), undefined, { kind: "domain", projectSourceLoading: true });

    expect(screen.queryByTestId("map-project-source-pending")).not.toBeInTheDocument();
    expect(screen.getByTestId("map-detail-panel-slug")).toBeInTheDocument();
  });
});

describe("OntologyMapDetailPanel — installed-app evidence identity", () => {
  it("exposes the selected ontology handle and readable identity on the panel root", () => {
    renderPanel();
    const panel = screen.getByTestId("map-detail-panel");

    expect(panel).toHaveAttribute("data-selected-node-id", "domain:views");
    expect(panel).toHaveAttribute("data-selected-node-kind", "domain");
    expect(panel).toHaveAttribute("data-selected-node-title", "Views");
    expect(panel).toHaveAttribute("data-surface-role", "active-node-inspector");
    expect(panel).toHaveAttribute("data-attention-role", "supporting-detail");
  });
});

describe("OntologyMapDetailPanel — full-detail A1 opt-in link", () => {
  it("renders the '전체 상세 →' link when onOpenFullDetail is provided", () => {
    const onOpenFullDetail = vi.fn();
    renderPanel(onOpenFullDetail);
    fireEvent.click(screen.getByTestId("map-detail-panel-open-full-detail"));
    expect(onOpenFullDetail).toHaveBeenCalledTimes(1);
  });

  it("hides the link when onOpenFullDetail is omitted", () => {
    renderPanel(undefined);
    expect(
      screen.queryByTestId("map-detail-panel-open-full-detail"),
    ).not.toBeInTheDocument();
  });
});

describe("OntologyMapDetailPanel — viewport clamp (P3-③)", () => {
  it("+N is not a dead count: pressing it expands everything in place, and pressing again collapses", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      id: `capability:c${i}`,
      title: `Cap ${i}`,
      kind: "capability",
      relationType: "contains",
      direction: "outgoing" as const,
    }));
    const groups: OntologyMapDetailPanelProps["groups"] = {
      contains: { rows: many.slice(0, 6), allRows: many, total: 9 },
      usedBy: { rows: [], total: 0 },
      dependsOn: { rows: [], total: 0 },
      belongsTo: { rows: [], total: 0 },
    };
    renderPanel(undefined, undefined, { groups });

    expect(screen.getByText("Cap 0")).toBeInTheDocument();
    expect(screen.queryByText("Cap 8")).not.toBeInTheDocument();

    const more = screen.getByTestId("map-group-more-contains");
    expect(more).toHaveTextContent("+3");
    fireEvent.click(more);
    expect(screen.getByText("Cap 8")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("map-group-more-contains"));
    expect(screen.queryByText("Cap 8")).not.toBeInTheDocument();
  });

  it("always carries a viewport-bounded max-height and internal scroll so the footer link stays reachable", () => {
    renderPanel(vi.fn());
    const panel = screen.getByTestId("map-detail-panel");
    // `--map-inspector-max-height`, not the shared panel ceiling: it diverges below `lg`, where this
    // surface is a bottom sheet. The meaning editor shares this anchor and must keep the unclamped
    // ceiling.
    expect(panel.className).toContain("max-h-[var(--map-inspector-max-height)]");
    expect(panel.className).toContain("overflow-y-auto");
    // The full-detail footer link is inside the same clamped/scrollable
    // root, not a sibling escaping the clamp.
    expect(panel).toContainElement(
      screen.getByTestId("map-detail-panel-open-full-detail"),
    );
  });
});

describe("OntologyMapDetailPanel: evidence group promotion (RATIO-SYSTEM section 4)", () => {
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

describe("OntologyMapDetailPanel: evidence count (group only)", () => {
  it("shows the evidence count as a number in the group header total (matches the mockup)", () => {
    renderPanel(undefined, {
      rows: [{ id: "capabilities/mcp-server", title: "mcp-server", path: "capabilities/" }],
      total: 1,
    });
    const total = document.querySelector("[data-datasheet-group-total='evidence']");
    expect(total!.textContent).toBe("1");
  });
});

describe("OntologyMapDetailPanel: code location group", () => {
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
    fireEvent.click(screen.getByTestId("map-detail-panel-code-location-copy"));
    expect(writeText).toHaveBeenCalledWith("mcp/src/index.js");
  });
});

describe("OntologyMapDetailPanel: sticky footer slug in plain language", () => {
  it("shows only the slug's last segment in visible text, with the full slug as a hover title", () => {
    render(
      <OntologyMapDetailPanel
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
      />,
    );
    const slugEl = screen.getByTestId("map-detail-panel-slug");
    expect(slugEl).toHaveTextContent("mcp-server");
    expect(slugEl.textContent).not.toContain("ontology/capabilities");
    expect(slugEl).toHaveAttribute("title", "ontology/capabilities/mcp-server");
  });

  it("shows the slug as-is when it has no path segment to fold", () => {
    renderPanel();
    // fixture slug is "domains/views" — but a slug with no "/" should render
    // unchanged (nothing to fold).
    const slugEl = screen.getByTestId("map-detail-panel-slug");
    expect(slugEl).toHaveTextContent("views");
  });
});

// Slice B (humanising element labels) — when a title humanised for display is
// rendered, the original code path is preserved as a mono subline. The caller's
// contract is to pass sourceTitle only when display differs from the original, so
// the panel itself decides whether to render purely from sourceTitle's presence
// and whether it equals the title.
describe("OntologyMapDetailPanel: source path subline", () => {
  it("renders the original in a mono subline when sourceTitle differs from title", () => {
    renderPanel(undefined, undefined, { sourceTitle: "src/foo/bar-baz.ts" });
    const subline = screen.getByTestId("map-detail-panel-source-path");
    expect(subline).toHaveTextContent("src/foo/bar-baz.ts");
  });

  it("does not render the subline when sourceTitle is missing (null/undefined)", () => {
    renderPanel(undefined, undefined, {});
    expect(
      screen.queryByTestId("map-detail-panel-source-path"),
    ).not.toBeInTheDocument();
  });

  it("does not render the subline when sourceTitle equals title (duplicate)", () => {
    renderPanel(undefined, undefined, { sourceTitle: "Views" });
    expect(
      screen.queryByTestId("map-detail-panel-source-path"),
    ).not.toBeInTheDocument();
  });
});

// Slice C (the dev/non-dev mode toggle) — non-dev (plain) mode treats the
// handoff-copy action and the raw path subline as developer chrome and hides them.
// The default (omitted) is true for both, keeping the existing render (zero regression).
describe("OntologyMapDetailPanel: showHandoff and showSourcePath", () => {
  it("renders the copy-handoff tile by default when showHandoff is omitted", () => {
    renderPanel();
    expect(screen.getByTestId("map-detail-panel-action-handoff")).toBeInTheDocument();
  });

  it("does not render the copy-handoff tile when showHandoff=false", () => {
    renderPanel(undefined, undefined, { showHandoff: false });
    expect(
      screen.queryByTestId("map-detail-panel-action-handoff"),
    ).not.toBeInTheDocument();
  });

  it("renders the source path subline by default when showSourcePath is omitted (and sourceTitle exists)", () => {
    renderPanel(undefined, undefined, { sourceTitle: "src/foo/bar-baz.ts" });
    expect(screen.getByTestId("map-detail-panel-source-path")).toBeInTheDocument();
  });

  it("does not render the source path subline when showSourcePath=false even if sourceTitle exists", () => {
    renderPanel(undefined, undefined, {
      sourceTitle: "src/foo/bar-baz.ts",
      showSourcePath: false,
    });
    expect(
      screen.queryByTestId("map-detail-panel-source-path"),
    ).not.toBeInTheDocument();
  });
});

describe("OntologyMapDetailPanel — M-2 typed containment split", () => {
  it("renders a holds (contains) group with the parent's children, not folded into the depends-on group", () => {
    render(
      <OntologyMapDetailPanel
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

  it("omits the holds group for a leaf node (contains 0)", () => {
    renderPanel();
    expect(document.querySelector("[data-datasheet-group='contains']")).toBeNull();
    expect(document.querySelector("[data-datasheet-group-total='contains']")).toBeNull();
  });
});

describe("OntologyMapDetailPanel — group count chips", () => {
  it("gives each relation group header an indigo count chip (not the old metric ink)", () => {
    renderPanel();
    const total = document.querySelector("[data-datasheet-group-total='usedBy']");
    expect(total).not.toBeNull();
    expect(total!.className).toContain("--map-panel-count-text");
    expect(total!.textContent).toBe("1");
  });
});

describe("OntologyMapDetailPanel: connections of a node that has only a parent", () => {
  const parentRow = {
    id: "capability:frontmatter-to-ontology",
    title: "Frontmatter → Ontology Stub",
    kind: "capability",
    relationType: "contains",
    direction: "incoming" as const,
  };

  function renderParentOnly(onSelectConnection: (id: string) => void = () => {}) {
    render(
      <OntologyMapDetailPanel
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
      />,
    );
  }

  it("draws the belongs-to group with the parent row, clickable like any other connection", () => {
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

  it("keeps the four rendered group totals independently readable", () => {
    render(
      <OntologyMapDetailPanel
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
      />,
    );
    const groupTotals = [...document.querySelectorAll("[data-datasheet-group-total]")]
      .filter((el) => el.getAttribute("data-datasheet-group-total") !== "evidence")
      .map((el) => Number(el.textContent));
    expect(groupTotals.reduce((a, b) => a + b, 0)).toBe(38);
    expect(screen.queryByTestId("map-detail-panel-stats")).not.toBeInTheDocument();
  });
});

describe("OntologyMapDetailPanel: empty state for unrecorded relations (0 vs unrecorded disambiguation)", () => {
  it("renders the honest 'no relations recorded yet' empty-state when a node has zero recorded relations", () => {
    // A node like global-search, widely used in the code but with no relation yet
    // declared in the vault frontmatter — the UI has to say honestly that
    // 「Uses 0」 means "not recorded yet", not "no dependencies".
    render(
      <OntologyMapDetailPanel
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
      />,
    );
    expect(screen.getByText(labels.noConnections)).toBeInTheDocument();
    // the copy must carry the "recorded / declared" framing, not a bare "no connections"
    expect(labels.noConnections).toMatch(/recorded|declared/i);
  });
});

describe("OntologyMapDetailPanel: the owning domain as a first-class fact", () => {
  it("renders a domain fact with the name in the header when the node has an owning domain", () => {
    renderPanel(undefined, undefined, {
      domain: { id: "domains/ai-agent-partner", title: "AI Agent Partner" },
    });
    const fact = screen.getByTestId("map-detail-panel-domain");
    expect(fact).toHaveTextContent("domain");
    expect(fact).toHaveTextContent("AI Agent Partner");
  });

  it("hides the domain fact when the node has no owning domain", () => {
    renderPanel(undefined, undefined, { domain: null });
    expect(screen.queryByTestId("map-detail-panel-domain")).not.toBeInTheDocument();
  });

  it("focuses the domain via onSelectConnection when the domain fact is clicked", () => {
    const onSelectConnection = vi.fn();
    renderPanel(undefined, undefined, {
      domain: { id: "domains/ai-agent-partner", title: "AI Agent Partner" },
      onSelectConnection,
    });
    fireEvent.click(screen.getByTestId("map-detail-panel-domain"));
    expect(onSelectConnection).toHaveBeenCalledWith("domains/ai-agent-partner");
  });
});

describe("OntologyMapDetailPanel — W2-A action row", () => {
  it("keeps one primary agent action and moves the rest behind Edit and More menus", () => {
    const onAskAgent = vi.fn();
    renderPanel(undefined, undefined, {
      onAskAgent,
      onEditRelations: vi.fn(),
      onCreateLinked: vi.fn(),
      onEnterRealm: vi.fn(),
    });

    const actions = screen.getByTestId("map-detail-panel-actions");
    expect(actions.querySelectorAll('[data-action-role="primary"]')).toHaveLength(1);
    expect(screen.queryByTestId("map-detail-panel-action-path")).not.toBeInTheDocument();
    expect(screen.getByTestId("map-detail-panel-edit-menu-trigger")).toBeInTheDocument();
    expect(screen.getByTestId("map-detail-panel-more-menu-trigger")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("map-detail-panel-action-ask-agent"));
    expect(onAskAgent).toHaveBeenCalledTimes(1);
  });

  it("reveals edit actions in one anchored menu", () => {
    const onEditRelations = vi.fn();
    const onCreateLinked = vi.fn();
    renderPanel(undefined, undefined, { onEditRelations, onCreateLinked });

    fireEvent.click(screen.getByTestId("map-detail-panel-edit-menu-trigger"));
    const menu = screen.getByTestId("map-detail-panel-edit-menu");
    expect(menu).toHaveAttribute("role", "menu");
    fireEvent.click(screen.getByTestId("map-detail-panel-action-create-linked"));
    expect(onCreateLinked).toHaveBeenCalledTimes(1);
  });

  it("uses handoff copy as the primary action when the in-app agent is unavailable", () => {
    const onCopyHandoff = vi.fn();
    renderPanel(undefined, undefined, { onCopyHandoff });
    const handoff = screen.getByTestId("map-detail-panel-action-handoff");
    expect(handoff).toHaveAttribute("data-action-role", "primary");
    fireEvent.click(handoff);
    expect(onCopyHandoff).toHaveBeenCalledWith("node: domains/views");
  });

  it("suppresses the competing filled action while a guided presentation owns the next step", () => {
    renderPanel(undefined, undefined, {
      onAskAgent: vi.fn(),
      onEditRelations: vi.fn(),
      suppressPrimaryAction: true,
    });

    const actions = screen.getByTestId("map-detail-panel-actions");
    expect(actions).toHaveAttribute("data-primary-action-suppressed", "true");
    expect(actions.querySelectorAll('[data-action-role="primary"]')).toHaveLength(0);
    expect(screen.queryByTestId("map-detail-panel-action-ask-agent")).toBeNull();
    expect(screen.queryByTestId("map-detail-panel-action-handoff")).toBeNull();
    expect(screen.getByTestId("map-detail-panel-edit-menu-trigger")).toBeInTheDocument();
  });

  it("links the document menu item to the document href when the node has a backing doc", () => {
    renderPanel(undefined, undefined, { documentHref: "/docs/domains/views" });
    fireEvent.click(screen.getByTestId("map-detail-panel-more-menu-trigger"));
    const link = screen.getByTestId("map-detail-panel-action-document");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", expect.stringContaining("/docs/domains/views"));
  });

  it("hides the document tile when the node has no sourceSlug or document href (no dead affordance)", () => {
    renderPanel(undefined, undefined, { documentHref: null });
    expect(
      screen.queryByTestId("map-detail-panel-action-document"),
    ).not.toBeInTheDocument();
  });

  it("links the edit-relations menu item to the studio deep link", () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("map-detail-panel-edit-menu-trigger"));
    const link = screen.getByTestId("map-detail-panel-action-edit");
    expect(link).toHaveAttribute("href", expect.stringContaining("/ontology/studio/"));
  });

  it("keeps edit-relations in place when a contextual editor callback is available", () => {
    const onEditRelations = vi.fn();
    renderPanel(undefined, undefined, { onEditRelations });
    fireEvent.click(screen.getByTestId("map-detail-panel-edit-menu-trigger"));
    const action = screen.getByTestId("map-detail-panel-action-edit");
    expect(action.tagName).toBe("BUTTON");
    fireEvent.click(action);
    expect(onEditRelations).toHaveBeenCalledTimes(1);
  });

  it("copies the handoff text when the copy-handoff tile is clicked", () => {
    const onCopyHandoff = vi.fn();
    renderPanel(undefined, undefined, { onCopyHandoff });
    fireEvent.click(screen.getByTestId("map-detail-panel-action-handoff"));
    expect(onCopyHandoff).toHaveBeenCalledWith("node: domains/views");
  });

  it("no longer renders a duplicate handoff button in the footer", () => {
    renderPanel();
    expect(
      screen.queryByTestId("map-detail-panel-handoff"),
    ).not.toBeInTheDocument();
  });

  // S2 part 3 — a long 「container」 defaults to the path-prefix summary, with 「View All」 for the list.
  it("with more than 15 contained items it shows a path-prefix summary and expands the list from the show-all button", () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      id: `element:cli/src/commands/c${i}`,
      title: `cmd ${i}`,
      kind: "element",
      relationType: "contains",
      direction: "outgoing" as const,
    }));
    render(
      <OntologyMapDetailPanel
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
      />,
    );
    // Default: the summary is visible and the individual row preview is hidden.
    expect(screen.getByTestId("map-contains-summary")).toBeInTheDocument();
    expect(screen.getByText("cli/src/commands")).toBeInTheDocument();
    expect(screen.getByText("48")).toBeInTheDocument();
    expect(screen.getByText(labels.containsOtherGroup)).toBeInTheDocument();
    expect(screen.queryByText("cmd 0")).not.toBeInTheDocument();

    // The 「View All」 toggle → the list appears.
    fireEvent.click(screen.getByTestId("map-contains-summary-toggle"));
    expect(screen.queryByTestId("map-contains-summary")).not.toBeInTheDocument();
    expect(screen.getByText("cmd 0")).toBeInTheDocument();
  });

  it("with 15 or fewer contained items it uses the existing list without a summary", () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `capability:c${i}`,
      title: `cap ${i}`,
      kind: "capability",
      relationType: "contains",
      direction: "outgoing" as const,
    }));
    render(
      <OntologyMapDetailPanel
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
      />,
    );
    expect(screen.queryByTestId("map-contains-summary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("map-contains-summary-toggle")).not.toBeInTheDocument();
    expect(screen.getByText("cap 0")).toBeInTheDocument();
  });

  // B4 (H1) — when the summary collapses into one 「Other」 lump (usable=false), the
  // summary and toggle are hidden even past the threshold and the individual list
  // renders instead (avoiding zero information).
  it("with more than 15 contained items it still falls back to the list when the summary has usable=false", () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      id: `element:leaf${i}`,
      title: `leaf ${i}`,
      kind: "element",
      relationType: "contains",
      direction: "outgoing" as const,
    }));
    render(
      <OntologyMapDetailPanel
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
      />,
    );
    expect(screen.queryByTestId("map-contains-summary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("map-contains-summary-toggle")).not.toBeInTheDocument();
    expect(screen.getByText("leaf 0")).toBeInTheDocument();
  });
});

describe("OntologyMapDetailPanel — last-edit provenance", () => {
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

describe("OntologyMapDetailPanel: redesigned structure from the mockup", () => {
  it("renders the node name as the header hero (title2/650, truncatable)", () => {
    renderPanel();
    const name = screen.getByRole("heading", { level: 2 });
    expect(name).toHaveTextContent("Views");
    expect(name.className).toContain("text-title");
    expect(name.querySelector("span")?.className).toContain("truncate");
  });

  it("renders a quiet kind badge with the localized kind word next to the name", () => {
    renderPanel();
    const panel = screen.getByTestId("map-detail-panel");
    // kindLabel appears in the header badge (fixture kind = 'domain' → 'Domain')
    expect(panel.textContent).toContain(labels.kindLabel);
    // the header badge carries the kind-badge surface token
    const badge = Array.from(panel.querySelectorAll("span")).find((s) =>
      s.className.includes("--map-panel-kind-badge-surface"),
    );
    expect(badge).toBeTruthy();
    expect(badge!.textContent).toContain(labels.kindLabel);
  });

  it("no longer renders the floating power-state dot", () => {
    renderPanel();
    expect(
      screen.getByTestId("map-detail-panel").querySelector("[data-power-state]"),
    ).toBeNull();
  });

  it("renders each relation group header with an underline divider + directional glyph + count chip", () => {
    render(
      <OntologyMapDetailPanel
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
      />,
    );
    const group = document.querySelector("[data-datasheet-group='contains']");
    expect(group).not.toBeNull();
    // header underline token present
    const header = group!.querySelector("[class*='--map-panel-group-underline']");
    expect(header).not.toBeNull();
    // count chip carries the indigo count token
    const chip = group!.querySelector("[data-datasheet-group-total='contains']");
    expect(chip!.className).toContain("--map-panel-count-text");
    // each row carries the canvas kind glyph (data-kind-glyph), no right-aligned kind word
    const glyphs = group!.querySelectorAll("[data-kind-glyph]");
    expect(glyphs.length).toBe(2);
  });

  it("renders the relation zone with the enlarged between-group gap token (28px rhythm)", () => {
    render(
      <OntologyMapDetailPanel
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
      />,
    );
    const zone = document
      .querySelector("[data-datasheet-group='contains']")!
      .closest("div[class*='--map-panel-zone-gap']");
    expect(zone).not.toBeNull();
  });

  it("renders the footer '전체 상세' as the single indigo-filled primary", () => {
    renderPanel(vi.fn());
    const primary = screen.getByTestId("map-detail-panel-open-full-detail");
    expect(primary.className).toContain("--map-panel-primary-surface");
    expect(primary.className).toContain("--map-panel-primary-text");
  });

  it("renders the domain chip as an indigo-tinted navigable chip with no trailing arrow", () => {
    renderPanel(undefined, undefined, {
      domain: { id: "domains/ai-agent-partner", title: "AI Agent Partner" },
    });
    const chip = screen.getByTestId("map-detail-panel-domain");
    expect(chip.className).toContain("--map-panel-domain-surface");
    expect(chip).toHaveAttribute("aria-label", expect.stringContaining("AI Agent Partner"));
    expect(chip.querySelector("svg")).toBeNull();
  });

  it("closing does not vanish in one frame, and the exit is reported once when it finishes", async () => {
    const onExited = vi.fn();
    const panel = (open: boolean) => (
      <OntologyMapDetailPanel
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
      />
    );

    const { rerender } = render(panel(true));
    expect(screen.getByTestId("map-detail-panel")).toBeInTheDocument();

    rerender(panel(false));
    // It is *mid*-exit — still on screen, and unpressable for that frame.
    expect(screen.getByTestId("map-detail-panel")).toBeInTheDocument();
    expect(onExited, "calling during the exit makes the positioner disappear mid-animation").not.toHaveBeenCalled();

    await waitFor(() => expect(onExited).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("map-detail-panel")).not.toBeInTheDocument();
  });
});

describe("OntologyMapDetailPanel: the channel from row hover out to the map", () => {
  const childRow = {
    id: "capability:cart",
    title: "장바구니",
    kind: "capability",
    relationType: "contains",
    direction: "outgoing" as const,
  };

  it("a relation row emits the **canvas node id** and folds back to null when the cursor leaves", () => {
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

  it("an evidence document row emits the **vault slug**, a different namespace from the canvas id", () => {
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

  it("the domain chip uses the same channel, since the same affordance cannot be the only one that does not react", () => {
    const onHoverConnection = vi.fn();
    renderPanel(undefined, undefined, {
      onHoverConnection,
      domain: { id: "domain:order", title: "주문" },
    });

    const chip = screen.getByTestId("map-detail-panel-domain");
    fireEvent.pointerEnter(chip);
    expect(onHoverConnection).toHaveBeenCalledWith("domain:order");
    fireEvent.pointerLeave(chip);
    expect(onHoverConnection).toHaveBeenLastCalledWith(null);
  });

  it("the highlight clears when the panel disappears, because pressing a row never delivers pointerleave", () => {
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
