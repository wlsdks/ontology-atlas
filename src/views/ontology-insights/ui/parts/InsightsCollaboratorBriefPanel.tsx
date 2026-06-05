import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  decisionLaneLabel,
  formatDecisionHandoffLabel,
  formatInsightsCollaboratorBrief,
  formatInsightsVocabularyReview,
  reviewQuestionsForFocus,
  type InsightsCollaboratorBrief,
} from "../../lib/collaborator-insights-brief";
import { CopyAgentTextButton } from "./CopyAgentTextButton";

type CollaboratorBriefSection = "decision" | "evidence" | "action";

/**
 * 협업자(리뷰어) 브리프 패널 — 리뷰 focus(어휘 정렬 / 영향 추적 / orphan 해소)
 * 별 질문·결정 레인·핸드오프, 영향 검사 MCP/CLI, vocabulary review·collaborator
 * brief 복사. OntologyInsightsPage 모놀리스에서 가장 큰 잔여 패널(~544줄)을
 * 분리(계산된 brief + 영향검사 문자열을 props 로 받는 표시 컴포넌트).
 */
export function InsightsCollaboratorBriefPanel({
  brief,
  impactCliCheckCommand,
  impactMcpCheckPayload,
}: {
  brief: InsightsCollaboratorBrief;
  impactCliCheckCommand: string;
  impactMcpCheckPayload: string;
}) {
  const t = useTranslations("ontologyPages.insights");
  const [activeSection, setActiveSection] =
    useState<CollaboratorBriefSection>("decision");
  const metricLabels = {
    nodes: t("collaboratorMetricNodes"),
    relations: t("collaboratorMetricRelations"),
    domains: t("collaboratorMetricDomains"),
    crossDomain: t("collaboratorMetricCrossDomain"),
    orphans: t("collaboratorMetricOrphans"),
  } satisfies Record<string, string>;
  const focusLabel =
    brief.reviewFocus === "resolve_orphans"
      ? t("collaboratorFocusResolveOrphans")
      : brief.reviewFocus === "trace_impact"
        ? t("collaboratorFocusTraceImpact")
        : t("collaboratorFocusAlignVocabulary");
  const reviewQuestionLabels = {
    alignVocabularyQuestions: [
      t("collaboratorQuestionAlignReuse"),
      t("collaboratorQuestionAlignRename"),
      t("collaboratorQuestionAlignOwner"),
    ],
    traceImpactQuestions: [
      t("collaboratorQuestionImpactDomains"),
      t("collaboratorQuestionImpactMessaging"),
      t("collaboratorQuestionImpactBoundary"),
    ],
    resolveOrphansQuestions: [
      t("collaboratorQuestionOrphanOwner"),
      t("collaboratorQuestionOrphanContainer"),
      t("collaboratorQuestionOrphanAction"),
    ],
  };
  const decisionLaneLabels = {
    decisionAlignOwner: t("collaboratorDecisionAlignOwner"),
    decisionAlignExpected: t("collaboratorDecisionAlignExpected"),
    decisionAlignNextStep: t("collaboratorDecisionAlignNextStep"),
    decisionImpactOwner: t("collaboratorDecisionImpactOwner"),
    decisionImpactExpected: t("collaboratorDecisionImpactExpected"),
    decisionImpactNextStep: t("collaboratorDecisionImpactNextStep"),
    decisionOrphanOwner: t("collaboratorDecisionOrphanOwner"),
    decisionOrphanExpected: t("collaboratorDecisionOrphanExpected"),
    decisionOrphanNextStep: t("collaboratorDecisionOrphanNextStep"),
    decisionRecord: t("collaboratorDecisionRecord"),
    decisionRecordDecision: t("collaboratorDecisionRecordDecision"),
    decisionRecordOwner: t("collaboratorDecisionRecordOwner"),
    decisionRecordEvidence: t("collaboratorDecisionRecordEvidence"),
    decisionRecordFollowUp: t("collaboratorDecisionRecordFollowUp"),
  };
  const reviewQuestions = reviewQuestionsForFocus(
    brief.reviewFocus,
    reviewQuestionLabels,
  );
  const decisionOwner = decisionLaneLabel(brief.reviewFocus, decisionLaneLabels, "owner");
  const decisionExpected = decisionLaneLabel(
    brief.reviewFocus,
    decisionLaneLabels,
    "expected",
  );
  const decisionNextStep = decisionLaneLabel(
    brief.reviewFocus,
    decisionLaneLabels,
    "nextStep",
  );
  const decisionHandoffLabel = brief.decisionHandoff
    ? formatDecisionHandoffLabel(brief.decisionHandoff, {
        builder: t("collaboratorHandoffBuilder"),
        impactHandoffPath: t("collaboratorImpactHandoffPath"),
        ontology: t("collaboratorHandoffOntology"),
        topology: t("collaboratorHandoffTopologyShort"),
        topologyFocus: t("collaboratorHandoffTopologyFocus"),
        topologyHealth: t("collaboratorHandoffTopologyHealth"),
      })
    : null;
  const collaboratorCliCheckCommand =
    "ontology-atlas workspace-brief [vault] --limit 5";
  const collaboratorMcpCheckPayload = 'query_ontology({"operation":"workspace_brief","limit":5})';
  const copyTextValue = formatInsightsCollaboratorBrief({
    brief,
    labels: {
      title: t("collaboratorInsightsTitle"),
      summary: t("collaboratorInsightsSubtitle"),
      nodes: metricLabels.nodes,
      relations: metricLabels.relations,
      domains: metricLabels.domains,
      crossDomain: metricLabels.crossDomain,
      orphans: metricLabels.orphans,
      topHubs: t("collaboratorTopHubs"),
      reviewVocabulary: t("collaboratorReviewVocabulary"),
      vocabularyTerm: t("collaboratorVocabularyTerm"),
      vocabularyWhy: t("collaboratorVocabularyWhy"),
      vocabularyReuse: t("collaboratorVocabularyReuse"),
      vocabularyReuseAction: t("collaboratorVocabularyReuseAction"),
      reviewFocus: t("collaboratorReviewFocus"),
      focusAlignVocabulary: t("collaboratorFocusAlignVocabulary"),
      focusTraceImpact: t("collaboratorFocusTraceImpact"),
      focusResolveOrphans: t("collaboratorFocusResolveOrphans"),
      decisionLane: t("collaboratorDecisionLane"),
      decisionOwner: t("collaboratorDecisionOwner"),
      decisionExpected: t("collaboratorDecisionExpected"),
      decisionNextStep: t("collaboratorDecisionNextStep"),
      decisionGraphHandoff: t("collaboratorDecisionGraphHandoff"),
      ...decisionLaneLabels,
      meetingAgenda: t("collaboratorMeetingAgenda"),
      meetingAgendaDecision: t("collaboratorMeetingAgendaDecision"),
      meetingAgendaEvidence: t("collaboratorMeetingAgendaEvidence"),
      meetingAgendaAction: t("collaboratorMeetingAgendaAction"),
      reviewQuestions: t("collaboratorReviewQuestions"),
      ...reviewQuestionLabels,
      noHubs: t("collaboratorNoHubs"),
      hubHandoff: t("collaboratorHubHandoff"),
      impactHandoff: t("collaboratorImpactHandoff"),
      impactHandoffExample: t("collaboratorImpactHandoffExample"),
      impactHandoffPath: t("collaboratorImpactHandoffPath"),
      openQuestionHandoff: t("collaboratorOpenQuestionHandoff"),
      ontology: t("collaboratorHandoffOntology"),
      builder: t("collaboratorHandoffBuilder"),
      handoff: t("collaboratorHandoff"),
      insights: t("collaboratorHandoffInsights"),
      topology: t("collaboratorHandoffTopology"),
      topologyFocus: t("collaboratorHandoffTopologyFocus"),
      topologyHealth: t("collaboratorHandoffTopologyHealth"),
      agentCheck: t("collaboratorHandoffAgentCheck"),
      agentCliCheck: t("collaboratorHandoffCliCheck"),
      agentMcpCheck: t("collaboratorHandoffMcpCheck"),
      impactCliCheck: t("collaboratorHandoffImpactCliCheck"),
      impactMcpCheck: t("collaboratorHandoffImpactMcpCheck"),
    },
    handoff: {
      insightsUrl:
        typeof window === "undefined" ? "/ontology/insights/" : window.location.href,
      topologyUrl: "/topology/?mode=health",
      agentCheckCommand: collaboratorCliCheckCommand,
      agentMcpCheckPayload: collaboratorMcpCheckPayload,
      impactCliCheckCommand,
      impactMcpCheckPayload,
    },
  });
  const vocabularyReviewText = formatInsightsVocabularyReview({
    brief,
    labels: {
      title: t("collaboratorInsightsTitle"),
      summary: t("collaboratorInsightsSubtitle"),
      nodes: metricLabels.nodes,
      relations: metricLabels.relations,
      domains: metricLabels.domains,
      crossDomain: metricLabels.crossDomain,
      orphans: metricLabels.orphans,
      topHubs: t("collaboratorTopHubs"),
      reviewVocabulary: t("collaboratorReviewVocabulary"),
      vocabularyTerm: t("collaboratorVocabularyTerm"),
      vocabularyWhy: t("collaboratorVocabularyWhy"),
      vocabularyReuse: t("collaboratorVocabularyReuse"),
      vocabularyReuseAction: t("collaboratorVocabularyReuseAction"),
      reviewFocus: t("collaboratorReviewFocus"),
      focusAlignVocabulary: t("collaboratorFocusAlignVocabulary"),
      focusTraceImpact: t("collaboratorFocusTraceImpact"),
      focusResolveOrphans: t("collaboratorFocusResolveOrphans"),
      decisionLane: t("collaboratorDecisionLane"),
      decisionOwner: t("collaboratorDecisionOwner"),
      decisionExpected: t("collaboratorDecisionExpected"),
      decisionNextStep: t("collaboratorDecisionNextStep"),
      decisionGraphHandoff: t("collaboratorDecisionGraphHandoff"),
      ...decisionLaneLabels,
      meetingAgenda: t("collaboratorMeetingAgenda"),
      meetingAgendaDecision: t("collaboratorMeetingAgendaDecision"),
      meetingAgendaEvidence: t("collaboratorMeetingAgendaEvidence"),
      meetingAgendaAction: t("collaboratorMeetingAgendaAction"),
      reviewQuestions: t("collaboratorReviewQuestions"),
      ...reviewQuestionLabels,
      noHubs: t("collaboratorNoHubs"),
      hubHandoff: t("collaboratorHubHandoff"),
      impactHandoff: t("collaboratorImpactHandoff"),
      impactHandoffExample: t("collaboratorImpactHandoffExample"),
      impactHandoffPath: t("collaboratorImpactHandoffPath"),
      openQuestionHandoff: t("collaboratorOpenQuestionHandoff"),
      ontology: t("collaboratorHandoffOntology"),
      builder: t("collaboratorHandoffBuilder"),
      handoff: t("collaboratorHandoff"),
      insights: t("collaboratorHandoffInsights"),
      topology: t("collaboratorHandoffTopology"),
      topologyFocus: t("collaboratorHandoffTopologyFocus"),
      topologyHealth: t("collaboratorHandoffTopologyHealth"),
      agentCheck: t("collaboratorHandoffAgentCheck"),
      agentCliCheck: t("collaboratorHandoffCliCheck"),
      agentMcpCheck: t("collaboratorHandoffMcpCheck"),
      impactCliCheck: t("collaboratorHandoffImpactCliCheck"),
      impactMcpCheck: t("collaboratorHandoffImpactMcpCheck"),
    },
  });
  const tabs: Array<{ key: CollaboratorBriefSection; label: string }> = [
    { key: "decision", label: t("collaboratorTabDecision") },
    { key: "evidence", label: t("collaboratorTabEvidence") },
    { key: "action", label: t("collaboratorTabAction") },
  ];

  return (
    <section
      className="min-w-0 rounded-2xl border border-[color:rgba(139,151,255,0.22)] bg-[color:rgba(139,151,255,0.055)] px-5 py-4 md:col-span-2"
      data-testid="insights-collaborator-brief"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:rgba(184,191,255,0.92)]">
            {t("collaboratorInsightsTitle")}
          </h2>
          <p className="mt-1 max-w-3xl break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
            {t("collaboratorInsightsSubtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <CopyAgentTextButton
            label={t("collaboratorCopyBrief")}
            copiedLabel={t("agentCopied")}
            text={copyTextValue}
            compact
          />
          <CopyAgentTextButton
            label={t("collaboratorCopyVocabulary")}
            copiedLabel={t("agentCopied")}
            text={vocabularyReviewText}
            compact
          />
          <CopyAgentTextButton
            label={t("collaboratorCopyCliCheck")}
            copiedLabel={t("agentCopied")}
            text={collaboratorCliCheckCommand}
            compact
          />
          <CopyAgentTextButton
            label={t("collaboratorCopyMcpCheck")}
            copiedLabel={t("agentCopied")}
            text={collaboratorMcpCheckPayload}
            compact
          />
        </div>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-5">
        {brief.summaryMetrics.map((metric) => (
          <div
            key={metric.key}
            className="rounded-md border border-[color:rgba(139,151,255,0.14)] bg-[color:rgba(3,7,18,0.12)] px-2.5 py-2"
          >
            <p className="truncate font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
              {metricLabels[metric.key]}
            </p>
            <p className="mt-1 font-mono text-sm tabular-nums text-[color:var(--color-text-primary)]">
              {metric.value}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="rounded-md border border-[color:rgba(139,151,255,0.14)] bg-[color:rgba(255,255,255,0.035)] px-3 py-2.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            {t("collaboratorTopHubs")}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {brief.topHubs.length > 0 ? (
              brief.topHubs.map((hub) => (
                <span
                  key={hub.id ?? hub.title}
                  className="flex max-w-full min-w-0 flex-wrap items-center gap-1 rounded border border-[color:rgba(139,151,255,0.16)] bg-[color:rgba(139,151,255,0.055)] px-2 py-1 text-[11px] text-[color:var(--color-text-secondary)]"
                >
                  <span className="max-w-[18rem] truncate">{hub.title}</span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
                    {hub.kind} · {hub.degree}
                  </span>
                  {hub.ontologyHref ? (
                    <Link
                      href={hub.ontologyHref}
                      className="font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-accent)] hover:underline"
                    >
                      {t("collaboratorHandoffOntology")}
                    </Link>
                  ) : null}
                  {hub.topologyHref ? (
                    <Link
                      href={hub.topologyHref}
                      className="font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-accent)] hover:underline"
                    >
                      {t("collaboratorHandoffTopologyFocus")}
                    </Link>
                  ) : null}
                  {hub.builderHref ? (
                    <Link
                      href={hub.builderHref}
                      className="font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-accent)] hover:underline"
                    >
                      {t("collaboratorHandoffBuilder")}
                    </Link>
                  ) : null}
                </span>
              ))
            ) : (
              <span className="text-[11px] text-[color:var(--color-text-tertiary)]">
                {t("collaboratorNoHubs")}
              </span>
            )}
          </div>
        </div>
        <div className="rounded-md border border-[color:rgba(73,190,146,0.18)] bg-[color:rgba(73,190,146,0.045)] px-3 py-2.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:rgba(151,230,198,0.92)]">
            {t("collaboratorReviewFocus")}
          </p>
          <p className="mt-2 break-keep text-[12px] leading-5 text-[color:var(--color-text-secondary)]">
            {focusLabel}
          </p>
          <div
            className="mt-2 grid grid-cols-3 gap-1 rounded border border-[color:rgba(73,190,146,0.16)] bg-[color:rgba(3,7,18,0.16)] p-1"
            role="tablist"
            aria-label={t("collaboratorTabsAriaLabel")}
          >
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                id={`collaborator-brief-${tab.key}-tab`}
                className="min-w-0 rounded px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:rgba(255,255,255,0.04)] hover:text-[color:var(--color-text-secondary)]"
                style={
                  activeSection === tab.key
                    ? {
                        backgroundColor: "rgba(73,190,146,0.18)",
                        color: "rgba(203,255,232,0.96)",
                      }
                    : undefined
                }
                role="tab"
                aria-selected={activeSection === tab.key}
                aria-controls={`collaborator-brief-${tab.key}-panel`}
                onClick={() => setActiveSection(tab.key)}
              >
                <span className="flex min-w-0 items-center justify-center gap-1">
                  {activeSection === tab.key ? (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:rgba(203,255,232,0.96)]" />
                  ) : null}
                  <span className="truncate">{tab.label}</span>
                </span>
              </button>
            ))}
          </div>

          {activeSection === "decision" ? (
            <div
              id="collaborator-brief-decision-panel"
              className="mt-2"
              role="tabpanel"
              aria-labelledby="collaborator-brief-decision-tab"
            >
              <dl
                className="grid gap-1.5 rounded border border-[color:rgba(73,190,146,0.14)] bg-[color:rgba(255,255,255,0.03)] px-2.5 py-2"
                data-testid="insights-collaborator-decision-lane"
              >
                <div className="min-w-0">
                  <dt className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                    {t("collaboratorDecisionOwner")}
                  </dt>
                  <dd className="mt-0.5 break-keep text-[11px] leading-4 text-[color:var(--color-text-secondary)]">
                    {decisionOwner}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                    {t("collaboratorDecisionExpected")}
                  </dt>
                  <dd className="mt-0.5 break-keep text-[11px] leading-4 text-[color:var(--color-text-secondary)]">
                    {decisionExpected}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                    {t("collaboratorDecisionNextStep")}
                  </dt>
                  <dd className="mt-0.5 break-keep text-[11px] leading-4 text-[color:var(--color-text-secondary)]">
                    {decisionNextStep}
                  </dd>
                </div>
                {brief.decisionHandoff && decisionHandoffLabel ? (
                  <div className="min-w-0 border-t border-[color:rgba(73,190,146,0.12)] pt-1.5">
                    <dt className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                      {t("collaboratorDecisionGraphHandoff")}
                    </dt>
                    <dd className="mt-1 min-w-0">
                      <Link
                        href={brief.decisionHandoff.href}
                        className="inline-flex max-w-full items-center rounded border border-[color:rgba(73,190,146,0.22)] bg-[color:rgba(73,190,146,0.07)] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-accent)] hover:underline"
                      >
                        <span className="truncate">{decisionHandoffLabel}</span>
                      </Link>
                    </dd>
                  </div>
                ) : null}
              </dl>
              <dl
                className="mt-2 grid gap-1.5 rounded border border-[color:rgba(73,190,146,0.14)] bg-[color:rgba(255,255,255,0.025)] px-2.5 py-2"
                data-testid="insights-collaborator-decision-record"
              >
                <div className="min-w-0">
                  <dt className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                    {t("collaboratorDecisionRecord")}
                  </dt>
                  <dd className="mt-0.5 break-keep text-[11px] leading-4 text-[color:var(--color-text-secondary)]">
                    {decisionExpected}
                  </dd>
                </div>
                <div className="grid gap-1 sm:grid-cols-3">
                  <div className="min-w-0">
                    <dt className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                      {t("collaboratorDecisionRecordOwner")}
                    </dt>
                    <dd className="mt-0.5 break-keep text-[10.5px] leading-4 text-[color:var(--color-text-tertiary)]">
                      {decisionOwner}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                      {t("collaboratorDecisionRecordEvidence")}
                    </dt>
                    <dd className="mt-0.5 truncate text-[10.5px] leading-4 text-[color:var(--color-text-tertiary)]">
                      {decisionHandoffLabel ?? focusLabel}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                      {t("collaboratorDecisionRecordFollowUp")}
                    </dt>
                    <dd className="mt-0.5 break-keep text-[10.5px] leading-4 text-[color:var(--color-text-tertiary)]">
                      {decisionNextStep}
                    </dd>
                  </div>
                </div>
              </dl>
            </div>
          ) : null}

          {activeSection === "evidence" ? (
            <div
              id="collaborator-brief-evidence-panel"
              className="mt-2 rounded border border-[color:rgba(73,190,146,0.14)] bg-[color:rgba(255,255,255,0.025)] px-2.5 py-2"
              role="tabpanel"
              aria-labelledby="collaborator-brief-evidence-tab"
            >
              <div data-testid="insights-collaborator-review-questions">
                <p className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                  {t("collaboratorReviewQuestions")}
                </p>
                <ul className="mt-1.5 space-y-1">
                  {reviewQuestions.map((question) => (
                    <li
                      key={question}
                      className="break-keep text-[11px] leading-4 text-[color:var(--color-text-tertiary)]"
                    >
                      {question}
                    </li>
                  ))}
                </ul>
              </div>
              {brief.impactHandoffs.length > 0 ? (
                <div
                  className="mt-2 border-t border-[color:rgba(73,190,146,0.14)] pt-2"
                  data-testid="insights-collaborator-impact-handoffs"
                >
                  <p className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                    {t("collaboratorImpactHandoff")}
                  </p>
                  <ul className="mt-1.5 space-y-1.5">
                    {brief.impactHandoffs.map((handoff) => (
                      <li
                        key={`${handoff.fromDomain}->${handoff.toDomain}`}
                        className="min-w-0 break-keep text-[11px] leading-4 text-[color:var(--color-text-tertiary)]"
                      >
                        <span className="text-[color:var(--color-text-secondary)]">
                          {handoff.fromDomain} → {handoff.toDomain}
                        </span>
                        <span className="font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                          {" "}
                          {handoff.count}
                        </span>
                        {handoff.example ? (
                          <span className="block truncate font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                            {handoff.example.from} --{handoff.example.type}--&gt;{" "}
                            {handoff.example.to}
                          </span>
                        ) : null}
                        {handoff.topologyPathHref ? (
                          <Link
                            href={handoff.topologyPathHref}
                            className="mt-1 inline-flex font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-accent)] hover:underline"
                          >
                            {t("collaboratorImpactHandoffPath")}
                          </Link>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {brief.openQuestions.length > 0 ? (
                <div
                  className="mt-2 border-t border-[color:rgba(73,190,146,0.14)] pt-2"
                  data-testid="insights-collaborator-open-questions"
                >
                  <p className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                    {t("collaboratorOpenQuestionHandoff")}
                  </p>
                  <ul className="mt-1.5 space-y-1.5">
                    {brief.openQuestions.map((question) => (
                      <li
                        key={question.id}
                        className="min-w-0 break-keep text-[11px] leading-4 text-[color:var(--color-text-tertiary)]"
                      >
                        <span className="text-[color:var(--color-text-secondary)]">
                          {question.title}
                        </span>
                        <span className="font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                          {" "}
                          {question.kind}
                        </span>
                        <span className="ml-1.5 inline-flex flex-wrap gap-1">
                          {question.ontologyHref ? (
                            <Link
                              href={question.ontologyHref}
                              className="font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-accent)] hover:underline"
                            >
                              {t("collaboratorHandoffOntology")}
                            </Link>
                          ) : null}
                          {question.topologyHref ? (
                            <Link
                              href={question.topologyHref}
                              className="font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-accent)] hover:underline"
                            >
                              {t("collaboratorHandoffTopologyHealth")}
                            </Link>
                          ) : null}
                          {question.builderHref ? (
                            <Link
                              href={question.builderHref}
                              className="font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-accent)] hover:underline"
                            >
                              {t("collaboratorHandoffBuilder")}
                            </Link>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {activeSection === "action" ? (
            <div
              id="collaborator-brief-action-panel"
              className="mt-2 rounded border border-[color:rgba(139,151,255,0.16)] bg-[color:rgba(139,151,255,0.045)] px-2.5 py-2"
              role="tabpanel"
              aria-labelledby="collaborator-brief-action-tab"
              data-testid="insights-collaborator-meeting-agenda"
            >
              <p className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                {t("collaboratorMeetingAgenda")}
              </p>
              <ol className="mt-1.5 space-y-1">
                {[
                  {
                    label: t("collaboratorMeetingAgendaDecision"),
                    value: decisionExpected,
                  },
                  {
                    label: t("collaboratorMeetingAgendaEvidence"),
                    value: decisionHandoffLabel ?? focusLabel,
                  },
                  {
                    label: t("collaboratorMeetingAgendaAction"),
                    value: decisionNextStep,
                  },
                ].map((item, index) => (
                  <li
                    key={item.label}
                    className="grid grid-cols-[18px_1fr] gap-1.5 text-[10.5px] leading-4 text-[color:var(--color-text-tertiary)]"
                  >
                    <span className="font-mono text-[9px] text-[color:rgba(200,210,255,0.82)]">
                      {index + 1}
                    </span>
                    <span className="break-keep">
                      <span className="text-[color:var(--color-text-secondary)]">
                        {item.label}:
                      </span>{" "}
                      {item.value}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
