import type { useTranslations } from 'next-intl';
import type { LlmAuditEntry } from '@/shared/lib/llm-connection/llm-audit-log';

type AuditTranslate = ReturnType<typeof useTranslations<'agents.models'>>;

export function auditPurposeLabel(entry: LlmAuditEntry, t: AuditTranslate): string {
  switch (entry.purpose) {
    case 'verify':
      return t('auditPurposeVerify');
    case 'judgment':
      return t('auditPurposeJudgment');
    case 'embed-build':
      return t('auditPurposeEmbedBuild');
    case 'embed-query':
      return t('auditPurposeEmbedQuery');
    case 'model-download':
      return t('auditPurposeModelDownload');
    default:
      return t('auditPurposeAsk');
  }
}

/** What left, in the terms of that kind of send. */
export function auditScopeLabel(entry: LlmAuditEntry, t: AuditTranslate): string {
  if (entry.embed) {
    const closed = entry.embed.phase === 'close';
    return t('auditScopePassages', {
      passages: closed ? entry.embed.passagesSent : entry.embed.passagesPlanned,
      chars: closed ? entry.embed.charsSent : entry.embed.charsPlanned,
    });
  }
  if (entry.download || entry.purpose === 'model-download') {
    return t('auditScopeDownload', { model: entry.model ?? '' });
  }
  if (entry.purpose === 'embed-query') {
    return t('auditScopeQuestion', { chars: entry.scope.promptChars });
  }
  // Jev reads no file: what left is what the person pasted.
  if (entry.purpose === 'judgment') return t('auditScopePasted', { chars: entry.scope.promptChars });
  return t('auditScope', { chars: entry.scope.vaultChars });
}

/** A log entry's time — `MM.DD HH:mm` in the local timezone. If the value is odd, the raw string is shown. */
export function formatAuditTime(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
