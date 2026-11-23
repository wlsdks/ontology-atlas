'use client';

import { useTranslations } from 'next-intl';

import type { MappingFinishedRequest } from '@/features/work-run';
import { cn } from '@/shared/lib/cn';
import { RowButton } from '@/shared/ui';

import { useMappingDuration } from './use-mapping-duration';

/** The most finished requests listed above the live one; earlier ones are one line that opens them all. */
export const MAPPING_REQUESTS_SHOWN = 5;

const MS_PER_MINUTE = 60_000;

/** A finished request with its place in the run, counted from one. */
export interface NumberedRequest extends MappingFinishedRequest {
  part: number;
}

export function numberedRequests(finished: readonly MappingFinishedRequest[]): NumberedRequest[] {
  return finished.map((request, index) => ({ ...request, part: index + 1 }));
}

/** The one line a finished request reads as, in the conversation and in the run's list. */
export function useRequestLine() {
  const t = useTranslations('acpChat.mapRun');
  const duration = useMappingDuration();
  return (request: NumberedRequest) => t('requestLine', {
    part: request.part,
    gained: Math.max(0, request.gained),
    duration: duration(request.durationMs / MS_PER_MINUTE),
  });
}

/**
 * The run's finished requests above the conversation on screen, one line each, so what an earlier
 * request did stays in view though each ran in its own agent conversation. A line opens its
 * conversation once no request of the run is running.
 */
export function MappingRunRequests({ finished, shownSession, canOpen, onOpen, onOpenAll }: {
  finished: readonly MappingFinishedRequest[];
  /** The conversation on screen: its own line is not repeated above it. */
  shownSession: string | null;
  canOpen: boolean;
  onOpen: (sessionId: string) => void;
  onOpenAll: () => void;
}) {
  const t = useTranslations('acpChat.mapRun');
  const line = useRequestLine();
  const above = numberedRequests(finished).filter((request) => request.sessionId === null || request.sessionId !== shownSession);
  if (above.length === 0) return null;
  const earlier = above.length - MAPPING_REQUESTS_SHOWN;
  const lineClass = 'w-full justify-start text-left text-label leading-label text-[color:var(--color-text-tertiary)]';
  return (
    <ol data-testid="mapping-run-requests" className="grid gap-0.5 pb-2">
      {earlier > 0 ? (
        <li>
          <RowButton data-testid="mapping-run-requests-earlier" onClick={onOpenAll} hoverSurface="lift" hoverInk="strong" className={lineClass}>
            {t('earlier', { count: earlier })}
          </RowButton>
        </li>
      ) : null}
      {above.slice(Math.max(0, earlier)).map((request) => (
        <li key={request.part}>
          <RowButton
            data-testid="mapping-run-request"
            data-request-part={request.part}
            disabled={!canOpen || request.sessionId === null}
            onClick={() => request.sessionId && onOpen(request.sessionId)}
            hoverSurface="lift"
            hoverInk="strong"
            className={cn(lineClass, 'tabular-nums')}
          >
            <span className="truncate">{line(request)}</span>
          </RowButton>
        </li>
      ))}
    </ol>
  );
}
