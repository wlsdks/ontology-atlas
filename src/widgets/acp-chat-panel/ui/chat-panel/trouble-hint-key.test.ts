import { describe, expect, it } from 'vitest';

import { troubleHintKeyOf } from './trouble-hint-key';

describe('troubleHintKeyOf', () => {
  it('names a way out of a usage limit only when another tool can be chosen', () => {
    expect(troubleHintKeyOf({ kind: 'limit' }, true, 'claude')).toBe('trouble.limit.hint');
    expect(troubleHintKeyOf({ kind: 'limit' }, false, 'claude')).toBe('trouble.limit.hintOnlyTool');
  });

  it('tells a sign-in trouble in the words of the tool that holds the sign-in', () => {
    expect(troubleHintKeyOf({ kind: 'auth' }, false, 'claude')).toBe('trouble.auth.hint');
    expect(troubleHintKeyOf({ kind: 'auth' }, false, 'codex')).toBe('trouble.auth.hintCodex');
    expect(troubleHintKeyOf({ kind: 'auth' }, false, 'other')).toBe('trouble.auth.hintOther');
  });

  it('uses the kind\'s own hint otherwise, and the unknown hint without a trouble', () => {
    expect(troubleHintKeyOf({ kind: 'network' }, false, 'codex')).toBe('trouble.network.hint');
    expect(troubleHintKeyOf(null, false, 'claude')).toBe('trouble.unknown.hint');
  });
});
