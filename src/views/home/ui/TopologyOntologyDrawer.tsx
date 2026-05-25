"use client";

import {
  ArrowUpRight,
  Clipboard,
  FileText,
  GitBranch,
  PencilLine,
  X,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import {
  buildOntologyBuilderNodeHref,
  buildOntologyNodeHref,
} from "@/entities/knowledge-graph";
import { buildDocsVaultHref } from "@/entities/docs-vault";
import { copyText } from "@/shared/lib/copy-text";
import { useToast } from "@/shared/ui";
import { formatAgentPostChangeSyncPacket } from "@/shared/lib/ontology-tree";
import {
  buildTopologyOntologyDrawerModel,
  formatTopologyNodeImpactCliCheck,
  formatTopologyNodeImpactMcpCheck,
  formatTopologyNodeCliCheck,
  formatTopologyNodeMcpCheck,
  formatTopologyCollaboratorBrief,
  formatTopologyImpactRelation,
  formatTopologyVocabularyReview,
  topologyReviewQuestionsForReview,
} from "../lib/topology-ontology-drawer";

type CollaboratorLens = ReturnType<
  typeof buildTopologyOntologyDrawerModel
>["collaborator"]["lens"];
type CollaboratorReview = ReturnType<
  typeof buildTopologyOntologyDrawerModel
>["collaborator"]["review"];
type CollaboratorChip = ReturnType<
  typeof buildTopologyOntologyDrawerModel
>["collaborator"]["chips"][number];

interface Props {
  node: KnowledgeGraphNode;
  nodes: readonly KnowledgeGraphNode[];
  edges: readonly KnowledgeGraphEdge[];
  onClose: () => void;
  closeLabel: string;
  labels: {
    caption: string;
    source: string;
    noSource: string;
    relations: string;
    incoming: string;
    outgoing: string;
    noRelations: string;
    openOntology: string;
    openBuilder: string;
    openSource: string;
    collaboratorTitle: string;
    collaboratorBody: string;
    collaboratorCopy: string;
    collaboratorCopyVocabulary: string;
    collaboratorCopyCliProfile: string;
    collaboratorCopyMcpProfile: string;
    collaboratorCopyCliImpact: string;
    collaboratorCopyMcpImpact: string;
    collaboratorCopySyncGate: string;
    collaboratorCopySuccess: string;
    collaboratorCopyError: string;
    collaboratorBriefRelationTypes: string;
    collaboratorVocabularyTitle: string;
    collaboratorVocabularyMeaning: string;
    collaboratorVocabularyReuse: string;
    collaboratorVocabularyAnchors: string;
    collaboratorBriefReviewQuestions: string;
    collaboratorBriefImpactSummary: string;
    collaboratorBriefFirstIncoming: string;
    collaboratorBriefFirstOutgoing: string;
    collaboratorBriefNoImpactRelation: string;
    collaboratorBriefPreviewRelations: string;
    collaboratorBriefNoPreviewRelations: string;
    collaboratorBriefHandoff: string;
    collaboratorBriefTopology: string;
    collaboratorBriefOntology: string;
    collaboratorBriefBuilder: string;
    collaboratorBriefAgentCheck: string;
    collaboratorBriefMcpCheck: string;
    collaboratorBriefImpactCheck: string;
    collaboratorBriefMcpImpactCheck: string;
    collaboratorBriefSyncGate: string;
    collaboratorHandoffOrderTitle: string;
    collaboratorHandoffProfileStep: string;
    collaboratorHandoffImpactStep: string;
    collaboratorHandoffSyncStep: string;
    collaboratorLensLabels: Record<CollaboratorLens, string>;
    collaboratorReviewLabels: Record<CollaboratorReview, string>;
    collaboratorImpactLabels: Record<
      ReturnType<typeof buildTopologyOntologyDrawerModel>["impactSummary"]["level"],
      string
    >;
    collaboratorReviewQuestionLabels: Record<CollaboratorReview, readonly string[]>;
    collaboratorChipLabels: Record<CollaboratorChip, string>;
  };
}

export function TopologyOntologyDrawer({
  node,
  nodes,
  edges,
  onClose,
  closeLabel,
  labels,
}: Props) {
  const model = buildTopologyOntologyDrawerModel(node, nodes, edges);
  const toast = useToast();
  const sourceHref = model.sourceSlug
    ? buildDocsVaultHref({ slug: model.sourceSlug })
    : null;
  const ontologyHref = buildOntologyNodeHref(node.id);
  const builderHref = buildOntologyBuilderNodeHref(node);
  const agentCheckSlug = model.sourceSlug ?? node.id;
  const postChangeSyncPacket = formatAgentPostChangeSyncPacket();
  const copyCollaboratorBrief = async () => {
    const topologyUrl =
      typeof window === "undefined"
        ? `/topology/?p=${encodeURIComponent(node.id)}`
        : window.location.href;
    const text = formatTopologyCollaboratorBrief({
      node,
      model,
      labels: {
        lens: labels.collaboratorLensLabels[model.collaborator.lens],
        review: labels.collaboratorReviewLabels[model.collaborator.review],
        reviewQuestions: labels.collaboratorBriefReviewQuestions,
        impactSummary: labels.collaboratorBriefImpactSummary,
        impactSummaryText:
          labels.collaboratorImpactLabels[model.impactSummary.level],
        firstIncoming: labels.collaboratorBriefFirstIncoming,
        firstOutgoing: labels.collaboratorBriefFirstOutgoing,
        noImpactRelation: labels.collaboratorBriefNoImpactRelation,
        defineOwnerQuestions:
          labels.collaboratorReviewQuestionLabels.define_owner,
        explainUsageQuestions:
          labels.collaboratorReviewQuestionLabels.explain_usage,
        confirmDependentsQuestions:
          labels.collaboratorReviewQuestionLabels.confirm_dependents,
        traceImpactQuestions:
          labels.collaboratorReviewQuestionLabels.trace_impact,
        sourceFallback: labels.noSource,
        relationTypes: labels.collaboratorBriefRelationTypes,
        previewRelations: labels.collaboratorBriefPreviewRelations,
        noPreviewRelations: labels.collaboratorBriefNoPreviewRelations,
        handoff: labels.collaboratorBriefHandoff,
        topology: labels.collaboratorBriefTopology,
        ontology: labels.collaboratorBriefOntology,
        builder: labels.collaboratorBriefBuilder,
        agentCheck: labels.collaboratorBriefAgentCheck,
        mcpCheck: labels.collaboratorBriefMcpCheck,
        impactCheck: labels.collaboratorBriefImpactCheck,
        mcpImpactCheck: labels.collaboratorBriefMcpImpactCheck,
        syncGate: labels.collaboratorBriefSyncGate,
        incoming: labels.incoming,
        outgoing: labels.outgoing,
      },
      handoff: {
        topology: topologyUrl,
        ontology: ontologyHref,
        builder: builderHref,
        agentCheck: formatTopologyNodeCliCheck(agentCheckSlug),
        mcpCheck: formatTopologyNodeMcpCheck(agentCheckSlug),
        impactCheck: formatTopologyNodeImpactCliCheck(agentCheckSlug),
        mcpImpactCheck: formatTopologyNodeImpactMcpCheck(agentCheckSlug),
        syncGate: postChangeSyncPacket,
      },
    });

    if (await copyText(text)) {
      toast.show(labels.collaboratorCopySuccess, "success");
      return;
    }

    toast.show(labels.collaboratorCopyError, "error");
  };
  const copyCliProfileCheck = async () => {
    if (await copyText(formatTopologyNodeCliCheck(agentCheckSlug))) {
      toast.show(labels.collaboratorCopySuccess, "success");
      return;
    }

    toast.show(labels.collaboratorCopyError, "error");
  };
  const copyMcpProfileCheck = async () => {
    if (await copyText(formatTopologyNodeMcpCheck(agentCheckSlug))) {
      toast.show(labels.collaboratorCopySuccess, "success");
      return;
    }

    toast.show(labels.collaboratorCopyError, "error");
  };
  const copyVocabularyReview = async () => {
    const text = formatTopologyVocabularyReview({
      node,
      model,
      labels: {
        title: labels.collaboratorVocabularyTitle,
        meaningToKeep: labels.collaboratorVocabularyMeaning,
        reuseContext: labels.collaboratorVocabularyReuse,
        reviewQuestions: labels.collaboratorBriefReviewQuestions,
        relationAnchors: labels.collaboratorVocabularyAnchors,
        noPreviewRelations: labels.collaboratorBriefNoPreviewRelations,
        sourceFallback: labels.noSource,
        defineOwnerQuestions:
          labels.collaboratorReviewQuestionLabels.define_owner,
        explainUsageQuestions:
          labels.collaboratorReviewQuestionLabels.explain_usage,
        confirmDependentsQuestions:
          labels.collaboratorReviewQuestionLabels.confirm_dependents,
        traceImpactQuestions:
          labels.collaboratorReviewQuestionLabels.trace_impact,
        incoming: labels.incoming,
        outgoing: labels.outgoing,
      },
    });

    if (await copyText(text)) {
      toast.show(labels.collaboratorCopySuccess, "success");
      return;
    }

    toast.show(labels.collaboratorCopyError, "error");
  };
  const copyCliImpactCheck = async () => {
    if (await copyText(formatTopologyNodeImpactCliCheck(agentCheckSlug))) {
      toast.show(labels.collaboratorCopySuccess, "success");
      return;
    }

    toast.show(labels.collaboratorCopyError, "error");
  };
  const copyMcpImpactCheck = async () => {
    if (await copyText(formatTopologyNodeImpactMcpCheck(agentCheckSlug))) {
      toast.show(labels.collaboratorCopySuccess, "success");
      return;
    }

    toast.show(labels.collaboratorCopyError, "error");
  };
  const copySyncGate = async () => {
    if (await copyText(postChangeSyncPacket)) {
      toast.show(labels.collaboratorCopySuccess, "success");
      return;
    }

    toast.show(labels.collaboratorCopyError, "error");
  };
  const reviewQuestions = topologyReviewQuestionsForReview(
    model.collaborator.review,
    {
      defineOwnerQuestions: labels.collaboratorReviewQuestionLabels.define_owner,
      explainUsageQuestions:
        labels.collaboratorReviewQuestionLabels.explain_usage,
      confirmDependentsQuestions:
        labels.collaboratorReviewQuestionLabels.confirm_dependents,
      traceImpactQuestions: labels.collaboratorReviewQuestionLabels.trace_impact,
    },
  );

  return (
    <aside
      role="dialog"
      aria-label={node.title}
      className="fixed right-0 top-0 z-50 flex h-dvh w-full flex-col gap-4 overflow-y-auto border-l border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-5 py-5 shadow-[0_24px_48px_rgba(0,0,0,0.24)] sm:w-[400px] md:px-6"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex flex-col gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {labels.caption}
          </span>
          <span className="inline-flex w-fit items-center rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.10em] text-[color:var(--color-text-tertiary)]">
            {node.kind}
          </span>
          <h2 className="break-keep text-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {node.title}
          </h2>
          <p className="break-all font-mono text-[11px] text-[color:var(--color-text-quaternary)]">
            {node.id}
          </p>
        </div>
        <div className="mt-3 rounded-md border border-[color:rgba(94,106,210,0.18)] bg-[color:rgba(14,16,22,0.18)] px-2.5 py-2">
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            {labels.collaboratorBriefImpactSummary}
          </p>
          <p className="mt-1.5 break-keep text-[11.5px] leading-5 text-[color:var(--color-text-secondary)]">
            {labels.collaboratorImpactLabels[model.impactSummary.level]}
          </p>
          <dl className="mt-2 flex flex-col gap-1 text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
            <div className="flex min-w-0 gap-2">
              <dt className="shrink-0 font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                {labels.collaboratorBriefFirstIncoming}
              </dt>
              <dd className="min-w-0 flex-1 truncate">
                {formatTopologyImpactRelation(
                  model.impactSummary.firstIncoming,
                  labels.collaboratorBriefNoImpactRelation,
                )}
              </dd>
            </div>
            <div className="flex min-w-0 gap-2">
              <dt className="shrink-0 font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                {labels.collaboratorBriefFirstOutgoing}
              </dt>
              <dd className="min-w-0 flex-1 truncate">
                {formatTopologyImpactRelation(
                  model.impactSummary.firstOutgoing,
                  labels.collaboratorBriefNoImpactRelation,
                )}
              </dd>
            </div>
          </dl>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)]"
        >
          <X size={16} />
        </button>
      </header>

      {node.summary ? (
        <p className="break-keep text-sm leading-6 text-[color:var(--color-text-secondary)]">
          {node.summary}
        </p>
      ) : null}

      <section className="rounded-lg border border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.07)] p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {labels.collaboratorTitle}
            </p>
            <p className="mt-1 break-keep text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
              {labels.collaboratorLensLabels[model.collaborator.lens]}
            </p>
          </div>
          <span className="shrink-0 rounded-sm border border-[color:rgba(94,106,210,0.28)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:rgba(139,151,255,0.95)]">
            {node.kind}
          </span>
        </div>
        <p className="mt-2 break-keep text-[12px] leading-5 text-[color:var(--color-text-secondary)]">
          {labels.collaboratorBody}
        </p>
        <p className="mt-2 break-keep text-[12px] leading-5 text-[color:var(--color-text-primary)]">
          {labels.collaboratorReviewLabels[model.collaborator.review]}
        </p>
        <div className="mt-3 rounded-md border border-[color:rgba(94,106,210,0.18)] bg-[color:rgba(14,16,22,0.22)] px-2.5 py-2">
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            {labels.collaboratorBriefReviewQuestions}
          </p>
          <ul className="mt-1.5 flex flex-col gap-1 text-[11.5px] leading-5 text-[color:var(--color-text-secondary)]">
            {reviewQuestions.map((question) => (
              <li key={question} className="break-keep">
                {question}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-3 rounded-md border border-[color:rgba(94,106,210,0.18)] bg-[color:rgba(14,16,22,0.22)] px-2.5 py-2">
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            {labels.collaboratorHandoffOrderTitle}
          </p>
          <ol className="mt-1.5 flex flex-col gap-1 text-[11.5px] leading-5 text-[color:var(--color-text-secondary)]">
            <li className="grid grid-cols-[1.25rem_1fr] gap-2">
              <span className="font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                1
              </span>
              <span className="min-w-0">
                {labels.collaboratorHandoffProfileStep}
                <span className="mt-0.5 block truncate font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                  node_profile · {agentCheckSlug}
                </span>
              </span>
            </li>
            <li className="grid grid-cols-[1.25rem_1fr] gap-2">
              <span className="font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                2
              </span>
              <span className="min-w-0">
                {labels.collaboratorHandoffImpactStep}
                <span className="mt-0.5 block truncate font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                  blast_radius · incoming · depth 2
                </span>
              </span>
            </li>
            <li className="grid grid-cols-[1.25rem_1fr] gap-2">
              <span className="font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                3
              </span>
              <span className="min-w-0">
                {labels.collaboratorHandoffSyncStep}
                <span className="mt-0.5 block truncate font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                  health · cycles · growth_plan · maintenance_plan · validate
                </span>
              </span>
            </li>
          </ol>
        </div>
        <button
          type="button"
          onClick={copyCollaboratorBrief}
          className="mt-3 inline-flex h-7 items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.28)] px-2 text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.44)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)]"
        >
          <Clipboard size={12} aria-hidden />
          {labels.collaboratorCopy}
        </button>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={copyVocabularyReview}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.28)] bg-[color:rgba(94,106,210,0.08)] px-2 text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.44)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)]"
          >
            <Clipboard size={12} aria-hidden />
            {labels.collaboratorCopyVocabulary}
          </button>
          <button
            type="button"
            onClick={copyCliProfileCheck}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.28)] bg-[color:rgba(94,106,210,0.08)] px-2 text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.44)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)]"
          >
            <Clipboard size={12} aria-hidden />
            {labels.collaboratorCopyCliProfile}
          </button>
          <button
            type="button"
            onClick={copyMcpProfileCheck}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.28)] bg-[color:rgba(94,106,210,0.08)] px-2 text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.44)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)]"
          >
            <Clipboard size={12} aria-hidden />
            {labels.collaboratorCopyMcpProfile}
          </button>
          <button
            type="button"
            onClick={copyCliImpactCheck}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.28)] bg-[color:rgba(94,106,210,0.08)] px-2 text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.44)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)]"
          >
            <Clipboard size={12} aria-hidden />
            {labels.collaboratorCopyCliImpact}
          </button>
          <button
            type="button"
            onClick={copyMcpImpactCheck}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.28)] bg-[color:rgba(94,106,210,0.08)] px-2 text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.44)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)]"
          >
            <Clipboard size={12} aria-hidden />
            {labels.collaboratorCopyMcpImpact}
          </button>
          <button
            type="button"
            onClick={copySyncGate}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.28)] bg-[color:rgba(94,106,210,0.08)] px-2 text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.44)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)]"
          >
            <Clipboard size={12} aria-hidden />
            {labels.collaboratorCopySyncGate}
          </button>
        </div>
        {model.collaborator.chips.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {model.collaborator.chips.map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(14,16,22,0.28)] px-2 py-0.5 text-[10.5px] text-[color:var(--color-text-tertiary)]"
              >
                {labels.collaboratorChipLabels[chip]}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {labels.relations}
            </p>
            <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
              {labels.outgoing}: {model.outgoingCount} · {labels.incoming}: {model.incomingCount}
            </p>
          </div>
          <GitBranch size={16} className="text-[color:var(--color-indigo-accent)]" />
        </div>
        {model.relationCounts.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {model.relationCounts.map((row) => (
              <span
                key={row.type}
                className="rounded-full border border-[color:var(--color-overlay-3)] px-2 py-0.5 font-mono text-[10px] text-[color:var(--color-text-tertiary)]"
              >
                {row.type} {row.count}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs leading-5 text-[color:var(--color-text-tertiary)]">
            {labels.noRelations}
          </p>
        )}
        {model.previewRelations.length > 0 ? (
          <ol className="mt-3 flex flex-col gap-2">
            {model.previewRelations.map((relation) => (
              <li
                key={relation.edge.id}
                className="rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-2.5 py-2"
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                  {relation.direction === "outgoing" ? labels.outgoing : labels.incoming} · {relation.edge.type}
                </p>
                <p className="mt-1 truncate text-xs text-[color:var(--color-text-secondary)]">
                  {relation.other?.title ?? relation.edge.id}
                </p>
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      <section className="rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          {labels.source}
        </p>
        {sourceHref ? (
          <Link
            href={sourceHref}
            className="mt-2 inline-flex items-center gap-1.5 text-sm text-[color:var(--color-text-secondary)] transition-colors hover:text-[color:var(--color-text-primary)]"
          >
            <FileText size={14} aria-hidden />
            <span className="break-all font-mono text-[11px]">{model.sourceSlug}</span>
          </Link>
        ) : (
          <p className="mt-2 text-xs leading-5 text-[color:var(--color-text-tertiary)]">
            {labels.noSource}
          </p>
        )}
      </section>

      <div className="sticky bottom-0 -mx-5 mt-auto flex flex-col gap-2 border-t border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 md:-mx-6 md:px-6">
        <Link
          href={ontologyHref}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.10)] px-3 text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-brand)] hover:bg-[color:rgba(94,106,210,0.16)]"
        >
          {labels.openOntology}
          <ArrowUpRight size={14} aria-hidden />
        </Link>
        <Link
          href={builderHref}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-sm text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
        >
          <PencilLine size={14} aria-hidden />
          {labels.openBuilder}
        </Link>
        {sourceHref ? (
          <Link
            href={sourceHref}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-sm text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
          >
            <FileText size={14} aria-hidden />
            {labels.openSource}
          </Link>
        ) : null}
      </div>
    </aside>
  );
}
