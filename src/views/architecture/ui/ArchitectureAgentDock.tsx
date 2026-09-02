'use client';

import { useEffect, useState } from 'react';

import type { AcpTurnActivity } from '@/features/acp-session';
import { cn } from '@/shared/lib/cn';
import { usePanelPresence } from '@/shared/lib/use-presence';
import { AGENT_DOCK_INSET_SURFACE_CLASS, Surface } from '@/shared/ui';
import {
  AcpChatPanel,
  AcpChatResizeHandle,
  useChatWidth,
} from '@/widgets/acp-chat-panel';
import type { ArchitectureAgentRuntime } from '../model/architecture-agent';

export interface ArchitectureAgentOpeningRequest {
  kind: 'draft' | 'change' | 'verify';
  text: string;
  nonce: number;
}

/**
 * The guarded ACP conversation, kept in the Architecture workbench instead of handed to Map.
 * The outer frame claims width first; the process starts after that movement settles, so agent
 * startup cannot stall the one animation that explains where the canvas space went.
 */
export function ArchitectureAgentDock({
  open,
  runtime,
  runtimes,
  onRuntimeChange,
  vaultRoot,
  mcpServers,
  openingRequest,
  knownSlugs,
  onTurnActivityChange,
  onClose,
}: {
  open: boolean;
  runtime: ArchitectureAgentRuntime;
  runtimes: readonly ArchitectureAgentRuntime[];
  onRuntimeChange: (runtimeId: string) => void;
  vaultRoot: string;
  mcpServers: unknown[];
  openingRequest: ArchitectureAgentOpeningRequest | null;
  knownSlugs: ReadonlySet<string>;
  onTurnActivityChange?: (activity: AcpTurnActivity | null) => void;
  onClose: () => void;
}) {
  const chatWidth = useChatWidth();
  const presence = usePanelPresence(open);
  const [enabledRequestNonce, setEnabledRequestNonce] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !openingRequest) return;
    /*
     * Below xl the conversation is an overlay sheet: it takes no width from the canvas, so there
     * is no canvas reflow for process startup to compete with. One frame lets the entered surface
     * paint first. At xl the dock really does resize the workbench, and the width transition event
     * below — not a timer that merely resembles it — owns the handoff.
     */
    const wide = typeof window === 'undefined' || typeof window.matchMedia !== 'function'
      ? true
      : window.matchMedia('(min-width: 1280px)').matches;
    if (wide) return;
    const nonce = openingRequest.nonce;
    const frame = window.requestAnimationFrame(() => setEnabledRequestNonce(nonce));
    return () => window.cancelAnimationFrame(frame);
  }, [open, openingRequest]);

  return (
    <div
      data-testid="architecture-agent-dock-frame"
      data-right-dock={open || presence.mounted ? 'architecture-agent' : undefined}
      onTransitionEnd={(event) => {
        if (
          event.target === event.currentTarget &&
          event.propertyName === 'width' &&
          open &&
          openingRequest
        ) {
          setEnabledRequestNonce(openingRequest.nonce);
        }
      }}
      style={{
        '--architecture-agent-chat-width': `${chatWidth.width}px`,
        transitionProperty: 'width',
        transitionDuration: 'var(--agent-panel-reflow-duration)',
        transitionTimingFunction: 'var(--topology-motion-ease-out)',
      } as React.CSSProperties}
      className={cn(
        'absolute right-0 top-0 z-30 min-h-0 overflow-hidden bg-[color:var(--color-canvas)]',
        'bottom-[calc(var(--topology-mobile-bottom-tab-reserve)+0.75rem)] lg:bottom-0',
        'xl:relative xl:inset-auto xl:z-auto xl:shrink-0',
        open
          ? 'w-full xl:w-[var(--architecture-agent-chat-width)]'
          : 'pointer-events-none w-0 xl:w-0',
      )}
    >
      {presence.mounted ? (
        <Surface
          open={open}
          as="aside"
          motion="overlay"
          data-testid="architecture-agent-dock"
          data-agent-dock-surface="inset"
          data-agent-request-kind={openingRequest?.kind}
          className={`${AGENT_DOCK_INSET_SURFACE_CLASS} left-3 flex min-h-0 w-auto shrink-0 flex-col p-4 xl:left-auto xl:w-[calc(var(--architecture-agent-chat-width)-var(--chrome-inset))]`}
        >
          <div className="hidden xl:contents">
            <AcpChatResizeHandle
              width={chatWidth.width}
              onWidth={chatWidth.setWidth}
              onCommit={chatWidth.commitWidth}
            />
          </div>
          <AcpChatPanel
            key={runtime.id}
            runtimeId={runtime.id}
            runtimeLabel={runtime.label}
            runtimes={runtimes}
            onRuntimeChange={onRuntimeChange}
            vaultRoot={vaultRoot}
            mcpServers={mcpServers}
            sessionEnabled={
              open &&
              openingRequest !== null &&
              enabledRequestNonce === openingRequest.nonce
            }
            openingRequest={openingRequest}
            knownSlugs={knownSlugs}
            onTurnActivityChange={onTurnActivityChange}
            onClose={onClose}
          />
        </Surface>
      ) : null}
    </div>
  );
}
