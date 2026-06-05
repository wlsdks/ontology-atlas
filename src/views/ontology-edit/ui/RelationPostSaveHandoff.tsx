"use client";

import { useState } from "react";
import { Check, Clipboard, GitBranch, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { copyText } from "@/shared/lib/copy-text";
import { formatQueryOntologyCall } from "@/shared/lib/ontology-query-call";
import { formatAgentPostChangeSyncPacket } from "@/shared/lib/ontology-tree";
import type { VaultRelationKey, VaultRelationProposal } from "../lib/relation-proposal";
import {
  buildRelationQueryCockpitHref,
  buildRelationTopologyFocusHref,
  buildRelationTopologyPathHref,
} from "./RelationWriteConfirm";

type RelationPostSaveHandoffLabels = {
  title: string;
  body: string;
  relationLabel: string;
  openPath: string;
  sourceFocus: string;
  targetFocus: string;
  queryCockpit: string;
  queryCockpitAriaLabel: string;
  copyProofPacket: string;
  copyProofPacketCopied: string;
  copyProofPacketFailed: string;
  copySyncGate: string;
  copySyncGateCopied: string;
  copySyncGateFailed: string;
  closeAriaLabel: string;
};

type RelationPostSaveHandoffProps = {
  relation: VaultRelationProposal & { selectedKey: VaultRelationKey };
  labels: RelationPostSaveHandoffLabels;
  onDismiss: () => void;
};

export function RelationPostSaveHandoff({
  relation,
  labels,
  onDismiss,
}: RelationPostSaveHandoffProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [proofCopyState, setProofCopyState] = useState<
    "idle" | "copied" | "failed"
  >("idle");
  const copyStatusLabel =
    copyState === "copied"
      ? labels.copySyncGateCopied
      : copyState === "failed"
        ? labels.copySyncGateFailed
        : "";
  const proofCopyStatusLabel =
    proofCopyState === "copied"
      ? labels.copyProofPacketCopied
      : proofCopyState === "failed"
        ? labels.copyProofPacketFailed
        : "";

  async function handleCopySyncGate() {
    const copied = await copyText(formatAgentPostChangeSyncPacket());
    setCopyState(copied ? "copied" : "failed");
  }

  async function handleCopyProofPacket() {
    const copied = await copyText(formatSavedRelationProofPacket(relation));
    setProofCopyState(copied ? "copied" : "failed");
  }

  return (
    <aside
      data-testid="builder-relation-post-save-handoff"
      className="pointer-events-auto absolute bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-4 z-40 w-[min(520px,calc(100%-2rem))] rounded-lg border border-[color:rgba(94,106,210,0.3)] bg-[color:var(--color-panel)] p-3 shadow-[0_18px_44px_rgba(0,0,0,0.28)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[color:rgba(94,106,210,0.26)] bg-[color:rgba(94,106,210,0.1)] text-[color:var(--color-indigo-accent)]">
            <GitBranch size={14} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
              {labels.title}
            </p>
            <p className="mt-1 break-keep text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
              {labels.body}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={labels.closeAriaLabel}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)]"
        >
          <X size={14} />
        </button>
      </div>
      <p className="mt-3 truncate rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1.5 font-mono text-[10px] text-[color:var(--color-text-secondary)]">
        <span className="text-[color:var(--color-text-quaternary)]">
          {labels.relationLabel}
        </span>{" "}
        {relation.sourceSlug}.{relation.selectedKey}
        {" -> "}
        {relation.targetSlug}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Link
          href={buildRelationTopologyPathHref(relation.sourceSlug, relation.targetSlug)}
          className="inline-flex h-7 items-center rounded-md border border-[color:rgba(94,106,210,0.28)] bg-[color:rgba(94,106,210,0.09)] px-2 text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.44)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)]"
        >
          {labels.openPath}
        </Link>
        <Link
          href={buildRelationTopologyFocusHref(relation.sourceSlug)}
          className="inline-flex h-7 items-center rounded-md border border-[color:var(--color-overlay-3)] px-2 text-[10px] text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)]"
        >
          {labels.sourceFocus}
        </Link>
        <Link
          href={buildRelationTopologyFocusHref(relation.targetSlug)}
          className="inline-flex h-7 items-center rounded-md border border-[color:var(--color-overlay-3)] px-2 text-[10px] text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)]"
        >
          {labels.targetFocus}
        </Link>
        <Link
          href={buildRelationQueryCockpitHref(relation.targetSlug)}
          aria-label={labels.queryCockpitAriaLabel}
          className="inline-flex h-7 items-center rounded-md border border-[color:rgba(94,106,210,0.28)] bg-[color:rgba(94,106,210,0.09)] px-2 text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.44)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)]"
        >
          {labels.queryCockpit}
        </Link>
        <button
          type="button"
          onClick={() => void handleCopyProofPacket()}
          aria-label={proofCopyStatusLabel || labels.copyProofPacket}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.26)] bg-[color:rgba(94,106,210,0.08)] px-2 text-[10px] text-[color:var(--color-text-secondary)] transition-[background-color,border-color,color,transform] duration-180 ease-out hover:border-[color:rgba(94,106,210,0.44)] hover:text-[color:var(--color-text-primary)] active:translate-y-[1px] motion-reduce:transition-none motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)]"
        >
          {proofCopyState === "copied" ? (
            <Check size={12} aria-hidden />
          ) : (
            <Clipboard size={12} aria-hidden />
          )}
          {labels.copyProofPacket}
        </button>
        <button
          type="button"
          onClick={() => void handleCopySyncGate()}
          aria-label={copyStatusLabel || labels.copySyncGate}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.26)] bg-[color:rgba(94,106,210,0.08)] px-2 text-[10px] text-[color:var(--color-text-secondary)] transition-[background-color,border-color,color,transform] duration-180 ease-out hover:border-[color:rgba(94,106,210,0.44)] hover:text-[color:var(--color-text-primary)] active:translate-y-[1px] motion-reduce:transition-none motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)]"
        >
          {copyState === "copied" ? (
            <Check size={12} aria-hidden />
          ) : (
            <Clipboard size={12} aria-hidden />
          )}
          {labels.copySyncGate}
        </button>
      </div>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {[proofCopyStatusLabel, copyStatusLabel].filter(Boolean).join(" ")}
      </span>
    </aside>
  );
}

function formatSavedRelationProofPacket(
  relation: VaultRelationProposal & { selectedKey: VaultRelationKey },
): string {
  return [
    "# Saved relation graph proof",
    "",
    `- Source: ${relation.sourceSlug}`,
    `- Target: ${relation.targetSlug}`,
    `- Relation: ${relation.selectedKey}`,
    `- Topology path: ${buildRelationTopologyPathHref(
      relation.sourceSlug,
      relation.targetSlug,
    )}`,
    `- Source focus: ${buildRelationTopologyFocusHref(relation.sourceSlug)}`,
    `- Target focus: ${buildRelationTopologyFocusHref(relation.targetSlug)}`,
    `- Source query: ${buildRelationQueryCockpitHref(relation.sourceSlug)}`,
    `- Target query: ${buildRelationQueryCockpitHref(relation.targetSlug)}`,
    "",
    "CLI proof:",
    `1. oh-my-ontology relation-check ${relation.sourceSlug} ${relation.targetSlug} ${relation.selectedKey} [vault]`,
    `2. oh-my-ontology path ${relation.sourceSlug} ${relation.targetSlug} [vault] --max-hops 5`,
    `3. oh-my-ontology all-paths ${relation.sourceSlug} ${relation.targetSlug} [vault] --plan --max-hops 5 --limit 10 --search-budget 1000`,
    "",
    "MCP proof:",
    `1. ${formatQueryOntologyCall({
      operation: "relation_check",
      from: relation.sourceSlug,
      to: relation.targetSlug,
      type: relation.selectedKey,
    })}`,
    `2. ${formatQueryOntologyCall({
      operation: "path",
      from: relation.sourceSlug,
      to: relation.targetSlug,
      maxHops: 5,
    })}`,
    `3. ${formatQueryOntologyCall({
      operation: "query_plan",
      targetOperation: "all_paths",
      from: relation.sourceSlug,
      to: relation.targetSlug,
      maxHops: 5,
      limit: 10,
      searchBudget: 1000,
    })}`,
    `4. ${formatQueryOntologyCall({
      operation: "all_paths",
      from: relation.sourceSlug,
      to: relation.targetSlug,
      maxHops: 5,
      limit: 10,
      searchBudget: 1000,
    })}`,
    "",
    "Evidence contract: report limit, searchBudget, expandedStates, exhaustive, truncatedByBudget, totalPathsExact, evidence.status, evidence.reason, and evidence.pathsComplete before using paths as proof.",
    "",
    "Structural containment replay:",
    "- Replace <project-slug> with the owning project root before using this as post-save ownership evidence.",
    "1. oh-my-ontology pattern-walk <project-slug> [vault] --pattern domains,capabilities --limit 10",
    "2. oh-my-ontology project-map <project-slug> [vault] --limit 10",
    `3. ${formatQueryOntologyCall({
      operation: "query_plan",
      targetOperation: "pattern_walk",
      start: "<project-slug>",
      pattern: ["domains", "capabilities"],
      limit: 10,
    })}`,
    `4. ${formatQueryOntologyCall({
      operation: "pattern_walk",
      start: "<project-slug>",
      pattern: ["domains", "capabilities"],
      limit: 10,
    })}`,
    `5. ${formatQueryOntologyCall({
      operation: "query_plan",
      targetOperation: "project_map",
      project: "<project-slug>",
      limit: 10,
    })}`,
    `6. ${formatQueryOntologyCall({
      operation: "project_map",
      project: "<project-slug>",
      limit: 10,
    })}`,
    "Containment contract: report pattern_walk paths.total/paths.limited and project_map summary.unresolvedEdges before claiming the saved edge preserves project ownership.",
    "",
    "Post-save graph DB proof + sync gate:",
    formatAgentPostChangeSyncPacket(),
  ].join("\n");
}
