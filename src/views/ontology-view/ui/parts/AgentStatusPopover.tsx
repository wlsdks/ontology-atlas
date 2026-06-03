"use client";

import { Bot, Check, Clipboard, Terminal, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  AGENT_GRAPH_DB_CLI_SELF_CHECK_COMMAND,
  AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT,
  AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND,
  type AgentBriefingPacket,
} from "@/shared/lib/ontology-tree";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";

export function AgentStatusPopover({
  packet,
  onCopyBriefing,
}: {
  packet: AgentBriefingPacket;
  onCopyBriefing: () => void;
}) {
  const t = useTranslations("ontologyView.agentStatus");
  const { state: copyState, copy } = useCopyFeedback();
  const readiness = packet.readiness;
  const blockerCount = readiness.unknownNodes + readiness.orphanCount;
  const statusLabel = t(`status.${readiness.status}`);
  const setupCommands = [
    AGENT_GRAPH_DB_CLI_SELF_CHECK_COMMAND,
    `${AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND} # ${AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT} graph DB runtime checks`,
  ].join("\n");
  const statusTone =
    readiness.status === "ready"
      ? "border-[color:rgba(73,190,146,0.26)] bg-[color:rgba(73,190,146,0.08)] text-[color:rgba(151,230,198,0.95)]"
      : readiness.status === "needs-links"
        ? "border-[color:rgba(255,179,71,0.30)] bg-[color:rgba(255,179,71,0.07)] text-[color:rgba(238,198,128,0.95)]"
        : "border-[color:rgba(229,72,77,0.28)] bg-[color:rgba(229,72,77,0.07)] text-[color:rgba(248,160,160,0.95)]";

  return (
    <details className="group relative shrink-0">
      <summary
        className="inline-flex h-9 cursor-pointer list-none items-center gap-2 rounded-full border border-[color:rgba(139,151,255,0.28)] bg-[color:rgba(139,151,255,0.08)] px-3 text-xs text-[color:var(--color-indigo-accent)] transition-colors hover:border-[color:rgba(139,151,255,0.44)] hover:bg-[color:rgba(139,151,255,0.13)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset [&::-webkit-details-marker]:hidden"
        data-testid="agent-status-trigger"
        aria-label={t("triggerAria", {
          status: statusLabel,
          score: readiness.score,
        })}
      >
        <Bot size={13} aria-hidden />
        <span className="hidden sm:inline">{t("trigger")}</span>
        <span
          className={`rounded-full border px-1.5 py-0.5 font-mono text-[9px] tabular-nums ${statusTone}`}
        >
          {readiness.score}
        </span>
      </summary>
      <div
        className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-3 text-[12px] shadow-[0_24px_72px_rgba(0,0,0,0.48)]"
        data-testid="agent-status-popover"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {t("eyebrow")}
            </p>
            <h2 className="mt-1 break-keep text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
              {t("title")}
            </h2>
          </div>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${statusTone}`}>
            {statusLabel}
          </span>
        </div>
        <p className="mt-2 break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
          {t("body", {
            relations: readiness.relationCount,
            blockers: blockerCount,
          })}
        </p>
        <dl className="mt-3 grid grid-cols-3 gap-1.5">
          {[
            [t("score"), `${readiness.score}/100`],
            [t("concepts"), String(readiness.meaningfulNodes)],
            [t("entrypoints"), String(packet.entrypoints.length)],
          ].map(([label, value]) => (
            <div
              key={label}
              className="min-w-0 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1.5"
            >
              <dt className="truncate font-mono text-[8px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                {label}
              </dt>
              <dd className="mt-0.5 truncate font-mono text-[11px] tabular-nums text-[color:var(--color-text-primary)]">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 grid gap-1.5">
          <button
            type="button"
            onClick={onCopyBriefing}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[color:rgba(139,151,255,0.28)] bg-[color:rgba(139,151,255,0.08)] px-3 font-mono text-[10px] text-[color:var(--color-indigo-accent)] transition-colors hover:border-[color:rgba(139,151,255,0.44)] hover:bg-[color:rgba(139,151,255,0.13)]"
          >
            <Clipboard size={12} aria-hidden />
            {t("copyBriefing")}
          </button>
          <button
            type="button"
            onClick={() => void copy(setupCommands)}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 font-mono text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
          >
            {copyState === "copied" ? <Check size={12} aria-hidden /> : <Terminal size={12} aria-hidden />}
            {copyState === "copied" ? t("copied") : t("copySetup")}
          </button>
          <Link
            href="/ontology/insights/"
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 font-mono text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
          >
            <ShieldCheck size={12} aria-hidden />
            {t("openInsights")}
          </Link>
        </div>
        <p className="mt-3 break-keep text-[11px] leading-5 text-[color:var(--color-text-quaternary)]">
          {t("footnote")}
        </p>
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {copyState === "copied" ? t("copied") : ""}
        </span>
      </div>
    </details>
  );
}
