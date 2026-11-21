import { describe, expect, it } from 'vitest';
import { isLoopbackHost, localHeaderTone, sameAddress, type LocalVerifyState } from './local-runner-rules';

describe('isLoopbackHost', () => {
  it('is true only for this machine, with or without a port', () => {
    for (const authority of ['localhost', 'localhost:11434', '127.0.0.1:1234', '[::1]:8080', '[::1]']) {
      expect(isLoopbackHost(authority), authority).toBe(true);
    }
  });

  it('is false for any other host, including one that merely contains a loopback name', () => {
    for (const authority of ['192.168.0.4:11434', 'example.com', 'localhost.example.com', '10.0.0.127']) {
      expect(isLoopbackHost(authority), authority).toBe(false);
    }
  });
});

describe('sameAddress', () => {
  it('ignores a trailing slash, a /v1 suffix, host case and surrounding space', () => {
    expect(sameAddress('http://LocalHost:11434/v1/', ' http://localhost:11434 ')).toBe(true);
  });

  it('tells a different port or path apart', () => {
    expect(sameAddress('http://localhost:11434', 'http://localhost:1234')).toBe(false);
    expect(sameAddress('http://localhost:11434/a', 'http://localhost:11434/b')).toBe(false);
  });
});

describe('localHeaderTone', () => {
  const done = (reason: Extract<LocalVerifyState, { kind: 'done' }>['reason']): LocalVerifyState => ({
    kind: 'done',
    url: 'http://localhost:11434',
    reason,
    models: [],
    detail: '',
  });

  it('is grey while a check runs, whatever is saved', () => {
    expect(localHeaderTone({ kind: 'checking', url: 'u' }, true)).toBe('idle');
  });

  it('reports a finished check: green working, amber empty, red anything else', () => {
    expect(localHeaderTone(done('ok'), false)).toBe('success');
    expect(localHeaderTone(done('no-models'), true)).toBe('warning');
    expect(localHeaderTone(done('unreachable'), true)).toBe('danger');
    expect(localHeaderTone(done('not-compatible'), false)).toBe('danger');
  });

  it('shows a saved runner in grey and an unsaved one hollow until a check says more', () => {
    expect(localHeaderTone({ kind: 'idle' }, true)).toBe('saved');
    expect(localHeaderTone({ kind: 'idle' }, false)).toBe('idle');
  });
});
