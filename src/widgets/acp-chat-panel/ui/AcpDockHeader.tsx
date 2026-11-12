'use client';

import { useTranslations } from 'next-intl';

import { CloseButton } from '@/shared/ui';

/**
 * The host owns closing: the meaning workbench has its own close band; the chat panel draws none.
 * A dock with no band of its own wears this one.
 */
export function AcpDockHeader({ title, caption, onClose }: { title: string; caption?: string; onClose: () => void }) {
  const t = useTranslations('acpChat');
  return (
    <header data-testid="acp-dock-header" className="flex shrink-0 items-end justify-between gap-x-4 pb-3">
      <div className="min-w-0 flex-1">
        {caption ? <p className="text-caption text-[color:var(--color-text-secondary)]">{caption}</p> : null}
        <h2 className="break-keep text-title font-[var(--font-weight-signature)] leading-title text-[color:var(--color-text-primary)]">
          {title}
        </h2>
      </div>
      <CloseButton label={t('close')} data-testid="acp-dock-close" onClick={onClose} />
    </header>
  );
}
