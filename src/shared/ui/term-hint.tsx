'use client';

import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { TERM_GLOSSARY, type GlossaryTerm } from '@/shared/config/term-glossary';
import { cn } from '@/shared/lib/cn';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { Tooltip } from '@/shared/ui/tooltip';

export function TermHint({
  term,
  children,
  className,
}: {
  term: GlossaryTerm;
  children?: ReactNode;
  className?: string;
}) {
  const t = useTranslations('termHints');
  const name = TERM_GLOSSARY[term].label;
  return (
    <span className={cn('inline-flex items-center gap-1 align-middle', className)} data-term-hint={term}>
      {children}
      <Tooltip
        toggleOnPress
        side="bottom"
        align="start"
        delayMs={150}
        panelClassName="max-w-[min(20rem,calc(100vw-2rem))] px-3 py-2"
        content={
          <span className="flex flex-col gap-0.5" data-testid={`term-hint-panel-${term}`}>
            <span className="text-label font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
              {t(`${term}.expansion`)}
            </span>
            <span className="text-label leading-label text-[color:var(--color-text-secondary)]">
              {t(`${term}.explanation`)}
            </span>
          </span>
        }
      >
        <button
          type="button"
          aria-label={t('trigger', { term: name })}
          data-testid={`term-hint-${term}`}
          className={controlClass({ shape: 'icon', tone: 'muted', hoverInk: 'strong', hoverSurface: 'lift', className: 'h-6 w-6' })}
        >
          <Info size={ICON_SIZE.md} aria-hidden="true" />
        </button>
      </Tooltip>
    </span>
  );
}
