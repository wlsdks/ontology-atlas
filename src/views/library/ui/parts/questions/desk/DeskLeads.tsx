'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';

import { deskSentenceWindow, passageLabelText, type DeskCitation, type DeskClaim, type DeskLead } from '@/features/library';
import { passageLabelFor } from '@/shared/lib/library/source-passage';
import { Chip } from '@/shared/ui';
import { EXIT_TRANSITION, MOTION, OVERLAY_RISE, OVERLAY_SETTLED } from '@/shared/motion';
import { staggerDelaySeconds } from '@/shared/motion/stagger';
import { claimSentence, DeskLeadRow, type CitationState } from './DeskLeadRow';
import { DeskJevResult, type useDeskJev } from './DeskJev';
import { useDeskSwap } from './use-desk-swap';

/** Rows shown before Show more: enough to hold the answer, few enough to read at once. */
export const FIRST_LEADS = 3;

export interface DeskLeadSet {
  searchId: number;
  leads: readonly DeskLead[];
  terms: readonly string[];
}

/**
 * The leads of one search. A new search swaps the whole list in this slot, so the head above
 * stays where it is; Show more appends in place and hands focus to the first new row.
 */
export function DeskLeads({ set, expandedFor, onShowMore, reduced, citationState, jev, canCheck, onOpenWiki, onOpenSource }: {
  set: DeskLeadSet;
  /** The search whose list Show more has opened, if any. */
  expandedFor: number | null;
  onShowMore: () => void;
  reduced: boolean;
  citationState: (claim: DeskClaim, citation: DeskCitation) => CitationState;
  jev: ReturnType<typeof useDeskJev>;
  /** Whether Jev can run here at all: the installed app, with a folder on disk. */
  canCheck: boolean;
  onOpenWiki: (slug: string) => void;
  onOpenSource: (path: string, anchor?: string) => void;
}) {
  const t = useTranslations('library');
  const swap = useDeskSwap(set, reduced);
  const expanded = expandedFor === set.searchId;
  const firstAppended = useRef<HTMLButtonElement | null>(null);
  const appendedFor = useRef<number | null>(null);
  useEffect(() => {
    if (!expanded || appendedFor.current === set.searchId) return;
    appendedFor.current = set.searchId;
    firstAppended.current?.focus({ preventScroll: false });
  }, [expanded, set.searchId]);

  return <div className="relative">
    {swap.map(({ value, leaving }) => {
      const shown = value.searchId === expandedFor ? value.leads : value.leads.slice(0, FIRST_LEADS);
      return <motion.div key={value.searchId} data-testid={leaving ? undefined : 'question-desk-evidence-leads'}
        inert={leaving} aria-hidden={leaving || undefined}
        className={leaving ? 'pointer-events-none absolute inset-x-0 top-0' : undefined}
        initial={reduced ? false : OVERLAY_RISE}
        animate={leaving ? { opacity: 0, y: 0 } : OVERLAY_SETTLED}
        transition={leaving ? EXIT_TRANSITION : MOTION.base}>
        <ul>
          {shown.map((lead, index) => {
            const claim = lead.kind === 'claim' ? lead.claim : null;
            const first = claim?.citations[0] ?? null;
            const judgment = claim && first ? jev.findingFor(claim, first) : null;
            return <DeskLeadRow key={lead.key} lead={lead} terms={value.terms}
              citationState={(citation) => citationState(claim!, citation)}
              rise={!leaving && index >= FIRST_LEADS && !reduced}
              riseDelay={staggerDelaySeconds(index - FIRST_LEADS)}
              openRef={!leaving && index === FIRST_LEADS ? firstAppended : undefined}
              jev={canCheck && claim && first ? { busy: jev.preparing || jev.sending, onCheck: () => void jev.prepare(claim, first) } : null}
              jevResult={judgment && claim && first ? <DeskJevResult judgment={judgment} sentence={deskSentenceWindow(claimSentence(claim.text), value.terms)}
                where={`${claim.pageTitle} · ${first.path.split('/').pop()} · ${passageLabelText(passageLabelFor(first.anchor, []), first.anchor, t)}`} /> : null}
              onOpenWiki={onOpenWiki} onOpenSource={onOpenSource} />;
          })}
        </ul>
        {!leaving && value.searchId !== expandedFor && value.leads.length > FIRST_LEADS ? <div className="mt-3">
          <Chip tone="secondary" hoverInk="strong" hoverSurface="lift" onClick={onShowMore} data-testid="question-desk-show-more">
            {t('questionDesk.showMore', { count: value.leads.length - FIRST_LEADS })}
          </Chip>
        </div> : null}
      </motion.div>;
    })}
  </div>;
}
