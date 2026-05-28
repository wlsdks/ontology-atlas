"use client";

import { useState } from "react";
import { Clipboard, GitBranch, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { copyText } from "@/shared/lib/copy-text";
import { explainOntologyRelationKeyInference } from "@/shared/lib/ontology-relation-key";
import {
  buildAgentPostChangeSyncCliCommands,
  formatAgentPostChangeSyncPacket,
} from "@/shared/lib/ontology-tree";
import {
  buildVaultRelationGraphEffect,
  buildVaultRelationFrontmatterPatch,
  buildVaultRelationWriteScope,
  buildVaultRelationWritePreview,
  VAULT_RELATION_KEYS,
  type VaultRelationKey,
  type VaultRelationProposal,
  type VaultRelationPreflight,
} from "../lib/relation-proposal";

interface RelationWriteConfirmLabels {
  title: string;
  body: string;
  inferred: string;
  inferredKey: string;
  inferenceReason: string;
  alternatives: string;
  writeScope: string;
  writeFile: string;
  writeChangedFiles: string;
  writeUnchangedFiles: string;
  writeBoundary: string;
  writeBoundaryValue: string;
  writeKey: string;
  writeMeaning: string;
  writeMutation: string;
  writeFrontmatterPatch: string;
  mcpWriteArgs: string;
  mcpWritePolicy: string;
  mcpWritePolicyReady: string;
  mcpWritePolicyBlocked: string;
  graphEffect: string;
  graphEdge: string;
  graphRelation: string;
  graphSurfaces: string;
  graphSurfacesValue: string;
  graphAlternativeWarning: string;
  endpointReview: string;
  endpointReviewBody: string;
  sourceOntology: string;
  targetOntology: string;
  sourceBuilder: string;
  targetBuilder: string;
  postSaveGraphHandoff: string;
  postSaveGraphHandoffBody: string;
  postSavePathHandoff: string;
  postSaveSourceFocus: string;
  postSaveTargetFocus: string;
  postSaveQueryCockpit: string;
  saveChecklist: string;
  saveChecklistSelectedKey: string;
  saveChecklistPreflight: string;
  saveChecklistTraversal: string;
  saveChecklistSyncGate: string;
  saveChecklistReady: string;
  saveChecklistReview: string;
  saveChecklistBlocked: string;
  saveChecklistSyncRequired: string;
  preflight: string;
  preflightEvidence: string;
  preflightExact: string;
  preflightInverse: string;
  preflightPath: string;
  preflightClear: string;
  preflightPresent: string;
  preflightActionSafe: string;
  preflightActionReview: string;
  preflightActionBlocked: string;
  traversalCheck: string;
  traversalCheckBody: string;
  traversalContract: string;
  traversalContractBody: string;
  agentCheck: string;
  postSaveCheck: string;
  path: string;
  copyCliPreflight: string;
  copyCliPreflightCopied: string;
  copyCliPreflightFailed: string;
  copyMcpPreflight: string;
  copyMcpPreflightCopied: string;
  copyMcpPreflightFailed: string;
  copyPostSaveSyncGate: string;
  copyPostSaveSyncGateCopied: string;
  copyPostSaveSyncGateFailed: string;
  copyMcpWrite: string;
  copyMcpWriteCopied: string;
  copyMcpWriteFailed: string;
  cancel: string;
  confirm: string;
  copyPacket: string;
  copyPacketCopied: string;
  copyPacketFailed: string;
  closeAriaLabel: string;
  decisionLabels: Record<VaultRelationPreflight["decision"], string>;
  decisionHints: Record<VaultRelationPreflight["decision"], string>;
  relationKeyLabels: Record<VaultRelationKey, string>;
  relationKeyHints: Record<VaultRelationKey, string>;
}

interface RelationWriteConfirmProps {
  proposal: VaultRelationProposal;
  selectedKey: VaultRelationKey;
  preflight: VaultRelationPreflight;
  labels: RelationWriteConfirmLabels;
  onSelectKey: (key: VaultRelationKey) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RelationWriteConfirm({
  proposal,
  selectedKey,
  preflight,
  labels,
  onSelectKey,
  onCancel,
  onConfirm,
}: RelationWriteConfirmProps) {
  const preview = buildVaultRelationWritePreview(
    proposal.sourceSlug,
    selectedKey,
    proposal.targetSlug,
  );
  const frontmatterPatch = buildVaultRelationFrontmatterPatch(
    selectedKey,
    proposal.targetSlug,
  );
  const writeScope = buildVaultRelationWriteScope(
    proposal.sourceSlug,
    selectedKey,
    proposal.targetSlug,
  );
  const graphEffect = buildVaultRelationGraphEffect({
    sourceSlug: proposal.sourceSlug,
    targetSlug: proposal.targetSlug,
    inferredKey: proposal.inferredKey,
    selectedKey,
  });
  const inferenceReason = explainOntologyRelationKeyInference(
    proposal.sourceKind,
    proposal.targetKind,
  );
  const confirmDisabled = preflight.decision === "skip_existing";
  const directMcpWriteBlocked = preflight.decision !== "safe_to_add";
  const preflightAction =
    preflight.decision === "safe_to_add"
      ? labels.preflightActionSafe
      : preflight.decision === "skip_existing"
        ? labels.preflightActionBlocked
        : labels.preflightActionReview;
  const agentCheckCommand = buildRelationCheckCommand({
    proposal,
    selectedKey,
  });
  const postSaveCheckCommands = buildPostSaveCheckCommands();
  const mcpWriteArgs = formatMcpAddRelationArgs({ proposal, selectedKey });
  const saveChecklistRows = buildSaveChecklistRows({
    inferredMatchesSelected: graphEffect.inferredMatchesSelected,
    preflightDecision: preflight.decision,
    labels,
  });
  const topologyPathHref = buildRelationTopologyPathHref(
    proposal.sourceSlug,
    proposal.targetSlug,
  );
  const sourceOntologyHref = buildRelationOntologyHref(proposal.sourceSlug);
  const targetOntologyHref = buildRelationOntologyHref(proposal.targetSlug);
  const sourceBuilderHref = buildRelationBuilderHref(proposal.sourceSlug);
  const targetBuilderHref = buildRelationBuilderHref(proposal.targetSlug);
  const sourceTopologyFocusHref = buildRelationTopologyFocusHref(proposal.sourceSlug);
  const targetTopologyFocusHref = buildRelationTopologyFocusHref(proposal.targetSlug);
  const queryCockpitHref = buildRelationQueryCockpitHref(proposal.sourceSlug);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [cliPreflightCopyState, setCliPreflightCopyState] = useState<
    "idle" | "copied" | "failed"
  >("idle");
  const [mcpPreflightCopyState, setMcpPreflightCopyState] = useState<
    "idle" | "copied" | "failed"
  >("idle");
  const [postSaveSyncCopyState, setPostSaveSyncCopyState] = useState<
    "idle" | "copied" | "failed"
  >("idle");
  const [mcpWriteCopyState, setMcpWriteCopyState] = useState<
    "idle" | "copied" | "failed"
  >("idle");
  const copyPacketLabel =
    copyState === "copied"
      ? labels.copyPacketCopied
      : copyState === "failed"
        ? labels.copyPacketFailed
        : labels.copyPacket;
  const copyCliPreflightLabel =
    cliPreflightCopyState === "copied"
      ? labels.copyCliPreflightCopied
      : cliPreflightCopyState === "failed"
        ? labels.copyCliPreflightFailed
        : labels.copyCliPreflight;
  const copyMcpPreflightLabel =
    mcpPreflightCopyState === "copied"
      ? labels.copyMcpPreflightCopied
      : mcpPreflightCopyState === "failed"
        ? labels.copyMcpPreflightFailed
        : labels.copyMcpPreflight;
  const copyPostSaveSyncGateLabel =
    postSaveSyncCopyState === "copied"
      ? labels.copyPostSaveSyncGateCopied
      : postSaveSyncCopyState === "failed"
        ? labels.copyPostSaveSyncGateFailed
        : labels.copyPostSaveSyncGate;
  const copyMcpWriteLabel =
    mcpWriteCopyState === "copied"
      ? labels.copyMcpWriteCopied
      : mcpWriteCopyState === "failed"
        ? labels.copyMcpWriteFailed
        : labels.copyMcpWrite;

  async function handleCopyPacket() {
    const copied = await copyText(
      formatRelationWritePacket({
        proposal,
        selectedKey,
        preflight,
        preview,
        frontmatterPatch,
        graphEffect,
        writeScope,
        mcpWriteArgs,
      }),
    );
    setCopyState(copied ? "copied" : "failed");
  }

  async function handleCopyCliPreflight() {
    const copied = await copyText(
      formatCliPreflightPacket({
        proposal,
        selectedKey,
      }),
    );
    setCliPreflightCopyState(copied ? "copied" : "failed");
  }

  async function handleCopyMcpPreflight() {
    const copied = await copyText(
      formatMcpPreflightPacket({
        proposal,
        selectedKey,
      }),
    );
    setMcpPreflightCopyState(copied ? "copied" : "failed");
  }

  async function handleCopyPostSaveSyncGate() {
    const copied = await copyText(formatAgentPostChangeSyncPacket());
    setPostSaveSyncCopyState(copied ? "copied" : "failed");
  }

  async function handleCopyMcpWrite() {
    const copied = await copyText(
      formatMcpWritePacket({
        proposal,
        selectedKey,
      }),
    );
    setMcpWriteCopyState(copied ? "copied" : "failed");
  }

  return (
    <aside
      role="dialog"
      aria-modal="true"
      aria-label={labels.title}
      data-testid="builder-relation-write-confirm"
      className="pointer-events-auto absolute bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[min(680px,calc(100%-2rem))] -translate-x-1/2 flex-col gap-3 overflow-y-auto rounded-lg border border-[color:rgba(94,106,210,0.34)] bg-[color:var(--color-panel)] p-4 shadow-[0_22px_54px_rgba(0,0,0,0.32)]"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[color:rgba(94,106,210,0.28)] bg-[color:rgba(94,106,210,0.12)] text-[color:var(--color-indigo-accent)]">
            <GitBranch size={15} />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
              {labels.title}
            </h2>
            <p className="mt-1 break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
              {labels.body}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label={labels.closeAriaLabel}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)]"
        >
          <X size={15} />
        </button>
      </header>

      <div className="grid gap-2 md:grid-cols-[1fr_1.2fr]">
        <div className="rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
            {labels.inferred}
          </p>
          <p className="mt-2 truncate font-mono text-[11px] text-[color:var(--color-text-secondary)]">
            {proposal.sourceSlug}
          </p>
          <p className="my-1 text-[color:var(--color-text-quaternary)]">→</p>
          <p className="truncate font-mono text-[11px] text-[color:var(--color-text-secondary)]">
            {proposal.targetSlug}
          </p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-2 border-t border-[color:var(--color-border-soft)] pt-2 font-mono text-[10px]">
            <dt className="text-[color:var(--color-text-quaternary)]">
              {labels.inferredKey}
            </dt>
            <dd className="min-w-0 truncate text-[color:var(--color-text-secondary)]">
              {proposal.inferredKey}
            </dd>
            <dt className="text-[color:var(--color-text-quaternary)]">
              {labels.inferenceReason}
            </dt>
            <dd className="min-w-0 break-words text-[color:var(--color-text-secondary)]">
              {inferenceReason}
            </dd>
          </dl>
        </div>

        <div className="rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
            {labels.alternatives}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {VAULT_RELATION_KEYS.map((key) => {
              const active = selectedKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelectKey(key)}
                  aria-pressed={active}
                  title={labels.relationKeyHints[key]}
                  className={`rounded-md border px-2 py-1.5 text-left transition-colors ${
                    active
                      ? "border-[color:rgba(94,106,210,0.48)] bg-[color:rgba(94,106,210,0.14)] text-[color:var(--color-text-primary)]"
                      : "border-[color:var(--color-overlay-3)] text-[color:var(--color-text-tertiary)] hover:border-[color:rgba(94,106,210,0.3)] hover:text-[color:var(--color-text-primary)]"
                  }`}
                >
                  <span className="block font-mono text-[10px]">
                    {labels.relationKeyLabels[key]}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-[color:var(--color-text-quaternary)]">
                    {labels.relationKeyHints[key]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded-md border border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.08)] p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
              {labels.preflight}
            </p>
            <p className="mt-1 text-[12px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
              {labels.decisionLabels[preflight.decision]}
            </p>
          </div>
          <span className="rounded-sm border border-[color:rgba(94,106,210,0.28)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:rgba(139,151,255,0.95)]">
            {preflight.decision}
          </span>
        </div>
        <p className="mt-2 break-keep text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
          {labels.decisionHints[preflight.decision]}
        </p>
        <div className="mt-3 rounded-md border border-[color:rgba(94,106,210,0.18)] bg-[color:rgba(0,0,0,0.08)] p-2">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
            {labels.preflightEvidence}
          </p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 font-mono text-[10px]">
            <PreflightEvidenceRow
              label={labels.preflightExact}
              present={preflight.exactExists}
              presentLabel={labels.preflightPresent}
              clearLabel={labels.preflightClear}
            />
            <PreflightEvidenceRow
              label={labels.preflightInverse}
              present={preflight.inverseExists}
              presentLabel={labels.preflightPresent}
              clearLabel={labels.preflightClear}
            />
            <PreflightEvidenceRow
              label={labels.preflightPath}
              present={preflight.pathExists}
              presentLabel={labels.preflightPresent}
              clearLabel={labels.preflightClear}
            />
          </dl>
        </div>
        <div className="mt-2 rounded-md border border-[color:rgba(94,106,210,0.18)] bg-[color:rgba(0,0,0,0.08)] p-2">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
            {labels.traversalCheck}
          </p>
          <p className="mt-1 break-keep text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
            {labels.traversalCheckBody}
          </p>
          <p className="mt-1 break-all font-mono text-[10px] text-[color:var(--color-text-tertiary)]">
            {buildAllPathsCheckCommand({ proposal })}
          </p>
          <div className="mt-2 border-t border-[color:rgba(94,106,210,0.14)] pt-2">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {labels.traversalContract}
            </p>
            <p className="mt-1 break-keep text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
              {labels.traversalContractBody}
            </p>
          </div>
        </div>
        {preflight.path.length > 1 ? (
          <p className="mt-2 truncate font-mono text-[10px] text-[color:var(--color-text-tertiary)]">
            <span className="text-[color:var(--color-text-quaternary)]">
              {labels.path}
            </span>{" "}
            {preflight.path.join(" → ")}
          </p>
        ) : null}
        <p className="mt-2 truncate font-mono text-[10px] text-[color:var(--color-text-tertiary)]">
          <span className="text-[color:var(--color-text-quaternary)]">
            {labels.agentCheck}
          </span>{" "}
          {agentCheckCommand}
        </p>
        <div className="mt-1 font-mono text-[10px] text-[color:var(--color-text-tertiary)]">
          <span className="text-[color:var(--color-text-quaternary)]">
            {labels.postSaveCheck}
          </span>{" "}
          <ul className="mt-1 space-y-0.5">
            {postSaveCheckCommands.map((command) => (
              <li key={command} className="break-all">
                {command}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => void handleCopyCliPreflight()}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.26)] bg-[color:rgba(94,106,210,0.08)] px-2 text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.44)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)]"
          >
            <Clipboard size={12} aria-hidden />
            {copyCliPreflightLabel}
          </button>
          <button
            type="button"
            onClick={() => void handleCopyMcpPreflight()}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.26)] bg-[color:rgba(94,106,210,0.08)] px-2 text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.44)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)]"
          >
            <Clipboard size={12} aria-hidden />
            {copyMcpPreflightLabel}
          </button>
          <button
            type="button"
            onClick={() => void handleCopyPostSaveSyncGate()}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.26)] bg-[color:rgba(94,106,210,0.08)] px-2 text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.44)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)]"
          >
            <Clipboard size={12} aria-hidden />
            {copyPostSaveSyncGateLabel}
          </button>
        </div>
      </div>

      <div className="rounded-md border border-[color:rgba(73,190,146,0.18)] bg-[color:rgba(73,190,146,0.045)] p-3">
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[color:rgba(151,230,198,0.92)]">
          {labels.graphEffect}
        </p>
        <dl className="mt-2 grid gap-x-3 gap-y-1 font-mono text-[10px] text-[color:var(--color-text-tertiary)] sm:grid-cols-[auto_1fr]">
          <dt className="text-[color:var(--color-text-quaternary)]">
            {labels.graphEdge}
          </dt>
          <dd className="min-w-0 truncate">{graphEffect.edge}</dd>
          <dt className="text-[color:var(--color-text-quaternary)]">
            {labels.graphRelation}
          </dt>
          <dd className="min-w-0 truncate">{graphEffect.relationLabel}</dd>
          <dt className="text-[color:var(--color-text-quaternary)]">
            {labels.graphSurfaces}
          </dt>
          <dd className="min-w-0 truncate">{labels.graphSurfacesValue}</dd>
        </dl>
        {!graphEffect.inferredMatchesSelected ? (
          <p className="mt-2 break-keep text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
            {labels.graphAlternativeWarning}
          </p>
        ) : null}
        <div className="mt-3 rounded-md border border-[color:rgba(94,106,210,0.18)] bg-[color:rgba(0,0,0,0.08)] p-2">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
            {labels.endpointReview}
          </p>
          <p className="mt-1 break-keep text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
            {labels.endpointReviewBody}
          </p>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            <Link
              href={sourceOntologyHref}
              className="inline-flex h-7 items-center justify-center rounded-md border border-[color:rgba(94,106,210,0.26)] bg-[color:rgba(94,106,210,0.08)] px-2 text-center text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.44)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)]"
            >
              {labels.sourceOntology}
            </Link>
            <Link
              href={targetOntologyHref}
              className="inline-flex h-7 items-center justify-center rounded-md border border-[color:rgba(94,106,210,0.26)] bg-[color:rgba(94,106,210,0.08)] px-2 text-center text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.44)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)]"
            >
              {labels.targetOntology}
            </Link>
            <Link
              href={sourceBuilderHref}
              className="inline-flex h-7 items-center justify-center rounded-md border border-[color:var(--color-overlay-3)] px-2 text-center text-[10px] text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)]"
            >
              {labels.sourceBuilder}
            </Link>
            <Link
              href={targetBuilderHref}
              className="inline-flex h-7 items-center justify-center rounded-md border border-[color:var(--color-overlay-3)] px-2 text-center text-[10px] text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)]"
            >
              {labels.targetBuilder}
            </Link>
          </div>
        </div>
        <div className="mt-3 rounded-md border border-[color:rgba(94,106,210,0.18)] bg-[color:rgba(0,0,0,0.08)] p-2">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
            {labels.postSaveGraphHandoff}
          </p>
          <p className="mt-1 break-keep text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
            {labels.postSaveGraphHandoffBody}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Link
              href={topologyPathHref}
              className="inline-flex h-7 items-center rounded-md border border-[color:rgba(94,106,210,0.26)] bg-[color:rgba(94,106,210,0.08)] px-2 text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.44)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)]"
            >
              {labels.postSavePathHandoff}
            </Link>
            <Link
              href={sourceTopologyFocusHref}
              className="inline-flex h-7 items-center rounded-md border border-[color:var(--color-overlay-3)] px-2 text-[10px] text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)]"
            >
              {labels.postSaveSourceFocus}
            </Link>
            <Link
              href={targetTopologyFocusHref}
              className="inline-flex h-7 items-center rounded-md border border-[color:var(--color-overlay-3)] px-2 text-[10px] text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)]"
            >
              {labels.postSaveTargetFocus}
            </Link>
            <Link
              href={queryCockpitHref}
              className="inline-flex h-7 items-center rounded-md border border-[color:rgba(94,106,210,0.26)] bg-[color:rgba(94,106,210,0.08)] px-2 text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.44)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)]"
            >
              {labels.postSaveQueryCockpit}
            </Link>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-3">
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
          {labels.saveChecklist}
        </p>
        <dl className="mt-2 grid gap-1.5">
          {saveChecklistRows.map((row) => (
            <div
              key={row.key}
              className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-sm border border-[color:rgba(94,106,210,0.14)] bg-[color:rgba(0,0,0,0.08)] px-2 py-1.5"
            >
              <dt className="min-w-0 truncate text-[11px] text-[color:var(--color-text-secondary)]">
                {row.label}
              </dt>
              <dd
                className={`rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] ${
                  row.status === "ready"
                    ? "border-[color:rgba(73,190,146,0.28)] text-[color:rgba(151,230,198,0.92)]"
                    : row.status === "blocked"
                      ? "border-[color:rgba(255,120,120,0.28)] text-[color:rgba(255,160,160,0.92)]"
                      : "border-[color:rgba(232,196,162,0.26)] text-[color:rgba(232,196,162,0.92)]"
                }`}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div
        data-testid="builder-relation-write-actions"
        className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-4 pb-1 pt-3"
      >
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
            {labels.writeScope}
          </p>
          <dl className="mt-1 grid gap-x-3 gap-y-1 font-mono text-[10px] text-[color:var(--color-text-tertiary)] sm:grid-cols-[auto_1fr]">
            <dt className="text-[color:var(--color-text-quaternary)]">
              {labels.writeFile}
            </dt>
            <dd className="min-w-0 truncate">{writeScope.filePath}</dd>
            <dt className="text-[color:var(--color-text-quaternary)]">
              {labels.writeChangedFiles}
            </dt>
            <dd className="min-w-0 truncate">{writeScope.changedFiles.join(", ")}</dd>
            <dt className="text-[color:var(--color-text-quaternary)]">
              {labels.writeUnchangedFiles}
            </dt>
            <dd className="min-w-0 truncate">{writeScope.unchangedFiles.join(", ")}</dd>
            <dt className="text-[color:var(--color-text-quaternary)]">
              {labels.writeBoundary}
            </dt>
            <dd className="min-w-0 break-keep text-[color:var(--color-text-secondary)]">
              {labels.writeBoundaryValue}
            </dd>
            <dt className="text-[color:var(--color-text-quaternary)]">
              {labels.writeKey}
            </dt>
            <dd className="min-w-0 truncate">{writeScope.frontmatterKey}</dd>
            <dt className="text-[color:var(--color-text-quaternary)]">
              {labels.writeMeaning}
            </dt>
            <dd className="min-w-0 truncate">
              {labels.relationKeyHints[selectedKey]}
            </dd>
            <dt className="text-[color:var(--color-text-quaternary)]">
              {labels.writeMutation}
            </dt>
            <dd className="min-w-0 truncate">{preview}</dd>
            <dt className="text-[color:var(--color-text-quaternary)]">
              {labels.writeFrontmatterPatch}
            </dt>
            <dd className="min-w-0 whitespace-pre-wrap break-all rounded-sm border border-[color:rgba(94,106,210,0.14)] bg-[color:rgba(14,16,22,0.18)] px-2 py-1 text-[color:var(--color-text-secondary)]">
              {frontmatterPatch}
            </dd>
            <dt className="text-[color:var(--color-text-quaternary)]">
              {labels.mcpWriteArgs}
            </dt>
            <dd className="min-w-0 truncate">{mcpWriteArgs}</dd>
            <dt className="text-[color:var(--color-text-quaternary)]">
              {labels.mcpWritePolicy}
            </dt>
            <dd className="min-w-0 break-keep text-[color:var(--color-text-secondary)]">
              {directMcpWriteBlocked
                ? labels.mcpWritePolicyBlocked
                : labels.mcpWritePolicyReady}
            </dd>
          </dl>
          <p
            data-testid="builder-relation-preflight-action"
            className="mt-2 break-keep text-[11px] leading-5 text-[color:var(--color-text-tertiary)]"
          >
            {preflightAction}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleCopyPacket()}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[color:var(--color-overlay-3)] px-3 text-xs text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
          >
            <Clipboard size={12} aria-hidden />
            {copyPacketLabel}
          </button>
          <button
            type="button"
            onClick={() => void handleCopyMcpWrite()}
            disabled={directMcpWriteBlocked}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.26)] bg-[color:rgba(94,106,210,0.08)] px-3 text-xs text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.44)] hover:text-[color:var(--color-text-primary)] disabled:cursor-not-allowed disabled:border-[color:var(--color-overlay-3)] disabled:bg-[color:var(--color-overlay-1)] disabled:text-[color:var(--color-text-quaternary)]"
          >
            <Clipboard size={12} aria-hidden />
            {copyMcpWriteLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-8 items-center rounded-md border border-[color:var(--color-overlay-3)] px-3 text-xs text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
          >
            {labels.cancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            className="inline-flex h-8 items-center rounded-md border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.14)] px-3 text-xs font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:rgba(94,106,210,0.2)] disabled:cursor-not-allowed disabled:border-[color:var(--color-overlay-3)] disabled:bg-[color:var(--color-overlay-1)] disabled:text-[color:var(--color-text-quaternary)]"
          >
            {labels.confirm}
          </button>
        </div>
      </div>
    </aside>
  );
}

function PreflightEvidenceRow({
  label,
  present,
  presentLabel,
  clearLabel,
}: {
  label: string;
  present: boolean;
  presentLabel: string;
  clearLabel: string;
}) {
  return (
    <>
      <dt className="text-[color:var(--color-text-quaternary)]">{label}</dt>
      <dd
        className={
          present
            ? "text-[color:var(--color-text-secondary)]"
            : "text-[color:var(--color-text-quaternary)]"
        }
      >
        {present ? presentLabel : clearLabel}
      </dd>
    </>
  );
}

function formatRelationWritePacket({
  proposal,
  selectedKey,
  preflight,
  preview,
  frontmatterPatch,
  graphEffect,
  writeScope,
  mcpWriteArgs,
}: {
  proposal: VaultRelationProposal;
  selectedKey: VaultRelationKey;
  preflight: VaultRelationPreflight;
  preview: string;
  frontmatterPatch: string;
  graphEffect: ReturnType<typeof buildVaultRelationGraphEffect>;
  writeScope: ReturnType<typeof buildVaultRelationWriteScope>;
  mcpWriteArgs: string;
}): string {
  return [
    "# Relation write review",
    "",
    `- Source: ${proposal.sourceSlug}`,
    `- Target: ${proposal.targetSlug}`,
    `- Source ontology URL: ${buildRelationOntologyHref(proposal.sourceSlug)}`,
    `- Target ontology URL: ${buildRelationOntologyHref(proposal.targetSlug)}`,
    `- Source builder URL: ${buildRelationBuilderHref(proposal.sourceSlug)}`,
    `- Target builder URL: ${buildRelationBuilderHref(proposal.targetSlug)}`,
    `- Post-save topology path: ${buildRelationTopologyPathHref(
      proposal.sourceSlug,
      proposal.targetSlug,
    )}`,
    `- Source topology focus: ${buildRelationTopologyFocusHref(proposal.sourceSlug)}`,
    `- Target topology focus: ${buildRelationTopologyFocusHref(proposal.targetSlug)}`,
    `- Query cockpit: ${buildRelationQueryCockpitHref(proposal.sourceSlug)}`,
    `- Inferred key: ${proposal.inferredKey}`,
    `- Inference reason: ${explainOntologyRelationKeyInference(
      proposal.sourceKind,
      proposal.targetKind,
    )}`,
    `- Selected key: ${selectedKey}`,
    `- Mutation: ${preview}`,
    "- Frontmatter patch:",
    frontmatterPatch,
    `- MCP add_relation args: ${mcpWriteArgs}`,
    preflight.decision !== "safe_to_add"
      ? `- MCP add_relation call: blocked by preflight (${formatRelationPreflightBlockReason(
          preflight.decision,
        )})`
      : `- MCP add_relation call: ${formatMcpAddRelationToolCall({
          proposal,
          selectedKey,
        })}`,
    `- Changed file: ${writeScope.changedFiles.join(", ")}`,
    `- Unchanged file: ${writeScope.unchangedFiles.join(", ")}`,
    "- Write boundary: source frontmatter only; target file remains unchanged",
    `- Graph effect: ${graphEffect.edge}`,
    `- Graph surfaces: ${graphEffect.surfaces.join(", ")}`,
    `- Preflight: ${preflight.decision}`,
    "- Save decision checklist:",
    `  - Selected key reviewed: ${
      graphEffect.inferredMatchesSelected ? "ready" : "review"
    }`,
    `  - Preflight result: ${
      preflight.decision === "safe_to_add"
        ? "ready"
        : preflight.decision === "skip_existing"
          ? "blocked"
          : "review"
    }`,
    "  - Traversal evidence: review",
    "  - Post-save sync gate: required",
    preflight.path.length > 1
      ? `- Existing path: ${preflight.path.join(" -> ")}`
      : "- Existing path: none",
    "",
    "CLI preflight:",
    buildRelationCheckCommand({ proposal, selectedKey }),
    "",
    "MCP preflight:",
    ...formatMcpPreflightPayloads({ proposal, selectedKey }),
    "",
    "Traversal completeness check:",
    buildAllPathsCheckCommand({ proposal }),
    ...formatMcpAllPathsPayloads({ proposal }),
    formatAllPathsEvidenceContractLine(),
    "",
    "Post-save graph checks:",
    ...buildPostSaveCheckCommands(),
    "",
    "Post-save graph DB proof + sync gate:",
    formatAgentPostChangeSyncPacket(),
  ].join("\n");
}

function buildSaveChecklistRows({
  inferredMatchesSelected,
  preflightDecision,
  labels,
}: {
  inferredMatchesSelected: boolean;
  preflightDecision: VaultRelationPreflight["decision"];
  labels: Pick<
    RelationWriteConfirmLabels,
    | "saveChecklistSelectedKey"
    | "saveChecklistPreflight"
    | "saveChecklistTraversal"
    | "saveChecklistSyncGate"
    | "saveChecklistReady"
    | "saveChecklistReview"
    | "saveChecklistBlocked"
    | "saveChecklistSyncRequired"
  >;
}): Array<{ key: string; label: string; value: string; status: "ready" | "review" | "blocked" }> {
  const preflightStatus =
    preflightDecision === "safe_to_add"
      ? "ready"
      : preflightDecision === "skip_existing"
        ? "blocked"
        : "review";
  const preflightValue =
    preflightStatus === "ready"
      ? labels.saveChecklistReady
      : preflightStatus === "blocked"
        ? labels.saveChecklistBlocked
        : labels.saveChecklistReview;

  return [
    {
      key: "selected-key",
      label: labels.saveChecklistSelectedKey,
      value: inferredMatchesSelected
        ? labels.saveChecklistReady
        : labels.saveChecklistReview,
      status: inferredMatchesSelected ? "ready" : "review",
    },
    {
      key: "preflight",
      label: labels.saveChecklistPreflight,
      value: preflightValue,
      status: preflightStatus,
    },
    {
      key: "traversal",
      label: labels.saveChecklistTraversal,
      value: labels.saveChecklistReview,
      status: "review",
    },
    {
      key: "sync",
      label: labels.saveChecklistSyncGate,
      value: labels.saveChecklistSyncRequired,
      status: "review",
    },
  ];
}

function formatRelationPreflightBlockReason(
  decision: VaultRelationPreflight["decision"],
): string {
  switch (decision) {
    case "skip_existing":
      return "exact relation already exists";
    case "review_inverse":
      return "inverse relation needs direction review";
    case "review_path":
      return "existing graph path needs meaning review";
    case "safe_to_add":
      return "safe to add";
  }
}

function formatMcpWritePacket({
  proposal,
  selectedKey,
}: {
  proposal: VaultRelationProposal;
  selectedKey: VaultRelationKey;
}): string {
  return [
    "# Relation write MCP payload",
    "",
    "- Run only after reviewing relation_check, path, and bounded all_paths evidence.",
    "- This writes frontmatter in the local vault.",
    formatMcpAddRelationToolCall({ proposal, selectedKey }),
  ].join("\n");
}

function formatCliPreflightPacket({
  proposal,
  selectedKey,
}: {
  proposal: VaultRelationProposal;
  selectedKey: VaultRelationKey;
}): string {
  return [
    "# Relation write CLI preflight",
    "",
    "- Run these before saving the builder edge when MCP is not connected.",
    `- ${buildRelationCheckCommand({ proposal, selectedKey })}`,
    "- Run bounded all_paths before treating a shortest path or existing path as complete evidence.",
    `- ${buildAllPathsCheckCommand({ proposal })}`,
    `- ${formatAllPathsEvidenceContractLine()}`,
  ].join("\n");
}

function formatMcpPreflightPacket({
  proposal,
  selectedKey,
}: {
  proposal: VaultRelationProposal;
  selectedKey: VaultRelationKey;
}): string {
  return [
    "# Relation write MCP preflight",
    "",
    "- Run these before saving the builder edge.",
    ...formatMcpPreflightPayloads({ proposal, selectedKey }).map(
      (payload) => `- ${payload}`,
    ),
    "- Run bounded all_paths before treating a shortest path or existing path as complete evidence.",
    ...formatMcpAllPathsPayloads({ proposal }).map((payload) => `- ${payload}`),
    `- ${formatAllPathsEvidenceContractLine()}`,
  ].join("\n");
}

function formatMcpPreflightPayloads({
  proposal,
  selectedKey,
}: {
  proposal: VaultRelationProposal;
  selectedKey: VaultRelationKey;
}): string[] {
  return [
    formatMcpRelationCheckArgs({ proposal, selectedKey }),
    formatMcpPathCheckArgs(proposal),
  ];
}

function buildRelationCheckCommand({
  proposal,
  selectedKey,
}: {
  proposal: VaultRelationProposal;
  selectedKey: VaultRelationKey;
}): string {
  return `oh-my-ontology relation-check ${proposal.sourceSlug} ${proposal.targetSlug} ${selectedKey} [vault]`;
}

function buildPostSaveCheckCommands(): string[] {
  return buildAgentPostChangeSyncCliCommands().map((item) => item.command);
}

function formatMcpAddRelationArgs({
  proposal,
  selectedKey,
}: {
  proposal: VaultRelationProposal;
  selectedKey: VaultRelationKey;
}): string {
  return JSON.stringify({
    from: proposal.sourceSlug,
    to: proposal.targetSlug,
    type: selectedKey,
  });
}

function formatMcpAddRelationToolCall({
  proposal,
  selectedKey,
}: {
  proposal: VaultRelationProposal;
  selectedKey: VaultRelationKey;
}): string {
  return JSON.stringify({
    tool: "add_relation",
    arguments: {
      from: proposal.sourceSlug,
      to: proposal.targetSlug,
      type: selectedKey,
    },
  });
}

function formatMcpRelationCheckArgs({
  proposal,
  selectedKey,
}: {
  proposal: VaultRelationProposal;
  selectedKey: VaultRelationKey;
}): string {
  return formatQueryOntologyCall({
    operation: "relation_check",
    from: proposal.sourceSlug,
    to: proposal.targetSlug,
    type: selectedKey,
  });
}

function formatMcpPathCheckArgs(proposal: VaultRelationProposal): string {
  return formatQueryOntologyCall({
    operation: "path",
    from: proposal.sourceSlug,
    to: proposal.targetSlug,
    maxHops: 5,
  });
}

function buildAllPathsCheckCommand({
  proposal,
}: {
  proposal: VaultRelationProposal;
}): string {
  return `oh-my-ontology all-paths ${proposal.sourceSlug} ${proposal.targetSlug} [vault] --plan --max-hops 5 --limit 10 --search-budget 1000`;
}

function formatMcpAllPathsPayloads({
  proposal,
}: {
  proposal: VaultRelationProposal;
}): string[] {
  return [
    formatQueryOntologyCall({
      operation: "query_plan",
      targetOperation: "all_paths",
      from: proposal.sourceSlug,
      to: proposal.targetSlug,
      maxHops: 5,
      limit: 10,
      searchBudget: 1000,
    }),
    formatQueryOntologyCall({
      operation: "all_paths",
      from: proposal.sourceSlug,
      to: proposal.targetSlug,
      maxHops: 5,
      limit: 10,
      searchBudget: 1000,
    }),
  ];
}

function formatQueryOntologyCall(payload: Record<string, unknown>): string {
  return `query_ontology(${JSON.stringify(payload)})`;
}

function formatAllPathsEvidenceContractLine(): string {
  return "all_paths evidence contract: report limit, searchBudget, expandedStates, exhaustive, truncatedByBudget, totalPathsExact, evidence.status, evidence.reason, and evidence.pathsComplete before using paths as write evidence";
}

function buildRelationOntologyHref(slug: string): string {
  return `/ontology/?node=${encodeURIComponent(slug)}`;
}

function buildRelationBuilderHref(slug: string): string {
  return `/ontology/edit/?node=${encodeURIComponent(slug)}`;
}

export function buildRelationTopologyPathHref(sourceSlug: string, targetSlug: string): string {
  return `/topology/?mode=path&pathFrom=${encodeURIComponent(
    sourceSlug,
  )}&pathTo=${encodeURIComponent(targetSlug)}`;
}

export function buildRelationTopologyFocusHref(slug: string): string {
  return `/topology/?mode=focus&p=${encodeURIComponent(slug)}`;
}

export function buildRelationQueryCockpitHref(slug?: string): string {
  return slug
    ? `/ontology/insights/?node=${encodeURIComponent(slug)}`
    : "/ontology/insights/";
}
