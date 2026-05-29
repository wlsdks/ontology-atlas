import { Bot, GitBranch, Network, ShieldCheck } from "lucide-react";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  buildAgentReadinessCliCommands,
  buildAgentReadinessPrompt,
  buildAgentReadinessSummary,
  formatAgentPostChangeSyncPacket,
} from "@/shared/lib/ontology-tree";
import { CopyAgentTextButton } from "./CopyAgentTextButton";

/**
 * agent readiness 패널 — readiness 점수/상태 배지, 핵심 지표(개념/관계/blocker/
 * 평균 degree), 다음 행동 목록, readiness/post-change-sync 프롬프트 복사,
 * 터미널(CLI) fallback. OntologyInsightsPage 모놀리스에서 분리(계산된 summary
 * 와 지표를 props 로 주입받는 표시 컴포넌트).
 */
export function AgentReadinessPanel({
  summary,
  status,
  score,
  meaningfulNodes,
  relationCount,
  orphanCount,
  unknownNodes,
  hubCount,
  averageDegree,
  actionKeys,
}: {
  summary: ReturnType<typeof buildAgentReadinessSummary>;
  status: "ready" | "needs-links" | "needs-shape";
  score: number;
  meaningfulNodes: number;
  relationCount: number;
  orphanCount: number;
  unknownNodes: number;
  hubCount: number;
  averageDegree: number;
  actionKeys: Array<
    | "resolveUnknown"
    | "addConcepts"
    | "linkOrphans"
    | "addRelations"
    | "inspectHubs"
    | "syncAfterChanges"
  >;
}) {
  const t = useTranslations("ontologyPages.insights");
  const readinessPrompt = useMemo(() => buildAgentReadinessPrompt(summary), [summary]);
  const postChangeSyncPrompt = useMemo(() => formatAgentPostChangeSyncPacket(), []);
  const readinessCliCommands = useMemo(() => buildAgentReadinessCliCommands(summary), [summary]);
  const readinessCliPrompt = useMemo(
    () => readinessCliCommands.map((item, index) => `${index + 1}. ${item.command}`).join("\n"),
    [readinessCliCommands],
  );
  const statusLabel =
    status === "ready"
      ? t("agentStatusReady")
      : status === "needs-links"
        ? t("agentStatusNeedsLinks")
        : t("agentStatusNeedsShape");
  const statusTone =
    status === "ready"
      ? "border-[color:rgba(94,106,210,0.34)] bg-[color:rgba(94,106,210,0.10)] text-[color:var(--color-indigo-accent)]"
      : status === "needs-links"
        ? "border-[color:rgba(255,179,71,0.34)] bg-[color:rgba(255,179,71,0.08)] text-[color:rgba(238,198,128,0.95)]"
        : "border-[color:rgba(229,72,77,0.30)] bg-[color:rgba(229,72,77,0.08)] text-[color:rgba(248,160,160,0.95)]";
  const showPostChangeSyncGate = actionKeys.includes("syncAfterChanges");

  const metrics = [
    {
      key: "concepts",
      icon: Network,
      label: t("agentMetricConcepts"),
      value: meaningfulNodes,
    },
    {
      key: "relations",
      icon: GitBranch,
      label: t("agentMetricRelations"),
      value: relationCount,
    },
    {
      key: "blockers",
      icon: ShieldCheck,
      label: t("agentMetricBlockers"),
      value: orphanCount + unknownNodes,
    },
    {
      key: "degree",
      icon: Bot,
      label: t("agentMetricAvgDegree"),
      value: averageDegree.toFixed(1),
    },
  ];

  return (
    <section
      className="md:col-span-2 rounded-2xl border border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.055)] px-5 py-4"
      data-testid="insights-agent-readiness"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {t("agentPanelTitle")}
            </p>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${statusTone}`}>
              {statusLabel}
            </span>
          </div>
          <p className="mt-2 max-w-3xl break-keep text-sm leading-6 text-[color:var(--color-text-secondary)]">
            {t("agentPanelSubtitle", {
              score,
              hubs: hubCount,
              orphans: orphanCount,
              unknown: unknownNodes,
            })}
          </p>
        </div>
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-[color:rgba(139,151,255,0.24)] bg-[color:rgba(10,12,24,0.38)] font-mono text-lg tabular-nums text-[color:var(--color-text-primary)]">
          {score}
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {metrics.map(({ key, icon: Icon, label, value }) => (
          <div
            key={key}
            className="rounded-lg border border-[color:var(--color-border-soft)] bg-[color:rgba(255,255,255,0.035)] px-3 py-2"
          >
            <dt className="flex items-center gap-1.5 text-[11px] text-[color:var(--color-text-tertiary)]">
              <Icon size={12} aria-hidden />
              {label}
            </dt>
            <dd className="mt-1 font-mono text-sm tabular-nums text-[color:var(--color-text-primary)]">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 rounded-lg border border-[color:rgba(139,151,255,0.16)] bg-[color:rgba(10,12,24,0.24)] px-3 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {t("agentNextActionsTitle")}
          </p>
          <div className="flex flex-wrap gap-2">
            {showPostChangeSyncGate ? (
              <CopyAgentTextButton
                label={t("agentCopyPostChangeSyncGate")}
                copiedLabel={t("agentCopied")}
                text={postChangeSyncPrompt}
                compact
              />
            ) : null}
            <CopyAgentTextButton
              label={t("agentCopyReadinessPrompt")}
              copiedLabel={t("agentCopied")}
              text={readinessPrompt}
              compact
            />
          </div>
        </div>
        <ul className="mt-2 grid gap-2 md:grid-cols-2" data-testid="insights-agent-next-actions">
          {actionKeys.map((key) => (
            <li
              key={key}
              className="rounded-md border border-[color:var(--color-border-soft)] bg-[color:rgba(255,255,255,0.035)] px-2.5 py-2 text-[12px] leading-5 text-[color:var(--color-text-secondary)]"
            >
              {t(`agentNextAction.${key}`)}
            </li>
          ))}
        </ul>
      </div>
      <div
        className="mt-3 rounded-lg border border-[color:rgba(73,190,146,0.18)] bg-[color:rgba(73,190,146,0.045)] px-3 py-3"
        data-testid="insights-agent-readiness-cli"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:rgba(151,230,198,0.92)]">
              {t("agentTerminalFallbackTitle")}
            </p>
            <p className="mt-1 break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
              {t("agentTerminalFallbackSubtitle")}
            </p>
          </div>
          <CopyAgentTextButton
            label={t("agentCopyTerminalFallback")}
            copiedLabel={t("agentCopied")}
            text={readinessCliPrompt}
            compact
          />
        </div>
        <ol className="mt-2 grid gap-1.5 md:grid-cols-2">
          {readinessCliCommands.slice(0, 8).map((item, index) => (
            <li
              key={item.key}
              className="min-w-0 rounded-md border border-[color:rgba(73,190,146,0.14)] bg-[color:rgba(3,7,18,0.16)] px-2 py-1.5"
            >
              <code className="block overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                {index + 1}. {item.command}
              </code>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
