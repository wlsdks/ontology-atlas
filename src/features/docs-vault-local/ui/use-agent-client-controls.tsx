"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpRight, Check, CircleAlert, Copy, Plug } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { BrandMark } from '@/shared/ui/marks/brand-mark';
import { type AgentServerAvailability } from "@/shared/config";
import { copyText } from "@/shared/lib/clipboard/copy-text";
import { Chip } from "@/shared/ui/controls/controls";
import { useToast } from "@/shared/ui";

/**
 * One-click connect controls for Claude Code, Cursor, Antigravity and Codex. The installed app
 * writes the config files into the folder, or copies the config where the folder is read-only.
 * Feature layer, so widgets can use it.
 */

import type { AgentClientId } from "@/entities/vault-session";
import { RowStateBadge } from "./RowStateBadge";
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
   * Without a known server launch (the bundled binary was not found), no config is written or
   * copied: a config that will not connect is a trap.
   */
  serverAvailability: AgentServerAvailability;
  /** Writes the config for the given tool, so a button can never write for every tool at once; null where the folder cannot be edited. */
  onWriteConfigs: ((client: AgentClientId) => void | Promise<void>) | null;
  cursorDeeplink: string | null;
  mcpJsonSnippet: string;
  /** Replaces an invalid vault-local `.mcp.json`; usually `OATLAS_VAULT=.`. */
  replacementMcpJsonSnippet?: string;
  codexCommand: string;
  mcpJsonReady?: boolean;
  mcpJsonState?: AgentClientConfigState;
  codexConfigState?: AgentClientConfigState;
  codexConfigSnippet?: string;
}

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
    setFeedback((previous) => ({ ...previous, [id]: state }));

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

  if (!serverAvailability.launch) return { controls: null };

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
    controls: {
      "claude-code": clientRenderers.claudeCode(),
      codex: clientRenderers.codex(),
      cursor: clientRenderers.cursor(),
      antigravity: clientRenderers.antigravity(),
    },
  };
}

export interface AgentClientControls {
  controls: Record<AgentClientId, React.ReactNode> | null;
}

/**
 * The Agents row chip grammar: a 32px `Chip` at `lg`, natural width, glyph before the verb, same
 * tone on all four. `controlClass` owns focus, press and disabled; this adds only the border
 * step of `DETAIL_TOGGLE_CHIP`, which lives in a widget this feature cannot import.
 */
const ROW_CHIP_EDGE =
  'shrink-0 whitespace-nowrap border-[color:var(--color-border-soft)] hover:border-[color:var(--color-border-strong)]';

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
  const isFailed = feedback === "failed";
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
