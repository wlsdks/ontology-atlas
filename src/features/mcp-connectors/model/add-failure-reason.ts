import type { ConnectorWriteResult } from '@/shared/lib/connectors/connector-store';

export type AddFailureReason = 'noFolder' | 'malformed' | 'writeFailed' | 'secret';

export function addFailureReason(result: ConnectorWriteResult | null): AddFailureReason | null {
  if (result === null) return 'noFolder';
  switch (result.status) {
    case 'saved':
      return null;
    case 'blocked_unavailable':
      return 'noFolder';
    case 'blocked_malformed':
      return 'malformed';
    case 'blocked_secret':
      return 'secret';
    default:
      return 'writeFailed';
  }
}
