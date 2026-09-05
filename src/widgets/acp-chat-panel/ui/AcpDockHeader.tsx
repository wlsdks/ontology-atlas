'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { IconButton } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/icon-size';

/**
 * **The host owns closing** (2026-09-06 record). The meaning workbench has a header band with
 * one close; the chat panel draws none and accepts none, and
 * `control-adoption-ratchet.contract.test.ts` holds both halves. A dock that is only a
 * conversation beside a page (Docs, Library) has no band of its own, so this is the one it
 * wears: the same shape as the workbench's, without the tabs, so a person who learned where
 * the close lives on one screen finds it in the same corner on the next.
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
      <IconButton label={t('close')} data-testid="acp-dock-close" onClick={onClose}>
        <X size={ICON_SIZE.sm} aria-hidden />
      </IconButton>
    </header>
  );
}
