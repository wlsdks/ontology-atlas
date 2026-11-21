import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { JevCheck } from '@/features/jev-judgment';
import { secretErrorMessage } from '@/shared/lib/llm-connection/tauri-secrets';
import {
  JEV_DESTINATION,
  jevSecretClear,
  jevSecretSet,
  type JevSecretStatus,
} from '@/shared/lib/llm-connection/tauri-jev';
import { useNativeErrorLookup } from '@/shared/lib/desktop-shell/use-native-error-lookup';
import { ArmedChip } from '../settings-primitives';
import { DraftFoot, KeyDraftForm } from './KeyDraftForm';
import { ModelRow, OpenChip, RowStatus, StoredKey, type Announce } from './ModelRow';

export function JevRow({
  status,
  read,
  vaultRootPath,
  mode,
  onMode,
  onCollapse,
  onStatus,
  onSent,
  announce,
}: {
  status: JevSecretStatus | null;
  read: boolean;
  vaultRootPath: string | null;
  mode: 'key' | 'check' | null;
  onMode: (mode: 'key' | 'check') => void;
  onCollapse: (mode: 'key' | 'check') => void;
  onStatus: (next: JevSecretStatus) => void;
  onSent: () => void;
  announce: Announce;
}) {
  const t = useTranslations('agents.models');
  const tJev = useTranslations('agents.models.jev');
  const nativeErrors = useNativeErrorLookup();
  const [error, setError] = useState<string | null>(null);
  const stored = status?.stored === true;

  return (
    <ModelRow
      testId="ai-provider-jev"
      name={tJev('name')}
      badge={
        // Quiet ink beside the name, so the experimental row does not outrank the connected runner.
        <span data-testid="models-experimental" className="text-label text-[color:var(--color-text-tertiary)]">
          ({t('experimental')})
        </span>
      }
      // Where the key goes is said once, at the paste field and over the request itself.
      caption={error ?? tJev('caption')}
      captionTone={error ? 'danger' : 'neutral'}
      status={
        !read ? (
          <RowStatus tone="idle" testId="jev-key-loading">
            {t('keychainChecking')}
          </RowStatus>
        ) : stored ? (
          <RowStatus tone="saved" testId="jev-key-status">
            <StoredKey last4={status?.last4 ?? ''} checked={false} />
          </RowStatus>
        ) : (
          <RowStatus tone="idle" testId="jev-key-status">
            {t('statusNoKey')}
          </RowStatus>
        )
      }
      actions={
        read ? (
          <>
            {stored ? (
              <OpenChip
                testId="jev-open-check"
                rowKey="jev:check"
                open={mode === 'check'}
                onOpen={() => onMode('check')}
                onClose={() => onCollapse('check')}
              >
                {t('actionRun')}
              </OpenChip>
            ) : null}
            <OpenChip
              testId={stored ? 'jev-replace' : 'jev-register'}
              rowKey="jev:key"
              open={mode === 'key'}
              onOpen={() => onMode('key')}
              onClose={() => onCollapse('key')}
            >
              {stored ? t('actionReplace') : t('actionAdd')}
            </OpenChip>
          </>
        ) : null
      }
      detailOpen={mode !== null}
      detailTestId="ai-detail-jev"
      detail={
        mode === 'check' ? (
          <JevCheck vaultPath={vaultRootPath} onSent={onSent} />
        ) : (
          <>
            <KeyDraftForm
              key={mode === 'key' ? 'draft-open' : 'draft-closing'}
              testSuffix="jev"
              inputLabel={tJev('keyLabel')}
              open={mode === 'key'}
              onCancel={() => onCollapse('key')}
              onSave={async (value) => {
                const next = await jevSecretSet(value);
                if (next) {
                  onStatus(next);
                  announce(`${tJev('name')} · ${t('saved')}`);
                }
              }}
              onError={setError}
            />
            <DraftFoot
              note={tJev('pasteSafety', { host: JEV_DESTINATION })}
              clear={
                stored ? (
                  <ArmedChip
                    label={t('clearKey')}
                    armedLabel={t('clearConfirm')}
                    testId="ai-clear-jev"
                    onConfirm={async () => {
                      try {
                        const next = await jevSecretClear();
                        if (next) onStatus(next);
                        announce(`${tJev('name')} · ${t('cleared')}`);
                      } catch (err) {
                        setError(secretErrorMessage(err, nativeErrors));
                      }
                    }}
                  />
                ) : null
              }
            />
          </>
        )
      }
    />
  );
}
