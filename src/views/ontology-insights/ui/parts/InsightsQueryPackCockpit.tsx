import { Check, GitBranch, Network, Route, SearchCheck, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  AGENT_GRAPH_DB_CLI_SELF_CHECK_COMMAND,
  AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT,
  AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND,
  buildAgentGraphDbQueryPack,
  buildAgentReadinessSummary,
  countAgentGraphDbCliPackCommands,
  formatAgentGraphDbCliPack,
  formatAgentGraphDbQueryPack,
  formatAgentQueryCallCliCommand,
} from "@/shared/lib/ontology-tree";
import { CopyAgentTextButton } from "./CopyAgentTextButton";

/**
 * 인사이트 페이지의 graph DB 쿼리팩 cockpit — readiness/pack/MCP/CLI 카운트,
 * 라이브 그래프 증거, 4-스텝 evidence 레인, run order, 대표 intent, 셋업/런타임
 * 게이트. OntologyInsightsPage 모놀리스에서 분리(props 로 graphDbQueryPack /
 * readiness 주입받는 순수 표시 컴포넌트).
 */
export function InsightsQueryPackCockpit({
  graphDbQueryPack,
  readiness,
}: {
  graphDbQueryPack: ReturnType<typeof buildAgentGraphDbQueryPack>;
  readiness: ReturnType<typeof buildAgentReadinessSummary> | null;
}) {
  const t = useTranslations("ontologyPages.insights");
  const mcpCount = graphDbQueryPack.reduce((count, item) => count + item.payloads.length, 0);
  const cliCount =
    graphDbQueryPack.length > 0 ? countAgentGraphDbCliPackCommands(graphDbQueryPack) : 0;
  const visibleIntents = graphDbQueryPack.slice(0, 3).map((item) => ({
    ...item,
    primaryOperation: item.payloads[0]?.operation.replace("query_ontology.", "") ?? "query_ontology",
    cliFallbackCount: item.payloads
      .map(formatAgentQueryCallCliCommand)
      .filter((command): command is string => command !== null).length,
  }));
  const selfCheckFields = [
    "ok",
    "performanceOk",
    "failed",
    "commands[].timedOut",
    "health.status",
    "focused_blast_radius",
    "relation_name_parity",
    "pattern_walk/project_map",
    "health.checks[].status",
  ];

  return (
    <section
      aria-label={t("queryCockpitAriaLabel")}
      className="md:col-span-2 rounded-2xl border border-[color:rgba(139,151,255,0.22)] bg-[color:rgba(139,151,255,0.055)] px-4 py-4"
      data-testid="insights-query-cockpit"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {t("queryCockpitEyebrow")}
          </p>
          <h2 className="mt-1 break-keep text-base font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {t("queryCockpitTitle")}
          </h2>
          <p className="mt-1 max-w-2xl break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
            {t("queryCockpitBody")}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          <CopyAgentTextButton
            label={t("agentCopyGraphDbCliPack")}
            copiedLabel={t("agentCopied")}
            text={formatAgentGraphDbCliPack(graphDbQueryPack)}
            compact
          />
          <CopyAgentTextButton
            label={t("agentCopyGraphDbPack")}
            copiedLabel={t("agentCopied")}
            text={formatAgentGraphDbQueryPack(graphDbQueryPack)}
            compact
          />
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
        {[
          {
            key: "readiness",
            label: t("queryCockpitReadiness"),
            value: readiness ? t("queryCockpitReadinessValue", { score: readiness.score }) : "—",
          },
          {
            key: "pack",
            label: t("queryCockpitPack"),
            value: t("queryCockpitPackValue", { count: graphDbQueryPack.length }),
          },
          {
            key: "mcp",
            label: t("queryCockpitMcp"),
            value: t("queryCockpitMcpValue", { count: mcpCount }),
          },
          {
            key: "cli",
            label: t("queryCockpitCli"),
            value: t("queryCockpitCliValue", { count: cliCount }),
          },
          {
            key: "runtime",
            label: t("queryCockpitRuntime"),
            value: t("queryCockpitRuntimeValue", {
              count: AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT,
            }),
          },
        ].map((item) => (
          <div
            key={item.key}
            className="min-w-0 rounded-lg border border-[color:rgba(139,151,255,0.16)] bg-[color:rgba(0,0,0,0.16)] px-3 py-2"
          >
            <dt className="truncate font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
              {item.label}
            </dt>
            <dd className="mt-1 truncate font-mono text-[12px] tabular-nums text-[color:var(--color-text-primary)]">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
      {readiness ? (
        <div
          aria-label={t("queryCockpitLiveProofAriaLabel")}
          className="mt-3 grid gap-2 lg:grid-cols-3"
        >
          {[
            {
              key: "graph",
              icon: GitBranch,
              label: t("queryCockpitLiveGraphLabel"),
              value: t("queryCockpitLiveGraphValue", {
                concepts: readiness.meaningfulNodes,
                relations: readiness.relationCount,
              }),
              body: t("queryCockpitLiveGraphBody"),
            },
            {
              key: "health",
              icon: ShieldCheck,
              label: t("queryCockpitLiveHealthLabel"),
              value: t("queryCockpitLiveHealthValue", {
                blockers: readiness.unknownNodes + readiness.orphanCount,
              }),
              body: t("queryCockpitLiveHealthBody", {
                unknown: readiness.unknownNodes,
                orphans: readiness.orphanCount,
              }),
            },
            {
              key: "traversal",
              icon: Route,
              label: t("queryCockpitLiveTraversalLabel"),
              value: t("queryCockpitLiveTraversalValue", {
                hubs: readiness.hubCount,
                averageDegree: readiness.averageDegree.toFixed(1),
              }),
              body: t("queryCockpitLiveTraversalBody"),
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.key}
                className="min-w-0 rounded-lg border border-[color:rgba(139,151,255,0.16)] bg-[color:rgba(0,0,0,0.14)] px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[color:rgba(94,106,210,0.22)] bg-[color:rgba(94,106,210,0.07)] text-[color:var(--color-indigo-accent)]">
                    <Icon size={13} aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                      {item.label}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[11px] tabular-nums text-[color:var(--color-text-primary)]">
                      {item.value}
                    </p>
                  </div>
                </div>
                <p className="mt-1.5 break-keep text-[10.5px] leading-4 text-[color:var(--color-text-tertiary)]">
                  {item.body}
                </p>
              </div>
            );
          })}
        </div>
      ) : null}
      <div
        aria-label={t("queryCockpitEvidenceAriaLabel")}
        className="mt-3 grid gap-2 lg:grid-cols-4"
      >
        {[
          {
            step: "01",
            icon: SearchCheck,
            label: t("queryCockpitEvidencePlanLabel"),
            body: t("queryCockpitEvidencePlanBody"),
            className:
              "border-dashed border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]",
            labelClassName: "text-[color:var(--color-text-quaternary)]",
          },
          {
            step: "02",
            icon: Network,
            label: t("queryCockpitEvidenceScanLabel"),
            body: t("queryCockpitEvidenceScanBody"),
            className:
              "border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]",
            labelClassName: "text-[color:var(--color-text-quaternary)]",
          },
          {
            step: "03",
            icon: GitBranch,
            label: t("queryCockpitEvidenceFollowUpLabel"),
            body: t("queryCockpitEvidenceFollowUpBody"),
            className:
              "border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]",
            labelClassName: "text-[color:var(--color-text-quaternary)]",
          },
          {
            step: "04",
            icon: Check,
            label: t("queryCockpitEvidenceProofLabel"),
            body: t("queryCockpitEvidenceProofBody"),
            className:
              "border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.055)]",
            labelClassName: "text-[color:var(--color-indigo-accent)]",
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className={`min-w-0 rounded-lg border px-3 py-2 ${item.className}`}
            >
              <div className="flex min-w-0 items-start gap-2">
                <span className="flex h-8 w-8 shrink-0 flex-col items-center justify-center rounded-md border border-[color:rgba(139,151,255,0.14)] bg-[color:rgba(0,0,0,0.14)]">
                  <span className="font-mono text-[9px] leading-none tabular-nums text-[color:var(--color-text-quaternary)]">
                    {item.step}
                  </span>
                  <Icon size={10} className="mt-0.5 text-[color:var(--color-indigo-accent)]" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p
                    className={`truncate font-mono text-[9px] uppercase tracking-[0.10em] ${item.labelClassName}`}
                  >
                    {item.label}
                  </p>
                  <p className="mt-1 break-keep text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
                    {item.body}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 rounded-lg border border-[color:rgba(139,151,255,0.14)] bg-[color:rgba(0,0,0,0.12)] px-3 py-2">
        <p className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
          {t("queryCockpitRunOrder")}
        </p>
        <ol className="mt-2 flex flex-wrap gap-1.5">
          <li className="rounded-full border border-dashed border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.055)] px-2 py-1 font-mono text-[10px] text-[color:var(--color-text-secondary)]">
            0 · {t("queryCockpitGate")}
          </li>
          {graphDbQueryPack.map((item, index) => (
            <li
              key={item.id}
              className="rounded-full border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1 font-mono text-[10px] text-[color:var(--color-text-secondary)]"
            >
              {index + 1} · {t(item.titleKey)}
            </li>
          ))}
        </ol>
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-3">
        {visibleIntents.map((item) => (
          <article
            key={item.id}
            className="min-w-0 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-mono text-[10px] text-[color:var(--color-text-secondary)]">
                  {t(item.titleKey)}
                </p>
                <p className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                  {item.intent}
                </p>
              </div>
              <span className="shrink-0 rounded-md border border-[color:rgba(139,151,255,0.16)] bg-[color:rgba(0,0,0,0.16)] px-2 py-1 font-mono text-[9px] text-[color:var(--color-indigo-accent)]">
                {item.primaryOperation}
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-1.5">
              <div className="min-w-0 rounded-md border border-[color:rgba(139,151,255,0.12)] bg-[color:rgba(0,0,0,0.12)] px-2 py-1">
                <dt className="truncate font-mono text-[8px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
                  {t("queryCockpitPayloads")}
                </dt>
                <dd className="mt-0.5 truncate font-mono text-[10px] tabular-nums text-[color:var(--color-text-secondary)]">
                  {t("queryCockpitPayloadsValue", { count: item.payloads.length })}
                </dd>
              </div>
              <div className="min-w-0 rounded-md border border-[color:rgba(139,151,255,0.12)] bg-[color:rgba(0,0,0,0.12)] px-2 py-1">
                <dt className="truncate font-mono text-[8px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
                  {t("queryCockpitCliFallback")}
                </dt>
                <dd className="mt-0.5 truncate font-mono text-[10px] tabular-nums text-[color:var(--color-text-secondary)]">
                  {t("queryCockpitCliFallbackValue", { count: item.cliFallbackCount })}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
      <div
        aria-label={t("queryCockpitContractsAriaLabel")}
        className="mt-3 grid gap-2 md:grid-cols-2"
      >
        {[
          {
            label: t("queryCockpitScanContractLabel"),
            body: t("queryCockpitScanContractBody"),
          },
          {
            label: t("queryCockpitPathContractLabel"),
            body: t("queryCockpitPathContractBody"),
          },
        ].map((item) => (
          <div
            key={item.label}
            className="min-w-0 rounded-md border border-[color:rgba(139,151,255,0.14)] bg-[color:rgba(0,0,0,0.14)] px-3 py-2"
          >
            <p className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
              {item.label}
            </p>
            <p className="mt-1 break-keep text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
              {item.body}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-md border border-[color:rgba(94,106,210,0.20)] bg-[color:rgba(94,106,210,0.055)] px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-indigo-accent)]">
            {t("queryCockpitGate")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <CopyAgentTextButton
              label={t("queryCockpitCopySetupGate")}
              copiedLabel={t("agentCopied")}
              text={AGENT_GRAPH_DB_CLI_SELF_CHECK_COMMAND}
              compact
            />
            <CopyAgentTextButton
              label={t("queryCockpitCopyRuntimeGate")}
              copiedLabel={t("agentCopied")}
              text={AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND}
              compact
            />
          </div>
        </div>
        <div className="mt-1 grid gap-1">
          <code className="block overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] text-[color:var(--color-text-tertiary)]">
            {AGENT_GRAPH_DB_CLI_SELF_CHECK_COMMAND}
          </code>
          <code className="block overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] text-[color:var(--color-text-tertiary)]">
            {AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND}
          </code>
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="space-y-1">
            <p className="break-keep text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
              {t("queryCockpitProofBody")}
            </p>
            <p className="break-keep text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
              {t("queryCockpitRuntimeBody")}
            </p>
          </div>
          <dl className="flex flex-wrap gap-1.5">
            {selfCheckFields.map((field) => (
              <div
                key={field}
                className="rounded-md border border-[color:rgba(94,106,210,0.18)] bg-[color:rgba(0,0,0,0.12)] px-2 py-1"
              >
                <dt className="sr-only">{t("queryCockpitProofField")}</dt>
                <dd className="font-mono text-[10px] text-[color:var(--color-text-secondary)]">
                  {field}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
