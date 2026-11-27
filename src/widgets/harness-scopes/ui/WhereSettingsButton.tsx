'use client';

import { useTranslations } from 'next-intl';
import { CircleHelp } from 'lucide-react';

import { Button } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

/** Opens "Where settings live" from the page header. */
export function WhereSettingsButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations('harness');
  return (
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
