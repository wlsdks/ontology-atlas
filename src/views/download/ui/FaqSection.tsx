'use client';

import { useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/public-pages/gateway-frame';

import { FAQ_KEYS } from '../model/faq';
import { SectionIntro } from './SectionIntro';

/**
 * Short answers to what a first-time visitor asks before installing, every one open: a question
 * folded behind a toggle is one more click, and a sentence a reader or an answer engine can quote
 * as it stands. The route's FAQPage markup carries the same words.
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
        <dl className="mt-9 grid min-w-0 gap-x-12 @min-[52rem]:grid-cols-2">
          {FAQ_KEYS.map((key) => (
            <div key={key} className="min-w-0 border-t border-[color:var(--color-border-soft)] py-6">
              <dt>
                <h3 className="text-title leading-title font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                  {t(`items.${key}.q`)}
                </h3>
              </dt>
              <dd className="mt-2 text-body leading-body text-[color:var(--color-text-tertiary)]">
                {t(`items.${key}.a`)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
