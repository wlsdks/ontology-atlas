'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { useAnalysisCapture, type AnalysisCaptureContext, type AcpTurnActivity } from '@/features/acp-session';
import { AnalysisWorkbench } from '@/widgets/analysis-workbench';
import { cn } from '@/shared/lib/cn';
import { usePrefersReducedMotion } from '@/shared/lib/use-prefers-reduced-motion';
import { usePanelPresence } from '@/shared/lib/use-presence';
import { AGENT_DOCK_INSET_SURFACE_CLASS, Surface } from '@/shared/ui';
import {
  AcpChatPanel,
  AcpChatResizeHandle,
  useChatWidth,
} from '@/widgets/acp-chat-panel';
import type { ArchitectureAgentRuntime } from '../model/architecture-agent';

export interface ArchitectureAgentOpeningRequest {
  kind: 'draft' | 'change' | 'verify' | 'improve';
  text: string;
  nonce: number;
  profileSlug?: string | null;
  roleId?: string | null;
  scopeKey?: string;
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
  analysisContext,
  contextLabel,
  facts,
  onAnalysisRequest,
  onEvidence,
  sectionRequest,
  onOpeningRequestSent,
  onClose,
}: {
  open: boolean;
  runtime: ArchitectureAgentRuntime | null;
  runtimes: readonly ArchitectureAgentRuntime[];
  onRuntimeChange: (runtimeId: string) => void;
  vaultRoot: string | null;
  mcpServers: unknown[];
  openingRequest: ArchitectureAgentOpeningRequest | null;
  knownSlugs: ReadonlySet<string>;
  onTurnActivityChange?: (activity: AcpTurnActivity | null) => void;
  analysisContext: AnalysisCaptureContext;
  contextLabel: string;
  facts?: ReactNode;
  onAnalysisRequest?: (text: string, parentRunId: string | null) => void;
  onEvidence: (slug: string) => void;
  sectionRequest?: { tab: 'meaning' | 'history' | 'conversation'; nonce: number };
  onOpeningRequestSent?: (nonce: number) => void;
  onClose: () => void;
}) {
  const chatWidth = useChatWidth();
  const presence = usePanelPresence(open);
  const capture = useAnalysisCapture(analysisContext);
  const [conversationActive, setConversationActive] = useState(false);
  const handleSectionChange = useCallback((tab: string) => setConversationActive(tab === 'conversation'), []);
  const reducedMotion = usePrefersReducedMotion();
  const [frameState, setFrameState] = useState({ open, settled: false });
  if (frameState.open !== open) setFrameState({ open, settled: false });
  const frameSettled = frameState.open === open && frameState.settled;

  useEffect(() => {
    if (!open) return;
    /*
     * Below lg the conversation is an overlay sheet: it takes no width from the canvas, so there
     * is no canvas reflow for process startup to compete with. One frame lets the entered surface
     * paint first. At lg the dock really does resize the workbench, and the width transition event
     * below — not a timer that merely resembles it — owns the handoff.
     */
    const wide = typeof window === 'undefined' || typeof window.matchMedia !== 'function'
      ? true
      : window.matchMedia('(min-width: 1024px)').matches;
    if (wide && !reducedMotion) return;
    const frame = window.requestAnimationFrame(() => setFrameState({ open: true, settled: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [open, reducedMotion]);

  return (
    <div
      data-testid="architecture-agent-dock-frame"
      data-right-dock={open || presence.mounted ? 'architecture-agent' : undefined}
      onTransitionEnd={(event) => {
        if (
          event.target === event.currentTarget &&
          event.propertyName === 'width' &&
          open
        ) {
          setFrameState({ open: true, settled: true });
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
        'lg:relative lg:inset-auto lg:z-auto lg:shrink-0',
        open
          ? 'w-full lg:w-[var(--architecture-agent-chat-width)]'
          : 'pointer-events-none w-0 lg:w-0',
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
          className={`${AGENT_DOCK_INSET_SURFACE_CLASS} left-3 flex min-h-0 w-auto shrink-0 flex-col p-4 lg:left-auto lg:w-[calc(var(--architecture-agent-chat-width)-var(--chrome-inset))]`}
        >
          <div className="hidden lg:contents">
            <AcpChatResizeHandle
              width={chatWidth.width}
              onWidth={chatWidth.setWidth}
              onCommit={chatWidth.commitWidth}
            />
          </div>
          <AnalysisWorkbench
            returnFocusSelector={'[data-testid="architecture-review-open"]'}
            context={analysisContext}
            contextLabel={contextLabel}
            capture={capture}
            open={open}
            initialTab={openingRequest ? 'conversation' : 'history'}
            requestNonce={openingRequest?.nonce}
            sectionRequest={sectionRequest}
            onSectionChange={handleSectionChange}
            facts={facts}
            onRequest={onAnalysisRequest}
            onEvidence={onEvidence}
            onClose={onClose}
            conversation={runtime && vaultRoot ? <AcpChatPanel
            key={`${vaultRoot}:${runtime.id}`}
            runtimeId={runtime.id}
            runtimeLabel={runtime.label}
            runtimes={runtimes}
            onRuntimeChange={onRuntimeChange}
            vaultRoot={vaultRoot}
            mcpServers={mcpServers}
            sessionEnabled={
              open &&
              (openingRequest !== null || conversationActive) &&
              frameSettled
            }
            openingRequest={openingRequest}
            requestScopeKey={JSON.stringify([vaultRoot, analysisContext.scope.profileSlug])}
            onOpeningRequestSent={onOpeningRequestSent}
            knownSlugs={knownSlugs}
            onTurnActivityChange={onTurnActivityChange}
            onTurnStarted={capture.onTurnStarted}
            onClose={onClose}
          /> : undefined}
          />
        </Surface>
      ) : null}
    </div>
  );
}
