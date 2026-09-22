'use client';

import { useEffect, type RefObject } from 'react';
import { ChevronDown, FolderOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useDismissibleMenu } from '@/shared/lib/use-dismissible-menu';
import { Button, RowButton, Surface } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/icon-size';

/** Returning users choose a folder; creation stays in one compact disclosure. */
export function FirstRunFolderActions({ busy, showJustStart, onOpen, onCreate, trigger }: {
  trigger: RefObject<HTMLButtonElement | null>;
  busy: boolean;
  showJustStart: boolean;
  onOpen: () => void;
  onCreate: (kind: 'just-start' | 'create') => void;
}) {
  const t = useTranslations('vaultSwitch.choose');
  const { open, setOpen, ref } = useDismissibleMenu();
  const tFirstRun = useTranslations('firstRun');
  useEffect(() => {
    if (!open) return;
    // WebKit does not focus a button on a pointer click. Escape must still return
    // to the trigger when focus stayed on the page rather than inside the menu.
    const restoreOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') trigger.current?.focus();
    };
    window.addEventListener('keydown', restoreOnEscape, true);
    return () => window.removeEventListener('keydown', restoreOnEscape, true);
  }, [open, trigger]);
  const choose = (kind: 'just-start' | 'create') => {
    setOpen(false);
    onCreate(kind);
  };

  return (
    <div className="relative flex min-w-0 max-w-full flex-wrap items-center gap-2" aria-busy={busy} data-testid="first-run-folder-actions">
      <Button size="sm" className="atlas-touch-floor" variant="outline" onClick={onOpen} disabled={busy} data-testid="first-run-open">
        <FolderOpen size={ICON_SIZE.sm} aria-hidden />
        {busy ? tFirstRun('busy') : t('openAction')}
      </Button>
      <div ref={ref}>
        <Button ref={trigger} size="sm" className="atlas-touch-floor" variant="ghost" disabled={busy} aria-expanded={open}
          aria-controls="first-run-create-options" onClick={() => setOpen(!open)}
          data-testid="first-run-create-menu">
          {t('createAction')}
          <ChevronDown size={ICON_SIZE.sm} aria-hidden />
        </Button>
        <Surface open={open} className="absolute left-0 top-full z-20 mt-2 w-64 max-w-[calc(100vw-3rem)] origin-top-left rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-2 shadow-[var(--shadow-elevation-2)] sm:right-0 sm:left-auto sm:origin-top-right">
          <div id="first-run-create-options" className="grid gap-1">
            {showJustStart ? <RowButton tone="strong" hoverInk="strong" hoverSurface="lift" className="w-full text-left"
              disabled={busy} onClick={() => choose('just-start')} data-testid="first-run-just-start">
              {t('defaultLocationAction')}
            </RowButton> : null}
            <RowButton tone="strong" hoverInk="strong" hoverSurface="lift" className="w-full text-left"
              disabled={busy} onClick={() => choose('create')} data-testid="first-run-create">
              {t('chooseLocationAction')}
            </RowButton>
          </div>
        </Surface>
      </div>
    </div>
  );
}
