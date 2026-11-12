'use client';

import { useLayoutEffect, useRef, useSyncExternalStore, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';

import { WidgetErrorFallback } from '@/shared/ui';
import { ErrorBoundary } from '@/shared/ui/fallbacks/error-boundary';

import { awayProps, keptPanels } from '../model/kept-panels';
import { AcpChatPanelBody } from './AcpChatPanel';

function passEscapeToSeat(event: KeyboardEvent<HTMLElement>, node: HTMLElement) {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  event.stopPropagation();
  const relayed = new window.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true });
  if (!node.dispatchEvent(relayed)) event.preventDefault();
}

export function AcpChatPanelKeeper() {
  const panels = useSyncExternalStore(keptPanels.subscribe, keptPanels.read, keptPanels.readNone);
  const t = useTranslations('topology.widgetError');
  const parkingRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    keptPanels.park(parkingRef.current);
    return () => {
      keptPanels.park(null);
      keptPanels.reset();
    };
  }, []);
  return (
    <>
      <div ref={parkingRef} hidden inert aria-hidden data-kept-agent-parking="" />
      {panels.map((panel) =>
        createPortal(
          <div className="contents" onKeyDown={(event) => passEscapeToSeat(event, panel.node)}>
            <ErrorBoundary
              resetKey={panel.key}
              fallback={({ error, reset }) => (
                <WidgetErrorFallback
                  error={error}
                  onReset={reset}
                  title={t('panelTitle')}
                  body={t('body')}
                  retryLabel={t('retry')}
                  className="min-h-0 flex-1"
                />
              )}
            >
              <AcpChatPanelBody
                {...(panel.seated ? panel.props : awayProps(panel.props))}
                onBusyChange={keptPanels.busyReporter(panel.key)}
              />
            </ErrorBoundary>
          </div>,
          panel.node,
          panel.key,
        ),
      )}
    </>
  );
}
