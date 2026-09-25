"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/shared/lib/cn";
import { usePanelPresence } from "@/shared/lib/use-presence";
import { AGENT_DOCK_INSET_SURFACE_CLASS, OntologyMapKindGlyph, Surface } from "@/shared/ui";
import { AcpChatPanel, AcpChatResizeHandle, AcpDockHeader } from "@/widgets/acp-chat-panel";

import type { ProjectAgentOpeningRequest, ProjectAgentRuntime } from "../../lib/use-project-agent";

/**
 * The guarded ACP conversation, docked to a project page.
 *
 * The shape is the Library's and Analysis's, for the same measured reason: the outer frame
 * claims its width first and the agent process starts after that movement settles, so process
 * startup cannot stall the one animation that explains where the page went. The eyebrow names
 * the project the turn was started from; the header is the shared `AcpDockHeader`, so the title
 * is the same word on four screens.
 *
 * Closing puts the conversation away rather than ending it (owner, 2026-09-08, on the Library
 * dock): the frame's width goes to zero and it turns `inert`, and the panel with its transcript,
 * permission card and running turn stays mounted until the person leaves the page.
 */
export function ProjectAgentDock({
  open,
  projectName,
  runtime,
  runtimes,
  onRuntimeChange,
  vaultRoot,
  mcpServers,
  openingRequest,
  knownSlugs,
  onClose,
  chatWidth,
}: {
  open: boolean;
  projectName: string;
  runtime: ProjectAgentRuntime;
  runtimes: readonly ProjectAgentRuntime[];
  onRuntimeChange: (runtimeId: string) => void;
  vaultRoot: string;
  mcpServers: unknown[];
  openingRequest: ProjectAgentOpeningRequest | null;
  knownSlugs: ReadonlySet<string>;
  onClose: () => void;
  chatWidth: {
    width: number;
    setWidth: (width: number) => void;
    commitWidth: (width: number) => void;
  };
}) {
  const tChat = useTranslations("acpChat");
  const presence = usePanelPresence(open);
  const [standing, setStanding] = useState(open);
  if (open && !standing) setStanding(true);
  const [settled, setSettled] = useState(false);
  const bornOpenRef = useRef(open);
  useEffect(() => {
    if (!open) bornOpenRef.current = false;
  }, [open]);

  /*
   * **Focus goes back where it came from** (2026-09-25 sweep). Closing turns the frame
   * `inert`, and a focused control inside an inert subtree loses focus to `<body>`: the
   * keyboard was left at the top of the document, pages away from the "hand it to an agent"
   * door that opened the dock. The opener is read in a layout effect so it is taken before
   * any child's passive effect can move focus into the composer.
   */
  const frameRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(open);
  useLayoutEffect(() => {
    if (open && !wasOpenRef.current) {
      const active = document.activeElement;
      openerRef.current =
        active instanceof HTMLElement && active !== document.body && !frameRef.current?.contains(active)
          ? active
          : null;
    }
    if (!open && wasOpenRef.current) {
      const active = document.activeElement;
      const focusWasHere = !active || active === document.body || frameRef.current?.contains(active);
      const opener = openerRef.current;
      openerRef.current = null;
      if (focusWasHere && opener?.isConnected) opener.focus();
    }
    wasOpenRef.current = open;
  }, [open]);

  // The session is enabled once the frame's width transition has ended (see `onTransitionEnd`);
  // narrow viewports and reduced motion have no transition to wait for, so they settle on the
  // next frame instead.
  useEffect(() => {
    if (!open) {
      const frame = window.requestAnimationFrame(() => setSettled(false));
      return () => window.cancelAnimationFrame(frame);
    }
    if (!isBelowDockColumn() && !bornOpenRef.current) return;
    const frame = window.requestAnimationFrame(() => setSettled(true));
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  /*
   * **Below `xl` the dock covers the page, so the keyboard goes into it** (2026-09-25 sweep).
   * There the frame is a full-width overlay: focus left on the opener sat on a control the dock
   * now hides, and Tab walked the covered page. Once the frame has settled, focus moves to the
   * composer when it can take text, otherwise to the header's close button; Escape (handled on
   * the frame) puts the dock away and the layout effect above returns focus to the opener. At
   * `xl` the dock is a column beside the page, the opener stays visible, and focus stays put.
   *
   * The surface's enter keyframes start at `visibility: hidden`, where `focus()` is a silent
   * no-op (measured at 1040: the first attempt landed nowhere), so the move is retried each
   * frame until it lands, for at most a second, and stops if the person moved focus meanwhile.
   */
  useEffect(() => {
    if (!open || !settled || !isBelowDockColumn()) return;
    const startedOn = document.activeElement;
    let frameId = 0;
    let tries = 0;
    const attempt = () => {
      const frame = frameRef.current;
      if (!frame || frame.contains(document.activeElement) || document.activeElement !== startedOn) return;
      const target = [
        frame.querySelector<HTMLElement>("[data-acp-composer] textarea:not(:disabled)"),
        frame.querySelector<HTMLElement>('[data-testid="acp-dock-close"]'),
      ].find((el) => el && (el.checkVisibility?.({ visibilityProperty: true }) ?? true));
      target?.focus({ preventScroll: true });
      if ((!target || document.activeElement !== target) && tries++ < 60) {
        frameId = window.requestAnimationFrame(attempt);
      }
    };
    attempt();
    return () => window.cancelAnimationFrame(frameId);
  }, [open, settled]);

  return (
    <div
      ref={frameRef}
      data-testid="project-agent-dock-frame"
      data-right-dock={open || presence.mounted ? "project-agent" : undefined}
      data-dock-state={open ? "open" : standing ? "put-away" : "empty"}
      inert={!open}
      aria-hidden={!open || undefined}
      onKeyDown={(event) => {
        // Nested surfaces (the history list, the slash menu) take Escape first and stop it.
        if (event.key !== "Escape" || event.defaultPrevented || !open || !isBelowDockColumn()) return;
        event.preventDefault();
        onClose();
      }}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && event.propertyName === "width" && open) {
          setSettled(true);
        }
      }}
      style={
        {
          "--project-agent-chat-width": `${chatWidth.width}px`,
          transitionProperty: "width, margin-left",
          transitionDuration: "var(--agent-panel-reflow-duration)",
          transitionTimingFunction: "var(--topology-motion-ease-out)",
        } as React.CSSProperties
      }
      className={cn(
        /*
         * **One window tall at every width** (2026-09-25 sweep). The frame lives in the shell's
         * scrolling body slot beside `main`, and the page row is as tall as the page. At `xl` it
         * used to be a plain `relative` sibling and below `xl` an `absolute top-0` overlay: both
         * stretched to the row, 1389px against a 949px window at 1512 and 1389 against 806 at
         * 1040, so after the page had scrolled the close button sat above the window and, at the
         * top, the composer sat below it; the two were never on screen together. The frame is now
         * sticky to the slot's top at the window's height (less the bottom tab bar below `lg`).
         * Below `xl` it is still an overlay over `main`: a full-width flex item with an equal
         * negative left margin takes no space in the row, and width and margin move together,
         * so it still grows in from the right edge.
         */
        "sticky top-0 z-30 min-h-0 shrink-0 self-start overflow-hidden bg-[color:var(--color-canvas)]",
        "h-[calc(100dvh-var(--topology-mobile-bottom-tab-reserve)-0.75rem)] lg:h-dvh xl:z-auto",
        open
          ? "-ml-[100%] w-full xl:ml-0 xl:w-[var(--project-agent-chat-width)]"
          : "pointer-events-none ml-0 w-0 xl:w-0",
      )}
    >
      {standing ? (
        <Surface
          open={standing}
          as="aside"
          motion="overlay"
          data-testid="project-agent-dock"
          data-agent-dock-surface="inset"
          data-agent-request-kind={openingRequest?.kind}
          className={`${AGENT_DOCK_INSET_SURFACE_CLASS} left-3 flex min-h-0 w-auto shrink-0 flex-col p-4 xl:left-auto xl:w-[calc(var(--project-agent-chat-width)-var(--chrome-inset))]`}
        >
          <div className="hidden xl:contents">
            <AcpChatResizeHandle
              width={chatWidth.width}
              onWidth={chatWidth.setWidth}
              onCommit={chatWidth.commitWidth}
            />
          </div>
          <div className="flex flex-none items-center gap-1.5 pb-1">
            <OntologyMapKindGlyph kind="project" size={13} className="flex-none" />
            <span className="min-w-0 truncate font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
              {projectName}
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
            resumeLatest
            openingRequest={openingRequest}
            knownSlugs={knownSlugs}
          />
        </Surface>
      ) : null}
    </div>
  );
}

/** Below `xl` the dock is an overlay over the page rather than a column beside it. */
function isBelowDockColumn(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return !window.matchMedia("(min-width: 1280px)").matches;
}
