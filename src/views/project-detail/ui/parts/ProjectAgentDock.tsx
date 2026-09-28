"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/shared/lib/cn";
import { usePanelPresence } from "@/shared/lib/use-presence";
import { AGENT_DOCK_INSET_SURFACE_CLASS, agentDockReflowStyle, OntologyMapKindGlyph, Surface } from "@/shared/ui";
import { AcpChatPanel, AcpChatResizeHandle, AcpDockHeader } from "@/widgets/acp-chat-panel";

import type { ProjectAgentOpeningRequest, ProjectAgentRuntime } from "../../lib/use-project-agent";

/**
 * The guarded ACP conversation docked to a project page. The process starts after the frame's
 * width settles, or startup stalls the animation. Closing only hides the frame (inert, zero
 * width); the running turn stays mounted until the page is left.
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
   * Closing makes the frame inert, which drops focus to `<body>`, so focus returns to the opener,
   * read in a layout effect before any child moves focus into the composer.
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

  // Without a width transition (narrow, reduced motion) the session starts on the next frame.
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
   * Below `xl` the dock covers the page, so focus moves into it. Retried each frame for up to a
   * second, since `focus()` is a no-op while the enter keyframes are `visibility: hidden`.
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
        // Nested surfaces take Escape first.
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
          ...agentDockReflowStyle("width, margin-left"),
        } as React.CSSProperties
      }
      className={cn(
        /*
         * Sticky at the window's height, or a page-tall frame never shows close button and
         * composer together. Below `xl` an equal negative margin makes it an overlay that grows
         * in from the right.
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
            putAway={!open}
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
