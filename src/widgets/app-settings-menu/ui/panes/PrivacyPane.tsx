'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useLocalVault } from '@/entities/vault-session';
import { useUpdateAutoCheck } from '@/features/app-update';
import { isDesktopShell } from '@/shared/lib/desktop-shell';
import {
  forgetMachineApprovals,
  useMachineApprovalList,
  type MachineApprovalItem,
} from '@/shared/lib/machine-approvals';
import { Chip } from '@/shared/ui/controls';
import { SETTINGS_SECTION_SCOPE, type SettingsSectionId } from '../../model/catalog/types';
import {
  OUTBOUND_DESTINATION_PLACEHOLDERS,
  OUTBOUND_PATHS,
  WEB_OUTBOUND_PATHS,
  type OutboundDestinationPlaceholder,
  type OutboundPath,
} from '../../model/outbound-paths';
import {
  ArmedChip,
  DETAIL_TOGGLE_CHIP,
  SETTINGS_SECTION_LABEL,
  SettingsGroup,
  SettingsRow,
} from '../settings-primitives';

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

export function PrivacyPane({
  onShowSection,
}: {
  onShowSection: (section: SettingsSectionId) => void;
  onClose: () => void;
}) {
  const t = useTranslations('settingsPrivacy');
  const tNav = useTranslations('nav');
  const [desktop] = useState(() => isDesktopShell());
  const scope = tNav(`settingsMenu.scope.${SETTINGS_SECTION_SCOPE.privacy}`);
  const scopeTag = <span className={SETTINGS_SECTION_LABEL}>{scope}</span>;
  const autoCheck = useUpdateAutoCheck();
  const approvals = useMachineApprovalList();
  const { recentVaults, forgetRecent } = useLocalVault();
  const [forgetFailed, setForgetFailed] = useState(false);

  const describe = (path: OutboundPath) => {
    const line = t('outbound.line', {
      trigger: t(`trigger.${path.trigger}`),
      destinations: path.hosts
        .map((host) => (isPlaceholder(host) ? t(`destinations.${host}`) : host))
        .join(', '),
      carries: t(`carries.${path.carries}`),
    });
    const recorded = path.recordedIn
      ? t('outbound.recorded', { file: path.recordedIn })
      : t('outbound.notRecorded');
    return `${line} · ${recorded}`;
  };

  const paths = desktop ? OUTBOUND_PATHS : WEB_OUTBOUND_PATHS;
  const folders = byFolder(approvals);

  return (
    <div className="grid min-w-0 gap-4" data-testid="app-settings-privacy-pane">
      <p
        className="border-x border-transparent px-3 text-body leading-body text-[color:var(--color-text-secondary)]"
        data-testid="app-settings-privacy-lead"
      >
        {desktop ? t('leadDesktop') : t('leadWeb')}
      </p>

      <SettingsGroup label={t('outbound.title')} trailing={scopeTag} testId="app-settings-privacy-outbound">
        {paths.map((path) => (
          <SettingsRow
            key={path.id}
            settingId="outbound"
            testId={`app-settings-outbound-${path.id}`}
            label={t(`paths.${path.id}`)}
            caption={describe(path)}
            control={
              path.id === 'update-check' ? (
                <>
                  <span
                    className="text-label text-[color:var(--color-text-tertiary)]"
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
              ) : null
            }
          />
        ))}
      </SettingsGroup>

      {desktop ? (
        <SettingsGroup
          label={t('allowances.title')}
          trailing={scopeTag}
          testId="app-settings-privacy-allowances"
        >
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

      <SettingsGroup label={t('recent.title')} trailing={scopeTag} testId="app-settings-privacy-recent">
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
