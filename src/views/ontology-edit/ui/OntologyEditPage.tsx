"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  Clipboard,
  Download,
  Database,
  FileJson,
  Info,
  Maximize2,
  Minimize2,
  Network,
  PencilLine,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Wand2,
} from "lucide-react";
import {
  buildVaultMarkdown,
  vaultFolderForKind,
  vaultManifest as staticVaultManifestRaw,
  type VaultManifest,
} from "@/entities/docs-vault";
import { VaultConflictError, useLocalVault } from "@/features/docs-vault-local";
import { isTauriVaultRuntime } from "@/shared/lib/tauri-vault-fs";
import {
  AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT,
  formatAgentPostChangeSyncPacket,
} from "@/shared/lib/ontology-tree";
import { slugify } from "@/shared/lib/slugify";
import { OperationsNav } from "@/widgets/operations-nav";
import { MountedGlobalSearch } from "@/widgets/global-search";
import { copyText } from "@/shared/lib/copy-text";
import { Tooltip, useToast } from "@/shared/ui";
import { useEphemeralNodes } from "../lib/use-ephemeral-nodes";
import { useEphemeralEdges } from "../lib/use-ephemeral-edges";
import { isUntitledTitle } from "../lib/is-untitled-title";
import { downloadAtlasFrontmatter } from "../lib/export-frontmatter";
import { downloadGraphML, downloadJsonLd } from "../lib/export-graph";
import { BlastRadiusConfirm } from "./BlastRadiusConfirm";
import type { VaultBacklinkMatch } from "../lib/find-vault-backlinks";
import { findVaultBacklinks } from "../lib/find-vault-backlinks";
import {
  buildVaultRelationPatch,
  inferVaultRelationKey,
  preflightVaultRelation,
  readVaultRelationValues,
  type VaultRelationKey,
  type VaultRelationProposal,
} from "../lib/relation-proposal";
import { resolveBuilderQueryNodeSlug } from "../lib/resolve-builder-query-node";
import { resolveBuilderShortcut } from "../lib/resolve-builder-shortcut";
import {
  buildBuilderProofHref,
  resolveBuilderProofTarget,
} from "../lib/resolve-builder-proof-node";
import { buildSavedRelationHandoff } from "../lib/saved-relation-handoff";
import { RelationWriteConfirm } from "./RelationWriteConfirm";
import { RelationPostSaveHandoff } from "./RelationPostSaveHandoff";
import {
  buildBuilderEntryAnchors,
  type BuilderEntryAnchor,
} from "../lib/builder-entry-anchors";
import { formatBuilderGuardPacket, formatBuilderProofPacket } from "../lib/builder-proof-packet";
import { getBuilderSourceStatus } from "../lib/builder-source-status";

/**
 * 빌더 ephemeral 노드 → `${kind}s/${slug}.md` 로 vault 직접 작성.
 * frontmatter: kind / title / slug. 본문은 `# {title}` 한 줄 — 그 후
 * 사용자 또는 AI agent (MCP) 가 같은 vault 에서 이어서 편집한다.
 */
import { OntologyKindPalette } from "./OntologyKindPalette";
import { OntologyInspector, type VaultArrayKey } from "./OntologyInspector";
import { BuilderOnboarding } from "./BuilderOnboarding";

/**
 * `/ontology/edit` — ERD canvas editor v1.
 *
 * SSR 회피: xyflow 내부 ResizeObserver / window 의존성 → `next/dynamic`
 * + `ssr: false` 로 client-only mount. Next.js 16 정적 export 와 호환.
 */
const OntologyEditCanvas = dynamic<{
  vaultManifest: import("@/entities/docs-vault").VaultManifest | null;
  ephemeralNodes: ReturnType<typeof useEphemeralNodes>["nodes"];
  ephemeralEdges: ReturnType<typeof useEphemeralEdges>["edges"];
  onSelectionChange?: (selectedId: string | null) => void;
  onNodeOpen?: (selectedId: string) => void;
  onConnect?: (connection: import("@xyflow/react").Connection) => void;
  onVaultConnect?: (
    sourceSlug: string,
    targetSlug: string,
    sourceKind: string,
    targetKind: string,
  ) => void;
  onPersistEphemeralEdge?: (edgeId: string) => void;
  onRemoveEphemeralEdge?: (edgeId: string) => void;
  onVaultNodeDragStop?: (slug: string, position: { x: number; y: number }) => void;
  autoLayoutToken?: number;
  layoutMode?: "dagre" | "force";
  focusNodeId?: string | null;
  focusToken?: number;
  selectedId?: string | null;
}>(
  () => import("./OntologyEditCanvas").then((m) => m.OntologyEditCanvas),
  { ssr: false, loading: () => <CanvasSkeleton /> },
);

const BUILDER_PALETTE_COLLAPSED_KEY = "demo:builder-palette:collapsed:v1";

export type BuilderCommandStripState =
  | "empty"
  | "draft"
  | "selectedProject"
  | "selectedDomain"
  | "selectedCapability"
  | "selected"
  | "relationReview";

export interface BuilderDraftPreview {
  id: string;
  kind: string;
  title: string;
  kindLabel: string;
  path: string;
  needsName: boolean;
}

export function formatBuilderDraftAgentPacket(drafts: BuilderDraftPreview[]): string {
  const readyDrafts = drafts.filter((draft) => !draft.needsName);
  const addConceptArgs = readyDrafts.map((draft) => ({
    slug: draft.path.endsWith(".md") ? draft.path.slice(0, -3) : draft.path,
    kind: draft.kind,
    title: draft.title,
  }));
  return [
    "Ontology Atlas draft ontology concepts",
    "",
    "Drafts:",
    ...readyDrafts.map(
      (draft) => `- ${draft.kind}: ${draft.title} -> ${draft.path}`,
    ),
    "",
    "MCP add_concepts args:",
    JSON.stringify({ concepts: addConceptArgs }, null, 2),
    "",
    "After saving, verify:",
    "- validate_vault({ repoRoot })",
    "- compile_ontology({ summary: true })",
  ].join("\n");
}

export function formatBuilderVerificationPacket(): string {
  return [
    "Ontology Atlas save/verify/revert checklist",
    "",
    "What is saved:",
    "- Saved concepts and relations are markdown files in the selected local vault.",
    "- Draft canvas changes stay in memory until their Save action writes vault markdown.",
    "",
    "Review before you revert:",
    "git status --short",
    "git diff -- docs/ontology public/docs-vault src/entities/docs-vault/data",
    "",
    "Verify the ontology:",
    "pnpm docs-vault:build && pnpm docs-vault:check",
    "node cli/src/index.mjs validate docs/ontology --json",
    "pnpm cli:mcp-verify docs/ontology --timeout-ms 15000",
    "",
    "Agent MCP follow-up:",
    "validate_vault({})",
    'query_ontology({"operation":"health"})',
    'query_ontology({"operation":"maintenance_plan","nodeLimit":8})',
    "",
    "Revert only after reviewing the diff:",
    "git restore -- docs/ontology public/docs-vault src/entities/docs-vault/data",
  ].join("\n");
}

export function resolveBuilderCommandStripState({
  draftNodes,
  draftEdges,
  hasSelection,
  hasPendingRelation,
  selectedKind,
  selectedEphemeral,
}: {
  draftNodes: number;
  draftEdges: number;
  hasSelection: boolean;
  hasPendingRelation: boolean;
  selectedKind?: string | null;
  selectedEphemeral?: boolean;
}): BuilderCommandStripState {
  if (hasPendingRelation) return "relationReview";
  if (selectedEphemeral) return "draft";
  if (hasSelection) {
    if (selectedKind === "project") return "selectedProject";
    if (selectedKind === "domain") return "selectedDomain";
    if (selectedKind === "capability") return "selectedCapability";
    return "selected";
  }
  if (draftNodes > 0 || draftEdges > 0) return "draft";
  return "empty";
}

function isSelectedBuilderCommandState(state: BuilderCommandStripState): boolean {
  return (
    state === "selected" ||
    state === "selectedProject" ||
    state === "selectedDomain" ||
    state === "selectedCapability"
  );
}

export function resolveBuilderHeaderActionLabel({
  label,
  hint,
}: {
  label: string;
  hint: string;
}): { ariaLabel: string; title: string } {
  return {
    ariaLabel: `${label} · ${hint}`,
    title: hint,
  };
}

export function formatBuilderAnchorDegreeBadge(label: string, degree: number): string {
  return `${label} ${degree}`;
}

export function formatBuilderActiveFocusLabel(label: string, slug: string): string {
  return `${label} ${slug}`;
}

function isOntologyKind(kind: string): kind is "project" | "domain" | "capability" | "element" {
  return kind === "project" || kind === "domain" || kind === "capability" || kind === "element";
}

function CanvasSkeleton() {
  const t = useTranslations("ontologyPages.edit.page");
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-xs text-[color:var(--color-text-quaternary)]">{t("canvasLoading")}</p>
    </div>
  );
}

export function BuilderCommandStrip({
  state,
  draftNodes,
  draftEdges,
  selectedTitle,
  onPrimaryAction,
  onSecondaryAction,
  secondaryHref,
}: {
  state: BuilderCommandStripState;
  draftNodes: number;
  draftEdges: number;
  selectedTitle?: string | null;
  onPrimaryAction: () => void;
  onSecondaryAction: () => void;
  secondaryHref?: "/ontology/insights/" | `/ontology/insights/?node=${string}`;
}) {
  const t = useTranslations("ontologyPages.edit.page.commandStrip");
  const primaryLabel = t(`${state}.primary`);
  const secondaryLabel = t(`${state}.secondary`);
  const contextualSecondaryLabel = selectedTitle
    ? `${selectedTitle} ${secondaryLabel}`
    : secondaryLabel;
  const hasStagedDraft = draftNodes > 0 || draftEdges > 0;
  const primaryIcon =
    state === "empty" ||
    state === "selectedProject" ||
    state === "selectedDomain" ||
    state === "selectedCapability"
      ? PencilLine
      : state === "relationReview"
        ? ShieldCheck
        : Info;
  const PrimaryIcon = primaryIcon;
  return (
    <section
      aria-label={t("ariaLabel")}
      className="flex min-w-[min(100%,280px)] max-w-full flex-1 flex-col items-stretch gap-2 rounded-md border border-[color:rgba(94,106,210,0.18)] bg-[color:rgba(94,106,210,0.06)] px-2 py-1 sm:flex-row sm:items-center"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {t(`${state}.title`, {
            nodes: draftNodes,
            edges: draftEdges,
            title: selectedTitle ?? t("selectedFallback"),
          })}
        </p>
        <p className="hidden truncate text-[10px] leading-4 text-[color:var(--color-text-quaternary)] xl:block">
          {t(`${state}.body`, {
            nodes: draftNodes,
            edges: draftEdges,
            title: selectedTitle ?? t("selectedFallback"),
          })}
        </p>
        {hasStagedDraft ? (
          <p
            role="status"
            aria-live="polite"
            className="mt-1 inline-flex max-w-full items-center gap-1 rounded-sm border border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.08)] px-1.5 py-0.5 text-[10px] leading-3 text-[color:var(--color-text-secondary)] motion-safe:animate-[atlasStatusIn_180ms_ease-out]"
          >
            <span
              aria-hidden="true"
              className="h-1 w-1 shrink-0 rounded-full bg-[color:var(--color-indigo-accent)]"
            />
            <span className="truncate">
              {t("stagedStatus", { nodes: draftNodes, edges: draftEdges })}
            </span>
          </p>
        ) : null}
      </div>
      <div className="grid shrink-0 grid-cols-2 items-center gap-1 sm:flex">
        <button
          type="button"
          onClick={onPrimaryAction}
          aria-label={primaryLabel}
          title={primaryLabel}
          className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-[color:rgba(94,106,210,0.34)] bg-[color:rgba(94,106,210,0.14)] px-2.5 text-[10px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.52)] hover:bg-[color:rgba(94,106,210,0.20)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset"
        >
          <PrimaryIcon size={12} />
          <span>{primaryLabel}</span>
        </button>
        {secondaryHref ? (
          <Link
            href={secondaryHref}
            aria-label={contextualSecondaryLabel}
            title={contextualSecondaryLabel}
            className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-[color:rgba(94,106,210,0.30)] bg-[color:rgba(94,106,210,0.10)] px-2.5 text-[10px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] transition-[border-color,background-color,transform] hover:border-[color:rgba(94,106,210,0.52)] hover:bg-[color:rgba(94,106,210,0.16)] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.42)] focus-visible:ring-inset motion-reduce:transition-colors motion-reduce:active:translate-y-0"
          >
            <ShieldCheck size={12} />
            <span>{secondaryLabel}</span>
          </Link>
        ) : (
          <button
            type="button"
            onClick={onSecondaryAction}
            aria-label={contextualSecondaryLabel}
            title={contextualSecondaryLabel}
            className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:rgba(255,255,255,0.03)] px-2.5 text-[10px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.32)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.38)] focus-visible:ring-inset"
          >
            <ShieldCheck size={12} />
            <span>{secondaryLabel}</span>
          </button>
        )}
      </div>
    </section>
  );
}

export function BuilderDetailsDraftCallout({
  draftNodes,
  draftEdges,
  onOpenWriteSummary,
}: {
  draftNodes: number;
  draftEdges: number;
  onOpenWriteSummary: () => void;
}) {
  const t = useTranslations("ontologyPages.edit.page");
  if (draftNodes === 0 && draftEdges === 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[color:rgba(94,106,210,0.22)] bg-[color:rgba(94,106,210,0.07)] px-4 py-2.5 motion-safe:animate-[atlasStatusIn_180ms_ease-out]">
      <div className="flex min-w-0 items-start gap-2">
        <span
          aria-hidden="true"
          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-indigo-accent)]"
        />
        <div className="min-w-0">
          <p className="truncate text-[11px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {t("detailsDraftStatusTitle", {
              nodes: draftNodes,
              edges: draftEdges,
            })}
          </p>
          <p className="mt-0.5 hidden truncate text-[10px] leading-4 text-[color:var(--color-text-tertiary)] sm:block">
            {t("detailsDraftStatusBody")}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpenWriteSummary}
        className="inline-flex h-8 shrink-0 items-center rounded-md border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.13)] px-2.5 text-[10px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.52)] hover:bg-[color:rgba(94,106,210,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset"
      >
        {t("detailsDraftStatusAction")}
      </button>
    </div>
  );
}

export function BuilderCanvasEntryRail({
  anchors,
  nodeCount,
  relationCount,
  selectedAnchorId,
  expanded,
  onToggleExpanded,
  onFocusAnchor,
  onOpenAnchors,
}: {
  anchors: BuilderEntryAnchor[];
  nodeCount: number;
  relationCount: number;
  selectedAnchorId?: string | null;
  expanded: boolean;
  onToggleExpanded: () => void;
  onFocusAnchor: (id: string) => void;
  onOpenAnchors?: () => void;
}) {
  const t = useTranslations("ontologyPages.edit.page.canvasEntryRail");
  const tKinds = useTranslations("kinds");
  if (anchors.length === 0) return null;
  const selectedAnchor = anchors.find((anchor) => anchor.id === selectedAnchorId);
  const primaryAnchor = selectedAnchor ?? anchors[0];
  const primaryAnchorKindLabel =
    isOntologyKind(primaryAnchor.kind)
      ? tKinds(primaryAnchor.kind)
      : primaryAnchor.kind;
  const hiddenAnchorCount = Math.max(0, anchors.length - 1);
  const selectedAnchorSlug = selectedAnchor?.id ?? selectedAnchorId ?? null;
  const selectedAnchorLabel = selectedAnchor?.label ?? selectedAnchorSlug ?? null;
  const collapsedRailLabel = selectedAnchorSlug
    ? `${t("collapsedAriaLabel", {
        nodes: nodeCount,
        relations: relationCount,
      })} · ${t("activeFocusAriaLabel", { slug: selectedAnchorSlug })}`
    : t("collapsedAriaLabel", {
        nodes: nodeCount,
        relations: relationCount,
      });
  const flow = [
    {
      step: "01",
      label: t("flowFocus"),
      icon: Network,
    },
    {
      step: "02",
      label: t("flowWrite"),
      icon: PencilLine,
    },
    {
      step: "03",
      label: t("flowProof"),
      icon: Database,
    },
  ] as const;

  if (!expanded) {
    return (
      <div
        id="builder-canvas-entry-rail"
        role="region"
        aria-label={t("collapsedAriaLabel", {
          nodes: nodeCount,
          relations: relationCount,
        })}
        className="pointer-events-none absolute left-3 top-3 z-10 max-w-[min(420px,calc(100%-1.5rem))]"
      >
        <button
          type="button"
          aria-expanded={false}
          aria-controls="builder-canvas-entry-rail"
          aria-label={collapsedRailLabel}
          title={t("hint")}
          onClick={onToggleExpanded}
          className="pointer-events-auto flex h-8 max-w-full items-center gap-1.5 rounded-lg border border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(15,16,17,0.88)] px-2.5 text-left text-[11px] text-[color:var(--color-text-secondary)] shadow-[0_10px_32px_rgba(0,0,0,0.22)] transition-colors hover:border-[color:rgba(94,106,210,0.42)] hover:text-[color:var(--color-text-primary)]"
        >
          <Network size={12} className="shrink-0 text-[color:var(--color-indigo-accent)]" />
          <span className="shrink-0 font-[var(--font-weight-signature)]">
            {t("collapsedLabel")}
          </span>
          {selectedAnchorSlug ? (
            <span
              aria-label={t("activeFocusAriaLabel", { slug: selectedAnchorSlug })}
              className="min-w-0 truncate text-[10px] text-[color:var(--color-text-quaternary)]"
              title={selectedAnchorLabel ?? undefined}
            >
              {formatBuilderActiveFocusLabel(t("activeFocusVisibleLabel"), selectedAnchorSlug)}
            </span>
          ) : (
            <span className="min-w-0 truncate font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
              {t("collapsedStats", { nodes: nodeCount, relations: relationCount })}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      id="builder-canvas-entry-rail"
      role="region"
      aria-label={t("ariaLabel", { nodes: nodeCount, relations: relationCount })}
      className="pointer-events-none absolute left-3 right-3 top-3 z-10 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:rgba(15,16,17,0.94)] px-2 py-1.5"
    >
      <p className="sr-only">
        {t("hint")} {flow.map((item) => `${item.step} ${item.label}`).join(" · ")}
      </p>
      <div className="flex items-center gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <Network size={12} className="text-[color:var(--color-indigo-accent)]" />
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {t("label")}
          </p>
        </div>
        <p className="hidden font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-text-tertiary)] lg:block">
          {t("stats", { nodes: nodeCount, relations: relationCount })}
        </p>
        <button
          type="button"
          aria-expanded={true}
          aria-controls="builder-canvas-entry-rail"
          onClick={onToggleExpanded}
          className="pointer-events-auto hidden h-6 shrink-0 items-center rounded-md border border-[color:var(--color-border-soft)] px-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)] transition-colors hover:border-[color:rgba(94,106,210,0.38)] hover:text-[color:var(--color-text-primary)] sm:inline-flex"
        >
          {t("collapseAction")}
        </button>
        <span
          className="hidden rounded-md border border-[color:rgba(94,106,210,0.22)] bg-[color:rgba(94,106,210,0.08)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-indigo-accent)] sm:inline-flex"
          title={t("hint")}
        >
          {t("focusChip")}
        </span>
        {selectedAnchorSlug ? (
          <span
            aria-label={t("activeFocusAriaLabel", { slug: selectedAnchorSlug })}
            className="max-w-[230px] truncate rounded-md border border-[color:rgba(139,151,255,0.22)] bg-[color:rgba(139,151,255,0.06)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-secondary)]"
            title={selectedAnchorLabel ?? undefined}
          >
            {t("activeFocus", { slug: selectedAnchorSlug })}
          </span>
        ) : null}
        <div className="ml-auto flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            aria-pressed={selectedAnchorId === primaryAnchor.id}
            aria-label={t("anchorAriaLabel", {
              kind: primaryAnchorKindLabel,
              label: primaryAnchor.label,
              slug: primaryAnchor.id,
              degree: primaryAnchor.degree,
            })}
            onClick={() => onFocusAnchor(primaryAnchor.id)}
            data-anchor-slug={primaryAnchor.id}
            className={
              selectedAnchorId === primaryAnchor.id
                ? "pointer-events-auto flex h-7 min-w-0 max-w-[250px] shrink items-center gap-1.5 rounded-md border border-[color:rgba(139,151,255,0.42)] bg-[color:rgba(139,151,255,0.15)] px-2 text-left text-[10px] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(139,151,255,0.54)]"
                : "pointer-events-auto flex h-7 min-w-0 max-w-[250px] shrink items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.22)] bg-[color:rgba(94,106,210,0.08)] px-2 text-left text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.38)] hover:bg-[color:rgba(94,106,210,0.13)] hover:text-[color:var(--color-text-primary)]"
            }
            title={t("anchorTitle", {
              kind: primaryAnchorKindLabel,
              label: primaryAnchor.label,
              slug: primaryAnchor.id,
              degree: primaryAnchor.degree,
            })}
          >
            <span className="shrink-0 font-mono uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
              {primaryAnchor.kind.slice(0, 1)}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {primaryAnchor.label}
            </span>
            <span className="sr-only">
              {t("anchorSlugLabel", { slug: primaryAnchor.id })}
            </span>
            <span
              aria-label={t("degreeAriaLabel", { degree: primaryAnchor.degree })}
              className={
                selectedAnchorId === primaryAnchor.id
                  ? "ml-auto shrink-0 rounded border border-[color:rgba(139,151,255,0.22)] bg-[color:rgba(0,0,0,0.20)] px-1 font-mono text-[9px] tabular-nums text-[color:var(--color-text-secondary)]"
                  : "ml-auto shrink-0 rounded border border-[color:rgba(255,255,255,0.08)] bg-[color:rgba(0,0,0,0.16)] px-1 font-mono text-[9px] tabular-nums text-[color:var(--color-text-quaternary)]"
              }
            >
              {primaryAnchor.degree}
            </span>
          </button>
          {hiddenAnchorCount > 0 && onOpenAnchors ? (
            <button
              type="button"
              onClick={onOpenAnchors}
              aria-label={t("openAnchorDialogAriaLabel", { count: hiddenAnchorCount })}
              className="pointer-events-auto flex h-7 shrink-0 items-center rounded-md border border-[color:var(--color-border-soft)] bg-[color:rgba(255,255,255,0.03)] px-2 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(94,106,210,0.38)] hover:text-[color:var(--color-text-primary)]"
            >
              {t("openAnchorDialog", { count: hiddenAnchorCount })}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

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
          <h2 className="text-[12px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {t("summaryTitle")}
          </h2>
          <p className="mt-0.5 truncate text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
            <span className="font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
              {t("nextStepLabel")}
            </span>{" "}
            {nextStep}
          </p>
        </div>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[color:rgba(139,151,255,0.20)] bg-[color:rgba(94,106,210,0.08)] text-[color:var(--color-indigo-accent)]">
          <ShieldCheck size={13} aria-hidden />
        </span>
      </header>
      {items.map((item) => {
        const accentClass =
          item.accent === "indigo"
            ? "border-[color:rgba(94,106,210,0.30)] bg-[color:rgba(94,106,210,0.08)]"
            : item.accent === "amber"
              ? "border-[color:rgba(244,183,49,0.30)] bg-[color:rgba(244,183,49,0.07)]"
              : "border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]";
        return (
          <article
            key={item.label}
            role="listitem"
            aria-label={`${item.label}: ${item.value}. ${item.chip}. ${item.body}. ${item.flow}`}
            className={`flex min-w-0 max-w-full flex-wrap items-center gap-2 rounded-md border px-2.5 py-2 ${accentClass}`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[color:rgba(139,151,255,0.14)] bg-[color:rgba(0,0,0,0.14)] text-[color:var(--color-indigo-accent)]">
              {item.icon}
            </span>
            <div className="min-w-0 flex-1 basis-[12rem]">
              <p className="min-w-0 truncate text-[11px] font-medium text-[color:var(--color-text-tertiary)]">
                {item.label}
              </p>
              <p className="mt-0.5 truncate text-[12px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                {item.value}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-[color:var(--color-text-quaternary)]">
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
                      className="min-w-0 rounded border border-[color:rgba(94,106,210,0.18)] bg-[color:rgba(0,0,0,0.12)] px-1.5 py-1"
                    >
                      <p className="truncate text-[10px] font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
                        {draft.kindLabel} · {draft.title}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[9px] text-[color:var(--color-text-quaternary)]">
                        {draft.path}
                      </p>
                    </div>
                  ))}
                  {item.draftPreviewMore ? (
                    <p className="truncate text-[9px] text-[color:var(--color-text-quaternary)]">
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
                    ? "hidden rounded border border-[color:rgba(94,106,210,0.22)] bg-[color:rgba(94,106,210,0.08)] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.08em] text-[color:rgba(159,170,235,0.95)] xl:block"
                    : "hidden rounded border border-[color:var(--color-border-soft)] bg-[color:rgba(255,255,255,0.02)] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)] xl:block"
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
                    className="inline-flex h-7 items-center rounded-md border border-[color:rgba(94,106,210,0.24)] px-2 text-[10px] font-[var(--font-weight-signature)] text-[color:rgba(159,170,235,0.95)] transition-colors hover:border-[color:rgba(94,106,210,0.42)] hover:text-[color:var(--color-text-primary)]"
                  >
                    {item.actionLabel}
                  </Link>
                ) : null}
                {item.onAction && item.actionLabel ? (
                  <button
                    type="button"
                    onClick={item.onAction}
                    aria-label={item.actionAriaLabel ?? item.actionLabel}
                    className="inline-flex h-7 items-center rounded-md border border-[color:rgba(94,106,210,0.24)] px-2 text-[10px] font-[var(--font-weight-signature)] text-[color:rgba(159,170,235,0.95)] transition-colors hover:border-[color:rgba(94,106,210,0.42)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.38)] focus-visible:ring-inset"
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
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-[color:rgba(94,106,210,0.24)] px-2 text-[10px] font-[var(--font-weight-signature)] text-[color:rgba(159,170,235,0.95)] transition-colors hover:border-[color:rgba(94,106,210,0.42)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.38)] focus-visible:ring-inset"
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

export function OntologyEditPage() {
  const t = useTranslations("ontologyPages.edit.page");
  const tKinds = useTranslations("kinds");
  const searchParams = useSearchParams();
  const vault = useLocalVault();
  const isDesktopRuntime = isTauriVaultRuntime();
  const demoSaveToastKey = isDesktopRuntime
    ? "toastDemoModePicker"
    : "toastDemoModeDownload";
  const demoEdgeToastKey = isDesktopRuntime
    ? "toastVaultEdgeDemoPicker"
    : "toastVaultEdgeDemoDownload";

  const { nodes: ephemeralNodes, addNode: addNodeRaw, clearAll, updateNode, findById, removeNode } =
    useEphemeralNodes();
  // ephemeral 노드의 kindLabel / placeholder 도 locale 별로 caller 가
  // 미리 만들어 hook 에 주입 — hook 자체는 i18n 무지.
  const addNode = useCallback(
    (kind: 'project' | 'domain' | 'capability' | 'element') =>
      addNodeRaw(kind, {
        kindLabel: tKinds(kind),
        defaultTitle: t('untitledPlaceholder'),
      }),
    [addNodeRaw, tKinds, t],
  );
  const {
    edges: ephemeralEdges,
    addEdge: addEphemeralEdge,
    addEdgeByIds: addEphemeralEdgeByIds,
    clearAll: clearEphemeralEdges,
    removeEdge: removeEphemeralEdge,
  } = useEphemeralEdges();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  // 자동 정렬 토큰 — increment 마다 캔버스가 frontmatter.canvasPosition
  // 무시하고 자동 layout 으로 노드 위치 reset (in-memory only). frontmatter
  // 자체는 그대로라 다음 mount 부터 다시 사용자 좌표 복원 (선호 보존). 사용자가
  // 다시 drag-stop 하면 그때부터 새 frontmatter 좌표로 갱신.
  const [autoLayoutToken, setAutoLayoutToken] = useState(0);
  // focusToken — 외부 (검색 등) 가 noticed 변화 트리거. 매 increment 시
  // canvas 가 focusNodeId 노드로 viewport pan.
  const [focusToken, setFocusToken] = useState(0);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  // layout 알고리즘 — dagre (default, kind 계층 LR) 또는 force (organic).
  // 정렬 방식 disclosure 안에서 선택. 변경 시 in-memory layout 만 재계산 (frontmatter 그대로).
  const [layoutMode, setLayoutMode] = useState<"dagre" | "force">("dagre");
  // 팔레트 선호 — null 은 아직 사용자가 선택하지 않았다는 뜻. 이 경우
  // persisted graph 가 있으면 graph-first 로 접고, 빈 캔버스면 펼쳐 둔다.
  const [paletteCollapsedPreference, setPaletteCollapsedPreference] = useState<
    boolean | null
  >(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = window.localStorage.getItem(BUILDER_PALETTE_COLLAPSED_KEY);
      return stored === null ? null : stored === "1";
    } catch {
      return null;
    }
  });
  // hydration 가드 — SSR(정적 export) HTML 은 localStorage 를 못 읽어 기본값
  // (팔레트 펼침) 으로 렌더된다. 첫 client 렌더가 곧장
  // localStorage 선호를 반영하면 그 기본값 HTML 과 어긋나 hydration mismatch
  // (트리 재생성) 가 난다. hydrated 가 false 인 동안엔 서버 기본값을 그대로 쓰고
  // mount 후 true 로 바뀌면 저장된 선호를 적용한다. (HomePage 와 동일 패턴)
  const hydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [anchorsOpen, setAnchorsOpen] = useState(false);
  const [anchorRailOpen, setAnchorRailOpen] = useState(false);
  const [writeSummaryOpen, setWriteSummaryOpen] = useState(false);
  const [layoutSettingsOpen, setLayoutSettingsOpen] = useState(false);
  // Blast-radius modal state — driven by deleteVaultDoc requesting a
  // confirmation. Stays null when the user is not actively confirming a
  // delete; opens when delete is clicked and resolves on cancel/confirm.
  const [pendingDelete, setPendingDelete] = useState<{
    slug: string;
    title?: string;
    backlinks: VaultBacklinkMatch[];
  } | null>(null);
  const [pendingRelation, setPendingRelation] =
    useState<VaultRelationProposal | null>(null);
  const [pendingRelationKey, setPendingRelationKey] =
    useState<VaultRelationKey>("relates");
  const [lastSavedRelation, setLastSavedRelation] =
    useState<(VaultRelationProposal & { selectedKey: VaultRelationKey }) | null>(null);
  // Clear-all 두 단계 confirm — 첫 클릭에 confirming=true (3s), 같은 버튼
  // 다시 클릭 시 실제 clear. 실수로 임시 작업 다 날아가는 회귀 방지.
  const [clearConfirming, setClearConfirming] = useState(false);
  useEffect(() => {
    if (!clearConfirming) return;
    const timer = setTimeout(() => setClearConfirming(false), 3000);
    return () => clearTimeout(timer);
  }, [clearConfirming]);
  const toast = useToast();
  // Builder writes are gated by the actual writable vault handle/manifest, not
  // by route-level mode copy. This keeps create/save aligned with the summary,
  // inspector, and relation-write paths when restored vault state races route
  // transitions in the desktop WebView.
  const hasLiveVault = vault.manifest !== null;
  const vaultUnavailable =
    !hasLiveVault && (vault.status === "permission-needed" || vault.status === "error");
  // 빌더 진실원 우선순위: live vault.manifest > 빌드타임 dogfood 매니페스트.
  const effectiveManifest = vault.manifest ?? (staticVaultManifestRaw as VaultManifest);
  // slug → doc Map 한 번 — vaultSelected 재계산 외에도 저장 전 중복 경로
  // 판정에서 재사용. 이전엔 매 render 마다 manifest.docs.find 로 O(N) 스캔.
  const docsBySlug = useMemo(
    () => new Map(effectiveManifest.docs.map((d) => [d.slug, d])),
    [effectiveManifest],
  );
  const hasDraftPathConflict = useCallback(
    (kind: string, title: string) => {
      const slug = slugify(title);
      if (!slug) return false;
      return docsBySlug.has(`${vaultFolderForKind(kind)}/${slug}`);
    },
    [docsBySlug],
  );
  const getDraftPathSuggestion = useCallback(
    (kind: string, title: string) => {
      const baseTitle = title.trim();
      const baseSlug = slugify(baseTitle);
      if (!baseTitle || !baseSlug) return null;
      const folder = vaultFolderForKind(kind);
      for (let n = 2; n <= 99; n += 1) {
        const nextTitle = `${baseTitle} ${n}`;
        const nextSlug = slugify(nextTitle);
        const nextPath = `${folder}/${nextSlug}`;
        if (!docsBySlug.has(nextPath)) {
          return { title: nextTitle, path: `${nextPath}.md` };
        }
      }
      return null;
    },
    [docsBySlug],
  );
  const draftPreviews = useMemo<BuilderDraftPreview[]>(
    () =>
      ephemeralNodes.map((node) => {
        const named = !isUntitledTitle(node.title, t("untitledPlaceholder"));
        const slug = named ? slugify(node.title) : "";
        return {
          id: node.id,
          kind: node.kind,
          title:
            named && node.title.trim()
              ? node.title.trim()
              : t("writeSummary.draftPreviewUntitled"),
          kindLabel: node.kindLabel,
          path: slug
            ? `${vaultFolderForKind(node.kind)}/${slug}.md`
            : t("writeSummary.draftPreviewPathPending"),
          needsName: !slug,
        };
      }),
    [ephemeralNodes, t],
  );

  const saveEphemeral = useCallback(
    async (nodeId: string) => {
      const node = findById(nodeId);
      if (!node) return;
      // placeholder ("(enter a name)" / "(이름 입력)") 그대로 통과 시
      // slugify 가 "enter-a-name.md" 를 만들어 vault 에 silent pollution.
      // Inspector 의 save 버튼은 같은 룰로 disabled 되지만 다른 진입점에서
      // 들어올 수 있어 함수 자체에서 가드.
      if (isUntitledTitle(node.title, t("untitledPlaceholder"))) {
        toast.show(t("toastEmptyName"), "error");
        return;
      }
      const slug = slugify(node.title);
      if (!slug) {
        toast.show(t("toastEmptyName"), "error");
        return;
      }
      const vaultSlug = `${vaultFolderForKind(node.kind)}/${slug}`;
      if (docsBySlug.has(vaultSlug)) {
        toast.show(t("toastSavePathConflict", { path: vaultSlug }), "error");
        return;
      }
      setSavingId(nodeId);
      try {
        if (hasLiveVault) {
          // vault `.md` 직접 작성. 경로 = `${폴더}/${slug}.md`
          // (capabilities/auth-platform — dogfood vault 와 같은 폴더 패턴).
          // 폴더 복수형 규칙은 entities/docs-vault 의 vaultFolderForKind 로
          // 단일화 (토폴로지 노드 생성 S2 와 drift 방지).
          const md = buildVaultMarkdown({
            kind: node.kind,
            title: node.title,
            slug: vaultSlug,
          });
          await vault.createDoc(vaultSlug, md);
          toast.show(
            t("toastSaveSuccess", { title: node.title, path: vaultSlug }),
            "success",
          );
          removeNode(nodeId);
          // 저장된 노드의 vault id 로 select 전환 — 이어서 dependencies /
          // capabilities 등 frontmatter 편집 흐름이 끊기지 않게.
          setSelectedId(vaultSlug);
          setDetailsOpen(true);
        } else {
          // vault 미선택 (static) 시 runtime 별 local-work 진입점 안내.
          toast.show(t(demoSaveToastKey), "error");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : t("toastSaveFailed");
        toast.show(message, "error");
      } finally {
        setSavingId(null);
      }
    },
    [demoSaveToastKey, docsBySlug, findById, hasLiveVault, removeNode, t, toast, vault],
  );
  const ephemeralSelected = findById(selectedId);
  // vault 모드에서는 selectedId 가 vault slug. manifest 에서 lookup 해
  // 인스펙터에 frontmatter + array 키 (capabilities/elements/...) 까지
  // 함께 전달 (in-canvas rename + array 편집 가능).
  //
  // 빌더 진실원 우선순위: live vault.manifest > 빌드타임 dogfood 매니페스트.
  // 인스펙터 lookup 도 같은 우선순위 — vault 안 고른 사용자가 dogfood 노드
  // 클릭 시 정확한 frontmatter 를 본다. hasLiveVault 가 false 면 인스펙터는
  // read-only — patch 시도하면 disk 권한 없어 어차피 fail.
  const restoringVault =
    !hasLiveVault && (vault.status === "loading" || vault.status === "opening");
  const builderGraphStats = useMemo(() => {
    const relationKeys = [
      "domains",
      "capabilities",
      "elements",
      "dependencies",
      "depends_on",
      "relates",
      "contains",
      "describes",
    ] as const;
    let persistedNodes = 0;
    let persistedRelations = 0;
    for (const doc of effectiveManifest.docs) {
      if (typeof doc.frontmatter.kind !== "string") continue;
      persistedNodes += 1;
      const fm = doc.frontmatter as Record<string, unknown>;
      for (const key of relationKeys) {
        const value = fm[key];
        if (Array.isArray(value)) {
          persistedRelations += value.filter((item) => typeof item === "string").length;
        }
      }
    }
    return { persistedNodes, persistedRelations };
  }, [effectiveManifest]);
  const builderEntryAnchors = useMemo(
    () => buildBuilderEntryAnchors(effectiveManifest),
    [effectiveManifest],
  );
  const focusBuilderAnchor = useCallback((id: string) => {
    setSelectedId(id);
    setFocusNodeId(id);
    setFocusToken((n) => n + 1);
    setAutoLayoutToken((n) => n + 1);
  }, []);
  const openNodeDetails = useCallback((id: string) => {
    setSelectedId(id);
    setFocusNodeId(id);
    setFocusToken((n) => n + 1);
    setDetailsOpen(true);
  }, []);
  const handleCanvasSelectionChange = useCallback((id: string | null) => {
    setSelectedId(id);
  }, []);
  const autoFocusedGraphKeyRef = useRef<string | null>(null);
  const builderEntryGraphKey = [
    hasLiveVault ? "live" : "static",
    builderGraphStats.persistedNodes,
    builderGraphStats.persistedRelations,
    builderEntryAnchors[0]?.id ?? "empty",
  ].join(":");
  useEffect(() => {
    const firstAnchor = builderEntryAnchors[0];
    if (!firstAnchor || autoFocusedGraphKeyRef.current === builderEntryGraphKey) {
      return;
    }
    autoFocusedGraphKeyRef.current = builderEntryGraphKey;
    if (selectedId !== null && selectedId !== firstAnchor.id) return;
    const timer = window.setTimeout(() => focusBuilderAnchor(firstAnchor.id), 0);
    return () => window.clearTimeout(timer);
  }, [builderEntryAnchors, builderEntryGraphKey, focusBuilderAnchor, selectedId]);
  // hydrated 전엔 서버 기본값(펼침)을 유지해 hydration mismatch 를 막는다.
  const paletteCollapsed = hydrated
    ? (paletteCollapsedPreference ?? builderGraphStats.persistedNodes > 0)
    : false;
  const togglePalette = useCallback(() => {
    const next = !paletteCollapsed;
    try {
      window.localStorage.setItem(BUILDER_PALETTE_COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // private mode
    }
    setPaletteCollapsedPreference(next);
  }, [paletteCollapsed]);
  const getExpectedMtime = useCallback(
    (slug: string) => docsBySlug.get(slug)?.mtime,
    [docsBySlug],
  );
  const showVaultWriteError = useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof VaultConflictError) {
        toast.show(t("toastVaultConflict"), "error");
        return;
      }
      const message = err instanceof Error ? err.message : fallback;
      toast.show(message, "error");
    },
    [t, toast],
  );
  const vaultSelected = useMemo(() => {
    if (!selectedId || ephemeralSelected) return null;
    const doc = docsBySlug.get(selectedId);
    if (!doc || typeof doc.frontmatter.kind !== "string") return null;
    const fm = doc.frontmatter as Record<string, unknown>;
    const asStrings = (v: unknown): string[] =>
      Array.isArray(v)
        ? v.filter((x): x is string => typeof x === "string")
        : [];
    const asString = (v: unknown): string =>
      typeof v === "string" ? v : "";
    return {
      slug: doc.slug,
      kind: String(doc.frontmatter.kind),
      title: doc.title || doc.slug,
      description: asString(fm.description),
      domain: asString(fm.domain),
      capabilities: asStrings(fm.capabilities),
      elements: asStrings(fm.elements),
      dependencies: readVaultRelationValues(fm, "dependencies"),
      relates: asStrings(fm.relates),
      domains: asStrings(fm.domains),
      contains: asStrings(fm.contains),
      describes: asStrings(fm.describes),
    };
  }, [selectedId, ephemeralSelected, docsBySlug]);
  const selectedProofTarget = useMemo(
    () => resolveBuilderProofTarget(vaultSelected ? docsBySlug.get(vaultSelected.slug) : null),
    [docsBySlug, vaultSelected],
  );
  const selectedProofNodeId = selectedProofTarget?.graphNodeId ?? null;
  const selectedProofSlug = selectedProofTarget?.vaultSlug ?? null;

  const queryNodeId = searchParams.get("node");
  const resolvedQueryNodeId = useMemo(
    () => resolveBuilderQueryNodeSlug(queryNodeId, effectiveManifest.docs),
    [effectiveManifest.docs, queryNodeId],
  );
  useEffect(() => {
    if (!resolvedQueryNodeId) return;
    if (selectedId === resolvedQueryNodeId) return;
    window.queueMicrotask(() => {
      setSelectedId(resolvedQueryNodeId);
      setFocusNodeId(resolvedQueryNodeId);
      setFocusToken((n) => n + 1);
      setDetailsOpen(true);
    });
  }, [resolvedQueryNodeId, selectedId]);

  // 선택된 vault 노드를 frontmatter array 로 가리키는 다른 노드 list.
  // ontology 탐색 핵심 — '이 노드를 누가 사용하나'. delete 시 backlinks
  // 도 같은 함수 사용 (BlastRadiusConfirm).
  const vaultBacklinks = useMemo(() => {
    if (!vaultSelected) return [];
    return findVaultBacklinks(effectiveManifest, vaultSelected.slug);
  }, [vaultSelected, effectiveManifest]);

  const pendingRelationPreflight = useMemo(
    () =>
      pendingRelation
        ? preflightVaultRelation(effectiveManifest, pendingRelation, pendingRelationKey)
        : null,
    [effectiveManifest, pendingRelation, pendingRelationKey],
  );
  const commandStripState = resolveBuilderCommandStripState({
    draftNodes: ephemeralNodes.length,
    draftEdges: ephemeralEdges.length,
    hasSelection: Boolean(ephemeralSelected || vaultSelected),
    hasPendingRelation: Boolean(pendingRelation),
    selectedKind: ephemeralSelected?.kind ?? vaultSelected?.kind ?? null,
    selectedEphemeral: Boolean(ephemeralSelected),
  });
  const commandStripSelectedTitle =
    ephemeralSelected?.title ?? vaultSelected?.title ?? pendingRelation?.sourceSlug ?? null;
  const commandStripSecondaryHref =
    isSelectedBuilderCommandState(commandStripState) && selectedProofTarget
      ? buildBuilderProofHref(selectedProofTarget)
      : undefined;
  const layoutSettingsActionLabel = resolveBuilderHeaderActionLabel({
    label: t("layoutSettingsButton"),
    hint: t("layoutSettingsAriaLabel"),
  });
  const writeSummaryActionLabel = resolveBuilderHeaderActionLabel({
    label: t("writeSummaryCollapsedLabel"),
    hint: t("writeSummaryCollapsedHint"),
  });
  const runCommandStripPrimary = useCallback(() => {
    switch (commandStripState) {
      case "empty": {
        const newId = addNode("capability");
        setSelectedId(newId);
        setDetailsOpen(true);
        return;
      }
      case "draft": {
        const targetId = selectedId && findById(selectedId) ? selectedId : ephemeralNodes[0]?.id;
        if (targetId) {
          setSelectedId(targetId);
          setDetailsOpen(true);
        } else {
          setWriteSummaryOpen(true);
        }
        return;
      }
      case "selectedProject": {
        const newId = addNode("domain");
        if (vaultSelected) addEphemeralEdgeByIds(vaultSelected.slug, newId);
        setSelectedId(newId);
        setDetailsOpen(true);
        return;
      }
      case "selectedDomain": {
        const newId = addNode("capability");
        if (vaultSelected) addEphemeralEdgeByIds(vaultSelected.slug, newId);
        setSelectedId(newId);
        setDetailsOpen(true);
        return;
      }
      case "selectedCapability": {
        const newId = addNode("element");
        if (vaultSelected) addEphemeralEdgeByIds(vaultSelected.slug, newId);
        setSelectedId(newId);
        setDetailsOpen(true);
        return;
      }
      case "selected":
        setDetailsOpen(true);
        return;
      case "relationReview":
        setWriteSummaryOpen(true);
        return;
    }
  }, [
    addEphemeralEdgeByIds,
    addNode,
    commandStripState,
    ephemeralNodes,
    findById,
    selectedId,
    vaultSelected,
  ]);
  const runCommandStripSecondary = useCallback(() => {
    setWriteSummaryOpen(true);
  }, []);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const renameVaultDoc = useCallback(
    async (slug: string, nextTitle: string) => {
      const trimmed = nextTitle.trim();
      if (!trimmed) {
        toast.show(t("toastTitleEmpty"), "error");
        return;
      }
      setRenamingId(slug);
      try {
        await vault.updateFrontmatter(
          slug,
          { title: trimmed },
          { expectedMtime: getExpectedMtime(slug) },
        );
        toast.show(t("toastTitleSaved", { title: trimmed }), "success");
      } catch (err) {
        showVaultWriteError(err, t("toastTitleSaveFailed"));
      } finally {
        setRenamingId(null);
      }
    },
    [getExpectedMtime, showVaultWriteError, t, toast, vault],
  );

  // vault graph array 키 편집. 빈 배열은 키 자체를 제거 (null) —
  // frontmatter 깨끗.
  const editVaultArrayKey = useCallback(
    async (
      slug: string,
      key: VaultArrayKey,
      next: string[],
    ) => {
      try {
        const patch =
          key === "dependencies"
            ? { dependencies: next.length === 0 ? null : next, depends_on: null }
            : { [key]: next.length === 0 ? null : next };
        await vault.updateFrontmatter(
          slug,
          patch,
          { expectedMtime: getExpectedMtime(slug) },
        );
      } catch (err) {
        showVaultWriteError(err, t("toastSaveFailed"));
      }
    },
    [getExpectedMtime, showVaultWriteError, t, vault],
  );

  const writeVaultRelation = useCallback(
    async (
      sourceSlug: string,
      targetSlug: string,
      key: VaultRelationKey,
    ): Promise<boolean> => {
      // dogfood vault (read-only) 에선 patch 불가 — 안내 토스트.
      if (!hasLiveVault) {
        toast.show(t(demoEdgeToastKey), "error");
        return false;
      }
      const sourceDoc = effectiveManifest.docs.find((d) => d.slug === sourceSlug);
      const relationPatch = buildVaultRelationPatch(
        (sourceDoc?.frontmatter ?? {}) as Record<string, unknown>,
        key,
        targetSlug,
      );
      // 자기 자신 또는 중복 reference 무시.
      if (sourceSlug === targetSlug || relationPatch.alreadyExists) {
        toast.show(t("toastVaultEdgeDuplicate"), "info");
        return true;
      }
      try {
        await vault.updateFrontmatter(
          sourceSlug,
          relationPatch.patch,
          { expectedMtime: getExpectedMtime(sourceSlug) },
        );
        toast.show(
          t("toastVaultEdgeAdded", { key, source: sourceSlug, target: targetSlug }),
          "success",
        );
        return true;
      } catch (err) {
        showVaultWriteError(err, t("toastSaveFailed"));
        return false;
      }
    },
    [demoEdgeToastKey, effectiveManifest, getExpectedMtime, hasLiveVault, showVaultWriteError, t, toast, vault],
  );

  // 캔버스에서 vault A 핸들 → vault B 드래그 시 호출. 바로 쓰지 않고
  // inferred relation key, 대안, frontmatter write scope 를 먼저 보여준다.
  const connectVaultEdge = useCallback(
    (
      sourceSlug: string,
      targetSlug: string,
      sourceKind: string,
      targetKind: string,
    ) => {
      if (!hasLiveVault) {
        toast.show(t(demoEdgeToastKey), "error");
        return;
      }
      if (sourceSlug === targetSlug) {
        toast.show(t("toastVaultEdgeDuplicate"), "info");
        return;
      }
      const inferredKey = inferVaultRelationKey(sourceKind, targetKind);
      const sourceDoc = docsBySlug.get(sourceSlug);
      if (
        readVaultRelationValues(
          (sourceDoc?.frontmatter ?? {}) as Record<string, unknown>,
          inferredKey,
        ).includes(targetSlug)
      ) {
        toast.show(t("toastVaultEdgeDuplicate"), "info");
        return;
      }
      setPendingRelation({
        sourceSlug,
        targetSlug,
        sourceKind,
        targetKind,
        inferredKey,
      });
      setPendingRelationKey(inferredKey);
      setLastSavedRelation(null);
    },
    [demoEdgeToastKey, docsBySlug, hasLiveVault, t, toast],
  );
  /**
   * Round 4 cut I — ephemeral edge "Save" 칩 클릭 orchestrator.
   *
   * 호출 흐름:
   *   1. edge id 로 useEphemeralEdges 에서 edge lookup
   *   2. source / target 각각 resolve:
   *      - ReactFlow node id 가 ephemeralNodes 에 있으면 ephemeral 노드:
   *        title 검증 → vault.createDoc 으로 vault 화 → vaultSlug 획득.
   *      - 그 외엔 vault 노드 (id == vault slug 직접) → docsBySlug 에서
   *        kind 추출.
   *   3. 두 endpoint 의 vault slug + kind 로 connectVaultEdge 호출 —
   *      source frontmatter array 에 target slug append.
   *   4. removeEphemeralEdge 로 in-memory ephemeral edge 정리.
   *
   * vault↔vault edge 는 이미 OntologyEditCanvas.handleConnect 가 자동
   * persist 하므로 여기로 들어오지 않는다 — 본 함수는 한쪽 이상이
   * ephemeral 인 edge 만 처리.
   *
   * 자동-persist 안 한 이유: ephemeral 노드 title 비었을 때 untitled.md
   * silent pollution 위험 (AGENTS.md self-approving 원칙 위반). 명시적
   * 사용자 클릭 + title 검증 (toastEdgePersistNeedsTitle).
   */
  const persistEphemeralEdge = useCallback(
    async (edgeId: string) => {
      const edge = ephemeralEdges.find((e) => e.id === edgeId);
      if (!edge) return;
      if (!hasLiveVault) {
        toast.show(t(demoEdgeToastKey), "error");
        return;
      }
      const resolveEndpoint = async (
        nodeId: string,
      ): Promise<{ slug: string; kind: string } | null> => {
        const ephem = findById(nodeId);
        if (ephem) {
          // placeholder ("(enter a name)") 통과 시 enter-a-name.md silent
          // 생성 → reject. Round 4 가 약속한 "no untitled.md pollution"
          // 를 chip 진입점에서도 보장.
          if (isUntitledTitle(ephem.title, t("untitledPlaceholder"))) {
            toast.show(t("toastEdgePersistNeedsTitle"), "error");
            return null;
          }
          const slug = slugify(ephem.title);
          if (!slug) {
            toast.show(t("toastEdgePersistNeedsTitle"), "error");
            return null;
          }
          const folder =
            ephem.kind === "capability"
              ? "capabilities"
              : ephem.kind === "element"
                ? "elements"
                : ephem.kind === "domain"
                  ? "domains"
                  : ephem.kind === "project"
                    ? "projects"
                    : `${ephem.kind}s`;
          const vaultSlug = `${folder}/${slug}`;
          try {
            const md = buildVaultMarkdown({
              kind: ephem.kind,
              title: ephem.title,
              slug: vaultSlug,
            });
            await vault.createDoc(vaultSlug, md);
            removeNode(nodeId);
            return { slug: vaultSlug, kind: ephem.kind };
          } catch (err) {
            const message =
              err instanceof Error ? err.message : t("toastSaveFailed");
            toast.show(message, "error");
            return null;
          }
        }
        // vault 노드 — 이미 영구화. id == vault slug.
        const doc = docsBySlug.get(nodeId);
        if (!doc || typeof doc.frontmatter.kind !== "string") return null;
        return { slug: doc.slug, kind: String(doc.frontmatter.kind) };
      };
      const sourceInfo = await resolveEndpoint(edge.source);
      if (!sourceInfo) return;
      const targetInfo = await resolveEndpoint(edge.target);
      if (!targetInfo) return;
      const savedRelation = buildSavedRelationHandoff({
        source: sourceInfo,
        target: targetInfo,
      });
      const relationWritten = await writeVaultRelation(
        savedRelation.sourceSlug,
        savedRelation.targetSlug,
        savedRelation.selectedKey,
      );
      if (relationWritten) {
        setLastSavedRelation(savedRelation);
        setSelectedId(savedRelation.targetSlug);
        setDetailsOpen(true);
        setWriteSummaryOpen(true);
        removeEphemeralEdge(edgeId);
      }
    },
    [
      demoEdgeToastKey,
      ephemeralEdges,
      hasLiveVault,
      toast,
      t,
      findById,
      vault,
      removeNode,
      docsBySlug,
      writeVaultRelation,
      removeEphemeralEdge,
    ],
  );

  // V1.2 vault-adaptation — frontmatter scalar literals (description / domain).
  // 빈 string 은 키 자체 제거 (null) — frontmatter 깨끗 유지. trim 후 빈 값이면
  // 명시적 삭제로 처리해 사용자가 의도적으로 비웠을 때 frontmatter 에 빈 문자열
  // 잔존 안 함.
  const editVaultLiteral = useCallback(
    async (slug: string, key: "description" | "domain", next: string) => {
      const trimmed = next.trim();
      try {
        await vault.updateFrontmatter(
          slug,
          {
            [key]: trimmed === "" ? null : trimmed,
          },
          { expectedMtime: getExpectedMtime(slug) },
        );
      } catch (err) {
        showVaultWriteError(err, t("toastSaveFailed"));
      }
    },
    [getExpectedMtime, showVaultWriteError, t, vault],
  );

  // vault 노드 drag 좌표를 frontmatter.canvasPosition 으로 patch.
  // 같은 사용자가 재방문 시 + AI agent (MCP) 가 같은 vault read 시 동일 좌표.
  // skipRefresh 로 manifest 재빌드 생략 — drag 직후 사용자 시각엔 캔버스 위치
  // 그대로라 깜빡임 없게. 다음 cold load 부터 canvasPosition 반영.
  const persistVaultPosition = useCallback(
    async (slug: string, position: { x: number; y: number }) => {
      try {
        await vault.updateFrontmatter(
          slug,
          { canvasPosition: { x: position.x, y: position.y } },
          { skipRefresh: true },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : t("toastPositionSaveFailed");
        toast.show(message, "error");
      }
    },
    [t, toast, vault],
  );

  // vault delete — BlastRadiusConfirm modal 로 backlinks 를 시각적으로
  // 보여주고 의식적인 confirm 을 받음. 데이터는 findVaultBacklinks 그대로
  // 사용하고 surface 만 native confirm() 에서 다이얼로그로 승격.
  const deleteVaultDoc = useCallback(
    (slug: string) => {
      if (!vault.manifest) return;
      const backlinks = findVaultBacklinks(vault.manifest, slug);
      const doc = vault.manifest.docs.find((d) => d.slug === slug);
      setPendingDelete({ slug, title: doc?.title, backlinks });
    },
    [vault],
  );

  const confirmPendingRelation = useCallback(async () => {
    if (!pendingRelation) return;
    const { sourceSlug, targetSlug } = pendingRelation;
    const key = pendingRelationKey;
    const relationWritten = await writeVaultRelation(sourceSlug, targetSlug, key);
    if (relationWritten) {
      setLastSavedRelation(
        buildSavedRelationHandoff({
          source: { slug: pendingRelation.sourceSlug, kind: pendingRelation.sourceKind },
          target: { slug: pendingRelation.targetSlug, kind: pendingRelation.targetKind },
          selectedKey: key,
        }),
      );
      setPendingRelation(null);
    }
  }, [pendingRelation, pendingRelationKey, writeVaultRelation]);

  // Modal 의 confirm 버튼이 눌린 후 실제 delete 수행.
  const confirmPendingDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const { slug } = pendingDelete;
    setPendingDelete(null);
    setRenamingId(slug);
    try {
      await vault.deleteDoc(slug);
      toast.show(t("toastDeleteSuccess", { slug }), "success");
      setSelectedId(null);
    } catch (err) {
      const m = err instanceof Error ? err.message : t("toastDeleteFailed");
      toast.show(m, "error");
    } finally {
      setRenamingId(null);
    }
  }, [pendingDelete, t, toast, vault]);

  const treeHref = "/ontology/";

  // Atlas 캔버스 단축키.
  // 스코프: input/textarea 포커스 시 비활성. 항상 ephemeral 만 영향.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTextEntryTarget = Boolean(
        target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable),
      );
      // 단축키 결정은 순수 함수로 분리 (단위 테스트 + repeat 가드).
      const action = resolveBuilderShortcut(
        {
          key: event.key,
          repeat: event.repeat,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          isTextEntryTarget,
        },
        {
          hasSelection: selectedId !== null,
          fullscreen,
          selectionRemovable: selectedId !== null && Boolean(findById(selectedId)),
        },
      );
      if (!action) return;
      event.preventDefault();
      switch (action.type) {
        case "deselect":
          setSelectedId(null);
          setDetailsOpen(false);
          break;
        case "exitFullscreen":
          setFullscreen(false);
          break;
        case "toggleFullscreen":
          setFullscreen((current) => !current);
          break;
        case "addNode":
          setSelectedId(addNode(action.kind));
          setDetailsOpen(true);
          break;
        case "removeSelected":
          if (selectedId) {
            removeNode(selectedId);
            setSelectedId(null);
            setDetailsOpen(false);
          }
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId, addNode, removeNode, findById, fullscreen]);

  const helpTooltip = (
    <div className="max-w-xs space-y-2 text-[12px] leading-5">
      <p>{t("helpIntro")}</p>
      <ul className="space-y-1 pl-3 text-[color:var(--color-text-tertiary)]">
        <li>· {t("helpStepPalette")}</li>
        <li>· {t("helpStepConnect")}</li>
        <li>· {t("helpStepEphemeral")}</li>
      </ul>
      <p className="font-mono text-[10px] tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
        {t("helpShortcuts")}
      </p>
    </div>
  );

  return (
    <div className="min-h-dvh bg-[color:var(--color-canvas)] text-[color:var(--color-text-primary)]">
      {/* OperationsNav 가 ontology surface (/, /ontology*) 에선 SubNav 행을
          inline 으로 함께 렌더 — 한 nav block 으로 융합. */}
      {fullscreen ? null : <OperationsNav />}
      {/* ⇧⌘K — 큰 ontology 에서 노드 빠른 점프. 선택 시 인스펙터에서 즉시
          편집 가능. fullscreen 모드에선 hotkey 도 작동 (캔버스에 mount). */}
      <MountedGlobalSearch
        hotkeyShift
        onSelectNode={(node) => {
          openNodeDetails(node.id);
        }}
      />
      <main
        id="main"
        className={
          fullscreen
            ? "flex h-dvh w-full flex-col px-2 py-2"
            : "mx-auto flex h-[calc(100dvh-5.75rem)] w-full max-w-[1800px] flex-col px-3 py-3 md:px-5 md:py-4"
        }
      >
        <header className="mb-1 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-2 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="sr-only">{t("title")}</h1>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
              {t("statusSummary", {
                nodes: ephemeralNodes.length,
                edges: ephemeralEdges.length,
              })}
            </span>
            <Tooltip content={helpTooltip} withProvider={false}>
              <span
                role="img"
                aria-label={t("helpAriaLabel")}
                className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-md text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-indigo-accent)]"
              >
                <Info size={13} />
              </span>
            </Tooltip>
          </div>
          <BuilderCommandStrip
            state={commandStripState}
            draftNodes={ephemeralNodes.length}
            draftEdges={ephemeralEdges.length}
            selectedTitle={commandStripSelectedTitle}
            onPrimaryAction={runCommandStripPrimary}
            onSecondaryAction={runCommandStripSecondary}
            secondaryHref={commandStripSecondaryHref}
          />
          <div className="relative flex flex-wrap items-center justify-end gap-1.5">
            {ephemeralNodes.length > 0 || ephemeralEdges.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    downloadAtlasFrontmatter({
                      ephemeralNodes,
                      ephemeralEdges,
                    })
                  }
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.10)] px-2.5 text-[11px] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:bg-[color:rgba(94,106,210,0.16)]"
                  aria-label={t("exportAriaLabel")}
                >
                  <Download size={12} />
                  <span className="hidden lg:inline">{t("exportButton")}</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadJsonLd({
                      ephemeralNodes,
                      ephemeralEdges,
                    })
                  }
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-2.5 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.32)] hover:text-[color:var(--color-text-primary)]"
                  aria-label={t("exportJsonLdAriaLabel")}
                >
                  <FileJson size={12} />
                  <span className="hidden xl:inline">{t("exportJsonLdButton")}</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadGraphML({
                      ephemeralNodes,
                      ephemeralEdges,
                    })
                  }
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-2.5 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.32)] hover:text-[color:var(--color-text-primary)]"
                  aria-label={t("exportGraphMlAriaLabel")}
                >
                  <Network size={12} />
                  <span className="hidden xl:inline">{t("exportGraphMlButton")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (clearConfirming) {
                      clearAll();
                      clearEphemeralEdges();
                      setClearConfirming(false);
                    } else {
                      setClearConfirming(true);
                    }
                  }}
                  className={
                    clearConfirming
                      ? "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[color:rgba(229,72,77,0.55)] bg-[color:rgba(229,72,77,0.18)] px-2.5 text-[11px] text-[color:rgba(236,116,116,0.95)] transition-colors hover:bg-[color:rgba(229,72,77,0.28)]"
                      : "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-2.5 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(229,72,77,0.32)] hover:text-[color:var(--color-text-primary)]"
                  }
                  aria-label={t("clearAriaLabel", {
                    nodes: ephemeralNodes.length,
                    edges: ephemeralEdges.length,
                  })}
                >
                  <Trash2 size={12} />
                  {clearConfirming
                    ? t("clearButtonConfirm", {
                        nodes: ephemeralNodes.length,
                        edges: ephemeralEdges.length,
                      })
                    : t("clearButton", {
                        nodes: ephemeralNodes.length,
                        edges: ephemeralEdges.length,
                      })}
                </button>
              </>
            ) : null}
            <button
              type="button"
              aria-expanded={layoutSettingsOpen}
              aria-controls="builder-layout-settings"
              onClick={() => setLayoutSettingsOpen((open) => !open)}
              aria-label={layoutSettingsActionLabel.ariaLabel}
              title={layoutSettingsActionLabel.title}
              className={
                layoutSettingsOpen
                  ? "hidden h-8 shrink-0 items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.38)] bg-[color:rgba(94,106,210,0.14)] px-2.5 text-[11px] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.52)] md:inline-flex"
                  : "hidden h-8 shrink-0 items-center gap-1.5 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-2.5 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)] md:inline-flex"
              }
            >
              <SlidersHorizontal size={12} />
              <span className="font-[var(--font-weight-signature)]">
                {t("layoutSettingsButton")}
              </span>
            </button>
            {(ephemeralSelected || vaultSelected) && commandStripState !== "selected" ? (
              <button
                type="button"
                onClick={() => setDetailsOpen(true)}
                aria-label={t("openDetailsAriaLabel", {
                  title: ephemeralSelected?.title ?? vaultSelected?.title ?? "",
                })}
                className="hidden h-8 shrink-0 items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.10)] px-2.5 text-[11px] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:bg-[color:rgba(94,106,210,0.16)] md:inline-flex"
              >
                <Info size={12} />
                {t("openDetailsButton")}
              </button>
            ) : null}
            <button
              type="button"
              aria-expanded={writeSummaryOpen}
              aria-controls="builder-write-summary"
              onClick={() => setWriteSummaryOpen((open) => !open)}
              aria-label={writeSummaryActionLabel.ariaLabel}
              title={writeSummaryActionLabel.title}
              className={
                writeSummaryOpen
                  ? "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[color:rgba(94,106,210,0.38)] bg-[color:rgba(94,106,210,0.14)] px-2.5 text-[11px] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.52)]"
                  : "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-2.5 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
              }
            >
              <ShieldCheck size={12} />
              <span className="font-[var(--font-weight-signature)]">
                {t("writeSummaryCollapsedLabel")}
              </span>
            </button>
            {/* 헤더 '트리로 보기 ↗' link 는 OntologySubNav 의 [트리] 탭과
                중복이라 제거. 모바일 fallback CTA 는 별도 — SubNav 가 mount
                안 되는 풀폭 안내 화면에서만 노출. */}
            <button
              type="button"
              onClick={() => setFullscreen((current) => !current)}
              aria-label={fullscreen ? t("fullscreenExit") : t("fullscreenEnter")}
              title={fullscreen ? t("fullscreenExit") : t("fullscreenEnter")}
              className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] md:inline-flex"
            >
              {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            {writeSummaryOpen ? (
              <div
                id="builder-write-summary"
                className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-[min(980px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] shadow-[0_24px_72px_rgba(0,0,0,0.42)]"
              >
                <BuilderWriteSummary
                  writable={hasLiveVault}
                  restoringVault={restoringVault}
                  vaultUnavailable={vaultUnavailable}
                  isDesktopRuntime={isDesktopRuntime}
                  persistedNodes={builderGraphStats.persistedNodes}
                  persistedRelations={builderGraphStats.persistedRelations}
                  draftNodes={ephemeralNodes.length}
                  draftEdges={ephemeralEdges.length}
                  draftPreviews={draftPreviews}
                  selectedProofNodeId={selectedProofNodeId}
                  selectedProofSlug={selectedProofSlug}
                  pendingRelation={pendingRelation}
                  onOpenDraft={() => {
                    const targetId =
                      selectedId && findById(selectedId)
                        ? selectedId
                        : ephemeralNodes[0]?.id;
                    if (!targetId) return;
                    setSelectedId(targetId);
                    setWriteSummaryOpen(false);
                    setDetailsOpen(true);
                  }}
                />
              </div>
            ) : null}
            {layoutSettingsOpen ? (
              <div
                id="builder-layout-settings"
                aria-label={t("layoutGroupAriaLabel")}
                className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-72 overflow-hidden rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-1.5 shadow-[0_24px_72px_rgba(0,0,0,0.42)]"
              >
                <div role="radiogroup" aria-label={t("layoutModeAriaLabel")}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={layoutMode === "dagre"}
                    onClick={() => {
                      setLayoutMode("dagre");
                      setLayoutSettingsOpen(false);
                    }}
                    className={`flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors ${
                      layoutMode === "dagre"
                        ? "bg-[color:rgba(94,106,210,0.16)] text-[color:var(--color-text-primary)]"
                        : "text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
                    }`}
                  >
                    <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[color:rgba(159,170,235,0.9)] opacity-80" />
                    <span>
                      <span className="block text-[11px] font-[var(--font-weight-signature)]">
                        {t("layoutDagre")}
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-4 text-[color:var(--color-text-quaternary)]">
                        {t("layoutDagreTitle")}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={layoutMode === "force"}
                    onClick={() => {
                      setLayoutMode("force");
                      setLayoutSettingsOpen(false);
                    }}
                    className={`mt-1 flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors ${
                      layoutMode === "force"
                        ? "bg-[color:rgba(94,106,210,0.16)] text-[color:var(--color-text-primary)]"
                        : "text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
                    }`}
                  >
                    <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[color:rgba(159,170,235,0.9)] opacity-80" />
                    <span>
                      <span className="block text-[11px] font-[var(--font-weight-signature)]">
                        {t("layoutForce")}
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-4 text-[color:var(--color-text-quaternary)]">
                        {t("layoutForceTitle")}
                      </span>
                    </span>
                  </button>
                </div>
                <div className="mt-1 border-t border-[color:var(--color-border-soft)] pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setAutoLayoutToken((n) => n + 1);
                      setLayoutSettingsOpen(false);
                    }}
                    aria-label={t("autoLayoutAriaLabel")}
                    className="flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left text-[color:var(--color-text-secondary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
                  >
                    <Wand2 size={12} className="mt-0.5 shrink-0 text-[color:var(--color-indigo-accent)]" />
                    <span>
                      <span className="block text-[11px] font-[var(--font-weight-signature)]">
                        {t("autoLayoutButton")}
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-4 text-[color:var(--color-text-quaternary)]">
                        {t("autoLayoutDescription")}
                      </span>
                    </span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </header>
        {/* 빌더는 palette (200) + canvas + inspector (280) = 480px+ 의 ERD
            레이아웃 — 모바일 (<md, 768px 미만) viewport 에서는 컬럼이 겹쳐
            unreadable. 데스크톱 권장 안내 + 트리 / 토폴로지 fallback CTA 를
            모바일에만 노출. md+ 에서는 정상 빌더. */}
        <section className="relative hidden flex-1 overflow-hidden rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] md:flex">
          <OntologyKindPalette
            collapsed={paletteCollapsed}
            onToggleCollapsed={togglePalette}
            onAddNode={(kind) => {
              const newId = addNode(kind);
              // 추가 직후 상세 sheet 가 바로 열리도록 self-select.
              setSelectedId(newId);
              setDetailsOpen(true);
            }}
          />
          <div className="relative flex-1">
            <BuilderCanvasEntryRail
              anchors={builderEntryAnchors}
              nodeCount={builderGraphStats.persistedNodes}
              relationCount={builderGraphStats.persistedRelations}
              selectedAnchorId={vaultSelected?.slug ?? null}
              expanded={anchorRailOpen}
              onToggleExpanded={() => setAnchorRailOpen((open) => !open)}
              onFocusAnchor={focusBuilderAnchor}
              onOpenAnchors={() => setAnchorsOpen(true)}
            />
            <OntologyEditCanvas
              vaultManifest={vault.manifest ?? null}
              ephemeralNodes={ephemeralNodes}
              ephemeralEdges={ephemeralEdges}
              onSelectionChange={handleCanvasSelectionChange}
              onConnect={addEphemeralEdge}
              onVaultConnect={connectVaultEdge}
              onPersistEphemeralEdge={persistEphemeralEdge}
              onRemoveEphemeralEdge={removeEphemeralEdge}
              onVaultNodeDragStop={persistVaultPosition}
              autoLayoutToken={autoLayoutToken}
              layoutMode={layoutMode}
              focusNodeId={focusNodeId}
              focusToken={focusToken}
              selectedId={selectedId}
              onNodeOpen={openNodeDetails}
            />
            <BuilderOnboarding
              empty={
                builderGraphStats.persistedNodes === 0 &&
                ephemeralNodes.length === 0 &&
                ephemeralEdges.length === 0
              }
              isDesktopRuntime={isDesktopRuntime}
            />
            {pendingRelation && pendingRelationPreflight ? (
              <RelationWriteConfirm
                proposal={pendingRelation}
                selectedKey={pendingRelationKey}
                preflight={pendingRelationPreflight}
                onSelectKey={setPendingRelationKey}
                onCancel={() => setPendingRelation(null)}
                onConfirm={() => void confirmPendingRelation()}
                labels={{
                  title: t("relationConfirm.title"),
                  body: t("relationConfirm.body", {
                    sourceKind: pendingRelation.sourceKind,
                    targetKind: pendingRelation.targetKind,
                    inferredKey: pendingRelation.inferredKey,
                  }),
                  inferred: t("relationConfirm.inferred"),
                  inferredKey: t("relationConfirm.inferredKey"),
                  inferenceReason: t("relationConfirm.inferenceReason"),
                  alternatives: t("relationConfirm.alternatives"),
                  writeScope: t("relationConfirm.writeScope"),
                  writeFile: t("relationConfirm.writeFile"),
                  writeChangedFiles: t("relationConfirm.writeChangedFiles"),
                  writeUnchangedFiles: t("relationConfirm.writeUnchangedFiles"),
                  writeBoundary: t("relationConfirm.writeBoundary"),
                  writeBoundaryValue: t("relationConfirm.writeBoundaryValue"),
                  writeKey: t("relationConfirm.writeKey"),
                  writeMeaning: t("relationConfirm.writeMeaning"),
                  writeMutation: t("relationConfirm.writeMutation"),
                  writeFrontmatterPatch: t("relationConfirm.writeFrontmatterPatch"),
                  mcpWriteArgs: t("relationConfirm.mcpWriteArgs"),
                  mcpWritePolicy: t("relationConfirm.mcpWritePolicy"),
                  mcpWritePolicyReady: t("relationConfirm.mcpWritePolicyReady"),
                  mcpWritePolicyBlocked: t(
                    "relationConfirm.mcpWritePolicyBlocked",
                  ),
                  graphEffect: t("relationConfirm.graphEffect"),
                  graphEdge: t("relationConfirm.graphEdge"),
                  graphRelation: t("relationConfirm.graphRelation"),
                  graphSurfaces: t("relationConfirm.graphSurfaces"),
                  graphSurfacesValue: t("relationConfirm.graphSurfacesValue"),
                  graphAlternativeWarning: t("relationConfirm.graphAlternativeWarning"),
                  endpointReview: t("relationConfirm.endpointReview"),
                  endpointReviewBody: t("relationConfirm.endpointReviewBody"),
                  sourceOntology: t("relationConfirm.sourceOntology"),
                  targetOntology: t("relationConfirm.targetOntology"),
                  sourceBuilder: t("relationConfirm.sourceBuilder"),
                  targetBuilder: t("relationConfirm.targetBuilder"),
                  postSaveGraphHandoff: t(
                    "relationConfirm.postSaveGraphHandoff",
                  ),
                  postSaveGraphHandoffBody: t(
                    "relationConfirm.postSaveGraphHandoffBody",
                  ),
                  postSavePathHandoff: t(
                    "relationConfirm.postSavePathHandoff",
                  ),
                  postSaveSourceFocus: t("relationConfirm.postSaveSourceFocus"),
                  postSaveTargetFocus: t("relationConfirm.postSaveTargetFocus"),
                  postSaveQueryCockpit: t(
                    "relationConfirm.postSaveQueryCockpit",
                  ),
                  saveChecklist: t("relationConfirm.saveChecklist"),
                  saveChecklistSelectedKey: t(
                    "relationConfirm.saveChecklistSelectedKey",
                  ),
                  saveChecklistPreflight: t(
                    "relationConfirm.saveChecklistPreflight",
                  ),
                  saveChecklistTraversal: t(
                    "relationConfirm.saveChecklistTraversal",
                  ),
                  saveChecklistSyncGate: t(
                    "relationConfirm.saveChecklistSyncGate",
                  ),
                  saveChecklistReady: t("relationConfirm.saveChecklistReady"),
                  saveChecklistReview: t("relationConfirm.saveChecklistReview"),
                  saveChecklistBlocked: t("relationConfirm.saveChecklistBlocked"),
                  saveChecklistSyncRequired: t(
                    "relationConfirm.saveChecklistSyncRequired",
                  ),
                  agentDecisionLens: t("relationConfirm.agentDecisionLens"),
                  agentDecisionLensContextTitle: t(
                    "relationConfirm.agentDecisionLensContextTitle",
                  ),
                  agentDecisionLensContextBody: t(
                    "relationConfirm.agentDecisionLensContextBody",
                  ),
                  agentDecisionLensToolsTitle: t(
                    "relationConfirm.agentDecisionLensToolsTitle",
                  ),
                  agentDecisionLensToolsBody: t(
                    "relationConfirm.agentDecisionLensToolsBody",
                  ),
                  agentDecisionLensEvidenceTitle: t(
                    "relationConfirm.agentDecisionLensEvidenceTitle",
                  ),
                  agentDecisionLensEvidenceBody: t(
                    "relationConfirm.agentDecisionLensEvidenceBody",
                  ),
                  agentDecisionLensDriftTitle: t(
                    "relationConfirm.agentDecisionLensDriftTitle",
                  ),
                  agentDecisionLensDriftBody: t(
                    "relationConfirm.agentDecisionLensDriftBody",
                  ),
                  agentDecisionLensWorkflowTitle: t(
                    "relationConfirm.agentDecisionLensWorkflowTitle",
                  ),
                  agentDecisionLensWorkflowBody: t(
                    "relationConfirm.agentDecisionLensWorkflowBody",
                  ),
                  preflight: t("relationConfirm.preflight"),
                  preflightEvidence: t("relationConfirm.preflightEvidence"),
                  preflightExact: t("relationConfirm.preflightExact"),
                  preflightInverse: t("relationConfirm.preflightInverse"),
                  preflightPath: t("relationConfirm.preflightPath"),
                  preflightClear: t("relationConfirm.preflightClear"),
                  preflightPresent: t("relationConfirm.preflightPresent"),
                  preflightActionSafe: t("relationConfirm.preflightActionSafe"),
                  preflightActionReview: t(
                    "relationConfirm.preflightActionReview",
                  ),
                  preflightActionBlocked: t(
                    "relationConfirm.preflightActionBlocked",
                  ),
                  traversalCheck: t("relationConfirm.traversalCheck"),
                  traversalCheckBody: t("relationConfirm.traversalCheckBody"),
                  traversalContract: t("relationConfirm.traversalContract"),
                  traversalContractBody: t("relationConfirm.traversalContractBody"),
                  agentCheck: t("relationConfirm.agentCheck"),
                  postSaveCheck: t("relationConfirm.postSaveCheck"),
                  path: t("relationConfirm.path"),
                  copyCliPreflight: t("relationConfirm.copyCliPreflight"),
                  copyCliPreflightCopied: t(
                    "relationConfirm.copyCliPreflightCopied",
                  ),
                  copyCliPreflightFailed: t(
                    "relationConfirm.copyCliPreflightFailed",
                  ),
                  copyMcpPreflight: t("relationConfirm.copyMcpPreflight"),
                  copyMcpPreflightCopied: t(
                    "relationConfirm.copyMcpPreflightCopied",
                  ),
                  copyMcpPreflightFailed: t(
                    "relationConfirm.copyMcpPreflightFailed",
                  ),
                  copyPostSaveSyncGate: t("relationConfirm.copyPostSaveSyncGate"),
                  copyPostSaveSyncGateCopied: t(
                    "relationConfirm.copyPostSaveSyncGateCopied",
                  ),
                  copyPostSaveSyncGateFailed: t(
                    "relationConfirm.copyPostSaveSyncGateFailed",
                  ),
                  copyMcpWrite: t("relationConfirm.copyMcpWrite"),
                  copyMcpWriteCopied: t("relationConfirm.copyMcpWriteCopied"),
                  copyMcpWriteFailed: t("relationConfirm.copyMcpWriteFailed"),
                  cancel: t("relationConfirm.cancel"),
                  confirm: t("relationConfirm.confirm"),
                  copyPacket: t("relationConfirm.copyPacket"),
                  copyPacketCopied: t("relationConfirm.copyPacketCopied"),
                  copyPacketFailed: t("relationConfirm.copyPacketFailed"),
                  closeAriaLabel: t("relationConfirm.closeAriaLabel"),
                  decisionLabels: {
                    safe_to_add: t("relationConfirm.decisions.safeToAdd.label"),
                    skip_existing: t("relationConfirm.decisions.skipExisting.label"),
                    review_inverse: t("relationConfirm.decisions.reviewInverse.label"),
                    review_path: t("relationConfirm.decisions.reviewPath.label"),
                  },
                  decisionHints: {
                    safe_to_add: t("relationConfirm.decisions.safeToAdd.hint"),
                    skip_existing: t("relationConfirm.decisions.skipExisting.hint"),
                    review_inverse: t("relationConfirm.decisions.reviewInverse.hint"),
                    review_path: t("relationConfirm.decisions.reviewPath.hint"),
                  },
                  relationKeyLabels: {
                    domains: t("relationConfirm.keys.domains.label"),
                    capabilities: t("relationConfirm.keys.capabilities.label"),
                    elements: t("relationConfirm.keys.elements.label"),
                    dependencies: t("relationConfirm.keys.dependencies.label"),
                    contains: t("relationConfirm.keys.contains.label"),
                    describes: t("relationConfirm.keys.describes.label"),
                    relates: t("relationConfirm.keys.relates.label"),
                  },
                  relationKeyHints: {
                    domains: t("relationConfirm.keys.domains.hint"),
                    capabilities: t("relationConfirm.keys.capabilities.hint"),
                    elements: t("relationConfirm.keys.elements.hint"),
                    dependencies: t("relationConfirm.keys.dependencies.hint"),
                    contains: t("relationConfirm.keys.contains.hint"),
                    describes: t("relationConfirm.keys.describes.hint"),
                    relates: t("relationConfirm.keys.relates.hint"),
                  },
                }}
              />
            ) : null}
            {!pendingRelation && lastSavedRelation ? (
              <RelationPostSaveHandoff
                relation={lastSavedRelation}
                onDismiss={() => setLastSavedRelation(null)}
                labels={{
                  title: t("relationPostSave.title"),
                  body: t("relationPostSave.body"),
                  relationLabel: t("relationPostSave.relationLabel"),
                  openPath: t("relationPostSave.openPath"),
                  sourceFocus: t("relationPostSave.sourceFocus"),
                  targetFocus: t("relationPostSave.targetFocus"),
                  queryCockpit: t("relationPostSave.queryCockpit"),
                  queryCockpitAriaLabel: t(
                    "relationPostSave.queryCockpitAriaLabel",
                    { target: lastSavedRelation.targetSlug },
                  ),
                  copyProofPacket: t("relationPostSave.copyProofPacket"),
                  copyProofPacketCopied: t(
                    "relationPostSave.copyProofPacketCopied",
                  ),
                  copyProofPacketFailed: t(
                    "relationPostSave.copyProofPacketFailed",
                  ),
                  copySyncGate: t("relationPostSave.copySyncGate"),
                  copySyncGateCopied: t("relationPostSave.copySyncGateCopied"),
                  copySyncGateFailed: t("relationPostSave.copySyncGateFailed"),
                  closeAriaLabel: t("relationPostSave.closeAriaLabel"),
                }}
              />
            ) : null}
          </div>
        </section>
        {detailsOpen && (ephemeralSelected || vaultSelected) ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("detailsSheetAriaLabel")}
            className={
              ephemeralSelected
                ? "fixed inset-0 z-50 flex items-center justify-center bg-[color:rgba(0,0,0,0.56)] px-4 py-6"
                : "fixed inset-0 z-50 hidden items-center justify-center bg-[color:rgba(0,0,0,0.56)] px-4 py-6 md:flex"
            }
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setDetailsOpen(false);
            }}
          >
            <div className="w-full max-w-[720px] overflow-hidden rounded-xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] shadow-[0_24px_80px_rgba(0,0,0,0.46)]">
              <header className="flex items-center justify-between gap-3 border-b border-[color:var(--color-border-soft)] px-4 py-3">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
                    {t("detailsSheetEyebrow")}
                  </p>
                  <h2 className="mt-0.5 truncate text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                    {ephemeralSelected?.title ?? vaultSelected?.title ?? t("detailsSheetTitleFallback")}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailsOpen(false)}
                  aria-label={t("detailsSheetClose")}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
                >
                  ×
                </button>
              </header>
              {ephemeralSelected ? (
                <BuilderDetailsDraftCallout
                  draftNodes={ephemeralNodes.length}
                  draftEdges={ephemeralEdges.length}
                  onOpenWriteSummary={() => {
                    setDetailsOpen(false);
                    setWriteSummaryOpen(true);
                  }}
                />
              ) : null}
              <OntologyInspector
                ephemeralSelected={ephemeralSelected}
                vaultSelected={vaultSelected}
                vaultBacklinks={vaultBacklinks}
                onSelectBacklink={openNodeDetails}
                vaultReadOnly={!hasLiveVault}
                isDesktopRuntime={isDesktopRuntime}
                untitledPlaceholder={t('untitledPlaceholder')}
                onRenameEphemeral={(id, title) => updateNode(id, { title })}
                onSaveEphemeral={saveEphemeral}
                isEphemeralSaveConflict={hasDraftPathConflict}
                getEphemeralSaveSuggestion={getDraftPathSuggestion}
                onSaveVaultRename={renameVaultDoc}
                onEditVaultArrayKey={editVaultArrayKey}
                onEditVaultLiteral={editVaultLiteral}
                onDeleteVault={deleteVaultDoc}
                saving={savingId !== null || renamingId !== null}
                onClearSelection={() => {
                  setSelectedId(null);
                  setDetailsOpen(false);
                }}
                surface="sheet"
              />
            </div>
          </div>
        ) : null}
        {anchorsOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("anchorDialogAriaLabel")}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[color:rgba(0,0,0,0.54)] px-4 py-6"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setAnchorsOpen(false);
            }}
          >
            <div className="w-full max-w-[680px] overflow-hidden rounded-xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] shadow-[0_24px_80px_rgba(0,0,0,0.46)]">
              <header className="flex items-start justify-between gap-3 border-b border-[color:var(--color-border-soft)] px-4 py-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
                    {t("anchorDialogEyebrow")}
                  </p>
                  <h2 className="mt-0.5 text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                    {t("anchorDialogTitle")}
                  </h2>
                  <p className="mt-1 text-[11px] leading-4 text-[color:var(--color-text-tertiary)]">
                    {t("anchorDialogBody")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAnchorsOpen(false)}
                  aria-label={t("anchorDialogClose")}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
                >
                  ×
                </button>
              </header>
              <div className="grid max-h-[min(70dvh,640px)] gap-2 overflow-y-auto p-4 sm:grid-cols-2">
                {builderEntryAnchors.map((anchor) => {
                  const anchorKindLabel = isOntologyKind(anchor.kind)
                    ? tKinds(anchor.kind)
                    : anchor.kind;
                  return (
                    <button
                      key={anchor.id}
                      type="button"
                      onClick={() => {
                        focusBuilderAnchor(anchor.id);
                        setAnchorsOpen(false);
                      }}
                      className={
                        selectedId === anchor.id
                          ? "rounded-lg border border-[color:rgba(139,151,255,0.42)] bg-[color:rgba(139,151,255,0.13)] px-3 py-2 text-left"
                          : "rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-left transition-colors hover:border-[color:rgba(94,106,210,0.36)]"
                      }
                    >
                      <span className="block truncate text-[12px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                        {anchor.label}
                      </span>
                      <span className="mt-1 block truncate font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
                        {anchorKindLabel} · {anchor.id}
                      </span>
                      <span className="mt-2 inline-flex rounded border border-[color:var(--color-border-soft)] px-1.5 py-0.5 font-mono text-[9px] text-[color:var(--color-text-tertiary)]">
                        {formatBuilderAnchorDegreeBadge(
                          t("canvasEntryRail.degreeBadge"),
                          anchor.degree,
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
        {/* 모바일 fallback — md 미만에서 빌더 layout 이 겹치므로 데스크톱
            안내 + 트리 / 토폴로지 진입점 노출. */}
        <section className="flex flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] px-6 py-10 text-center md:hidden">
          <div className="flex flex-col gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-indigo-accent)]">
              {t("mobileEyebrow")}
            </p>
            <h2 className="text-base font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
              {t("mobileTitle")}
            </h2>
            <p className="max-w-xs break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
              {t("mobileBody")}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link
              href={treeHref}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.14)] px-3 text-[12px] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.66)]"
            >
              {t("mobileTreeCta")}
            </Link>
            <Link
              href="/topology/"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 text-[12px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
            >
              {t("mobileTopologyCta")}
            </Link>
            <Link
              href="/ontology/insights/"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[color:rgba(73,190,146,0.28)] bg-[color:rgba(73,190,146,0.08)] px-3 text-[12px] text-[color:rgba(190,245,222,0.92)] transition-colors hover:border-[color:rgba(73,190,146,0.44)] hover:text-[color:var(--color-text-primary)]"
            >
              <ShieldCheck size={13} aria-hidden />
              {t("mobileValidateCta")}
            </Link>
          </div>
        </section>
      </main>
      <BlastRadiusConfirm
        open={pendingDelete !== null}
        slug={pendingDelete?.slug ?? ""}
        title={pendingDelete?.title}
        backlinks={pendingDelete?.backlinks ?? []}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void confirmPendingDelete()}
      />
    </div>
  );
}
