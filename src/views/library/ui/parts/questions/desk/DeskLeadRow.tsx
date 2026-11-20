'use client';

import { useId, type ReactNode, type Ref } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { BookText, FileText } from 'lucide-react';

import { deskLeadTermRuns, deskSentenceWindow, passageLabelText, type DeskCitation, type DeskLead } from '@/features/library';
import { truncateMiddlePath } from '@/shared/lib/concept-display/truncate-middle-path';
import { passageLabelFor } from '@/shared/lib/library/source-passage';
import { Chip } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { MOTION, OVERLAY_RISE, OVERLAY_SETTLED } from '@/shared/motion';
import { StateBadge } from '../../index-column/StateBadge';

const INLINE_CITATION = /\[\[src:[^\]]+\]\]/g;
const CITED_PRESSES = 2;
const NAME_BUDGET = 36;

export type CitationState = 'observed' | 'unmeasured' | 'stale' | 'missing';

/** A source line as read: a list, quote or heading marker at its start is layout, not the sentence. */
export function passageSentence(text: string): string {
  return text.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s+|>\s*)+/u, '').trim() || text;
}

export function claimSentence(text: string): string {
  return text.replace(INLINE_CITATION, '').replace(/[ \t]{2,}/gu, ' ').replace(/\s+([.,!?;:)\]])/gu, '$1').trim();
}

function fileName(path: string): string {
  return truncateMiddlePath(path.split('/').pop() || path, NAME_BUDGET);
}

/**
 * One lead: the sentence, then where it lives. The whole row is one press (its button's `after`
 * covers the row); the cited files and the Jev press sit above that layer as their own controls,
 * so no button is nested in another.
 */
export function DeskLeadRow({ lead, terms, reason, citationState, jev, jevResult, rise, riseDelay, openRef, onOpenWiki, onOpenSource }: {
  lead: DeskLead;
  terms: readonly string[];
  /** Why the row is here, when search by meaning took part; it ends the second line. */
  reason: string | null;
  citationState: (citation: DeskCitation) => CitationState;
  /** The Jev press, when this row can be checked here. */
  jev: { busy: boolean; onCheck: () => void } | null;
  jevResult: ReactNode;
  /** Rise into place on mount: true only for rows appended by Show more. */
  rise: boolean;
  riseDelay: number;
  openRef?: Ref<HTMLButtonElement>;
  onOpenWiki: (slug: string) => void;
  onOpenSource: (path: string, anchor?: string) => void;
}) {
  const t = useTranslations('library');
  const whereId = useId();
  // The window is cut before the highlight runs, so a megabyte line costs the row 320 characters.
  const sentence = deskSentenceWindow(lead.kind === 'claim' ? claimSentence(lead.claim.text) : passageSentence(lead.hit.text), terms);
  const runs = deskLeadTermRuns(lead, sentence, terms);
  const place = (citation: DeskCitation) => passageLabelText(passageLabelFor(citation.anchor, []), citation.anchor, t);
  const states = lead.kind === 'claim' ? lead.claim.citations.map(citationState) : [];
  const attention = lead.kind !== 'claim' ? null
    : lead.claim.citations.length === 0 ? t('questionDesk.noCitation')
      : states.includes('missing') ? t('questionDesk.sourceState.missing')
        : states.includes('stale') ? t('questionDesk.sourceState.stale') : null;
  const cited = lead.kind === 'claim' ? lead.claim.citations.slice(0, CITED_PRESSES) : [];
  const uncited = lead.kind === 'claim' ? lead.claim.citations.length - cited.length : 0;
  /* `md` is the second line's own label size; the cited file differs from the file name only by ink. */
  const quietPress = controlClass({ shape: 'link', size: 'md', tone: 'default', hoverInk: 'strong', className: 'relative z-10 max-w-full leading-label' });
  /* Line two in order; the reason stays joined to its last item, so a wrap never starts a line with its dot. */
  const where: ReactNode[] = [
    ...(lead.kind === 'claim' ? [<span key="title" className="min-w-0 max-w-full truncate text-[color:var(--color-text-secondary)]">{lead.claim.pageTitle}</span>]
      : [
        <span key="file" className="min-w-0 truncate text-[color:var(--color-text-secondary)]" title={lead.hit.path}>{fileName(lead.hit.path)}</span>,
        <span key="place" className="flex-none">{place(lead.hit)}</span>,
      ]),
    ...(attention ? [<span key="attention" title={attention}><StateBadge tone="warning">{t('questionDesk.reviewBadge')}</StateBadge><span className="sr-only">{attention}</span></span>] : []),
    ...cited.map((citation) => <button key={`${citation.path}#${citation.anchor}`} type="button" className={quietPress}
      title={citation.path} data-cited-path={citation.path} data-cited-anchor={citation.anchor}
      onClick={() => onOpenSource(citation.path, citation.anchor)}>
      <span className="truncate">{fileName(citation.path)} · {place(citation)}</span>
    </button>),
    ...(lead.kind === 'claim' && uncited > 0 ? [<button key="uncited" type="button" className={quietPress}
      aria-label={`+${uncited} · ${lead.claim.pageTitle}`}
      onClick={() => onOpenWiki(lead.claim.pageSlug)}>+{uncited}</button>] : []),
  ];

  return <motion.li layout="position" data-testid="question-desk-lead" data-lead-kind={lead.kind}
    initial={rise ? OVERLAY_RISE : false} animate={OVERLAY_SETTLED}
    transition={{ ...MOTION.base, delay: riseDelay, layout: MOTION.base }}
    className="group relative -mx-3 flex items-start gap-3 rounded-card px-3 py-3 transition-colors hover:bg-[color:var(--color-overlay-2)] focus-within:bg-[color:var(--color-overlay-2)]">
    <div className="min-w-0 flex-1">
      <button ref={openRef} type="button" aria-describedby={whereId} data-lead-open="true"
        onClick={() => lead.kind === 'claim' ? onOpenWiki(lead.claim.pageSlug) : onOpenSource(lead.hit.path, lead.hit.anchor)}
        aria-label={sentence}
        className="block w-full text-left text-[color:var(--color-text-primary)] after:absolute after:inset-0 after:rounded-card after:content-[''] focus-visible:text-[color:var(--color-indigo-text-soft)] focus-visible:outline-hidden focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-[color:var(--color-indigo-focus-ring)]">
        <span data-lead-sentence="true" className="line-clamp-2 break-words text-body-lg leading-body-lg">
          {runs.map((run, index) => run.strong
            ? <span key={index} className="font-[var(--font-weight-emphasis)]">{run.text}</span>
            : <span key={index}>{run.text}</span>)}
        </span>
      </button>
      <div id={whereId} data-lead-where="true" className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-label leading-label text-[color:var(--color-text-tertiary)]">
        <span className="flex w-4 flex-none items-center justify-center opacity-60">
          {lead.kind === 'claim' ? <BookText size={ICON_SIZE.sm} aria-hidden /> : <FileText size={ICON_SIZE.sm} aria-hidden />}
        </span>
        {where.slice(0, -1)}
        {reason ? <span className="flex min-w-0 max-w-full items-center gap-x-2">
          {where.at(-1)}
          <span className="flex flex-none items-center gap-x-2" data-lead-reason={lead.reason}>
            <span aria-hidden="true">·</span>
            <span>{reason}</span>
          </span>
        </span> : where.at(-1)}
      </div>
      {jevResult}
    </div>
    {jev ? <Chip aria-disabled={jev.busy} onClick={jev.onCheck}
      className="relative z-10 flex-none self-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100">
      {jev.busy ? t('questionDesk.jev.checking') : t('questionDesk.jev.check')}
    </Chip> : null}
  </motion.li>;
}
