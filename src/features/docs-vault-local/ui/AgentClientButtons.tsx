"use client";

import { Fragment, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpRight, Check, Copy, Info, Loader2 } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { Link } from "@/i18n/navigation";
import { AGENT_GRAPH_WORKFLOW_HREF, type AgentServerAvailability } from "@/shared/config";
import { copyText } from "@/shared/lib/copy-text";
import { cn } from "@/shared/lib/cn";
import { Button, buttonVariants } from "@/shared/ui/button";
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

import { AGENT_CLIENTS, type AgentClientId } from "../lib/agent-clients";
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
const ID_TO_CLIENT: Record<AgentClientId, ClientId> = {
  "claude-code": "claudeCode",
  cursor: "cursor",
  antigravity: "antigravity",
  codex: "codex",
};
type Feedback = "idle" | "busy" | "done" | "copied" | "failed";
export type AgentClientConfigState = "missing" | "invalid" | "ready";

export interface AgentClientButtonsProps {
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
  layout?: "stack" | "grid";
}

export function AgentClientButtons({
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
  layout = "stack",
}: AgentClientButtonsProps) {
  const t = useTranslations("agentConnect");
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
    } catch {
      setState(id, "failed");
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
    return (
      <div className="flex flex-col gap-2" data-testid="agent-client-buttons">
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
      </div>
    );
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
          label={t("claudeCodeReady")}
        />
      ) : resolvedMcpJsonState === "invalid" ? (
        <ClientAction
          testId="agent-client-claude-code"
          icon={<Copy size={ICON_SIZE.md} aria-hidden />}
          label={t("replaceClaudeCodeConfig")}
          feedback={feedback.claudeCode}
          copiedLabel={t("replaceClaudeCodeConfigDone")}
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
          label={t("connectClaudeCode")}
          feedback={feedback.claudeCode}
          doneLabel={t("claudeCodeDone")}
          busyLabel={t("connecting")}
          onClick={() => void writeAndConfirm("claudeCode")}
        />
      ) : (
        <ClientAction
          testId="agent-client-claude-code"
          icon={<Copy size={ICON_SIZE.md} aria-hidden />}
          label={t("copyClaudeCodeConfig")}
          feedback={feedback.claudeCode}
          copiedLabel={t("copyClaudeCodeConfigDone")}
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
          label={t("connectCursor")}
          feedback={feedback.cursor}
          doneLabel={t("cursorDone")}
          busyLabel={t("connecting")}
          onClick={() => void writeAndConfirm("cursor")}
        />
      ) : cursorDeeplink ? (
        <ClientLink
          testId="agent-client-cursor"
          icon={<ArrowUpRight size={ICON_SIZE.md} aria-hidden />}
          label={t("connectCursor")}
          href={cursorDeeplink}
        />
      ) : (
        <ClientAction
          testId="agent-client-cursor"
          icon={<Copy size={ICON_SIZE.md} aria-hidden />}
          label={t("copyCursorConfig")}
          feedback={feedback.cursor}
          copiedLabel={t("copyConfigDone")}
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
          label={t("connectAntigravity")}
          feedback={feedback.antigravity}
          doneLabel={t("antigravityDone")}
          busyLabel={t("connecting")}
          onClick={() => void writeAndConfirm("antigravity")}
        />
      ) : (
        <ClientAction
          testId="agent-client-antigravity"
          icon={<Copy size={ICON_SIZE.md} aria-hidden />}
          label={t("copyAntigravityConfig")}
          feedback={feedback.antigravity}
          copiedLabel={t("copyConfigDone")}
          onClick={() => void copyAndConfirm("antigravity", mcpJsonSnippet)}
        />
      ),

    // Codex — Tauri writes the config automatically; the web copies a one-line command.
    codex: () =>
      codexConfigIsReady ? (
        <ClientStatus
          testId="agent-client-codex"
          label={t("codexReady")}
        />
      ) : codexConfigState === "invalid" ? (
        <ClientAction
          testId="agent-client-codex"
          icon={<Copy size={ICON_SIZE.md} aria-hidden />}
          label={t("replaceCodexConfig")}
          feedback={feedback.codex}
          copiedLabel={t("replaceCodexConfigDone")}
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
          label={t("connectCodex")}
          feedback={feedback.codex}
          doneLabel={t("codexDone")}
          busyLabel={t("connecting")}
          onClick={() => void writeAndConfirm("codex")}
        />
      ) : (
        <ClientAction
          testId="agent-client-codex"
          icon={<Copy size={ICON_SIZE.md} aria-hidden />}
          label={t("copyCodexCommand")}
          feedback={feedback.codex}
          copiedLabel={t("copyCodexCommandDone")}
          onClick={() => void copyAndConfirm("codex", codexCommand)}
        />
      ),
  };

  return (
    <div className="flex flex-col gap-2" data-testid="agent-client-buttons" data-layout={layout}>
      <div
        className={
          layout === "grid" ? "grid grid-cols-2 gap-2" : "flex flex-col gap-2"
        }
      >
        {AGENT_CLIENTS.map((client) => (
          <Fragment key={client.id}>{clientRenderers[ID_TO_CLIENT[client.id]]()}</Fragment>
        ))}
      </div>

      {needsManualPath ? (
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
      ) : null}

      {/* The plain-language core line — stdio framed as a local-first advantage. */}
      <p
        data-testid="agent-connect-server-line"
        className="mt-1 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5 text-label leading-prose text-[color:var(--color-text-tertiary)]"
      >
        {t("serverLine")}
      </p>
    </div>
  );
}

/**
 * This column's surface is **decided by `shared/ui/button`** (2026-08-02, design council).
 *
 * Three fragments (`ClientStatus` / `ClientButton` / `ClientLink`) used to rewrite the same class
 * string by hand, and one of them imitated the primitive's opaque `primary` (#5e6ad2) with a
 * translucent `--color-indigo-a24` wash. An inventory found that wash in 24 places across 19
 * files while **zero** went through the `Button` primitive — a spec nobody uses is documentation,
 * not a spec.
 *
 * Using the primitive brings the focus-visible ring with it. Measured: these buttons alone had no
 * `focus-visible:ring`, so the browser default `outline: rgb(208,214,224) auto 1px` appeared,
 * while nine or more other places in the app used the indigo ring token.
 *
 * Only this surface's three dialects are overridden — full width (`w-full`), this sheet's radius
 * (`rounded-chip`), and the settings-sheet type dialect (`text-body`). Everything else (colour,
 * state, press, disabled, focus ring) is owned by the primitive. `size="sm"`'s `h-8` is exactly
 * `--control-h-md` (32px), so the height is unchanged.
 */
function clientControlClass(extra?: string) {
  return cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full rounded-chip text-body", extra);
}

function ClientStatus({
  testId,
  label,
}: {
  testId: string;
  label: string;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      data-testid={testId}
      data-state="ready"
      // A status is not pressable — only the primitive's press affordance is reverted.
      className={clientControlClass("active:translate-y-0")}
    >
      <Check
        size={ICON_SIZE.md}
        aria-hidden
        className="text-[color:var(--color-status-success)]"
      />
      {label}
    </div>
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
  /** Only a glyph that carries state is passed — decoration with no state gets no space. */
  icon?: React.ReactNode;
  label: string;
  feedback: Feedback;
  doneLabel?: string;
  copiedLabel?: string;
  busyLabel?: string;
  onClick: () => void;
}) {
  const isDone = feedback === "done";
  const isCopied = feedback === "copied";
  const isBusy = feedback === "busy";
  const shownIcon = isBusy ? (
    <Loader2 size={ICON_SIZE.md} aria-hidden className="animate-spin" />
  ) : isDone || isCopied ? (
    <Check size={ICON_SIZE.md} aria-hidden />
  ) : (
    icon
  );
  const shownLabel = isBusy
    ? (busyLabel ?? label)
    : isDone
      ? (doneLabel ?? label)
      : isCopied
        ? (copiedLabel ?? label)
        : label;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      data-testid={testId}
      data-state={feedback}
      onClick={onClick}
      disabled={isBusy}
      className={clientControlClass()}
    >
      {shownIcon}
      {shownLabel}
    </Button>
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
  label: string;
  href: string;
}) {
  // A deeplink uses a custom URL scheme, so this is a plain anchor rather than a next Link. The
  // OS wakes the client with no new window.
  return (
    <a
      href={href}
      data-testid={testId}
      className={clientControlClass()}
    >
      {icon}
      {label}
    </a>
  );
}
