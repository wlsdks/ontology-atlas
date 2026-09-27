"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpRight, Check, CircleAlert, Copy, Info, Plug } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { BrandMark } from '@/shared/ui/brand-mark';
import { Link } from "@/i18n/navigation";
import { AGENT_GRAPH_WORKFLOW_HREF, type AgentServerAvailability } from "@/shared/config";
import { copyText } from "@/shared/lib/copy-text";
import { cn } from "@/shared/lib/cn";
import { badgeClass } from "@/shared/ui/badge-class";
import { Chip } from "@/shared/ui/controls";
import { useToast } from "@/shared/ui";

/**
 * One-click connect controls for Claude Code, Cursor, Antigravity and Codex. The installed app
 * writes the config files into the folder; the web has no absolute path for a deeplink, so it
 * copies the config with instructions. Feature layer, so both widgets can use it.
 */

import type { AgentClientId } from "@/entities/vault-session";
import { WebManualConnectPanel } from "./WebManualConnectPanel";
import { controlClass } from '@/shared/ui/control-class';

type ClientId = "claudeCode" | "cursor" | "antigravity" | "codex";

/**
 * Component id to file-contract tool id. The two naming systems are translated only here, so a
 * second hand translation cannot disagree.
 */
const CLIENT_TO_ID: Record<ClientId, AgentClientId> = {
  claudeCode: "claude-code",
  cursor: "cursor",
  antigravity: "antigravity",
  codex: "codex",
};

type Feedback = "idle" | "busy" | "done" | "copied" | "failed";

/**
 * The row already names the tool and its file, so the visible word is the verb and state only.
 * The accessible name keeps the full sentence, because a screen reader moving between controls
 * does not see the row, and four buttons called "Connect" are indistinguishable.
 */
type Wording = { full: string; short: string };
type AgentClientConfigState = "missing" | "invalid" | "ready";

export interface AgentClientControlsProps {
  /**
   * Without a known server launch (a web session), no config is written or copied: a config that
   * will not connect is a trap.
   */
  serverAvailability: AgentServerAvailability;
  /**
   * Writes the config for the given tool, so a button can never write for every tool at once.
   * Installed app only; null on the web.
   */
  onWriteConfigs: ((client: AgentClientId) => void | Promise<void>) | null;
  /** Without an absolute path it degrades to copying. */
  cursorDeeplink: string | null;
  /** For the copy fallback. */
  mcpJsonSnippet: string;
  /** Replaces an invalid vault-local `.mcp.json`; usually `OATLAS_VAULT=.`. */
  replacementMcpJsonSnippet?: string;
  /** For the copy fallback. */
  codexCommand: string;
  /** Installed app; shows the confirmation copy first. */
  mcpJsonReady?: boolean;
  /** Keeps existence and validity separate. */
  mcpJsonState?: AgentClientConfigState;
  /** Keeps existence and validity separate. */
  codexConfigState?: AgentClientConfigState;
  /** Copied when a user replaces an invalid Codex config. */
  codexConfigSnippet?: string;
  /** No known absolute path, so copy instructions replace the deeplink. */
  needsManualPath: boolean;
  /**
   * `stack` is the map sheet's full-width column; `grid` is two columns inside the collapsed
   * settings step, so the four read as one set of peers (one person often attaches several).
   */
}

/**
 * The write, copy and deeplink state machine for the four clients, shared by the grid or stack
 * layout and the Agents MCP rows so the two screens cannot disagree on which button says ready.
 */
export function useAgentClientControls({
  serverAvailability,
  onWriteConfigs,
  cursorDeeplink,
  mcpJsonSnippet,
  replacementMcpJsonSnippet,
  codexCommand,
  mcpJsonReady = false,
  mcpJsonState,
  codexConfigState = "missing",
  codexConfigSnippet,
  needsManualPath,
}: AgentClientControlsProps): AgentClientControls {
  const t = useTranslations("agentConnect");
  const ts = useTranslations("agentConnect.short");
  const toast = useToast();
  const [feedback, setFeedback] = useState<Record<ClientId, Feedback>>({
    claudeCode: "idle",
    cursor: "idle",
    antigravity: "idle",
    codex: "idle",
  });
  const resolvedMcpJsonState =
    mcpJsonState ?? (mcpJsonReady ? "ready" : "missing");
  const mcpJsonIsReady =
    resolvedMcpJsonState === "ready" || feedback.claudeCode === "done";
  const codexConfigIsReady =
    codexConfigState === "ready" || feedback.codex === "done";

  const setState = (id: ClientId, state: Feedback) =>
    setFeedback((prev) => ({ ...prev, [id]: state }));

  async function writeAndConfirm(id: ClientId) {
    if (!onWriteConfigs) return;
    setState(id, "busy");
    try {
      await onWriteConfigs(CLIENT_TO_ID[id]);
      setState(id, "done");
    } catch (error) {
      /*
       * Without this branch a refused write looked like never having pressed. The button says it
       * failed; the panel that owns `onWriteConfigs` names the file and the cause.
       */
      setState(id, "failed");
      console.error("Writing the agent config failed", error);
    }
  }

  async function copyAndConfirm(id: ClientId, value: string) {
    const ok = await copyText(value);
    setState(id, ok ? "copied" : "failed");
    // The inline label swap (2s) plus the canonical toast.
    if (ok) {
      toast.show(t("copiedToast"), "success");
      window.setTimeout(() => setState(id, "idle"), 2000);
    }
  }

  if (!serverAvailability.launch) {
    /**
     * The web is not a dead end: MCP attaches to the folder, so a web user can connect; the browser
     * only cannot write the config (a handle, not a path), so the person supplies the path here.
     * The "why plus where" contract of `.claude/rules/surfaces.md` holds; the app stays easier.
     */
    return {
      controls: null,
      manualPathNote: null,
      serverUnavailable: (
        <>
        <div
          role="status"
          data-testid="agent-server-unavailable"
          className="rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5"
        >
          <div className="flex items-start gap-2">
            <Info
              size={ICON_SIZE.md}
              aria-hidden
              className="mt-0.5 shrink-0 text-[color:var(--color-text-quaternary)]"
            />
            <div className="min-w-0">
              <p className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                {t("serverUnavailableTitle")}
              </p>
              <p className="mt-1 text-label leading-prose text-[color:var(--color-text-tertiary)]">
                {t("serverUnavailableDesc")}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <Link
                  href="/download/"
                  data-testid="agent-connect-web-get-app"
                  className={controlClass({ shape: "link", tone: "accent", className: "text-label font-[var(--font-weight-signature)] hover:text-[color:var(--color-text-primary)]" })}
                >
                  {t("serverUnavailableGetApp")}
                </Link>
                {/* Only for someone who wants to read more; not the primary path. */}
                <Link
                  href={AGENT_GRAPH_WORKFLOW_HREF}
                  className={controlClass({ shape: "link", tone: "secondary", className: "text-label hover:text-[color:var(--color-text-secondary)]" })}
                >
                  {t("serverUnavailableSource")}
                </Link>
              </div>
            </div>
          </div>
        </div>
        <WebManualConnectPanel />
        </>
      ),
    };
  }

  /**
   * Per-tool render fragments. Render order comes from `AGENT_CLIENTS`, not from here, so one
   * list cannot show two orders.
   */
  const clientRenderers: Record<ClientId, () => React.ReactNode> = {
    // Claude Code: the installed app writes `.mcp.json`; the web copies it. No fill: the four
    // write different files, and there is no signal for which tool someone uses.
    claudeCode: () =>
      mcpJsonIsReady ? (
        <ClientStatus
          testId="agent-client-claude-code"
          label={{ full: t("claudeCodeReady"), short: ts("ready") }}
        />
      ) : resolvedMcpJsonState === "invalid" ? (
        <ClientAction
          testId="agent-client-claude-code"
          icon={<Copy size={ICON_SIZE.md} aria-hidden />}
          label={{ full: t("replaceClaudeCodeConfig"), short: ts("copyCorrect") }}
          feedback={feedback.claudeCode}
          copiedLabel={{ full: t("replaceClaudeCodeConfigDone"), short: ts("copied") }}
          onClick={() =>
            void copyAndConfirm(
              "claudeCode",
              replacementMcpJsonSnippet ?? mcpJsonSnippet,
            )
          }
        />
      ) : onWriteConfigs ? (
        <ClientAction
          testId="agent-client-claude-code"
          label={{ full: t("connectClaudeCode"), short: ts("connect") }}
          feedback={feedback.claudeCode}
          doneLabel={{ full: t("claudeCodeDone"), short: ts("created") }}
          busyLabel={{ full: t("connecting"), short: ts("connecting") }}
          onClick={() => void writeAndConfirm("claudeCode")}
        />
      ) : (
        <ClientAction
          testId="agent-client-claude-code"
          icon={<Copy size={ICON_SIZE.md} aria-hidden />}
          label={{ full: t("copyClaudeCodeConfig"), short: ts("copyConfig") }}
          feedback={feedback.claudeCode}
          copiedLabel={{ full: t("copyClaudeCodeConfigDone"), short: ts("copied") }}
          onClick={() => void copyAndConfirm("claudeCode", mcpJsonSnippet)}
        />
      ),

    // Cursor: the installed app writes `.cursor/mcp.json`, because the deeplink's landing file is
    // undocumented. The web cannot write files, so the deeplink remains there.
    cursor: () =>
      onWriteConfigs ? (
        <ClientAction
          testId="agent-client-cursor"
          label={{ full: t("connectCursor"), short: ts("connect") }}
          feedback={feedback.cursor}
          doneLabel={{ full: t("cursorDone"), short: ts("created") }}
          busyLabel={{ full: t("connecting"), short: ts("connecting") }}
          onClick={() => void writeAndConfirm("cursor")}
        />
      ) : cursorDeeplink ? (
        <ClientLink
          testId="agent-client-cursor"
          icon={<ArrowUpRight size={ICON_SIZE.md} aria-hidden />}
          label={{ full: t("connectCursor"), short: ts("connect") }}
          href={cursorDeeplink}
        />
      ) : (
        <ClientAction
          testId="agent-client-cursor"
          icon={<Copy size={ICON_SIZE.md} aria-hidden />}
          label={{ full: t("copyCursorConfig"), short: ts("copyConfig") }}
          feedback={feedback.cursor}
          copiedLabel={{ full: t("copyConfigDone"), short: ts("copied") }}
          onClick={() => void copyAndConfirm("cursor", mcpJsonSnippet)}
        />
      ),

    // Antigravity: workspace `.agents/mcp_config.json` with the `mcpServers` key, so the existing
    // writer handles it. VS Code is absent: its `servers` key would need a second writer; its
    // snippet stays in the "other tools" table under the advanced fold.
    antigravity: () =>
      onWriteConfigs ? (
        <ClientAction
          testId="agent-client-antigravity"
          label={{ full: t("connectAntigravity"), short: ts("connect") }}
          feedback={feedback.antigravity}
          doneLabel={{ full: t("antigravityDone"), short: ts("created") }}
          busyLabel={{ full: t("connecting"), short: ts("connecting") }}
          onClick={() => void writeAndConfirm("antigravity")}
        />
      ) : (
        <ClientAction
          testId="agent-client-antigravity"
          icon={<Copy size={ICON_SIZE.md} aria-hidden />}
          label={{ full: t("copyAntigravityConfig"), short: ts("copyConfig") }}
          feedback={feedback.antigravity}
          copiedLabel={{ full: t("copyConfigDone"), short: ts("copied") }}
          onClick={() => void copyAndConfirm("antigravity", mcpJsonSnippet)}
        />
      ),

    // Codex: the installed app writes the config; the web copies a one-line command.
    codex: () =>
      codexConfigIsReady ? (
        <ClientStatus
          testId="agent-client-codex"
          label={{ full: t("codexReady"), short: ts("ready") }}
        />
      ) : codexConfigState === "invalid" ? (
        <ClientAction
          testId="agent-client-codex"
          icon={<Copy size={ICON_SIZE.md} aria-hidden />}
          label={{ full: t("replaceCodexConfig"), short: ts("copyCorrect") }}
          feedback={feedback.codex}
          copiedLabel={{ full: t("replaceCodexConfigDone"), short: ts("copied") }}
          onClick={() =>
            void copyAndConfirm(
              "codex",
              codexConfigSnippet ?? codexCommand,
            )
          }
        />
      ) : onWriteConfigs ? (
        <ClientAction
          testId="agent-client-codex"
          label={{ full: t("connectCodex"), short: ts("connect") }}
          feedback={feedback.codex}
          doneLabel={{ full: t("codexDone"), short: ts("created") }}
          busyLabel={{ full: t("connecting"), short: ts("connecting") }}
          onClick={() => void writeAndConfirm("codex")}
        />
      ) : (
        <ClientAction
          testId="agent-client-codex"
          icon={<Copy size={ICON_SIZE.md} aria-hidden />}
          label={{ full: t("copyCodexCommand"), short: ts("copyCommand") }}
          feedback={feedback.codex}
          copiedLabel={{ full: t("copyCodexCommandDone"), short: ts("copied") }}
          onClick={() => void copyAndConfirm("codex", codexCommand)}
        />
      ),
  };

  return {
    serverUnavailable: null,
    controls: {
      "claude-code": clientRenderers.claudeCode(),
      codex: clientRenderers.codex(),
      cursor: clientRenderers.cursor(),
      antigravity: clientRenderers.antigravity(),
    },
    manualPathNote: needsManualPath ? (
      <p className="text-label leading-label text-[color:var(--color-text-quaternary)]">
        {t("deeplinkWebNote")}{" "}
        <Link
          href="/download/"
          data-testid="agent-client-app-cta"
          className={controlClass({ shape: "link", tone: "accent", className: "font-[var(--font-weight-signature)] hover:text-[color:var(--color-text-primary)]" })}
        >
          {t("deeplinkWebNoteCta")}
        </Link>
      </p>
    ) : null,
  };
}

export interface AgentClientControls {
  /** When no server can be launched; the controls are null then. */
  serverUnavailable: React.ReactNode | null;
  /** One control per client in its current state. */
  controls: Record<AgentClientId, React.ReactNode> | null;
  /** A deeplink needs a path a browser does not know. */
  manualPathNote: React.ReactNode | null;
}

/**
 * The Agents row chip grammar: a 32px `Chip` at `lg`, natural width, glyph before the verb, same
 * tone on all four. `controlClass` owns focus, press and disabled; this adds only the border
 * step of `DETAIL_TOGGLE_CHIP`, which lives in a widget this feature cannot import.
 */
const ROW_CHIP_EDGE =
  'shrink-0 whitespace-nowrap border-[color:var(--color-border-soft)] hover:border-[color:var(--color-border-strong)]';

/**
 * A settled state is the same badge the agents tab uses, so a finished row does not look
 * pressable. Exported so the runtime rows do not keep a second copy.
 */
export function RowStateBadge({
  ready,
  children,
  className,
  ...rest
}: {
  ready: boolean;
  children: React.ReactNode;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLSpanElement>, 'children' | 'className'>) {
  return (
    <span
      {...rest}
      className={badgeClass({
        shape: "tag",
        /* A fixed floor with the word centred, so badges form one column. */
        className: cn(
          "inline-flex min-w-18 shrink-0 items-center justify-center gap-1.5 py-0.5 bg-[color:var(--color-overlay-2)]",
          ready ? "text-[color:var(--color-text-secondary)]" : "text-[color:var(--color-text-tertiary)]",
          className,
        ),
      })}
    >
      {ready ? (
        <span
          aria-hidden
          data-testid="row-state-ready-dot"
          className="size-1.5 shrink-0 rounded-full bg-[color:var(--color-status-success)]"
        />
      ) : null}
      {children}
    </span>
  );
}

function ClientStatus({
  testId,
  label,
}: {
  testId: string;
  label: Wording;
}) {
  return (
    <RowStateBadge ready role="status" aria-label={label.full} data-testid={testId} data-state="ready">
      {label.short}
    </RowStateBadge>
  );
}

function ClientAction({
  testId,
  icon,
  label,
  feedback,
  doneLabel,
  copiedLabel,
  busyLabel,
  onClick,
}: {
  testId: string;
  /**
   * The verb's glyph; a write without one falls back to the plug.
   */
  icon?: React.ReactNode;
  label: Wording;
  feedback: Feedback;
  doneLabel?: Wording;
  copiedLabel?: Wording;
  busyLabel?: Wording;
  onClick: () => void;
}) {
  const t = useTranslations("agentConnect");
  const ts = useTranslations("agentConnect.short");
  const isDone = feedback === "done";
  const isCopied = feedback === "copied";
  const isBusy = feedback === "busy";
  // A failure is said on this control; the label beside it already says what did not happen.
  const isFailed = feedback === "failed";
  // The native 16px micro mark sits in the 14px slot, keeping the label in place.
  const shownIcon = isBusy ? (
    <span className="relative inline-flex size-3.5 shrink-0" aria-hidden="true">
      <BrandMark detail="micro" alt="" className="atlas-inline-waiting-mark absolute left-1/2 top-1/2 size-4 max-w-none -translate-x-1/2 -translate-y-1/2" />
    </span>
  ) : isDone || isCopied ? (
    <Check size={ICON_SIZE.md} aria-hidden />
  ) : isFailed ? (
    <CircleAlert size={ICON_SIZE.md} aria-hidden />
  ) : (
    icon ?? <Plug size={ICON_SIZE.md} aria-hidden />
  );
  const shownLabel: Wording = isBusy
    ? (busyLabel ?? label)
    : isDone
      ? (doneLabel ?? label)
      : isCopied
        ? (copiedLabel ?? label)
        : isFailed
          ? { full: t("actionFailed"), short: ts("failed") }
          : label;
  return (
    <Chip
      size="lg"
      tone="secondary"
      hoverInk="strong"
      data-testid={testId}
      data-state={feedback}
      /*
       * Busy is `aria-disabled`, not `disabled`: a disabled button drops keyboard focus to
       * `<body>` during the write. `aria-busy` says why; the press is ignored here.
       */
      onClick={isBusy ? undefined : onClick}
      aria-disabled={isBusy || undefined}
      aria-busy={isBusy || undefined}
      /* Only the verb is drawn; the sentence is the accessible name (see `Wording`). */
      aria-label={shownLabel.full}
      className={ROW_CHIP_EDGE}
    >
      {shownIcon}
      {shownLabel.short}
    </Chip>
  );
}

function ClientLink({
  testId,
  icon,
  label,
  href,
}: {
  testId: string;
  icon: React.ReactNode;
  label: Wording;
  href: string;
}) {
  // A custom URL scheme, so a plain anchor rather than a next Link; the OS wakes the client.
  return (
    <a
      href={href}
      data-testid={testId}
      aria-label={label.full}
      className={controlClass({
        shape: "chip",
        size: "lg",
        tone: "secondary",
        hoverInk: "strong",
        className: ROW_CHIP_EDGE,
      })}
    >
      {icon}
      {label.short}
    </a>
  );
}
