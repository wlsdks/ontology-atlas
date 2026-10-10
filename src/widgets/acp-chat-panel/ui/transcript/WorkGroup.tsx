import { memo, useState } from 'react';
import type { Components } from 'react-markdown';
import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';

import type { AcpEvent } from '@/features/acp-session';
import { cn } from '@/shared/lib/cn';
import { useRowDisclosure } from '@/shared/lib/use-row-disclosure';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';

import { workingShimmer } from '../working-ink';
import { TranscriptEntry } from './TranscriptEntry';

interface WorkGroupProps {
  events: readonly Extract<AcpEvent, { kind: 'thought' }>[];
  active: boolean;
  knownSlugs?: ReadonlySet<string>;
  onHoverSlug?: (slug: string | null) => void;
  markdownComponents: Components;
}

function sameWorkGroup(previous: WorkGroupProps, next: WorkGroupProps): boolean {
  return (
    previous.active === next.active
    && previous.knownSlugs === next.knownSlugs
    && previous.onHoverSlug === next.onHoverSlug
    && previous.markdownComponents === next.markdownComponents
    && previous.events.length === next.events.length
    && previous.events.every((event, index) => event === next.events[index])
  );
}

export const WorkGroup = memo(function WorkGroup({
  events,
  active,
  knownSlugs,
  onHoverSlug,
  markdownComponents,
}: WorkGroupProps) {
  const t = useTranslations('acpChat');
  const [open, setOpen] = useState(false);
  const bodyId = `acp-work-${events[0].id}`;
  const { mounted, boxRef, contentRef } = useRowDisclosure(open);
  return (
    <div
      data-acp-entry="work-group"
      data-work-count={events.length}
      data-work-active={active ? 'true' : 'false'}
    >
      <button
        type="button"
        data-testid="acp-chat-work-group"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
        className={controlClass({
          shape: 'link',
          size: 'md',
          tone: 'muted',
          hoverInk: 'secondary',
        })}
      >
        <ChevronRight
          size={ICON_SIZE.sm}
          aria-hidden
          className="transition-transform"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        />

        <span
          aria-hidden
          data-acp-work-active={active ? 'running' : undefined}
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            active
              ? 'bg-[color:var(--color-indigo-accent)] motion-safe:animate-pulse'
              : 'bg-[color:var(--color-text-quaternary)]',
          )}
        />

        <span className={workingShimmer(active)}>
          {t(active ? 'workGroupActive' : 'workGroup', { count: events.length })}
        </span>
      </button>
      <div
        ref={boxRef}
        id={bodyId}
        data-state={open ? 'open' : 'closed'}
        className="ai-row-disclosure"
        inert={!open}
      >
        {mounted ? (
          <div ref={contentRef} className="ai-row-disclosure-body mt-1 grid gap-2 pl-4">
            {events.map((event) => (
              <TranscriptEntry
                key={event.id}
                event={event}
                knownSlugs={knownSlugs}
                onHoverSlug={onHoverSlug}
                markdownComponents={markdownComponents}
                live={false}
                awaiting={false}
                declined={false}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}, sameWorkGroup);
