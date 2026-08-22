"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Clipboard, Link2, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { Link } from "@/i18n/navigation";
import ReactMarkdown from "react-markdown";
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
import { controlClass, LastEditSubjectRow, MtimeConflictBadge, useToast } from "@/shared/ui";
import {
  NodeExplanationEdit,
  type NodeExplanationEditLabels,
} from "@/shared/ui/node-explanation-edit";
import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";
import { formatFullDetailHandoffChain } from "../lib/full-detail-handoff";
import { formatFullDetailMetricLine } from "../lib/full-detail-metric";
import type { FullDetailGroups } from "../lib/full-detail-groups";
import type { FullDetailReachDepth, FullDetailReachModel } from "../lib/full-detail-reach";
import { FullDetailA1GroupsPanel } from "./full-detail-a1-groups-panel";
import { FullDetailA1ReachPanel } from "./full-detail-a1-reach-panel";

/**
 * The A1 「데이터시트 확장판」 (expanded datasheet) full-detail surface —
 * owner-approved mockup `docs/prototypes/detail-a1-datasheet.html`. Replaces BOTH
 * rejected surfaces (`TopologyOntologyDrawer`'s badge-soup FROM THIS/CONTAINS rows +
 * rich collaborator brief, and `OntologyViewPage`'s `NodeDetailPanel`
 * query-builder reach explorer + Meaning/Connections/checks sidebar) with a
 * single flat page: header → ONE engraved metric strip → four full
 * direction groups → reach sentence instrument → agent handoff row → body.
 *
 * Shared between two entry points: the topology datasheet's 「전체 상세」 (full detail)
 * opt-in (`HomePage.tsx`) and the `/ontology` page's node detail
 * (`OntologyViewPage.tsx`) — both feed the SAME `groups`/`reach` facts built
 * by `buildFullDetailGroups`/`buildFullDetailReachModel` (lib/), so the
 * numbers can't drift between entry points.
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
  /** Vault slug / evidence path shown mono top-right. */
  slug: string;
  /**
   * The name handed to an agent — the document slug relative to the vault root, or,
   * for a concept with no document, the raw reference text the vault recorded
   * (`resolveNodeAgentTarget`). The handoff chain uses this value rather than `slug`:
   * passing the manifest slug the screen holds gives a name absent from the agent's
   * vault. Unset, it falls back to `slug`.
   */
  agentSlug?: string | null;
  /** Does it have its own document? Without one, the handoff chain starts by creating it. */
  documented?: boolean;
  fresh: boolean;
  /**
   * Entry review E-5 — the same node's freshness contradicted itself one click apart.
   * The datasheet panel said 「2일 전 바뀜」 (changed 2 days ago; the document mtime
   * ramp) while this screen said 「한동안 그대로」 (unchanged for a while; the session
   * changeset baseline). That is precisely the split `use-node-datasheet-model`'s M-3
   * contract forbids — freshness has one source of truth, mtime. The caller passes
   * **the very sentence the datasheet uses**. When present it replaces the binary
   * (recently updated / unchanged for a while) — the same precedence the panel applies
   * in the same position.
   */
  updatedAtLabel?: string | null;
  /**
   * rank7 (design-council B5) — last-edit provenance, pre-resolved by the
   * caller (reuses the SAME fact `TopologyV2DetailPanel` shows for this
   * node, `resolveNodeLastEditSubject`) from real data only. `null`/omitted
   * when neither an agent heartbeat nor a same-session self-write names
   * this node — the row is not rendered.
   */
  lastEditSubject?: { kind: "agent" | "human"; ageLabel: string } | null;
  /** rank7 — expected_mtime conflict badge, `true` only on a real mismatch. */
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
  /** When the vault is writable, lets the body be edited in place (S4.1b) —
   * same read↔edit primitive the old drawer used. `null`/omitted keeps the
   * body read-only (deep-linked / read-only vault). */
  explanationEdit?: {
    onSave: (next: string) => void | Promise<void>;
  } | null;
  onSelectNode: (id: string) => void;
  onClose: () => void;
  onBackToMap?: () => void;
  /** **This node's own** document. null or omitted when it has no `.md` of its own. */
  documentHref?: string | null;
  /**
   * When it has no document of its own, another document that records this node. This
   * surface has no 「근거」 (evidence) list, so removing the link would lose "where is
   * this written down" — it is kept, relabelled to name its destination.
   */
  mentionDocumentHref?: string | null;
  /**
   * "코드 위치" (code location) — the node's REAL code evidence: raw file
   * paths (`deriveCodeLocations`), not the self-referential vault-doc slug
   * `node.slug` already shows above. Omitted/empty hides the section —
   * never fabricated.
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
  // The same `editProvenance` namespace as DocFrontmatterBlock and
  // TopologyV2DetailPanel (single source, drift prevention).
  const tProvenance = useTranslations("editProvenance");
  const getKindLabel = useOntologyKindLabel();
  const { show } = useToast();
  const copyLinkFeedback = useCopyFeedback();
  const copyHandoffFeedback = useCopyFeedback();
  const [step, setStep] = useState<FullDetailReachDepth>(3);

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
      className={["full-detail-a1 mx-auto flex max-w-[1240px] flex-col px-6 py-7", className ?? ""].join(" ")}
    >
      <nav className="mb-6 flex items-center gap-2.5 text-body text-[color:var(--topology-v2-panel-text-tertiary)]">
        {onBackToMap ? (
          <button
            type="button"
            onClick={onBackToMap}
            className={controlClass({
              shape: "link",
              scope: "panel",
              tone: "secondary",
              className:
                "touch-hit-expand hover:text-[color:var(--topology-v2-panel-text-primary)]",
            })}
          >
            {t("backToMap")}
          </button>
        ) : null}
        {breadcrumb?.projectTitle ? (
          <>
            <span className="text-[color:var(--topology-v2-panel-text-quaternary)]">
              {t("breadcrumbSeparator")}
            </span>
            <span>{breadcrumb.projectTitle}</span>
          </>
        ) : null}
        <span className="text-[color:var(--topology-v2-panel-text-quaternary)]">
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

      <header className="flex items-start gap-3.5">
        <span className="mt-[5px]">
          <TopologyV2KindGlyph kind={node.kind} size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-display font-[var(--font-weight-strong)] tracking-[var(--tracking-card)] text-[color:var(--topology-v2-panel-text-primary)]">
            {node.title}
          </h1>
          {/* When the display name abbreviates the original title, the full title is
              preserved as secondary text (layering, not hiding). Identical, it is
              omitted to avoid rendering it twice. */}
          {node.fullTitle && node.fullTitle !== node.title ? (
            <p
              data-testid="full-detail-a1-full-title"
              className="mt-0.5 truncate text-body text-[color:var(--topology-v2-panel-text-tertiary)]"
            >
              {node.fullTitle}
            </p>
          ) : null}
          <div className="mt-1 flex items-center gap-2 text-body text-[color:var(--topology-v2-panel-text-tertiary)]">
            <span
              aria-hidden="true"
              className="h-[6px] w-[6px] shrink-0 rounded-full"
              style={{
                backgroundColor: node.fresh
                  ? "var(--topology-v2-panel-power-on)"
                  : "var(--topology-v2-panel-power-off)",
              }}
            />
            <span>{getKindLabel(node.kind)}</span>
            <span className="text-[color:var(--topology-v2-panel-text-quaternary)]">·</span>
            <span data-testid="full-detail-freshness">
              {node.updatedAtLabel ?? (node.fresh ? t("freshOn") : t("freshOff"))}
            </span>
          </div>
          {/* rank7 (design-council B5) — last-edit provenance + expected_mtime
              conflict, gated on real data by the caller (reuses the SAME
              fact as the compact topology panel — no separate judgment). */}
          {node.lastEditSubject ? (
            <div className="mt-1">
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
          {node.mtimeConflict ? (
            <div className="mt-1">
              <MtimeConflictBadge message={tProvenance("conflictMessage")} />
            </div>
          ) : null}
        </div>
        <div className="mt-2.5 flex shrink-0 items-center gap-3">
          <span className="font-mono text-label text-[color:var(--topology-v2-panel-text-quaternary)]">
            {node.slug}
          </span>
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
                "hover:bg-[color:var(--topology-v2-panel-row-hover)] hover:text-[color:var(--topology-v2-panel-text-secondary)]",
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
                "hover:bg-[color:var(--topology-v2-panel-row-hover)] hover:text-[color:var(--topology-v2-panel-text-secondary)]",
            })}
          >
            <X size={ICON_SIZE.lg} />
          </button>
        </div>
      </header>

      <div
        data-fulldetail-metric="engraved"
        className="mt-4.5 flex flex-wrap items-baseline gap-x-4.5 gap-y-1 rounded-chip border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-metric-surface)] px-3.5 py-2.5 font-mono text-body tracking-[var(--tracking-label)] text-[color:var(--topology-v2-panel-metric-text)]"
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
          className="mt-5.5 grid gap-2 border-y border-[color:var(--topology-v2-panel-border)] py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
        >
          <div className="min-w-0">
            <p className="text-label font-[var(--font-weight-signature)] uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--topology-v2-panel-text-quaternary)]">
              {projectSourceLabels.heading}
              {projectSourceLabels.sourceKind ? (
                <span className="ml-2 font-mono normal-case tracking-normal">
                  {projectSourceLabels.sourceKind}
                </span>
              ) : null}
            </p>
            <p className="mt-1 text-body-lg font-[var(--font-weight-signature)] text-[color:var(--topology-v2-panel-text-primary)]">
              {projectSourceLabels.status}
            </p>
            <p className="mt-0.5 text-body text-[color:var(--topology-v2-panel-text-tertiary)]">
              {projectSourceLabels.measuredAt}
              <span className="mx-1.5 text-[color:var(--topology-v2-panel-text-quaternary)]">·</span>
              {projectSourceLabels.currentness}
            </p>
            <p className="mt-2 text-body text-[color:var(--topology-v2-panel-text-secondary)]">
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
              className={controlClass({ shape: "chip", className: "justify-self-start border-[color:var(--topology-v2-indigo-border)] bg-[color:var(--topology-v2-panel-action-surface)] px-3 py-1.5 text-body font-[var(--font-weight-signature)] text-[color:var(--topology-v2-indigo-bright)] hover:border-[color:var(--topology-v2-indigo)] hover:bg-[color:var(--topology-v2-panel-row-hover)] disabled:cursor-wait sm:justify-self-end" })}
            >
              {projectSourceBusy ? projectSourceLabels.busy : projectSourceLabels.action}
            </button>
          ) : (
            <span className="justify-self-start text-body font-[var(--font-weight-signature)] text-[color:var(--topology-v2-indigo-bright)] sm:justify-self-end">
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
          className="mt-5.5 flex flex-col gap-1.5 rounded-card border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] px-3.5 py-3"
        >
          <span className="text-body font-[var(--font-weight-signature)] text-[color:var(--topology-v2-panel-text-primary)]">
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
          ofTotal: (count, total) => t("reach.ofTotal", { count, total }),
          mostlyNone: t("reach.mostlyNone"),
          mostlyOne: (a, aCount) => t("reach.mostlyOne", { a, aCount }),
          mostlyTwo: (a, aCount, b, bCount) =>
            t("reach.mostlyTwo", { a, aCount, b, bCount }),
          selfDomainLabel: t("reach.selfDomainLabel"),
          noDomainLabel: t("reach.noDomainLabel"),
        }}
      />

      <section
        data-fulldetail-handoff
        className="mt-6.5 flex items-center gap-3.5 rounded-card border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] px-3.5 py-3"
      >
        <span className="shrink-0 text-body font-[var(--font-weight-signature)] text-[color:var(--topology-v2-panel-text-primary)]">
          {t("handoff.label")}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-label text-[color:var(--topology-v2-panel-text-tertiary)]">
          {handoffChain}
        </span>
        <button
          type="button"
          onClick={handleCopyHandoff}
          data-testid="full-detail-a1-handoff-copy"
          className={controlClass({ shape: "chip", className: "shrink-0 border-[color:var(--topology-v2-indigo-border)] bg-[color:var(--topology-v2-panel-action-surface)] px-3 py-1.5 text-body font-[var(--font-weight-signature)] text-[color:var(--topology-v2-indigo-bright)] hover:bg-[color:var(--topology-v2-panel-row-hover)] hover:border-[color:var(--topology-v2-indigo)]" })}
        >
          {t("handoff.copy")}
        </button>
        {documentHref ? (
          <Link
            href={documentHref}
            className={controlClass({
              shape: "link",
              size: "lg",
              scope: "panel",
              className:
                "touch-hit-expand shrink-0 hover:text-[color:var(--topology-v2-panel-text-secondary)]",
            })}
          >
            {t("handoff.openDocument")}
          </Link>
        ) : mentionDocumentHref ? (
          <Link
            href={mentionDocumentHref}
            title={t("handoff.openMentionDocumentTip")}
            data-testid="full-detail-a1-open-mention-document"
            className={controlClass({
              shape: "link",
              size: "lg",
              scope: "panel",
              className:
                "touch-hit-expand shrink-0 hover:text-[color:var(--topology-v2-panel-text-secondary)]",
            })}
          >
            {t("handoff.openMentionDocument")}
          </Link>
        ) : null}
        <Link
          href={buildTopologyMeaningEditorNodeHref(node.id)}
          data-testid="full-detail-a1-open-studio"
          className={controlClass({
            shape: "link",
            size: "lg",
            scope: "panel",
            className:
              "touch-hit-expand shrink-0 hover:text-[color:var(--topology-v2-panel-text-secondary)]",
          })}
        >
          {t("handoff.openStudio")}
        </Link>
      </section>

      <section data-fulldetail-body className="mt-6.5">
        {explanationEdit ? (
          <NodeExplanationEdit
            value={bodyMarkdown ?? ""}
            onSave={explanationEdit.onSave}
            labels={explanationEditLabels}
          />
        ) : (
          <>
            <h2 className="mb-2 text-body font-[var(--font-weight-signature)] text-[color:var(--topology-v2-panel-text-primary)]">
              {t("body.title")}
            </h2>
            {bodyMarkdown && bodyMarkdown.trim().length > 0 ? (
              <div className="prose prose-invert max-w-none text-body-lg leading-prose text-[color:var(--topology-v2-panel-text-secondary)]">
                <ReactMarkdown>{bodyMarkdown}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-body text-[color:var(--topology-v2-panel-text-tertiary)]">
                {t("body.empty")}
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/**
 * One "코드 위치" row for the full-detail surface — same shape as the
 * topology datasheet's `CodeLocationRow` (truncated-middle mono path + a
 * per-row copy button with its own `useCopyFeedback` state), duplicated here
 * rather than shared across widgets: FSD forbids widget→widget imports, and
 * promoting a two-line JSX row to `shared/ui` for one reuse wasn't worth a
 * new cross-widget dependency.
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
        className="min-w-0 flex-1 truncate font-mono text-label text-[color:var(--topology-v2-panel-text-tertiary)]"
      >
        {truncateMiddlePath(path)}
      </span>
      <button
        type="button"
        onClick={() => void copy(path)}
        aria-label={state === "copied" ? copiedLabel : copyLabel}
        title={state === "copied" ? copiedLabel : copyLabel}
        data-testid="full-detail-a1-code-location-copy"
        /* The ink comes from `tone: 'muted'` (#82828a — after the 2026-08-03 quaternary
           convergence the global value is the panel value, with no panel remapping).
           The box is the square ramp's `sm` (24px) rather than `p-1` (20px) — this row
           is already `min-h-[32px]`, so growing it does not push the row height. */
        className={controlClass({
          shape: "icon",
          size: "sm",
          tone: "muted",
          scope: "panel",
          className:
            "shrink-0 hover:bg-[color:var(--topology-v2-panel-row-hover)] hover:text-[color:var(--topology-v2-panel-text-secondary)]",
        })}
      >
        {state === "copied" ? <Check size={ICON_SIZE.sm} aria-hidden /> : <Clipboard size={ICON_SIZE.sm} aria-hidden />}
      </button>
    </li>
  );
}
