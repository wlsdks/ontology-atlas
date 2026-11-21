import { describe, expect, it } from 'vitest';

import { autoAllowOption, permissionOutcome } from './permission-answer';
import type { AcpPermissionRequest } from './permission-request';

const OPTIONS = [
  { optionId: 'allow_always', kind: 'allow_always', name: 'Always' },
  { optionId: 'allow', kind: 'allow_once', name: 'Allow' },
  { optionId: 'reject', kind: 'reject_once', name: 'Deny' },
];

function request(overrides: Partial<AcpPermissionRequest> = {}): AcpPermissionRequest {
  return {
    title: null,
    toolCallId: 'call-1',
    toolName: null,
    toolKind: 'read',
    filePath: '/vault/notes.md',
    rawInput: {},
    reviewKind: 'permission',
    options: OPTIONS,
    ...overrides,
  };
}

describe('a request the app may answer without showing a card', () => {
  it('allows a read inside the folder once, and never picks allow_always', () => {
    expect(autoAllowOption(request(), null, 'allow-inside-vault')).toEqual(OPTIONS[1]);
    expect(autoAllowOption(request({ toolKind: 'search' }), null, 'allow-inside-vault-hidden')).toEqual(OPTIONS[1]);
  });

  it('asks about an edit, an unknown kind or a path outside the folder, even for a non-Atlas tool', () => {
    expect(autoAllowOption(request({ toolKind: 'edit' }), null, 'allow-inside-vault')).toBeNull();
    expect(autoAllowOption(request({ toolKind: null }), null, 'allow-inside-vault')).toBeNull();
    expect(autoAllowOption(request(), null, 'ask')).toBeNull();
  });

  it('allows an Atlas read with no path, a vault-relative path or an inside verdict', () => {
    expect(autoAllowOption(request({ filePath: null }), 'read', 'ask')).toEqual(OPTIONS[1]);
    expect(autoAllowOption(request({ filePath: 'sources/a.md' }), 'read', 'ask')).toEqual(OPTIONS[1]);
    expect(autoAllowOption(request({ filePath: '/vault/a.md' }), 'read', 'allow-inside-vault')).toEqual(OPTIONS[1]);
  });

  it('asks about an Atlas read that leaves the folder or climbs out of it', () => {
    expect(autoAllowOption(request({ filePath: '../secrets.md' }), 'read', 'ask')).toBeNull();
    expect(autoAllowOption(request({ filePath: 'a/../../b.md' }), 'read', 'ask')).toBeNull();
    expect(autoAllowOption(request({ filePath: 'a\\..\\b.md' }), 'read', 'ask')).toBeNull();
    expect(autoAllowOption(request({ filePath: '/elsewhere/a.md' }), 'read', 'ask')).toBeNull();
  });

  it('never auto-allows an Atlas write', () => {
    expect(autoAllowOption(request({ filePath: null }), 'write', 'allow-inside-vault')).toBeNull();
    expect(autoAllowOption(request({ toolKind: 'read' }), 'write', 'allow-inside-vault')).toBeNull();
  });

  it('has nothing to select when the request carries no allow_once option', () => {
    const onlyReject = request({ options: [OPTIONS[2]] });
    expect(autoAllowOption(onlyReject, 'read', 'allow-inside-vault')).toBeNull();
    expect(autoAllowOption(onlyReject, null, 'allow-inside-vault')).toBeNull();
  });
});

describe('the answer written back to the agent', () => {
  it('selects the person\'s choice when it is an option of that request', () => {
    expect(permissionOutcome(OPTIONS, 'allow')).toEqual({ outcome: { outcome: 'selected', optionId: 'allow' } });
  });

  it('rejects when nobody answered, the answer is empty, or it names an option of another request', () => {
    const rejected = { outcome: { outcome: 'selected', optionId: 'reject' } };
    expect(permissionOutcome(OPTIONS, null)).toEqual(rejected);
    expect(permissionOutcome(OPTIONS, '')).toEqual(rejected);
    expect(permissionOutcome(OPTIONS, 'stale-option')).toEqual(rejected);
  });

  it('answers cancelled when there is not even a reject option, so no one waits forever', () => {
    expect(permissionOutcome([OPTIONS[1]], null)).toEqual({ outcome: { outcome: 'cancelled' } });
    expect(permissionOutcome([], 'allow')).toEqual({ outcome: { outcome: 'cancelled' } });
  });
});
