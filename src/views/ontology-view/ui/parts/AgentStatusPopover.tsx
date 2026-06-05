"use client";

import { Bot, Check, Clipboard, Database, ShieldCheck, Terminal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
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
  onCopyBriefing: () => Promise<boolean>;
}) {
  const t = useTranslations("ontologyView.agentStatus");
  const { state: copyState, copy } = useCopyFeedback();
  const [handoffFeedback, setHandoffFeedback] = useState<
    "briefing" | "gate" | "failed" | null
  >(null);
  const handoffFeedbackTimer = useRef<number | null>(null);
  const readiness = packet.readiness;
  const blockerCount = readiness.unknownNodes + readiness.orphanCount;
  const statusLabel = t(`status.${readiness.status}`);
  const graphGateCommands = [
    AGENT_GRAPH_DB_CLI_SELF_CHECK_COMMAND,
    `${AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND} # ${AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT} graph DB runtime checks`,
  ].join("\n");
  const statusTone =
    readiness.status === "ready"
      ? "border-[color:rgba(73,190,146,0.26)] bg-[color:rgba(73,190,146,0.08)] text-[color:rgba(151,230,198,0.95)]"
      : readiness.status === "needs-links"
        ? "border-[color:rgba(255,179,71,0.30)] bg-[color:rgba(255,179,71,0.07)] text-[color:rgba(238,198,128,0.95)]"
        : "border-[color:rgba(229,72,77,0.28)] bg-[color:rgba(229,72,77,0.07)] text-[color:rgba(248,160,160,0.95)]";
  const setFeedback = (next: typeof handoffFeedback) => {
    if (handoffFeedbackTimer.current !== null) {
      window.clearTimeout(handoffFeedbackTimer.current);
    }
    setHandoffFeedback(next);
    handoffFeedbackTimer.current = window.setTimeout(
      () => setHandoffFeedback(null),
      2600,
    );
  };
  const handleCopyBriefing = async () => {
    setFeedback((await onCopyBriefing()) ? "briefing" : "failed");
  };
  const handleCopyGraphGate = async () => {
    setFeedback((await copy(graphGateCommands)) ? "gate" : "failed");
  };

  useEffect(() => {
    return () => {
      if (handoffFeedbackTimer.current !== null) {
        window.clearTimeout(handoffFeedbackTimer.current);
      }
    };
  }, []);

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
        <span>{t("trigger")}</span>
        <span
          className={`rounded-full border px-1.5 py-0.5 font-mono text-[9px] tabular-nums ${statusTone}`}
        >
          {readiness.score}
        </span>
      </summary>
      <div
        className="fixed left-3 right-3 top-28 z-30 max-h-[calc(100vh-8rem)] overflow-y-auto rounded-xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-3 text-[12px] shadow-[0_24px_72px_rgba(0,0,0,0.48)] transition duration-150 group-open:translate-y-0 group-open:opacity-100 sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:max-h-none sm:w-[min(24rem,calc(100vw-2rem))] sm:overflow-visible"
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
        <div className="mt-2 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1.5">
          <p className="font-mono text-[8px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
            {t("connectionModeLabel")}
          </p>
          <p className="mt-0.5 break-keep text-[11px] leading-4 text-[color:var(--color-text-secondary)]">
            {t("connectionMode")}
          </p>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2" data-testid="agent-setup-lanes">
            {[
              {
                title: t("setupClaudeTitle"),
                body: t("setupClaudeBody"),
                meta: t("setupClaudeMeta"),
                icon: Bot,
              },
              {
                title: t("setupCodexTitle"),
                body: t("setupCodexBody"),
                meta: t("setupCodexMeta"),
                icon: Terminal,
              },
            ].map((lane) => {
              const Icon = lane.icon;
              return (
                <div
                  key={lane.title}
                  className="min-w-0 rounded-md border border-[color:var(--color-border-soft)] bg-[color:rgba(0,0,0,0.12)] p-2"
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Icon
                      size={12}
                      aria-hidden
                      className="shrink-0 text-[color:var(--color-indigo-accent)]"
                    />
                    <p className="truncate font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-primary)]">
                      {lane.title}
                    </p>
                  </div>
                  <p className="mt-1 break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                    {lane.body}
                  </p>
                  <p className="mt-1 truncate font-mono text-[8.5px] text-[color:var(--color-text-quaternary)]">
                    {lane.meta}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
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
        <div className="mt-3 rounded-lg border border-[color:rgba(139,151,255,0.22)] bg-[color:rgba(139,151,255,0.06)] p-2">
          <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            {t("railLabel")}
          </p>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
            <div className="flex items-start gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-2 sm:flex-col sm:gap-1.5">
              <Database
                size={13}
                aria-hidden
                className="mt-0.5 shrink-0 text-[color:var(--color-indigo-accent)]"
              />
              <div className="min-w-0">
                <p className="font-mono text-[10px] text-[color:var(--color-text-primary)]">
                  {t("graphDbPackTitle")}
                </p>
                <p className="mt-0.5 break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)] sm:text-[9px] sm:leading-3.5">
                  {t("graphDbPackBody")}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-2 sm:flex-col sm:gap-1.5">
              <ShieldCheck
                size={13}
                aria-hidden
                className="mt-0.5 shrink-0 text-[color:rgba(151,230,198,0.95)]"
              />
              <div className="min-w-0">
                <p className="font-mono text-[10px] text-[color:var(--color-text-primary)]">
                  {t("runtimeGateTitle")}
                </p>
                <p className="mt-0.5 break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)] sm:text-[9px] sm:leading-3.5">
                  {t("runtimeGateBody", {
                    checks: AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT,
                  })}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-2 sm:flex-col sm:gap-1.5">
              <Bot
                size={13}
                aria-hidden
                className="mt-0.5 shrink-0 text-[color:var(--color-indigo-accent)]"
              />
              <div className="min-w-0">
                <p className="font-mono text-[10px] text-[color:var(--color-text-primary)]">
                  {t("agentHandoffTitle")}
                </p>
                <p className="mt-0.5 break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)] sm:text-[9px] sm:leading-3.5">
                  {t("agentHandoffBody")}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-3 grid gap-1.5">
          <button
            type="button"
            onClick={() => void handleCopyBriefing()}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[color:rgba(139,151,255,0.28)] bg-[color:rgba(139,151,255,0.08)] px-3 font-mono text-[10px] text-[color:var(--color-indigo-accent)] transition-colors hover:border-[color:rgba(139,151,255,0.44)] hover:bg-[color:rgba(139,151,255,0.13)]"
          >
            {handoffFeedback === "briefing" ? (
              <Check size={12} aria-hidden />
            ) : (
              <Clipboard size={12} aria-hidden />
            )}
            {handoffFeedback === "briefing" ? t("copied") : t("copyBriefing")}
          </button>
          <button
            type="button"
            onClick={() => void handleCopyGraphGate()}
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
        {handoffFeedback ? (
          <div
            className={`mt-2 rounded-lg border px-2.5 py-2 text-[11px] leading-4 ${
              handoffFeedback === "failed"
                ? "border-[color:rgba(229,72,77,0.28)] bg-[color:rgba(229,72,77,0.07)] text-[color:rgba(248,160,160,0.95)]"
                : "border-[color:rgba(73,190,146,0.24)] bg-[color:rgba(73,190,146,0.08)] text-[color:rgba(190,245,222,0.96)]"
            }`}
            data-testid="agent-copy-feedback"
            role="status"
            aria-live="polite"
          >
            <p className="font-[var(--font-weight-signature)]">
              {handoffFeedback === "briefing"
                ? t("briefingCopiedTitle")
                : handoffFeedback === "gate"
                  ? t("gateCopiedTitle")
                  : t("copyFailedTitle")}
            </p>
            <p className="mt-0.5 text-[10px] text-[color:rgba(190,245,222,0.70)]">
              {handoffFeedback === "briefing"
                ? t("briefingCopiedBody")
                : handoffFeedback === "gate"
                  ? t("gateCopiedBody")
                  : t("copyFailedBody")}
            </p>
          </div>
        ) : null}
        <p className="sr-only">
          {t("footnote")}
        </p>
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {copyState === "copied" ? t("copied") : ""}
        </span>
      </div>
    </details>
  );
}
