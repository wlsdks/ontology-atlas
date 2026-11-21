"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FilePlus2, Library } from "lucide-react";

import type { PageWriteRequest, PageWriteVerdict } from "@/features/library";
import { cn } from "@/shared/lib/cn";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { usePanelPresence } from "@/shared/lib/render-timing/use-presence";
import { AGENT_DOCK_INSET_SURFACE_CLASS, agentDockReflowStyle, Chip, Surface, Tooltip } from "@/shared/ui";
import { AcpChatPanel, AcpChatResizeHandle, AcpDockHeader } from "@/widgets/acp-chat-panel";

import { LIBRARY_HANDOFF_APPENDIX } from "../../lib/agent/library-handoff";
import type { ComponentProps } from "react";
import type { LibraryAgentOpeningRequest } from "../../model/turns/library-turn-requests";

export type { LibraryAgentOpeningRequest };

type AcpChatPanelProps = ComponentProps<typeof AcpChatPanel>;

/** Where focus goes back to when the opener itself is gone: the Library's own conversation door. */
const LIBRARY_CONVERSATION_DOOR = '[data-testid="library-open-conversation"]';

export interface LibraryAgentRuntime {
  id: string;
  label: string;
}

export function LibraryAgentDock({
  open,
  runtime,
  runtimes,
  onRuntimeChange,
  vaultRoot,
  mcpServers,
  openingRequest,
  answerFold,
  knownSlugs,
  onClose,
  judgeWrite,
  autoDecide,
  onTurnStarted,
  onTurnActivityChange,
  onTurnToolActivityChange,
  onTerminalToolObservation,
  onTurnStopChange,
  onTurnWorkChange,
  turnReadOnly,
  turnOutlivesScreen,
  onFileAnswer = null,
  filingAnswer = false,
  fileAnswerNote = null,
  noticeActions = null,
  chatWidth,
  indexBeside = false,
}: {
  open: boolean;
  runtime: LibraryAgentRuntime;
  runtimes: readonly LibraryAgentRuntime[];
  onRuntimeChange: (runtimeId: string) => void;
  vaultRoot: string;
  mcpServers: unknown[];
  openingRequest: LibraryAgentOpeningRequest | null;
  /** The app-authored turn whose answer belongs on a page; see `AcpChatPanel`'s `answerFold`. */
  answerFold?: { request: string; line: string; doorLabel: string; onOpen: () => void } | null;
  knownSlugs: ReadonlySet<string>;
  onClose: () => void;
  /** Judges a wiki page write before the permission card asks; see `judgePageWrite`. */
  judgeWrite?: (request: PageWriteRequest) => PageWriteVerdict | null;
  /** Allows a wiki page write that fits without a card; see `LibraryPage`. */
  autoDecide?: AcpChatPanelProps["autoDecide"];
  /** Sees each turn start and hands back what to do when it ends; the wiki log hangs here. */
  onTurnStarted?: AcpChatPanelProps["onTurnStarted"];
  /** Files the last answer as a wiki page; null while there is no answer to file. */
  onFileAnswer?: (() => void) | null;
  /** Keeps the offer visible while its create-only write is pending. */
  filingAnswer?: boolean;
  /** Why the last press on the save chip filed nothing, kept under the chip until the next answer. */
  fileAnswerNote?: string | null;
  /** The doors an `auto-allowed` notice carries; see `AcpChatPanelProps.noticeActions`. */
  noticeActions?: AcpChatPanelProps["noticeActions"];
  /**
   * One turn's observable step and target, or `null` between turns; the page draws the resting state
   * from it while the dock is shut.
   */
  onTurnActivityChange?: AcpChatPanelProps["onTurnActivityChange"];
  /** Active structured ACP tool input for the graph activity bridge. */
  onTurnToolActivityChange?: AcpChatPanelProps["onTurnToolActivityChange"];
  /** Terminal ACP tool rows forwarded as they arrive, before a later turn cancellation can hide them. */
  onTerminalToolObservation?: AcpChatPanelProps["onTerminalToolObservation"];
  onTurnStopChange?: AcpChatPanelProps["onTurnStopChange"];
  onTurnWorkChange?: AcpChatPanelProps["onTurnWorkChange"];
  turnReadOnly?: AcpChatPanelProps["turnReadOnly"];
  turnOutlivesScreen?: AcpChatPanelProps["turnOutlivesScreen"];
  /**
   * The page owns the width: `useChatWidth` keeps the in-flight drag locally, so a second copy lags.
   * The page publishes it as `--app-right-dock-width`.
   */
  chatWidth: {
    width: number;
    setWidth: (width: number) => void;
    commitWidth: (width: number) => void;
  };
  /**
   * Whether the index column is drawn beside the reader. Between `lg` and `xl` the dock is an overlay
   * and starts at the index's right edge instead of covering it.
   */
  indexBeside?: boolean;
}) {
  const tChat = useTranslations("acpChat");
  const tLibrary = useTranslations("library");
  /*
   * Only the right-hand wall reads this gate: `--app-right-dock-width` is dropped the moment the dock
   * shuts, and surfaces measuring against it must not jump in while the frame is still leaving.
   */
  const presence = usePanelPresence(open);
  /*
   * Has this conversation stood up, apart from whether it is visible. Once true it stays true, and keeps
   * `Surface` mounted through a close: deriving it from `open` would unmount the panel, stop its ACP
   * session and kill the turn a person left running.
   */
  const [standing, setStanding] = useState(open);
  /*
   * Adjusted during render: in an effect it would be one frame late, the first frame of the opening, so
   * the panel would mount after the width had begun moving. The condition keeps it from looping.
   */
  if (open && !standing) setStanding(true);
  /* The session starts once the dock has its width, however it opened, not only for a door's request. */
  const [settled, setSettled] = useState(false);
  /*
   * Born wide: a dock mounted already open has no width transition to wait for. After it closes, the
   * next opening is a real transition and owns the handoff.
   */
  const bornOpenRef = useRef(open);
  useEffect(() => {
    if (!open) bornOpenRef.current = false;
  }, [open]);

  useEffect(() => {
    if (!open) {
      // A frame later, like the enabling below: the flag falls with the dock, never inside
      // the render that closed it.
      const frame = window.requestAnimationFrame(() => setSettled(false));
      return () => window.cancelAnimationFrame(frame);
    }
    const wide =
      typeof window === "undefined" || typeof window.matchMedia !== "function"
        ? true
        : window.matchMedia("(min-width: 1280px)").matches;
    // Wide and not born open: the width transition's end is the handoff (below).
    if (wide && !bornOpenRef.current) return;
    const frame = window.requestAnimationFrame(() => setSettled(true));
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  /*
   * Focus moves into the dock on open and back to the opener (or the reader) on close. Keyed on a
   * transition ref so StrictMode's double effect cannot cancel the one focus move.
   */
  const frameRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLElement | null>(null);
  const openerRef = useRef<{ node: HTMLElement | null; testId: string | null }>({ node: null, testId: null });
  /* Starts shut: the page mounts this dock when it is first opened, so a dock born open
     is an opening like any other and owes the same focus move. */
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open === wasOpenRef.current) return;
    wasOpenRef.current = open;
    if (open) {
      const active = document.activeElement;
      const node = active instanceof HTMLElement && active !== document.body && !frameRef.current?.contains(active) ? active : null;
      openerRef.current = { node, testId: node?.getAttribute("data-testid") ?? null };
      /* `Surface` mounts its node a frame or two after `open`, so the move waits for it —
         bounded, and abandoned the moment the dock is shut again. */
      let tries = 0;
      const land = () => {
        if (!wasOpenRef.current) return;
        const surface = surfaceRef.current;
        if (surface) {
          /* The composer when it takes text; the dock itself otherwise — a composer that
             cannot take focus yet (disabled, or not laid out) leaves focus where it was. */
          surface.querySelector<HTMLTextAreaElement>("textarea:not([disabled])")?.focus({ preventScroll: true });
          if (!surface.contains(document.activeElement)) surface.focus({ preventScroll: true });
          if (surface.contains(document.activeElement)) return;
        }
        if (++tries < 30) window.requestAnimationFrame(land);
      };
      window.requestAnimationFrame(land);
      return;
    }
    /* Only when the close left the keyboard nowhere — inside the now-inert dock or on
       `body`. A close caused by a press elsewhere keeps focus where that press put it. */
    const active = document.activeElement;
    if (active && active !== document.body && !frameRef.current?.contains(active)) return;
    const { node, testId } = openerRef.current;
    const visible = (candidate: Element | null): candidate is HTMLElement =>
      candidate instanceof HTMLElement && candidate.isConnected && candidate.getClientRects().length > 0;
    const again = testId ? document.querySelector(`[data-testid="${CSS.escape(testId)}"]`) : null;
    const door = document.querySelector(LIBRARY_CONVERSATION_DOOR);
    const target = visible(node) ? node : visible(again) ? again : visible(door) ? door : document.querySelector<HTMLElement>('[data-testid="library-reader"]');
    target?.focus({ preventScroll: true });
  }, [open]);

  /*
   * Focus that entered the dock does not fall out: the composer can be disabled a moment after taking
   * focus, which drops it to `body`, so while open a focus that left for nowhere lands on the dock.
   */
  useEffect(() => {
    if (!open) return;
    const onFocusOut = (event: FocusEvent) => {
      const surface = surfaceRef.current;
      if (!surface || event.relatedTarget || !surface.contains(event.target as Node)) return;
      window.requestAnimationFrame(() => {
        const active = document.activeElement;
        if (surfaceRef.current && (active === null || active === document.body)) {
          surfaceRef.current.focus({ preventScroll: true });
        }
      });
    };
    document.addEventListener("focusout", onFocusOut, true);
    return () => document.removeEventListener("focusout", onFocusOut, true);
  }, [open]);

  /*
   * Escape puts the overlay away below `xl`, where the dock covers the reader; at `xl` it is a column
   * and Escape stays with whatever else claims it. Listened on `document` in the bubble phase: after
   * the chat panel's own Escape, before the page's, so one press closes one thing.
   */
  useEffect(() => {
    if (!open || typeof window.matchMedia !== "function") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (window.matchMedia("(min-width: 1280px)").matches) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  return (
    <div
      ref={frameRef}
      data-testid="library-agent-dock-frame"
      /*
       * Escape anywhere in the dock puts it away; a composer holding a sentence claims the key first
       * (`defaultPrevented`), so an unsent draft is never taken.
       */
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented || !open) return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      data-right-dock={open || presence.mounted ? "library-agent" : undefined}
      data-dock-state={open ? "open" : standing ? "put-away" : "empty"}
      /*
       * A shut frame is out of reach, not merely out of sight: `overflow-hidden` hides the panel's composer
       * and buttons but leaves them tabbable, and `inert` also blurs a composer someone was typing in.
       */
      inert={!open}
      aria-hidden={!open || undefined}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && event.propertyName === "width" && open) {
          setSettled(true);
        }
      }}
      style={
        {
          "--library-agent-chat-width": `${chatWidth.width}px`,
          ...agentDockReflowStyle("width"),
        } as React.CSSProperties
      }
      className={cn(
        "absolute right-0 top-0 z-30 min-h-0 overflow-hidden bg-[color:var(--color-canvas)]",
        "bottom-[calc(var(--topology-mobile-bottom-tab-reserve)+0.75rem)] lg:bottom-0",
        "xl:relative xl:inset-auto xl:z-auto xl:shrink-0",
        open
          ? cn("w-full xl:w-[var(--library-agent-chat-width)]", indexBeside && "lg:w-[calc(100%-var(--docs-list-width))]")
          : "pointer-events-none w-0 xl:w-0",
      )}
    >
      {standing ? (
        <Surface
          /*
           * Open for as long as the conversation stands, so the panel — and the ACP session
           * inside it — survives the close. The frame above owns the movement and the reach.
           */
          open={standing}
          as="aside"
          ref={surfaceRef}
          tabIndex={-1}
          aria-label={tChat("dockTitle")}
          motion="overlay"
          data-testid="library-agent-dock"
          data-agent-dock-surface="inset"
          data-agent-request-kind={openingRequest?.kind}
          className={`${AGENT_DOCK_INSET_SURFACE_CLASS} left-3 flex min-h-0 w-auto shrink-0 flex-col p-4 focus-visible:outline-none xl:left-auto xl:w-[calc(var(--library-agent-chat-width)-var(--chrome-inset))]`}
        >
          <div className="hidden xl:contents">
            <AcpChatResizeHandle
              width={chatWidth.width}
              onWidth={chatWidth.setWidth}
              onCommit={chatWidth.commitWidth}
            />
          </div>
          <div className="flex flex-none items-center gap-1.5 pb-1">
            <Library
              size={ICON_SIZE.sm}
              aria-hidden
              className="flex-none text-[color:var(--color-text-quaternary)]"
            />
            <span className="min-w-0 truncate font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
              {tLibrary("title")}
            </span>
          </div>
          <AcpDockHeader title={tChat("dockTitle")} onClose={onClose} />
          <AcpChatPanel
            key={runtime.id}
            keepKey={`library:${vaultRoot}:${runtime.id}`}
            parksTurns="chosen"
            runtimeId={runtime.id}
            runtimeLabel={runtime.label}
            runtimes={runtimes}
            onRuntimeChange={onRuntimeChange}
            vaultRoot={vaultRoot}
            mcpServers={mcpServers}
            sessionEnabled={open && settled}
            resumeLatest
            putAway={!open}
            openingRequest={openingRequest}
            answerFold={answerFold ?? null}
            judgeWrite={judgeWrite}
            autoDecide={autoDecide}
            onTurnStarted={onTurnStarted}
            onTurnActivityChange={onTurnActivityChange}
            onTurnToolActivityChange={onTurnToolActivityChange}
            onTerminalToolObservation={onTerminalToolObservation}
            onTurnStopChange={onTurnStopChange}
            onTurnWorkChange={onTurnWorkChange}
            turnReadOnly={turnReadOnly}
            turnOutlivesScreen={turnOutlivesScreen}
            knownSlugs={knownSlugs}
            noticeActions={noticeActions}
            systemPromptAppendix={LIBRARY_HANDOFF_APPENDIX}
            beforeComposer={
              onFileAnswer ? (
                // The save offer stands under the answer it files, not in the index column.
                <div className="flex flex-col items-start gap-1.5">
                  <Tooltip content={tLibrary("wiki.fileAnswerTooltip")}>
                    <Chip
                      data-testid="library-file-answer"
                      onClick={onFileAnswer}
                      disabled={filingAnswer}
                      aria-busy={filingAnswer || undefined}
                      tone="secondary"
                      hoverInk="strong"
                      aria-label={tLibrary("wiki.fileAnswerTooltip")}
                    >
                      <FilePlus2 size={ICON_SIZE.sm} aria-hidden />
                      <span>{tLibrary(filingAnswer ? "localCompile.applying" : "wiki.fileAnswer")}</span>
                    </Chip>
                  </Tooltip>
                  {fileAnswerNote ? (
                    <p
                      data-testid="library-file-answer-note"
                      role="status"
                      className="text-label leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
                    >
                      {fileAnswerNote}
                    </p>
                  ) : null}
                </div>
              ) : null
            }
          />
        </Surface>
      ) : null}
    </div>
  );
}
