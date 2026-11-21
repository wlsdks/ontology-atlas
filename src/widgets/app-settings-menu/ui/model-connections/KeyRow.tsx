import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  secretClear,
  secretErrorMessage,
  secretSet,
  secretVerify,
  SECRET_PROVIDER_HOSTS,
  type SecretProvider,
  type SecretStatus,
} from '@/shared/lib/llm-connection/tauri-secrets';
import { useNativeErrorLookup } from '@/shared/lib/desktop-shell/use-native-error-lookup';
import { Chip } from '@/shared/ui/controls/controls';
import { AI_PROVIDER_LABEL_KEY } from '../../model/ai-providers';
import { ArmedChip } from '../settings-primitives';
import { DraftFoot, KeyDraftForm } from './KeyDraftForm';
import {
  ModelRow,
  OpenChip,
  ROW_CHIP,
  RowStatus,
  StoredKey,
  refocusIfLost,
  type Announce,
  type RowKey,
} from './ModelRow';

type VerifyState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok' }
  | { kind: 'denied'; status: number | null }
  | { kind: 'failed'; message: string };

export function KeyRow({
  provider,
  status,
  read,
  vaultRootPath,
  expanded,
  onExpand,
  onCollapse,
  onStatus,
  onVerified,
  announce,
}: {
  provider: SecretProvider;
  status: SecretStatus | null;
  /** Key actions wait for this provider’s Keychain lookup. */
  read: boolean;
  vaultRootPath: string | null;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onStatus: (next: SecretStatus) => void;
  onVerified: () => void;
  announce: Announce;
}) {
  const t = useTranslations('agents.models');
  const nativeErrors = useNativeErrorLookup();
  const [error, setError] = useState<string | null>(null);
  const [verify, setVerify] = useState<VerifyState>({ kind: 'idle' });
  const verifyRef = useRef<HTMLButtonElement | null>(null);
  const label = t(AI_PROVIDER_LABEL_KEY[provider]);
  const stored = status?.stored === true;
  const host = SECRET_PROVIDER_HOSTS[provider];
  const rowKey: RowKey = `key:${provider}`;

  const handleVerify = async () => {
    if (!vaultRootPath || verify.kind === 'checking') return;
    setVerify({ kind: 'checking' });
    setError(null);
    try {
      const result = await secretVerify(provider, vaultRootPath);
      if (!result) return;
      if (result.ok) {
        setVerify({ kind: 'ok' });
        announce(`${label} · ${t('statusConnected')}`);
      } else if (result.denied) {
        // Rust decides what counts as denied — the code differs per vendor (Gemini uses 400).
        setVerify({ kind: 'denied', status: result.httpStatus });
        announce(`${label} · ${t('verifyDenied', { status: result.httpStatus ?? '' })}`);
      } else {
        setVerify({ kind: 'failed', message: result.message ?? String(result.httpStatus ?? '') });
        announce(`${label} · ${t('statusFailed')}`);
      }
    } catch (err) {
      setVerify({ kind: 'failed', message: secretErrorMessage(err, nativeErrors) });
      announce(`${label} · ${t('statusFailed')}`);
    } finally {
      // Success or denial, the call was logged — so the count moves immediately.
      onVerified();
      refocusIfLost(verifyRef);
    }
  };

  const statusNode = !read ? (
    <RowStatus tone="idle" testId={`ai-key-loading-${provider}`}>
      {t('keychainChecking')}
    </RowStatus>
  ) : verify.kind === 'checking' ? (
    <RowStatus tone="idle" testId={`ai-status-${provider}`}>
      {t('verifying')}
    </RowStatus>
  ) : verify.kind === 'denied' ? (
    <RowStatus tone="danger" testId={`ai-status-${provider}`}>
      {t('verifyDenied', { status: verify.status ?? '' })}
    </RowStatus>
  ) : verify.kind === 'failed' ? (
    <RowStatus tone="danger" testId={`ai-status-${provider}`}>
      {t('statusFailed')}
    </RowStatus>
  ) : stored ? (
    <RowStatus tone={verify.kind === 'ok' ? 'success' : 'saved'} testId={`ai-stored-${provider}`}>
      <StoredKey last4={status?.last4 ?? ''} checked={verify.kind === 'ok'} />
    </RowStatus>
  ) : (
    <RowStatus tone="idle" testId={`ai-status-${provider}`}>
      {t('statusNoKey')}
    </RowStatus>
  );

  // One caption line: an error, a check's failure, why a check is not offered, or where the key goes.
  const caption =
    error ??
    (verify.kind === 'failed'
      ? t('verifyFailed', { message: verify.message })
      : stored && !vaultRootPath
        ? t('verifyNeedsVault')
        : null);

  return (
    <ModelRow
      testId={`ai-provider-${provider}`}
      name={label}
      caption={caption ?? <span className="font-mono">{host}</span>}
      captionTone={error || verify.kind === 'failed' ? 'danger' : 'neutral'}
      status={statusNode}
      actions={
        read ? (
          <>
            {/* Offered only where it can run: without a folder there is nowhere to record the
                request, and the caption says so instead of a disabled button saying nothing. */}
            {stored && vaultRootPath ? (
              <Chip
                ref={verifyRef}
                size="lg"
                tone="secondary"
                hoverInk="strong"
                hoverBorder="strong"
                data-testid={`ai-verify-${provider}`}
                onClick={() => void handleVerify()}
                disabled={verify.kind === 'checking'}
                title={t('verifyScope', { host })}
                className={ROW_CHIP}
              >
                {t('actionCheck')}
              </Chip>
            ) : null}
            <OpenChip
              testId={stored ? `ai-replace-${provider}` : `ai-register-${provider}`}
              rowKey={rowKey}
              open={expanded}
              onOpen={onExpand}
              onClose={onCollapse}
            >
              {stored ? t('actionReplace') : t('actionAdd')}
            </OpenChip>
          </>
        ) : null
      }
      detailOpen={expanded}
      detailTestId={`ai-detail-${provider}`}
      detail={
        <>
          {/* `key` is the draft's lifetime: collapsing replaces the instance, so a pasted value
              disappears the moment collapsing begins, not when the motion ends. */}
          <KeyDraftForm
            key={expanded ? 'draft-open' : 'draft-closing'}
            testSuffix={provider}
            inputLabel={t('keyLabel', { provider: label })}
            open={expanded}
            onCancel={onCollapse}
            onSave={async (value) => {
              const next = await secretSet(provider, value);
              if (next) {
                setVerify({ kind: 'idle' });
                onStatus(next);
                announce(`${label} · ${t('saved')}`);
              }
            }}
            onError={setError}
          />
          <DraftFoot
            note={t('pasteSafety', { provider: label })}
            clear={
              stored ? (
                <ArmedChip
                  label={t('clearKey')}
                  armedLabel={t('clearConfirm')}
                  testId={`ai-clear-${provider}`}
                  onConfirm={async () => {
                    try {
                      const next = await secretClear(provider);
                      setVerify({ kind: 'idle' });
                      if (next) onStatus(next);
                      announce(`${label} · ${t('cleared')}`);
                    } catch (err) {
                      setError(secretErrorMessage(err, nativeErrors));
                    }
                  }}
                />
              ) : null
            }
          />
        </>
      }
    />
  );
}
