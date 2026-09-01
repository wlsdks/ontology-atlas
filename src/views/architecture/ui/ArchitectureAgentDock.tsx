'use client';

import type { AcpTurnActivity } from '@/features/acp-session';
import { useDelayedVisible, usePanelPresence } from '@/shared/lib/use-presence';
import { MOTION } from '@/shared/motion';
import { AGENT_DOCK_INSET_SURFACE_CLASS, Surface } from '@/shared/ui';
import {
  AcpChatPanel,
  AcpChatResizeHandle,
  useChatWidth,
} from '@/widgets/acp-chat-panel';
import type { ArchitectureAgentRuntime } from '../model/architecture-agent';

export interface ArchitectureAgentOpeningRequest {
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
  const sessionEnabled = useDelayedVisible(open, MOTION.settle.duration * 1000);

  return (
    <div
      data-testid="architecture-agent-dock-frame"
      data-right-dock={open || presence.mounted ? 'architecture-agent' : undefined}
      style={{
        width: open ? `${chatWidth.width}px` : '0px',
        transitionProperty: 'width',
        transitionDuration: 'var(--agent-panel-reflow-duration)',
        transitionTimingFunction: 'var(--topology-motion-ease-out)',
      }}
      className="relative min-h-0 shrink-0 overflow-hidden bg-[color:var(--color-canvas)]"
    >
      {presence.mounted ? (
        <Surface
          open={open}
          as="aside"
          motion="overlay"
          data-testid="architecture-agent-dock"
          data-agent-dock-surface="inset"
          style={{ width: `calc(${chatWidth.width}px - var(--chrome-inset))` }}
          className={`${AGENT_DOCK_INSET_SURFACE_CLASS} flex min-h-0 shrink-0 flex-col p-4`}
        >
          <AcpChatResizeHandle
            width={chatWidth.width}
            onWidth={chatWidth.setWidth}
            onCommit={chatWidth.commitWidth}
          />
          <AcpChatPanel
            key={runtime.id}
            runtimeId={runtime.id}
            runtimeLabel={runtime.label}
            runtimes={runtimes}
            onRuntimeChange={onRuntimeChange}
            vaultRoot={vaultRoot}
            mcpServers={mcpServers}
            sessionEnabled={sessionEnabled}
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
