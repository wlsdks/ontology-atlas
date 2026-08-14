"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import type { ConstructionReviewProjection } from "@/entities/construction-review";
import { Surface, controlClass } from "@/shared/ui";
import { fieldClass, fieldLabel } from "@/shared/ui/control-class";

type UnknownRecord = Record<string, unknown>;

const record = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
const rows = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const testIdPart = (value: string): string => value.replace(/^[^:]+:/, "").replace(/[^a-zA-Z0-9_-]/g, "-");

interface ConstructionReviewDraft {
  readonly questions: Readonly<Record<string, string>>;
  readonly witnessSourceRefs: Readonly<Record<string, string>>;
  readonly plan: string;
}

function stringList(value: unknown): string[] {
  return rows(value).map((item) => text(item)).filter(Boolean);
}

function sourceSpanText(value: unknown): string {
  const span = record(value);
  const start = record(span?.start);
  const end = record(span?.end);
  if (!start || !end || typeof start.line !== "number" || typeof end.line !== "number") {
    return "";
  }
  const startColumn = typeof start.column === "number" ? `:${start.column}` : "";
  const endColumn = typeof end.column === "number" ? `:${end.column}` : "";
  return `L${start.line}${startColumn}–L${end.line}${endColumn}`;
}

function sourceEvidenceText(provenance: UnknownRecord | null, unreadable: string): string {
  const sourceRef = text(provenance?.sourceRef);
  const span = sourceSpanText(provenance?.sourceSpan);
  const digest = text(provenance?.digest) || text(provenance?.sourceDigest);
  const location = [sourceRef, span].filter(Boolean).join(" · ");
  return [location || unreadable, digest].filter(Boolean).join(" · ");
}

function draftDiffs(review: ConstructionReviewProjection, draft: ConstructionReviewDraft): string[] {
  const original = draftFor(review);
  const changes: string[] = [];
  const changedQuestions = Object.keys(draft.questions).filter(
    (id) => draft.questions[id] !== original.questions[id],
  );
  if (changedQuestions.length > 0) changes.push(`CQ: ${changedQuestions.join(", ")}`);
  const changedWitnesses = Object.keys(draft.witnessSourceRefs).filter(
    (id) => draft.witnessSourceRefs[id] !== original.witnessSourceRefs[id],
  );
  if (changedWitnesses.length > 0) changes.push(`witness: ${changedWitnesses.join(", ")}`);
  if (draft.plan !== original.plan) changes.push("exact plan");
  return changes;
}

function draftFor(review: ConstructionReviewProjection): ConstructionReviewDraft {
  const questions = Object.fromEntries(
    rows(review.qualification.competencyQuestions).map((value, index) => {
      const item = record(value);
      return [text(item?.id) || String(index + 1), text(item?.question)];
    }),
  );
  const witnessSourceRefs = Object.fromEntries(
    rows(review.qualification.witnesses).map((value, index) => {
      const item = record(value);
      const provenance = record(item?.provenance);
      return [text(item?.id) || String(index + 1), text(provenance?.sourceRef)];
    }),
  );
  return {
    questions,
    witnessSourceRefs,
    plan: JSON.stringify(review.reviewPlan, null, 2),
  };
}

export function ConstructionReviewPanel({ review }: { review: ConstructionReviewProjection }) {
  const t = useTranslations("projectPages.detail.constructionReview");
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draft, setDraft] = useState<ConstructionReviewDraft>(() => draftFor(review));
  const [draftDirty, setDraftDirty] = useState(false);
  const qualification = review.qualification;
  const questions = rows(qualification.competencyQuestions);
  const witnesses = rows(qualification.witnesses);
  const claims = rows(qualification.claims);
  const citations = rows(qualification.citationChecks);
  const axes = rows(qualification.axisResults);
  const diagnostics = [
    ...rows(qualification.diagnostics),
    ...rows(review.lifecycle.diagnostics),
  ];

  return (
    <section
      data-testid="construction-review-summary"
      data-envelope-state={review.envelopeState}
      data-qualification-status={review.qualificationStatus}
      data-write-eligibility={review.writeEligibility}
      data-plan-equality={review.planEquality}
      className="mt-[var(--section-gap)] rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-4 py-4 sm:px-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-caption uppercase tracking-caption text-[color:var(--color-indigo-accent)]">
            {t("eyebrow")}
          </p>
          <h2 className="mt-1 text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
            {t("title")}
          </h2>
          <p className="mt-1.5 max-w-[72ch] text-body leading-prose text-[color:var(--color-text-secondary)]">
            {review.purposeOutcome}
          </p>
        </div>
        <span className="rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1 font-mono text-label text-[color:var(--color-text-secondary)]">
          {review.qualificationStatus} · {review.writeEligibility}
        </span>
      </div>

      <dl className="mt-4 grid gap-px overflow-hidden rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-border-soft)] sm:grid-cols-2 lg:grid-cols-4">
        <Fact label={t("currentDecision")} testId="construction-review-current-decision">
          {review.currentDecision}
        </Fact>
        <Fact label={t("firstBlocker")} testId="construction-review-first-blocker">
          {review.firstBlocker ?? t("none")}
        </Fact>
        <Fact label={t("humanApproval")} testId="construction-review-human-approval">
          {t("approvalValue", {
            decision: review.humanApproval.decision,
            owner: review.humanApproval.decidedBy,
          })}
        </Fact>
        <Fact label={t("planCounts")} testId="construction-review-plan-counts">
          {t("planCountValue", {
            concepts: review.planCounts.concepts,
            relations: review.planCounts.relations,
            competencies: review.planCounts.competencies,
          })}
        </Fact>
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-label text-[color:var(--color-text-secondary)]">
        <span>{t("signalRed", { count: review.signals.red })}</span>
        <span>{t("signalUnknown", { count: review.signals.unknown })}</span>
        <span>{t("signalConflict", { count: review.signals.conflict })}</span>
        <span>{t("planEquality", { state: review.planEquality })}</span>
      </div>

      <div className="mt-3 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5">
        <p className="text-label font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
          {t("nextDecision")}
        </p>
        <p className="mt-1 text-body leading-prose text-[color:var(--color-text-secondary)]">
          {review.nextDecision}
        </p>
        {review.firstDiagnostic ? (
          <p className="mt-1 text-label text-[color:var(--color-danger-text)]">
            {t("firstDiagnostic", { diagnostic: review.firstDiagnostic })}
          </p>
        ) : null}
      </div>

      {review.postWriteMaintenance ? (
        <section
          data-testid="construction-review-post-write-maintenance"
          className="mt-3 border-t border-[color:var(--color-border-soft)] pt-3"
        >
          <p className="text-label font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
            {t("maintenanceTitle")}
          </p>
          <p className="mt-1 text-body leading-prose text-[color:var(--color-text-secondary)]">
            {review.postWriteMaintenance.status}
            {review.postWriteMaintenance.blocker ? ` · ${review.postWriteMaintenance.blocker}` : ""}
          </p>
          {review.postWriteMaintenance.boundary ? (
            <p className="mt-1 text-label leading-prose text-[color:var(--color-text-tertiary)]">
              {review.postWriteMaintenance.boundary}
            </p>
          ) : null}
        </section>
      ) : null}

      <button
        type="button"
        data-testid="construction-review-evidence-toggle"
        aria-expanded={evidenceOpen}
        aria-controls="construction-review-evidence-panel"
        onClick={() => setEvidenceOpen((open) => !open)}
        className={controlClass({
          shape: "link",
          size: "lg",
          tone: evidenceOpen ? "default" : "muted",
          className: "mt-3",
        })}
      >
        {evidenceOpen ? t("hideEvidence") : t("showEvidence")}
      </button>

      <Surface
        as="section"
        open={evidenceOpen}
        motion="overlay"
        data-testid="construction-review-evidence"
        id="construction-review-evidence-panel"
        aria-label={t("showEvidence")}
        className="mt-3 flex flex-col gap-4 border-t border-[color:var(--color-border-soft)] pt-4"
      >
        <EvidenceSection title={t("cqTitle")}>
          <ol className="flex flex-col gap-2">
            {questions.map((value, index) => {
              const question = record(value);
              const questionId = text(question?.id) || String(index + 1);
              const result = rows(qualification.cqResults).find((candidate) => {
                const item = record(candidate);
                return text(item?.cqId) === questionId || text(item?.id) === questionId;
              });
              const resultRecord = record(result);
              return (
                <li key={questionId} className="text-body text-[color:var(--color-text-secondary)]">
                  <span className="font-mono text-caption text-[color:var(--color-text-quaternary)]">
                    {questionId}
                  </span>{" "}
                  {text(question?.question) || t("unreadable")}
                  <span className="ml-1 text-label text-[color:var(--color-text-tertiary)]">
                    · {text(resultRecord?.status) || t("unreadable")}
                    {stringList(resultRecord?.witnessRefs).length > 0
                      ? ` · ${stringList(resultRecord?.witnessRefs).join(", ")}`
                      : ""}
                  </span>
                  <ExampleRows question={question} />
                </li>
              );
            })}
          </ol>
        </EvidenceSection>

        <EvidenceSection title={t("witnessTitle")}>
          <ul className="flex flex-col gap-2">
            {witnesses.map((value, index) => {
              const witness = record(value);
              const provenance = record(witness?.provenance);
              return (
                <li key={text(witness?.id) || index} className="break-words text-label leading-prose text-[color:var(--color-text-secondary)]">
                  <b className="font-[var(--font-weight-emphasis)]">{text(witness?.id) || t("unreadable")}</b>
                  {` · ${text(witness?.kind) || t("unreadable")} · ${sourceEvidenceText(provenance, t("unreadable"))}`}
                  <span className="mt-0.5 block font-mono text-caption text-[color:var(--color-text-quaternary)]">
                    {witness?.current === false ? t("staleWitness") : t("currentWitness")}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-caption text-[color:var(--color-text-quaternary)]">
            {t("citationCount", { count: citations.length })}
          </p>
          {claims.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1">
              {claims.map((value, index) => {
                const claim = record(value);
                const claimId = text(claim?.id) || t("unreadable");
                const checks = citations.filter((citation) => text(record(citation)?.claimId) === claimId);
                return (
                  <li key={claimId || index} className="text-label leading-prose text-[color:var(--color-text-secondary)]">
                    <span className="font-mono text-caption text-[color:var(--color-text-quaternary)]">{claimId}</span>{" "}
                    {text(claim?.statement) || t("unreadable")}
                    <span className="ml-1 text-[color:var(--color-text-tertiary)]">
                      · {text(claim?.status) || t("unreadable")}
                      {checks.length ? ` · ${checks.map((check) => text(record(check)?.status)).filter(Boolean).join(", ")}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </EvidenceSection>

        <EvidenceSection title={t("axesTitle")}>
            <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {axes.map((value, index) => {
                const axis = record(value);
                const evidenceRefs = stringList(axis?.evidenceRefs);
                const findingIds = stringList(axis?.findingIds);
                return (
                  <li key={text(axis?.axis) || index} className="text-label text-[color:var(--color-text-secondary)]">
                  <span className="font-[var(--font-weight-emphasis)]">{text(axis?.axis) || t("unreadable")}</span>
                  {` · ${text(axis?.status) || t("unreadable")}`}
                  {evidenceRefs.length > 0 ? <span className="block text-caption text-[color:var(--color-text-quaternary)]">{t("evidenceRefs", { refs: evidenceRefs.join(", ") })}</span> : null}
                  {findingIds.length > 0 ? <span className="block text-caption text-[color:var(--color-danger-text)]">{t("findingIds", { ids: findingIds.join(", ") })}</span> : null}
                  </li>
                );
              })}
          </ul>
        </EvidenceSection>

        <EvidenceSection title={t("diagnosticsTitle")}>
          {diagnostics.length === 0 ? (
            <p className="text-label text-[color:var(--color-text-tertiary)]">{t("none")}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {diagnostics.map((value, index) => (
                <li key={index} className="text-label text-[color:var(--color-danger-text)]">
                  {text(record(value)?.message) || text(record(value)?.code) || t("unreadable")}
                </li>
              ))}
            </ul>
          )}
        </EvidenceSection>

        <EvidenceSection title={t("planTitle")}>
          <p className="font-mono text-caption break-all text-[color:var(--color-text-quaternary)]">
            {t("planDigest", { digest: review.planDigest })}
          </p>
          <p className="mt-1 font-mono text-caption break-all text-[color:var(--color-text-quaternary)]">
            {t("sourceDigest", { digest: review.sourceDigest })}
          </p>
          <PlanRows title={t("reviewPlan")} plan={review.reviewPlan} unreadable={t("unreadable")} />
          {review.writePlan ? (
            <PlanRows title={t("writePlan")} plan={review.writePlan} unreadable={t("unreadable")} />
          ) : (
            <p className="mt-2 text-label text-[color:var(--color-text-tertiary)]">{t("writePlanMissing")}</p>
          )}
        </EvidenceSection>

        <section data-testid="construction-review-draft" className="border-t border-[color:var(--color-border-soft)] pt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
                {t("draftTitle")}
              </h3>
              <p className="mt-1 max-w-[72ch] text-label leading-prose text-[color:var(--color-text-tertiary)]">
                {t("draftHint")}
              </p>
            </div>
            <button
              type="button"
              data-testid="construction-review-draft-toggle"
              aria-expanded={draftOpen}
              aria-controls="construction-review-draft-fields"
              onClick={() => setDraftOpen((open) => !open)}
              className={controlClass({
                shape: "link",
                size: "lg",
                tone: draftOpen ? "default" : "muted",
              })}
            >
              {draftOpen ? t("hideDraft") : t("showDraft")}
            </button>
          </div>
          <Surface
            as="div"
            open={draftOpen}
            motion="overlay"
            id="construction-review-draft-fields"
            data-testid="construction-review-draft-fields"
            className="mt-3 flex flex-col gap-3"
          >
            <p
              data-testid="construction-review-draft-dirty"
              role="status"
              className={draftDirty
                ? "rounded-chip border border-[color:var(--color-amber-source-a34)] bg-[color:var(--color-amber-source-a08)] px-3 py-2 text-label leading-prose text-[color:var(--color-amber-source-text-a95)]"
                : "rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-label leading-prose text-[color:var(--color-text-tertiary)]"}
            >
              {draftDirty ? t("draftDirty") : t("draftClean")}
            </p>
            {draftDirty ? (
              <ul data-testid="construction-review-draft-diff" className="flex flex-col gap-1 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-label text-[color:var(--color-text-secondary)]">
                {draftDiffs(review, draft).map((change) => <li key={change}>{t("draftChangedField", { field: change })}</li>)}
              </ul>
            ) : null}
            {draftDirty ? (
              <button
                type="button"
                data-testid="construction-review-draft-reset"
                onClick={() => {
                  setDraft(draftFor(review));
                  setDraftDirty(false);
                }}
                className={controlClass({ shape: "link", size: "lg", tone: "muted" })}
              >
                {t("resetDraft")}
              </button>
            ) : null}
            {Object.entries(draft.questions).map(([id, value]) => (
              <label key={id} className={fieldLabel({ className: "flex flex-col gap-1" })}>
                <span className="font-mono text-caption text-[color:var(--color-text-quaternary)]">CQ · {id}</span>
                <textarea
                  data-testid={`construction-review-cq-${testIdPart(id)}`}
                  value={value}
                  rows={2}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setDraft((current) => ({ ...current, questions: { ...current.questions, [id]: next } }));
                    setDraftDirty(true);
                  }}
                  className={fieldClass({ multiline: true, size: "md", className: "mt-1 w-full resize-y" })}
                />
              </label>
            ))}
            {Object.entries(draft.witnessSourceRefs).map(([id, value]) => (
              <label key={id} className={fieldLabel({ className: "flex flex-col gap-1" })}>
                <span className="font-mono text-caption text-[color:var(--color-text-quaternary)]">{t("witnessSourceRef", { id })}</span>
                <input
                  data-testid={`construction-review-witness-${testIdPart(id)}`}
                  value={value}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setDraft((current) => ({ ...current, witnessSourceRefs: { ...current.witnessSourceRefs, [id]: next } }));
                    setDraftDirty(true);
                  }}
                  className={fieldClass({ size: "md", className: "mt-1 w-full font-mono" })}
                />
              </label>
            ))}
            <label className={fieldLabel({ className: "flex flex-col gap-1" })}>
              <span className="font-mono text-caption text-[color:var(--color-text-quaternary)]">{t("planDraft")}</span>
              <textarea
                data-testid="construction-review-plan-draft"
                value={draft.plan}
                rows={8}
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  setDraft((current) => ({ ...current, plan: next }));
                  setDraftDirty(true);
                }}
                className={fieldClass({ multiline: true, size: "md", className: "mt-1 w-full resize-y font-mono" })}
              />
            </label>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-[color:var(--color-text-quaternary)]">
              <span data-testid="construction-review-plan-digest">{t("planDigest", { digest: review.planDigest })}</span>
              <span>{t("draftNoWrite")}</span>
            </div>
          </Surface>
        </section>
      </Surface>
    </section>
  );
}

function Fact({ label, testId, children }: { label: string; testId: string; children: React.ReactNode }) {
  return (
    <div data-testid={testId} className="min-w-0 bg-[color:var(--color-panel)] px-3 py-2.5">
      <dt className="text-caption uppercase tracking-caption text-[color:var(--color-text-quaternary)]">{label}</dt>
      <dd className="mt-1 break-words text-body text-[color:var(--color-text-primary)]">{children}</dd>
    </div>
  );
}

function EvidenceSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">{title}</h3>
      {children}
    </section>
  );
}

function ExampleRows({ question }: { question: UnknownRecord | null }) {
  const examples = rows(question?.examples).map((item) => {
    const example = record(item);
    return [text(example?.id), text(example?.expectedStatus)].filter(Boolean).join(" · ");
  }).filter(Boolean);
  const counterexamples = rows(question?.counterexamples).map((item) => {
    const counterexample = record(item);
    return [text(counterexample?.id), text(counterexample?.mustReject)].filter(Boolean).join(" · ");
  }).filter(Boolean);
  if (examples.length + counterexamples.length === 0) return null;
  return (
    <span className="mt-1 block text-caption text-[color:var(--color-text-quaternary)]">
      {examples.join(" · ")}{examples.length && counterexamples.length ? " / " : ""}{counterexamples.join(" · ")}
    </span>
  );
}

function PlanRows({ title, plan, unreadable }: { title: string; plan: Readonly<Record<string, unknown>>; unreadable: string }) {
  const concepts = rows(plan.concepts).map((item) => text(record(item)?.slug)).filter(Boolean);
  const relations = rows(plan.relations).map((item) => {
    const row = record(item);
    const relation = [text(row?.from), text(row?.type), text(row?.to)].filter(Boolean).join(" → ");
    const rationale = text(row?.rationale) || text(row?.why);
    const evidenceRefs = stringList(row?.evidenceRefs ?? row?.witnessRefs);
    const details = [rationale, evidenceRefs.length ? `evidence: ${evidenceRefs.join(", ")}` : ""].filter(Boolean).join(" · ");
    return details ? `${relation} · ${details}` : relation || unreadable;
  }).filter(Boolean);
  return (
    <div className="mt-3">
      <p className="text-label font-[var(--font-weight-emphasis)] text-[color:var(--color-text-secondary)]">{title}</p>
      <ol className="mt-1 flex flex-col gap-1 font-mono text-caption text-[color:var(--color-text-tertiary)]">
        {[...concepts, ...relations].map((row, index) => <li key={`${index}:${row}`}>{index + 1}. {row}</li>)}
      </ol>
    </div>
  );
}
