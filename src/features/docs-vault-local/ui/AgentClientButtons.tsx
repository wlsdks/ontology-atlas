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
 * The one-click connect buttons, per client — four buttons (Claude Code · Cursor ·
 * Antigravity · Codex) plus one plain-language line saying there is no server to keep
 * running. The map sheet and the settings panel share **this same component**.
 *
 * Honest degradation:
 * - Tauri (installed app): `onWriteConfigs` writes the config files into the folder and
 *   confirms completion.
 * - Web: no absolute path is available, so a deeplink cannot be formed — it degrades to
 *   copying the config plus instructions.
 *
 * It lives at the feature layer so both widgets (agent-connect, app-settings-menu) can use
 * it without a same-layer cross-import.
 */

import type { AgentClientId } from "@/entities/vault-session";
import { WebManualConnectPanel } from "./WebManualConnectPanel";
import { controlClass } from '@/shared/ui/control-class';

type ClientId = "claudeCode" | "cursor" | "antigravity" | "codex";

/**
 * This component's internal id → the file contract's tool id.
 *
 * Two naming systems exist for historical reasons (camelCase label keys here, kebab slugs
 * there). Merging them is right but is a separate cleanup, so for now the translation lives
 * in **exactly one place** — translating by hand in several places means one of them is wrong.
 */
const CLIENT_TO_ID: Record<ClientId, AgentClientId> = {
  claudeCode: "claude-code",
  cursor: "cursor",
  antigravity: "antigravity",
  codex: "codex",
};

/** The reverse direction, used to derive render order from `AGENT_CLIENTS`. */
type Feedback = "idle" | "busy" | "done" | "copied" | "failed";

/**
 * **What the control says, and what it is called** (2026-09-19).
 *
 * Each control now sits on a row that already carries the tool's mark, its name and the file it
 * writes, so a button reading "Connect to Claude Code" states the tool's name a second time and
 * ".mcp.json ready" states the file a second time — the duplicate-statement defect this screen
 * has been through before, and at 390 it was also what pushed the label column to 60px. The
 * visible word is therefore the verb and the state alone. The **accessible** name keeps the long
 * sentence: a screen reader moving control to control does not see the row beside it, and four
 * buttons all called "Connect" would be four buttons nobody can tell apart.
 */
type Wording = { full: string; short: string };
type AgentClientConfigState = "missing" | "invalid" | "ready";

export interface AgentClientControlsProps {
  /**
   * Do we know how to launch a server from here? If not (a web session), no config is written
   * or copied — a config that will not connect is a trap, not help.
   */
  serverAvailability: AgentServerAvailability;
  /**
   * Writes the config — **and takes which tool to write it for.**
   *
   * There used to be no argument, so the implementation wrote "everything it could". Every
   * button therefore produced the same result: the label named a tool while the action did not
   * know one. Taking the argument is itself what stops that recurring — ignoring the tool now
   * has to be deliberate.
   *
   * Tauri only (creates `.mcp.json`, `.codex/config.toml`, and the rest inside the vault
   * folder); null on the web.
   */
  onWriteConfigs: ((client: AgentClientId) => void | Promise<void>) | null;
  /** Cursor deeplink, when an absolute path exists. Without one it degrades to copying. */
  cursorDeeplink: string | null;
  /** The `.mcp.json` body, for the copy fallback. */
  mcpJsonSnippet: string;
  /** Body used to replace an invalid vault-local `.mcp.json`. Usually `OATLAS_VAULT=.`. */
  replacementMcpJsonSnippet?: string;
  /** The one-line Codex registration command, for the copy fallback. */
  codexCommand: string;
  /** Whether `.mcp.json` already exists (installed app) — shows the confirmation copy first. */
  mcpJsonReady?: boolean;
  /** Current `.mcp.json` state, keeping existence and validity separate. */
  mcpJsonState?: AgentClientConfigState;
  /** Current `.codex/config.toml` state, keeping existence and validity separate. */
  codexConfigState?: AgentClientConfigState;
  /** The vault-local TOML to copy when a user reviews and replaces an invalid Codex config. */
  codexConfigSnippet?: string;
  /** A web session with no known absolute path — copy instructions instead of a deeplink. */
  needsManualPath: boolean;
  /**
   * How the four tools are laid out.
   *
   * The default `stack` belongs to the map sheet, where this column is the sheet's main content
   * and full-width rows are right. `grid` is for **inside the collapsed step** in settings: the
   * four are «pick one», not «one right answer and three rejects», and four full-width rows made
   * each read as a large decision (owner report, 2026-08-04). Two columns read as one set and
   * halve the vertical space.
   *
   * ⚠️ The axis was not added on a hunch. The four write to different files, so one person
   * attaching two or more is normal — a fact the 2026-08-02 round already confirmed when it
   * removed the fill. This says that same fact through **layout** as well.
   */
}

/**
 * **The per-client controls, without a layout.** One hook holds the write/copy/deeplink state
 * machine for the four clients; `AgentClientButtons` lays the controls out as a grid or a stack
 * (the map sheet), and the Agents destination's MCP tab lays them out as rows beside each tool's
 * name and file (2026-09-19). Two layouts, one state machine — a second copy would be the two
 * screens drifting on which button says "ready".
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
       * ⚠️ **A swallowed write failure looked exactly like never having pressed** (census state
       * 5e, 2026-08-31). This caught with no binding and `failed` had no render branch, so a
       * refused write left the button in its resting label with nothing said anywhere. The
       * button now says it failed, and the panel that owns the write (`onWriteConfigs`) owns the
       * sentence naming the file and the cause — one fact, said once in each place it belongs.
       */
      setState(id, "failed");
      console.error("Writing the agent config failed", error);
    }
  }

  async function copyAndConfirm(id: ClientId, value: string) {
    const ok = await copyText(value);
    setState(id, ok ? "copied" : "failed");
    // The inline label swap (2s) plus the canonical toast, so the confirmation is unmissable.
    if (ok) {
      toast.show(t("copiedToast"), "success");
      window.setTimeout(() => setState(id, "idle"), 2000);
    }
  }

  if (!serverAvailability.launch) {
    /**
     * **The web is not a dead end.** This slot used to hold one sentence — "you cannot connect
     * from this screen" — and a link dropping the reader into long documentation. That sentence
     * is false: MCP attaches to the **folder**, not to Atlas, and the agent launches the server
     * in its own session. A web user can connect.
     *
     * The one thing a browser cannot do is **write the config for you** (FSA gives a handle, not
     * a path). So rather than understating what is possible, we **ask the person who knows** the
     * value the browser does not.
     *
     * The "why plus where" contract (`.claude/rules/surfaces.md`) is unchanged: say why it cannot
     * be automatic, and give somewhere to go. What changed is that the somewhere is now **here
     * too**, while the app (one button) remains the easier path.
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
                {/* Only for someone who wants to read more — **not the primary path.** This used
                    to be the only alternative, so a person trying to connect lost the sheet and
                    landed in the middle of a document. */}
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
   * The per-tool render fragments — **order is not decided here.** This button column had the
   * order hardcoded as Claude Code → Cursor → Antigravity → Codex while the global-scope tab in
   * the same sheet used `AGENT_CLIENTS` (Claude Code → Codex → Cursor → Antigravity): one list
   * with two orders inside one sheet. Deriving render order from that array removes the place
   * they can diverge again. Gate: `AgentClientButtons.test.tsx` "render order follows
   * AGENT_CLIENTS".
   */
  const clientRenderers: Record<ClientId, () => React.ReactNode> = {
    // Claude Code — Tauri writes `.mcp.json` automatically; the web copies it.
    //
    // **The fill was removed** (2026-08-02, design council). This branch alone hardcoded
    // `primary` to true and wore the indigo wash, while the other three had no path to receive
    // that value at all. Measured, all four were `750×38, x=407` with zero dimensional variance
    // and only one filled, so it read as **«one right answer and three rejects»** rather than
    // four options. The four write to different files (`.mcp.json`, `.codex/config.toml`,
    // `.cursor/mcp.json`, `.agents/mcp_config.json`) — attaching more than one is a normal
    // scenario, so there cannot be a «right answer».
    //
    // There is still no signal for which tool someone uses (`recommendedClientId`). Rather than
    // wiring a signal that does not exist, **the wrong signal is switched off first**.
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

    // Cursor — **the installed app writes the file.** Research on 2026-07-30 confirmed the
    // `.cursor/mcp.json` project scope, while the deeplink's landing file is not stated in the
    // official documentation. One predictable file inside the vault beats convenience whose
    // destination is unknown. On the web, files cannot be written, so the deeplink remains.
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

    // Antigravity — the workspace `.agents/mcp_config.json`, stdio explicit, and its key is
    // `mcpServers`, so the existing writer handles it as-is (research 2026-07-30).
    //
    // **VS Code is absent from this row.** It supports `.vscode/mcp.json` but its key is
    // `servers` rather than `mcpServers`, which demands a second writer — too costly against the
    // overlap. Its snippet stays in the "other tools" table under the advanced fold.
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

    // Codex — Tauri writes the config automatically; the web copies a one-line command.
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
  /** The degradation card plus the by-hand panel, when no server can be launched; the controls are null then. */
  serverUnavailable: React.ReactNode | null;
  /** One control per client, in the client's own current state (write, copy, deeplink, or ready). */
  controls: Record<AgentClientId, React.ReactNode> | null;
  /** The web note under the controls — a deeplink needs a path a browser does not know. */
  manualPathNote: React.ReactNode | null;
}

/**
 * **The row grammar of the Agents destination** (2026-09-25, round 3).
 *
 * These controls used to be the `Button` primitive's `outline/sm` stretched to a fixed 144px slot
 * (`w-full` inside `w-36`), bold and on its own fill, while every other row and heading action on
 * the same destination (open a chat, check the connection, install guide, check again, confirm
 * the connection) is a 32px `Chip` at `lg`, natural width, a glyph before its verb. Two grammars
 * one tab apart read as two products. They now wear the chip the rows of the agents tab wear; the
 * four are still peers (the 2026-08-02 council's "no right answer" call holds: same tone on all
 * four, no accent).
 *
 * The primitive (`controlClass`) owns the focus ring, the press and the disabled state; what is written here
 * is only the border step `DETAIL_TOGGLE_CHIP` gives the sibling chips (that constant lives in a
 * widget this feature cannot import).
 */
const ROW_CHIP_EDGE =
  'shrink-0 whitespace-nowrap border-[color:var(--color-border-soft)] hover:border-[color:var(--color-border-strong)]';

/**
 * **A settled state is a badge, the same one the agents tab uses** (round 3). "Ready" used to be
 * drawn as a button-shaped box with a check, so on the MCP tab a finished row looked pressable,
 * while the agents tab one press away says the same word as a dot and a tag. One word, one shape.
 * Exported so the runtime rows read it from here rather than keeping a second copy.
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
        /* A fixed floor with the word centred, so the badges form one column down a list
           instead of ending wherever their word does. */
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
   * The verb's glyph. Every row action on this destination leads with one (round 3), so a write
   * without its own glyph falls back to the plug rather than standing bare beside chips that
   * carry theirs.
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
  // A failure is a state of this control, so it is said on this control. One sentence serves
  // every action here: what did not happen is already in the label beside it.
  const isFailed = feedback === "failed";
  // The native 16px micro mark sits in the existing 14px slot, keeping the label in place.
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
      onClick={onClick}
      disabled={isBusy}
      /* The row beside this button already names the tool and its file, so only the verb is
         drawn; the sentence stays as the accessible name (see `Wording`). */
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
  // A deeplink uses a custom URL scheme, so this is a plain anchor rather than a next Link. The
  // OS wakes the client with no new window.
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
