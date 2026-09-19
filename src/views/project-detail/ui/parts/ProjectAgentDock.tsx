"use client";

import { useEffect, useRef, useState } from "react";
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

  // The session is enabled once the frame's width transition has ended (see `onTransitionEnd`);
  // narrow viewports and reduced motion have no transition to wait for, so they settle on the
  // next frame instead.
  useEffect(() => {
    if (!open) {
      const frame = window.requestAnimationFrame(() => setSettled(false));
      return () => window.cancelAnimationFrame(frame);
    }
    const wide =
      typeof window === "undefined" || typeof window.matchMedia !== "function"
        ? true
        : window.matchMedia("(min-width: 1280px)").matches;
    if (wide && !bornOpenRef.current) return;
    const frame = window.requestAnimationFrame(() => setSettled(true));
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  return (
    <div
      data-testid="project-agent-dock-frame"
      data-right-dock={open || presence.mounted ? "project-agent" : undefined}
      data-dock-state={open ? "open" : standing ? "put-away" : "empty"}
      inert={!open}
      aria-hidden={!open || undefined}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && event.propertyName === "width" && open) {
          setSettled(true);
        }
      }}
      style={
        {
          "--project-agent-chat-width": `${chatWidth.width}px`,
          transitionProperty: "width",
          transitionDuration: "var(--agent-panel-reflow-duration)",
          transitionTimingFunction: "var(--topology-motion-ease-out)",
        } as React.CSSProperties
      }
      className={cn(
        "absolute right-0 top-0 z-30 min-h-0 overflow-hidden bg-[color:var(--color-canvas)]",
        "bottom-[calc(var(--topology-mobile-bottom-tab-reserve)+0.75rem)] lg:bottom-0",
        "xl:relative xl:inset-auto xl:z-auto xl:shrink-0",
        open ? "w-full xl:w-[var(--project-agent-chat-width)]" : "pointer-events-none w-0 xl:w-0",
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
