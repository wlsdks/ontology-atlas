import { useTranslations } from 'next-intl';
import { countChatCapableModels } from '@/shared/lib/llm-connection/local-endpoint';
import { isLoopbackAuthority } from '@/shared/lib/llm-connection/loopback';
import type { LocalVerifyState } from './local-runner-rules';

/**
 * The open row's one explanatory line — the next thing to do differs per state, so the sentence
 * does too. "Nothing leaves this computer" is said only for a loopback address, where it is true.
 */
export function LocalCaption({
  verify,
  host,
  vaultKnown,
}: {
  verify: LocalVerifyState;
  host: string;
  vaultKnown: boolean;
}) {
  const t = useTranslations('agents.models');
  if (!vaultKnown) {
    return (
      <p className="text-body leading-body text-[color:var(--color-text-tertiary)]">
        {t('verifyNeedsVault')}
      </p>
    );
  }
  if (verify.kind === 'done' && verify.reason !== 'ok') {
    const message =
      verify.reason === 'unreachable'
        ? t('localFailUnreachable', { host })
        : verify.reason === 'not-compatible'
          ? t('localFailNotCompatible', { host })
          : verify.reason === 'no-models'
            ? t('localFailNoModels')
            : t('verifyFailed', { message: verify.detail });
    return (
      <p data-testid="ai-local-failure" className="text-label leading-label text-[color:var(--color-danger-text)]">
        {message}
      </p>
    );
  }
  if (verify.kind === 'done' && verify.reason === 'ok') {
    // The count is the row's status; this line says what to do with it, and names embeddings
    // only when there are some.
    const chatCount = countChatCapableModels(verify.models);
    return (
      <p data-testid="ai-local-verified" className="text-label leading-label text-[color:var(--color-text-secondary)]">
        {chatCount === verify.models.length
          ? t('localVerified')
          : t('localVerifiedWithEmbedding', { chat: chatCount })}
      </p>
    );
  }
  return (
    <p className="text-body leading-body text-[color:var(--color-text-tertiary)]">
      {isLoopbackAuthority(host) ? t('localScopeLoopback', { host }) : t('localScopeRemote', { host })}
    </p>
  );
}
