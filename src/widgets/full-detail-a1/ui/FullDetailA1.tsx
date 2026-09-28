"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Clipboard, Link2, TriangleAlert, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { Link } from "@/i18n/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/shared/lib/cn";
import { MARKDOWN_PROSE_CLASS } from "@/shared/ui/markdown-prose";
import {
  buildOntologyNodeHref,
  buildTopologyMeaningEditorNodeHref,
} from "@/entities/knowledge-graph";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { truncateMiddlePath } from "@/shared/lib/truncate-middle-path";
import {
  formatProjectSourceHandoff,
  type ProjectSourceView,
} from "@/shared/lib/project-source-receipt";
import { controlClass, LastEditSubjectRow, useToast } from "@/shared/ui";
import {
  NodeExplanationEdit,
  type NodeExplanationEditLabels,
} from "@/shared/ui/node-explanation-edit";
import { OntologyMapKindGlyph } from "@/shared/ui/map-kind-glyph";
import { morphName, morphTargetProps } from "@/shared/motion/shared-element";
import { formatFullDetailHandoffChain } from "../lib/full-detail-handoff";
import { formatFullDetailMetricLine } from "../lib/full-detail-metric";
import type { FullDetailGroups } from "../lib/full-detail-groups";
import type { FullDetailReachDepth, FullDetailReachModel } from "../lib/full-detail-reach";
import { FullDetailA1GroupsPanel } from "./full-detail-a1-groups-panel";
import { FullDetailA1ReachPanel } from "./full-detail-a1-reach-panel";

/**
 * The full-detail surface (`docs/prototypes/detail-a1-datasheet.html`): header, metric strip, four
 * direction groups, reach sentence, agent handoff and body. Shared by the topology datasheet's full
 * detail and the `/ontology` node detail, both fed by `buildFullDetailGroups`
 * and `buildFullDetailReachModel` so numbers cannot drift.
 */

export interface FullDetailA1Node {
  id: string;
  /** The short display title (the display field wins; otherwise the title's
   *  parenthetical explanation is cut). The header h1 draws this large. */
  title: string;
  /** The full original vault title — preserved as secondary text under the h1 only
   *  when it differs from `title` (layering, not hiding). Identical, it is not rendered. */
  fullTitle?: string;
  kind: string;
  /** Vault slug / evidence path beneath the identity. */
  slug: string;
  /**
   * The name handed to an agent: the vault-relative slug, or the raw reference text for a concept
   * without a document (`resolveNodeAgentTarget`). Falls back to `slug`.
   */
  agentSlug?: string | null;
  /** Does it have its own document? Without one, the handoff chain starts by creating it. */
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
  /** expected_mtime conflict badge, true only on a real mismatch. */
  mtimeConflict?: boolean;
}

export interface FullDetailA1Breadcrumb {
  projectTitle: string | null;
  totalConcepts: number | null;
  totalRelations: number | null;
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
  breadcrumb?: FullDetailA1Breadcrumb;
  /** The node's own markdown body (the node IS a markdown doc — A1 must not
   * drop it, per the design gate). `null` renders the empty-body message. */
  bodyMarkdown: string | null;
  /** Makes the body editable in place when the vault is writable; null keeps it read-only. */
  explanationEdit?: {
    onSave: (next: string) => void | Promise<void>;
  } | null;
  onSelectNode: (id: string) => void;
  onClose: () => void;
  onBackToMap?: () => void;
  /** **This node's own** document. null or omitted when it has no `.md` of its own. */
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

export function FullDetailA1({
  node,
  groups,
  reach,
  breadcrumb,
  bodyMarkdown,
  explanationEdit,
  onSelectNode,
  onClose,
  onBackToMap,
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
  const getKindLabel = useOntologyKindLabel();
  const { show } = useToast();
  const copyLinkFeedback = useCopyFeedback();
  const copyHandoffFeedback = useCopyFeedback();
  const [step, setStep] = useState<FullDetailReachDepth>(3);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
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

  const metricLine = useMemo(
    () =>
      formatFullDetailMetricLine(
        {
          contains: groups.contains.total,
          usedBy: groups.usedBy.total,
          dependsOn: groups.dependsOn.total,
          reach: reach.byDepth[3].reachableCount,
        },
        {
          contains: t("metric.contains"),
          usedBy: t("metric.usedBy"),
          dependsOn: t("metric.dependsOn"),
          reach: t("metric.reach"),
        },
      ),
    [groups, reach, t],
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

  return (
    <div
      data-testid="full-detail-a1"
      data-fulldetail-node={node.id}
      className={["full-detail-a1 mx-auto flex max-w-[1240px] flex-col px-4 py-5 sm:px-6 sm:py-7", className ?? ""].join(" ")}
    >
      <nav className="mb-6 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-body text-[color:var(--map-panel-text-tertiary)]">
        {onBackToMap ? (
          <button
            type="button"
            onClick={onBackToMap}
            className={controlClass({
              shape: "link",
              scope: "panel",
              tone: "secondary",
              className:
                "touch-hit-expand hover:text-[color:var(--map-panel-text-primary)]",
            })}
          >
            {t("backToMap")}
          </button>
        ) : null}
        {breadcrumb?.projectTitle ? (
          <>
            <span className="text-[color:var(--map-panel-text-quaternary)]">
              {t("breadcrumbSeparator")}
            </span>
            <span>{breadcrumb.projectTitle}</span>
          </>
        ) : null}
        <span className="text-[color:var(--map-panel-text-quaternary)]">
          {t("breadcrumbSeparator")}
        </span>
        <span>{getKindLabel(node.kind)}</span>
        {breadcrumb?.totalConcepts != null && breadcrumb?.totalRelations != null ? (
          <span className="ml-auto font-mono text-label tracking-[var(--tracking-caps-08)] text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]">
            {t("census", {
              concepts: breadcrumb.totalConcepts,
              relations: breadcrumb.totalRelations,
            })}
          </span>
        ) : null}
      </nav>

      <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2">
        <span className="mt-1">
          <OntologyMapKindGlyph kind={node.kind} size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h1
            ref={headingRef}
            tabIndex={-1}
            {...morphTargetProps(morphName("concept", node.id))}
            className="[overflow-wrap:anywhere] text-display font-[var(--font-weight-strong)] tracking-[var(--tracking-card)] text-[color:var(--map-panel-text-primary)]">
            {node.title}
          </h1>
          {/* The full title as secondary text when the display name abbreviates it. */}
          {node.fullTitle && node.fullTitle !== node.title ? (
            <p
              data-testid="full-detail-a1-full-title"
              className="mt-1 [overflow-wrap:anywhere] text-body text-[color:var(--map-panel-text-tertiary)]"
            >
              {node.fullTitle}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-label text-[color:var(--map-panel-text-tertiary)]">
            <span className="min-w-0 max-w-full [overflow-wrap:anywhere] font-mono text-[color:var(--map-panel-text-quaternary)]">{node.slug}</span>
            <span aria-hidden className="text-[color:var(--map-panel-text-quaternary)]">·</span>
            <span className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-[6px] w-[6px] shrink-0 rounded-full"
              style={{
                backgroundColor: node.fresh
                  ? "var(--map-panel-power-on)"
                  : "var(--map-panel-power-off)",
              }}
            />
            <span>{getKindLabel(node.kind)}</span>
            <span className="text-[color:var(--map-panel-text-quaternary)]">·</span>
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
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={handleCopyLink}
            aria-label={t("copyLink")}
            title={t("copyLink")}
            data-testid="full-detail-a1-copy-link"
            className={controlClass({
              shape: "icon",
              size: "sm",
              scope: "panel",
              className:
                "hover:bg-[color:var(--map-panel-row-hover)] hover:text-[color:var(--map-panel-text-secondary)]",
            })}
          >
            <Link2 size={ICON_SIZE.md} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            data-testid="full-detail-a1-close"
            className={controlClass({
              shape: "icon",
              size: "sm",
              scope: "panel",
              className:
                "hover:bg-[color:var(--map-panel-row-hover)] hover:text-[color:var(--map-panel-text-secondary)]",
            })}
          >
            <X size={ICON_SIZE.lg} />
          </button>
        </div>
      </header>

      {/*
       * Body type with tabular figures, not mono, which spreads Korean words to monospace width.
       */}
      <div
        data-fulldetail-metric="engraved"
        className="mt-4.5 flex flex-wrap items-baseline gap-x-4.5 gap-y-1 rounded-chip border border-[color:var(--map-panel-border)] bg-[color:var(--map-panel-metric-surface)] px-3.5 py-2.5 text-body tabular-nums tracking-[var(--tracking-label)] text-[color:var(--map-panel-metric-text)]"
      >
        {metricLine}
      </div>

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
          className="mt-5.5 grid gap-2 border-y border-[color:var(--map-panel-border)] py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
        >
          <div className="min-w-0">
            <p className="text-label font-[var(--font-weight-signature)] uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--map-panel-text-quaternary)]">
              {projectSourceLabels.heading}
              {projectSourceLabels.sourceKind ? (
                <span className="ml-2 font-mono normal-case tracking-normal">
                  {projectSourceLabels.sourceKind}
                </span>
              ) : null}
            </p>
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
              className={controlClass({ shape: "chip", className: "justify-self-start border-[color:var(--map-indigo-border)] bg-[color:var(--map-panel-action-surface)] px-3 py-1.5 text-body font-[var(--font-weight-signature)] text-[color:var(--map-indigo-bright)] hover:border-[color:var(--map-indigo)] hover:bg-[color:var(--map-panel-row-hover)] disabled:cursor-wait sm:justify-self-end" })}
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

      <FullDetailA1GroupsPanel
        className="mt-5.5"
        groups={groups}
        onSelectNode={onSelectNode}
        labels={{
          containsTitle: t("groups.containsTitle"),
          containsCaption: t("groups.containsCaption"),
          usedByTitle: t("groups.usedByTitle"),
          usedByCaption: t("groups.usedByCaption"),
          dependsOnTitle: t("groups.dependsOnTitle"),
          dependsOnCaption: t("groups.dependsOnCaption"),
          belongsToTitle: t("groups.belongsToTitle"),
          belongsToCaption: t("groups.belongsToCaption"),
          empty: t("groups.empty"),
          freshDotTitle: t("groups.freshDotTitle"),
        }}
      />

      {codeLocations.length > 0 ? (
        <section
          data-fulldetail-code-locations
          className="mt-5.5 flex flex-col gap-1.5 rounded-card border border-[color:var(--map-panel-border)] bg-[color:var(--map-panel-surface)] px-3.5 py-3"
        >
          <span className="text-body font-[var(--font-weight-signature)] text-[color:var(--map-panel-text-primary)]">
            {t("codeLocations.heading")}
          </span>
          <ul className="flex flex-col gap-1">
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

      <FullDetailA1ReachPanel
        className="mt-5.5"
        reach={reach}
        step={step}
        onChangeStep={setStep}
        labels={{
          leadIn: t("reach.leadIn"),
          stepUnit: t("reach.stepUnit"),
          afterSteps: t("reach.afterSteps"),
          stepsAria: t("reach.stepsAria"),
          ofTotal: (count, total) => t("reach.ofTotal", { count, total }),
          mostlyNone: t("reach.mostlyNone"),
          mostlyOne: (a, aCount) => t("reach.mostlyOne", { a, aCount }),
          mostlyTwo: (a, aCount, b, bCount) =>
            t("reach.mostlyTwo", { a, aCount, b, bCount }),
          selfDomainLabel: t("reach.selfDomainLabel"),
          noDomainLabel: t("reach.noDomainLabel"),
          domainsHidden: (hidden) => t("reach.domainsHidden", { count: hidden }),
          domainsHiddenRoute: t("reach.domainsHiddenRoute"),
        }}
      />

      <section
        data-fulldetail-handoff
        className="mt-5 flex flex-col gap-3 rounded-card border border-[color:var(--map-panel-border)] bg-[color:var(--map-panel-surface)] p-[var(--card-pad)]"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="min-w-0 flex-1 text-body font-[var(--font-weight-signature)] text-[color:var(--map-panel-text-primary)]">
          {t("handoff.label")}
        </span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={handleCopyHandoff}
          data-testid="full-detail-a1-handoff-copy"
          className={controlClass({ shape: "chip", className: "shrink-0 border-[color:var(--map-indigo-border)] bg-[color:var(--map-panel-action-surface)] px-3 py-1.5 text-body font-[var(--font-weight-signature)] text-[color:var(--map-indigo-bright)] hover:bg-[color:var(--map-panel-row-hover)] hover:border-[color:var(--map-indigo)]" })}
        >
          {t("handoff.copy")}
        </button>
        {/*
         * This card is an opaque overlay, so every link here closes it first; otherwise the map
         * action happens unseen underneath.
         */}
        {documentHref ? (
          <Link
            href={documentHref}
            onClick={onClose}
            data-testid="full-detail-a1-open-document"
            className={controlClass({
              shape: "link",
              size: "lg",
              scope: "panel",
              className:
                "touch-hit-expand shrink-0 hover:text-[color:var(--map-panel-text-secondary)]",
            })}
          >
            {t("handoff.openDocument")}
          </Link>
        ) : mentionDocumentHref ? (
          <Link
            href={mentionDocumentHref}
            onClick={onClose}
            title={t("handoff.openMentionDocumentTip")}
            data-testid="full-detail-a1-open-mention-document"
            className={controlClass({
              shape: "link",
              size: "lg",
              scope: "panel",
              className:
                "touch-hit-expand shrink-0 hover:text-[color:var(--map-panel-text-secondary)]",
            })}
          >
            {t("handoff.openMentionDocument")}
          </Link>
        ) : null}
        <Link
          href={buildTopologyMeaningEditorNodeHref(node.id)}
          onClick={onClose}
          data-testid="full-detail-a1-open-studio"
          className={controlClass({
            shape: "link",
            size: "lg",
            scope: "panel",
            className:
              "touch-hit-expand shrink-0 hover:text-[color:var(--map-panel-text-secondary)]",
          })}
        >
          {t("handoff.openStudio")}
        </Link>
        </div>
        </div>
        <code className="block min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere] border-t border-[color:var(--map-panel-border)] pt-3 font-mono text-label leading-label text-[color:var(--map-panel-text-tertiary)]">
          {handoffChain}
        </code>
      </section>

      <section data-fulldetail-body className="mt-6 rounded-card border border-[color:var(--map-panel-border)] bg-[color:var(--map-panel-metric-surface)] p-[var(--card-pad)]">
        {node.mtimeConflict ? (
          <p data-testid="mtime-conflict-badge" role="status" className="mb-4 flex items-start gap-2 text-body leading-body text-[color:var(--map-panel-text-secondary)]">
            <TriangleAlert size={ICON_SIZE.md} aria-hidden className="mt-0.5 shrink-0 text-[color:var(--color-status-warning)]" />
            <span>{tProvenance("conflictMessage")}</span>
          </p>
        ) : null}
        <div className="min-w-0 max-w-[var(--measure-doc-column)] [&>div>div:first-child]:mb-4 [&>div>div:first-child]:border-b [&>div>div:first-child]:border-[color:var(--map-panel-border)] [&>div>div:first-child]:pb-3 [&>div>div:first-child>span]:font-sans [&>div>div:first-child>span]:text-body [&>div>div:first-child>span]:font-[var(--font-weight-strong)] [&>div>div:first-child>span]:normal-case [&>div>div:first-child>span]:tracking-normal [&>div>div:first-child>span]:text-[color:var(--map-panel-text-primary)]">
        {explanationEdit ? (
          <NodeExplanationEdit
            value={bodyMarkdown ?? ""}
            onSave={explanationEdit.onSave}
            labels={explanationEditLabels}
          />
        ) : (
          <>
            <h2 className="mb-4 border-b border-[color:var(--map-panel-border)] pb-3 text-body font-[var(--font-weight-signature)] text-[color:var(--map-panel-text-primary)]">
              {t("body.title")}
            </h2>
            {/*
             * Shared prose constant: `@tailwindcss/typography` is not installed, so `prose` classes
             * emit nothing.
             */}
            {bodyMarkdown && bodyMarkdown.trim().length > 0 ? (
              <div
                className={cn(
                  "min-w-0 overflow-x-auto [overflow-wrap:anywhere] text-body-lg leading-prose text-[color:var(--map-panel-text-secondary)]",
                  MARKDOWN_PROSE_CLASS,
                )}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{bodyMarkdown}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-body text-[color:var(--map-panel-text-tertiary)]">
                {t("body.empty")}
              </p>
            )}
          </>
        )}
        </div>
      </section>
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
