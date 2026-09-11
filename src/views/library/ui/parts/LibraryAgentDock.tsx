"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FilePlus2, Library } from "lucide-react";

import type { PageWriteRequest, PageWriteVerdict } from "@/features/library";
import { cn } from "@/shared/lib/cn";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { usePanelPresence } from "@/shared/lib/use-presence";
import { AGENT_DOCK_INSET_SURFACE_CLASS, Chip, Surface, Tooltip } from "@/shared/ui";
import { AcpChatPanel, AcpChatResizeHandle, AcpDockHeader } from "@/widgets/acp-chat-panel";
import type { ComponentProps } from "react";

type AcpChatPanelProps = ComponentProps<typeof AcpChatPanel>;

/**
 * The guarded ACP conversation, docked to the Library.
 *
 * Compile is still a job and not a place (`docs/DECISIONS.md`, 2026-09-05): it starts one
 * turn beside the library it is compiling, rather than sending a person to another screen
 * and asking them to describe the folder they were already looking at. What changed on
 * 2026-09-06 is which screen that is — the library became a destination, so the dock came
 * with it rather than staying beside a document tree it never read.
 *
 * The shape is the one Analysis and Architecture already use, and for the same measured
 * reason: the outer frame claims its width first, and the agent process starts after
 * that movement settles, so process startup cannot stall the one animation that explains
 * where the reading pane went.
 *
 * **The standing-line ladder in the chat panel is the running state.** No spinner is
 * added here — the panel already says what the agent is doing, and a second indicator
 * that only says "something is happening" would compete with the one that says what.
 *
 * **Which library this conversation is about** rides above the shared dock header. The
 * header itself is `AcpDockHeader`, the same one the map and the architecture view use,
 * so its title is the same word on three screens; the eyebrow is what says the turn was
 * started from here and is compiling *this* folder. One lucide `Library` glyph, matching
 * the destination's own rail icon — a second wordmark would be chrome, and a second title
 * would be two headings in eight pixels of each other.
 *
 * ## Closing puts the conversation away; it does not end it (owner, 2026-09-08)
 *
 * *"If I press X mid-conversation and come back in, does the conversation continue? It is
 * supposed to keep working in the background, but it looks like the work just stops."* It
 * did stop. `Surface` unmounts its children once the exit window closes, unmounting
 * `AcpChatPanel` with them, and `useAcpSession`'s cleanup calls `stop()` — which calls
 * `stopAcpSession` and kills the adapter process. A turn in flight died with the press,
 * and the transcript went with it.
 *
 * So the surface stays open for as long as the conversation stands. **The frame is what
 * closes**: its width transitions to zero over `--agent-panel-reflow-duration`, taking the
 * panel with it, and while it is shut the frame is `inert` and `aria-hidden`, so nothing
 * inside is reachable by tab, pointer or screen reader. What is given up is the surface's
 * own 140ms brightness exit, and that reads correctly rather than as a loss: the
 * conversation is **put away**, not dismissed, and it is still there when the frame opens
 * again — with its transcript, its permission card and its running turn.
 *
 * The conversation ends when the person leaves the Library. This whole subtree unmounts
 * then, `stop()` runs, and the adapter really does exit — a background turn is background
 * work on this screen, not a process outliving the screen that started it.
 */
export interface LibraryAgentOpeningRequest {
  /**
   * `compile` writes pages under the permission gate; `lint` reads them and reports; `propose`
   * writes one node through the ontology-write card; `import` fetches documents from a service
   * the person connected and writes them under `sources/`. The dock is the same either way, but
   * the attribute has to say which, or a capture of an import turn reads as a compile that
   * behaved strangely.
   */
  kind: "compile" | "lint" | "propose" | "import" | "ask" | "fix" | "refresh";
  text: string;
  nonce: number;
}

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
  onFileAnswer = null,
  filingAnswer = false,
  noticeActions = null,
  chatWidth,
}: {
  open: boolean;
  runtime: LibraryAgentRuntime;
  runtimes: readonly LibraryAgentRuntime[];
  onRuntimeChange: (runtimeId: string) => void;
  vaultRoot: string;
  mcpServers: unknown[];
  openingRequest: LibraryAgentOpeningRequest | null;
  /**
   * The one app-authored turn whose answer belongs on a page, not in this pane: the wiki
   * check. See `AcpChatPanel`'s `answerFold` — the chat says one line and opens the
   * Check-results page (owner, 2026-09-12).
   */
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
  /** The doors an `auto-allowed` notice carries; see `AcpChatPanelProps.noticeActions`. */
  noticeActions?: AcpChatPanelProps["noticeActions"];
  /**
   * One turn's observable step and target, or `null` between turns. The page draws the
   * resting state from it while this dock is shut — a closed dock with a live turn behind it
   * has to say so, or the background work the owner asked for is invisible work.
   */
  onTurnActivityChange?: AcpChatPanelProps["onTurnActivityChange"];
  /** Active structured ACP tool input for the graph activity bridge. */
  onTurnToolActivityChange?: AcpChatPanelProps["onTurnToolActivityChange"];
  /** Terminal ACP tool rows forwarded as they arrive, before a later turn cancellation can hide them. */
  onTerminalToolObservation?: AcpChatPanelProps["onTerminalToolObservation"];
  /**
   * The dock's width, owned by the page rather than by this frame (2026-09-07).
   *
   * `useChatWidth` keeps the width **during a drag** in local state and only stores it on
   * release, so two instances of the hook disagree for the length of every drag. The page
   * publishes this width as `--app-right-dock-width` — the right-hand wall every floating
   * surface measures against — and a wall that lags the handle by a whole gesture is the
   * defect the variable exists to prevent. One owner, one number.
   */
  chatWidth: {
    width: number;
    setWidth: (width: number) => void;
    commitWidth: (width: number) => void;
  };
}) {
  const tChat = useTranslations("acpChat");
  const tLibrary = useTranslations("library");
  /*
   * Only the right-hand wall reads this gate now. `--app-right-dock-width` is dropped the
   * moment the dock shuts, and surfaces measuring against that wall must not jump into the
   * space while the frame is still travelling out of it — that is the whole of what the exit
   * window is for here. What is drawn is decided by `standing` below.
   */
  const presence = usePanelPresence(open);
  /*
   * **Has this conversation stood up?** Separate from whether it is visible.
   *
   * Once true it stays true for this dock's life, and it is what keeps `Surface` mounted
   * through a close. Deriving it from `open` alone is the defect this file's header records:
   * the panel unmounts, its ACP session stops, and the turn a person left running dies.
   */
  const [standing, setStanding] = useState(open);
  /*
   * Adjusted during render, which is React's own pattern for a value derived from a prop that
   * must then outlive it. In an effect it would be one frame late — and that frame is the first
   * frame of the opening, so the panel would mount after the width had already begun moving.
   * The condition is what keeps it from looping.
   */
  if (open && !standing) setStanding(true);
  /*
   * The session starts once the dock has its width, whichever way it opened. It used to
   * start only for a door's request (the nonce), so a dock opened from the *Conversation*
   * chip sat on "Connecting" forever, and a door pressed into that already-open dock found
   * no width transition to wait for either (installed app, 2026-09-07).
   */
  const [settled, setSettled] = useState(false);
  /*
   * Born wide: a dock mounted while already open has no width transition to wait for.
   * Measured in the installed app on 2026-09-06 — the page remounted the dock mid-request
   * and, at xl, the session waited on a `transitionend` that never came, so the panel sat
   * on "Connecting" and every later chip pressed into a session that never started. Once
   * the dock has closed, the next opening is a real transition again and owns the handoff.
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

  return (
    <div
      data-testid="library-agent-dock-frame"
      data-right-dock={open || presence.mounted ? "library-agent" : undefined}
      data-dock-state={open ? "open" : standing ? "put-away" : "empty"}
      /*
       * A shut frame is **out of reach**, not merely out of sight. The panel behind it keeps
       * its composer, its buttons and possibly a permission card; `overflow-hidden` hides
       * them but leaves every one of them tabbable and readable by assistive technology.
       * `inert` takes the focus with it, which is also what blurs a composer somebody was
       * typing in when they pressed X.
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
          transitionProperty: "width",
          transitionDuration: "var(--agent-panel-reflow-duration)",
          transitionTimingFunction: "var(--topology-motion-ease-out)",
        } as React.CSSProperties
      }
      className={cn(
        "absolute right-0 top-0 z-30 min-h-0 overflow-hidden bg-[color:var(--color-canvas)]",
        "bottom-[calc(var(--topology-mobile-bottom-tab-reserve)+0.75rem)] lg:bottom-0",
        "xl:relative xl:inset-auto xl:z-auto xl:shrink-0",
        open ? "w-full xl:w-[var(--library-agent-chat-width)]" : "pointer-events-none w-0 xl:w-0",
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
          motion="overlay"
          data-testid="library-agent-dock"
          data-agent-dock-surface="inset"
          data-agent-request-kind={openingRequest?.kind}
          className={`${AGENT_DOCK_INSET_SURFACE_CLASS} left-3 flex min-h-0 w-auto shrink-0 flex-col p-4 xl:left-auto xl:w-[calc(var(--library-agent-chat-width)-var(--chrome-inset))]`}
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
            runtimeId={runtime.id}
            runtimeLabel={runtime.label}
            runtimes={runtimes}
            onRuntimeChange={onRuntimeChange}
            vaultRoot={vaultRoot}
            mcpServers={mcpServers}
            sessionEnabled={open && settled}
            /*
             * Reopening lands in the conversation this folder was last having, rather than in a
             * blank one (owner, 2026-09-08). It matters here more than on any other dock,
             * because this is the dock people close: the Library's reader wants the width back.
             * A live session is untouched by it — `start()` returns at its own lock — so this
             * decides only what a *cold* dock opens on, which is the case the owner met after
             * quitting the app.
             */
            resumeLatest
            openingRequest={openingRequest}
            answerFold={answerFold ?? null}
            judgeWrite={judgeWrite}
            autoDecide={autoDecide}
            onTurnStarted={onTurnStarted}
            onTurnActivityChange={onTurnActivityChange}
            onTurnToolActivityChange={onTurnToolActivityChange}
            onTerminalToolObservation={onTerminalToolObservation}
            knownSlugs={knownSlugs}
            noticeActions={noticeActions}
            beforeComposer={
              onFileAnswer ? (
                // The LLM Wiki pattern's "answers can be filed back", standing under the
                // answer it files rather than in the index column (owner, 2026-09-07).
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
              ) : null
            }
          />
        </Surface>
      ) : null}
    </div>
  );
}
