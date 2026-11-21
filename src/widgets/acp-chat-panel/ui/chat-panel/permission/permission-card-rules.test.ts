import { describe, expect, it } from 'vitest';

import {
  allowEffect,
  answeredKey,
  isAllowOnceDisabled,
  meaningAuthority,
  permissionBodyKey,
  permissionTitleKey,
} from './permission-card-rules';

describe('permissionTitleKey', () => {
  const base = { ontologyWrite: false, serverConsent: false, locality: 'elsewhere' } as const;

  it('puts an ontology write first, then a server consent, then where the file lies', () => {
    expect(permissionTitleKey({ ...base, ontologyWrite: true, serverConsent: true, locality: 'inside-folder' })).toBe('ontologyWriteTitle');
    expect(permissionTitleKey({ ...base, serverConsent: true, locality: 'inside-folder' })).toBe('consentTitle');
    expect(permissionTitleKey({ ...base, locality: 'inside-folder' })).toBe('insideFolderTitle');
    expect(permissionTitleKey({ ...base, locality: 'inside-project' })).toBe('insideProjectTitle');
    expect(permissionTitleKey(base)).toBe('title');
  });
});

describe('permissionBodyKey', () => {
  const base = { ontologyWrite: false, executionBlocked: false, reviewReady: false, serverConsent: false, locality: 'elsewhere' } as const;

  it('never calls an ontology write verified unless the review basis is ready', () => {
    expect(permissionBodyKey({ ...base, ontologyWrite: true, reviewReady: true })).toBe('ontologyWriteBody');
    expect(permissionBodyKey({ ...base, ontologyWrite: true })).toBe('ontologyWriteUnverifiedBody');
  });

  it('says the folder does not match before anything else about an ontology write', () => {
    expect(permissionBodyKey({ ...base, ontologyWrite: true, reviewReady: true, executionBlocked: true })).toBe('taskReview.rootMismatchBody');
    expect(permissionBodyKey({ ...base, ontologyWrite: true, executionBlocked: undefined })).toBe('ontologyWriteUnverifiedBody');
  });

  it('falls to a server consent, then to where the file lies', () => {
    expect(permissionBodyKey({ ...base, serverConsent: true, locality: 'inside-folder' })).toBe('consentBody');
    expect(permissionBodyKey({ ...base, locality: 'inside-folder' })).toBe('insideFolderBody');
    expect(permissionBodyKey({ ...base, locality: 'inside-project' })).toBe('insideProjectBody');
    expect(permissionBodyKey(base)).toBe('body');
  });
});

describe('answeredKey', () => {
  const base = { answered: 'allow', failed: false, targetName: 'refund', ontologyWrite: true } as const;

  it('says nothing before an answer and reports a failed send whatever was chosen', () => {
    expect(answeredKey({ ...base, answered: null })).toBeNull();
    expect(answeredKey({ ...base, failed: true })).toBe('answered.failed');
    expect(answeredKey({ ...base, answered: 'reject', failed: true })).toBe('answered.failed');
  });

  it('names the target only for an ontology write that has one', () => {
    expect(answeredKey(base)).toBe('answered.allowNamed');
    expect(answeredKey({ ...base, targetName: null })).toBe('answered.allow');
    expect(answeredKey({ ...base, ontologyWrite: false })).toBe('answered.allow');
    expect(answeredKey({ ...base, answered: 'reject' })).toBe('answered.rejectNamed');
    expect(answeredKey({ ...base, answered: 'reject', targetName: null })).toBe('answered.rejectWrite');
    expect(answeredKey({ ...base, answered: 'reject', ontologyWrite: false })).toBe('answered.reject');
    expect(answeredKey({ ...base, answered: 'reject', targetName: null, ontologyWrite: false })).toBe('answered.reject');
  });

  it('keeps the two rare answers apart', () => {
    expect(answeredKey({ ...base, answered: 'correct' })).toBe('answered.correct');
    expect(answeredKey({ ...base, answered: 'always' })).toBe('answered.always');
  });
});

describe('allowEffect', () => {
  it('describes a batch only when more than one item is asked for', () => {
    expect(allowEffect({ itemCount: 3 }, 'x')).toEqual({ kind: 'batch', count: 3 });
    expect(allowEffect({ itemCount: 1 }, 'x')).toEqual({ kind: 'named', name: 'x' });
    expect(allowEffect(null, 'x')).toEqual({ kind: 'named', name: 'x' });
    expect(allowEffect({ itemCount: 1 }, null)).toEqual({ kind: 'plain' });
  });
});

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
