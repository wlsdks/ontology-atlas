import type {
  ConstructionPostWriteMaintenance,
  ConstructionReviewParseResult,
  ConstructionReviewSignals,
} from "../model/types";

type UnknownRecord = Record<string, unknown>;

const DIGEST = /^sha256:[a-f0-9]{64}$/;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  const object = record(value);
  if (!object) return value;
  return Object.fromEntries(
    Object.keys(object)
      .sort()
      .map((key) => [key, canonical(object[key])]),
  );
}

function samePlan(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function diagnosticText(value: unknown): string | null {
  if (typeof value === "string") return value;
  const item = record(value);
  return string(item?.message) ?? string(item?.code);
}

function statusSignals(qualification: UnknownRecord, analysis: UnknownRecord): ConstructionReviewSignals {
  let red = 0;
  let unknown = 0;
  let conflict = 0;
  const visit = (status: unknown) => {
    if (typeof status !== "string") return;
    if (["failed", "invalid", "blocked", "refused", "not_qualified"].includes(status)) red += 1;
    if (["unknown", "partial", "not_measured", "unavailable"].includes(status)) unknown += 1;
    if (status.includes("conflict") || status.includes("mismatch")) conflict += 1;
  };
  for (const row of array(qualification.axisResults)) visit(record(row)?.status);
  for (const row of array(qualification.cqResults)) visit(record(row)?.status);
  for (const row of array(qualification.diagnostics)) {
    const item = record(row);
    const code = string(item?.code) ?? "";
    if (code.includes("conflict") || code.includes("mismatch")) conflict += 1;
    if (record(row)?.severity === "error") red += 1;
  }
  for (const row of array(analysis.findings)) {
    const item = record(row);
    if (item?.severity === "error") red += 1;
    const code = string(item?.code) ?? "";
    if (code.includes("conflict") || code.includes("mismatch")) conflict += 1;
  }
  return { red, unknown, conflict };
}

/**
 * Accept one session-only JSON envelope containing the existing qualification
 * packet and analyze response. This function never re-evaluates quality. It
 * only refuses envelopes whose identities or exact plans disagree, then makes
 * the validator-owned fields easier to read.
 */
export function parseConstructionReviewEnvelope(
  raw: unknown,
  expectedProjectSlug: string,
): ConstructionReviewParseResult {
  const root = record(raw);
  const qualification = record(root?.qualification);
  const analysis = record(root?.analysis);
  const proposalValidation = record(analysis?.proposalValidation);
  const lifecycle = record(proposalValidation?.constructionLifecycle);
  const subject = record(qualification?.subject);
  const purpose = record(qualification?.purposeAuthority);
  const acceptance = record(qualification?.acceptance);
  const analysisProject = record(analysis?.project);
  const reviewPlan = record(proposalValidation?.reviewPlan);
  const writePlanValue = proposalValidation?.writePlan;
  const writePlan = writePlanValue == null ? null : record(writePlanValue);

  if (
    !root ||
    !qualification ||
    qualification.contract !== "constructionQualification:v1" ||
    !proposalValidation ||
    lifecycle?.contract !== "ontologyConstructionLifecycle:v1" ||
    !subject ||
    !purpose ||
    !acceptance ||
    !analysisProject ||
    !reviewPlan ||
    (writePlanValue != null && !writePlan)
  ) {
    return { ok: false, state: "malformed", issues: ["required_artifact_missing"] };
  }

  const projectSlug = string(subject.projectSlug);
  const analyzedProjectSlug = string(analysisProject.slug);
  if (
    !projectSlug ||
    projectSlug !== expectedProjectSlug ||
    analyzedProjectSlug !== expectedProjectSlug
  ) {
    return { ok: false, state: "project_mismatch", issues: ["project_slug_mismatch"] };
  }

  const planDigest = string(lifecycle.planDigest);
  const sourceDigest = string(lifecycle.sourceDigest);
  const postWrite = record(root.postWrite);
  const postWriteBindings = record(postWrite?.bindings);
  const planDigests = [
    planDigest,
    string(subject.graphDigest),
    string(acceptance.planDigest),
    postWrite ? string(postWriteBindings?.planDigest) : planDigest,
  ];
  const sourceDigests = [
    sourceDigest,
    string(subject.sourceDigest),
    postWrite ? string(postWriteBindings?.sourceDigest) : sourceDigest,
  ];
  if (
    !planDigest ||
    !sourceDigest ||
    !DIGEST.test(planDigest) ||
    !DIGEST.test(sourceDigest) ||
    planDigests.some((digest) => digest !== planDigest) ||
    sourceDigests.some((digest) => digest !== sourceDigest)
  ) {
    return { ok: false, state: "digest_mismatch", issues: ["artifact_digest_mismatch"] };
  }

  if (writePlan && !samePlan(reviewPlan, writePlan)) {
    return { ok: false, state: "plan_mismatch", issues: ["review_write_plan_mismatch"] };
  }

  const approvalDecision = string(acceptance.decision);
  const decidedBy = string(acceptance.decidedBy);
  const authority = string(acceptance.authority);
  const purposeOutcome = string(purpose.outcome);
  const qualificationStatus = string(lifecycle.qualificationStatus);
  const writeEligibility = string(lifecycle.writeEligibility);
  const lifecycleNext = string(lifecycle.nextAction);
  if (
    !approvalDecision ||
    !decidedBy ||
    !authority ||
    !purposeOutcome ||
    !qualificationStatus ||
    !writeEligibility ||
    !lifecycleNext
  ) {
    return { ok: false, state: "malformed", issues: ["required_projection_field_missing"] };
  }

  const lifecycleDiagnostics = array(lifecycle.diagnostics);
  const qualificationDiagnostics = array(qualification.diagnostics);
  const findings = array(proposalValidation.findings);
  const firstDiagnostic = [
    ...lifecycleDiagnostics,
    ...qualificationDiagnostics,
    ...findings,
  ].map(diagnosticText).find((value): value is string => Boolean(value)) ?? null;

  const meaning = record(postWrite?.meaningAssessment);
  const postWriteMaintenance: ConstructionPostWriteMaintenance | null = postWrite
    ? {
        status: string(meaning?.status) ?? "unavailable",
        blocker: string(meaning?.topGap),
        nextAction: string(meaning?.nextAction),
        boundary: string(meaning?.boundary),
      }
    : null;
  const currentDecision = postWriteMaintenance?.nextAction ?? lifecycleNext;
  const nextDecision = postWriteMaintenance?.boundary ?? lifecycleNext;

  const competencyAnswers = record(reviewPlan.competencyAnswers);
  return {
    ok: true,
    value: {
      envelopeState: "ready",
      projectSlug,
      purposeOutcome,
      qualificationStatus,
      writeEligibility,
      planEquality: writePlan ? "equal" : "write_not_available",
      firstBlocker: string(lifecycle.firstBlockingPhase),
      firstDiagnostic,
      currentDecision,
      nextDecision,
      humanApproval: {
        decision: approvalDecision,
        decidedBy,
        authority,
        decidedAt: string(acceptance.decidedAt),
      },
      planCounts: {
        concepts: array(reviewPlan.concepts).length,
        relations: array(reviewPlan.relations).length,
        competencies: competencyAnswers ? Object.keys(competencyAnswers).length : 0,
      },
      signals: statusSignals(qualification, proposalValidation),
      postWriteMaintenance,
      planDigest,
      sourceDigest,
      qualification,
      lifecycle,
      reviewPlan,
      writePlan,
    },
  };
}
