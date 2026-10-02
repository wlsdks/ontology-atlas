'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { FileText } from 'lucide-react';
import { useLocalVault } from '@/entities/vault-session';
import { useUpdateAutoCheck } from '@/features/app-update';
import { isDesktopShell } from '@/shared/lib/desktop-shell';
import {
  forgetMachineApprovals,
  useMachineApprovalList,
  type MachineApprovalItem,
} from '@/shared/lib/machine-approvals';
import { cn } from '@/shared/lib/cn';
import { badgeClass } from '@/shared/ui/badge-class';
import { Chip } from '@/shared/ui/controls';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import type { SettingsSectionId } from '../../model/catalog/types';
import {
  OUTBOUND_DESTINATION_PLACEHOLDERS,
  OUTBOUND_PATHS,
  WEB_OUTBOUND_PATHS,
  type OutboundDestinationPlaceholder,
  type OutboundPath,
} from '../../model/outbound-paths';
import { ArmedChip, DETAIL_TOGGLE_CHIP, SettingsGroup, SettingsRow } from '../settings-primitives';

const isPlaceholder = (host: string): host is OutboundDestinationPlaceholder =>
  (OUTBOUND_DESTINATION_PLACEHOLDERS as readonly string[]).includes(host);

interface FolderAllowances {
  folder: string;
  connectors: number;
  rounds: number;
}

function byFolder(items: readonly MachineApprovalItem[]): FolderAllowances[] {
  const folders = new Map<string, FolderAllowances>();
  for (const item of items) {
    const entry = folders.get(item.folder) ?? { folder: item.folder, connectors: 0, rounds: 0 };
    if (item.subject === 'connector') entry.connectors += 1;
    else entry.rounds += 1;
    folders.set(item.folder, entry);
  }
  return [...folders.values()];
}

const folderName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

const CELL = 'justify-self-start whitespace-nowrap text-label leading-label';
const WHEN_TAG = badgeClass({
  shape: 'tag',
  className: cn(CELL, 'border border-[color:var(--color-divider)] text-[color:var(--color-text-secondary)]'),
});
const CARRIES_CONTENT = badgeClass({
  shape: 'tag',
  className: cn(CELL, 'bg-[color:var(--color-overlay-3)] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]'),
});
const CARRIES_NOTHING = cn(CELL, 'text-[color:var(--color-text-tertiary)]');
const HOST_CHIP = badgeClass({
  shape: 'tag',
  className: 'max-w-full bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-tertiary)] [overflow-wrap:anywhere]',
});

export function PrivacyLead() {
  const t = useTranslations('settingsPrivacy');
  const [desktop] = useState(() => isDesktopShell());
  return (
    <p
      className="max-w-[var(--git-setup-measure)] text-body leading-body text-balance text-[color:var(--color-text-tertiary)]"
      data-testid="app-settings-privacy-lead"
    >
      {desktop ? t('leadDesktop') : t('leadWeb')}
    </p>
  );
}

function OutboundRow({ path, control }: { path: OutboundPath; control?: ReactNode }) {
  const t = useTranslations('settingsPrivacy');
  const unseen = path.carries === 'agent-sends' || path.carries === 'provider-owned';
  return (
    <li
      data-setting-id="outbound"
      data-testid={`app-settings-outbound-${path.id}`}
      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 @lg:col-span-full @lg:grid @lg:grid-cols-subgrid"
    >
      <p className="min-w-0 basis-full text-body text-[color:var(--color-text-primary)] @lg:basis-auto">
        {t(`paths.${path.id}`)}
      </p>
      <span data-trigger={path.trigger} className={WHEN_TAG}>
        {t(`trigger.${path.trigger}`)}
      </span>
      <span
        data-carries={path.carries}
        className={path.carries === 'no-folder-content' ? CARRIES_NOTHING : CARRIES_CONTENT}
      >
        {t(`carries.${path.carries}`)}
      </span>
      {path.recordedIn ? (
        <span
          data-recorded="yes"
          title={t('outbound.recordedIn', { file: path.recordedIn })}
          className={cn(CELL, 'inline-flex items-center gap-1 text-[color:var(--color-text-secondary)]')}
        >
          <FileText size={ICON_SIZE.sm} aria-hidden className="shrink-0" />
          {t('outbound.recorded')}
          <span className="sr-only"> · {t('outbound.recordedIn', { file: path.recordedIn })}</span>
        </span>
      ) : (
        <span data-recorded="no" className={cn(CELL, 'text-[color:var(--color-text-tertiary)]')}>
          {unseen ? t('outbound.unseen') : t('outbound.notRecorded')}
        </span>
      )}
      <div className="flex min-w-0 basis-full flex-wrap items-center gap-1.5 @lg:col-span-full">
        {path.hosts.map((host) =>
          isPlaceholder(host) ? (
            <span key={host} data-host={host} className={HOST_CHIP}>
              {t(`destinations.${host}`)}
            </span>
          ) : (
            <span key={host} data-host={host} className={cn(HOST_CHIP, 'font-mono')}>
              {host}
            </span>
          ),
        )}
        {control ? <div className="ml-auto flex shrink-0 items-center gap-2">{control}</div> : null}
      </div>
    </li>
  );
}

export function PrivacyPane({
  onShowSection,
}: {
  onShowSection: (section: SettingsSectionId) => void;
  onClose: () => void;
}) {
  const t = useTranslations('settingsPrivacy');
  const [desktop] = useState(() => isDesktopShell());
  const autoCheck = useUpdateAutoCheck();
  const approvals = useMachineApprovalList();
  const { recentVaults, forgetRecent } = useLocalVault();
  const [forgetFailed, setForgetFailed] = useState(false);

  const paths = desktop ? OUTBOUND_PATHS : WEB_OUTBOUND_PATHS;
  const folders = byFolder(approvals);
  const recordLog = paths.find((path) => path.recordedIn)?.recordedIn;

  return (
    <div className="@container grid min-w-0 gap-4" data-testid="app-settings-privacy-pane">
      <div className="grid min-w-0 gap-1.5">
        <SettingsGroup
          label={t('outbound.title')}
          testId="app-settings-privacy-outbound"
          as="ul"
          cardClassName="@lg:grid @lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] @lg:gap-x-3"
        >
          {paths.map((path) => (
            <OutboundRow
              key={path.id}
              path={path}
              control={
                path.id === 'update-check' ? (
                  <>
                    <span
                      className="text-label leading-label text-[color:var(--color-text-tertiary)]"
                      data-testid="app-settings-outbound-update-state"
                    >
                      {autoCheck === 'on' ? t('updateOn') : t('updateOff')}
                    </span>
                    <Chip
                      size="lg"
                      tone="secondary"
                      data-testid="app-settings-outbound-update-change"
                      aria-label={t('updateChangeAria')}
                      onClick={() => onShowSection('about')}
                      className={DETAIL_TOGGLE_CHIP}
                    >
                      {t('updateChange')}
                    </Chip>
                  </>
                ) : undefined
              }
            />
          ))}
        </SettingsGroup>
        {recordLog ? (
          <p
            className="text-label leading-label text-[color:var(--color-text-tertiary)]"
            data-testid="app-settings-outbound-record-note"
          >
            {t.rich('outbound.recordedNote', {
              file: () => <span className="font-mono">{recordLog}</span>,
            })}
          </p>
        ) : null}
      </div>

      {desktop ? (
        <SettingsGroup label={t('allowances.title')} testId="app-settings-privacy-allowances">
          {folders.length === 0 ? (
            <SettingsRow
              settingId="allowances"
              testId="app-settings-allowances-empty"
              label={t('allowances.title')}
              caption={t('allowances.empty')}
              control={null}
            />
          ) : (
            <>
              {folders.map((entry) => (
                <SettingsRow
                  key={entry.folder}
                  settingId="allowances"
                  testId="app-settings-allowances-folder"
                  label={folderName(entry.folder)}
                  caption={`${entry.folder} · ${t('allowances.counts', {
                    connectors: entry.connectors,
                    rounds: entry.rounds,
                    both: entry.connectors > 0 && entry.rounds > 0 ? 'yes' : 'no',
                  })}`}
                  control={
                    <ArmedChip
                      label={t('allowances.forget')}
                      armedLabel={t('allowances.forgetArmed')}
                      onConfirm={() => forgetMachineApprovals({ folder: entry.folder })}
                      testId="app-settings-allowances-forget"
                      ariaLabel={t('allowances.forgetAria', { name: folderName(entry.folder) })}
                    />
                  }
                />
              ))}
              <SettingsRow
                settingId="allowances"
                testId="app-settings-allowances-all"
                label={t('allowances.forgetAll')}
                caption={t('allowances.caption')}
                control={
                  <ArmedChip
                    label={t('allowances.forgetAll')}
                    armedLabel={t('allowances.forgetAllArmed')}
                    onConfirm={() => forgetMachineApprovals()}
                    testId="app-settings-allowances-forget-all"
                  />
                }
              />
            </>
          )}
        </SettingsGroup>
      ) : null}

      <SettingsGroup label={t('recent.title')} testId="app-settings-privacy-recent">
        <SettingsRow
          settingId="recent-folders"
          testId="app-settings-recent-folders"
          label={t('recent.label')}
          caption={
            forgetFailed
              ? t('recent.failed')
              : `${t('recent.count', { count: recentVaults.length })} · ${
                  desktop ? t('recent.captionDesktop') : t('recent.captionWeb')
                }`
          }
          captionTone={forgetFailed ? 'danger' : 'neutral'}
          control={
            recentVaults.length > 0 ? (
              <ArmedChip
                label={t('recent.forgetAll')}
                armedLabel={t('recent.forgetAllArmed')}
                onConfirm={async () => {
                  try {
                    await forgetRecent(recentVaults);
                    setForgetFailed(false);
                  } catch {
                    setForgetFailed(true);
                  }
                }}
                testId="app-settings-recent-forget-all"
              />
            ) : null
          }
        />
      </SettingsGroup>
    </div>
  );
}
