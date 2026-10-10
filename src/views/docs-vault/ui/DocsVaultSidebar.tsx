'use client';

import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { cn } from '@/shared/lib/cn';
import { IconButton, Surface } from '@/shared/ui';

export function DocsVaultSidebar({
  sourceTreeOpen,
  setSourceTreeOpen,
  docListCollapsed,
  docListLeaving,
  docListToggled,
  children,
}: {
  sourceTreeOpen: boolean;
  setSourceTreeOpen: Dispatch<SetStateAction<boolean>>;
  docListCollapsed: boolean;
  docListLeaving: boolean;
  docListToggled: boolean;
  children: ReactNode;
}) {
  const t = useTranslations('docsVault');
  return (
    <>
      {/* Tree navigation is opt-in so the document surface stays primary. */}
      {/* Full-screen surface: opacity-only motion. */}
      <Surface
        open={sourceTreeOpen}
        motion="overlay"
        className="fixed inset-0 z-40 flex"
      >
          <div
            className="absolute inset-0 bg-[color:var(--color-scrim-a50)]"
            onClick={() => setSourceTreeOpen(false)}
            aria-hidden
          />
          <aside className="relative flex w-[300px] max-w-[84vw] flex-col overflow-auto border-r border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] shadow-[var(--shadow-elevation-dock-side)] md:w-[340px]">
            <div className="flex h-12 flex-none items-center justify-between border-b border-[color:var(--color-border-soft)] px-3">
              <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
                {t('mobileDrawer.title')}
              </span>
              <IconButton
                label={t('mobileDrawer.closeAriaLabel')}
                onClick={() => setSourceTreeOpen(false)}
                className="hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
              >
                <X size={ICON_SIZE.md} aria-hidden />
              </IconButton>
            </div>
            <div className="flex flex-1 flex-col overflow-auto">
              {children}
            </div>
          </aside>
      </Surface>

      <aside
        data-testid="docs-vault-doc-list"
        data-doc-list-state={docListCollapsed ? (docListLeaving ? 'exiting' : 'collapsed') : 'open'}
        aria-label={t('mobileDrawer.title')}
        aria-hidden={docListCollapsed}
        inert={docListCollapsed}
        className={cn(
          'hidden w-[var(--docs-list-width)] flex-none flex-col overflow-hidden border-r border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]',
          !docListCollapsed
            ? cn('lg:flex', docListToggled && 'map-overlay-in')
            : docListLeaving && 'map-overlay-out absolute inset-y-0 left-0 lg:flex',
        )}
      >
        {children}
      </aside>
    </>
  );
}
