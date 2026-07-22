"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Clipboard, Database, FileJson, Network, PencilLine, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { copyText } from "@/shared/lib/copy-text";
import { useToast } from "@/shared/ui";
import {
  AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT,
  formatAgentPostChangeSyncPacket,
} from "@/shared/lib/ontology-tree";
import type { VaultRelationProposal } from "../lib/relation-proposal";
import {
  buildBuilderProofHref,
} from "../lib/resolve-builder-proof-node";
import { formatBuilderGuardPacket, formatBuilderProofPacket } from "../lib/builder-proof-packet";
import { getBuilderSourceStatus } from "../lib/builder-source-status";
import type { BuilderDraftPreview } from "../lib/builder-draft-agent-packet";
import { formatBuilderDraftAgentPacket } from "../lib/builder-draft-agent-packet";
import { formatBuilderVerificationPacket } from "../lib/builder-verification-packet";

/**
 * 헤더 "저장 상태" 팝오버 — 저장 연결 · 임시 변경 · 관계 저장 점검 · 그래프
 * 검증 · 검증/되돌리기 5개 카드. (OntologyEditPage.tsx A4 분해 — 기능/props
 * 무변, 물리 이동만.)
 */
export function BuilderWriteSummary({
  writable,
  restoringVault,
  vaultUnavailable,
  isDesktopRuntime,
  persistedNodes,
  persistedRelations,
  draftNodes,
  draftEdges,
  draftPreviews = [],
  selectedProofNodeId,
  selectedProofSlug,
  pendingRelation,
  onOpenDraft,
}: {
  writable: boolean;
  restoringVault: boolean;
  vaultUnavailable: boolean;
  isDesktopRuntime: boolean;
  persistedNodes: number;
  persistedRelations: number;
  draftNodes: number;
  draftEdges: number;
  draftPreviews?: BuilderDraftPreview[];
  selectedProofNodeId?: string | null;
  selectedProofSlug?: string | null;
  pendingRelation?: VaultRelationProposal | null;
  onOpenDraft?: () => void;
}) {
  const t = useTranslations("ontologyPages.edit.page.writeSummary");
  const toast = useToast();
  type SummaryHref =
    | "/docs/?intent=local"
    | "/download/"
    | "/ontology/insights/"
    | `/ontology/insights/?node=${string}`;
  const sourceHref: SummaryHref = isDesktopRuntime ? "/docs/?intent=local" : "/download/";
  const selectedProofDisplaySlug = selectedProofSlug ?? selectedProofNodeId ?? null;
  const proofHref: SummaryHref = buildBuilderProofHref(
    selectedProofSlug || selectedProofNodeId
      ? {
          graphNodeId: selectedProofNodeId ?? selectedProofSlug ?? "",
          vaultSlug: selectedProofSlug ?? selectedProofNodeId ?? "",
        }
      : null,
  );
  const proofPacketSlug = selectedProofSlug ?? selectedProofNodeId;
  const sourceStatus = getBuilderSourceStatus({
    writable,
    restoringVault,
    vaultUnavailable,
  });
  const hasDraft = draftNodes > 0 || draftEdges > 0;
  const visibleDraftPreviews = draftPreviews.slice(0, 3);
  const hiddenDraftPreviewCount = Math.max(0, draftNodes - visibleDraftPreviews.length);
  const hasUnnamedDraft =
    draftNodes > 0 &&
    (draftPreviews.length < draftNodes || draftPreviews.some((draft) => draft.needsName));
  const readyDraftPreviews = draftPreviews.filter((draft) => !draft.needsName);
  const nextStep = pendingRelation
    ? t("nextStepRelation", {
        source: pendingRelation.sourceSlug,
        target: pendingRelation.targetSlug,
      })
    : hasDraft
      ? hasUnnamedDraft
        ? t("nextStepDraftNeedsName", { nodes: draftNodes, edges: draftEdges })
        : t("nextStepDraftReady", { nodes: draftNodes, edges: draftEdges })
      : sourceStatus.status !== "writable"
        ? t(`nextStepSource.${sourceStatus.status}`)
        : selectedProofDisplaySlug
          ? t("nextStepProof", { slug: selectedProofDisplaySlug })
          : t("nextStepClean");
  const sourceAction = sourceStatus.showSourceAction
    ? {
        href: sourceHref,
        actionLabel: isDesktopRuntime
          ? t("sourceActionLocal")
          : t("sourceActionDownload"),
      }
    : {};
  const items: Array<{
    icon: ReactNode;
    label: string;
    value: string;
    body: string;
    chip: string;
    flow: string;
    accent: "indigo" | "amber" | "neutral";
    status?: string;
    statusTone?: "indigo" | "neutral";
    href?: SummaryHref;
    actionLabel?: string;
    actionAriaLabel?: string;
    onAction?: () => void;
    copyLabel?: string;
    copyAriaLabel?: string;
    copyText?: string;
    copySuccess?: string;
    syncCopyLabel?: string;
    syncCopyAriaLabel?: string;
    syncCopyText?: string;
    syncCopySuccess?: string;
    agentCopyLabel?: string;
    agentCopyAriaLabel?: string;
    agentCopyText?: string;
    agentCopySuccess?: string;
    draftPreviews?: BuilderDraftPreview[];
    draftPreviewMore?: string;
  }> = [
    {
      icon: <Database size={12} />,
      label: t("sourceLabel"),
      value: t(`source.${sourceStatus.status}.value`),
      body:
        sourceStatus.status === "writable"
          ? t("source.writable.body", { nodes: persistedNodes, relations: persistedRelations })
          : sourceStatus.status === "readonly"
            ? t("source.readonly.body", { nodes: persistedNodes, relations: persistedRelations })
            : t(`source.${sourceStatus.status}.body`),
      chip: t(`source.${sourceStatus.status}.chip`),
      flow: t(`source.${sourceStatus.status}.flow`),
      accent: sourceStatus.accent,
      ...sourceAction,
    },
    {
      icon: <PencilLine size={12} />,
      label: t("draftLabel"),
      value: t("draftValue", { nodes: draftNodes, edges: draftEdges }),
      body: t("draftBody"),
      chip: t("draftChip"),
      flow: t("draftFlow"),
      accent: draftNodes > 0 || draftEdges > 0 ? "indigo" : "neutral",
      status: draftNodes > 0 || draftEdges > 0 ? t("draftStatusDirty") : t("draftStatusClean"),
      statusTone: draftNodes > 0 || draftEdges > 0 ? "indigo" : "neutral",
      actionLabel: hasDraft ? t("draftAction") : undefined,
      actionAriaLabel: hasDraft ? t("draftActionAria") : undefined,
      onAction: hasDraft ? onOpenDraft : undefined,
      draftPreviews: visibleDraftPreviews,
      draftPreviewMore:
        hiddenDraftPreviewCount > 0
          ? t("draftPreviewMore", { count: hiddenDraftPreviewCount })
          : undefined,
      agentCopyLabel:
        readyDraftPreviews.length > 0 ? t("draftAgentCopy") : undefined,
      agentCopyAriaLabel:
        readyDraftPreviews.length > 0
          ? t("draftAgentCopyAria", { count: readyDraftPreviews.length })
          : undefined,
      agentCopyText:
        readyDraftPreviews.length > 0
          ? formatBuilderDraftAgentPacket(readyDraftPreviews)
          : undefined,
      agentCopySuccess:
        readyDraftPreviews.length > 0 ? t("draftAgentCopyCopied") : undefined,
    },
    {
      icon: <ShieldCheck size={12} />,
      label: t("guardLabel"),
      value: pendingRelation ? t("guardValueReview") : t("guardValue"),
      body: pendingRelation
        ? t("guardBodyReview", {
            source: pendingRelation.sourceSlug,
            key: pendingRelation.inferredKey,
            target: pendingRelation.targetSlug,
          })
        : t("guardBody"),
      chip: pendingRelation ? t("guardChipReview") : t("guardChip"),
      flow: pendingRelation ? t("guardFlowReview") : t("guardFlow"),
      accent: pendingRelation ? "indigo" : "neutral",
      copyLabel: pendingRelation ? t("guardCopyReview") : t("guardCopy"),
      copyAriaLabel: pendingRelation
        ? t("guardCopyAriaReview", {
            source: pendingRelation.sourceSlug,
            target: pendingRelation.targetSlug,
          })
        : t("guardCopyAria"),
      copyText: formatBuilderGuardPacket(pendingRelation),
      copySuccess: t("guardCopyCopied"),
    },
    {
      icon: <Network size={12} />,
      label: t("proofLabel"),
      value: selectedProofDisplaySlug
        ? t("proofValueSelected", { count: AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT })
        : t("proofValue", { count: AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT }),
      body: selectedProofDisplaySlug
        ? t("proofBodySelected", { slug: selectedProofDisplaySlug })
        : t("proofBody"),
      chip: selectedProofDisplaySlug ? t("proofChipSelected") : t("proofChip"),
      flow: selectedProofDisplaySlug ? t("proofFlowSelected") : t("proofFlow"),
      accent: "neutral",
      href: proofHref,
      actionLabel: selectedProofDisplaySlug ? t("proofActionSelected") : t("proofAction"),
      copyLabel: selectedProofDisplaySlug ? t("proofCopySelected") : t("proofCopy"),
      copyAriaLabel: selectedProofDisplaySlug
        ? t("proofCopyAriaSelected", { slug: selectedProofDisplaySlug })
        : t("proofCopyAria"),
      copyText: formatBuilderProofPacket(proofPacketSlug),
      copySuccess: t("proofCopyCopied"),
      syncCopyLabel: t("proofSyncCopy"),
      syncCopyAriaLabel: t("proofSyncCopyAria"),
      syncCopyText: formatAgentPostChangeSyncPacket(),
      syncCopySuccess: t("proofSyncCopyCopied"),
    },
    {
      icon: <FileJson size={12} />,
      label: t("verifyLabel"),
      value: t("verifyValue"),
      body: t("verifyBody"),
      chip: t("verifyChip"),
      flow: t("verifyFlow"),
      accent: "neutral",
      copyLabel: t("verifyCopy"),
      copyAriaLabel: t("verifyCopyAria"),
      copyText: formatBuilderVerificationPacket(),
      copySuccess: t("verifyCopyCopied"),
    },
  ];
  const copyProof = async (text: string, successMessage: string) => {
    if (await copyText(text)) {
      toast.show(successMessage, "success");
      return;
    }
    toast.show(t("proofCopyFailed"), "error");
  };

  return (
    <section
      aria-label={t("ariaLabel")}
      role="list"
      className="grid min-w-0 max-w-full gap-1.5 p-1.5 lg:grid-cols-2"
    >
      <header className="flex min-w-0 max-w-full items-center justify-between gap-3 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-2 lg:col-span-2">
        <div className="min-w-0">
          <h2 className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {t("summaryTitle")}
          </h2>
          <p className="mt-0.5 truncate text-caption leading-4 text-[color:var(--color-text-tertiary)]">
            <span className="font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
              {t("nextStepLabel")}
            </span>{" "}
            {nextStep}
          </p>
        </div>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[color:var(--color-indigo-line-a20)] bg-[color:var(--color-indigo-a08)] text-[color:var(--color-indigo-accent)]">
          <ShieldCheck size={13} aria-hidden />
        </span>
      </header>
      {items.map((item) => {
        const accentClass =
          item.accent === "indigo"
            ? "border-[color:var(--color-indigo-a30)] bg-[color:var(--color-indigo-a08)]"
            : item.accent === "amber"
              ? "border-[color:var(--color-amber-source-a30)] bg-[color:var(--color-amber-source-a07)]"
              : "border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]";
        return (
          <article
            key={item.label}
            role="listitem"
            aria-label={`${item.label}: ${item.value}. ${item.chip}. ${item.body}. ${item.flow}`}
            className={`flex min-w-0 max-w-full flex-wrap items-center gap-2 rounded-md border px-2.5 py-2 ${accentClass}`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[color:var(--color-indigo-line-a14)] bg-[color:var(--color-overlay-recessed-a14)] text-[color:var(--color-indigo-accent)]">
              {item.icon}
            </span>
            <div className="min-w-0 flex-1 basis-[12rem]">
              <p className="min-w-0 truncate text-label font-medium text-[color:var(--color-text-tertiary)]">
                {item.label}
              </p>
              <p className="mt-0.5 truncate text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                {item.value}
              </p>
              <p className="mt-0.5 truncate text-caption text-[color:var(--color-text-quaternary)]">
                {item.chip} · {item.flow}
              </p>
              {item.draftPreviews && item.draftPreviews.length > 0 ? (
                <div
                  role="list"
                  aria-label={t("draftPreviewAriaLabel")}
                  className="mt-1.5 grid gap-1"
                >
                  {item.draftPreviews.map((draft) => (
                    <div
                      key={draft.id}
                      role="listitem"
                      className="min-w-0 rounded border border-[color:var(--color-indigo-a18)] bg-[color:var(--color-overlay-recessed-a12)] px-1.5 py-1"
                    >
                      <p className="truncate text-caption font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
                        {draft.kindLabel} · {draft.title}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-caption text-[color:var(--color-text-quaternary)]">
                        {draft.path}
                      </p>
                    </div>
                  ))}
                  {item.draftPreviewMore ? (
                    <p className="truncate text-caption text-[color:var(--color-text-quaternary)]">
                      {item.draftPreviewMore}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <span className="sr-only">{item.body}</span>
            </div>
            {item.status ? (
              <p
                className={
                  item.statusTone === "indigo"
                    ? "hidden rounded border border-[color:var(--color-indigo-a22)] bg-[color:var(--color-indigo-a08)] px-1.5 py-0.5 font-mono text-caption uppercase tracking-[0.08em] text-[color:var(--color-indigo-text-strong)] xl:block"
                    : "hidden rounded border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-1.5 py-0.5 font-mono text-caption uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)] xl:block"
                }
              >
                {item.status}
              </p>
            ) : null}
            {item.href ||
            item.onAction ||
            item.copyText ||
            item.syncCopyText ||
            item.agentCopyText ? (
              <div className="flex w-full max-w-full flex-wrap items-center justify-start gap-1 pl-10 sm:ml-auto sm:w-auto sm:shrink-0 sm:justify-end sm:pl-0">
                {item.href && item.actionLabel ? (
                  <Link
                    href={item.href}
                    className="inline-flex h-7 items-center rounded-md border border-[color:var(--color-indigo-a24)] px-2 text-caption font-[var(--font-weight-signature)] text-[color:var(--color-indigo-text-strong)] transition-colors hover:border-[color:var(--color-indigo-a42)] hover:text-[color:var(--color-text-primary)]"
                  >
                    {item.actionLabel}
                  </Link>
                ) : null}
                {item.onAction && item.actionLabel ? (
                  <button
                    type="button"
                    onClick={item.onAction}
                    aria-label={item.actionAriaLabel ?? item.actionLabel}
                    className="inline-flex h-7 items-center rounded-md border border-[color:var(--color-indigo-a24)] px-2 text-caption font-[var(--font-weight-signature)] text-[color:var(--color-indigo-text-strong)] transition-colors hover:border-[color:var(--color-indigo-a42)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a38)] focus-visible:ring-inset"
                  >
                    {item.actionLabel}
                  </button>
                ) : null}
                {item.copyText && item.copyLabel && item.copyAriaLabel && item.copySuccess ? (
                  <button
                    type="button"
                    onClick={() => void copyProof(item.copyText!, item.copySuccess!)}
                    aria-label={item.copyAriaLabel}
                    title={item.copyLabel}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
                  >
                    <Clipboard size={11} aria-hidden />
                  </button>
                ) : null}
                {item.syncCopyText && item.syncCopyLabel && item.syncCopyAriaLabel && item.syncCopySuccess ? (
                  <button
                    type="button"
                    onClick={() => void copyProof(item.syncCopyText!, item.syncCopySuccess!)}
                    aria-label={item.syncCopyAriaLabel}
                    title={item.syncCopyLabel}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
                  >
                    <Clipboard size={11} aria-hidden />
                  </button>
                ) : null}
                {item.agentCopyText && item.agentCopyLabel && item.agentCopyAriaLabel && item.agentCopySuccess ? (
                  <button
                    type="button"
                    onClick={() => void copyProof(item.agentCopyText!, item.agentCopySuccess!)}
                    aria-label={item.agentCopyAriaLabel}
                    title={item.agentCopyLabel}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-[color:var(--color-indigo-a24)] px-2 text-caption font-[var(--font-weight-signature)] text-[color:var(--color-indigo-text-strong)] transition-colors hover:border-[color:var(--color-indigo-a42)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a38)] focus-visible:ring-inset"
                  >
                    <Clipboard size={11} aria-hidden />
                    <span>{item.agentCopyLabel}</span>
                  </button>
                ) : null}
              </div>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
