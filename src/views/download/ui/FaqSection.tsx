'use client';

import { useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/public-pages/gateway-frame';
import { MOTION, MOTION_EASE } from '@/shared/motion/tokens';

import { usePlayOnce } from '../lib/use-play-once';
import { FAQ_KEYS, splitAnswer } from '../model/faq';
import { SectionIntro } from './SectionIntro';

const EASE = `cubic-bezier(${MOTION_EASE.join(', ')})`;
const RULE_MS = MOTION.expressive.duration * 1000;
const RISE_MS = MOTION.slow.duration * 1000;
/** The question starts as the rule is half drawn; the answer follows a beat later. */
const QUESTION_AT_MS = RULE_MS / 2;
const ANSWER_LAG_MS = 80;
const RISE_PX = 8;

/** One row's entrance: the rule draws from the left, then the question and the answer rise. */
function rowEntrance(row: HTMLLIElement): Animation[] {
  const rule = row.querySelector('[data-faq-rule]');
  const question = row.querySelector('[data-faq-question]');
  const answer = row.querySelector('[data-faq-answer]');
  if (!rule || !question || !answer) return [];
  const rise = [
    { opacity: 0, transform: `translateY(${RISE_PX}px)` },
    { opacity: 1, transform: 'translateY(0)' },
  ];
  return [
    rule.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], {
      duration: RULE_MS,
      easing: EASE,
      fill: 'backwards',
    }),
    question.animate(rise, { duration: RISE_MS, delay: QUESTION_AT_MS, easing: EASE, fill: 'backwards' }),
    answer.animate(rise, {
      duration: RISE_MS,
      delay: QUESTION_AT_MS + ANSWER_LAG_MS,
      easing: EASE,
      fill: 'backwards',
    }),
  ];
}

/**
 * Short answers to what a first-time visitor asks before installing, every one open: a question
 * folded behind a toggle is one more click, and a sentence a reader or an answer engine can quote
 * as it stands. The route's FAQPage markup carries the same words; the first sentence, the direct
 * answer, is set in full ink and the rest a step quieter.
 */
export function FaqSection() {
  const t = useTranslations('download.faq');
  return (
    <section
      id="faq"
      data-testid="gateway-faq-section"
      className={cn(PAGE_GUTTER, 'mt-[var(--gateway-section-gap)] w-full scroll-mt-24')}
    >
      <div className={cn(PAGE_COLUMN, '@container min-w-0')}>
        <SectionIntro eyebrow={t('eyebrow')} title={t('title')} />
        <ul className="mt-10 flex min-w-0 flex-col">
          {FAQ_KEYS.map((key) => (
            <FaqRow key={key} question={t(`items.${key}.q`)} answer={t(`items.${key}.a`)} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function FaqRow({ question, answer }: { question: string; answer: string }) {
  const row = usePlayOnce<HTMLLIElement>(rowEntrance);
  const { lead, gap, rest } = splitAnswer(answer);
  return (
    <li
      ref={row}
      data-testid="gateway-faq-row"
      className="relative grid min-w-0 gap-x-12 gap-y-3 py-8 @min-[52rem]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
    >
      <span
        aria-hidden
        data-faq-rule
        className="absolute inset-x-0 top-0 h-px origin-left bg-[color:var(--color-divider)]"
      />
      <h3
        data-faq-question
        className="min-w-0 [text-wrap:balance] text-display leading-display font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]"
      >
        {question}
      </h3>
      <p
        data-faq-answer
        className="min-w-0 max-w-[38rem] text-reading leading-prose text-[color:var(--color-text-secondary)]"
      >
        <span className="font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">{lead}</span>
        {gap}
        {rest}
      </p>
    </li>
  );
}
