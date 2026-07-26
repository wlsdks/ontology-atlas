'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import {
  secretClear,
  secretErrorMessage,
  secretSet,
  secretVerify,
  SECRET_PROVIDERS,
  type SecretProvider,
  type SecretStatus,
} from '@/shared/lib/tauri-secrets';
import type { LlmAuditEntry } from '@/shared/lib/llm-audit-log';
import { openTauriVaultInFinder } from '@/shared/lib/tauri-vault-fs';
import { useToast } from '@/shared/ui/toast';
import { cn } from '@/shared/lib/cn';
import type { AiConnectionState } from '../model/use-ai-connection';

/**
 * [AI 연결] 서브뷰 (#80 S1·S2) — 내 API 키를 이 컴퓨터의 키체인에 두고,
 * 그 키가 살아 있는지 1클릭으로 확인하고, 나간 호출을 볼트 안 기록으로 본다.
 *
 * 이 화면이 지키는 것:
 * - **전체 키를 다시 그리는 경로가 없다.** 저장 성공 즉시 입력 상태를 비우고,
 *   그 뒤로 화면이 아는 것은 `last4` 뿐이다(Rust 계약 그대로).
 * - **정직한 웹 강등.** 브리지가 없으면 입력 필드를 렌더하지 않고 "왜 데스크톱
 *   전용인가" 를 그대로 설명한다. 숨기는 것보다 설명하는 것이 신뢰 자산이다.
 * - **정직한 빈 소비자.** 지금 이 키로 할 수 있는 일은 연결 확인뿐이라고
 *   화면에 적는다 — 볼트 질문 기능은 아직 없고, 있는 척하지 않는다.
 * - **보안 주장은 코드가 증명하는 범위까지만.** "절대 안전" 류 문구를 쓰지
 *   않는다(신뢰 헌장 ⑥).
 */

const CLEAR_ARM_MS = 3000;

type VerifyState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok' }
  | { kind: 'denied'; status: number | null }
  | { kind: 'failed'; message: string };

export interface AiConnectionPanelProps {
  connection: AiConnectionState;
  /** 데스크톱에서 알려진 볼트 절대 경로 — 감사 기록을 남길 곳. */
  vaultRootPath: string | null;
  downloadHref: string;
  onDownloadNavigate: () => void;
}

export function AiConnectionPanel({
  connection,
  vaultRootPath,
  downloadHref,
  onDownloadNavigate,
}: AiConnectionPanelProps) {
  const t = useTranslations('settings.ai');
  const { bridgeAvailable, statuses, applyStatus, auditEntries, refreshAudit } =
    connection;

  if (!bridgeAvailable) {
    return (
      <div className="grid content-start gap-3" data-testid="ai-connection-view">
        <p className="break-keep px-1 text-label leading-4 text-[color:var(--color-text-tertiary)]">
          {t('principle')}
        </p>
        <div
          className="rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5"
          data-testid="ai-connection-web-degraded"
        >
          <p className="text-label font-medium text-[color:var(--color-text-secondary)]">
            {t('webDegradedTitle')}
          </p>
          <p className="mt-1 break-keep text-caption leading-4 text-[color:var(--color-text-tertiary)]">
            {t('webDegradedBody')}
          </p>
          <Link
            href={downloadHref}
            onClick={onDownloadNavigate}
            data-testid="ai-connection-download-link"
            className="mt-2 inline-flex h-8 items-center rounded-md border border-[color:var(--color-indigo-line-a32)] px-2.5 text-label text-[color:var(--color-indigo-accent)] transition-colors hover:border-[color:var(--color-indigo-line-a45)] hover:bg-[color:var(--color-indigo-line-a13)]"
          >
            {t('webDegradedCta')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid content-start gap-3" data-testid="ai-connection-view">
      <p className="break-keep px-1 text-label leading-4 text-[color:var(--color-text-tertiary)]">
        {t('principle')}
      </p>

      <div className="divide-y divide-[color:var(--color-divider)] overflow-hidden rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]">
        {SECRET_PROVIDERS.map((provider) => (
          <ProviderCard
            key={provider}
            provider={provider}
            status={statuses[provider]}
            vaultRootPath={vaultRootPath}
            onStatusChange={applyStatus}
            onVerified={refreshAudit}
          />
        ))}
      </div>

      <p className="break-keep px-1 text-caption leading-4 text-[color:var(--color-text-quaternary)]">
        {t('emptyConsumer')}
      </p>

      <section aria-label={t('scopeTitle')}>
        <h3 className="px-1 font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          {t('scopeTitle')}
        </h3>
        <div className="mt-1.5 divide-y divide-[color:var(--color-divider)] overflow-hidden rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]">
          {[
            { label: t('scopeWhatLabel'), value: t('scopeWhatValue') },
            { label: t('scopeWhenLabel'), value: t('scopeWhenValue') },
            { label: t('scopeLogLabel'), value: t('scopeLogValue') },
          ].map((row) => (
            <div key={row.label} className="flex gap-3 px-3 py-2">
              <span className="w-14 shrink-0 text-label text-[color:var(--color-text-tertiary)]">
                {row.label}
              </span>
              <span className="min-w-0 break-keep text-caption leading-4 text-[color:var(--color-text-quaternary)]">
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </section>

      <AuditTail
        entries={auditEntries}
        vaultRootPath={vaultRootPath}
      />
    </div>
  );
}

function ProviderCard({
  provider,
  status,
  vaultRootPath,
  onStatusChange,
  onVerified,
}: {
  provider: SecretProvider;
  status: SecretStatus | null;
  vaultRootPath: string | null;
  onStatusChange: (provider: SecretProvider, next: SecretStatus) => void;
  onVerified: () => void;
}) {
  const t = useTranslations('settings.ai');
  const toast = useToast();
  const [draftKey, setDraftKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verify, setVerify] = useState<VerifyState>({ kind: 'idle' });
  const [clearArmed, setClearArmed] = useState(false);
  const clearTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (clearTimer.current !== null) window.clearTimeout(clearTimer.current);
    },
    [],
  );

  const label = provider === 'anthropic' ? t('providerAnthropic') : t('providerOpenai');
  const stored = status?.stored === true;

  const handleSave = async () => {
    if (!draftKey.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const next = await secretSet(provider, draftKey);
      // 저장 성공 즉시 프런트 상태에서 키를 지운다 — 전체 키가 이 화면에
      // 남아 있을 수 있는 유일한 순간을 여기서 끝낸다.
      setDraftKey('');
      if (next) onStatusChange(provider, next);
    } catch (err) {
      setError(secretErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async () => {
    if (!vaultRootPath || verify.kind === 'checking') return;
    setVerify({ kind: 'checking' });
    try {
      const result = await secretVerify(provider, vaultRootPath);
      if (!result) return;
      if (result.ok) setVerify({ kind: 'ok' });
      else if (result.httpStatus === 401 || result.httpStatus === 403)
        setVerify({ kind: 'denied', status: result.httpStatus });
      else
        setVerify({
          kind: 'failed',
          message: result.message ?? String(result.httpStatus ?? ''),
        });
    } catch (err) {
      setVerify({ kind: 'failed', message: secretErrorMessage(err) });
    } finally {
      // 성공이든 거부든 호출은 기록됐다 — 기록을 바로 보여준다.
      onVerified();
    }
  };

  const handleClear = async () => {
    if (!clearArmed) {
      // 2단 확정 — 모달을 띄울 만큼 무거운 판단이 아니고, 되돌리기도 쉽다.
      setClearArmed(true);
      clearTimer.current = window.setTimeout(() => setClearArmed(false), CLEAR_ARM_MS);
      return;
    }
    if (clearTimer.current !== null) window.clearTimeout(clearTimer.current);
    setClearArmed(false);
    try {
      const next = await secretClear(provider);
      if (next) onStatusChange(provider, next);
      setVerify({ kind: 'idle' });
      toast.show(t('cleared'));
    } catch (err) {
      setError(secretErrorMessage(err));
    }
  };

  return (
    <div className="grid gap-2 px-3 py-2.5" data-testid={`ai-provider-${provider}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-label text-[color:var(--color-text-secondary)]">{label}</p>
        {stored ? (
          <span className="font-mono text-caption text-[color:var(--color-text-tertiary)]">
            {t('stored', { last4: status?.last4 ?? '' })}
          </span>
        ) : null}
      </div>

      {stored ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid={`ai-verify-${provider}`}
            onClick={() => void handleVerify()}
            disabled={verify.kind === 'checking' || !vaultRootPath}
            className="inline-flex h-8 items-center rounded-md border border-[color:var(--color-indigo-line-a32)] px-2.5 text-label text-[color:var(--color-indigo-accent)] transition-colors hover:border-[color:var(--color-indigo-line-a45)] hover:bg-[color:var(--color-indigo-line-a13)] disabled:opacity-60"
          >
            {verify.kind === 'checking' ? t('verifying') : t('verify')}
          </button>
          <button
            type="button"
            data-testid={`ai-clear-${provider}`}
            onClick={() => void handleClear()}
            className={cn(
              'inline-flex h-8 items-center rounded-md border px-2.5 text-label transition-colors',
              clearArmed
                ? 'border-[color:var(--color-danger-a32)] text-[color:var(--color-status-danger)] hover:bg-[color:var(--color-danger-a10)]'
                : 'border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-secondary)]',
            )}
          >
            {clearArmed ? t('clearConfirm') : t('clear')}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={draftKey}
            aria-label={t('keyLabel', { provider: label })}
            placeholder={t('keyPlaceholder')}
            data-testid={`ai-key-input-${provider}`}
            onChange={(event) => setDraftKey(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleSave();
            }}
            className="h-8 min-w-0 flex-1 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] px-2 font-mono text-caption text-[color:var(--color-text-primary)] transition-colors placeholder:text-[color:var(--color-text-quaternary)] focus-visible:border-[color:var(--color-indigo-line-a45)] focus-visible:outline-none"
          />
          <button
            type="button"
            data-testid={`ai-save-${provider}`}
            onClick={() => void handleSave()}
            disabled={!draftKey.trim() || saving}
            className="inline-flex h-8 shrink-0 items-center rounded-md border border-[color:var(--color-indigo-line-a32)] px-2.5 text-label text-[color:var(--color-indigo-accent)] transition-colors hover:border-[color:var(--color-indigo-line-a45)] hover:bg-[color:var(--color-indigo-line-a13)] disabled:opacity-60"
          >
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      )}

      <ProviderCaption
        error={error}
        provider={label}
        stored={stored}
        verify={verify}
        vaultKnown={vaultRootPath !== null}
      />
    </div>
  );
}

/** 카드마다 정확히 한 줄의 설명 — 상태가 바뀌어도 카드 높이 해부구조는 같다. */
function ProviderCaption({
  error,
  provider,
  stored,
  verify,
  vaultKnown,
}: {
  error: string | null;
  provider: string;
  stored: boolean;
  verify: VerifyState;
  vaultKnown: boolean;
}) {
  const t = useTranslations('settings.ai');

  if (error) {
    return (
      <p className="break-keep text-caption leading-4 text-[color:var(--color-status-danger)]">
        {error}
      </p>
    );
  }
  if (!stored) {
    // 붙여넣는 순간이 신뢰를 판단하는 순간이다 — 포커스 시에만 뜨는 툴팁이
    // 아니라 필드 아래 상시 노출.
    return (
      <p className="break-keep text-caption leading-4 text-[color:var(--color-text-quaternary)]">
        {t('pasteSafety', { provider })}
      </p>
    );
  }
  if (!vaultKnown) {
    return (
      <p className="break-keep text-caption leading-4 text-[color:var(--color-text-quaternary)]">
        {t('verifyNeedsVault')}
      </p>
    );
  }
  if (verify.kind === 'ok') {
    return (
      <p className="flex items-center gap-1.5 text-caption text-[color:var(--color-status-success)]">
        <StatusDot tone="success" />
        {t('verified')}
      </p>
    );
  }
  if (verify.kind === 'denied') {
    return (
      <p className="flex items-center gap-1.5 text-caption text-[color:var(--color-status-danger)]">
        <StatusDot tone="danger" />
        {t('verifyDenied', { status: verify.status ?? '' })}
      </p>
    );
  }
  if (verify.kind === 'failed') {
    return (
      <p className="flex items-center gap-1.5 break-keep text-caption leading-4 text-[color:var(--color-status-danger)]">
        <StatusDot tone="danger" />
        {t('verifyFailed', { message: verify.message })}
      </p>
    );
  }
  return (
    <p className="break-keep text-caption leading-4 text-[color:var(--color-text-quaternary)]">
      {t('verifyScope')}
    </p>
  );
}

function StatusDot({ tone }: { tone: 'success' | 'danger' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-1.5 shrink-0 rounded-full',
        tone === 'success'
          ? 'bg-[color:var(--color-status-success)]'
          : 'bg-[color:var(--color-status-danger)]',
      )}
    />
  );
}

/** 보낸 기록 — 실제 JSONL 줄만 그린다. 없는 줄을 요약으로 지어내지 않는다. */
function AuditTail({
  entries,
  vaultRootPath,
}: {
  entries: LlmAuditEntry[];
  vaultRootPath: string | null;
}) {
  const t = useTranslations('settings.ai');

  return (
    <section aria-label={t('auditTitle')} data-testid="ai-audit-tail">
      <div className="flex items-center justify-between gap-2 px-1">
        <h3 className="font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          {t('auditTitle')}
        </h3>
        {vaultRootPath ? (
          <button
            type="button"
            data-testid="ai-audit-open"
            onClick={() => void openTauriVaultInFinder(vaultRootPath)}
            className="inline-flex h-6 items-center rounded-sm px-1 text-caption text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
          >
            {t('auditOpen')}
          </button>
        ) : null}
      </div>
      <div className="mt-1.5 divide-y divide-[color:var(--color-divider)] overflow-hidden rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]">
        {entries.length === 0 ? (
          <p className="break-keep px-3 py-2 text-caption leading-4 text-[color:var(--color-text-quaternary)]">
            {t('auditEmpty')}
          </p>
        ) : (
          [...entries].reverse().map((entry, index) => (
            <div
              key={`${entry.at}-${index}`}
              className="flex items-center gap-2 px-3 py-1.5"
              data-testid="ai-audit-row"
            >
              <span className="shrink-0 font-mono text-caption text-[color:var(--color-text-quaternary)]">
                {formatAuditTime(entry.at)}
              </span>
              <span className="min-w-0 flex-1 truncate text-caption text-[color:var(--color-text-tertiary)]">
                {entry.provider} ·{' '}
                {entry.purpose === 'verify' ? t('auditPurposeVerify') : t('auditPurposeAsk')}{' '}
                · {t('auditScope', { chars: entry.scope.vaultChars })}
              </span>
              <span
                className={cn(
                  'shrink-0 text-caption',
                  entry.outcome === 'ok'
                    ? 'text-[color:var(--color-status-success)]'
                    : entry.outcome === 'unknown'
                      ? 'text-[color:var(--color-text-quaternary)]'
                      : 'text-[color:var(--color-status-danger)]',
                )}
              >
                {entry.outcome === 'ok'
                  ? t('auditOutcomeOk')
                  : entry.outcome === 'denied'
                    ? t('auditOutcomeDenied')
                    : entry.outcome === 'error'
                      ? t('auditOutcomeError')
                      : t('auditOutcomeUnknown')}
              </span>
            </div>
          ))
        )}
      </div>
      <p className="mt-1 break-keep px-1 font-mono text-caption leading-4 text-[color:var(--color-text-quaternary)]">
        {t('auditPath')}
      </p>
    </section>
  );
}

/** 기록의 시각 — 로컬 타임존 기준 `MM.DD HH:mm`. 값이 이상하면 원문 그대로. */
function formatAuditTime(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
