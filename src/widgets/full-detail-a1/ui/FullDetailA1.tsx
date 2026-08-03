"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Clipboard, Link2, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import ReactMarkdown from "react-markdown";
import {
  buildOntologyNodeHref,
  buildOntologyStudioNodeHrefFromGraphId,
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
 * The A1 "데이터시트 확장판" full-detail surface — owner-approved mockup
 * `docs/prototypes/detail-a1-datasheet.html`. Replaces BOTH rejected
 * surfaces (`TopologyOntologyDrawer`'s badge-soup FROM THIS/CONTAINS rows +
 * rich collaborator brief, and `OntologyViewPage`'s `NodeDetailPanel`
 * query-builder reach explorer + Meaning/Connections/checks sidebar) with a
 * single flat page: header → ONE engraved metric strip → four full
 * direction groups → reach sentence instrument → agent handoff row → body.
 *
 * Shared between two entry points: the topology datasheet's "전체 상세"
 * opt-in (`HomePage.tsx`) and the `/ontology` page's node detail
 * (`OntologyViewPage.tsx`) — both feed the SAME `groups`/`reach` facts built
 * by `buildFullDetailGroups`/`buildFullDetailReachModel` (lib/), so the
 * numbers can't drift between entry points.
 */

export interface FullDetailA1Node {
  id: string;
  /** 과제 ⑩ — 표시용 짧은 제목 (display 필드 우선, 없으면 title 의 괄호
   * 부연 설명 컷). 헤더 h1 은 이것을 크게 그린다. */
  title: string;
  /** 원본 vault title 전체 — `title` 과 다를 때만 h1 아래 secondary 텍스트로
   * 보존한다(정보 은닉이 아니라 계층화). 같으면 렌더 생략. */
  fullTitle?: string;
  kind: string;
  /** Vault slug / evidence path shown mono top-right. */
  slug: string;
  /**
   * 에이전트에게 건네는 이름 — 볼트 뿌리 기준 문서 slug, 또는 문서가 없는
   * 개념이면 볼트가 적어 둔 참조 원문(`resolveNodeAgentTarget`). 인계 체인은
   * `slug` 가 아니라 이 값을 쓴다: 화면이 쥔 매니페스트 slug 를 그대로
   * 넘기면 에이전트 볼트에 없는 이름이 된다. 미지정이면 `slug` 로 되돌린다.
   */
  agentSlug?: string | null;
  /** 자기 문서가 있는가. 없으면 인계 체인이 문서 신설부터 시작한다. */
  documented?: boolean;
  fresh: boolean;
  /**
   * 진입 검수 E-5 — 같은 노드의 신선도가 한 클릭 거리에서 상반됐다.
   * 데이터시트 패널은 「2일 전 바뀜」(문서 mtime 사다리), 이 화면은
   * 「한동안 그대로」(세션 changeset baseline)였다. `use-node-datasheet-model`
   * 의 M-3 계약이 금지한 바로 그 이원화다 — 신선도의 단일 진실원은 mtime 이다.
   * 호출자가 데이터시트가 쓰는 **그 문장 그대로** 넘긴다. 있으면 이진
   * (최근 갱신/한동안 그대로) 대신 이 문장을 쓴다 — 패널이 같은 자리에서
   * 하는 것과 동일한 우선순위.
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
  /** **이 노드 자신의** 문서. 자기 `.md` 가 없으면 null/omit. */
  documentHref?: string | null;
  /**
   * 자기 문서가 없을 때, 이 노드를 적어 둔 다른 문서. 이 표면에는 `근거`
   * 목록이 없어 링크를 지우면 "어디에 적혀 있나" 를 잃으므로, 목적지를
   * 말하는 라벨로 바꿔 남긴다.
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
  // rank7 (design-council B5) — DocFrontmatterBlock/TopologyV2DetailPanel 과
  // 같은 `editProvenance` 네임스페이스(단일 출처, drift 방지).
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
              inline: true,
              className: "hover:text-[color:var(--topology-v2-panel-text-primary)]",
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
          {/* 과제 ⑩ — 표시명이 원본 title 을 축약한 경우, 전체 title 을
              secondary 텍스트로 보존한다(정보 은닉이 아니라 계층화). 같으면
              생략(중복 렌더 방지). */}
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
            <Link2 size={14} />
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
            <p className="text-label font-medium uppercase tracking-[0.08em] text-[color:var(--topology-v2-panel-text-quaternary)]">
              {projectSourceLabels.heading}
              {projectSourceLabels.sourceKind ? (
                <span className="ml-2 font-mono normal-case tracking-normal">
                  {projectSourceLabels.sourceKind}
                </span>
              ) : null}
            </p>
            <p className="mt-1 text-body-lg font-medium text-[color:var(--topology-v2-panel-text-primary)]">
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
              className="justify-self-start rounded-chip border border-[color:var(--topology-v2-indigo-border)] bg-[color:var(--topology-v2-panel-action-surface)] px-3 py-1.5 text-body font-medium text-[color:var(--topology-v2-indigo-bright)] transition-colors hover:border-[color:var(--topology-v2-indigo)] hover:bg-[color:var(--topology-v2-panel-row-hover)] disabled:cursor-wait disabled:opacity-60 sm:justify-self-end"
            >
              {projectSourceBusy ? projectSourceLabels.busy : projectSourceLabels.action}
            </button>
          ) : (
            <span className="justify-self-start text-body font-medium text-[color:var(--topology-v2-indigo-bright)] sm:justify-self-end">
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
          <span className="text-body font-medium text-[color:var(--topology-v2-panel-text-primary)]">
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
        ) : mentionDocumentHref ? (
          <Link
            href={mentionDocumentHref}
            title={t("handoff.openMentionDocumentTip")}
            data-testid="full-detail-a1-open-mention-document"
            className="shrink-0 text-body text-[color:var(--topology-v2-panel-text-tertiary)] transition-colors hover:text-[color:var(--topology-v2-panel-text-secondary)]"
          >
            {t("handoff.openMentionDocument")}
          </Link>
        ) : null}
        <Link
          href={buildOntologyStudioNodeHrefFromGraphId(node.id)}
          data-testid="full-detail-a1-open-studio"
          className="shrink-0 text-body text-[color:var(--topology-v2-panel-text-tertiary)] transition-colors hover:text-[color:var(--topology-v2-panel-text-secondary)]"
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
            <h2 className="mb-2 text-body font-medium text-[color:var(--topology-v2-panel-text-primary)]">
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
        className="shrink-0 rounded-chip p-1 text-[color:var(--topology-v2-panel-text-quaternary)] transition-colors hover:bg-[color:var(--topology-v2-panel-row-hover)] hover:text-[color:var(--topology-v2-panel-text-secondary)]"
      >
        {state === "copied" ? <Check size={12} aria-hidden /> : <Clipboard size={12} aria-hidden />}
      </button>
    </li>
  );
}
