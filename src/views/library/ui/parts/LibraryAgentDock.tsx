"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Library } from "lucide-react";

import { cn } from "@/shared/lib/cn";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { usePanelPresence } from "@/shared/lib/use-presence";
import { AGENT_DOCK_INSET_SURFACE_CLASS, Surface } from "@/shared/ui";
import { AcpChatPanel, AcpChatResizeHandle, AcpDockHeader, useChatWidth } from "@/widgets/acp-chat-panel";

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
 */
export interface LibraryAgentOpeningRequest {
  kind: "compile";
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
  knownSlugs,
  onClose,
}: {
  open: boolean;
  runtime: LibraryAgentRuntime;
  runtimes: readonly LibraryAgentRuntime[];
  onRuntimeChange: (runtimeId: string) => void;
  vaultRoot: string;
  mcpServers: unknown[];
  openingRequest: LibraryAgentOpeningRequest | null;
  knownSlugs: ReadonlySet<string>;
  onClose: () => void;
}) {
  const tChat = useTranslations("acpChat");
  const tLibrary = useTranslations("library");
  const chatWidth = useChatWidth();
  const presence = usePanelPresence(open);
  const [enabledRequestNonce, setEnabledRequestNonce] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !openingRequest) return;
    /*
     * Below xl the conversation is an overlay sheet: it takes no width from the reading
     * pane, so there is no reflow for process startup to compete with, and one frame is
     * enough. At xl the dock really does resize the workbench, and the width transition
     * below — not a timer that merely resembles it — owns the handoff.
     */
    const wide =
      typeof window === "undefined" || typeof window.matchMedia !== "function"
        ? true
        : window.matchMedia("(min-width: 1280px)").matches;
    if (wide) return;
    const nonce = openingRequest.nonce;
    const frame = window.requestAnimationFrame(() => setEnabledRequestNonce(nonce));
    return () => window.cancelAnimationFrame(frame);
  }, [open, openingRequest]);

  return (
    <div
      data-testid="library-agent-dock-frame"
      data-right-dock={open || presence.mounted ? "library-agent" : undefined}
      onTransitionEnd={(event) => {
        if (
          event.target === event.currentTarget &&
          event.propertyName === "width" &&
          open &&
          openingRequest
        ) {
          setEnabledRequestNonce(openingRequest.nonce);
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
      {presence.mounted ? (
        <Surface
          open={open}
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
            sessionEnabled={
              open && openingRequest !== null && enabledRequestNonce === openingRequest.nonce
            }
            openingRequest={openingRequest}
            knownSlugs={knownSlugs}
          />
        </Surface>
      ) : null}
    </div>
  );
}
