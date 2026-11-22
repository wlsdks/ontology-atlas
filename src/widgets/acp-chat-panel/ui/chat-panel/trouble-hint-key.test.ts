import { describe, expect, it } from 'vitest';

import { troubleHintKeyOf } from './trouble-hint-key';

describe('troubleHintKeyOf', () => {
  it('names a way out of a usage limit only when another tool can be chosen', () => {
    expect(troubleHintKeyOf({ kind: 'limit' }, true)).toBe('trouble.limit.hint');
    expect(troubleHintKeyOf({ kind: 'limit' }, false)).toBe('trouble.limit.hintOnlyTool');
  });

  it('uses the kind\'s own hint otherwise, and the unknown hint without a trouble', () => {
    expect(troubleHintKeyOf({ kind: 'auth' }, false)).toBe('trouble.auth.hint');
    expect(troubleHintKeyOf(null, false)).toBe('trouble.unknown.hint');
  });
});
