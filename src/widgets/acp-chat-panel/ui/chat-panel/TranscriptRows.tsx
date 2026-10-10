import type { Components } from 'react-markdown';

import { cn } from '@/shared/lib/cn';

import type { groupEvents } from '../group-events';
import { TranscriptEntry } from '../transcript/TranscriptEntry';
import { WorkGroup } from '../transcript/WorkGroup';
import type { AnswerFold, NoticeActions } from './types';

interface TranscriptRowsProps {
  items: ReturnType<typeof groupEvents>;
  busy: boolean;
  knownSlugs?: ReadonlySet<string>;
  onHoverSlug?: (slug: string | null) => void;
  markdownComponents: Components;
  noticeActions: NoticeActions | null;
  liveToolIds: ReadonlySet<string>;
  awaitingToolId: string | null;
  declinedToolIds: ReadonlySet<string>;
  lastWorkGroupId: string | undefined;
  answerFold: AnswerFold | null;
  foldedAnswerIds: ReadonlySet<string>;
}

export function TranscriptRows({
  items,
  busy,
  knownSlugs,
  onHoverSlug,
  markdownComponents,
  noticeActions,
  liveToolIds,
  awaitingToolId,
  declinedToolIds,
  lastWorkGroupId,
  answerFold,
  foldedAnswerIds,
}: TranscriptRowsProps) {
  return items.map((item, index) => {
    if (item.kind === 'toolRun')
      return (
        <div
          key={item.id}
          data-acp-entry="tool-run"
          data-tool-run-count={item.count}
          data-tool-run-rows={item.rows.length}
          className="flex flex-col gap-0.5 border-l border-[color:var(--color-divider)] pl-2"
        >
          {item.rows.map((row) => (
            <TranscriptEntry
              key={row.event.id}
              event={row.event}
              repeat={row.repeat}
              knownSlugs={knownSlugs}
              onHoverSlug={onHoverSlug}
              markdownComponents={markdownComponents}
              noticeActions={noticeActions}
              live={liveToolIds.has(row.event.id)}
              awaiting={row.event.id === awaitingToolId}
              declined={declinedToolIds.has(row.event.id)}
            />
          ))}
        </div>
      );
    if (item.kind === 'workGroup')
      return (
        <WorkGroup
          key={item.id}
          events={item.events}
          active={busy && item.id === lastWorkGroupId}
          knownSlugs={knownSlugs}
          onHoverSlug={onHoverSlug}
          markdownComponents={markdownComponents}
        />
      );

    const turnStart = item.event.kind === 'user' && index > 0;
    return (
      <div
        key={item.event.id}
        data-turn-start={turnStart ? 'true' : undefined}
        className={cn(
          'flex flex-col',
          turnStart &&
            'mt-2 border-t border-[color:var(--color-divider)] pt-3',
        )}
      >
        <TranscriptEntry
          event={item.event}
          knownSlugs={knownSlugs}
          onHoverSlug={onHoverSlug}
          markdownComponents={markdownComponents}
          noticeActions={noticeActions}
          fold={answerFold && foldedAnswerIds.has(item.event.id) ? answerFold : null}

          streaming={busy && index === items.length - 1}
          live={false}
          awaiting={false}
          declined={false}
        />
      </div>
    );
  });
}
