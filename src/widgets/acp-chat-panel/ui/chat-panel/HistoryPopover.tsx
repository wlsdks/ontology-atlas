import type { RefObject } from 'react';

import { formatDate } from '@/shared/lib/format-date';
import { RowButton, Surface } from '@/shared/ui';
import { badgeClass } from '@/shared/ui/badge-class';

import type { ChatT, SessionState } from './types';

interface HistoryPopoverProps {
  t: ChatT;
  open: boolean;
  sessions: SessionState['sessions'];
  listRef: RefObject<HTMLUListElement | null>;
  edge: { top: boolean; bottom: boolean };
  mask: string | undefined;
  onMeasure: () => void;
  onPick: (sessionId: string) => void;
}

export function HistoryPopover({
  t,
  open,
  sessions,
  listRef,
  edge,
  mask,
  onMeasure,
  onPick,
}: HistoryPopoverProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-full z-10 mb-2 flex justify-end px-[var(--card-pad)]">
      <Surface
        open={open && sessions.length > 0}
        origin="bottom right"
        motion="overlay"
        className="pointer-events-auto w-[min(320px,100%)]"
      >
        <div className="overflow-hidden rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] shadow-[var(--shadow-elevation-2)]">
          <div className="flex items-center justify-between gap-2 border-b border-[color:var(--color-divider)] px-3 py-2">
            <p className="text-label leading-label text-[color:var(--color-text-tertiary)]">
              {t('history')}
            </p>
            <span
              className={badgeClass({
                shape: 'micro',
                className:
                  'bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-quaternary)]',
              })}
            >
              {sessions.length}
            </span>
          </div>
          <ul
            ref={listRef}
            onScroll={onMeasure}
            data-testid="acp-chat-history-list"
            data-edge-overflow={
              edge.top && edge.bottom
                ? 'both'
                : edge.bottom
                  ? 'bottom'
                  : edge.top
                    ? 'top'
                    : undefined
            }
            style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
            className="atlas-scroll-quiet grid max-h-64 gap-0.5 overflow-y-auto p-1"
          >
            {sessions.map((session) => (
              <li key={session.sessionId}>
                <RowButton
                  data-testid="acp-chat-history-item"
                  data-session-id={session.sessionId}
                  onClick={() => onPick(session.sessionId)}

                  hoverSurface="lift"
                  hoverInk="strong"
                  className="w-full"
                >
                  <span className="grid min-w-0 flex-1 gap-0.5 text-left">
                    <span className="truncate text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
                      {session.title ?? t('untitled')}
                    </span>

                    <span className="truncate text-label leading-label text-[color:var(--color-text-quaternary)]">
                      {session.updatedAt ? formatDate(session.updatedAt) : '\u00A0'}
                    </span>
                  </span>
                </RowButton>
              </li>
            ))}
          </ul>
        </div>
      </Surface>
    </div>
  );
}
