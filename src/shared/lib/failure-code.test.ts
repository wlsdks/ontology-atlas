import { describe, expect, it } from 'vitest';

import { codedFailure, CodedFailure, failureCodeOf, failureDetailOf } from './failure-code';

describe('failure codes — the throw names the failure, the screen owns the sentence', () => {
  it('carries the code as a field and keeps the English on detail', () => {
    const failure = codedFailure('answer-history-unreadable', 'thread="dispute-records"');
    expect(failure).toBeInstanceOf(CodedFailure);
    expect(failureCodeOf(failure)).toBe('answer-history-unreadable');
    expect(failureDetailOf(failure)).toBe('thread="dispute-records"');
    // `message` still says something to a stack trace, and nothing to a screen.
    expect(failure.message).toBe('answer-history-unreadable: thread="dispute-records"');
  });

  it('treats an empty detail as no detail rather than as an empty sentence', () => {
    expect(codedFailure('app-required').detail).toBeNull();
    expect(codedFailure('app-required', '   ').detail).toBeNull();
    expect(codedFailure('app-required').message).toBe('app-required');
  });

  it.each([
    ['Operation not permitted (os error 1)', 'permission-denied'],
    ['EACCES: permission denied, open /x', 'permission-denied'],
    ['No such file or directory (os error 2)', 'target-missing'],
    ['A requested file or directory could not be found', 'target-missing'],
    ['EEXIST: file already exists', 'already-exists'],
  ])('reads the operating system\'s own wording: %s', (text, code) => {
    // These are not ours to re-mint, so the signature tables recognise them instead.
    expect(failureCodeOf(new Error(text))).toBe(code);
    expect(failureCodeOf(text)).toBe(code);
  });

  it('recognises a DOMException by name, which carries no errno', () => {
    const thrown = new Error('the browser said so');
    thrown.name = 'NotFoundError';
    expect(failureCodeOf(thrown)).toBe('target-missing');
  });

  it('returns no code for a failure nothing recognised, so the screen uses its own sentence', () => {
    expect(failureCodeOf(new Error('ENOSPC: no space left on device'))).toBeNull();
    expect(failureCodeOf(undefined)).toBeNull();
    expect(failureCodeOf({})).toBeNull();
    // A whole sentence is not a code, even though it is a string.
    expect(failureCodeOf('The retained question or its history cannot be read.')).toBeNull();
  });

  it('accepts a code a hook already stored, so one lookup serves both', () => {
    // `actionError` holds a code; a raw rejection holds an Error. Both arrive here.
    expect(failureCodeOf('app-required')).toBe('app-required');
    expect(failureCodeOf('')).toBeNull();
  });

  it('keeps a Tauri Err(String) rejection readable as detail', () => {
    // Tauri rejects with the bare string, not an Error (`error-message.ts`).
    expect(failureDetailOf('canonicalize failed (os error 2)')).toBe('canonicalize failed (os error 2)');
    expect(failureDetailOf(new Error('  '))).toBeNull();
  });
});
