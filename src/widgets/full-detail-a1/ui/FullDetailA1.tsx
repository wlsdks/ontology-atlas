"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link2, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import ReactMarkdown from "react-markdown";
import { buildOntologyNodeHref } from "@/entities/knowledge-graph";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { useToast } from "@/shared/ui";
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
 * The A1 "데이터시트 확장판" full-detail surface — owner-approved mockup
 * `docs/prototypes/detail-a1-datasheet.html`. Replaces BOTH rejected
 * surfaces (`TopologyOntologyDrawer`'s badge-soup FROM THIS/CONTAINS rows +
 * rich collaborator brief, and `OntologyViewPage`'s `NodeDetailPanel`
 * query-builder reach explorer + Meaning/Connections/checks sidebar) with a
 * single flat page: header → ONE engraved metric strip → four full
 * direction groups → reach sentence instrument → agent handoff row → body.
 *
 * Shared between two entry points: the topology datasheet's "전체 상세 →"
 * opt-in (`HomePage.tsx`) and the `/ontology` page's node detail
 * (`OntologyViewPage.tsx`) — both feed the SAME `groups`/`reach` facts built
 * by `buildFullDetailGroups`/`buildFullDetailReachModel` (lib/), so the
 * numbers can't drift between entry points.
 */

export interface FullDetailA1Node {
  id: string;
  title: string;
  kind: string;
  /** Vault slug / evidence path shown mono top-right and used in the
   * agent-handoff call chain. */
  slug: string;
  fresh: boolean;
}

export interface FullDetailA1Breadcrumb {
  projectTitle: string | null;
  totalConcepts: number | null;
  totalRelations: number | null;
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
  documentHref?: string | null;
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
  className,
}: FullDetailA1Props) {
  const t = useTranslations("fullDetailA1");
  const getKindLabel = useOntologyKindLabel();
  const { show } = useToast();
  const copyLinkFeedback = useCopyFeedback();
  const copyHandoffFeedback = useCopyFeedback();
  const [step, setStep] = useState<FullDetailReachDepth>(3);

  const handoffChain = useMemo(
    () => formatFullDetailHandoffChain(node.slug, step),
    [node.slug, step],
  );

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
            className="text-[color:var(--topology-v2-panel-text-secondary)] transition-colors hover:text-[color:var(--topology-v2-panel-text-primary)]"
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
          <span className="ml-auto font-mono text-label tracking-[0.08em] text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]">
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
          <h1 className="text-display font-semibold tracking-[-0.015em] text-[color:var(--topology-v2-panel-text-primary)]">
            {node.title}
          </h1>
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
            <span>{node.fresh ? t("freshOn") : t("freshOff")}</span>
          </div>
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
            className="rounded-chip p-1 text-[color:var(--topology-v2-panel-text-tertiary)] transition-colors hover:bg-[color:var(--topology-v2-panel-row-hover)] hover:text-[color:var(--topology-v2-panel-text-secondary)]"
          >
            <Link2 size={14} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            data-testid="full-detail-a1-close"
            className="rounded-chip p-1 text-[color:var(--topology-v2-panel-text-tertiary)] transition-colors hover:bg-[color:var(--topology-v2-panel-row-hover)] hover:text-[color:var(--topology-v2-panel-text-secondary)]"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <div
        data-fulldetail-metric="engraved"
        className="mt-4.5 flex flex-wrap items-baseline gap-x-4.5 gap-y-1 rounded-chip border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-metric-surface)] px-3.5 py-2.5 font-mono text-body tracking-[0.01em] text-[color:var(--topology-v2-panel-metric-text)]"
      >
        {metricLine}
      </div>

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
        <span className="shrink-0 text-body font-medium text-[color:var(--topology-v2-panel-text-primary)]">
          {t("handoff.label")}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-label text-[color:var(--topology-v2-panel-text-tertiary)]">
          {handoffChain}
        </span>
        <button
          type="button"
          onClick={handleCopyHandoff}
          data-testid="full-detail-a1-handoff-copy"
          className="shrink-0 rounded-chip border border-[color:var(--topology-v2-indigo-border)] bg-[color:var(--topology-v2-panel-action-surface)] px-3 py-1.5 text-body font-medium text-[color:var(--topology-v2-indigo-bright)] transition-colors hover:bg-[color:var(--topology-v2-panel-row-hover)] hover:border-[color:var(--topology-v2-indigo)]"
        >
          {t("handoff.copy")}
        </button>
        {documentHref ? (
          <Link
            href={documentHref}
            className="shrink-0 text-body text-[color:var(--topology-v2-panel-text-tertiary)] transition-colors hover:text-[color:var(--topology-v2-panel-text-secondary)]"
          >
            {t("handoff.openDocument")}
          </Link>
        ) : null}
        <Link
          href={`/ontology/edit?node=${encodeURIComponent(node.slug)}`}
          data-testid="full-detail-a1-open-builder"
          className="shrink-0 text-body text-[color:var(--topology-v2-panel-text-tertiary)] transition-colors hover:text-[color:var(--topology-v2-panel-text-secondary)]"
        >
          {t("handoff.openBuilder")}
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
            <h2 className="mb-2 text-body font-medium text-[color:var(--topology-v2-panel-text-primary)]">
              {t("body.title")}
            </h2>
            {bodyMarkdown && bodyMarkdown.trim().length > 0 ? (
              <div className="prose prose-invert max-w-none text-body-lg leading-[1.7] text-[color:var(--topology-v2-panel-text-secondary)]">
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
