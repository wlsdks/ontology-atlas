'use client';

import { useEffect, useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Newspaper } from 'lucide-react';

import { useLocalVault } from '@/entities/vault-session';
import { GITHUB_REPO_URL } from '@/shared/config/social-links';
import { withBasePath } from '@/shared/lib/base-path';
import { isDesktopShell } from '@/shared/lib/desktop-shell';
import { revealAppLogFolder } from '@/shared/lib/tauri-app-logs';
import { requestShortcutSheet } from '@/shared/lib/surface-requests';
import { useCopyFeedback } from '@/shared/lib/use-copy-feedback';
import { usePrefersReducedMotion } from '@/shared/lib/use-prefers-reduced-motion';
import { countVaultContents, describeVaultShape } from '@/shared/lib/vault-shape';
import { Chip } from '@/shared/ui/controls';
import { controlClass } from '@/shared/ui/control-class';
import { Dialog } from '@/shared/ui/dialog';
import { DialogBody, DialogFooter } from '@/shared/ui/dialog-sections';

import { useRunningVersion } from '../../model/use-running-version';
import { AppUpdateSettings } from '../AppUpdateSettings';
import { SettingsDoorRow, SettingsGroup, SettingsRow } from '../settings-primitives';

const WEBSITE_VERSION = process.env.NEXT_PUBLIC_RELEASE_VERSION ?? '';
const LICENSES_PATH = '/third-party-licenses.txt';
const PANE_CHIP =
  'shrink-0 border-[color:var(--color-border-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]';

export function AboutPane({ onLeave }: { onLeave: () => void }) {
  const t = useTranslations('settingsAbout');
  const desktop = isDesktopShell();
  return (
    <div className="grid min-w-0 gap-4" data-testid="app-settings-about">
      {desktop ? (
        <AppUpdateSettings />
      ) : (
        <SettingsGroup label={t('groups.app')}>
          <SettingsRow
            settingId="version"
            label={t('webVersion', { version: WEBSITE_VERSION || t('diagnostic.buildUnknown') })}
            caption={t('webVersionCaption')}
            testId="app-settings-about-web-version"
            control={null}
          />
        </SettingsGroup>
      )}
      <SettingsGroup label={t('groups.help')}>
        <SettingsDoorRow
          settingId="whats-new"
          label={t('rows.whatsNew')}
          caption={t('whatsNewCaption')}
          icon={Newspaper}
          href="/changelog"
          onLeave={onLeave}
          testId="app-settings-about-whats-new"
        />
        <SettingsRow
          settingId="keyboard-shortcuts"
          label={t('rows.keyboardShortcuts')}
          caption={t('shortcutsCaption')}
          testId="app-settings-about-shortcuts"
          control={
            <Chip
              size="lg"
              tone="secondary"
              data-testid="app-settings-about-shortcuts-open"
              onClick={() => {
                onLeave();
                requestShortcutSheet();
              }}
              hoverInk="strong"
              hoverBorder="strong"
              className={PANE_CHIP}
            >
              {t('shortcutsOpen')}
            </Chip>
          }
        />
        <SettingsRow
          settingId="source"
          label={t('rows.source')}
          caption={t('sourceCaption')}
          testId="app-settings-about-source"
          control={
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="app-settings-about-source-link"
              className={controlClass({
                shape: 'chip',
                size: 'lg',
                tone: 'secondary',
                hoverInk: 'strong',
                className: 'shrink-0',
              })}
            >
              <span aria-hidden data-external-link-marker>
                ↗
              </span>
              {t('sourceOpen')}
            </a>
          }
        />
        <LicencesRow />
      </SettingsGroup>
      <SettingsGroup label={t('groups.trouble')}>
        <DiagnosticsRow />
        {desktop ? <LogsRow /> : null}
      </SettingsGroup>
    </div>
  );
}

function LicencesRow() {
  const t = useTranslations('settingsAbout');
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch(withBasePath(LICENSES_PATH))
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error(String(response.status)))))
      .then((body) => {
        if (alive) setText(body);
      })
      .catch(() => {
        if (alive) setText(null);
      });
    return () => {
      alive = false;
      setText(undefined);
    };
  }, [open]);

  return (
    <>
      <SettingsRow
        settingId="licences"
        label={t('rows.licences')}
        caption={t('licencesCaption')}
        testId="app-settings-about-licences"
        control={
          <Chip
            size="lg"
            tone="secondary"
            data-testid="app-settings-about-licences-open"
            onClick={() => setOpen(true)}
            hoverInk="strong"
              hoverBorder="strong"
              className={PANE_CHIP}
          >
            {t('licencesOpen')}
          </Chip>
        }
      />
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="viewport"
        labelledBy={titleId}
        testId="app-settings-about-licences-dialog"
        className="flex flex-col gap-4"
      >
        <h2 id={titleId} className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
          {t('licencesTitle')}
        </h2>
        <DialogBody>
          {text ? (
            <pre className="whitespace-pre-wrap font-mono text-label leading-label text-[color:var(--color-text-secondary)] [overflow-wrap:anywhere]">
              {text}
            </pre>
          ) : (
            <p
              role="status"
              className={
                text === null
                  ? 'text-body text-[color:var(--color-status-warning)]'
                  : 'text-body text-[color:var(--color-text-tertiary)]'
              }
            >
              {text === null ? t('licencesFailed') : t('licencesLoading')}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Chip size="lg" tone="secondary" onClick={() => setOpen(false)} hoverInk="strong"
              hoverBorder="strong"
              className={PANE_CHIP}>
            {t('licencesClose')}
          </Chip>
        </DialogFooter>
      </Dialog>
    </>
  );
}

function DiagnosticsRow() {
  const t = useTranslations('settingsAbout');
  const [open, setOpen] = useState(false);
  const feedback = useCopyFeedback();
  return (
    <>
      <SettingsRow
        settingId="diagnostics"
        label={t('rows.diagnostics')}
        caption={t('diagnosticsCaption')}
        testId="app-settings-about-diagnostics"
        control={
          <Chip
            size="lg"
            tone="secondary"
            aria-expanded={open}
            data-testid="app-settings-about-diagnostics-preview"
            onClick={() => setOpen((value) => !value)}
            hoverInk="strong"
              hoverBorder="strong"
              className={PANE_CHIP}
          >
            {open ? t('diagnosticsHide') : t('diagnosticsPreview')}
          </Chip>
        }
      />
      {open ? <DiagnosticsPreview feedback={feedback} /> : null}
    </>
  );
}

function DiagnosticsPreview({ feedback }: { feedback: ReturnType<typeof useCopyFeedback> }) {
  const t = useTranslations('settingsAbout');
  const text = useDiagnosticsText();
  return (
    <div className="grid min-w-0 gap-2 px-3 py-2" data-testid="app-settings-about-diagnostics-text">
      <pre className="whitespace-pre-wrap font-mono text-label leading-label text-[color:var(--color-text-secondary)] [overflow-wrap:anywhere]">
        {text}
      </pre>
      <div className="flex items-center gap-2">
        <Chip
          size="lg"
          tone="secondary"
          data-testid="app-settings-about-diagnostics-copy"
          onClick={() => void feedback.copy(text)}
          hoverInk="strong"
              hoverBorder="strong"
              className={PANE_CHIP}
        >
          {t('diagnosticsCopy')}
        </Chip>
        <span role="status" aria-live="polite" className="text-label text-[color:var(--color-text-tertiary)]">
          {feedback.state === 'copied'
            ? t('diagnosticsCopied')
            : feedback.state === 'failed'
              ? t('diagnosticsCopyFailed')
              : ''}
        </span>
      </div>
    </div>
  );
}

function useDiagnosticsText(): string {
  const t = useTranslations('settingsAbout.diagnostic');
  const locale = useLocale();
  const reducedMotion = usePrefersReducedMotion();
  const desktop = isDesktopShell();
  const { version } = useRunningVersion();
  const localVault = useLocalVault();

  const build = desktop
    ? t('buildApp', { version: version || t('buildUnknown') })
    : t('buildWeb', { version: WEBSITE_VERSION || t('buildUnknown') });
  const docs = localVault.status === 'loaded' ? localVault.manifest?.docs : undefined;
  const folder = docs
    ? (() => {
        const shape = describeVaultShape(docs);
        return t('folderValue', {
          count: countVaultContents(docs).conceptCount,
          map: shape.map ? t('yes') : t('no'),
          wiki: shape.wiki ? t('yes') : t('no'),
        });
      })()
    : t('folderNone');
  const windowSize =
    typeof window === 'undefined'
      ? ''
      : `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x`;
  const textSize =
    typeof document === 'undefined'
      ? ''
      : (document.documentElement.getAttribute('data-text-size') ?? 'default');
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;

  return [
    `${t('build')}: ${build}`,
    `${t('surface')}: ${desktop ? t('surfaceDesktop') : t('surfaceWeb')}`,
    `${t('userAgent')}: ${userAgent}`,
    `${t('language')}: ${locale}`,
    `${t('textSize')}: ${textSize}`,
    `${t('reduceMotion')}: ${reducedMotion ? t('yes') : t('no')}`,
    `${t('window')}: ${windowSize}`,
    `${t('folder')}: ${folder}`,
  ].join('\n');
}

function LogsRow() {
  const t = useTranslations('settingsAbout');
  const feedback = useCopyFeedback();
  return (
    <SettingsRow
      settingId="logs"
      label={t('rows.logs')}
      caption={feedback.state === 'failed' ? t('logsFailed') : t('logsCaption')}
      captionTone={feedback.state === 'failed' ? 'warning' : 'neutral'}
      testId="app-settings-about-logs"
      control={
        <Chip
          size="lg"
          tone="secondary"
          data-testid="app-settings-about-logs-open"
          onClick={() => void feedback.run(revealAppLogFolder)}
          hoverInk="strong"
              hoverBorder="strong"
              className={PANE_CHIP}
        >
          {t('logsOpen')}
        </Chip>
      }
    />
  );
}
