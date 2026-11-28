import { useId, type MouseEvent } from 'react';
import { useTranslations } from 'use-intl';
import { Button } from '@/shared/ui';
import { MeaningGuidePreview } from './MeaningGuidePreview';

export function MeaningGuideCard({ playing, onStart, onLater }: {
  playing: boolean;
  onStart: (event: MouseEvent<HTMLButtonElement>) => void;
  onLater: () => void;
}) {
  const t = useTranslations('library.questionDesk.meaning.guide');
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      data-testid="meaning-guide-card"
      className="relative mt-1 flex flex-col gap-3 overflow-hidden rounded-panel border border-[color:var(--color-indigo-line-a22)] bg-[color:var(--color-panel)] p-4"
    >
      <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-[radial-gradient(closest-side,var(--color-indigo-a14),transparent)]" />
      <div className="relative flex min-w-0 flex-col gap-1">
        <h3 id={titleId} className="text-body-lg font-[var(--font-weight-strong)] leading-title text-[color:var(--color-text-primary)]">{t('title')}</h3>
        <p className="max-w-[70ch] text-body leading-body text-[color:var(--color-text-secondary)]">{t('body')}</p>
      </div>
      <MeaningGuidePreview playing={playing} />
      <div className="relative flex flex-wrap items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onLater} data-testid="meaning-guide-later">{t('later')}</Button>
        <Button size="sm" variant="primary" onClick={onStart} data-testid="meaning-guide-start">{t('start')}</Button>
      </div>
    </section>
  );
}
