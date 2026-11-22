'use client';

import { useTranslations } from 'next-intl';
import { CircleHelp } from 'lucide-react';

import { Button } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

/** Opens "Where settings live"; the page header and the browser's stage both carry it. */
export function WhereSettingsButton({ onClick, variant = 'header' }: { onClick: () => void; variant?: 'header' | 'stage' }) {
  const t = useTranslations('harness');
  return variant === 'stage' ? (
    <Button variant="ghost" size="lg" data-testid="where-settings-open" className="atlas-touch-floor atlas-touch-floor-wide" onClick={onClick}>
      {t('scopes.open')}
    </Button>
  ) : (
    <Button
      variant="ghost"
      size="sm"
      data-testid="where-settings-open"
      className="border-[color:var(--color-border-soft)] text-[color:var(--color-text-secondary)]"
      onClick={onClick}
    >
      <CircleHelp size={ICON_SIZE.sm} aria-hidden />
      <span className="max-sm:sr-only">{t('scopes.open')}</span>
    </Button>
  );
}
