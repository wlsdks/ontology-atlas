"use client";

import {
  Bot,
  Check,
  Clipboard,
  Cog,
  Database,
  RotateCw,
  ShieldCheck,
  Terminal,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { buildDocsVaultHref } from "@/entities/docs-vault";
import { Link } from "@/i18n/navigation";
import {
  AGENT_GRAPH_DB_CLI_SELF_CHECK_COMMAND,
  AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT,
  AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND,
  AGENT_PRACTITIONER_CONCERNS,
  type AgentBriefingPacket,
  type AgentPractitionerConcernId,
  formatAgentPractitionerConcernsChecklist,
} from "@/shared/lib/ontology-tree";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";

const CONCERN_TRANSLATION_KEYS: Record<
  AgentPractitionerConcernId,
  { title: string; body: string; gate: string }
> = {
  context: {
    title: "concernContextTitle",
    body: "concernContextBody",
    gate: "concernContextGate",
  },
  tools: {
    title: "concernToolsTitle",
    body: "concernToolsBody",
    gate: "concernToolsGate",
  },
  evidence: {
    title: "concernEvidenceTitle",
    body: "concernEvidenceBody",
    gate: "concernEvidenceGate",
  },
  drift: {
    title: "concernDriftTitle",
    body: "concernDriftBody",
    gate: "concernDriftGate",
  },
  workflow: {
    title: "concernWorkflowTitle",
    body: "concernWorkflowBody",
    gate: "concernWorkflowGate",
  },
};

const AGENT_PRACTICE_RESEARCH_DOCS_SLUG = "ontology/documents/agent-practice-research";
type AgentSettingsTab = "connection" | "handoff" | "criteria";
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function getFocusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

function setElementInert(element: Element, inert: boolean) {
  const target = element as HTMLElement & { inert?: boolean };
  if (inert) {
    target.inert = true;
    target.setAttribute("aria-hidden", "true");
  } else {
    target.inert = false;
    target.removeAttribute("aria-hidden");
  }
}

export function AgentStatusPopover({
  packet,
  onCopyBriefing,
}: {
  packet: AgentBriefingPacket;
  onCopyBriefing: () => Promise<boolean>;
}) {
  const t = useTranslations("ontologyView.agentStatus");
  const { state: gateCopyState, copy: copyGate } = useCopyFeedback();
  const { state: mcpCopyState, copy: copyMcp } = useCopyFeedback();
  const { state: concernCopyState, copy: copyConcerns } = useCopyFeedback();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AgentSettingsTab>("connection");
  const [handoffFeedback, setHandoffFeedback] = useState<
    "briefing" | "gate" | "mcp" | "concerns" | "failed" | null
  >(null);
  const handoffFeedbackTimer = useRef<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const readiness = packet.readiness;
  const blockerCount = readiness.unknownNodes + readiness.orphanCount;
  const statusLabel = t(`status.${readiness.status}`);
  const researchHref = buildDocsVaultHref({ slug: AGENT_PRACTICE_RESEARCH_DOCS_SLUG });
  const graphGateCommands = [
    AGENT_GRAPH_DB_CLI_SELF_CHECK_COMMAND,
    `${AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND} # ${AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT} graph DB runtime checks`,
  ].join("\n");
  const mcpFirstCallPacket = [
    "# Context Atlas MCP first calls",
    "Run these after Claude Code or Codex sees the oh-my-ontology MCP server.",
    "",
    "## MCP",
    '1. query_ontology({"operation":"agent_brief"})',
    '2. query_ontology({"operation":"workspace_brief"})',
    '3. query_ontology({"operation":"health"})',
    "",
    "## CLI fallback",
    "1. oh-my-ontology agent-brief [vault] --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4",
    "2. oh-my-ontology workspace-brief [vault]",
    "3. oh-my-ontology health [vault]",
    "",
    "## Stale tool metadata recovery",
    "If a client still describes oh-my-ontology as 23 tools, treat that as stale client metadata.",
    "1. Reload or restart the agent session, or reset/refresh cached MCP tools when the client offers that action.",
    "2. Re-run tools/list and confirm 24 tools including index_project.",
    "3. Re-run pnpm cli:mcp-verify docs/ontology --timeout-ms 15000 from the repo root.",
  ].join("\n");
  const concernItems = AGENT_PRACTITIONER_CONCERNS.map((concern) => {
    const keys = CONCERN_TRANSLATION_KEYS[concern.id];
    return {
      title: t(keys.title),
      body: t(keys.body),
      gate: t(keys.gate),
    };
  });
  const connectionProofItems = [
    {
      title: t("proofConfigTitle"),
      body: t("proofConfigBody"),
      meta: ".mcp.json · .codex/config.toml",
      icon: Cog,
    },
    {
      title: t("proofLiveTitle"),
      body: t("proofLiveBody"),
      meta: "/mcp · codex mcp list · tools/list",
      icon: Terminal,
    },
    {
      title: t("proofReloadTitle"),
      body: t("proofReloadBody"),
      meta: t("proofReloadMeta"),
      icon: RotateCw,
    },
  ];
  const sessionProofChecks = [
    t("sessionProofServerVisible"),
    t("sessionProofToolCount"),
    t("sessionProofFirstCalls"),
  ];
  const staleMetadataChecks = [
    t("staleMetadataClientCache"),
    t("staleMetadataRefresh"),
    t("staleMetadataVerify"),
  ];
  const settingsTabs: Array<{
    id: AgentSettingsTab;
    title: string;
    body: string;
    icon: typeof Cog;
  }> = [
    {
      id: "connection",
      title: t("tabConnection"),
      body: t("tabConnectionBody"),
      icon: ShieldCheck,
    },
    {
      id: "handoff",
      title: t("tabHandoff"),
      body: t("tabHandoffBody"),
      icon: Clipboard,
    },
    {
      id: "criteria",
      title: t("tabCriteria"),
      body: t("tabCriteriaBody"),
      icon: Database,
    },
  ];
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
    setFeedback((await copyGate(graphGateCommands)) ? "gate" : "failed");
  };
  const handleCopyMcpFirstCalls = async () => {
    setFeedback((await copyMcp(mcpFirstCallPacket)) ? "mcp" : "failed");
  };
  const handleCopyConcerns = async () => {
    setFeedback(
      (await copyConcerns(formatAgentPractitionerConcernsChecklist())) ? "concerns" : "failed",
    );
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (!open || event.key !== "Tab") {
        return;
      }
      const focusable = getFocusableElements(dialogRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (handoffFeedbackTimer.current !== null) {
        window.clearTimeout(handoffFeedbackTimer.current);
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const triggerElement = triggerRef.current;
    const inertTargets = Array.from(document.body.children).filter(
      (child) => child !== dialogRef.current?.parentElement,
    );
    inertTargets.forEach((child) => setElementInert(child, true));
    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(focusTimer);
      inertTargets.forEach((child) => setElementInert(child, false));
      triggerElement?.focus();
    };
  }, [open]);

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex h-9 cursor-pointer list-none items-center gap-2 rounded-full border border-[color:rgba(139,151,255,0.28)] bg-[color:rgba(139,151,255,0.08)] px-2.5 text-xs text-[color:var(--color-indigo-accent)] transition-colors hover:border-[color:rgba(139,151,255,0.44)] hover:bg-[color:rgba(139,151,255,0.13)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-inset [&::-webkit-details-marker]:hidden"
        data-testid="agent-status-trigger"
        onClick={() => setOpen(true)}
        aria-label={t("triggerAria", {
          status: statusLabel,
          score: readiness.score,
        })}
        title={t("triggerTitle")}
      >
        <Cog size={14} aria-hidden />
        <span>{t("trigger")}</span>
        <span
          className={`rounded-full border px-1.5 py-0.5 font-mono text-[9px] tabular-nums ${statusTone}`}
        >
          {readiness.score}
        </span>
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
          (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          data-testid="agent-settings-overlay"
          role="presentation"
        >
          <section
            ref={dialogRef}
            className="flex h-[min(42rem,calc(100vh-2rem))] w-[min(54rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] text-[12px] shadow-[0_24px_90px_rgba(0,0,0,0.58)]"
            data-testid="agent-status-popover"
            role="dialog"
            aria-modal="true"
            aria-labelledby="agent-settings-title"
            tabIndex={-1}
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[color:var(--color-border-soft)] px-4 py-3">
              <div className="min-w-0">
                <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                  {t("eyebrow")}
                </p>
                <h2
                  id="agent-settings-title"
                  className="mt-1 break-keep text-base font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
                >
                  {t("title")}
                </h2>
                <p className="mt-1 break-keep text-[11px] leading-4 text-[color:var(--color-text-quaternary)]">
                  {t("settingsSubtitle")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] ${statusTone}`}>
                  {statusLabel}
                </span>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex size-8 items-center justify-center rounded-full border border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.34)] hover:text-[color:var(--color-text-primary)]"
                  aria-label={t("close")}
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
            </header>
            <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[12rem_minmax(0,1fr)]">
              <nav
                className="shrink-0 border-b border-[color:var(--color-border-soft)] bg-[color:rgba(0,0,0,0.10)] p-2 sm:border-b-0 sm:border-r"
                aria-label={t("settingsNavLabel")}
              >
                <div className="grid gap-1 sm:sticky sm:top-2">
                  {settingsTabs.map((tab) => {
                    const Icon = tab.icon;
                    const selected = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex min-w-0 items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                          selected
                            ? "border-[color:rgba(139,151,255,0.36)] bg-[color:rgba(139,151,255,0.12)] text-[color:var(--color-text-primary)]"
                            : "border-transparent text-[color:var(--color-text-tertiary)] hover:border-[color:var(--color-border-soft)] hover:bg-[color:var(--color-overlay-1)]"
                        }`}
                        data-testid={`agent-settings-tab-${tab.id}`}
                        aria-pressed={selected}
                      >
                        <Icon
                          size={14}
                          aria-hidden
                          className="mt-0.5 shrink-0 text-[color:var(--color-indigo-accent)]"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-mono text-[10px]">
                            {tab.title}
                          </span>
                          <span className="mt-0.5 block break-keep text-[9px] leading-3 text-[color:var(--color-text-quaternary)]">
                            {tab.body}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </nav>
              <div
                className="min-h-0 overflow-y-auto p-4"
                data-testid="agent-settings-scroll-area"
              >
                {activeTab === "connection" ? (
                  <div data-testid="agent-settings-panel-connection">
                    <p className="break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
                      {t("body", {
                        relations: readiness.relationCount,
                        blockers: blockerCount,
                      })}
                    </p>
                    <p className="mt-2 break-keep rounded-lg border border-[color:rgba(139,151,255,0.18)] bg-[color:rgba(139,151,255,0.06)] px-2.5 py-2 text-[11px] leading-4 text-[color:var(--color-text-secondary)]">
                      {t("connectionBoundary")}
                    </p>
                    <div
                      className="mt-3 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-2"
                      data-testid="agent-connection-proof"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-mono text-[8px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
                          {t("proofLabel")}
                        </p>
                        <span className="rounded-full border border-[color:rgba(139,151,255,0.18)] px-1.5 py-0.5 font-mono text-[8px] text-[color:var(--color-text-quaternary)]">
                          {t("proofBadge")}
                        </span>
                      </div>
                      <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
                        {connectionProofItems.map((item) => {
                          const Icon = item.icon;
                          return (
                            <div
                              key={item.title}
                              className="min-w-0 rounded-md border border-[color:var(--color-border-soft)] bg-[color:rgba(0,0,0,0.12)] p-2"
                            >
                              <div className="flex min-w-0 items-center gap-1.5">
                                <Icon
                                  size={12}
                                  aria-hidden
                                  className="shrink-0 text-[color:var(--color-indigo-accent)]"
                                />
                                <p className="truncate font-mono text-[9px] uppercase tracking-[0.10em] text-[color:var(--color-text-primary)]">
                                  {item.title}
                                </p>
                              </div>
                              <p className="mt-1 break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                                {item.body}
                              </p>
                              <p className="mt-1 truncate font-mono text-[8.5px] text-[color:var(--color-text-quaternary)]">
                                {item.meta}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div
                      className="mt-3 rounded-md border border-[color:rgba(255,179,71,0.20)] bg-[color:rgba(255,179,71,0.06)] p-2"
                      data-testid="agent-session-proof-contract"
                    >
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck
                          size={12}
                          aria-hidden
                          className="shrink-0 text-[color:rgba(238,198,128,0.95)]"
                        />
                        <p className="font-mono text-[8px] uppercase tracking-[0.10em] text-[color:rgba(238,198,128,0.95)]">
                          {t("sessionProofTitle")}
                        </p>
                      </div>
                      <ol className="mt-1.5 grid gap-1 text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                        {sessionProofChecks.map((item, index) => (
                          <li key={item} className="flex min-w-0 gap-1.5">
                            <span className="font-mono text-[color:rgba(238,198,128,0.95)]">
                              {index + 1}.
                            </span>
                            <span className="min-w-0 break-keep">{item}</span>
                          </li>
                        ))}
                      </ol>
                      <div className="mt-2 border-t border-[color:rgba(255,179,71,0.14)] pt-2">
                        <p className="font-mono text-[8px] uppercase tracking-[0.10em] text-[color:rgba(238,198,128,0.90)]">
                          {t("staleMetadataTitle")}
                        </p>
                        <ol className="mt-1.5 grid gap-1 text-[10px] leading-4 text-[color:var(--color-text-tertiary)]">
                          {staleMetadataChecks.map((item, index) => (
                            <li key={item} className="flex min-w-0 gap-1.5">
                              <span className="font-mono text-[color:rgba(238,198,128,0.95)]">
                                {index + 1}.
                              </span>
                              <span className="min-w-0 break-keep">{item}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    </div>
                    <div className="mt-3 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1.5">
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
                  </div>
                ) : null}

                {activeTab === "handoff" ? (
                  <div data-testid="agent-settings-panel-handoff">
                    <div className="grid gap-1.5 sm:grid-cols-2">
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
                        {gateCopyState === "copied" ? <Check size={12} aria-hidden /> : <Terminal size={12} aria-hidden />}
                        {gateCopyState === "copied" ? t("copied") : t("copySetup")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCopyMcpFirstCalls()}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 font-mono text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
                      >
                        {mcpCopyState === "copied" ? <Check size={12} aria-hidden /> : <Terminal size={12} aria-hidden />}
                        {mcpCopyState === "copied" ? t("copied") : t("copyMcpFirstCalls")}
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
                              : handoffFeedback === "mcp"
                                ? t("mcpCopiedTitle")
                                : handoffFeedback === "concerns"
                                  ? t("concernsCopiedTitle")
                                  : t("copyFailedTitle")}
                        </p>
                        <p className="mt-0.5 text-[10px] text-[color:rgba(190,245,222,0.70)]">
                          {handoffFeedback === "briefing"
                            ? t("briefingCopiedBody")
                            : handoffFeedback === "gate"
                              ? t("gateCopiedBody")
                              : handoffFeedback === "mcp"
                                ? t("mcpCopiedBody")
                                : handoffFeedback === "concerns"
                                  ? t("concernsCopiedBody")
                                  : t("copyFailedBody")}
                        </p>
                      </div>
                    ) : null}
                    <div className="mt-3 rounded-lg border border-[color:rgba(139,151,255,0.22)] bg-[color:rgba(139,151,255,0.06)] p-2">
                      <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                        {t("railLabel")}
                      </p>
                      <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
                        {[
                          {
                            icon: Database,
                            title: t("graphDbPackTitle"),
                            body: t("graphDbPackBody"),
                          },
                          {
                            icon: ShieldCheck,
                            title: t("runtimeGateTitle"),
                            body: t("runtimeGateBody", {
                              checks: AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT,
                            }),
                          },
                          {
                            icon: Bot,
                            title: t("agentHandoffTitle"),
                            body: t("agentHandoffBody"),
                          },
                        ].map(({ icon: CardIcon, title, body }) => {
                          return (
                            <div
                              key={String(title)}
                              className="flex items-start gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-2 sm:flex-col sm:gap-1.5"
                            >
                              <CardIcon
                                size={13}
                                aria-hidden
                                className="mt-0.5 shrink-0 text-[color:var(--color-indigo-accent)]"
                              />
                              <div className="min-w-0">
                                <p className="font-mono text-[10px] text-[color:var(--color-text-primary)]">
                                  {title}
                                </p>
                                <p className="mt-0.5 break-keep text-[10px] leading-4 text-[color:var(--color-text-tertiary)] sm:text-[9px] sm:leading-3.5">
                                  {body}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : null}

                {activeTab === "criteria" ? (
                  <div
                    className="rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-2"
                    data-testid="agent-concerns-map"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                        {t("concernLabel")}
                      </p>
                      <div className="flex min-w-0 items-center gap-1">
                        <span className="truncate rounded-full border border-[color:rgba(139,151,255,0.18)] px-1.5 py-0.5 font-mono text-[8px] text-[color:var(--color-text-quaternary)]">
                          agent-practitioner-concerns-map
                        </span>
                        <Link
                          href={researchHref}
                          aria-label={t("concernResearchLinkAriaLabel")}
                          className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-[color:rgba(139,151,255,0.18)] px-1.5 font-mono text-[8px] text-[color:var(--color-text-quaternary)] transition-colors hover:border-[color:rgba(139,151,255,0.34)] hover:text-[color:var(--color-text-secondary)]"
                        >
                          <Database size={10} aria-hidden />
                          {t("concernResearchLink")}
                        </Link>
                      </div>
                    </div>
                    <div className="mt-2 grid gap-1 sm:grid-cols-5">
                      {concernItems.map(({ title, body, gate }) => (
                        <div
                          key={title}
                          title={`${body} · ${gate}`}
                          className="min-w-0 rounded-md border border-[color:var(--color-border-soft)] bg-[color:rgba(0,0,0,0.10)] px-2 py-1.5"
                        >
                          <p className="truncate font-mono text-[9px] text-[color:var(--color-text-primary)]">
                            {title}
                          </p>
                          <p className="mt-0.5 truncate text-[9px] text-[color:var(--color-text-quaternary)]">
                            {body}
                          </p>
                          <p className="mt-1 truncate border-t border-[color:rgba(139,151,255,0.12)] pt-1 font-mono text-[8px] text-[color:var(--color-indigo-accent)]">
                            {t("concernGateLabel")}: {gate}
                          </p>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleCopyConcerns()}
                      className="mt-2 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:rgba(0,0,0,0.12)] px-3 font-mono text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.32)] hover:text-[color:var(--color-text-primary)]"
                    >
                      {concernCopyState === "copied" ? <Check size={12} aria-hidden /> : <Clipboard size={12} aria-hidden />}
                      {concernCopyState === "copied" ? t("copied") : t("copyConcerns")}
                    </button>
                  </div>
                ) : null}
                {activeTab !== "handoff" && handoffFeedback ? (
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
                          : handoffFeedback === "mcp"
                            ? t("mcpCopiedTitle")
                            : handoffFeedback === "concerns"
                              ? t("concernsCopiedTitle")
                              : t("copyFailedTitle")}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[color:rgba(190,245,222,0.70)]">
                      {handoffFeedback === "briefing"
                        ? t("briefingCopiedBody")
                        : handoffFeedback === "gate"
                          ? t("gateCopiedBody")
                          : handoffFeedback === "mcp"
                            ? t("mcpCopiedBody")
                            : handoffFeedback === "concerns"
                              ? t("concernsCopiedBody")
                              : t("copyFailedBody")}
                    </p>
                  </div>
                ) : null}
                <p className="sr-only">{t("footnote")}</p>
                <span className="sr-only" aria-live="polite" aria-atomic="true">
                  {gateCopyState === "copied" || mcpCopyState === "copied" || concernCopyState === "copied" ? t("copied") : ""}
                </span>
              </div>
            </div>
          </section>
        </div>
          ),
          document.body,
        )
        : null}
    </div>
  );
}
