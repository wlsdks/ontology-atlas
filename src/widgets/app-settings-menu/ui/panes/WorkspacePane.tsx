'use client';

import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { CalendarClock, FolderKanban, HardDrive, History, Plug } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useLocalVault } from '@/entities/vault-session';
import { createVaultFileRoundStore } from '@/entities/library-round';
import { useVaultConnectors } from '@/features/mcp-connectors';
import { BlockImportModule } from '@/features/ontology-blocks';
import { DESTINATION_HREF, MCP_CONNECTORS_HREF } from '@/shared/config/destinations';
import { cn } from '@/shared/lib/cn';
import { isDesktopShell } from '@/shared/lib/desktop-shell';
import { createVaultFileProjectSourceStore } from '@/shared/lib/project-source-store';
import { gitStatus, type GitStatusResult } from '@/shared/lib/tauri-git';
import {
  getTauriVaultRootPath,
  isTauriVaultRuntime,
  openTauriVaultInFinder,
} from '@/shared/lib/tauri-vault-fs';
import { useCopyFeedback } from '@/shared/lib/use-copy-feedback';
import { vaultValidationCounts } from '../../model/vault-validation-counts';
import { controlClass } from '@/shared/ui/control-class';
import { Chip, RowButton } from '@/shared/ui/controls';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { buildRouteFocusHref, rememberRouteFocusIntent } from '@/shared/ui/route-focus-manager';
import { SETTINGS_SECTION_SCOPE } from '../../model/catalog/types';
import {
  ArmedChip,
  DETAIL_TOGGLE_CHIP,
  SETTINGS_SECTION_LABEL,
  SettingsDoorRow,
  SettingsGroup,
  SettingsRow,
} from '../settings-primitives';
import { VaultShapeSettings } from '../VaultShapeSettings';

interface Kept {
  rounds: { count: number; paused: number } | null | 'failed';
  projectSources: number | null | 'failed';
  git: GitStatusResult | null | 'none' | 'failed';
}

const NOTHING_READ: Kept = { rounds: null, projectSources: null, git: null };

function useKeptInFolder(
  handle: FileSystemDirectoryHandle | null,
  root: string | null,
  desktop: boolean,
): Kept {
  const [kept, setKept] = useState<{ handle: FileSystemDirectoryHandle; value: Kept } | null>(null);
  useEffect(() => {
    if (!handle) return undefined;
    let cancelled = false;
    const merge = (part: Partial<Kept>) => {
      if (cancelled) return;
      setKept((previous) => ({
        handle,
        value: { ...(previous?.handle === handle ? previous.value : NOTHING_READ), ...part },
      }));
    };
    void createVaultFileProjectSourceStore(handle)
      .read()
      .then((result) => merge({ projectSources: result.bindings.length }))
      .catch(() => merge({ projectSources: 'failed' }));
    if (desktop) {
      void createVaultFileRoundStore(handle)
        .read()
        .then(({ state }) =>
          merge({
            rounds: {
              count: state.rounds.length,
              paused: state.rounds.filter((round) => !round.enabled).length,
            },
          }),
        )
        .catch(() => merge({ rounds: 'failed' }));
      if (root) {
        void gitStatus(root)
          .then((status) => merge({ git: status && status.initialized ? status : 'none' }))
          .catch(() => merge({ git: 'failed' }));
      }
    }
    return () => {
      cancelled = true;
    };
  }, [handle, root, desktop]);
  return kept && kept.handle === handle ? kept.value : NOTHING_READ;
}

export function WorkspacePane({
  mode,
  onClose,
}: {
  mode: 'static' | 'local';
  onClose: () => void;
}) {
  const t = useTranslations('settingsFolder');
  const tNav = useTranslations('nav');
  const tPicker = useTranslations('featuresMisc.localVaultPicker');
  const { state: copyState, copy } = useCopyFeedback();
  const localVault = useLocalVault();
  const [desktop] = useState(() => isDesktopShell());
  const scopeTag = (
    <span className={SETTINGS_SECTION_LABEL}>
      {tNav(`settingsMenu.scope.${SETTINGS_SECTION_SCOPE.workspace}`)}
    </span>
  );

  const isDesktopRuntime = isTauriVaultRuntime();
  const isLoaded = localVault.status === 'loaded';
  const loadedHandle = isLoaded ? localVault.handle : null;
  const vaultRootPath = loadedHandle ? (getTauriVaultRootPath(loadedHandle) ?? null) : null;
  const showVaultManagement = localVault.status !== 'unsupported';
  const vaultBusy = localVault.status === 'opening' || localVault.status === 'loading';
  const validation = isLoaded && localVault.manifest ? vaultValidationCounts(localVault.manifest) : null;

  const connectors = useVaultConnectors(loadedHandle);
  const kept = useKeptInFolder(loadedHandle, vaultRootPath, desktop);

  const vaultHref =
    mode === 'local' ? '/docs/' : isDesktopRuntime ? '/docs/?intent=local' : '/download/';
  const handleVaultNavigate = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    rememberRouteFocusIntent(vaultHref);
  };

  const folderCaption =
    localVault.status === 'error'
      ? localVault.errorCode === 'grant-needed'
        ? t('folderErrorGrantNeeded')
        : localVault.errorCode === 'path-missing'
          ? t('folderErrorPathMissing')
          : localVault.errorCode === 'permission-denied'
            ? t('folderErrorPermissionDenied')
            : localVault.errorCode === 'root-rejected'
              ? t('folderErrorRootRejected')
              : t('folderErrorFallback')
      : localVault.status === 'permission-needed'
        ? t('folderPermissionCaption')
        : isLoaded
          ? validation
            ? t('folderDocCountIssues', {
                count: localVault.manifest?.docs.length ?? 0,
                errors: validation.errorCount,
                warnings: validation.warningCount,
              })
            : t('folderDocCount', { count: localVault.manifest?.docs.length ?? 0 })
          : undefined;

  const reading = t('kept.reading');
  const failed = t('kept.readFailed');
  const connectorsCaption = !loadedHandle
    ? t('kept.noFolder')
    : connectors.status === 'loading'
      ? reading
      : desktop && connectors.connectors.length > 0
        ? t('kept.connectorsAllowed', {
            total: connectors.connectors.length,
            count: connectors.connectors.filter(connectors.allowedHere).length,
          })
        : t('kept.connectorsCount', { count: connectors.connectors.length });
  const schedulesCaption = !loadedHandle
    ? t('kept.noFolder')
    : kept.rounds === 'failed'
      ? failed
      : kept.rounds
      ? t('kept.schedulesCount', { count: kept.rounds.count, paused: kept.rounds.paused })
      : reading;
  const gitCaption = !loadedHandle
    ? t('kept.noFolder')
    : kept.git === 'failed'
      ? failed
      : kept.git === 'none'
      ? t('kept.gitNone')
      : kept.git
        ? t('kept.gitRepo', {
            branch: kept.git.branch ?? 'HEAD',
            remote: kept.git.hasOrigin === undefined ? 'unknown' : kept.git.hasOrigin ? 'yes' : 'no',
          })
        : reading;
  const projectSourcesCaption = !loadedHandle
    ? t('kept.noFolder')
    : kept.projectSources === 'failed'
      ? failed
      : kept.projectSources === null
      ? reading
      : t('kept.projectSourcesCount', { count: kept.projectSources });

  return (
    <div className="grid min-w-0 gap-4" data-testid="app-settings-workspace-pane">
      <SettingsGroup>
        <VaultShapeSettings />
        {showVaultManagement ? (
          <SettingsRow
            testId="app-settings-workspace-folder"
            settingId="folder"
            label={t('folderLabel')}
            caption={folderCaption}
            captionTone={
              localVault.status === 'error'
                ? 'danger'
                : localVault.status === 'permission-needed'
                  ? 'warning'
                  : 'neutral'
            }
            control={
              <>
                <span
                  className={cn(
                    'max-w-[10rem] truncate text-body',
                    isLoaded
                      ? 'text-[color:var(--color-text-primary)]'
                      : 'text-[color:var(--color-text-quaternary)]',
                  )}
                >
                  {isLoaded && localVault.handle
                    ? localVault.handle.name
                    : localVault.status === 'permission-needed'
                      ? (localVault.handle?.name ?? t('folderEmpty'))
                      : t('folderEmpty')}
                </span>
                {localVault.status === 'permission-needed' ? (
                  <Chip
                    size="lg"
                    tone="warning"
                    hoverSurface="lift"
                    onClick={() => localVault.requestPermission()}
                    className="shrink-0 border-[color:var(--color-amber-source-a35)]"
                  >
                    {t('folderPermissionAction')}
                  </Chip>
                ) : (
                  <Chip
                    size="lg"
                    tone="accentOnTint"
                    hoverSurface="lift"
                    onClick={() => void localVault.open()}
                    disabled={vaultBusy}
                    data-testid="app-settings-open-folder"
                    className="shrink-0 border-[color:var(--color-indigo-line-a32)]"
                  >
                    {vaultBusy
                      ? t('folderOpening')
                      : isLoaded || localVault.status === 'error'
                        ? t('folderChange')
                        : t('folderOpen')}
                  </Chip>
                )}
              </>
            }
          />
        ) : null}
        {vaultRootPath ? (
          <SettingsRow
            testId="app-settings-vault-path"
            settingId="folder-path"
            label={t('pathLabel')}
            caption={vaultRootPath}
            control={
              <>
                <Chip
                  size="lg"
                  tone="secondary"
                  data-testid="app-settings-copy-vault-path"
                  onClick={() => void copy(vaultRootPath)}
                  aria-label={tPicker('copyPathAriaLabel', { path: vaultRootPath })}
                  className={DETAIL_TOGGLE_CHIP}
                >
                  {copyState === 'copied'
                    ? tPicker('copyPathCopied')
                    : copyState === 'failed'
                      ? tPicker('copyPathFailed')
                      : t('pathCopy')}
                </Chip>
                <Chip
                  size="lg"
                  tone="secondary"
                  data-testid="app-settings-reveal-vault-path"
                  onClick={() => void openTauriVaultInFinder(vaultRootPath)}
                  aria-label={tPicker('revealPathAriaLabel', { path: vaultRootPath })}
                  className={DETAIL_TOGGLE_CHIP}
                >
                  {t('pathReveal')}
                </Chip>
              </>
            }
          />
        ) : null}
        {showVaultManagement && !isLoaded && localVault.recentVaults.length > 0
          ? localVault.recentVaults.map((record) => (
              <div
                key={record.desktopRootPath ?? `${record.id}:${record.name}`}
                className="flex min-h-11 items-center gap-2 px-3 py-1.5"
                data-testid="app-settings-recent-vault"
                data-setting-id="folder"
              >
                <RowButton
                  size="sm"
                  hoverSurface="lift"
                  onClick={() => void localVault.openRecent(record)}
                  disabled={vaultBusy}
                  aria-label={t('recentOpenAria', { name: record.name })}
                  title={record.desktopRootPath ?? record.name}
                  className="min-w-0 flex-1"
                >
                  <HardDrive
                    size={ICON_SIZE.sm}
                    aria-hidden
                    className="shrink-0 text-[color:var(--color-indigo-accent)]"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-body text-[color:var(--color-text-secondary)]">
                      {record.name}
                    </span>
                    {record.desktopRootPath ? (
                      <span className="block truncate font-mono text-label text-[color:var(--color-text-quaternary)]">
                        {record.desktopRootPath}
                      </span>
                    ) : null}
                  </span>
                </RowButton>
                <ArmedChip
                  label={t('recentForget')}
                  armedLabel={t('recentForgetArmed')}
                  onConfirm={() => localVault.forgetRecent(record).catch(() => undefined)}
                  testId="app-settings-recent-vault-forget"
                />
              </div>
            ))
          : null}
        <SettingsRow
          testId="app-settings-vault-docs"
          settingId="folder-documents"
          label={t('documentsTitle')}
          caption={mode === 'local' ? t('documentsBodyLocal') : t('documentsBodyStatic')}
          control={
            <Link
              href={buildRouteFocusHref(vaultHref)}
              onClick={handleVaultNavigate}
              data-testid="app-settings-vault-docs-open"
              className={controlClass({
                shape: 'chip',
                size: 'lg',
                tone: 'secondary',
                hoverInk: 'strong',
                hoverBorder: 'strong',
                className: DETAIL_TOGGLE_CHIP,
              })}
            >
              {mode === 'local' ? t('documentsCtaLocal') : t('documentsCtaStatic')}
            </Link>
          }
        />
        <BlockImportModule
          renderTrigger={(trigger) => (
            <SettingsRow
              testId="app-settings-block-import"
              settingId="folder-import"
              label={trigger.label}
              caption={trigger.status ?? trigger.caption}
              captionTone={trigger.statusKind === 'error' ? 'danger' : 'neutral'}
              control={
                <Chip
                  size="lg"
                  tone="secondary"
                  data-testid="block-import-open"
                  onClick={trigger.onPick}
                  disabled={trigger.disabled}
                  title={trigger.title}
                  className={DETAIL_TOGGLE_CHIP}
                >
                  {trigger.action}
                </Chip>
              }
            />
          )}
        />
      </SettingsGroup>

      <div className="grid min-w-0 gap-1.5">
        <SettingsGroup label={t('kept.title')} trailing={scopeTag} testId="app-settings-folder-kept">
          <SettingsDoorRow
            settingId="folder-connectors"
            testId="app-settings-folder-door-connectors"
            label={t('kept.connectors')}
            caption={connectorsCaption}
            icon={Plug}
            href={MCP_CONNECTORS_HREF}
            onLeave={onClose}
          />
          {desktop ? (
            <SettingsDoorRow
              settingId="folder-schedules"
              testId="app-settings-folder-door-schedules"
              label={t('kept.schedules')}
              caption={schedulesCaption}
              icon={CalendarClock}
              href={DESTINATION_HREF.automations}
              onLeave={onClose}
            />
          ) : null}
          {desktop ? (
            <SettingsDoorRow
              settingId="folder-git"
              testId="app-settings-folder-door-git"
              label={t('kept.git')}
              caption={gitCaption}
              icon={History}
              href={DESTINATION_HREF.git}
              onLeave={onClose}
            />
          ) : null}
          <SettingsDoorRow
            settingId="folder-project-sources"
            testId="app-settings-folder-door-projects"
            label={t('kept.projectSources')}
            caption={projectSourcesCaption}
            icon={FolderKanban}
            href={DESTINATION_HREF.projects}
            onLeave={onClose}
          />
        </SettingsGroup>
        <p
          className="border-x border-transparent px-3 text-label leading-label text-[color:var(--color-text-tertiary)]"
          data-testid="app-settings-folder-kept-caption"
        >
          {t('kept.caption')}
        </p>
      </div>
    </div>
  );
}
