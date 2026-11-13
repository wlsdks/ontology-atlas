import { fireEvent, render as renderUi, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectSourceView } from "@/shared/lib/project-source/project-source-receipt";
import { OntologyMapDetailPanel } from "./OntologyMapDetailPanel";
import type { ConceptReview, OntologyMapDetailPanelProps } from "./detail-panel/types";
import enMessages from "../../../../messages/en.json";

/** The zones read their own message namespaces. */
function render(ui: React.ReactElement) {
  return renderUi(ui, {
    wrapper: ({ children }) => (
      <NextIntlClientProvider locale="en" messages={enMessages}>
        {children}
      </NextIntlClientProvider>
    ),
  });
}

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

const review = enMessages.vaultWidgets.parts.sidebar.review;

const labels = {
  kindLabel: "Domain",
  editConflictMessage: "This document changed elsewhere — check before you overwrite",
  summaryFreshnessPrefix: "Description lags membership",
  summaryFreshnessLag: "1d",
  summaryFreshnessAction: "Review description",
  summaryHistoryUnavailable: "History could not be compared",
  noConnections: "no relations recorded yet · relations are declared in frontmatter",
  domainLinks: (count: number) => `${count} links with this domain`,
  close: "Close",
  openFullDetail: "Full detail",
  actionsGroupLabel: "Node actions",
  actionDocument: "Document",
  actionEditRelations: "Edit relations",
  actionCreateLinked: "Create linked",
  actionCopyHandoff: "Copy handoff",
  actionAskAgent: "Ask agent",
  actionEditMenu: "Edit",
  actionMore: "More actions",
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
  sourceBusy: "Measuring code evidence",
};

const FILLED = "--map-panel-primary-surface";
const filledControls = () =>
  [...screen.getByTestId("map-detail-panel").querySelectorAll("a, button")].filter((el) => el.className.includes(FILLED));
const noReview: ConceptReview = { raised: null, changedSinceReview: false, unverifiable: false, reviewedOn: null };

function renderPanel(
  onOpenFullDetail?: () => void,
  overrides: {
    documentHref?: string | null;
    onCopyHandoff?: () => void;
    owner?: { id: string; title: string } | null;
    definition?: string | null;
    review?: ConceptReview;
    powered?: boolean;
    onSelectConnection?: (id: string) => void;
    onHoverConnection?: (id: string | null) => void;
    onHoverEvidence?: (slug: string | null) => void;
    showHandoff?: boolean;
    mtimeConflict?: boolean;
    kind?: string;
    projectSource?: ProjectSourceView | null;
    onProjectSourceAction?: () => void | Promise<void>;
    onAskAgent?: () => void;
    meaningReview?: { label: string; onOpen: () => void };
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
    reach?: OntologyMapDetailPanelProps["reach"];
    projectSourceLoading?: boolean;
    summaryHistoryUnavailable?: boolean;
    summaryStaleness?: { behindByDays: number } | null;
  } = {},
) {
  return render(panelElement(onOpenFullDetail, overrides));
}

function panelElement(
  onOpenFullDetail: (() => void) | undefined,
  overrides: Parameters<typeof renderPanel>[1] = {},
) {
  return (
    <OntologyMapDetailPanel
      open
      nodeId="domain:views"
      slug="domains/views"
      title="Views"
      kind={overrides.kind ?? "domain"}
      owner={overrides.owner !== undefined ? overrides.owner : null}
      definition={overrides.definition !== undefined ? overrides.definition : "Views draw what the vault holds."}
      review={overrides.review}
      powered={overrides.powered ?? false}
      groups={overrides.groups ?? {
        contains: { rows: [], total: 0 },
        usedBy: { rows: [], total: 1 },
        dependsOn: { rows: [], total: 2 },
        belongsTo: { rows: [], total: 0 },
        related: { rows: [], total: 0 },
      }}
      reach={overrides.reach}
      updatedAtLabel={overrides.updatedAtLabel}
      handoffText="node: domains/views"
      documentHref={
        overrides.documentHref !== undefined
          ? overrides.documentHref
          : "/docs/domains/views"
      }
      meaningEditHref="/ontology/studio/?node=domains%2Fviews"
      labels={labels}
      mtimeConflict={overrides.mtimeConflict ?? false}
      summaryHistoryUnavailable={overrides.summaryHistoryUnavailable}
      summaryStaleness={overrides.summaryStaleness}
      onSelectConnection={overrides.onSelectConnection ?? (() => {})}
      onHoverConnection={overrides.onHoverConnection}
      onHoverEvidence={overrides.onHoverEvidence}
      onCopyHandoff={overrides.onCopyHandoff ?? (() => {})}
      onAskAgent={overrides.onAskAgent}
      meaningReview={overrides.meaningReview}
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
    />
  );
}

describe("OntologyMapDetailPanel history availability", () => {
  it("shows incomplete history without a stale verdict and clears it after a completed comparison", () => {
    const props = { summaryHistoryUnavailable: true, summaryStaleness: { behindByDays: 1 } };
    const { rerender } = renderPanel(undefined, props);
    expect(screen.getByTestId("summary-history-unavailable")).toHaveTextContent(labels.summaryHistoryUnavailable);
    expect(screen.queryByTestId("summary-freshness-row")).not.toBeInTheDocument();
    rerender(panelElement(undefined, { ...props, summaryHistoryUnavailable: false }));
    expect(screen.queryByTestId("summary-history-unavailable")).not.toBeInTheDocument();
    expect(screen.getByTestId("summary-freshness-row")).toHaveTextContent(labels.summaryFreshnessLag);
    expect(screen.getByTestId("map-detail-panel-judgment")).toContainElement(screen.getByTestId("summary-freshness-row"));
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

    renderPanel(vi.fn(), { kind: "project", projectSource });

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
    expect(screen.getByTestId("map-project-source-record")).toHaveAttribute("aria-expanded", "false");
    expect(rail).not.toHaveTextContent("Measured today");
    fireEvent.click(screen.getByTestId("map-project-source-record"));
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

    renderPanel(undefined, {
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

  it("a current project holds no filled control and keeps its source action quiet beside the status", () => {
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

    renderPanel(vi.fn(), {
      kind: "project",
      projectSource,
      onProjectSourceAction: vi.fn(),
      onAskAgent: vi.fn(),
      onEnterRealm: vi.fn(),
    });

    expect(screen.getByTestId("map-detail-panel")).toHaveAttribute("data-panel-emphasis", "none");
    expect(filledControls()).toHaveLength(0);
    expect(screen.getByTestId("map-detail-panel-edit-menu-trigger")).toBeInTheDocument();
    expect(screen.getByTestId("map-detail-panel-more-menu-trigger")).toBeInTheDocument();
    expect(screen.getByTestId("map-project-source-receipt")).toContainElement(screen.getByTestId("map-project-source-action"));
    expect(screen.getByTestId("map-detail-panel-footer")).not.toContainElement(screen.getByTestId("map-project-source-action"));
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

    renderPanel(vi.fn(), {
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

    expect(screen.getByTestId("map-detail-panel-open-full-detail").className).not.toContain(FILLED);
    expect(screen.getByTestId("map-detail-panel")).toHaveAttribute("data-panel-emphasis", "project-source");
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

    renderPanel(vi.fn(), {
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

    renderPanel(vi.fn(), {
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

    renderPanel(vi.fn(), {
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

    renderPanel(vi.fn(), {
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

    renderPanel(vi.fn(), {
      kind: "project",
      projectSource,
      onProjectSourceAction: vi.fn(),
    });

    expect(screen.queryByTestId("map-project-source-remedy")).not.toBeInTheDocument();
    // The action does not disappear; it stays quiet beside the status line.
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

    renderPanel(vi.fn(), { kind: "domain", projectSource });

    expect(screen.queryByTestId("map-project-source-receipt")).not.toBeInTheDocument();
    expect(screen.getByTestId("map-detail-panel")).toHaveAttribute("data-panel-emphasis", "none");
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

    renderPanel(undefined, { kind: "project", projectSource });

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

    renderPanel(undefined, {
      kind: "project",
      projectSource,
      powered: true,
      updatedAtLabel: "changed 3d ago",
    });

    expect(screen.getByTestId("map-datasheet-updated-at")).toHaveTextContent("changed 3d ago");
    expect(screen.getByTestId("map-datasheet-updated-at")).not.toHaveTextContent("Measured today");
    fireEvent.click(screen.getByTestId("map-project-source-record"));
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

    renderPanel(undefined, {
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
    renderPanel(vi.fn(), {
      kind: "project",
      projectSource: null,
      projectSourceLoading: true,
      powered: true,
      updatedAtLabel: "changed today",
    });

    const pending = screen.getByTestId("map-project-source-pending");
    expect(pending).toHaveAttribute("aria-busy", "true");
    expect(pending).toHaveAttribute("aria-live", "polite");
    expect(pending).not.toHaveAttribute("data-source-action");
    expect(screen.getByTestId("map-project-source-heading")).toHaveTextContent("Code evidence");
    expect(screen.queryByTestId("map-project-source-receipt")).not.toBeInTheDocument();
    // Everything else is already the project's.
    expect(screen.getByTestId("map-datasheet-updated-at")).toHaveTextContent("changed today");
    expect(filledControls()).toHaveLength(0);
  });

  it("says it is reading only once the read outlives a frame's worth of waiting", async () => {
    renderPanel(vi.fn(), {
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
    const { rerender } = renderPanel(vi.fn(), {
      kind: "project",
      projectSource: null,
      projectSourceLoading: true,
    });
    const slot = screen.getByTestId("map-project-source-pending");

    rerender(panelElement(vi.fn(), {
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
    renderPanel(vi.fn(), {
      kind: "project",
      projectSource: null,
      projectSourceLoading: false,
    });

    expect(screen.queryByTestId("map-project-source-pending")).not.toBeInTheDocument();
    expect(screen.queryByTestId("map-project-source-receipt")).not.toBeInTheDocument();
    expect(screen.getByTestId("map-detail-panel-slug")).toBeInTheDocument();
    expect(filledControls()).toHaveLength(0);
  });

  it("never holds a receipt's place for a kind that has none", () => {
    renderPanel(vi.fn(), { kind: "domain", projectSourceLoading: true });

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

describe("OntologyMapDetailPanel — full detail", () => {
  it("opens full detail from a quiet footer control", () => {
    const onOpenFullDetail = vi.fn();
    renderPanel(onOpenFullDetail);
    const control = screen.getByTestId("map-detail-panel-open-full-detail");
    expect(control.className).not.toContain(FILLED);
    fireEvent.click(control);
    expect(onOpenFullDetail).toHaveBeenCalledTimes(1);
  });

  it("hides the control when onOpenFullDetail is omitted", () => {
    renderPanel(undefined);
    expect(screen.queryByTestId("map-detail-panel-open-full-detail")).not.toBeInTheDocument();
  });
});

describe("OntologyMapDetailPanel: footer slug", () => {
  it("shows only the slug's last segment in visible text, with the full slug as a hover title", () => {
    render(
      <OntologyMapDetailPanel
        open
        nodeId="capability:mcp-server"
        slug="ontology/capabilities/mcp-server"
        title="MCP Server"
        kind="capability"
        owner={null}
        definition={null}
        powered={false}
        groups={{
          contains: { rows: [], total: 0 },
          usedBy: { rows: [], total: 0 },
          dependsOn: { rows: [], total: 0 },
          belongsTo: { rows: [], total: 0 },
          related: { rows: [], total: 0 },
        }}
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

  it("keeps the slug for a project, the handle an agent takes", () => {
    renderPanel(undefined, { kind: "project", projectSourceLoading: true });
    expect(screen.getByTestId("map-detail-panel-slug")).toHaveTextContent("views");
  });
});

describe("OntologyMapDetailPanel: header", () => {
  it("reads kind, direct owner and one time fact on one meta line above the name", () => {
    renderPanel(undefined, {
      kind: "capability",
      owner: { id: "domain:orders", title: "Orders" },
      powered: true,
      updatedAtLabel: "changed today",
    });
    const meta = screen.getByTestId("map-detail-panel-meta");
    expect(meta).toHaveTextContent(/^Domain·Orders·changed today$/);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Views");
  });

  it("leaves a change outside the recent window off the header", () => {
    renderPanel(undefined, { powered: false, updatedAtLabel: "changed 3mo ago" });
    expect(screen.queryByTestId("map-datasheet-updated-at")).not.toBeInTheDocument();
  });

  it("prefers a confirmation that still holds over the change label", () => {
    renderPanel(undefined, {
      powered: true,
      updatedAtLabel: "changed today",
      review: { ...noReview, reviewedOn: "2026-10-02" },
    });
    expect(screen.getByTestId("map-detail-panel-reviewed-on")).toHaveTextContent(
      review.reviewedOn.replace("{date}", "2026-10-02"),
    );
    expect(screen.queryByTestId("map-datasheet-updated-at")).not.toBeInTheDocument();
  });

  it("selects the owner when it is pressed and points the map at it while hovered", () => {
    const onSelectConnection = vi.fn();
    const onHoverConnection = vi.fn();
    renderPanel(undefined, {
      kind: "element",
      owner: { id: "capability:checkout", title: "Checkout" },
      onSelectConnection,
      onHoverConnection,
    });
    const owner = screen.getByTestId("map-detail-panel-owner");
    fireEvent.pointerEnter(owner);
    expect(onHoverConnection).toHaveBeenCalledWith("capability:checkout");
    fireEvent.pointerLeave(owner);
    expect(onHoverConnection).toHaveBeenLastCalledWith(null);
    fireEvent.click(owner);
    expect(onSelectConnection).toHaveBeenCalledWith("capability:checkout");
  });

  it("draws no owner for a domain", () => {
    renderPanel();
    expect(screen.queryByTestId("map-detail-panel-owner")).not.toBeInTheDocument();
  });
});

describe("OntologyMapDetailPanel: definition", () => {
  it("shows the definition as written, with no label", () => {
    renderPanel(undefined, { definition: "Walks a shopper through checkout." });
    const definition = screen.getByTestId("map-detail-panel-definition");
    expect(definition).toHaveTextContent(/^Walks a shopper through checkout\.$/);
    expect(definition).toHaveAttribute("data-definition", "whole");
    expect(definition).not.toHaveAttribute("role");
  });

  it("reads a wikilink in the definition as its words, not its markup", () => {
    renderPanel(undefined, { definition: "This document explains [[capabilities/checkout|Checkout]], [[elements/idempotency-guard]]." });
    expect(screen.getByTestId("map-detail-panel-definition")).toHaveTextContent(/^This document explains Checkout, idempotency-guard\.$/);
  });

  it("says quietly that a definition is missing, without a judgment block", () => {
    renderPanel(undefined, { definition: null });
    expect(screen.getByTestId("map-detail-panel-definition")).toHaveTextContent(
      enMessages.docsVault.frontmatterBlock.validatorIssues.definitionMissing,
    );
    expect(screen.queryByTestId("map-detail-panel-judgment")).not.toBeInTheDocument();
    expect(screen.getByTestId("map-detail-panel")).toHaveAttribute("data-panel-emphasis", "none");
  });
});

describe("OntologyMapDetailPanel: judgment and the one emphasised thing", () => {
  const reasonedGroups = (reasons: (string | undefined)[]): OntologyMapDetailPanelProps["groups"] => {
    const rows = reasons.map((reason, i) => ({
      id: `capability:need-${i}`,
      title: `need-${i}`,
      kind: "capability",
      relationType: "depends_on",
      direction: "outgoing" as const,
      ...(reason ? { reason } : {}),
    }));
    return {
      contains: { rows: [], total: 0 },
      usedBy: { rows: [], total: 0 },
      dependsOn: { rows, total: rows.length, allRows: rows },
      belongsTo: { rows: [], total: 0 },
      related: { rows: [], total: 0 },
    };
  };
  const reachOf = (count: number): OntologyMapDetailPanelProps["reach"] => ({
    needs: Array.from({ length: count }, (_, i) => ({
      id: `capability:need-${i}`,
      label: `need-${i}`,
      kind: "capability",
      line: "needs" as const,
      links: null,
      neededBy: 0,
    })),
    neededBy: [],
    other: [],
  });
  const meaningReview = { label: "Meaning review", onOpen: vi.fn() };

  it("a calm concept holds no filled control and no judgment block", () => {
    renderPanel(vi.fn(), {
      kind: "capability",
      review: noReview,
      meaningReview,
      onAskAgent: vi.fn(),
      groups: reasonedGroups(["checkout needs it"]),
      reach: reachOf(1),
    });
    expect(screen.getByTestId("map-detail-panel")).toHaveAttribute("data-panel-emphasis", "none");
    expect(filledControls()).toHaveLength(0);
    expect(screen.queryByTestId("map-detail-panel-judgment")).not.toBeInTheDocument();
    expect(screen.getByTestId("map-detail-panel").textContent).not.toMatch(/review|checked/i);
  });

  it("a question raised for a person shows its note word for word and opens the document", () => {
    const note = "The reserve ratio differs per contract, so code alone cannot settle it. Finance decides.";
    renderPanel(undefined, { kind: "capability", review: { ...noReview, raised: { note } }, documentHref: "/docs/payouts" });
    const block = screen.getByTestId("map-detail-panel-judgment");
    expect(block).toHaveAttribute("data-judgment-first", "raised");
    expect(block).toHaveTextContent(review.docChipRaised);
    expect(screen.getByTestId("map-detail-panel-judgment-note").textContent).toBe(note);
    const action = screen.getByTestId("map-detail-panel-judgment-action");
    expect(action).toHaveAttribute("href", "/docs/payouts");
    expect(action).toHaveTextContent(labels.actionDocument);
    expect(screen.getByTestId("map-detail-panel")).toHaveAttribute("data-panel-emphasis", "open-document");
    expect(filledControls()).toEqual([action]);
  });

  it("a confirmation the file outgrew opens the document", () => {
    renderPanel(undefined, { kind: "capability", review: { ...noReview, changedSinceReview: true } });
    expect(screen.getByTestId("map-detail-panel-judgment")).toHaveTextContent(review.changedPlain);
    expect(screen.getByTestId("map-detail-panel")).toHaveAttribute("data-panel-emphasis", "open-document");
    expect(filledControls()).toHaveLength(1);
  });

  it("an unreadable file is a warning with no action", () => {
    renderPanel(undefined, { kind: "capability", review: { ...noReview, unverifiable: true } });
    expect(screen.getByTestId("map-detail-panel-judgment")).toHaveTextContent(review.unverifiablePlain);
    expect(screen.queryByTestId("map-detail-panel-judgment-action")).not.toBeInTheDocument();
    expect(screen.getByTestId("map-detail-panel")).toHaveAttribute("data-panel-emphasis", "judgment");
    expect(filledControls()).toHaveLength(0);
  });

  it("connections without a reason make meaning review the filled action", () => {
    const onOpen = vi.fn();
    renderPanel(undefined, {
      kind: "capability",
      meaningReview: { label: "Meaning review", onOpen },
      groups: reasonedGroups(["first is explained", undefined, undefined]),
      reach: reachOf(3),
    });
    expect(screen.getByTestId("map-detail-panel-judgment")).toHaveTextContent("2 connections have no reason written");
    const action = screen.getByTestId("map-detail-panel-judgment-action");
    expect(screen.getByTestId("map-detail-panel")).toHaveAttribute("data-panel-emphasis", "meaning-review");
    expect(filledControls()).toEqual([action]);
    fireEvent.click(action);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("folds every later fact under one line, and only the first carries the filled action", () => {
    renderPanel(undefined, {
      kind: "capability",
      review: { ...noReview, raised: { note: "Decide the ratio." } },
      mtimeConflict: true,
    });
    const block = screen.getByTestId("map-detail-panel-judgment");
    expect(block).toHaveAttribute("data-judgment-count", "2");
    expect(block).not.toHaveTextContent(labels.editConflictMessage);
    fireEvent.click(screen.getByTestId("map-detail-panel-judgment-more"));
    expect(block.querySelector('[data-judgment-item="edit-conflict"]')).toHaveTextContent(labels.editConflictMessage);
    expect(filledControls()).toHaveLength(1);
  });

  it("an edit conflict alone is a warning line in the judgment block", () => {
    renderPanel(undefined, { mtimeConflict: true });
    expect(screen.getByTestId("map-detail-panel-judgment")).toHaveAttribute("data-judgment-first", "edit-conflict");
    expect(screen.getByTestId("map-detail-panel")).toHaveAttribute("data-panel-emphasis", "judgment");
  });

  it("a document's one filled control is opening it, and it has no edit menu or full-detail step", () => {
    renderPanel(vi.fn(), { kind: "document", documentHref: "/docs/adr-002" });
    const open = screen.getByTestId("map-detail-panel-open-document");
    expect(open).toHaveAttribute("href", "/docs/adr-002");
    expect(screen.getByTestId("map-detail-panel")).toHaveAttribute("data-panel-emphasis", "open-document");
    expect(filledControls()).toEqual([open]);
    expect(screen.queryByTestId("map-detail-panel-edit-menu-trigger")).not.toBeInTheDocument();
    expect(screen.queryByTestId("map-detail-panel-open-full-detail")).not.toBeInTheDocument();
  });

  it("a document with a raised question gives the filled control to the judgment, not the footer", () => {
    renderPanel(undefined, { kind: "document", documentHref: "/docs/adr-002", review: { ...noReview, raised: { note: null } } });
    expect(screen.getByTestId("map-detail-panel-open-document").className).not.toContain(FILLED);
    expect(filledControls()).toEqual([screen.getByTestId("map-detail-panel-judgment-action")]);
  });

  it("quiets the filled action while a guided presentation owns the next step", () => {
    renderPanel(undefined, {
      kind: "capability",
      review: { ...noReview, raised: { note: null } },
      suppressPrimaryAction: true,
    });
    const panel = screen.getByTestId("map-detail-panel");
    expect(panel).toHaveAttribute("data-primary-action-suppressed", "true");
    expect(panel).toHaveAttribute("data-panel-emphasis", "judgment");
    expect(filledControls()).toHaveLength(0);
  });
});

describe("OntologyMapDetailPanel — footer menus", () => {
  it("puts meaning review first in the more menu, then the agent handoff", () => {
    const onOpen = vi.fn();
    renderPanel(undefined, { meaningReview: { label: "Meaning review", onOpen }, onAskAgent: vi.fn() });
    fireEvent.click(screen.getByTestId("map-detail-panel-more-menu-trigger"));
    const items = [...screen.getByTestId("map-detail-panel-more-menu").querySelectorAll('[role="menuitem"]')].map((item) => item.getAttribute("data-testid"));
    expect(items.slice(0, 3)).toEqual([
      "map-detail-panel-action-meaning",
      "map-detail-panel-action-ask-agent",
      "map-detail-panel-action-handoff",
    ]);
    fireEvent.click(screen.getByTestId("map-detail-panel-action-meaning"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("reveals edit actions in one anchored menu", () => {
    const onEditRelations = vi.fn();
    const onCreateLinked = vi.fn();
    renderPanel(undefined, { onEditRelations, onCreateLinked });

    fireEvent.click(screen.getByTestId("map-detail-panel-edit-menu-trigger"));
    const menu = screen.getByTestId("map-detail-panel-edit-menu");
    expect(menu).toHaveAttribute("role", "menu");
    fireEvent.click(screen.getByTestId("map-detail-panel-action-create-linked"));
    expect(onCreateLinked).toHaveBeenCalledTimes(1);
  });

  it("links the document menu item to the document href when the node has a backing doc", () => {
    renderPanel(undefined, { documentHref: "/docs/domains/views" });
    fireEvent.click(screen.getByTestId("map-detail-panel-more-menu-trigger"));
    const link = screen.getByTestId("map-detail-panel-action-document");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", expect.stringContaining("/docs/domains/views"));
  });

  it("hides the document item when the node has no document href (no dead affordance)", () => {
    renderPanel(undefined, { documentHref: null });
    fireEvent.click(screen.getByTestId("map-detail-panel-more-menu-trigger"));
    expect(screen.queryByTestId("map-detail-panel-action-document")).not.toBeInTheDocument();
  });

  it("links the edit-relations menu item to the studio deep link", () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("map-detail-panel-edit-menu-trigger"));
    expect(screen.getByTestId("map-detail-panel-action-edit")).toHaveAttribute("href", expect.stringContaining("/ontology/studio/"));
  });

  it("keeps edit-relations in place when a contextual editor callback is available", () => {
    const onEditRelations = vi.fn();
    renderPanel(undefined, { onEditRelations });
    fireEvent.click(screen.getByTestId("map-detail-panel-edit-menu-trigger"));
    const action = screen.getByTestId("map-detail-panel-action-edit");
    expect(action.tagName).toBe("BUTTON");
    fireEvent.click(action);
    expect(onEditRelations).toHaveBeenCalledTimes(1);
  });

  it("copies the handoff text from the more menu, and plain mode leaves it out", () => {
    const onCopyHandoff = vi.fn();
    const { unmount } = renderPanel(undefined, { onCopyHandoff });
    fireEvent.click(screen.getByTestId("map-detail-panel-more-menu-trigger"));
    fireEvent.click(screen.getByTestId("map-detail-panel-action-handoff"));
    expect(onCopyHandoff).toHaveBeenCalledWith("node: domains/views");
    unmount();
    renderPanel(undefined, { showHandoff: false });
    fireEvent.click(screen.getByTestId("map-detail-panel-more-menu-trigger"));
    expect(screen.queryByTestId("map-detail-panel-action-handoff")).not.toBeInTheDocument();
  });
});

describe("OntologyMapDetailPanel: exit", () => {
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
        owner={null}
        definition={null}
        powered={false}
        groups={{
          contains: { rows: [], total: 0 },
          usedBy: { rows: [], total: 0 },
          dependsOn: { rows: [], total: 0 },
          belongsTo: { rows: [], total: 0 },
          related: { rows: [], total: 0 },
        }}
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
  it("the highlight clears when the panel disappears, because pressing a row never delivers pointerleave", () => {
    const onHoverConnection = vi.fn();
    const onHoverEvidence = vi.fn();
    const { unmount } = renderPanel(undefined, {
      onHoverConnection,
      onHoverEvidence,
      reach: {
        needs: [{ id: "capability:cart", label: "장바구니", kind: "capability", line: "needs", links: null, neededBy: 0 }],
        neededBy: [],
        other: [],
      },
    });

    fireEvent.pointerEnter(screen.getByText("장바구니").closest("button")!);
    expect(onHoverConnection).toHaveBeenLastCalledWith("capability:cart");

    unmount();
    expect(onHoverConnection).toHaveBeenLastCalledWith(null);
    expect(onHoverEvidence).toHaveBeenLastCalledWith(null);
  });
});
