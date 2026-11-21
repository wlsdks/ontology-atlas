import { useTranslations } from 'next-intl';
import {
  LLM_AUDIT_LOG_RELATIVE_PATH,
  type LlmAuditEntry,
} from '@/shared/lib/llm-connection/llm-audit-log';
import { revealTauriVaultFile } from '@/shared/lib/vault-folder/native-vault/tauri-vault-location';
import { Chip } from '@/shared/ui/controls/controls';
import { cn } from '@/shared/lib/cn';
import { SettingsGroupHeading } from '../settings-primitives';
import { auditPurposeLabel, auditScopeLabel, formatAuditTime } from './audit-labels';
import { ROW_CHIP } from './ModelRow';

/** The sent log — only real JSONL lines, and the count of all of them. It never invents a summary. */
export function AuditSection({
  entries,
  total,
  vaultRootPath,
  error,
  retry,
}: {
  entries: LlmAuditEntry[];
  total: number | null;
  vaultRootPath: string | null;
  error?: 'changed' | 'expired' | 'failed' | null;
  retry: () => void;
}) {
  const t = useTranslations('agents.models');
  const tBriefing = useTranslations('gitBriefing');
  const hasLog = !error && Boolean(vaultRootPath) && total !== null && total > 0;
  return (
    <section aria-labelledby="ai-audit-title" className="min-w-0" data-testid="ai-audit-tail">
      <SettingsGroupHeading id="ai-audit-title" label={t('auditTitle')} />
      <div className="mt-1.5 flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {!vaultRootPath ? (
          <p className="text-body text-[color:var(--color-text-tertiary)]" data-testid="ai-audit-no-vault">
            {tBriefing('sourceAudit')}
          </p>
        ) : error ? (
          <div className="flex min-w-0 items-center gap-2" data-testid="ai-audit-error">
            <p className="text-body text-[color:var(--color-text-secondary)]" role="status">
              {t(error === 'changed' ? 'auditChanged' : error === 'expired' ? 'auditReadExpired' : 'auditReadFailed')}
            </p>
            <Chip size="lg" tone="secondary" onClick={retry} data-testid="ai-audit-retry">{t('auditRetry')}</Chip>
          </div>
        ) : total === null ? (
          // Not read yet: hold the line's height and say nothing rather than a false zero.
          <p aria-hidden className="min-h-[var(--leading-body)]" data-testid="ai-audit-reading" />
        ) : total === 0 ? (
          <p className="text-body text-[color:var(--color-text-tertiary)]" data-testid="ai-audit-count" data-count={0}>
            {t('auditEmpty')}
          </p>
        ) : (
          <p className="text-body text-[color:var(--color-text-secondary)]" data-testid="ai-audit-count" data-count={total}>
            {t('auditSummary', { count: total })}
          </p>
        )}
        {/* It selects the log file itself, and exists only once there is one: a button that
            promised the file and opened a folder without it would mislead. */}
        {hasLog && vaultRootPath ? (
          <Chip
            size="lg"
            tone="secondary"
            hoverInk="strong"
            hoverBorder="strong"
            data-testid="ai-audit-open"
            onClick={() => void revealTauriVaultFile(vaultRootPath, LLM_AUDIT_LOG_RELATIVE_PATH)}
            className={ROW_CHIP}
          >
            {t('auditOpen')}
          </Chip>
        ) : null}
      </div>
      <div className="mt-2 grid gap-2">
        {hasLog ? (
          <ol className="grid gap-1" aria-label={t('auditRecent', { count: entries.length })}>
            {[...entries].reverse().map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="flex min-w-0 items-center gap-2" data-testid="ai-audit-row">
                <span className="shrink-0 font-mono text-label text-[color:var(--color-text-tertiary)]">
                  {formatAuditTime(entry.at)}
                </span>
                <span className="min-w-0 flex-1 truncate text-label text-[color:var(--color-text-tertiary)]">
                  {entry.host ?? entry.provider} · {auditPurposeLabel(entry, t)} ·{' '}
                  {auditScopeLabel(entry, t)}
                </span>
                <span
                  className={cn(
                    'shrink-0 text-label',
                    entry.outcome === 'ok'
                      ? 'text-[color:var(--color-text-secondary)]'
                      : entry.outcome === 'unknown'
                        ? 'text-[color:var(--color-text-tertiary)]'
                        : 'text-[color:var(--color-danger-text)]',
                  )}
                >
                  {entry.outcome === 'ok'
                    ? t('auditOutcomeOk')
                    : entry.outcome === 'denied'
                      ? t('auditOutcomeDenied')
                      : entry.outcome === 'error'
                        ? t('auditOutcomeError')
                        : entry.outcome === 'open'
                          ? t('auditOutcomeOpen')
                          : t('auditOutcomeUnknown')}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
        {vaultRootPath ? (
          <p className="text-body leading-body text-[color:var(--color-text-tertiary)]">
            <span className="font-mono">{LLM_AUDIT_LOG_RELATIVE_PATH}</span>
            {' · '}
            {t('auditPathNote')}
          </p>
        ) : null}
      </div>
    </section>
  );
}
