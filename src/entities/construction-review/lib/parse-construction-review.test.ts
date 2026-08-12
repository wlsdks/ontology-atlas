import { describe, expect, it } from "vitest";

import { parseConstructionReviewEnvelope } from "./parse-construction-review";

const DIGEST_A = `sha256:${"a".repeat(64)}`;
const DIGEST_B = `sha256:${"b".repeat(64)}`;

function envelope() {
  const reviewPlan = {
    concepts: [{ slug: "atlas", kind: "project" }],
    relations: [{ from: "atlas", to: "meaning", type: "domains" }],
    competencyAnswers: { scope: { status: "answered" } },
  };
  return {
    qualification: {
      contract: "constructionQualification:v1",
      subject: { projectSlug: "atlas", graphDigest: DIGEST_A, sourceDigest: DIGEST_B },
      purposeAuthority: { outcome: "People and agents judge the same local meaning." },
      competencyQuestions: [
        {
          id: "cq:scope",
          question: "What is in scope?",
          examples: [{ id: "example:scope", expectedStatus: "answered" }],
          counterexamples: [{ id: "counter:folder", mustReject: "A folder is a domain." }],
        },
      ],
      witnesses: [
        {
          id: "w:scope",
          kind: "source_span",
          current: true,
          provenance: { sourceRef: "README.md:1-3", digest: DIGEST_B },
        },
      ],
      cqResults: [{ cqId: "cq:scope", status: "answered", witnessRefs: ["w:scope"] }],
      claims: [{ id: "claim:scope", status: "supported", witnessRefs: ["w:scope"] }],
      citationChecks: [{ claimId: "claim:scope", witnessRef: "w:scope", status: "verified" }],
      axisResults: [
        { axis: "semantic", status: "passed", evidenceRefs: ["w:scope"], findingIds: [] },
        { axis: "structural", status: "passed", evidenceRefs: ["w:scope"], findingIds: [] },
        { axis: "functional", status: "passed", evidenceRefs: ["w:scope"], findingIds: [] },
        { axis: "evidence_provenance", status: "passed", evidenceRefs: ["w:scope"], findingIds: [] },
        { axis: "pragmatic", status: "passed", evidenceRefs: ["w:scope"], findingIds: [] },
        { axis: "maintainability", status: "passed", evidenceRefs: ["w:scope"], findingIds: [] },
        { axis: "interoperability", status: "passed", evidenceRefs: ["w:scope"], findingIds: [] },
      ],
      diagnostics: [],
      acceptance: {
        decision: "accepted",
        decidedBy: "jinan",
        authority: "human",
        planDigest: DIGEST_A,
        planRevision: 1,
        acceptedGapIds: [],
      },
    },
    analysis: {
      project: { slug: "atlas", title: "Atlas" },
      proposalValidation: {
        status: "pass",
        canWrite: true,
        findings: [],
        reviewPlan,
        writePlan: structuredClone(reviewPlan),
        constructionLifecycle: {
          contract: "ontologyConstructionLifecycle:v1",
          qualificationStatus: "qualified",
          writeEligibility: "executable",
          planDigest: DIGEST_A,
          sourceDigest: DIGEST_B,
          firstBlockingPhase: null,
          diagnostics: [],
          nextAction: "Write only the returned rows, then validate and finalize.",
        },
      },
    },
    postWrite: {
      contract: "o15ActualWriterFinalReport:v1",
      status: "completed-with-postwrite-meaning-gap",
      bindings: { planDigest: DIGEST_A, sourceDigest: DIGEST_B },
      meaningAssessment: {
        status: "needs_evidence",
        topGap: "structure_not_ready",
        nextAction: "repair_ontology_structure",
        boundary: "Post-write maintenance is not a qualification failure.",
      },
      writes: { concepts: 1, relations: 1 },
    },
  };
}

describe("construction review session envelope", () => {
  it("projects one accepted artifact without changing its verdict or post-write maintenance", () => {
    const result = parseConstructionReviewEnvelope(envelope(), "atlas");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      envelopeState: "ready",
      projectSlug: "atlas",
      qualificationStatus: "qualified",
      writeEligibility: "executable",
      planEquality: "equal",
      firstBlocker: null,
      humanApproval: { decision: "accepted", decidedBy: "jinan" },
      planCounts: { concepts: 1, relations: 1, competencies: 1 },
      postWriteMaintenance: {
        status: "needs_evidence",
        blocker: "structure_not_ready",
      },
    });
    expect(result.value.currentDecision).toBe("repair_ontology_structure");
    expect(result.value.nextDecision).toContain("Post-write maintenance");
    expect(result.value.signals).toEqual({ red: 0, unknown: 0, conflict: 0 });
  });

  it.each([
    ["malformed", null, "malformed"],
    ["wrong project", { mutate: (value: ReturnType<typeof envelope>) => { value.analysis.project.slug = "other"; } }, "project_mismatch"],
    ["digest drift", { mutate: (value: ReturnType<typeof envelope>) => { value.qualification.subject.sourceDigest = `sha256:${"c".repeat(64)}`; } }, "digest_mismatch"],
    ["plan drift", { mutate: (value: ReturnType<typeof envelope>) => { value.analysis.proposalValidation.writePlan.relations = []; } }, "plan_mismatch"],
  ])("fails closed for %s", (_name, recipe, expected) => {
    const input = recipe ? envelope() : null;
    recipe?.mutate(input!);
    const result = parseConstructionReviewEnvelope(input, "atlas");
    expect(result).toMatchObject({ ok: false, state: expected });
  });

  it("treats a missing write plan as not available, not a mismatch", () => {
    const input = envelope();
    input.analysis.proposalValidation.writePlan = null as never;
    input.analysis.proposalValidation.canWrite = false;
    input.analysis.proposalValidation.constructionLifecycle.writeEligibility = "reviewable";

    const result = parseConstructionReviewEnvelope(input, "atlas");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.planEquality).toBe("write_not_available");
  });
});
