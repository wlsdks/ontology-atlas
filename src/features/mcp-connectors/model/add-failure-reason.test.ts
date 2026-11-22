import { describe, expect, it } from 'vitest';

import { addFailureReason } from './add-failure-reason';

describe('addFailureReason', () => {
  it('names why a write did not land, and nothing when it did', () => {
    expect(addFailureReason(null)).toBe('noFolder');
    expect(addFailureReason({ status: 'saved' } as never)).toBeNull();
    expect(addFailureReason({ status: 'blocked_unavailable' } as never)).toBe('noFolder');
    expect(addFailureReason({ status: 'blocked_malformed' } as never)).toBe('malformed');
    expect(addFailureReason({ status: 'blocked_secret' } as never)).toBe('secret');
    expect(addFailureReason({ status: 'anything else' } as never)).toBe('writeFailed');
  });
});
