import { describe, expect, it } from 'vitest';

import { isAllowOnceDisabled, meaningAuthority } from './allow-once-gate';

describe('isAllowOnceDisabled', () => {
  const ready = { hasAllowOnceOption: true, acceptingMeaning: false, reviewStatus: 'ready', executionBlocked: false };

  it('lets a person allow once only when the option exists and the review is settled', () => {
    expect(isAllowOnceDisabled(ready)).toBe(false);
    expect(isAllowOnceDisabled({ ...ready, hasAllowOnceOption: false })).toBe(true);
    expect(isAllowOnceDisabled({ ...ready, acceptingMeaning: true })).toBe(true);
    expect(isAllowOnceDisabled({ ...ready, reviewStatus: 'loading' })).toBe(true);
    expect(isAllowOnceDisabled({ ...ready, executionBlocked: true })).toBe(true);
  });

  it('does not wait for a review that was never started', () => {
    expect(isAllowOnceDisabled({ ...ready, reviewStatus: undefined, executionBlocked: undefined })).toBe(false);
  });
});

describe('meaningAuthority', () => {
  it('reports accepted or pending only from a ready review', () => {
    expect(meaningAuthority({ status: 'ready', meaningStatus: 'accepted' })).toBe('accepted');
    expect(meaningAuthority({ status: 'ready', meaningStatus: 'unreviewed' })).toBe('pending');
    expect(meaningAuthority({ status: 'loading', meaningStatus: 'accepted' })).toBe('unknown');
    expect(meaningAuthority(undefined)).toBe('unknown');
  });
});
