import { describe, expect, it } from 'vitest';
import { saveFailureMessageKey } from './save-failure';

function named(name: string): Error {
  const error = new Error('boom');
  error.name = name;
  return error;
}

describe('saveFailureMessageKey', () => {
  it('gives each vault write refusal its own message', () => {
    expect(saveFailureMessageKey(named('VaultConflictError'))).toBe('saveConflict');
    expect(saveFailureMessageKey(named('VaultIdentityUidError'))).toBe('saveIdentityUid');
    expect(saveFailureMessageKey(named('VaultIdentityHistoryError'))).toBe('saveIdentityHistory');
  });

  it('leaves any other failure to the generic sentence', () => {
    expect(saveFailureMessageKey(new Error('disk full'))).toBeNull();
    expect(saveFailureMessageKey('VaultConflictError')).toBeNull();
    expect(saveFailureMessageKey(undefined)).toBeNull();
  });
});
