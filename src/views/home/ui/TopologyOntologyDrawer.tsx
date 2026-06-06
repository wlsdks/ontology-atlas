"use client";

import type React from "react";
import { useState } from "react";
import { createPortal } from "react-dom";
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
import { getTopologyFocusHref } from "@/entities/project";
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
import { compactOntologyDescription } from "@/shared/lib/ontology-description";
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
type DetailTab = "overview" | "relations" | "agent" | "actions";

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
    description: string;
    keyFacts: string;
    fullNote: string;
    domainContext: string;
    relations: string;
    incoming: string;
    outgoing: string;
    reachTitle: string;
    reachDependents: string;
    reachDependencies: string;
    reachShowOnMap: string;
    reachHideOnMap: string;
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
  /**
   * "지도에서 영향 보기" 토글 상태 + 핸들러. blast-radius 숫자를 그래프에서
   * 공간적으로(전이 영향 부분그래프 하이라이트). 미지정이면 버튼 숨김.
   */
  impactActive?: boolean;
  onToggleImpact?: () => void;
  /**
   * 관계 미리보기 행의 상대 노드를 클릭하면 그 노드로 이동(토폴로지 선택 +
   * drawer 교체) — graph-DB 를 클릭으로 *탐색*. 미지정이면 행은 읽기 전용 텍스트.
   */
  onSelectNode?: (slug: string) => void;
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
  impactActive = false,
  onToggleImpact,
  onSelectNode,
}: Props) {
  const model = buildTopologyOntologyDrawerModel(node, nodes, edges);
  const toast = useToast();
  const sourceHref = model.sourceSlug
    ? buildDocsVaultHref({ slug: model.sourceSlug })
    : null;
  const topologyFocusHref = getTopologyFocusHref(node.id);
  const ontologyHref = buildOntologyNodeHref(node.id);
  const builderHref = buildOntologyBuilderNodeHref(node);
  const agentCheckSlug = model.sourceSlug ?? node.id;
  const displayTitle = compactNodeTitle(node.title);
  const sourceLabel = model.sourceSlug ? compactSourceLabel(model.sourceSlug) : null;
  const compactSummary = compactOntologyDescription(node.summary, 96);
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
        // iter 3 의 drawer reach 라벨 재사용 — brief 도 같은 전이 영향 범위를
        // 에이전트 핸드오프 텍스트에 노출(새 i18n 키 없이).
        reachTitle: labels.reachTitle,
        reachDependents: labels.reachDependents,
        reachDependencies: labels.reachDependencies,
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
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const detailTabs: ReadonlyArray<{ id: DetailTab; label: string }> = [
    { id: "overview", label: labels.caption },
    { id: "relations", label: labels.relations },
    { id: "agent", label: labels.collaboratorTitle },
    { id: "actions", label: labels.openBuilder },
  ];

  const detailDialog = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color:rgba(0,0,0,0.72)] px-2 py-3 sm:px-4 md:px-5"
      data-testid="topology-node-detail-modal-backdrop"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={displayTitle}
        className="flex h-[min(56rem,calc(100dvh-1.5rem))] w-[min(92rem,calc(100vw-1rem))] min-w-0 flex-col overflow-hidden rounded-xl border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-[0_30px_96px_rgba(0,0,0,0.56)] sm:w-[min(92rem,calc(100vw-2rem))]"
        data-testid="topology-node-detail-modal"
        onClick={(event) => event.stopPropagation()}
      >
      <header className="grid min-w-0 gap-2 border-b border-[color:var(--color-border-soft)] px-5 py-4 md:px-6 md:py-5">
        <div className="flex min-w-0 items-start justify-between gap-4">
          <div className="min-w-0 flex flex-col gap-1.5">
            <h2 className="[overflow-wrap:anywhere] text-2xl leading-tight font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] md:text-3xl">
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
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-strong)]"
        >
          <X size={16} />
        </button>
        </div>
      </header>

      <div
        className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-4 py-4 md:grid-cols-[14rem_minmax(0,1fr)] md:items-start md:px-5 lg:grid-cols-[16rem_minmax(0,1fr)] lg:px-6"
        data-testid="topology-node-detail-workbench"
      >
        <nav
          aria-label={`${displayTitle} sections`}
          className="grid gap-1.5 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-1.5 sm:grid-cols-4 md:sticky md:top-0 md:grid-cols-1 md:p-2"
          data-layout="lnb"
          data-testid="topology-node-detail-section-nav"
        >
          {detailTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-current={activeTab === tab.id ? "page" : undefined}
              onClick={() => setActiveTab(tab.id)}
              className={
                activeTab === tab.id
                  ? "inline-flex min-h-10 items-center justify-center rounded-md bg-[color:rgba(94,106,210,0.16)] px-3 text-center text-[12px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] ring-1 ring-[color:rgba(139,151,255,0.36)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.52)] focus-visible:ring-inset md:min-h-12 md:justify-start md:text-left md:text-[13px]"
                  : "inline-flex min-h-10 items-center justify-center rounded-md px-3 text-center text-[12px] font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)] transition-colors hover:bg-[color:rgba(94,106,210,0.10)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.42)] focus-visible:ring-inset md:min-h-12 md:justify-start md:text-left md:text-[13px]"
              }
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0" data-active-tab={activeTab}>

      <section
        id="topology-node-overview"
        className={`gap-3 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-4 md:px-5 md:py-5 ${
          activeTab === "overview" ? "grid" : "hidden"
        }`}
        data-testid="drawer-node-profile"
      >
        <div className="grid gap-1.5 sm:grid-cols-[7rem_1fr] sm:gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            {labels.caption}
          </p>
          <p className="min-w-0 text-sm leading-6 text-[color:var(--color-text-secondary)]">
            {labels.collaboratorLensLabels[model.collaborator.lens]}
          </p>
        </div>
        {compactSummary ? (
          <div className="grid gap-1.5 sm:grid-cols-[7rem_1fr] sm:gap-3" data-testid="drawer-profile-description">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
              {labels.description}
            </p>
            <p className="min-w-0 [overflow-wrap:anywhere] text-sm leading-6 text-[color:var(--color-text-primary)] md:text-[15px]">
              {compactSummary}
            </p>
          </div>
        ) : null}
        {sourceLabel ? (
          <div className="grid gap-1.5 sm:grid-cols-[7rem_1fr] sm:gap-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
              {labels.source}
            </p>
            <p className="min-w-0 truncate font-mono text-[12px] leading-6 text-[color:var(--color-text-tertiary)]">
              {sourceLabel}
            </p>
          </div>
        ) : null}
        <div
          className="grid gap-3 border-t border-[color:var(--color-border-soft)] pt-3"
          data-testid="drawer-key-facts"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            {labels.keyFacts}
          </p>
          <dl className="grid grid-cols-1 gap-2 text-[12px] leading-5 sm:grid-cols-2 xl:grid-cols-3">
            <div className="min-w-0 rounded-md border border-[color:var(--color-overlay-2)] bg-[color:var(--color-panel)] px-3 py-2">
              <dt className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                {labels.caption}
              </dt>
              <dd className="mt-0.5 min-w-0 [overflow-wrap:anywhere] text-[color:var(--color-text-secondary)]">
                {labels.collaboratorLensLabels[model.collaborator.lens]}
              </dd>
            </div>
            <div className="min-w-0 rounded-md border border-[color:var(--color-overlay-2)] bg-[color:var(--color-panel)] px-3 py-2">
              <dt className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                {labels.source}
              </dt>
              <dd className="mt-0.5 min-w-0 [overflow-wrap:anywhere] font-mono text-[color:var(--color-text-secondary)]">
                {model.sourceSlug ?? labels.noSource}
              </dd>
            </div>
            {model.ownerDomain ? (
              <div className="min-w-0 rounded-md border border-[color:var(--color-overlay-2)] bg-[color:var(--color-panel)] px-3 py-2">
                <dt className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                  {labels.domainContext}
                </dt>
                <dd className="mt-0.5 min-w-0 [overflow-wrap:anywhere] text-[color:var(--color-text-secondary)]">
                  {model.ownerDomain.title}
                </dd>
              </div>
            ) : null}
            <div className="min-w-0 rounded-md border border-[color:var(--color-overlay-2)] bg-[color:var(--color-panel)] px-3 py-2">
              <dt className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                {labels.relations}
              </dt>
              <dd className="mt-0.5 min-w-0 text-[color:var(--color-text-secondary)]">
                {labels.outgoing} {model.outgoingCount} · {labels.incoming}{" "}
                {model.incomingCount}
              </dd>
            </div>
            <div className="min-w-0 rounded-md border border-[color:var(--color-overlay-2)] bg-[color:var(--color-panel)] px-3 py-2">
              <dt className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                {labels.reachTitle}
              </dt>
              <dd className="mt-0.5 min-w-0 text-[color:var(--color-text-secondary)]">
                {labels.reachDependents} {model.reach.dependents} ·{" "}
                {labels.reachDependencies} {model.reach.dependencies}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {domainEdit ? (
        <div
          className={`border-t border-[color:var(--color-border-soft)] pt-3 ${
            activeTab === "overview" ? "block" : "hidden"
          }`}
          data-testid="drawer-domain-edit"
        >
          <InlineFieldEdit
            value={domainEdit.value}
            onSave={domainEdit.onSave}
            labels={domainEdit.labels}
          />
        </div>
      ) : model.ownerDomain ? (
        /* read-only 모드(vault 비-writable): 소유 domain = 비즈니스 영역 context.
           writable 이면 위 domainEdit 인풋이 대신 보인다. */
        <div
          className={`border-t border-[color:var(--color-border-soft)] pt-3 ${
            activeTab === "overview" ? "block" : "hidden"
          }`}
          data-testid="drawer-domain-context"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {labels.domainContext}
          </p>
          <p className="mt-1 text-[12px] text-[color:var(--color-text-secondary)]">
            {model.ownerDomain.title}
          </p>
        </div>
      ) : null}

      {relationEdit ? (
        <div
          className={`rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-3 ${
            activeTab === "relations" ? "block" : "hidden"
          }`}
          data-testid="drawer-relation-edit"
        >
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
        <details
          className={`border-t border-[color:var(--color-border-soft)] pt-3 ${
            activeTab === "overview" ? "block" : "hidden"
          }`}
          data-testid="drawer-explanation-details"
        >
          <summary className="cursor-pointer list-none font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]">
            {labels.fullNote}
          </summary>
          <div className="mt-2" data-testid="drawer-explanation-edit">
            <NodeExplanationEdit
              value={explanationEdit.value}
              onSave={explanationEdit.onSave}
              labels={explanationEdit.labels}
            />
          </div>
        </details>
      ) : node.summary ? (
        <details className={activeTab === "overview" ? "block" : "hidden"}>
          <summary className="cursor-pointer list-none font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]">
            {labels.fullNote}
          </summary>
          <p className="mt-2 line-clamp-3 [overflow-wrap:anywhere] text-[12px] leading-5 text-[color:var(--color-text-secondary)]">
            {node.summary}
          </p>
        </details>
      ) : null}

      <section
        id="topology-node-relations"
        className={`rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-3 ${
          activeTab === "relations" ? "mt-4 block" : "hidden"
        }`}
      >
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
        {/* 전이 blast radius — 1-hop degree 위 graph-DB reachability 질의를 노드
            detail 에 바로 노출. "이거 바꾸면 N개 영향" 을 한눈에(graph DB 그
            이상의 시각적 가치). 0 일 때는 노이즈라 숨김. */}
        {model.reach.dependents > 0 || model.reach.dependencies > 0 ? (
          <div className="mt-2.5" data-testid="drawer-blast-radius">
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
              {labels.reachTitle}
            </p>
            <p className="mt-0.5 text-[12px] text-[color:var(--color-text-secondary)]">
              {labels.reachDependents}:{" "}
              <span className="font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                {model.reach.dependents}
              </span>{" "}
              · {labels.reachDependencies}: {model.reach.dependencies}
            </p>
            {/* blast-radius 숫자를 *공간적으로* — graph-DB reachability 질의를
                토폴로지 부분그래프 하이라이트로. 영향받는 노드(dependents)가
                있을 때만. */}
            {onToggleImpact && model.reach.dependents > 0 ? (
              <button
                type="button"
                onClick={onToggleImpact}
                aria-pressed={impactActive}
                data-testid="drawer-impact-toggle"
                className={`mt-1.5 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors ${
                  impactActive
                    ? "border-[color:rgba(139,151,255,0.5)] bg-[color:var(--color-overlay-1)] text-[color:var(--color-text-primary)]"
                    : "border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)]"
                }`}
              >
                {impactActive ? labels.reachHideOnMap : labels.reachShowOnMap}
              </button>
            ) : null}
          </div>
        ) : null}
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
                  {onSelectNode && relation.other ? (
                    <button
                      type="button"
                      onClick={() => onSelectNode(relation.other!.id)}
                      className="min-w-0 truncate text-left text-[11px] text-[color:var(--color-text-secondary)] transition-colors hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(139,151,255,0.5)]"
                    >
                      {relation.other.title}
                    </button>
                  ) : (
                    <span className="min-w-0 truncate text-[11px] text-[color:var(--color-text-secondary)]">
                      {relation.other?.title ?? relation.edge.id}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </details>
        ) : null}
      </section>

      <section
        className={`border-t border-[color:var(--color-border-soft)] pt-3 ${
          activeTab === "overview" ? "mt-4 block" : "hidden"
        }`}
      >
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

      <section
        id="topology-node-agent"
        className={`rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-3 ${
          activeTab === "agent" ? "block" : "hidden"
        }`}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          {labels.collaboratorTitle}
        </p>
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
      </section>

      <div
        id="topology-node-actions"
        className={`gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-4 sm:grid-cols-2 ${
          activeTab === "actions" ? "grid" : "hidden"
        }`}
      >
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
        </div>
      </div>
      </section>
    </div>
  );

  if (typeof document === "undefined") {
    return detailDialog;
  }

  return createPortal(detailDialog, document.body);
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
