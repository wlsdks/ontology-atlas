'use client';

import { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ClipboardCopy,
  ExternalLink,
  FolderOpen,
  FolderX,
  HardDrive,
  RefreshCw,
  Shield,
  X,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Tooltip } from '@/shared/ui';
import { copyText } from '@/shared/lib/copy-text';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';

interface Props {
  status:
    | 'idle'
    | 'opening'
    | 'loading'
    | 'loaded'
    | 'permission-needed'
    | 'unsupported'
    | 'error';
  handleName: string | null;
  rootPath?: string | null;
  docCount: number;
  errorMessage: string | null;
  /** 마지막 스캔 epoch ms. null 이면 표시 안 함. */
  lastLoadedAt: number | null;
  /**
   * R11 #14 — vault frontmatter validation 결과. error 1+ 또는 warning 1+
   * 일 때 chip 으로 표시. null/0 이면 chip 숨김.
   */
  validationSummary?: {
    errorCount: number;
    warningCount: number;
  } | null;
  recentVaults?: LocalFsHandleRecord[];
  onOpen: () => void;
  onOpenRecent?: (record: LocalFsHandleRecord) => void;
  onForgetRecent?: (record: LocalFsHandleRecord) => void;
  onClose: () => void;
  onRefresh: () => void;
  onRequestPermission: () => void;
  onReveal?: (rootPath: string) => void;
}

function formatRelative(
  now: number,
  ts: number,
  t: ReturnType<typeof useTranslations>,
): string {
  const diff = Math.max(0, now - ts);
  const s = Math.floor(diff / 1000);
  if (s < 5) return t('relativeJustNow');
  if (s < 60) return t('relativeSeconds', { count: s });
  const m = Math.floor(s / 60);
  if (m < 60) return t('relativeMinutes', { count: m });
  const h = Math.floor(m / 60);
  return t('relativeHours', { count: h });
}

/**
 * 로컬 볼트 상단 바. 폴더 미선택 → 열기 버튼. 선택 후 → 폴더 이름 + 새로
 * 고침 + 닫기. 권한 만료 → 재요청. 브라우저 미지원 → 안내.
 */
export function LocalVaultPicker({
  status,
  handleName,
  rootPath = null,
  docCount,
  errorMessage,
  lastLoadedAt,
  validationSummary,
  recentVaults = [],
  onOpen,
  onOpenRecent,
  onForgetRecent,
  onClose,
  onRefresh,
  onRequestPermission,
  onReveal,
}: Props) {
  const t = useTranslations('featuresMisc.localVaultPicker');
  const locale = useLocale();
  const dateLocale = locale === 'ko' ? 'ko-KR' : 'en-US';
  const [pathCopyState, setPathCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  // 상대시각이 실시간으로 업데이트되도록 15초 tick. loaded 상태일 때만 작동.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (status !== 'loaded' || lastLoadedAt === null) return;
    const intervalId = setInterval(() => setNowTick(Date.now()), 15_000);
    return () => clearInterval(intervalId);
  }, [status, lastLoadedAt]);
  if (status === 'unsupported') {
    return (
      <div className="flex flex-1 items-center gap-2 rounded-md border border-[color:rgba(244,183,49,0.35)] bg-[color:rgba(244,183,49,0.12)] px-3 py-1.5 text-[11.5px] text-[color:var(--color-status-warning)]">
        <Shield size={12} aria-hidden />
        {t('unsupported')}
      </div>
    );
  }
  if (status === 'permission-needed') {
    return (
      <div className="flex flex-1 items-center gap-2 rounded-md border border-[color:rgba(244,183,49,0.35)] bg-[color:rgba(244,183,49,0.12)] px-3 py-1.5 text-[11.5px] text-[color:var(--color-status-warning)]">
        <Shield size={12} aria-hidden />
        <span className="flex-1">{t('permissionNeeded')}</span>
        <button
          type="button"
          onClick={onRequestPermission}
          className="rounded-sm border border-[color:rgba(244,183,49,0.35)] px-2 py-0.5 text-[11px] transition-colors hover:bg-[color:rgba(244,183,49,0.18)]"
        >
          {t('permissionReauth')}
        </button>
        <Tooltip content={t('permissionClearTooltip')} withProvider={false}>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-transparent px-1.5 py-0.5 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
          >
            {t('permissionClearLabel')}
          </button>
        </Tooltip>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="grid flex-1 gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-[color:rgba(229,72,77,0.32)] bg-[color:rgba(229,72,77,0.08)] px-3 py-1.5 text-[11.5px] text-[color:var(--color-status-danger)]">
          <span className="truncate">
            {errorMessage ?? t('errorFallback')}
          </span>
          <span className="text-[color:rgba(240,180,180,0.7)]">
            {t('errorHint')}
          </span>
          <button
            type="button"
            onClick={onOpen}
            className="ml-auto rounded-sm border border-[color:rgba(229,72,77,0.32)] px-2 py-0.5 text-[11px] transition-colors hover:bg-[color:rgba(229,72,77,0.14)]"
          >
            {t('errorReselect')}
          </button>
        </div>
        <RecentVaultList
          recentVaults={recentVaults}
          disabled={false}
          onOpenRecent={onOpenRecent}
          onForgetRecent={onForgetRecent}
          t={t}
        />
      </div>
    );
  }
  if (status === 'loaded' && handleName) {
    async function handleCopyPath() {
      if (!rootPath) return;
      const copied = await copyText(rootPath);
      setPathCopyState(copied ? 'copied' : 'failed');
    }

    return (
      <div className="flex flex-1 flex-wrap items-center gap-2 rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-elevated)] px-3 py-1.5 text-[11.5px] text-[color:var(--color-text-tertiary)]">
        <HardDrive
          size={12}
          className="text-[color:var(--color-indigo-accent)]"
          aria-hidden
        />
        <span className="truncate text-[color:var(--color-text-primary)]">
          {handleName}
        </span>
        {rootPath ? (
          <Tooltip
            content={
              pathCopyState === 'copied'
                ? t('copyPathCopied')
                : pathCopyState === 'failed'
                  ? t('copyPathFailed')
                  : t('copyPathTooltip')
            }
            withProvider={false}
          >
            <button
              type="button"
              onClick={handleCopyPath}
              title={rootPath}
              aria-label={t('copyPathAriaLabel', { path: rootPath })}
              className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-sm border border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.06)] px-1.5 py-0.5 font-mono text-[9.5px] text-[color:var(--color-text-quaternary)] transition-colors hover:border-[color:rgba(94,106,210,0.4)] hover:text-[color:var(--color-text-secondary)]"
            >
              <ClipboardCopy size={10} aria-hidden />
              <span className="truncate">{rootPath}</span>
            </button>
          </Tooltip>
        ) : null}
        {rootPath && onReveal ? (
          <Tooltip content={t('revealPathTooltip')} withProvider={false}>
            <button
              type="button"
              onClick={() => onReveal(rootPath)}
              aria-label={t('revealPathAriaLabel', { path: rootPath })}
              className="inline-flex items-center gap-1 rounded-sm border border-[color:rgba(94,106,210,0.24)] px-1.5 py-0.5 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(94,106,210,0.4)] hover:text-[color:var(--color-text-primary)]"
            >
              <ExternalLink size={10} aria-hidden />
              {t('revealPathLabel')}
            </button>
          </Tooltip>
        ) : null}
        <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
          {t('loadedDocCount', { count: docCount })}
        </span>
        {lastLoadedAt !== null ? (
          <span
            className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]"
            title={new Date(lastLoadedAt).toLocaleString(dateLocale)}
          >
            {t('loadedScannedSuffix', {
              relative: formatRelative(nowTick, lastLoadedAt, t),
            })}
          </span>
        ) : null}
        {validationSummary &&
        (validationSummary.errorCount > 0 ||
          validationSummary.warningCount > 0) ? (
          <Tooltip
            content={t('validationTooltip', {
              errors: validationSummary.errorCount,
              warnings: validationSummary.warningCount,
            })}
            withProvider={false}
          >
            <span
              role="status"
              aria-live="polite"
              className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] ${
                validationSummary.errorCount > 0
                  ? 'border-[color:rgba(229,72,77,0.32)] bg-[color:rgba(229,72,77,0.08)] text-[color:var(--color-status-danger)]'
                  : 'border-[color:rgba(244,183,49,0.32)] bg-[color:rgba(244,183,49,0.10)] text-[color:var(--color-status-warning)]'
              }`}
            >
              {validationSummary.errorCount > 0 ? (
                <AlertCircle size={11} aria-hidden />
              ) : (
                <AlertTriangle size={11} aria-hidden />
              )}
              {t('validationChip', {
                errors: validationSummary.errorCount,
                warnings: validationSummary.warningCount,
              })}
            </span>
          </Tooltip>
        ) : null}
        <Tooltip content={t('rescanTooltip')} withProvider={false}>
          <button
            type="button"
            onClick={onRefresh}
            aria-label={t('rescanAriaLabel')}
            className="ml-auto inline-flex items-center gap-1 rounded-sm border border-transparent px-1.5 py-0.5 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(94,106,210,0.3)] hover:text-[color:var(--color-text-primary)]"
          >
            <RefreshCw size={11} aria-hidden />
          </button>
        </Tooltip>
        <Tooltip content={t('closeTooltip')} withProvider={false}>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('closeAriaLabel')}
            className="inline-flex items-center gap-1 rounded-sm border border-transparent px-1.5 py-0.5 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(229,72,77,0.32)] hover:text-[color:var(--color-status-danger)]"
          >
            <FolderX size={11} aria-hidden />
          </button>
        </Tooltip>
      </div>
    );
  }
  return (
    <div className="grid flex-1 gap-2">
      <button
        type="button"
        onClick={onOpen}
        disabled={status === 'opening' || status === 'loading'}
        className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-dashed border-[color:rgba(94,106,210,0.3)] bg-[color:rgba(94,106,210,0.06)] px-3 py-1.5 text-[11.5px] text-[color:var(--color-indigo-accent)] transition-colors hover:border-[color:rgba(94,106,210,0.46)] hover:bg-[color:rgba(94,106,210,0.1)] disabled:opacity-60"
      >
        <FolderOpen size={12} aria-hidden />
        {status === 'opening'
          ? t('openOpening')
          : status === 'loading'
            ? t('openLoading')
            : t('openLabel')}
      </button>
      <RecentVaultList
        recentVaults={recentVaults}
        disabled={status === 'opening' || status === 'loading'}
        onOpenRecent={onOpenRecent}
        onForgetRecent={onForgetRecent}
        t={t}
      />
    </div>
  );
}

function RecentVaultList({
  recentVaults,
  disabled,
  onOpenRecent,
  onForgetRecent,
  t,
}: {
  recentVaults: LocalFsHandleRecord[];
  disabled: boolean;
  onOpenRecent?: (record: LocalFsHandleRecord) => void;
  onForgetRecent?: (record: LocalFsHandleRecord) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  if (!onOpenRecent || recentVaults.length === 0) return null;
  return (
    <div
      aria-label={t('recentAriaLabel')}
      className="rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-2.5 py-2"
    >
      <p className="font-mono text-[9.5px] uppercase tracking-[0.13em] text-[color:var(--color-text-quaternary)]">
        {t('recentTitle')}
      </p>
      <div className="mt-1.5 grid gap-1">
        {recentVaults.map((record) => {
          const path = record.desktopRootPath;
          return (
            <div
              key={record.desktopRootPath ?? `${record.id}:${record.name}`}
              className="grid min-w-0 grid-cols-[1fr_24px] items-center gap-1 rounded-sm border border-transparent transition-colors hover:border-[color:rgba(94,106,210,0.28)] hover:bg-[color:rgba(94,106,210,0.06)]"
            >
              <button
                type="button"
                onClick={() => onOpenRecent(record)}
                disabled={disabled}
                aria-label={t('recentOpenAriaLabel', { name: record.name })}
                title={path ?? record.name}
                className="grid min-w-0 grid-cols-[14px_1fr] items-center gap-2 rounded-sm px-1.5 py-1 text-left transition-colors disabled:opacity-60"
              >
                <HardDrive
                  size={12}
                  aria-hidden
                  className="text-[color:var(--color-indigo-accent)]"
                />
                <span className="min-w-0">
                  <span className="block truncate text-[11px] text-[color:var(--color-text-secondary)]">
                    {record.name}
                  </span>
                  {path ? (
                    <span className="block truncate font-mono text-[9.5px] text-[color:var(--color-text-quaternary)]">
                      {path}
                    </span>
                  ) : null}
                </span>
              </button>
              {onForgetRecent ? (
                <Tooltip content={t('recentForgetTooltip')}>
                  <button
                    type="button"
                    onClick={() => onForgetRecent(record)}
                    disabled={disabled}
                    aria-label={t('recentForgetAriaLabel', { name: record.name })}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:rgba(229,72,77,0.10)] hover:text-[color:var(--color-status-danger)] disabled:opacity-60"
                  >
                    <X size={12} aria-hidden />
                  </button>
                </Tooltip>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
