"use client";

import type React from "react";
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
import type { VaultRelationKey } from "@/entities/docs-vault/lib/relation-proposal";
import { InlineFieldEdit, type InlineFieldEditLabels } from "./InlineFieldEdit";
import {
  NodeExplanationEdit,
  type NodeExplanationEditLabels,
} from "./NodeExplanationEdit";
import {
  RelationCreateForm,
  type RelationCreateFormLabels,
  type RelationTargetOption,
} from "./RelationCreateForm";
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
    openTopologyFocus: string;
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
  /**
   * S1.1.1b — 토폴로지를 1차 편집 surface 로. 쓰기 가능한 vault 의 노드면
   * HomePage 가 domain 인라인 편집을 주입. null/미지정이면 읽기 전용(현행).
   */
  domainEdit?: {
    value: string;
    onSave: (next: string) => void | Promise<void>;
    labels: InlineFieldEditLabels;
  } | null;
  /**
   * S3.1b — 토폴로지에서 선택 노드(source)로부터 관계를 긋는다. writable vault
   * 면 HomePage 가 후보 target + onCreate 주입. null 이면 관계 추가 UI 숨김.
   */
  relationEdit?: {
    targets: readonly RelationTargetOption[];
    relationKeys: readonly VaultRelationKey[];
    defaultRelationKey?: VaultRelationKey;
    onCreate: (input: { targetSlug: string; relationKey: VaultRelationKey }) => void | Promise<void>;
    labels: RelationCreateFormLabels;
  } | null;
  /**
   * S4.1b — "문서 = 노드 설명". writable vault 면 HomePage 가 *전체 본문*(raw 에서
   * 로드, manifest excerpt 아님)과 onSave 를 주입 → 읽기 전용 summary details 대신
   * NodeExplanationEdit 로 본문 편집. null 이면 기존 summary details(읽기) 유지.
   */
  explanationEdit?: {
    value: string;
    onSave: (next: string) => void | Promise<void>;
    labels: NodeExplanationEditLabels;
  } | null;
}

export function TopologyOntologyDrawer({
  node,
  nodes,
  edges,
  onClose,
  closeLabel,
  labels,
  domainEdit,
  relationEdit,
  explanationEdit,
}: Props) {
  const model = buildTopologyOntologyDrawerModel(node, nodes, edges);
  const toast = useToast();
  const sourceHref = model.sourceSlug
    ? buildDocsVaultHref({ slug: model.sourceSlug })
    : null;
  const topologyFocusHref = buildTopologyFocusHref(node.id);
  const ontologyHref = buildOntologyNodeHref(node.id);
  const builderHref = buildOntologyBuilderNodeHref(node);
  const agentCheckSlug = model.sourceSlug ?? node.id;
  const displayTitle = compactNodeTitle(node.title);
  const sourceLabel = model.sourceSlug ? compactSourceLabel(model.sourceSlug) : null;
  const postChangeSyncPacket = formatAgentPostChangeSyncPacket();
  const copyCollaboratorBrief = async () => {
    const topologyUrl =
      typeof window === "undefined"
        ? topologyFocusHref
        : buildTopologyFocusUrl(window.location.href, node.id);
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
      aria-label={displayTitle}
      className="fixed right-0 top-0 z-50 flex h-dvh w-full min-w-0 flex-col gap-3 overflow-y-auto border-l border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-5 py-5 shadow-[0_24px_48px_rgba(0,0,0,0.24)] sm:w-[380px] md:px-5"
    >
      <header className="grid min-w-0 gap-2">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 flex flex-col gap-1.5">
            <h2 className="[overflow-wrap:anywhere] text-lg leading-7 font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
              {displayTitle}
            </h2>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center rounded border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-tertiary)]">
                {labels.collaboratorLensLabels[model.collaborator.lens]}
              </span>
            </div>
          </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-strong)]"
        >
          <X size={16} />
        </button>
        </div>
      </header>

      {domainEdit ? (
        <div className="border-t border-[color:var(--color-border-soft)] pt-3" data-testid="drawer-domain-edit">
          <InlineFieldEdit
            value={domainEdit.value}
            onSave={domainEdit.onSave}
            labels={domainEdit.labels}
          />
        </div>
      ) : null}

      {relationEdit ? (
        <div className="border-t border-[color:var(--color-border-soft)] pt-3" data-testid="drawer-relation-edit">
          <RelationCreateForm
            targets={relationEdit.targets}
            relationKeys={relationEdit.relationKeys}
            defaultRelationKey={relationEdit.defaultRelationKey}
            onCreate={relationEdit.onCreate}
            labels={relationEdit.labels}
          />
        </div>
      ) : null}

      {explanationEdit ? (
        <div className="border-t border-[color:var(--color-border-soft)] pt-3" data-testid="drawer-explanation-edit">
          <NodeExplanationEdit
            value={explanationEdit.value}
            onSave={explanationEdit.onSave}
            labels={explanationEdit.labels}
          />
        </div>
      ) : node.summary ? (
        <details>
          <summary className="cursor-pointer list-none font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]">
            설명
          </summary>
          <p className="mt-2 line-clamp-3 [overflow-wrap:anywhere] text-[12px] leading-5 text-[color:var(--color-text-secondary)]">
            {node.summary}
          </p>
        </details>
      ) : null}

      <section className="border-t border-[color:var(--color-border-soft)] pt-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {labels.relations}
            </p>
            <p className="mt-1 text-[12px] text-[color:var(--color-text-secondary)]">
              {labels.outgoing}: {model.outgoingCount} · {labels.incoming}: {model.incomingCount}
            </p>
          </div>
          <GitBranch size={15} className="text-[color:var(--color-text-quaternary)]" />
        </div>
        {model.relationCounts.length === 0 ? (
          <p className="mt-2 text-xs leading-5 text-[color:var(--color-text-tertiary)]">
            {labels.noRelations}
          </p>
        ) : null}
        {model.previewRelations.length > 0 ? (
          <details className="mt-2">
            <summary className="cursor-pointer list-none font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]">
              {labels.collaboratorBriefPreviewRelations}
            </summary>
            <ol className="mt-2 flex flex-col gap-1">
              {model.previewRelations.map((relation) => (
                <li
                  key={relation.edge.id}
                  className="grid min-w-0 grid-cols-[auto_1fr] gap-2 border-t border-[color:var(--color-border-soft)] py-1.5 first:border-t-0"
                >
                  <span className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                    {relation.direction === "outgoing" ? labels.outgoing : labels.incoming}
                  </span>
                  <span className="min-w-0 truncate text-[11px] text-[color:var(--color-text-secondary)]">
                    {relation.other?.title ?? relation.edge.id}
                  </span>
                </li>
              ))}
            </ol>
          </details>
        ) : null}
      </section>

      <section className="border-t border-[color:var(--color-border-soft)] pt-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          {labels.source}
        </p>
        {sourceHref ? (
          <Link
            href={sourceHref}
            className="mt-2 inline-flex items-center gap-1.5 text-sm text-[color:var(--color-text-secondary)] transition-colors hover:text-[color:var(--color-text-primary)]"
          >
            <FileText size={14} aria-hidden />
            <span className="text-[12px]">{sourceLabel}</span>
          </Link>
        ) : (
          <p className="mt-2 text-xs leading-5 text-[color:var(--color-text-tertiary)]">
            {labels.noSource}
          </p>
        )}
      </section>

      <details className="border-t border-[color:var(--color-border-soft)] pt-3">
        <summary className="cursor-pointer list-none font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]">
          {labels.collaboratorTitle}
        </summary>
        <div className="mt-3 grid gap-3">
          <div>
            <p className="text-[12px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
              {labels.collaboratorReviewLabels[model.collaborator.review]}
            </p>
            <p className="mt-1 text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
              {labels.collaboratorImpactLabels[model.impactSummary.level]}
            </p>
          </div>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
              {labels.collaboratorBriefReviewQuestions}
            </p>
            <ul className="mt-1 flex flex-col gap-1 text-[11px] leading-5 text-[color:var(--color-text-secondary)]">
              {reviewQuestions.map((question) => (
                <li key={question} className="break-keep">
                  {question}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
              {labels.collaboratorHandoffOrderTitle}
            </p>
            <ol className="mt-1 flex flex-col gap-1 text-[11px] leading-5 text-[color:var(--color-text-secondary)]">
              <li>{labels.collaboratorHandoffProfileStep}</li>
              <li>{labels.collaboratorHandoffImpactStep}</li>
              <li>{labels.collaboratorHandoffSyncStep}</li>
            </ol>
          </div>
          <div className="flex flex-wrap gap-1">
            <CompactDrawerButton onClick={copyCollaboratorBrief}>
              {labels.collaboratorCopy}
            </CompactDrawerButton>
            <CompactDrawerButton onClick={copyVocabularyReview}>
              {labels.collaboratorCopyVocabulary}
            </CompactDrawerButton>
            <CompactDrawerButton onClick={copyCliProfileCheck}>
              {labels.collaboratorCopyCliProfile}
            </CompactDrawerButton>
            <CompactDrawerButton onClick={copyMcpProfileCheck}>
              {labels.collaboratorCopyMcpProfile}
            </CompactDrawerButton>
            <CompactDrawerButton onClick={copyCliImpactCheck}>
              {labels.collaboratorCopyCliImpact}
            </CompactDrawerButton>
            <CompactDrawerButton onClick={copyMcpImpactCheck}>
              {labels.collaboratorCopyMcpImpact}
            </CompactDrawerButton>
            <CompactDrawerButton onClick={copySyncGate}>
              {labels.collaboratorCopySyncGate}
            </CompactDrawerButton>
          </div>
        </div>
      </details>

      <div className="sticky bottom-0 -mx-5 mt-auto flex flex-col gap-2 border-t border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 md:-mx-6 md:px-6">
        <Link
          href={topologyFocusHref}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-overlay-2)] px-3 text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-overlay-3)]"
        >
          <GitBranch size={14} aria-hidden />
          {labels.openTopologyFocus}
        </Link>
        <Link
          href={ontologyHref}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-sm text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
        >
          {labels.openOntology}
          <ArrowUpRight size={14} aria-hidden />
        </Link>
        <Link
          href={builderHref}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-sm text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
        >
          <PencilLine size={14} aria-hidden />
          {labels.openBuilder}
        </Link>
        {sourceHref ? (
          <Link
            href={sourceHref}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-sm text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
          >
            <FileText size={14} aria-hidden />
            {labels.openSource}
          </Link>
        ) : null}
      </div>
    </aside>
  );
}

function buildTopologyFocusHref(nodeId: string): string {
  return `/topology/?mode=focus&p=${encodeURIComponent(nodeId)}`;
}

function compactNodeTitle(title: string): string {
  const stripped = title.replace(/\s*\(.*$/, "").trim();
  return stripped.length > 0 ? stripped : title;
}

function compactSourceLabel(slug: string): string {
  const normalized = slug.replace(/\.md$/i, "").replace(/^ontology\//, "");
  const last = normalized.split("/").filter(Boolean).at(-1);
  return last ?? normalized;
}

function CompactDrawerButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 text-[10px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-strong)]"
    >
      <Clipboard size={11} aria-hidden />
      {children}
    </button>
  );
}

function buildTopologyFocusUrl(currentUrl: string, nodeId: string): string {
  const url = new URL(currentUrl);
  if (!url.pathname.endsWith("/topology/") && !url.pathname.endsWith("/topology")) {
    url.pathname = "/topology/";
  }
  url.searchParams.set("mode", "focus");
  url.searchParams.set("p", nodeId);
  url.searchParams.delete("pathFrom");
  url.searchParams.delete("pathTo");
  return url.toString();
}
