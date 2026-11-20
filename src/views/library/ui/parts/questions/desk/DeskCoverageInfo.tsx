'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Info } from 'lucide-react';

import { IconButton } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { LibraryHomePopover } from '../../LibraryHomePopover';

/** The search's scope, limits and caveat behind one glyph, said once instead of under every lead. */
export function DeskCoverageInfo({ lines, testId = 'question-desk-coverage-info' }: {
  /** Each line once, in reading order; the first is the strongest. */
  lines: readonly string[];
  testId?: string;
}) {
  const t = useTranslations('library');
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  return <>
    <IconButton ref={anchorRef} label={t('questionDesk.coverageDetails')} tone="muted" hoverInk="strong"
      aria-expanded={open} active={open}
      onClick={() => setOpen((current) => !current)} data-testid={testId}>
      <Info size={ICON_SIZE.md} aria-hidden />
    </IconButton>
    <LibraryHomePopover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} align="start"
      title={t('questionDesk.coverageDetails')} testId={`${testId}-popover`} t={t}>
      <div className="space-y-2 px-4 py-3 text-label leading-body">
        {lines.map((line, index) => <p key={line} className={index === 0
          ? 'text-[color:var(--color-text-secondary)]'
          : 'text-[color:var(--color-text-tertiary)]'}>{line}</p>)}
      </div>
    </LibraryHomePopover>
  </>;
}
