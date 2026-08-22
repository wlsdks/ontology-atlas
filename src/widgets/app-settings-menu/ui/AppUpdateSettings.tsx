'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { RefreshCw } from 'lucide-react';

import { useAppUpdateContext } from '@/features/app-update';
import { isDesktopShell } from '@/shared/lib/desktop-shell';
import { Chip } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/icon-size';

import { DETAIL_TOGGLE_CHIP, SettingsGroup, SettingsRow } from './settings-primitives';

/**
 * 「앱」 (app) — the version in use and **an update check you press yourself.**
 *
 * ## Why it was missing (owner report, 2026-08-20)
 *
 * Automatic checking and the bottom-right toast have existed since 2026-07-27. But
 * **there was no way for the user to press it** — `useAppUpdate` exposes
 * `check(manual)` and **0 places** in the whole repository called it, while
 * 「최신이에요」 (the `current` stage) **could not even be drawn**, because the toast
 * returned `null` for it. The design was complete and the wiring was not.
 *
 * The hole that left open: automatic checks run **once a day** and a dismissal is
 * remembered for that version. So anyone who pressed 「나중에」 once had **no way to
 * reach an update at all** until the next version shipped.
 *
 * ## Why installation does not happen here
 *
 * Download, install and restart are already handled by the toast. Building the same
 * flow twice draws progress in two places and nobody knows which is real. This
 * pane's one job is **starting the check**, and the result always continues in the
 * same place (the toast).
 *
 * ## Not drawn on the web
 *
 * A browser tab cannot replace itself. Talking about updates there **offers
 * something we cannot do**, so there is not even a degradation card — the section
 * simply does not exist.
 */
export function AppUpdateSettings() {
  const t = useTranslations('nav.settingsMenu.appUpdate');
  const update = useAppUpdateContext();
  const [version, setVersion] = useState<string | null>(null);

  /*
   * The running version comes from **what the bundle knows**. A build constant would
   * state "what this source was when it was built" rather than "what I am running".
   */
  useEffect(() => {
    if (!isDesktopShell()) return;
    let alive = true;
    void import('@tauri-apps/api/app')
      .then(({ getVersion }) => getVersion())
      .then((value) => {
        if (alive) setVersion(value);
      })
      .catch(() => {
        // If it cannot be read, the version line is not drawn — no value is invented.
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!isDesktopShell() || !update) return null;

  const phase = update.phase;
  const checking = phase.kind === 'checking';
  /*
   * **What it says** — only what was measured. Before a press there is no result
   * line. After `available`, the toast takes over, so this only announces the fact.
   */
  const outcome = (() => {
    switch (phase.kind) {
      case 'current':
        return t('resultCurrent');
      case 'available':
        return t('resultAvailable', { version: phase.version });
      case 'downloading':
        return t('resultDownloading', { version: phase.version });
      case 'ready':
        return t('resultReady', { version: phase.version });
      case 'failed':
        return phase.operation === 'check' ? t('resultFailed') : t('resultInstallFailed');
      default:
        return undefined;
    }
  })();

  return (
    <div className="grid min-w-0 gap-3" data-testid="app-settings-update">
      <p className="min-w-0 break-keep px-1 text-label leading-label text-[color:var(--color-text-quaternary)]">
        {t('intro')}
      </p>
      <SettingsGroup>
        <SettingsRow
          label={t('versionLabel')}
          caption={version ? t('versionValue', { version }) : undefined}
          testId="app-settings-update-version"
          control={
            <Chip
              size="lg"
              tone="secondary"
              data-testid="app-settings-update-check"
              disabled={checking}
              onClick={update.checkNow}
              className={DETAIL_TOGGLE_CHIP}
            >
              <RefreshCw size={ICON_SIZE.md} aria-hidden />
              {checking ? t('checking') : t('check')}
            </Chip>
          }
        />
      </SettingsGroup>
      {outcome ? (
        <p
          data-testid="app-settings-update-result"
          data-phase={phase.kind}
          role="status"
          aria-live="polite"
          className="min-w-0 break-keep px-1 text-label leading-label text-[color:var(--color-text-tertiary)]"
        >
          {outcome}
        </p>
      ) : null}
    </div>
  );
}
