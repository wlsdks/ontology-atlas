"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Clipboard, Link2, TriangleAlert } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { Link } from "@/i18n/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/shared/lib/cn";
import { MARKDOWN_PROSE_CLASS } from "@/shared/ui/tokens/markdown-prose";
import {
  buildOntologyNodeHref,
  buildTopologyMeaningEditorNodeHref,
} from "@/entities/knowledge-graph";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import { useCopyFeedback } from "@/shared/lib/clipboard/use-copy-feedback";
import { truncateMiddlePath } from "@/shared/lib/concept-display/truncate-middle-path";
import { stripDuplicateHeading } from "@/shared/lib/vault-document/strip-duplicate-heading";
import {
  formatProjectSourceHandoff,
  type ProjectSourceView,
} from "@/shared/lib/project-source/project-source-receipt";
import { CloseButton, controlClass, LastEditSubjectRow, useToast } from "@/shared/ui";
import {
  NodeExplanationEdit,
  type NodeExplanationEditLabels,
} from "@/shared/ui/ontology-node/node-explanation-edit";
import { OntologyMapKindGlyph } from "@/shared/ui/ontology-node/map-kind-glyph";
import { morphName, morphTargetProps } from "@/shared/motion/shared-element";
import { formatFullDetailHandoffChain } from "../lib/full-detail-handoff";
import type { FullDetailGroups } from "../lib/full-detail-groups";
import type { FullDetailReachDepth, FullDetailReachModel } from "../lib/full-detail-reach";
import { FullDetailA1GroupsPanel } from "./full-detail-a1-groups-panel";
import { FullDetailA1ReachPanel } from "./full-detail-a1-reach-panel";

/**
 * The full-detail sheet, core first: a fixed header (kind, title, slug, freshness), then a
 * scrolling column of body, relations, reach, agent prompt, code locations and project source.
 * The host owns the frame; groups and reach come from `buildFullDetailGroups` and
 * `buildFullDetailReachModel` so numbers cannot drift from the map.
 */

export interface FullDetailA1Node {
  id: string;
  title: string;
  /** The full original vault title — preserved as secondary text under the heading only
   *  when it differs from `title` (layering, not hiding). Identical, it is not rendered. */
  fullTitle?: string;
  kind: string;
  ownerTitle?: string | null;
  slug: string;
  /**
   * The name handed to an agent: the vault-relative slug, or the raw reference text for a concept
   * without a document (`resolveNodeAgentTarget`). Falls back to `slug`.
   */
  agentSlug?: string | null;
  documented?: boolean;
  fresh: boolean;
  /**
   * The datasheet's freshness sentence; when present it replaces the binary label so freshness has
   * one source (mtime).
   */
  updatedAtLabel?: string | null;
  /**
   * Last-edit provenance resolved by the caller from real data (`resolveNodeLastEditSubject`); null
   * hides the row.
   */
  lastEditSubject?: { kind: "agent" | "human"; ageLabel: string } | null;
  mtimeConflict?: boolean;
}

export interface FullDetailA1ProjectSourceLabels {
  heading: string;
  sourceKind?: string;
  status: string;
  measuredAt: string;
  currentness: string;
  gap: string;
  action: string;
  busy: string;
}

export interface FullDetailA1Props {
  node: FullDetailA1Node;
  groups: FullDetailGroups;
  reach: FullDetailReachModel;
  titleId?: string;
  /** The node's own markdown body, never dropped (design gate). `null` renders the empty-body message. */
  bodyMarkdown: string | null;
  /** Makes the body editable in place when the vault is writable; null keeps it read-only. */
  explanationEdit?: {
    onSave: (next: string) => void | Promise<void>;
  } | null;
  onSelectNode: (id: string) => void;
  onClose: () => void;
  documentHref?: string | null;
  /**
   * Another document that records this node when it has none of its own, relabelled to name its
   * destination.
   */
  mentionDocumentHref?: string | null;
  /**
   * The node's real code evidence (`deriveCodeLocations`); empty hides the section, never
   * fabricated.
   */
  codeLocations?: readonly string[];
  /** Same public, versioned receipt the compact project inspector and agent
   * brief consume. The private binding envelope is intentionally not part of
   * this prop. */
  projectSource?: ProjectSourceView | null;
  projectSourceLabels?: FullDetailA1ProjectSourceLabels | null;
  projectSourceBusy?: boolean;
  projectSourceError?: string | null;
  /** Omit when the displayed bounded next action has no destination on this
   * surface. `use_current_evidence` stays actionable through the local
   * handoff-copy control. */
  onProjectSourceAction?: (() => void | Promise<void>) | null;
  className?: string;
}

const SHEET_PAD_X = "px-5 sm:px-7";
const SECTION_CLASS = "mt-6 border-t border-[color:var(--map-panel-border)] pt-5";
const SECTION_HEADING_CLASS = "text-body font-[var(--font-weight-signature)] text-[color:var(--map-panel-text-primary)]";
const SHEET_LINK_CLASS = controlClass({
  shape: "link",
  size: "lg",
  scope: "panel",
  className: "touch-hit-expand shrink-0 hover:text-[color:var(--map-panel-text-secondary)]",
});

export function FullDetailA1({
  node,
  groups,
  reach,
  titleId,
  bodyMarkdown,
  explanationEdit,
  onSelectNode,
  onClose,
  documentHref,
  mentionDocumentHref = null,
  codeLocations = [],
  projectSource = null,
  projectSourceLabels = null,
  projectSourceBusy = false,
  projectSourceError = null,
  onProjectSourceAction = null,
  className,
}: FullDetailA1Props) {
  const t = useTranslations("fullDetailA1");
  // Same editProvenance namespace as DocFrontmatterBlock and OntologyMapDetailPanel, so the
  // three cannot drift.
  const tProvenance = useTranslations("editProvenance");
  const tDatasheet = useTranslations("topology.nodeDatasheet");
  const getKindLabel = useOntologyKindLabel();
  const { show } = useToast();
  const copyLinkFeedback = useCopyFeedback();
  const copyHandoffFeedback = useCopyFeedback();
  const [step, setStep] = useState<FullDetailReachDepth>(3);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // A host dialog records its opener in its own effect, which runs after this child's; focusing
    // in the same task but after that effect keeps the opener as the focus-return target.
    queueMicrotask(() => headingRef.current?.focus({ preventScroll: true }));
  }, []);

  const handoffChain = useMemo(() => {
    const nodeChain = formatFullDetailHandoffChain(node.agentSlug ?? node.slug, step, {
        documented: node.documented,
        kind: node.kind,
      });
    return node.kind === "project" && projectSource
      ? `${nodeChain}\n\n${formatProjectSourceHandoff(projectSource)}`
      : nodeChain;
  }, [node.agentSlug, node.slug, node.documented, node.kind, step, projectSource]);

  const explanationEditLabels: NodeExplanationEditLabels = useMemo(
    () => ({
      heading: t("body.title"),
      edit: t("body.edit"),
      save: t("body.save"),
      cancel: t("body.cancel"),
      placeholder: t("body.placeholder"),
      empty: t("body.empty"),
      saving: t("body.saving"),
    }),
    [t],
  );

  const handleCopyLink = useCallback(async () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const ok = await copyLinkFeedback.copy(`${origin}${buildOntologyNodeHref(node.id)}`);
    if (ok) show(t("copyLinkCopied"), "success");
  }, [copyLinkFeedback, node.id, show, t]);

  const handleCopyHandoff = useCallback(async () => {
    const ok = await copyHandoffFeedback.copy(handoffChain);
    if (ok) show(t("handoff.copied"), "success");
  }, [copyHandoffFeedback, handoffChain, show, t]);

  const showProjectSource =
    node.kind === "project" && projectSource !== null && projectSourceLabels !== null;
  const projectSourceAction = projectSource?.nextAction.id === "use_current_evidence"
    ? handleCopyHandoff
    : onProjectSourceAction;
  const readBody = stripDuplicateHeading(bodyMarkdown, node.title, node.fullTitle);
  const hasBody = Boolean(readBody && readBody.trim().length > 0);

  return (
    <div
      data-testid="full-detail-a1"
      data-fulldetail-node={node.id}
      className={cn("full-detail-a1 flex min-h-0 flex-1 flex-col", className)}
    >
      <header className={cn("shrink-0 border-b border-[color:var(--map-panel-border)] pt-3 pb-4", SHEET_PAD_X)}>
        <div className="flex min-h-8 items-center gap-2">
          <p
            data-testid="full-detail-a1-kind"
            className="flex min-w-0 flex-1 items-center gap-1.5 text-label text-[color:var(--map-panel-text-tertiary)]"
          >
            <OntologyMapKindGlyph kind={node.kind} size={12} />
            <span className="shrink-0">{getKindLabel(node.kind)}</span>
            {node.ownerTitle ? (
              <>
                <span aria-hidden="true" className="text-[color:var(--map-panel-text-quaternary)]">·</span>
                <span className="min-w-0 truncate text-[color:var(--map-panel-text-secondary)]">{node.ownerTitle}</span>
              </>
            ) : null}
          </p>
          <div className="-mr-2 flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={handleCopyLink}
              aria-label={t("copyLink")}
              title={t("copyLink")}
              data-testid="full-detail-a1-copy-link"
              className={controlClass({
                shape: "icon",
                size: "lg",
                scope: "panel",
                className:
                  "hover:bg-[color:var(--map-panel-row-hover)] hover:text-[color:var(--map-panel-text-secondary)]",
              })}
            >
              <Link2 size={ICON_SIZE.md} />
            </button>
            <CloseButton
              onClick={onClose}
              label={t("close")}
              data-testid="full-detail-a1-close"
              className="text-[color:var(--map-panel-text-tertiary)] hover:bg-[color:var(--map-panel-row-hover)] hover:text-[color:var(--map-panel-text-secondary)]"
            />
          </div>
        </div>
        <h2
          id={titleId}
          ref={headingRef}
          data-testid="full-detail-a1-title"
          tabIndex={-1}
          className="mt-1 [overflow-wrap:anywhere] text-display font-[var(--font-weight-strong)] tracking-[var(--tracking-card)] text-[color:var(--map-panel-text-primary)] focus:outline-none"
        >
          <span {...morphTargetProps(morphName("concept", node.id))} className="inline-block max-w-full">
            {node.title}
          </span>
        </h2>
        {node.fullTitle && node.fullTitle !== node.title ? (
          <p
            data-testid="full-detail-a1-full-title"
            className="mt-0.5 [overflow-wrap:anywhere] text-body text-[color:var(--map-panel-text-tertiary)]"
          >
            {node.fullTitle}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-label text-[color:var(--map-panel-text-tertiary)]">
          <span className="min-w-0 max-w-full [overflow-wrap:anywhere] font-mono text-[color:var(--map-panel-text-quaternary)]">{node.slug}</span>
          <span aria-hidden="true" className="text-[color:var(--map-panel-text-quaternary)]">·</span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-[6px] w-[6px] shrink-0 rounded-full"
              style={{
                backgroundColor: node.fresh
                  ? "var(--map-panel-power-on)"
                  : "var(--map-panel-power-off)",
              }}
            />
            <span data-testid="full-detail-freshness">
              {node.updatedAtLabel ?? (node.fresh ? t("freshOn") : t("freshOff"))}
            </span>
          </span>
          {node.lastEditSubject ? (
            <div className="min-w-0 sm:ml-2">
              <LastEditSubjectRow
                kind={node.lastEditSubject.kind}
                prefixLabel={tProvenance("prefix")}
                subjectLabel={tProvenance(
                  node.lastEditSubject.kind === "agent" ? "subjectAgent" : "subjectHuman",
                )}
                ageLabel={node.lastEditSubject.ageLabel}
              />
            </div>
          ) : null}
        </div>
      </header>

      <div
        data-fulldetail-scroll
        // The fade sits inside the bottom padding, so it only touches content that scrolls on.
        className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain pt-5 pb-7 [mask-image:linear-gradient(to_bottom,black_calc(100%-1.5rem),transparent)]", SHEET_PAD_X)}
      >
        {/* A body's own `#` heading steps down one level so it never rivals the sheet's title. */}
        <section data-fulldetail-body className="min-w-0 [&_[data-testid=node-explanation-rendered]_h1]:text-title">
          {node.mtimeConflict ? (
            <p data-testid="mtime-conflict-badge" role="status" className="mb-3 flex items-start gap-2 text-body leading-body text-[color:var(--map-panel-text-secondary)]">
              <TriangleAlert size={ICON_SIZE.md} aria-hidden className="mt-0.5 shrink-0 text-[color:var(--color-status-warning)]" />
              <span>{tProvenance("conflictMessage")}</span>
            </p>
          ) : null}
          {explanationEdit ? (
            <NodeExplanationEdit
              value={bodyMarkdown ?? ""}
              onSave={explanationEdit.onSave}
              labels={explanationEditLabels}
            />
          ) : hasBody ? (
            /* Shared prose constant: `@tailwindcss/typography` is not installed, so `prose` emits nothing. */
            <div
              className={cn(
                "min-w-0 max-w-[var(--measure-prose)] overflow-x-auto [overflow-wrap:anywhere] text-body-lg leading-prose text-[color:var(--map-panel-text-secondary)]",
                MARKDOWN_PROSE_CLASS,
                "[&_h1]:text-title",
              )}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{readBody}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-body text-[color:var(--map-panel-text-tertiary)]">{t("body.empty")}</p>
          )}
        </section>

        <FullDetailA1GroupsPanel
          className={SECTION_CLASS}
          groups={groups}
          onSelectNode={onSelectNode}
          labels={{
            containsTitle: t("groups.containsTitle"),
            usedByTitle: t("groups.usedByTitle"),
            dependsOnTitle: t("groups.dependsOnTitle"),
            belongsToTitle: t("groups.belongsToTitle"),
            relatedTitle: t("groups.relatedTitle"),
            freshDotTitle: t("groups.freshDotTitle"),
            directLinks: (count) => t("groups.directLinks", { count }),
            domainCount: (count) => t("groups.domainCount", { count }),
            domainLinks: (count) => t("groups.domainLinks", { count }),
            caption: t("groups.caption"),
            empty: tDatasheet("noConnections"),
          }}
        />

        <FullDetailA1ReachPanel
          className={SECTION_CLASS}
          reach={reach}
          step={step}
          onChangeStep={setStep}
          labels={{
            summary: (depth, count, total) => t("reach.summary", { depth, count, total }),
            stepsAria: t("reach.stepsAria"),
            selfDomainLabel: t("reach.selfDomainLabel"),
            noDomainLabel: t("reach.noDomainLabel"),
            domainsHidden: (hidden) => t("reach.domainsHidden", { count: hidden }),
          }}
        />

        <section data-fulldetail-handoff className={SECTION_CLASS}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h3 className={cn("min-w-0 flex-1", SECTION_HEADING_CLASS)}>{t("handoff.label")}</h3>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <button
                type="button"
                onClick={handleCopyHandoff}
                data-testid="full-detail-a1-handoff-copy"
                className={controlClass({ shape: "chip", size: "lg", className: "shrink-0 border-[color:var(--map-indigo-border)] bg-[color:var(--map-panel-action-surface)] font-[var(--font-weight-signature)] text-[color:var(--map-indigo-bright)] hover:bg-[color:var(--map-panel-row-hover)] hover:border-[color:var(--map-indigo)]" })}
              >
                {t("handoff.copy")}
              </button>
              {/* Each link leaves the map, so it closes the sheet first rather than act unseen beneath it. */}
              {documentHref ? (
                <Link href={documentHref} onClick={onClose} data-testid="full-detail-a1-open-document" className={SHEET_LINK_CLASS}>
                  {t("handoff.openDocument")}
                </Link>
              ) : mentionDocumentHref ? (
                <Link
                  href={mentionDocumentHref}
                  onClick={onClose}
                  title={t("handoff.openMentionDocumentTip")}
                  data-testid="full-detail-a1-open-mention-document"
                  className={SHEET_LINK_CLASS}
                >
                  {t("handoff.openMentionDocument")}
                </Link>
              ) : null}
              <Link
                href={buildTopologyMeaningEditorNodeHref(node.id)}
                onClick={onClose}
                data-testid="full-detail-a1-open-studio"
                className={SHEET_LINK_CLASS}
              >
                {t("handoff.openStudio")}
              </Link>
            </div>
          </div>
          <code className="mt-3 block min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere] font-mono text-label leading-label text-[color:var(--map-panel-text-tertiary)]">
            {handoffChain}
          </code>
        </section>

        {codeLocations.length > 0 ? (
          <section data-fulldetail-code-locations className={SECTION_CLASS}>
            <h3 className={SECTION_HEADING_CLASS}>{t("codeLocations.heading")}</h3>
            <ul className="-mx-1.5 mt-1.5 flex flex-col gap-1">
              {codeLocations.map((path) => (
                <FullDetailCodeLocationRow
                  key={path}
                  path={path}
                  copyLabel={t("codeLocations.copy")}
                  copiedLabel={t("codeLocations.copied")}
                />
              ))}
            </ul>
          </section>
        ) : null}

        {showProjectSource ? (
          <section
            data-testid="full-detail-project-source"
            data-source-version={projectSource.contractVersion}
            data-source-status={projectSource.status}
            data-source-measured-at={projectSource.measuredAt ?? "unmeasured"}
            data-source-top-gap={projectSource.topGap?.id ?? "none"}
            data-source-action={projectSource.nextAction.id}
            data-source-currentness={projectSource.currentness}
            data-source-cardinality={projectSource.bindingCardinality}
            aria-live="polite"
            className={cn(SECTION_CLASS, "grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end")}
          >
            <div className="min-w-0">
              <h3 className={SECTION_HEADING_CLASS}>
                {projectSourceLabels.heading}
                {projectSourceLabels.sourceKind ? (
                  <span className="ml-2 font-mono text-label font-normal text-[color:var(--map-panel-text-quaternary)]">
                    {projectSourceLabels.sourceKind}
                  </span>
                ) : null}
              </h3>
              <p className="mt-1 text-body-lg font-[var(--font-weight-signature)] text-[color:var(--map-panel-text-primary)]">
                {projectSourceLabels.status}
              </p>
              <p className="mt-0.5 text-body text-[color:var(--map-panel-text-tertiary)]">
                {projectSourceLabels.measuredAt}
                <span className="mx-1.5 text-[color:var(--map-panel-text-quaternary)]">·</span>
                {projectSourceLabels.currentness}
              </p>
              <p className="mt-2 text-body text-[color:var(--map-panel-text-secondary)]">
                {projectSourceLabels.gap}
              </p>
              {projectSourceError ? (
                <p
                  role="status"
                  className="mt-1.5 text-body text-[color:var(--color-danger-text)]"
                >
                  {projectSourceError}
                </p>
              ) : null}
            </div>
            {projectSourceAction ? (
              <button
                type="button"
                onClick={() => void projectSourceAction()}
                disabled={projectSourceBusy}
                aria-busy={projectSourceBusy}
                className={controlClass({ shape: "chip", className: "justify-self-start border-[color:var(--map-indigo-border)] bg-[color:var(--map-panel-action-surface)] px-3 py-1.5 font-[var(--font-weight-signature)] text-[color:var(--map-indigo-bright)] hover:border-[color:var(--map-indigo)] hover:bg-[color:var(--map-panel-row-hover)] disabled:cursor-wait sm:justify-self-end" })}
              >
                {projectSourceBusy ? projectSourceLabels.busy : projectSourceLabels.action}
              </button>
            ) : (
              <span className="justify-self-start text-body font-[var(--font-weight-signature)] text-[color:var(--map-indigo-bright)] sm:justify-self-end">
                {projectSourceLabels.action}
              </span>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}

/**
 * One code location row, duplicated from the datasheet's `CodeLocationRow` because FSD forbids
 * widget-to-widget imports.
 */
function FullDetailCodeLocationRow({
  path,
  copyLabel,
  copiedLabel,
}: {
  path: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const { state, copy } = useCopyFeedback();
  return (
    <li
      data-fulldetail-code-location={path}
      className="flex min-h-[32px] w-full items-center gap-2 rounded-chip px-1.5 py-1.5"
    >
      <span
        title={path}
        className="min-w-0 flex-1 truncate font-mono text-label text-[color:var(--map-panel-text-tertiary)]"
      >
        {truncateMiddlePath(path)}
      </span>
      <button
        type="button"
        onClick={() => void copy(path)}
        aria-label={state === "copied" ? copiedLabel : copyLabel}
        title={state === "copied" ? copiedLabel : copyLabel}
        data-testid="full-detail-a1-code-location-copy"
        /*
         * The box uses the square ramp's `sm` (24px); the row is already `min-h-[32px]`, so height
         * is unchanged.
         */
        className={controlClass({
          shape: "icon",
          size: "sm",
          tone: "muted",
          scope: "panel",
          className:
            "shrink-0 hover:bg-[color:var(--map-panel-row-hover)] hover:text-[color:var(--map-panel-text-secondary)]",
        })}
      >
        {state === "copied" ? <Check size={ICON_SIZE.sm} aria-hidden /> : <Clipboard size={ICON_SIZE.sm} aria-hidden />}
      </button>
    </li>
  );
}
