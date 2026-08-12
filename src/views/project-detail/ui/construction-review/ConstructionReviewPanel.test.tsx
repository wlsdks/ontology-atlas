import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import type { ConstructionReviewProjection } from "@/entities/construction-review";
import enMessages from "../../../../../messages/en.json";
import { ConstructionReviewPanel } from "./ConstructionReviewPanel";

function review(): ConstructionReviewProjection {
  return {
    envelopeState: "ready",
    projectSlug: "atlas",
    purposeOutcome: "People and agents judge the same local meaning.",
    qualificationStatus: "qualified",
    writeEligibility: "executable",
    planEquality: "equal",
    firstBlocker: null,
    firstDiagnostic: null,
    currentDecision: "repair_ontology_structure",
    nextDecision: "This is post-write maintenance, not a qualification failure.",
    humanApproval: { decision: "accepted", decidedBy: "jinan", authority: "human", decidedAt: null },
    planCounts: { concepts: 9, relations: 9, competencies: 5 },
    signals: { red: 0, unknown: 0, conflict: 0 },
    postWriteMaintenance: {
      status: "needs_evidence",
      blocker: "structure_not_ready",
      nextAction: "repair_ontology_structure",
      boundary: "This is post-write maintenance, not a qualification failure.",
    },
    planDigest: `sha256:${"a".repeat(64)}`,
    sourceDigest: `sha256:${"b".repeat(64)}`,
    qualification: {
      competencyQuestions: [{ id: "cq:scope", question: "What is in scope?", examples: [{ id: "e:1" }], counterexamples: [{ id: "c:1" }] }],
      witnesses: [{ id: "w:scope", kind: "source_span", provenance: { sourceRef: "README.md:1-3", digest: `sha256:${"b".repeat(64)}` } }],
      citationChecks: [{ claimId: "claim:scope", witnessRef: "w:scope", status: "verified" }],
      axisResults: [{ axis: "semantic", status: "passed" }],
      diagnostics: [],
    },
    lifecycle: { diagnostics: [] },
    reviewPlan: { concepts: [{ slug: "atlas" }], relations: [], competencyAnswers: {} },
    writePlan: { concepts: [{ slug: "atlas" }], relations: [], competencyAnswers: {} },
  };
}

function renderPanel(value: ConstructionReviewProjection = review()) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ConstructionReviewPanel review={value} />
    </NextIntlClientProvider>,
  );
}

describe("ConstructionReviewPanel", () => {
  it("keeps decision, blocker, failure counts, approval, and exact plan counts visible", () => {
    renderPanel();
    const summary = screen.getByTestId("construction-review-summary");
    expect(summary).toHaveAttribute("data-envelope-state", "ready");
    expect(summary).toHaveAttribute("data-qualification-status", "qualified");
    expect(summary).toHaveAttribute("data-write-eligibility", "executable");
    expect(summary).toHaveAttribute("data-plan-equality", "equal");
    expect(screen.getByTestId("construction-review-current-decision")).toHaveTextContent("repair_ontology_structure");
    expect(screen.getByTestId("construction-review-first-blocker")).toHaveTextContent("None");
    expect(screen.getByTestId("construction-review-human-approval")).toHaveTextContent("jinan");
    expect(screen.getByTestId("construction-review-plan-counts")).toHaveTextContent("9");
    expect(screen.getByTestId("construction-review-plan-counts")).toHaveTextContent("5");
    expect(screen.getByText(/red 0/i)).toBeVisible();
  });

  it("separates post-write maintenance from completed qualification", () => {
    renderPanel();
    const maintenance = screen.getByTestId("construction-review-post-write-maintenance");
    expect(maintenance).toHaveTextContent("structure_not_ready");
    expect(maintenance).toHaveTextContent(/not a qualification failure/i);
  });

  it("opens expert evidence locally without replacing the default summary", () => {
    renderPanel();
    expect(screen.queryByTestId("construction-review-evidence")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("construction-review-evidence-toggle"));
    expect(screen.getByTestId("construction-review-summary")).toBeVisible();
    const evidence = screen.getByTestId("construction-review-evidence");
    expect(evidence).toHaveClass("map-overlay-in");
    expect(evidence).not.toHaveClass("topology-chrome-in");
    expect(evidence).toHaveTextContent("What is in scope?");
    expect(evidence).toHaveTextContent("README.md:1-3");
    expect(evidence).toHaveTextContent("semantic");
    expect(evidence).toHaveTextContent("sha256:");
  });
});
