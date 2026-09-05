'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

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

import type { InsightsAgentPrefill, InsightsAgentRuntime } from '../../lib/insights-agent';

/**
 * One ACP conversation owned by Analysis rather than by any individual tab.
 * The dock sits outside the keyed tab panel, so tab changes cannot remount the
 * session or replace draft text. Only a new explicit prefill nonce changes it.
 */
export function InsightsAgentDock({
  open,
  runtime,
  runtimes,
  onRuntimeChange,
  vaultRoot,
  mcpServers,
  prefillRequest,
  contextLabel,
  knownSlugs,
  knownRelations,
  onDraftPresenceChange,
  onPresentationOpenMap,
  onTurnActivityChange,
  analysisContext,
  onEvidence,
  onClose,
}: {
  open: boolean;
  runtime: InsightsAgentRuntime;
  runtimes: readonly InsightsAgentRuntime[];
  onRuntimeChange: (runtimeId: string) => void;
  vaultRoot: string;
  mcpServers: unknown[];
  prefillRequest: InsightsAgentPrefill | null;
  contextLabel: string;
  knownSlugs: ReadonlySet<string>;
  knownRelations: ReadonlySet<string>;
  onDraftPresenceChange: (present: boolean) => void;
  onPresentationOpenMap: (slug: string, toolCallId: string) => void;
  onTurnActivityChange?: (activity: AcpTurnActivity | null) => void;
  analysisContext: AnalysisCaptureContext;
  onEvidence: (slug: string) => void;
  onClose: () => void;
}) {
  const chatWidth = useChatWidth();
  const reducedMotion = usePrefersReducedMotion();
  const presence = usePanelPresence(open);
  const [openingRequest, setOpeningRequest] = useState<{ text: string; nonce: number; scopeKey: string } | null>(null);
  const [parentRunId, setParentRunId] = useState<string | null>(null);
  const [parentRequestText, setParentRequestText] = useState<string | null>(null);
  const requestSerial = useRef(0);
  if (!open && openingRequest !== null) setOpeningRequest(null);
  const captureContext = useMemo(() => ({ ...analysisContext, parentRunId, parentRequestText }), [analysisContext, parentRunId, parentRequestText]);
  const capture = useAnalysisCapture(captureContext);
  const [enabledRequestNonce, setEnabledRequestNonce] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !prefillRequest) return;
    // A different tab request can be seated while the dock is already open. There
    // is no second width transition in that case, so keep the existing session
    // enabled and let the panel consume the new prefill on the next frame.
    if (enabledRequestNonce !== null) {
      const nonce = prefillRequest.nonce;
      const frame = window.requestAnimationFrame(() => setEnabledRequestNonce(nonce));
      return () => window.cancelAnimationFrame(frame);
    }
    const wide = typeof window === 'undefined' || typeof window.matchMedia !== 'function'
      ? true
      : window.matchMedia('(min-width: 1024px)').matches;
    if (wide && !reducedMotion) return;
    const nonce = prefillRequest.nonce;
    const frame = window.requestAnimationFrame(() => setEnabledRequestNonce(nonce));
    return () => window.cancelAnimationFrame(frame);
  }, [enabledRequestNonce, open, prefillRequest, reducedMotion]);

  return (
    <div
      data-testid="insights-agent-dock-frame"
      data-right-dock={open || presence.mounted ? 'insights-agent' : undefined}
      data-agent-session-scope="vault-runtime"
      onTransitionEnd={(event) => {
        if (
          event.target === event.currentTarget
          && event.propertyName === 'width'
          && open
        ) {
          setEnabledRequestNonce(prefillRequest?.nonce ?? null);
        }
      }}
      style={{
        '--insights-agent-chat-width': `${chatWidth.width}px`,
        transitionProperty: 'width',
        transitionDuration: 'var(--agent-panel-reflow-duration)',
        transitionTimingFunction: 'var(--topology-motion-ease-out)',
      } as React.CSSProperties}
      className={cn(
        'absolute right-0 top-0 z-30 min-h-0 overflow-hidden bg-[color:var(--color-canvas)]',
        'bottom-[calc(var(--topology-mobile-bottom-tab-reserve)+0.75rem)] lg:relative lg:inset-auto lg:bottom-auto lg:z-auto lg:shrink-0',
        open
          ? 'w-full lg:w-[var(--insights-agent-chat-width)]'
          : 'pointer-events-none w-0 lg:w-0',
      )}
    >
      {presence.mounted && prefillRequest ? (
        <Surface
          open={open}
          as="aside"
          motion="overlay"
          data-testid="insights-agent-dock"
          data-agent-dock-surface="inset"
          data-agent-request-kind={prefillRequest.kind}
          className={`${AGENT_DOCK_INSET_SURFACE_CLASS} left-3 flex min-h-0 w-auto shrink-0 flex-col p-4 lg:left-auto lg:w-[calc(var(--insights-agent-chat-width)-var(--chrome-inset))]`}
        >
          <div className="hidden lg:contents">
            <AcpChatResizeHandle
              width={chatWidth.width}
              onWidth={chatWidth.setWidth}
              onCommit={chatWidth.commitWidth}
            />
          </div>
          <AnalysisWorkbench
            context={captureContext}
            contextLabel={contextLabel}
            capture={capture}
            open={open}
            initialTab="conversation"
            requestNonce={prefillRequest.nonce}
            onClose={onClose}
            onEvidence={onEvidence}
            onRequest={(text, parentId) => { setParentRunId(parentId); setParentRequestText(parentId ? text : null); setOpeningRequest({ text, nonce: ++requestSerial.current, scopeKey: JSON.stringify([vaultRoot, 'meaning']) }); }}
            conversation={<AcpChatPanel
            key={`${vaultRoot}:${runtime.id}`}
            runtimeId={runtime.id}
            runtimeLabel={runtime.label}
            runtimes={runtimes}
            onRuntimeChange={onRuntimeChange}
            vaultRoot={vaultRoot}
            mcpServers={mcpServers}
            sessionEnabled={
              open && enabledRequestNonce === prefillRequest.nonce
            }
            prefillRequest={prefillRequest}
            openingRequest={openingRequest}
            requestScopeKey={JSON.stringify([vaultRoot, 'meaning'])}
            onOpeningRequestSent={(nonce) => setOpeningRequest((current) => current?.nonce === nonce ? null : current)}
            knownSlugs={knownSlugs}
            knownRelations={knownRelations}
            presentationIntent={prefillRequest.kind === 'flow' ? 'business-flow' : null}
            presentationRequest={prefillRequest.kind === 'flow' ? prefillRequest.text : null}
            onDraftPresenceChange={onDraftPresenceChange}
            onPresentationOpenMap={onPresentationOpenMap}
            onTurnActivityChange={onTurnActivityChange}
            /*
             * ⚠️ **One close, and it belongs to the workbench** (2026-09-06). The panel drew its
             * own X beside the workbench's, so the dock had two identical buttons a few pixels
             * apart doing exactly the same thing — and the inner one closed a surface it does not
             * own. The chat is a tab inside this workbench; what closes it is the workbench's
             * close button, and `contextLabel` is likewise the workbench header's `h2`, so the
             * panel does not repeat it as a badge either.
             */
            onTurnStarted={capture.onTurnStarted}
          />}
          />
        </Surface>
      ) : null}
    </div>
  );
}
