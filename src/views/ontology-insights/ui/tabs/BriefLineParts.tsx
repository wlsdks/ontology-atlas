'use client';

import { useId, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { controlClass } from '@/shared/ui/control-class';
import { Button } from '@/shared/ui';
import { RowDisclosure } from '@/shared/ui/controls/row-disclosure';
import { HiddenCountLine } from '@/shared/ui/status/hidden-count-line';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { cn } from '@/shared/lib/cn';
import { CopyAgentTextButton } from '../parts/CopyAgentTextButton';
import { buildDriftHandoff } from '../../lib/brief/drift-handoff';
import { parseInsightsTabHref, type InsightsTab } from '../../lib/insights-tab-state';
import type { BriefLine, BriefLineDetail, BriefState } from '../../lib/brief/brief-model';

/**
 * One shape per state, so marks read without colour: a filled dot is something to learn, a hollow ring something
 * nobody checked. Only the two states the headline counts wear a mark, and the headline is their key.
 */
export const STATE_MARK: Record<BriefState, string> = {
  current: '',
  stale: 'mt-[7px] size-2 rounded-full bg-[color:var(--color-amber-source-a90)]',
  unknown: 'mt-[7px] size-2 rounded-full border border-[color:var(--color-text-tertiary)] bg-transparent',
};

export const EMPTY_DETAILS: readonly BriefLineDetail[] = [];
const DETAIL_ROWS = 5;

/** "Get the app" for the download page, "open" elsewhere: two identical labels with different outcomes cost a navigation. */
export function destinationLabel(href: string, t: (key: string) => string): string {
  return href === '/download/' ? t('getApp') : t('open');
}

/**
 * Half of these lines open another question on this board, which keeps its tab in component state, so a
 * plain `<Link>` would change the address and leave the screen. It stays a real link; the plain click is answered in place.
 */
export function DestinationLink({
  href,
  className,
  button,
  onOpenTab,
  children,
}: {
  href: string;
  className?: string;
  /** Wear `className` alone, for a door drawn as a button rather than an inline link. */
  button?: boolean;
  onOpenTab?: (tab: InsightsTab) => void;
  children: React.ReactNode;
}) {
  const sameBoard = onOpenTab ? parseInsightsTabHref(href) : null;
  return (
    <Link
      href={href}
      // `hoverInk: 'strong'` is the registered answer for this shape; without it rest and hover are the same pixel.
      className={button ? className : controlClass({ shape: 'link', hoverInk: 'strong', className: cn('min-w-6 justify-center', className) })}
      data-brief-destination={sameBoard ?? 'away'}
      onClick={
        sameBoard
          ? (event) => {
              // A modified click asks for a second window; leave it alone.
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
              event.preventDefault();
              onOpenTab?.(sameBoard);
            }
          : undefined
      }
    >
      {children}
    </Link>
  );
}


/** A line's sentence as a chevron disclosure over the named rows it was counted from, with the drift handoff and the overflow count. */
export function LineDisclosure({
  line,
  details,
  href,
  nowMs,
  onAskAgent,
  onOpenTab,
  className,
}: {
  line: BriefLine;
  details: readonly BriefLineDetail[];
  href: string | undefined;
  nowMs: number;
  onAskAgent?: (request: string) => void;
  onOpenTab?: (tab: InsightsTab) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const t = useTranslations('ontologyPages.insights.brief');
  const format = useFormatter();
  const locale = useLocale();
  const sentence = t(`line.${line.id}`, { count: line.count });
  const shown = details.slice(0, DETAIL_ROWS);
  // Judging drift is reading work for the coding agent: the request names the rows' concepts, files and dates
  // and asks for a judgement and a proposal, never a write.
  const handoff = line.id === 'ontology-evidence-moved' ? buildDriftHandoff({ rows: details, locale }) : null;
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailId}
        data-testid={`brief-line-open-${line.id}`}
        onClick={() => setOpen((value) => !value)}
        className={controlClass({ shape: 'link', size: 'lg', tone: 'secondary', hoverInk: 'strong', className: 'gap-1.5 text-left' })}
      >
        <ChevronRight size={ICON_SIZE.sm} aria-hidden className={cn('mt-1 shrink-0 self-start transition-transform', open && 'rotate-90')} />
        <span className="min-w-0 break-keep">{sentence}</span>
      </button>
      <RowDisclosure open={open} id={detailId} className="pt-2">
        <ul className="flex flex-col gap-1.5 border-l border-[color:var(--color-divider)] pl-3" data-testid={`brief-line-rows-${line.id}`}>
          {shown.map((row, index) => (
            <li key={`${row.name}-${row.path}-${index}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <Link href={row.href} className={controlClass({ shape: 'link', className: 'text-[color:var(--color-indigo-text-strong)]' })}>
                {row.name}
              </Link>
              <code className="min-w-0 break-all font-mono text-label text-[color:var(--color-text-tertiary)]">{row.path}</code>
              <span className="text-label text-[color:var(--color-text-quaternary)]">
                {row.at
                  ? t('detailMoved', {
                      moved: format.relativeTime(new Date(row.at), nowMs),
                      doc: row.docAt ? format.relativeTime(new Date(row.docAt), nowMs) : t('detailDocUnknown'),
                    })
                  : t('detailGone')}
              </span>
            </li>
          ))}
        </ul>
        {handoff ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 pl-3" data-testid={`brief-line-handoff-${line.id}`}>
            {onAskAgent ? (
              <Button variant="outline" size="sm" onClick={() => onAskAgent(handoff)} data-testid="brief-ask-agent">
                {t('askAgent')}
              </Button>
            ) : null}
            <CopyAgentTextButton label={t('copyRequest')} copiedLabel={t('copiedRequest')} text={handoff} compact />
          </div>
        ) : null}
        <HiddenCountLine
          total={details.length}
          shown={shown.length}
          label={(hidden) => t('detailHidden', { count: hidden })}
          route={href ? <DestinationLink href={href} className="text-[color:var(--color-indigo-text-strong)]" onOpenTab={onOpenTab}>{destinationLabel(href, t)}</DestinationLink> : null}
          className="mt-2 pl-3"
          data-testid={`brief-line-hidden-${line.id}`}
        />
      </RowDisclosure>
    </div>
  );
}
